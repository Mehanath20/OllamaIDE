import { create } from "zustand";

export interface FileNode {
  name: string;
  path: string;
  isDir: boolean;
  size?: number;
  children?: FileNode[];
  expanded?: boolean;
}

interface CreatingItem {
  type: "file" | "folder";
  parentPath: string | null; // null means root of workspace
}

interface FileState {
  workspaceRoot: string | null;
  tree: FileNode[];
  creatingItem: CreatingItem | null;
  setWorkspaceRoot: (root: string) => void;
  setTree: (tree: FileNode[]) => void;
  setCreatingItem: (item: CreatingItem | null) => void;
  toggleExpanded: (path: string) => void;
  gitRefreshTrigger: number;
  triggerGitRefresh: () => void;
}

export const useFileStore = create<FileState>((set) => ({
  workspaceRoot: null,
  tree: [],
  creatingItem: null,
  gitRefreshTrigger: 0,

  setWorkspaceRoot: (root) => set({ workspaceRoot: root }),
  setTree: (tree) => set({ tree }),
  setCreatingItem: (creatingItem) => set({ creatingItem }),

  toggleExpanded: (path) =>
    set((s) => ({
      tree: toggleNode(s.tree, path),
    })),
  triggerGitRefresh: () => set((state) => ({ gitRefreshTrigger: state.gitRefreshTrigger + 1 })),
}));

function toggleNode(nodes: FileNode[], path: string): FileNode[] {
  return nodes.map((n) => {
    if (n.path === path) return { ...n, expanded: !n.expanded };
    if (n.children) return { ...n, children: toggleNode(n.children, path) };
    return n;
  });
}
