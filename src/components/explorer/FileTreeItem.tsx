/* ============================================================
   FileTreeItem.tsx
   - File/folder with icons, expand/collapse, click handlers
   - Right-click context menu: New File, New Folder, Rename, Delete
   ============================================================ */
import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
} from "lucide-react";
import { FileNode, useFileStore } from "../../store/fileStore";
import { useEditorStore } from "../../store/editorStore";
import { getLanguageFromExt, getFileIcon } from "../../lib/fileIcons";
import ContextMenu from "./FileTreeContext";
import FileInlineInput from "./FileInlineInput";

interface Props {
  node: FileNode;
  depth: number;
}

interface CtxMenu {
  x: number;
  y: number;
  node: FileNode;
}

export default function FileTreeItem({ node, depth }: Props) {
  const [children, setChildren] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(node.name);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { openFile } = useEditorStore();
  const { creatingItem, setCreatingItem } = useFileStore();

  useEffect(() => {
    const handleCollapse = () => setIsExpanded(false);
    window.addEventListener("collapse-all-tree", handleCollapse);
    return () => window.removeEventListener("collapse-all-tree", handleCollapse);
  }, []);

  const loadChildren = async (path: string) => {
    setLoading(true);
    try {
      const entries = await invoke<{ name: string; path: string; is_dir: boolean; size?: number }[]>(
        "list_dir",
        { path }
      );
      setChildren(
        entries.map((e) => ({
          name: e.name,
          path: e.path,
          isDir: e.is_dir,
          size: e.size,
          expanded: false,
        }))
      );
    } catch (err) {
      console.error("Failed to list dir:", err);
    } finally {
      setLoading(false);
    }
  };

  const toggleFolder = async () => {
    if (!isExpanded && children.length === 0) {
      await loadChildren(node.path);
    }
    setIsExpanded((v) => !v);
  };

  const handleFileOpen = async (path: string) => {
    try {
      const content = await invoke<string>("read_file", { path });
      const name = path.split(/[\\/]/).pop() || path;
      const ext = name.split(".").pop() || "";
      openFile({
        path,
        name,
        content,
        language: getLanguageFromExt(ext),
        isDirty: false,
      });
    } catch (err) {
      console.error("Failed to read file:", err);
    }
  };

  const handleClick = () => {
    if (node.isDir) {
      toggleFolder();
      return;
    }
    // Single-click: preview (open as tab)
    if (clickTimer.current) clearTimeout(clickTimer.current);
    clickTimer.current = setTimeout(() => {
      handleFileOpen(node.path);
    }, 200);
  };

  const handleDblClick = () => {
    if (node.isDir) return;
    if (clickTimer.current) clearTimeout(clickTimer.current);
    handleFileOpen(node.path);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY, node });
  };

  const closeCtx = () => setCtxMenu(null);

  const handleRename = async () => {
    closeCtx();
    setRenaming(true);
  };

  const commitRename = async () => {
    if (renameValue.trim() && renameValue !== node.name) {
      const parts = node.path.split(/[\\/]/);
      parts[parts.length - 1] = renameValue.trim();
      const newPath = parts.join("/");
      try {
        await invoke("rename_path", { oldPath: node.path, newPath });
      } catch (err) {
        console.error("Rename failed:", err);
      }
    }
    setRenaming(false);
  };

  const handleDelete = async () => {
    closeCtx();
    if (confirm(`Delete "${node.name}"?`)) {
      try {
        await invoke("delete_path", { path: node.path });
      } catch (err) {
        console.error("Delete failed:", err);
      }
    }
  };

  const handleNewFile = async () => {
    closeCtx();
    const basePath = node.isDir ? node.path : node.path.substring(0, node.path.lastIndexOf("/"));
    if (node.isDir && !isExpanded) await toggleFolder();
    setCreatingItem({ type: "file", parentPath: basePath });
  };

  const handleNewFolder = async () => {
    closeCtx();
    const basePath = node.isDir ? node.path : node.path.substring(0, node.path.lastIndexOf("/"));
    if (node.isDir && !isExpanded) await toggleFolder();
    setCreatingItem({ type: "folder", parentPath: basePath });
  };

  const indent = depth * 12;
  const icon = node.isDir
    ? isExpanded
      ? <FolderOpen size={14} className="file-icon file-icon--folder" />
      : <Folder size={14} className="file-icon file-icon--folder" />
    : <span className="file-icon file-icon--file">{getFileIcon(node.name)}</span>;

  return (
    <>
      <div
        className={`tree-item ${!node.isDir ? "tree-item--file" : ""}`}
        style={{ paddingLeft: `${8 + indent}px` }}
        onClick={handleClick}
        onDoubleClick={handleDblClick}
        onContextMenu={handleContextMenu}
        title={node.path}
      >
        {/* Chevron for dirs */}
        <span className="tree-chevron">
          {node.isDir ? (
            isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />
          ) : (
            <span style={{ width: 12 }} />
          )}
        </span>

        {/* Icon */}
        {icon}

        {/* Name or rename input */}
        {renaming ? (
          <input
            className="rename-input"
            value={renameValue}
            autoFocus
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") setRenaming(false);
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="tree-label truncate">{node.name}</span>
        )}
      </div>

      {/* Children */}
      {node.isDir && isExpanded && (
        <div className="tree-children">
          {creatingItem?.parentPath === node.path && (
            <FileInlineInput
              type={creatingItem.type}
              parentPath={node.path}
              depth={depth + 1}
              onComplete={() => setCreatingItem(null)}
              onCancel={() => setCreatingItem(null)}
            />
          )}
          {loading ? (
            <div className="tree-loading" style={{ paddingLeft: `${8 + indent + 20}px` }}>
              Loading…
            </div>
          ) : (
            children.map((child) => (
              <FileTreeItem key={child.path} node={child} depth={depth + 1} />
            ))
          )}
        </div>
      )}

      {/* Context Menu */}
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          node={ctxMenu.node}
          onClose={closeCtx}
          onNewFile={handleNewFile}
          onNewFolder={handleNewFolder}
          onRename={handleRename}
          onDelete={handleDelete}
        />
      )}

      <style>{`
        .tree-item {
          display: flex;
          align-items: center;
          gap: 4px;
          height: 22px;
          cursor: pointer;
          font-size: var(--text-sm);
          color: var(--text-secondary);
          border-radius: 0;
          transition: background var(--trans-fast), color var(--trans-fast);
          user-select: none;
          white-space: nowrap;
          overflow: hidden;
        }

        .tree-item:hover {
          background: var(--bg-3);
          color: var(--text-primary);
        }

        .tree-chevron {
          display: flex;
          align-items: center;
          color: var(--text-muted);
          flex-shrink: 0;
        }

        .file-icon {
          flex-shrink: 0;
          display: flex;
          align-items: center;
        }

        .file-icon--folder { color: #e8b84b; }

        .file-icon--file {
          font-size: 13px;
          width: 14px;
          text-align: center;
          line-height: 1;
        }

        .tree-label {
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .tree-loading {
          font-size: var(--text-xs);
          color: var(--text-muted);
          padding: 2px 0;
        }

        .rename-input {
          flex: 1;
          background: var(--bg-3);
          border: 1px solid var(--accent);
          color: var(--text-primary);
          font-size: var(--text-sm);
          font-family: var(--font-ui);
          padding: 0 4px;
          outline: none;
          border-radius: var(--radius-sm);
          height: 18px;
        }
      `}</style>
    </>
  );
}
