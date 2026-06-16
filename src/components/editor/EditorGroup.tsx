/* ============================================================
   EditorGroup.tsx — Orchestrates tabs + breadcrumb + Monaco
   Shows welcome screen when no files open
   ============================================================ */

import { useEditorStore } from "../../store/editorStore";
import { useUIStore } from "../../store/uiStore";

import { PanelGroup, Panel, PanelResizeHandle } from "react-resizable-panels";
import EditorTabs from "./EditorTabs";
import Breadcrumb from "./Breadcrumb";
import MonacoEditor from "./MonacoEditor";
import DiffEditor from "./DiffEditor";
import { FolderOpen, MessageSquare, Wrench, Zap, FileText, CheckCircle2, Plane, SplitSquareHorizontal } from "lucide-react";

export default function EditorGroup() {
  const { openFiles, activeFile, splitMode, splitActiveFile, toggleSplitMode } = useEditorStore();
  const { selectedCode, setAgentPanelOpen } = useUIStore();
  const activeFileData = openFiles.find((f) => f.path === activeFile);

  const handleInlineAction = (action: string) => {
    setAgentPanelOpen(true);
    alert(`Triggered inline action: ${action} on selected code.`);
  };

  const renderEditorBody = (currentActiveFile: string | null) => (
    <div className="editor-body">
      {openFiles.map((file) => (
        <div
          key={file.path}
          className="editor-pane"
          style={{ display: file.path === currentActiveFile ? "flex" : "none" }}
        >
          {file.isDiff ? (
            <DiffEditor
              original={file.originalContent || ""}
              modified={file.content}
              language={file.language}
            />
          ) : (
            <MonacoEditor
              path={file.path}
              content={file.content}
              language={file.language}
            />
          )}
        </div>
      ))}

      {/* Inline AI Actions Bar */}
      {selectedCode && currentActiveFile === activeFile && (
        <div className="inline-ai-actions">
          <button className="inline-action-btn" onClick={() => handleInlineAction("Explain")}>
            <MessageSquare size={12} /> Explain
          </button>
          <button className="inline-action-btn" onClick={() => handleInlineAction("Fix")}>
            <Wrench size={12} /> Fix
          </button>
          <button className="inline-action-btn" onClick={() => handleInlineAction("Optimize")}>
            <Zap size={12} /> Optimize
          </button>
          <button className="inline-action-btn" onClick={() => handleInlineAction("Document")}>
            <FileText size={12} /> Document
          </button>
          <button className="inline-action-btn" onClick={() => handleInlineAction("Test")}>
            <CheckCircle2 size={12} /> Test
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="editor-group">
      {openFiles.length > 0 ? (
        <>
          <div style={{ display: "flex", width: "100%" }}>
            <div style={{ flex: 1, overflow: "hidden" }}>
              <EditorTabs />
            </div>
            <div style={{ display: "flex", alignItems: "center", padding: "0 8px", background: "var(--bg-1)", borderBottom: "1px solid var(--border-soft)" }}>
              <button className="btn-icon" title="Split Editor" onClick={toggleSplitMode}>
                <SplitSquareHorizontal size={14} />
              </button>
            </div>
          </div>
          {activeFileData && (
            <>
              {/* AI Context Bar */}
              <div className="ai-context-bar">
                <span className="context-label">Context:</span>
                <span className="context-files">
                  {openFiles.map(f => f.name).join(" + ")}
                </span>
              </div>
              <Breadcrumb />
              
              {splitMode ? (
                <PanelGroup direction="horizontal" autoSaveId="ide-split-editor">
                  <Panel id="left-editor" minSize={20}>
                    {renderEditorBody(activeFile)}
                  </Panel>
                  <PanelResizeHandle className="resize-handle resize-handle--vertical" />
                  <Panel id="right-editor" minSize={20}>
                    {renderEditorBody(splitActiveFile)}
                  </Panel>
                </PanelGroup>
              ) : (
                renderEditorBody(activeFile)
              )}
            </>
          )}

        </>
      ) : (
        <WelcomeScreen />
      )}

      <style>{`
        .editor-group {
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
          background: var(--bg-2);
          overflow: hidden;
        }

        .ai-context-bar {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          padding: 4px var(--space-4);
          background: rgba(124, 58, 237, 0.05);
          border-bottom: 1px solid rgba(124, 58, 237, 0.1);
          font-size: 11px;
        }

        .context-label {
          color: var(--accent);
          font-weight: 700;
        }

        .context-files {
          color: var(--text-primary);
          font-family: var(--font-mono);
        }

        .editor-body {
          flex: 1;
          overflow: hidden;
          position: relative;
        }

        .editor-pane {
          position: absolute;
          inset: 0;
          display: flex;
        }

        .inline-ai-actions {
          position: absolute;
          top: 16px;
          left: 50%;
          transform: translateX(-50%);
          background: var(--bg-3);
          border: 1px solid var(--border-soft);
          border-radius: 8px;
          box-shadow: 0 4px 16px rgba(0,0,0,0.4);
          display: flex;
          padding: 4px;
          gap: 2px;
          z-index: 50;
          animation: slideDown 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes slideDown {
          from { transform: translate(-50%, -10px); opacity: 0; }
          to { transform: translate(-50%, 0); opacity: 1; }
        }

        .inline-action-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          background: transparent;
          border: none;
          color: var(--text-muted);
          font-size: 11px;
          font-weight: 600;
          padding: 4px 10px;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .inline-action-btn:hover {
          background: var(--bg-4);
          color: var(--text-primary);
        }
      `}</style>
    </div>
  );
}

function WelcomeScreen() {
  return (
    <div className="welcome">
      <div className="welcome-content">
        <div className="welcome-logo" style={{ color: "var(--accent)" }}>
          <Plane size={72} strokeWidth={1} />
        </div>
        {/* AntiNetwork branding watermark */}
        <h1 className="welcome-title">AntiNetwork</h1>
        <p className="welcome-sub">AI-powered · Offline · Blazing fast</p>

        <div className="welcome-shortcuts">
          <div className="shortcut-row">
            <kbd>Ctrl+P</kbd>
            <span>Quick open file</span>
          </div>
          <div className="shortcut-row">
            <kbd>Ctrl+Shift+P</kbd>
            <span>Command palette</span>
          </div>
          <div className="shortcut-row">
            <kbd>Ctrl+`</kbd>
            <span>Toggle terminal</span>
          </div>
          <div className="shortcut-row">
            <kbd>Ctrl+S</kbd>
            <span>Save file</span>
          </div>
        </div>

        <p className="welcome-hint">
          <FolderOpen size={14} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />
          Open a folder from the Explorer sidebar to get started
        </p>
      </div>

      <style>{`
        .welcome {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--bg-2);
          height: 100%;
        }

        .welcome-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: var(--space-3);
          animation: fadeUp 0.5s ease both;
        }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .welcome-logo {
          filter: drop-shadow(0 0 32px var(--accent-glow));
          margin-bottom: var(--space-2);
        }

        .welcome-title {
          font-size: 2rem;
          font-weight: 700;
          background: linear-gradient(135deg, var(--text-primary), var(--accent));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          letter-spacing: -0.03em;
        }

        .welcome-sub {
          color: var(--text-muted);
          font-size: var(--text-sm);
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .welcome-shortcuts {
          margin-top: var(--space-4);
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
          background: var(--bg-3);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          padding: var(--space-4);
          min-width: 280px;
        }

        .shortcut-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--space-4);
          font-size: var(--text-sm);
          color: var(--text-muted);
        }

        kbd {
          background: var(--bg-4);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          padding: 2px 8px;
          font-family: var(--font-mono);
          font-size: var(--text-xs);
          color: var(--text-secondary);
          white-space: nowrap;
        }

        .welcome-hint {
          margin-top: var(--space-2);
          color: var(--text-muted);
          font-size: var(--text-sm);
          text-align: center;
        }
      `}</style>
    </div>
  );
}
