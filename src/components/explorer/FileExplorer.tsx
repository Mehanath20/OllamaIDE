/* ============================================================
   FileExplorer.tsx
   - Open Folder via Tauri dialog
   - Recursive file tree via list_dir
   - Auto-refresh via file-changed events
   ============================================================ */
import { useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { FolderOpen, RefreshCw, ChevronDown, FilePlus, FolderPlus, ListCollapse } from "lucide-react";
import { useFileStore, FileNode } from "../../store/fileStore";
import FileTreeItem from "./FileTreeItem";
import FileInlineInput from "./FileInlineInput";

export default function FileExplorer() {
  const { workspaceRoot, tree, creatingItem, setWorkspaceRoot, setTree, setCreatingItem } = useFileStore();
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadTree = useCallback(async (root: string) => {
    const entries = await buildTree(root);
    setTree(entries);
  }, [setTree]);

  const openFolder = async () => {
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected === "string") {
      setWorkspaceRoot(selected);
      await loadTree(selected);
      // Start watching for changes
      try {
        await invoke("watch_directory", { path: selected });
      } catch (e) {
        console.warn("File watcher unavailable:", e);
      }
    }
  };

  // Debounced refresh on file-change events
  useEffect(() => {
    if (!workspaceRoot) return;
    const unlisten = listen("file-changed", () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = setTimeout(() => {
        loadTree(workspaceRoot);
      }, 300);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [workspaceRoot, loadTree]);

  const handleCollapseAll = () => {
    window.dispatchEvent(new CustomEvent("collapse-all-tree"));
  };

  const workspaceName = workspaceRoot
    ? workspaceRoot.split(/[\\/]/).pop() || workspaceRoot
    : null;

  return (
    <div className="explorer">
      {/* Header */}
      <div className="explorer-header">
        <span className="explorer-title">EXPLORER</span>
        <div className="explorer-actions">
          {workspaceRoot && (
            <>
              <button
                className="explorer-action-btn"
                title="New File"
                onClick={() => setCreatingItem({ type: "file", parentPath: null })}
              >
                <FilePlus size={14} />
              </button>
              <button
                className="explorer-action-btn"
                title="New Folder"
                onClick={() => setCreatingItem({ type: "folder", parentPath: null })}
              >
                <FolderPlus size={14} />
              </button>
              <button
                className="explorer-action-btn"
                title="Refresh"
                onClick={() => workspaceRoot && loadTree(workspaceRoot)}
              >
                <RefreshCw size={14} />
              </button>
              <button
                className="explorer-action-btn"
                title="Collapse All"
                onClick={handleCollapseAll}
              >
                <ListCollapse size={14} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Workspace name */}
      {workspaceName && (
        <div className="explorer-workspace">
          <ChevronDown size={12} />
          <span className="truncate">{workspaceName.toUpperCase()}</span>
        </div>
      )}

      {/* Tree or Open Folder */}
      <div className="explorer-tree">
        {workspaceRoot ? (
          <>
            {creatingItem?.parentPath === null && (
              <FileInlineInput
                type={creatingItem.type}
                parentPath={null}
                depth={0}
                onComplete={() => setCreatingItem(null)}
                onCancel={() => setCreatingItem(null)}
              />
            )}
            {tree.map((node) => (
              <FileTreeItem key={node.path} node={node} depth={0} />
            ))}
          </>
        ) : (
          <div className="explorer-empty">
            <FolderOpen size={32} className="explorer-empty-icon" />
            <p>No folder opened</p>
            <button className="open-folder-btn" onClick={openFolder}>
              Open Folder
            </button>
          </div>
        )}
      </div>

      <style>{`
        .explorer {
          display: flex;
          flex-direction: column;
          height: 100%;
          overflow: hidden;
          background: var(--bg-1);
        }

        .explorer-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 var(--space-2) 0 var(--space-4);
          height: 35px;
          flex-shrink: 0;
        }

        .explorer-title {
          font-size: var(--text-xs);
          font-weight: 700;
          color: var(--text-muted);
          letter-spacing: 0.1em;
        }

        .explorer-actions {
          display: flex;
          gap: 2px;
          opacity: 0;
          transition: opacity var(--trans-fast);
        }

        .explorer:hover .explorer-actions { opacity: 1; }

        .explorer-action-btn {
          background: transparent;
          border: none;
          cursor: pointer;
          color: var(--text-secondary);
          display: flex;
          align-items: center;
          padding: 4px;
          border-radius: var(--radius-sm);
          transition: color var(--trans-fast), background var(--trans-fast);
        }

        .explorer-action-btn:hover {
          color: var(--text-primary);
          background: var(--bg-4);
        }

        .explorer-workspace {
          display: flex;
          align-items: center;
          gap: var(--space-1);
          padding: 4px var(--space-2);
          font-size: var(--text-xs);
          font-weight: 700;
          color: var(--text-secondary);
          letter-spacing: 0.05em;
          overflow: hidden;
          cursor: default;
          border-bottom: 1px solid var(--border-soft);
        }

        .explorer-tree {
          flex: 1;
          overflow-y: auto;
          overflow-x: hidden;
          padding-bottom: var(--space-4);
        }

        .explorer-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: var(--space-3);
          height: 100%;
          padding: var(--space-6);
          text-align: center;
          color: var(--text-muted);
          font-size: var(--text-sm);
        }

        .explorer-empty-icon {
          color: var(--text-muted);
          opacity: 0.5;
        }

        .open-folder-btn {
          background: var(--accent);
          color: var(--text-inverse);
          border: none;
          cursor: pointer;
          padding: var(--space-2) var(--space-4);
          border-radius: var(--radius-md);
          font-size: var(--text-sm);
          font-weight: 500;
          font-family: var(--font-ui);
          transition: background var(--trans-fast), transform var(--trans-fast);
        }

        .open-folder-btn:hover {
          background: var(--accent-hover);
          transform: translateY(-1px);
        }
      `}</style>
    </div>
  );
}

// Build flat list (tree is rendered recursively by FileTreeItem)
async function buildTree(path: string): Promise<FileNode[]> {
  try {
    const entries = await invoke<{ name: string; path: string; is_dir: boolean; size?: number }[]>(
      "list_dir",
      { path }
    );
    return entries.map((e) => ({
      name: e.name,
      path: e.path,
      isDir: e.is_dir,
      size: e.size,
      children: undefined,
      expanded: false,
    }));
  } catch {
    return [];
  }
}
