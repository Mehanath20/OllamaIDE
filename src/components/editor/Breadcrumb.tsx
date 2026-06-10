/* ============================================================
   Breadcrumb.tsx — Path breadcrumb above editor
   ============================================================ */
import React from "react";
import { ChevronRight } from "lucide-react";
import { useEditorStore } from "../../store/editorStore";
import { useFileStore } from "../../store/fileStore";
import { getFileIcon } from "../../lib/fileIcons";

export default function Breadcrumb() {
  const { activeFile, openFiles } = useEditorStore();
  const { workspaceRoot } = useFileStore();

  if (!activeFile) return null;

  const file = openFiles.find((f) => f.path === activeFile);
  if (!file) return null;

  // Build breadcrumb parts from path relative to workspace root
  let parts: string[] = [];
  let normalizedPath = activeFile.replace(/\\/g, "/");
  let normalizedRoot = (workspaceRoot || "").replace(/\\/g, "/");

  if (normalizedRoot && normalizedPath.startsWith(normalizedRoot)) {
    const relative = normalizedPath.slice(normalizedRoot.length).replace(/^\//, "");
    parts = relative.split("/");
  } else {
    parts = normalizedPath.split("/").slice(-3);
  }

  return (
    <div className="breadcrumb">
      {parts.map((part, i) => (
        <React.Fragment key={i}>
          {i > 0 && <ChevronRight size={12} className="breadcrumb-sep" />}
          <span
            className={`breadcrumb-part ${i === parts.length - 1 ? "breadcrumb-part--active" : ""}`}
          >
            {i === parts.length - 1 && (
              <span className="breadcrumb-icon">{getFileIcon(part)}</span>
            )}
            {part}
          </span>
        </React.Fragment>
      ))}

      <style>{`
        .breadcrumb {
          display: flex;
          align-items: center;
          gap: 2px;
          height: 24px;
          padding: 0 var(--space-4);
          background: var(--bg-2);
          border-bottom: 1px solid var(--border-soft);
          flex-shrink: 0;
          overflow: hidden;
        }

        .breadcrumb-sep {
          color: var(--text-muted);
          flex-shrink: 0;
        }

        .breadcrumb-part {
          font-size: var(--text-xs);
          color: var(--text-muted);
          white-space: nowrap;
          display: flex;
          align-items: center;
          gap: 4px;
          cursor: default;
          transition: color var(--trans-fast);
        }

        .breadcrumb-part:hover { color: var(--text-secondary); }

        .breadcrumb-part--active {
          color: var(--text-secondary);
          font-weight: 500;
        }

        .breadcrumb-icon { font-size: 11px; }
      `}</style>
    </div>
  );
}
