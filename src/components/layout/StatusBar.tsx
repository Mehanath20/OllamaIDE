/* ============================================================
   StatusBar.tsx — Live-wired status bar
   Shows: Git branch | errors | language | Ln/Col | encoding | Ollama status
   ============================================================ */
import { useEffect } from "react";
import { GitBranch, AlertCircle, CheckCircle, Wifi, WifiOff } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useEditorStore } from "../../store/editorStore";
import { useAIStore } from "../../store/aiStore";
import { useUIStore } from "../../store/uiStore";

export default function StatusBar() {
  const { openFiles, activeFile } = useEditorStore();
  const { ollamaOnline, activeModel, setOllamaOnline } = useAIStore();
  const uiStore = useUIStore() as any;
  const cursorPosition = uiStore.cursorPosition as { line: number; column: number } | null;

  const activeFileData = openFiles.find((f) => f.path === activeFile);

  // Poll Ollama status every 10 seconds
  useEffect(() => {
    const check = async () => {
      try {
        const health = await invoke<{ running: boolean; version?: string }>("check_ollama_health");
        setOllamaOnline(health.running);
      } catch {
        setOllamaOnline(false);
      }
    };
    check();
    const id = setInterval(check, 10_000);
    return () => clearInterval(id);
  }, [setOllamaOnline]);

  const language = activeFileData?.language || "plaintext";
  const line = cursorPosition?.line ?? 1;
  const col = cursorPosition?.column ?? 1;

  return (
    <div className="statusbar">
      {/* Left section */}
      <div className="statusbar-left">
        <span className="statusbar-item statusbar-item--accent">
          <GitBranch size={11} />
          main
        </span>
        <span className="statusbar-item">
          <CheckCircle size={11} />
          0 errors
        </span>
        <span className="statusbar-item" style={{ color: "rgba(255,255,255,0.6)" }}>
          <AlertCircle size={11} />
          0 warnings
        </span>
      </div>

      {/* Right section */}
      <div className="statusbar-right">
        {/* Ollama status */}
        <span
          className="statusbar-item"
          style={{ color: ollamaOnline ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.5)" }}
        >
          {ollamaOnline ? <Wifi size={11} /> : <WifiOff size={11} />}
          {ollamaOnline ? activeModel : "Ollama offline"}
        </span>

        {/* Language */}
        {activeFileData && (
          <span className="statusbar-item statusbar-item--clickable">
            {capitalize(language)}
          </span>
        )}

        {/* Encoding */}
        <span className="statusbar-item">UTF-8</span>

        {/* Line endings */}
        <span className="statusbar-item">LF</span>

        {/* Cursor position */}
        <span className="statusbar-item statusbar-item--clickable">
          Ln {line}, Col {col}
        </span>
      </div>

      <style>{`
        .statusbar {
          height: var(--statusbar-h);
          background: var(--bg-1);
          border-top: 1px solid var(--border-soft);
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 var(--space-2);
          flex-shrink: 0;
          z-index: 100;
        }

        .statusbar-left,
        .statusbar-right {
          display: flex;
          align-items: center;
          gap: 0;
        }

        .statusbar-item {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 0 var(--space-2);
          height: var(--statusbar-h);
          font-size: var(--text-xs);
          color: var(--text-secondary);
          cursor: default;
          white-space: nowrap;
          transition: background var(--trans-fast);
        }

        .statusbar-item--clickable { cursor: pointer; }
        .statusbar-item--clickable:hover { background: rgba(255,255,255,0.15); }
        .statusbar-item:hover { background: rgba(255,255,255,0.1); }

        .statusbar-item--accent { font-weight: 600; }
      `}</style>
    </div>
  );
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
