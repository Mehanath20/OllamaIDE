import { create } from "zustand";

export interface OpenFile {
  path: string;
  name: string;
  content: string;
  language: string;
  isDirty: boolean;
  isDiff?: boolean;
  originalContent?: string;
}

interface EditorState {
  openFiles: OpenFile[];
  activeFile: string | null;          // path of active tab
  splitMode: boolean;                 // true if split editor is enabled
  splitActiveFile: string | null;     // active file in the right split

  openFile: (file: OpenFile) => void;
  closeFile: (path: string) => void;
  setActiveFile: (path: string) => void;
  setSplitActiveFile: (path: string | null) => void;
  toggleSplitMode: () => void;
  updateContent: (path: string, content: string) => void;
  markSaved: (path: string) => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  openFiles: [],
  activeFile: null,
  splitMode: false,
  splitActiveFile: null,

  openFile: (file) =>
    set((s) => {
      const exists = s.openFiles.find((f) => f.path === file.path);
      if (exists) {
        // File already open — just switch to it (don't overwrite user edits)
        return { activeFile: file.path };
      }
      return {
        openFiles: [...s.openFiles, file],
        activeFile: file.path,
      };
    }),

  closeFile: (path) =>
    set((s) => {
      const remaining = s.openFiles.filter((f) => f.path !== path);
      return {
        openFiles: remaining,
        activeFile:
          s.activeFile === path
            ? remaining[remaining.length - 1]?.path ?? null
            : s.activeFile,
      };
    }),

  setActiveFile: (path) => set({ activeFile: path }),
  setSplitActiveFile: (path) => set({ splitActiveFile: path }),
  toggleSplitMode: () => set((s) => ({
    splitMode: !s.splitMode,
    splitActiveFile: !s.splitMode ? s.activeFile : null,
  })),

  updateContent: (path, content) =>
    set((s) => ({
      openFiles: s.openFiles.map((f) =>
        f.path === path ? { ...f, content, isDirty: true } : f
      ),
    })),

  markSaved: (path) =>
    set((s) => ({
      openFiles: s.openFiles.map((f) =>
        f.path === path ? { ...f, isDirty: false } : f
      ),
    })),
}));
