/* ============================================================
   DiffReview.tsx — Monaco-powered File Changes reviewer.
   Renders a side-by-side visual diff using Monaco DiffEditor,
   letting the user approve or discard the agent's writes.
   ============================================================ */
import { DiffEditor } from "@monaco-editor/react";
import { Check, X } from "lucide-react";
import { useAIStore } from "../../store/aiStore";

export default function DiffReview() {
  const pendingFileChange = useAIStore((s) => s.pendingFileChange);
  const filePermissionResolve = useAIStore((s) => s.filePermissionResolve);

  if (!pendingFileChange) return null;

  const { path, oldContent, newContent } = pendingFileChange;

  // Infer language from path extension
  const ext = path.split(".").pop() || "typescript";
  const languageMap: Record<string, string> = {
    js: "javascript",
    ts: "typescript",
    tsx: "typescript",
    jsx: "javascript",
    py: "python",
    html: "html",
    css: "css",
    rs: "rust",
    json: "json",
    md: "markdown",
  };
  const language = languageMap[ext] || "text";

  const handleAccept = () => {
    if (filePermissionResolve) {
      filePermissionResolve(true);
    }
  };

  const handleReject = () => {
    if (filePermissionResolve) {
      filePermissionResolve(false);
    }
  };

  return (
    <div className="diff-modal-overlay">
      <div className="diff-modal-container">
        <div className="diff-modal-header">
          <div className="diff-header-left">
            <span className="diff-title">Review Proposed File Changes</span>
            <span className="diff-file-path">{path}</span>
          </div>
          <div className="diff-header-actions">
            <button className="btn-diff btn-diff--reject" onClick={handleReject}>
              <X size={16} />
              <span>Reject Change</span>
            </button>
            <button className="btn-diff btn-diff--accept" onClick={handleAccept}>
              <Check size={16} />
              <span>Accept & Write</span>
            </button>
          </div>
        </div>

        <div className="diff-editor-wrapper">
          <DiffEditor
            height="100%"
            width="100%"
            language={language}
            original={oldContent}
            modified={newContent}
            theme="antigravity-dark"
            options={{
              readOnly: true,
              originalEditable: false,
              renderSideBySide: true,
              minimap: { enabled: false },
              scrollbar: {
                verticalScrollbarSize: 6,
                horizontalScrollbarSize: 6,
              },
            }}
          />
        </div>
      </div>

      <style>{`
        .diff-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          background: rgba(0, 0, 0, 0.75);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 40px;
        }

        .diff-modal-container {
          width: 100%;
          height: 100%;
          background: var(--bg-0);
          border: 1px solid var(--border-soft);
          border-radius: 8px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
        }

        .diff-modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: var(--space-3) var(--space-4);
          background: var(--bg-1);
          border-bottom: 1px solid var(--border-soft);
          flex-shrink: 0;
        }

        .diff-header-left {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .diff-title {
          font-size: var(--text-sm);
          font-weight: 700;
          color: var(--text-primary);
        }

        .diff-file-path {
          font-family: monospace;
          font-size: var(--text-xs);
          color: var(--accent);
        }

        .diff-header-actions {
          display: flex;
          gap: var(--space-3);
        }

        .btn-diff {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          padding: var(--space-2) var(--space-4);
          border-radius: 4px;
          border: none;
          font-size: var(--text-sm);
          font-weight: 600;
          cursor: pointer;
          transition: background var(--trans-fast);
        }

        .btn-diff--accept {
          background: var(--accent);
          color: var(--text-inverse);
        }
        .btn-diff--accept:hover {
          background: var(--accent-hover);
        }

        .btn-diff--reject {
          background: var(--bg-2);
          border: 1px solid var(--border-soft);
          color: var(--text-primary);
        }
        .btn-diff--reject:hover {
          background: rgba(255, 255, 255, 0.05);
        }

        .diff-editor-wrapper {
          flex: 1;
          background: var(--bg-2);
        }
      `}</style>
    </div>
  );
}
