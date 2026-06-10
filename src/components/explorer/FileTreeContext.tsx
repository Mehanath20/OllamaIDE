/* ============================================================
   FileTreeContext.tsx — Right-click context menu portal
   ============================================================ */
import { useEffect, useRef } from "react";
import ReactDOM from "react-dom";
import { FilePlus, FolderPlus, Pencil, Trash2 } from "lucide-react";
import { FileNode } from "../../store/fileStore";

interface Props {
  x: number;
  y: number;
  node: FileNode;
  onClose: () => void;
  onNewFile: () => void;
  onNewFolder: () => void;
  onRename: () => void;
  onDelete: () => void;
}

export default function ContextMenu({
  x, y, node, onClose,
  onNewFile, onNewFolder, onRename, onDelete,
}: Props) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  // Keep menu within viewport
  const menuWidth = 180;
  const menuHeight = 160;
  const safeX = Math.min(x, window.innerWidth - menuWidth - 8);
  const safeY = Math.min(y, window.innerHeight - menuHeight - 8);

  const menu = (
    <div
      ref={menuRef}
      className="ctx-menu"
      style={{ left: safeX, top: safeY }}
    >
      {node.isDir && (
        <>
          <button className="ctx-item" onClick={onNewFile}>
            <FilePlus size={14} /> New File
          </button>
          <button className="ctx-item" onClick={onNewFolder}>
            <FolderPlus size={14} /> New Folder
          </button>
          <div className="ctx-separator" />
        </>
      )}
      <button className="ctx-item" onClick={onRename}>
        <Pencil size={14} /> Rename
      </button>
      <button className="ctx-item ctx-item--danger" onClick={onDelete}>
        <Trash2 size={14} /> Delete
      </button>

      <style>{`
        .ctx-menu {
          position: fixed;
          background: var(--bg-3);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          box-shadow: 0 8px 32px rgba(0,0,0,0.5);
          z-index: 9999;
          min-width: 180px;
          padding: 4px;
          animation: ctxFadeIn 80ms ease both;
        }

        @keyframes ctxFadeIn {
          from { opacity: 0; transform: scale(0.95); }
          to   { opacity: 1; transform: scale(1); }
        }

        .ctx-item {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          width: 100%;
          background: transparent;
          border: none;
          cursor: pointer;
          color: var(--text-secondary);
          font-size: var(--text-sm);
          font-family: var(--font-ui);
          padding: 6px var(--space-3);
          border-radius: var(--radius-sm);
          text-align: left;
          transition: background var(--trans-fast), color var(--trans-fast);
        }

        .ctx-item:hover {
          background: var(--bg-4);
          color: var(--text-primary);
        }

        .ctx-item--danger:hover {
          background: rgba(239, 68, 68, 0.15);
          color: var(--error);
        }

        .ctx-separator {
          height: 1px;
          background: var(--border);
          margin: 4px 0;
        }
      `}</style>
    </div>
  );

  return ReactDOM.createPortal(menu, document.body);
}
