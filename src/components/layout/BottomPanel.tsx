/* ============================================================
   BottomPanel.tsx — VS Code-grade bottom panel
   Tabs: Terminal | Output | Problems | Debug Console
   Terminal sub-tabs: one per PTY session + profile picker + (+) new
   ============================================================ */
import { useState, useRef, useEffect, useCallback, MouseEvent as ReactMouseEvent } from "react";
import {
  TerminalIcon,
  AlertCircle,
  Bug,
  List,
  Plus,
  X,
  ChevronDown,
  ChevronUp,
  Pencil,
  LucideIcon,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import {
  useTerminalStore,
  SHELL_PROFILES,
  ShellProfile,
} from "../../store/terminalStore";
import { useFileStore } from "../../store/fileStore";
import { useUIStore } from "../../store/uiStore";
import XtermTerminal from "../terminal/XtermTerminal";

// ─── Panel tab types ─────────────────────────────────────────────────────────
type PanelTab = "terminal" | "output" | "problems" | "debug";

const PANEL_TABS: { id: PanelTab; label: string; Icon: LucideIcon }[] = [
  { id: "terminal", label: "Terminal", Icon: TerminalIcon },
  { id: "output",   label: "Output",   Icon: List },
  { id: "problems", label: "Problems", Icon: AlertCircle },
  { id: "debug",    label: "Debug Console", Icon: Bug },
];

export default function BottomPanel() {
  const [panelTab, setPanelTab] = useState<PanelTab>("terminal");
  const [profileOpen, setProfileOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const profileRef = useRef<HTMLDivElement>(null);
  const { setBottomPanelOpen } = useUIStore();

  const {
    sessions,
    activeId,
    defaultProfile,
    addSession,
    removeSession,
    setActiveId,
    renameSession,
    setDefaultProfile,
  } = useTerminalStore();

  const { workspaceRoot } = useFileStore();

  // Close profile dropdown on outside click
  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  // ── Create new terminal session ────────────────────────────
  const newTerminal = useCallback(
    async (profile?: ShellProfile) => {
      const p = profile ?? defaultProfile;
      const cwd = workspaceRoot ?? (window.navigator.platform.startsWith("Win") ? "C:\\" : "/");
      try {
        const id = await invoke<string>("create_terminal", {
          shellPath: p.shell || null,
          cwd,
        });
        addSession({
          id,
          title: p.label,
          shell: p.shell,
          cwd,
        });
      } catch (err) {
        console.error("Failed to create terminal:", err);
      }
    },
    [defaultProfile, workspaceRoot, addSession]
  );

  // Auto-create first terminal when panel opens
  useEffect(() => {
    if (sessions.length === 0) {
      newTerminal();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Kill a terminal session ────────────────────────────────
  const killSession = async (id: string, e: ReactMouseEvent) => {
    e.stopPropagation();
    try {
      await invoke("kill_terminal", { sessionId: id });
    } catch {}
    removeSession(id);
  };

  // ── Rename ─────────────────────────────────────────────────
  const startRename = (id: string, currentTitle: string, e: ReactMouseEvent) => {
    e.stopPropagation();
    setRenamingId(id);
    setRenameValue(currentTitle);
  };

  const commitRename = (id: string) => {
    if (renameValue.trim()) renameSession(id, renameValue.trim());
    setRenamingId(null);
  };

  return (
    <div className="bottom-panel">
      {/* ── Top bar: panel tabs + terminal controls ─────────── */}
      <div className="bottom-bar">
        {/* Panel type tabs */}
        <div className="panel-type-tabs">
          {PANEL_TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              className={`panel-type-tab ${panelTab === id ? "panel-type-tab--active" : ""}`}
              onClick={() => setPanelTab(id)}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>

        {/* Terminal session tabs (only visible on terminal tab) */}
        {panelTab === "terminal" && (
          <div className="session-tabs-row">
            {sessions.map((s) => (
              <div
                key={s.id}
                className={`session-tab ${activeId === s.id ? "session-tab--active" : ""} ${s.isDead ? "session-tab--dead" : ""}`}
                onClick={() => setActiveId(s.id)}
              >
                {renamingId === s.id ? (
                  <input
                    className="session-tab-rename"
                    value={renameValue}
                    autoFocus
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => commitRename(s.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename(s.id);
                      if (e.key === "Escape") setRenamingId(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <>
                    <span className="session-tab-title">{s.title}</span>
                    <span
                      className="session-tab-rename-btn"
                      title="Rename"
                      onClick={(e) => startRename(s.id, s.title, e)}
                    >
                      <Pencil size={10} />
                    </span>
                    <span
                      className="session-tab-kill"
                      title="Kill terminal"
                      onClick={(e) => killSession(s.id, e)}
                    >
                      <X size={11} />
                    </span>
                  </>
                )}
              </div>
            ))}

            {/* Profile picker + new terminal */}
            <div className="session-new-group" ref={profileRef}>
              <button
                className="session-new-btn"
                title="New Terminal"
                onClick={() => newTerminal()}
              >
                <Plus size={13} />
              </button>
              <button
                className="session-profile-btn"
                title="Select shell profile"
                onClick={() => setProfileOpen((v) => !v)}
              >
                {profileOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              </button>

              {profileOpen && (
                <div className="profile-dropdown">
                  <div className="profile-dropdown-header">Select shell profile</div>
                  {SHELL_PROFILES.map((p) => (
                    <button
                      key={p.shell}
                      className={`profile-item ${defaultProfile.shell === p.shell ? "profile-item--active" : ""}`}
                      onClick={() => {
                        setDefaultProfile(p);
                        setProfileOpen(false);
                        newTerminal(p);
                      }}
                    >
                      <span className="profile-item-label">{p.label}</span>
                      {p.shell && (
                        <span className="profile-item-shell">{p.shell}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Close panel button */}
        <button
          className="panel-close-btn"
          title="Close Panel"
          onClick={() => setBottomPanelOpen(false)}
        >
          <X size={14} />
        </button>
      </div>

      {/* ── Content area ────────────────────────────────────── */}
      <div className="bottom-content">
        {/* Terminal instances */}
        {panelTab === "terminal" && (
          <div className="terminal-pane">
            {sessions.length === 0 ? (
              <div className="panel-empty-msg">
                <TerminalIcon size={28} />
                <span>No active terminal sessions</span>
                <button className="btn-primary" onClick={() => newTerminal()}>
                  <Plus size={14} /> New Terminal
                </button>
              </div>
            ) : (
              sessions.map((s) => (
                <XtermTerminal
                  key={s.id}
                  sessionId={s.id}
                  isActive={activeId === s.id}
                />
              ))
            )}
          </div>
        )}

        {/* Output tab */}
        {panelTab === "output" && (
          <div className="panel-placeholder-content">
            <div className="panel-output-header">
              <span>Build Output</span>
            </div>
            <div className="panel-output-body">
              <div className="output-line output-line--muted">
                Run <kbd>npm run build</kbd> or <kbd>cargo build</kbd> to see output here.
              </div>
            </div>
          </div>
        )}

        {/* Problems tab */}
        {panelTab === "problems" && (
          <div className="panel-placeholder-content">
            <div className="panel-output-header">
              <span>Problems</span>
              <span className="problems-count">0 errors · 0 warnings</span>
            </div>
            <div className="panel-output-body">
              <div className="output-line output-line--muted">
                No problems have been detected. Language server integration coming in Phase 4.
              </div>
            </div>
          </div>
        )}

        {/* Debug Console tab */}
        {panelTab === "debug" && (
          <div className="panel-placeholder-content">
            <div className="panel-output-header">
              <span>Debug Console</span>
            </div>
            <div className="panel-output-body">
              <div className="output-line output-line--muted">
                Debug adapter integration coming in Phase 4.
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Styles ──────────────────────────────────────────── */}
      <style>{`
        .bottom-panel {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: var(--terminal);
          border-top: 1px solid var(--border-soft);
          overflow: hidden;
        }

        /* ─── Top bar ─── */
        .bottom-bar {
          display: flex;
          align-items: stretch;
          background: var(--bg-2);
          border-bottom: 1px solid var(--border-soft);
          height: 35px;
          flex-shrink: 0;
          overflow: hidden;
        }

        .panel-type-tabs {
          display: flex;
          align-items: stretch;
          border-right: 1px solid var(--border-soft);
        }

        .panel-type-tab {
          display: flex;
          align-items: center;
          gap: 5px;
          background: transparent;
          border: none;
          border-bottom: 2px solid transparent;
          color: var(--text-muted);
          font-size: var(--text-xs);
          font-family: var(--font-ui);
          font-weight: 500;
          padding: 0 14px;
          cursor: pointer;
          letter-spacing: 0.02em;
          white-space: nowrap;
          transition: color var(--trans-fast), border-color var(--trans-fast);
        }
        .panel-type-tab:hover { color: var(--text-secondary); }
        .panel-type-tab--active {
          color: var(--text-primary);
          border-bottom-color: var(--accent);
        }

        /* ─── Session tabs ─── */
        .session-tabs-row {
          display: flex;
          align-items: center;
          gap: 2px;
          flex: 1;
          padding: 0 6px;
          overflow-x: auto;
          scrollbar-width: none;
        }
        .session-tabs-row::-webkit-scrollbar { display: none; }

        .session-tab {
          display: flex;
          align-items: center;
          gap: 4px;
          background: var(--bg-3);
          border: 1px solid var(--border-soft);
          border-radius: var(--radius-sm);
          color: var(--text-muted);
          font-size: var(--text-xs);
          font-family: var(--font-ui);
          padding: 2px 8px;
          cursor: pointer;
          white-space: nowrap;
          transition: all var(--trans-fast);
          max-width: 160px;
          position: relative;
        }
        .session-tab:hover { background: var(--bg-4); color: var(--text-secondary); }
        .session-tab--active {
          background: var(--bg-4);
          border-color: var(--accent);
          color: var(--text-primary);
        }
        .session-tab--dead { opacity: 0.5; }
        .session-tab--dead .session-tab-title::after {
          content: " (exited)";
          color: var(--text-muted);
        }

        .session-tab-title {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          max-width: 90px;
        }

        .session-tab-rename-btn,
        .session-tab-kill {
          display: none;
          align-items: center;
          justify-content: center;
          color: var(--text-muted);
          background: transparent;
          border: none;
          cursor: pointer;
          padding: 1px;
          border-radius: 2px;
          line-height: 1;
          transition: color var(--trans-fast), background var(--trans-fast);
        }
        .session-tab:hover .session-tab-rename-btn,
        .session-tab:hover .session-tab-kill {
          display: flex;
        }
        .session-tab-kill:hover { color: var(--error); background: rgba(239,68,68,0.1); }
        .session-tab-rename-btn:hover { color: var(--text-primary); }

        .session-tab-rename {
          background: var(--bg-2);
          border: 1px solid var(--accent);
          color: var(--text-primary);
          font-size: var(--text-xs);
          font-family: var(--font-ui);
          padding: 0 4px;
          border-radius: 2px;
          outline: none;
          max-width: 120px;
        }

        /* ─── New terminal group ─── */
        .session-new-group {
          display: flex;
          align-items: center;
          position: relative;
          margin-left: 4px;
        }
        .session-new-btn,
        .session-profile-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          padding: 4px;
          border-radius: var(--radius-sm);
          transition: color var(--trans-fast), background var(--trans-fast);
        }
        .session-new-btn:hover,
        .session-profile-btn:hover {
          color: var(--text-primary);
          background: var(--bg-4);
        }

        /* Profile dropdown */
        .profile-dropdown {
          position: absolute;
          bottom: calc(100% + 4px);
          left: 0;
          background: var(--bg-3);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          box-shadow: 0 8px 32px rgba(0,0,0,0.5);
          min-width: 220px;
          z-index: 5000;
          padding: 4px;
          animation: ddFade 80ms ease both;
        }
        @keyframes ddFade { from { opacity:0; transform:translateY(4px); } to { opacity:1; transform:translateY(0); } }

        .profile-dropdown-header {
          font-size: var(--text-xs);
          color: var(--text-muted);
          font-weight: 600;
          letter-spacing: 0.08em;
          padding: 6px 10px 4px;
          text-transform: uppercase;
        }

        .profile-item {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          background: transparent;
          border: none;
          width: 100%;
          padding: 7px 10px;
          cursor: pointer;
          border-radius: var(--radius-sm);
          text-align: left;
          transition: background var(--trans-fast);
        }
        .profile-item:hover { background: var(--bg-4); }
        .profile-item--active { background: rgba(124,58,237,0.12); }
        .profile-item-label {
          color: var(--text-primary);
          font-size: var(--text-sm);
          font-family: var(--font-ui);
        }
        .profile-item-shell {
          color: var(--text-muted);
          font-size: var(--text-xs);
          font-family: var(--font-mono);
          margin-top: 2px;
        }

        /* ─── Close button ─── */
        .panel-close-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          padding: 0 10px;
          transition: color var(--trans-fast);
          margin-left: auto;
        }
        .panel-close-btn:hover { color: var(--text-primary); }

        /* ─── Content area ─── */
        .bottom-content {
          flex: 1;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          min-height: 0;
        }

        .terminal-pane {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          min-height: 0;
        }

        /* ─── Empty state ─── */
        .panel-empty-msg {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: var(--space-3);
          color: var(--text-muted);
          font-size: var(--text-sm);
        }
        .btn-primary {
          display: flex;
          align-items: center;
          gap: 6px;
          background: var(--accent);
          color: white;
          border: none;
          border-radius: var(--radius-md);
          padding: 8px 16px;
          font-size: var(--text-sm);
          font-family: var(--font-ui);
          cursor: pointer;
          margin-top: 8px;
          transition: opacity var(--trans-fast);
        }
        .btn-primary:hover { opacity: 0.85; }

        /* ─── Output / Problems / Debug content ─── */
        .panel-placeholder-content {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .panel-output-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 6px 14px;
          border-bottom: 1px solid var(--border-soft);
          font-size: var(--text-xs);
          color: var(--text-secondary);
          font-weight: 600;
          letter-spacing: 0.05em;
          background: var(--bg-2);
          flex-shrink: 0;
        }
        .problems-count {
          font-weight: 400;
          color: var(--text-muted);
        }
        .panel-output-body {
          flex: 1;
          overflow-y: auto;
          padding: 12px 14px;
          font-family: var(--font-mono);
          font-size: var(--text-sm);
        }
        .output-line { line-height: 1.8; }
        .output-line--muted { color: var(--text-muted); }
        .output-line kbd {
          background: var(--bg-4);
          border: 1px solid var(--border);
          border-radius: 3px;
          padding: 1px 5px;
          font-size: 0.9em;
        }
      `}</style>
    </div>
  );
}
