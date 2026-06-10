/* ============================================================
   EditorTabs.tsx
   - Tab bar with dirty dot indicator
   - Middle-click or ✕ to close
   - Scrollable when many tabs open
   ============================================================ */
import React, { useRef } from "react";
import { X } from "lucide-react";
import { useEditorStore, OpenFile } from "../../store/editorStore";
import { getFileIcon } from "../../lib/fileIcons";

export default function EditorTabs() {
  const { openFiles, activeFile, setActiveFile, closeFile } = useEditorStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleMiddleClick = (e: React.MouseEvent, path: string) => {
    if (e.button === 1) {
      e.preventDefault();
      closeFile(path);
    }
  };

  const handleClose = (e: React.MouseEvent, path: string) => {
    e.stopPropagation();
    closeFile(path);
  };

  if (openFiles.length === 0) return null;

  return (
    <div className="editor-tabs" ref={scrollRef}>
      {openFiles.map((file: OpenFile) => (
        <div
          key={file.path}
          className={`tab ${file.path === activeFile ? "tab--active" : ""}`}
          onClick={() => setActiveFile(file.path)}
          onMouseDown={(e) => handleMiddleClick(e, file.path)}
          title={file.path}
        >
          <span className="tab-icon">{getFileIcon(file.name)}</span>
          <span className="tab-name">{file.name}</span>
          {file.isDirty && <span className="tab-dirty" title="Unsaved changes" />}
          <button
            className="tab-close"
            onClick={(e) => handleClose(e, file.path)}
            title="Close"
          >
            <X size={12} />
          </button>
        </div>
      ))}

      <style>{`
        .editor-tabs {
          display: flex;
          height: var(--tab-h);
          background: var(--bg-1);
          border-bottom: 1px solid var(--border-soft);
          overflow-x: auto;
          overflow-y: hidden;
          flex-shrink: 0;
          scrollbar-width: thin;
        }

        .editor-tabs::-webkit-scrollbar { height: 2px; }

        .tab {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 0 var(--space-3);
          min-width: 100px;
          max-width: 200px;
          height: 100%;
          font-size: var(--text-sm);
          color: var(--text-muted);
          cursor: pointer;
          border-right: 1px solid var(--border-soft);
          border-bottom: 2px solid transparent;
          background: var(--bg-1);
          transition: background var(--trans-fast), color var(--trans-fast);
          flex-shrink: 0;
          user-select: none;
          position: relative;
        }

        .tab:hover {
          background: var(--bg-2);
          color: var(--text-secondary);
        }

        .tab--active {
          background: var(--bg-2);
          color: var(--text-primary);
          border-bottom-color: var(--accent);
        }

        .tab-icon {
          font-size: 12px;
          flex-shrink: 0;
        }

        .tab-name {
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .tab-dirty {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: var(--text-secondary);
          flex-shrink: 0;
          margin-right: 2px;
        }

        .tab--active .tab-dirty { background: var(--accent); }

        .tab-close {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 18px;
          height: 18px;
          background: transparent;
          border: none;
          cursor: pointer;
          color: var(--text-muted);
          border-radius: var(--radius-sm);
          flex-shrink: 0;
          opacity: 0;
          transition: opacity var(--trans-fast), background var(--trans-fast), color var(--trans-fast);
        }

        .tab:hover .tab-close,
        .tab--active .tab-close { opacity: 1; }

        .tab-close:hover {
          background: var(--bg-4);
          color: var(--text-primary);
        }
      `}</style>
    </div>
  );
}
