/* ============================================================
   terminalStore.ts — Zustand store for terminal sessions
   Tracks sessions, active tab, and shell profiles
   ============================================================ */
import { create } from "zustand";

export interface TerminalSession {
  id: string;
  title: string;
  shell: string;
  cwd: string;
  isDead?: boolean; // true when the process has exited
  recentOutput?: string;
}

export interface ShellProfile {
  label: string;
  shell: string; // path or name
}

// Platform-aware shell profiles
const IS_WINDOWS = navigator.userAgent.toLowerCase().includes("windows");

export const SHELL_PROFILES: ShellProfile[] = IS_WINDOWS
  ? [
      { label: "PowerShell", shell: "powershell.exe" },
      { label: "PowerShell 7", shell: "C:\\Program Files\\PowerShell\\7\\pwsh.exe" },
      { label: "Command Prompt", shell: "cmd.exe" },
    ]
  : [
      { label: "Default Shell", shell: "" }, // empty = use $SHELL
      { label: "Bash", shell: "bash" },
      { label: "Zsh", shell: "zsh" },
      { label: "Fish", shell: "fish" },
    ];

interface TerminalState {
  sessions: TerminalSession[];
  activeId: string | null;
  defaultProfile: ShellProfile;
  addSession: (session: TerminalSession) => void;
  removeSession: (id: string) => void;
  setActiveId: (id: string) => void;
  renameSession: (id: string, title: string) => void;
  markSessionDead: (id: string) => void;
  appendOutput: (id: string, text: string) => void;
  setDefaultProfile: (profile: ShellProfile) => void;
}

export const useTerminalStore = create<TerminalState>((set) => ({
  sessions: [],
  activeId: null,
  defaultProfile: SHELL_PROFILES[0],

  addSession: (session) =>
    set((s) => ({ sessions: [...s.sessions, session], activeId: session.id })),

  removeSession: (id) =>
    set((s) => {
      const remaining = s.sessions.filter((t) => t.id !== id);
      return {
        sessions: remaining,
        activeId:
          s.activeId === id
            ? remaining[remaining.length - 1]?.id ?? null
            : s.activeId,
      };
    }),

  setActiveId: (id) => set({ activeId: id }),

  renameSession: (id, title) =>
    set((s) => ({
      sessions: s.sessions.map((t) => (t.id === id ? { ...t, title } : t)),
    })),

  markSessionDead: (id) =>
    set((s) => ({
      sessions: s.sessions.map((t) =>
        t.id === id ? { ...t, isDead: true } : t
      ),
    })),

  appendOutput: (id, text) =>
    set((s) => ({
      sessions: s.sessions.map((t) => {
        if (t.id !== id) return t;
        const current = t.recentOutput ?? "";
        // Keep last 3000 chars of terminal history
        const updated = (current + text).slice(-3000);
        return { ...t, recentOutput: updated };
      }),
    })),

  setDefaultProfile: (profile) => set({ defaultProfile: profile }),
}));
