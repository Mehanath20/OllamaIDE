import { create } from "zustand";
import { DapClient } from "../lib/dapClient";

export interface Breakpoint {
  id?: number;
  line: number;
  verified: boolean;
}

export interface Thread {
  id: number;
  name: string;
}

export interface StackFrame {
  id: number;
  name: string;
  source?: { path: string; name: string };
  line: number;
  column: number;
}

export interface Scope {
  name: string;
  variablesReference: number;
  expensive: boolean;
}

export interface Variable {
  name: string;
  value: string;
  type: string;
  variablesReference: number;
}

interface DebugState {
  isActive: boolean;
  isPaused: boolean;
  client: DapClient | null;
  breakpoints: Record<string, Breakpoint[]>; // file path -> breakpoints
  threads: Thread[];
  activeThreadId: number | null;
  stackFrames: StackFrame[];
  scopes: Scope[];
  variables: Record<number, Variable[]>; // variablesReference -> Variables
  
  startSession: (cmd: string, args: string[]) => Promise<void>;
  stopSession: () => Promise<void>;
  
  toggleBreakpoint: (path: string, line: number) => void;
  syncBreakpoints: (path: string) => Promise<void>;

  pause: () => Promise<void>;
  resume: () => Promise<void>;
  stepOver: () => Promise<void>;
  stepInto: () => Promise<void>;
  stepOut: () => Promise<void>;
  
  fetchThreads: () => Promise<void>;
  fetchStackTrace: (threadId: number) => Promise<void>;
  fetchScopes: (frameId: number) => Promise<void>;
  fetchVariables: (variablesReference: number) => Promise<void>;
}

export const useDebugStore = create<DebugState>((set, get) => ({
  isActive: false,
  isPaused: false,
  client: null,
  breakpoints: {},
  threads: [],
  activeThreadId: null,
  stackFrames: [],
  scopes: [],
  variables: {},

  startSession: async (cmd, args) => {
    const sessionId = "dap-" + Date.now();
    const client = new DapClient(sessionId);
    
    client.onEvent((event, body) => {
      const state = get();
      if (event === "stopped") {
        set({ isPaused: true, activeThreadId: body.threadId });
        state.fetchStackTrace(body.threadId);
      } else if (event === "continued") {
        set({ isPaused: false, stackFrames: [], scopes: [], variables: {} });
      } else if (event === "terminated" || event === "exited") {
        set({ isActive: false, isPaused: false, client: null, stackFrames: [], scopes: [], variables: {} });
      } else if (event === "thread") {
        state.fetchThreads();
      }
    });

    await client.connect(cmd, args);
    
    // Initialize DAP
    await client.sendRequest("initialize", {
      clientID: "antinetwork-ide",
      adapterID: "node",
      linesStartAt1: true,
      columnsStartAt1: true,
    });

    set({ isActive: true, client });

    // Sync existing breakpoints before launching
    for (const path of Object.keys(get().breakpoints)) {
      await get().syncBreakpoints(path);
    }

    // Usually after initialize we send configurationDone or launch/attach
    // This depends on the adapter. For generic purposes, we assume a launch is enough.
    // In a real app we need `launch` or `attach` configs. 
    // Example Node.js default launch:
    try {
      await client.sendRequest("launch", {
        program: args[args.length - 1], // Just a guess if last arg is the file
        cwd: ".", 
        stopOnEntry: false
      });
      await client.sendRequest("configurationDone");
    } catch (err) {
      console.error("DAP Launch failed", err);
    }
  },

  stopSession: async () => {
    const { client } = get();
    if (client) {
      await client.sendRequest("disconnect", { restart: false });
      await client.disconnect();
    }
    set({ isActive: false, isPaused: false, client: null, stackFrames: [], scopes: [], variables: {} });
  },

  toggleBreakpoint: (path, line) => {
    set(state => {
      const bps = state.breakpoints[path] || [];
      const existingIdx = bps.findIndex(b => b.line === line);
      const newBps = [...bps];
      
      if (existingIdx >= 0) {
        newBps.splice(existingIdx, 1);
      } else {
        newBps.push({ line, verified: false });
      }
      
      return { breakpoints: { ...state.breakpoints, [path]: newBps } };
    });

    const { client, syncBreakpoints } = get();
    if (client) {
      syncBreakpoints(path);
    }
  },

  syncBreakpoints: async (path) => {
    const { client, breakpoints } = get();
    if (!client) return;

    const bps = breakpoints[path] || [];
    try {
      const res = await client.sendRequest("setBreakpoints", {
        source: { path },
        breakpoints: bps.map(b => ({ line: b.line }))
      });
      
      // update verified status
      if (res && res.breakpoints) {
        set(state => {
          const currentBps = state.breakpoints[path] || [];
          const updated = currentBps.map((b, i) => ({
            ...b,
            id: res.breakpoints[i]?.id,
            verified: res.breakpoints[i]?.verified || false
          }));
          return { breakpoints: { ...state.breakpoints, [path]: updated } };
        });
      }
    } catch (err) {
      console.error("Failed to set breakpoints", err);
    }
  },

  pause: async () => {
    const { client, activeThreadId } = get();
    if (client && activeThreadId !== null) {
      await client.sendRequest("pause", { threadId: activeThreadId });
    }
  },
  
  resume: async () => {
    const { client, activeThreadId } = get();
    if (client && activeThreadId !== null) {
      await client.sendRequest("continue", { threadId: activeThreadId });
      set({ isPaused: false, stackFrames: [], scopes: [], variables: {} });
    }
  },

  stepOver: async () => {
    const { client, activeThreadId } = get();
    if (client && activeThreadId !== null) {
      await client.sendRequest("next", { threadId: activeThreadId });
      set({ isPaused: false });
    }
  },

  stepInto: async () => {
    const { client, activeThreadId } = get();
    if (client && activeThreadId !== null) {
      await client.sendRequest("stepIn", { threadId: activeThreadId });
      set({ isPaused: false });
    }
  },

  stepOut: async () => {
    const { client, activeThreadId } = get();
    if (client && activeThreadId !== null) {
      await client.sendRequest("stepOut", { threadId: activeThreadId });
      set({ isPaused: false });
    }
  },

  fetchThreads: async () => {
    const { client } = get();
    if (!client) return;
    try {
      const res = await client.sendRequest("threads");
      set({ threads: res.threads || [] });
    } catch {}
  },

  fetchStackTrace: async (threadId) => {
    const { client } = get();
    if (!client) return;
    try {
      const res = await client.sendRequest("stackTrace", { threadId });
      set({ stackFrames: res.stackFrames || [] });
      if (res.stackFrames && res.stackFrames.length > 0) {
        get().fetchScopes(res.stackFrames[0].id);
      }
    } catch {}
  },

  fetchScopes: async (frameId) => {
    const { client } = get();
    if (!client) return;
    try {
      const res = await client.sendRequest("scopes", { frameId });
      set({ scopes: res.scopes || [] });
      
      // Auto fetch variables for the first scope (usually Locals)
      if (res.scopes && res.scopes.length > 0) {
        get().fetchVariables(res.scopes[0].variablesReference);
      }
    } catch {}
  },

  fetchVariables: async (variablesReference) => {
    const { client } = get();
    if (!client) return;
    try {
      const res = await client.sendRequest("variables", { variablesReference });
      set(state => ({
        variables: { ...state.variables, [variablesReference]: res.variables || [] }
      }));
    } catch {}
  }
}));
