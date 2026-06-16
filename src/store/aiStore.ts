/* ============================================================
   aiStore.ts — AI State management
   Manages chat history, active LLM models, pulling status,
   and Agent Mode loops (checklists, console logs, diffs, etc.).
   ============================================================ */
import { create } from "zustand";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  agentSteps?: AgentStep[]; // optional steps display for agent responses
  images?: string[]; // base64 encoded images for vision models
}

export interface AgentStep {
  id: string;
  text: string;
  status: "pending" | "running" | "completed" | "failed";
}

export interface PendingFileChange {
  path: string;
  oldContent: string;
  newContent: string;
}

interface AIState {
  messages: ChatMessage[];
  installedModels: string[];
  activeModel: string;
  completionModel: string;
  activePersona: "Coder" | "Architect" | "Debugger" | "Reviewer" | "Documenter";
  isStreaming: boolean;
  ollamaOnline: boolean;
  ollamaVersion: string | null;

  // Model pulling state
  isPulling: boolean;
  setIsPulling: (p: boolean) => void;
  pullingModelName: string;
  setPullingModelName: (name: string) => void;
  pullProgress: string;
  setPullProgress: (s: string) => void;

  // Agent State
  agentMode: boolean;
  agentAborted: boolean; // set to true by Stop button to halt the async loop
  agentStatus: "idle" | "thinking" | "reading" | "executing" | "generating";
  agentSteps: AgentStep[];
  agentLogs: string[];
  pendingFileChange: PendingFileChange | null;
  pendingCommand: string | null;
  commandPermissionResolve: ((approved: boolean) => void) | null;
  filePermissionResolve: ((approved: boolean) => void) | null;

  // Actions
  addMessage: (msg: ChatMessage) => void;
  updateLastMessageContent: (content: string) => void;
  clearMessages: () => void;
  setInstalledModels: (models: string[]) => void;
  setActiveModel: (model: string) => void;
  setCompletionModel: (model: string) => void;
  setActivePersona: (persona: "Coder" | "Architect" | "Debugger" | "Reviewer" | "Documenter") => void;
  setStreaming: (v: boolean) => void;
  setOllamaOnline: (v: boolean) => void;
  setOllamaVersion: (v: string | null) => void;

  setAgentMode: (v: boolean) => void;
  setAgentAborted: (v: boolean) => void;
  setAgentStatus: (status: "idle" | "thinking" | "reading" | "executing" | "generating") => void;
  setAgentSteps: (steps: AgentStep[]) => void;
  updateAgentStepStatus: (id: string, status: "pending" | "running" | "completed" | "failed") => void;
  addAgentLog: (log: string) => void;
  clearAgentState: () => void;
  setPendingFileChange: (change: PendingFileChange | null) => void;
  setPendingCommand: (cmd: string | null) => void;
  setCommandPermissionResolve: (resolve: ((approved: boolean) => void) | null) => void;
  setFilePermissionResolve: (resolve: ((approved: boolean) => void) | null) => void;
}

export const useAIStore = create<AIState>((set) => ({
  messages: [],
  installedModels: [],
  activeModel: "qwen2.5-coder:14b",
  completionModel: "qwen2.5-coder:7b",
  activePersona: "Coder",
  isStreaming: false,
  ollamaOnline: false,
  ollamaVersion: null,

  isPulling: false,
  setIsPulling: (isPulling) => set({ isPulling }),
  pullingModelName: "",
  setPullingModelName: (pullingModelName) => set({ pullingModelName }),
  pullProgress: "",
  setPullProgress: (pullProgress) => set({ pullProgress }),

  agentMode: false,
  agentAborted: false,
  agentStatus: "idle",
  agentSteps: [],
  agentLogs: [],
  pendingFileChange: null,
  pendingCommand: null,
  commandPermissionResolve: null,
  filePermissionResolve: null,

  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  updateLastMessageContent: (content) =>
    set((s) => {
      const messages = [...s.messages];
      if (messages.length > 0) {
        messages[messages.length - 1].content = content;
      }
      return { messages };
    }),
  clearMessages: () => set({ messages: [] }),
  setInstalledModels: (installedModels) => set({ installedModels }),
  setActiveModel: (activeModel) => set({ activeModel }),
  setCompletionModel: (completionModel) => set({ completionModel }),
  setActivePersona: (activePersona) => set({ activePersona }),
  setStreaming: (isStreaming) => set({ isStreaming }),
  setOllamaOnline: (ollamaOnline) => set({ ollamaOnline }),
  setOllamaVersion: (ollamaVersion) => set({ ollamaVersion }),

  setAgentMode: (agentMode) => set({ agentMode }),
  setAgentAborted: (agentAborted) => set({ agentAborted }),
  setAgentStatus: (agentStatus) => set({ agentStatus }),
  setAgentSteps: (agentSteps) => set({ agentSteps }),
  updateAgentStepStatus: (id, status) =>
    set((s) => ({
      agentSteps: s.agentSteps.map((step) =>
        step.id === id ? { ...step, status } : step
      ),
    })),
  addAgentLog: (log) => set((s) => ({ agentLogs: [...s.agentLogs, log] })),
  clearAgentState: () =>
    set({
      agentStatus: "idle",
      agentAborted: true,  // signal the loop to stop
      agentSteps: [],
      agentLogs: [],
      pendingFileChange: null,
      pendingCommand: null,
      commandPermissionResolve: null,
      filePermissionResolve: null,
      // NOTE: messages are intentionally NOT cleared here.
      // Call clearMessages() explicitly if you want to reset conversation history.
    }),
  setPendingFileChange: (pendingFileChange) => set({ pendingFileChange }),
  setPendingCommand: (pendingCommand) => set({ pendingCommand }),
  setCommandPermissionResolve: (commandPermissionResolve) => set({ commandPermissionResolve }),
  setFilePermissionResolve: (filePermissionResolve) => set({ filePermissionResolve }),
}));
