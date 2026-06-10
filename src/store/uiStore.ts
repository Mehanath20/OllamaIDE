import { create } from "zustand";

type Theme = "dark" | "light" | "monokai";
type SidebarView = "explorer" | "search" | "git" | "ai" | "extensions" | null;

interface CursorPosition {
  line: number;
  column: number;
}

interface UIState {
  theme: Theme;
  sidebarView: SidebarView;
  sidebarWidth: number;
  bottomPanelOpen: boolean;
  bottomPanelHeight: number;
  agentPanelOpen: boolean;
  commandPaletteOpen: boolean;
  quickOpenOpen: boolean;
  aiCommandPaletteOpen: boolean;
  settingsOpen: boolean;
  cursorPosition: CursorPosition | null;
  selectedCode: string | null;

  setTheme: (theme: Theme) => void;
  setSidebarView: (view: SidebarView) => void;
  setSidebarWidth: (w: number) => void;
  setBottomPanelOpen: (v: boolean) => void;
  setBottomPanelHeight: (h: number) => void;
  setAgentPanelOpen: (v: boolean) => void;
  setCommandPaletteOpen: (v: boolean) => void;
  setQuickOpenOpen: (v: boolean) => void;
  setAiCommandPaletteOpen: (v: boolean) => void;
  setSettingsOpen: (v: boolean) => void;
  setCursorPosition: (pos: CursorPosition) => void;
  setSelectedCode: (code: string | null) => void;
}

export const useUIStore = create<UIState>((set) => ({
  theme: "dark",
  sidebarView: "explorer",
  sidebarWidth: 240,
  bottomPanelOpen: false,
  bottomPanelHeight: 240,
  agentPanelOpen: true,
  commandPaletteOpen: false,
  quickOpenOpen: false,
  aiCommandPaletteOpen: false,
  settingsOpen: false,
  cursorPosition: null,
  selectedCode: null,

  setTheme: (theme) => set({ theme }),
  setSidebarView: (sidebarView) => set({ sidebarView }),
  setSidebarWidth: (sidebarWidth) => set({ sidebarWidth }),
  setBottomPanelOpen: (bottomPanelOpen) => set({ bottomPanelOpen }),
  setBottomPanelHeight: (bottomPanelHeight) => set({ bottomPanelHeight }),
  setAgentPanelOpen: (agentPanelOpen) => set({ agentPanelOpen }),
  setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),
  setQuickOpenOpen: (quickOpenOpen) => set({ quickOpenOpen }),
  setAiCommandPaletteOpen: (aiCommandPaletteOpen) => set({ aiCommandPaletteOpen }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setCursorPosition: (cursorPosition) => set({ cursorPosition }),
  setSelectedCode: (selectedCode) => set({ selectedCode }),
}));
