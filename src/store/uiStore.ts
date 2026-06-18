import { create } from "zustand";
import { persist } from "zustand/middleware";

type Theme = "dark" | "light" | "monokai";
type SidebarView = "explorer" | "search" | "git" | "ai" | "extensions" | null;

interface CursorPosition {
  line: number;
  column: number;
}

interface UIState {
  theme: Theme;
  fontSize: number;
  tabSize: number;
  formatOnSave: boolean;
  sidebarView: SidebarView;
  sidebarWidth: number;
  bottomPanelOpen: boolean;
  bottomPanelHeight: number;
  bottomPanelTab: "terminal" | "output" | "problems" | "debug";
  agentPanelOpen: boolean;
  commandPaletteOpen: boolean;
  quickOpenOpen: boolean;
  aiCommandPaletteOpen: boolean;
  settingsOpen: boolean;
  aboutOpen: boolean;
  keybindingOpen: boolean;
  cursorPosition: CursorPosition | null;
  selectedCode: string | null;
  installedExtensions: any[]; // Store extension objects
  modelLibraryOpen: boolean;
  branchSelectorOpen: boolean;

  setTheme: (theme: Theme) => void;
  setFontSize: (s: number) => void;
  setTabSize: (s: number) => void;
  setFormatOnSave: (v: boolean) => void;
  setSidebarView: (view: SidebarView) => void;
  setSidebarWidth: (w: number) => void;
  setBottomPanelOpen: (v: boolean) => void;
  setBottomPanelHeight: (h: number) => void;
  setBottomPanelTab: (t: "terminal" | "output" | "problems" | "debug") => void;
  setAgentPanelOpen: (v: boolean) => void;
  setCommandPaletteOpen: (v: boolean) => void;
  setQuickOpenOpen: (v: boolean) => void;
  setAiCommandPaletteOpen: (v: boolean) => void;
  setSettingsOpen: (v: boolean) => void;
  setAboutOpen: (v: boolean) => void;
  setKeybindingOpen: (v: boolean) => void;
  setCursorPosition: (pos: CursorPosition) => void;
  setSelectedCode: (code: string | null) => void;
  setInstalledExtensions: (exts: any[] | ((prev: any[]) => any[])) => void;
  setModelLibraryOpen: (v: boolean) => void;
  setBranchSelectorOpen: (v: boolean) => void;
  registerExtensionCommand: (id: string, callback: (...args: any[]) => void) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
  theme: "dark",
  fontSize: 14,
  tabSize: 2,
  formatOnSave: true,
  sidebarView: "explorer",
  sidebarWidth: 240,
  bottomPanelOpen: false,
  bottomPanelHeight: 240,
  bottomPanelTab: "terminal",
  agentPanelOpen: true,
  commandPaletteOpen: false,
  quickOpenOpen: false,
  aiCommandPaletteOpen: false,
  settingsOpen: false,
  aboutOpen: false,
  keybindingOpen: false,
  cursorPosition: null,
  selectedCode: null,
  installedExtensions: [],
  modelLibraryOpen: false,
  branchSelectorOpen: false,

  setTheme: (theme) => set({ theme }),
  setFontSize: (fontSize) => set({ fontSize }),
  setTabSize: (tabSize) => set({ tabSize }),
  setFormatOnSave: (formatOnSave) => set({ formatOnSave }),
  setSidebarView: (sidebarView) => set({ sidebarView }),
  setSidebarWidth: (sidebarWidth) => set({ sidebarWidth }),
  setBottomPanelOpen: (bottomPanelOpen) => set({ bottomPanelOpen }),
  setBottomPanelHeight: (bottomPanelHeight) => set({ bottomPanelHeight }),
  setBottomPanelTab: (bottomPanelTab) => set({ bottomPanelTab }),
  setAgentPanelOpen: (agentPanelOpen) => set({ agentPanelOpen }),
  setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),
  setQuickOpenOpen: (quickOpenOpen) => set({ quickOpenOpen }),
  setAiCommandPaletteOpen: (aiCommandPaletteOpen) => set({ aiCommandPaletteOpen }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setAboutOpen: (aboutOpen) => set({ aboutOpen }),
  setKeybindingOpen: (keybindingOpen) => set({ keybindingOpen }),
  setCursorPosition: (cursorPosition) => set({ cursorPosition }),
  setSelectedCode: (selectedCode) => set({ selectedCode }),
  setInstalledExtensions: (exts) => set((state) => ({ 
    installedExtensions: typeof exts === 'function' ? exts(state.installedExtensions) : exts 
  })),
  setModelLibraryOpen: (modelLibraryOpen) => set({ modelLibraryOpen }),
  setBranchSelectorOpen: (branchSelectorOpen) => set({ branchSelectorOpen }),
  registerExtensionCommand: (id, callback) => {
    // Just a placeholder to show it exists; usually command palette will read from a registry
    // But since CommandPalette is generic, we'll store it globally or dispatch an event
    window.dispatchEvent(new CustomEvent('extension-command-registered', { detail: { id, callback } }));
  },
    }),
    {
      name: 'ollama-ide-ui-storage',
      partialize: (state) => ({
        theme: state.theme,
        fontSize: state.fontSize,
        tabSize: state.tabSize,
        formatOnSave: state.formatOnSave,
        installedExtensions: state.installedExtensions,
      }),
    }
  )
);
