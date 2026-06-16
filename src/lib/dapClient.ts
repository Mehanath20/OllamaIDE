import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

type DapEventHandler = (event: string, body: any) => void;

export class DapClient {
  private sessionId: string;
  private seq = 1;
  private pendingRequests = new Map<number, { resolve: (body: any) => void; reject: (err: any) => void }>();
  private eventListeners: DapEventHandler[] = [];
  private unlistenMessage: (() => void) | null = null;
  private unlistenTerminated: (() => void) | null = null;
  private unlistenError: (() => void) | null = null;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  public async connect(adapterCmd: string, adapterArgs: string[]): Promise<void> {
    this.unlistenMessage = await listen<{ session_id: string; message: string }>("dap-message", (e) => {
      if (e.payload.session_id === this.sessionId) {
        this.handleMessage(e.payload.message);
      }
    });

    this.unlistenTerminated = await listen<{ session_id: string }>("dap-terminated", (e) => {
      if (e.payload.session_id === this.sessionId) {
        this.emitEvent("terminated", {});
        this.disconnect();
      }
    });

    this.unlistenError = await listen<{ session_id: string; error: string }>("dap-error", (e) => {
      if (e.payload.session_id === this.sessionId) {
        console.error("DAP Error:", e.payload.error);
      }
    });

    await invoke("start_debug_session", {
      sessionId: this.sessionId,
      adapterCmd,
      adapterArgs
    });
  }

  public async disconnect(): Promise<void> {
    if (this.unlistenMessage) this.unlistenMessage();
    if (this.unlistenTerminated) this.unlistenTerminated();
    if (this.unlistenError) this.unlistenError();
    
    try {
      await invoke("stop_debug_session", { sessionId: this.sessionId });
    } catch {
      // ignore
    }
  }

  public onEvent(handler: DapEventHandler) {
    this.eventListeners.push(handler);
  }

  private emitEvent(event: string, body: any) {
    this.eventListeners.forEach(h => h(event, body));
  }

  public async sendRequest(command: string, args?: any): Promise<any> {
    const requestSeq = this.seq++;
    const message = {
      seq: requestSeq,
      type: "request",
      command,
      arguments: args
    };

    const promise = new Promise((resolve, reject) => {
      this.pendingRequests.set(requestSeq, { resolve, reject });
    });

    await invoke("send_dap_message", {
      sessionId: this.sessionId,
      message: JSON.stringify(message)
    });

    return promise;
  }

  private handleMessage(rawMessage: string) {
    try {
      const msg = JSON.parse(rawMessage);
      if (msg.type === "response") {
        const pending = this.pendingRequests.get(msg.request_seq);
        if (pending) {
          this.pendingRequests.delete(msg.request_seq);
          if (msg.success) {
            pending.resolve(msg.body);
          } else {
            pending.reject(new Error(msg.message || "DAP request failed"));
          }
        }
      } else if (msg.type === "event") {
        this.emitEvent(msg.event, msg.body);
      }
    } catch (err) {
      console.error("Failed to parse DAP message:", err);
    }
  }
}
