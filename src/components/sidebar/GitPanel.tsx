import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { GitBranch, Plus, FilePlus, FileMinus, FileEdit, RefreshCw, Check, Settings, ArrowDown, ArrowUp } from "lucide-react";
import { useFileStore } from "../../store/fileStore";
import { useEditorStore } from "../../store/editorStore";

interface GitFileStatus {
  file: string;
  status: string;
}

export default function GitPanel() {
  const { workspaceRoot } = useFileStore();
  const { openFile } = useEditorStore();
  const [changes, setChanges] = useState<GitFileStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [commitMessage, setCommitMessage] = useState("");
  const [showConfig, setShowConfig] = useState(false);
  const [gitName, setGitName] = useState("");
  const [gitEmail, setGitEmail] = useState("");

  const fetchStatus = async () => {
    if (!workspaceRoot) return;
    setLoading(true);
    setError(null);
    try {
      const res = await invoke<GitFileStatus[]>("git_status", { path: workspaceRoot });
      setChanges(res);
    } catch (err: any) {
      setError("Not a git repository or git not installed.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, [workspaceRoot]);

  const getStatusIcon = (status: string) => {
    if (status.includes("A") || status.includes("?")) return <FilePlus size={14} className="text-green" />;
    if (status.includes("D")) return <FileMinus size={14} className="text-red" />;
    return <FileEdit size={14} className="text-blue" />;
  };

  const handleFileClick = async (file: string) => {
    if (!workspaceRoot) return;
    try {
      const fullPath = `${workspaceRoot}/${file}`;
      const content = await invoke<string>("read_file", { path: fullPath });
      const name = file.split(/[\\/]/).pop() || file;
      const ext = name.split(".").pop() || "";
      openFile({
        path: fullPath,
        name,
        content,
        language: ext === "ts" || ext === "tsx" ? "typescript" : ext === "js" || ext === "jsx" ? "javascript" : ext,
        isDirty: false,
      });
    } catch (err) {
      console.error("Failed to open file:", err);
    }
  };

  const handleConfigSubmit = async () => {
    if (!workspaceRoot || !gitName || !gitEmail) return;
    try {
      await invoke("git_config", { path: workspaceRoot, name: gitName, email: gitEmail });
      setShowConfig(false);
      alert("Git identity configured successfully!");
    } catch (err: any) {
      alert("Failed to configure git: " + err);
    }
  };

  const handlePush = async () => {
    if (!workspaceRoot) return;
    setLoading(true);
    try {
      await invoke("git_push", { path: workspaceRoot });
      alert("Pushed successfully!");
    } catch (err: any) {
      alert("Push failed: " + err);
    } finally {
      setLoading(false);
    }
  };

  const handlePull = async () => {
    if (!workspaceRoot) return;
    setLoading(true);
    try {
      await invoke("git_pull", { path: workspaceRoot });
      alert("Pulled successfully!");
      fetchStatus();
    } catch (err: any) {
      alert("Pull failed: " + err);
    } finally {
      setLoading(false);
    }
  };

  const handleStage = async (file: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!workspaceRoot) return;
    try {
      await invoke("git_add", { path: workspaceRoot, file });
      await fetchStatus();
    } catch (err: any) {
      alert("Failed to stage file: " + err);
    }
  };

  const handleUnstage = async (file: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!workspaceRoot) return;
    try {
      await invoke("git_reset", { path: workspaceRoot, file });
      await fetchStatus();
    } catch (err: any) {
      alert("Failed to unstage file: " + err);
    }
  };

  const handleCommit = async () => {
    if (!workspaceRoot) return;
    if (!commitMessage.trim()) {
      alert("Please enter a commit message");
      return;
    }
    
    // Only commit if there are actually staged files.
    const hasStaged = changes.some(c => c.status[0] !== ' ' && c.status[0] !== '?');
    
    try {
      if (!hasStaged) {
        // Auto-stage all fallback
        await invoke("git_add", { path: workspaceRoot, file: "." });
      }
      await invoke("git_commit", { path: workspaceRoot, message: commitMessage });
      setCommitMessage("");
      await fetchStatus();
    } catch (err: any) {
      if (err.toString().includes("tell me who you are") || err.toString().includes("identity unknown")) {
        setShowConfig(true);
        setError("Please configure your Git identity first.");
      } else {
        alert("Commit failed: " + err);
      }
    }
  };

  const stagedChanges = changes.filter(c => c.status[0] !== ' ' && c.status[0] !== '?');
  const unstagedChanges = changes.filter(c => c.status[1] !== ' ' && c.status !== '  ');

  return (
    <div className="git-panel">
      <div className="panel-header-row">
        <span className="panel-header">SOURCE CONTROL</span>
        <div style={{ display: "flex", gap: "4px" }}>
          <button className="btn-icon" onClick={handlePull} title="Pull" disabled={loading}>
            <ArrowDown size={12} />
          </button>
          <button className="btn-icon" onClick={handlePush} title="Push" disabled={loading}>
            <ArrowUp size={12} />
          </button>
          <button className="btn-icon" onClick={() => setShowConfig(!showConfig)} title="Configure Git">
            <Settings size={12} />
          </button>
          <button className="btn-icon" onClick={fetchStatus} title="Refresh" disabled={loading}>
            <RefreshCw size={12} className={loading ? "spin" : ""} />
          </button>
        </div>
      </div>

      {showConfig && (
        <div className="git-config-box">
          <div style={{ fontSize: "11px", fontWeight: 600, marginBottom: "8px" }}>GitHub Identity Setup</div>
          <input 
            className="commit-input" 
            placeholder="GitHub Username" 
            value={gitName}
            onChange={(e) => setGitName(e.target.value)}
            style={{ marginBottom: "4px" }}
          />
          <input 
            className="commit-input" 
            placeholder="Email address" 
            value={gitEmail}
            onChange={(e) => setGitEmail(e.target.value)}
          />
          <button className="btn-commit" onClick={handleConfigSubmit} style={{ marginTop: "8px" }}>
            Save Configuration
          </button>
        </div>
      )}

      {!workspaceRoot ? (
        <div className="git-empty">Open a folder to see git status</div>
      ) : error ? (
        <div className="git-empty">
          <GitBranch size={32} style={{ opacity: 0.5, marginBottom: 12 }} />
          <div>{error}</div>
        </div>
      ) : (
        <>
          <div className="git-commit-box">
            <textarea 
              className="commit-input" 
              placeholder="Message (Ctrl+Enter to commit)" 
              rows={3}
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && e.ctrlKey) {
                  e.preventDefault();
                  handleCommit();
                }
              }}
            />
            <button className="btn-commit" onClick={handleCommit}>
              <Check size={14} /> Commit
            </button>
          </div>
          
          <div className="git-changes">
            {stagedChanges.length > 0 && (
              <div className="changes-section">
                <div className="changes-header" style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Staged Changes ({stagedChanges.length})</span>
                  <button className="btn-icon stage-btn" onClick={(e) => handleUnstage(".", e)} title="Unstage all changes">
                    <FileMinus size={12} />
                  </button>
                </div>
                <div className="changes-list">
                  {stagedChanges.map((item, i) => (
                    <div key={i} className="git-file-item" onClick={() => handleFileClick(item.file)}>
                      {getStatusIcon(item.status)}
                      <span className="git-file-name truncate">{item.file}</span>
                      <button className="btn-icon stage-btn" onClick={(e) => handleUnstage(item.file, e)} title="Unstage changes">
                        <FileMinus size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            <div className="changes-section">
              <div className="changes-header" style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Changes ({unstagedChanges.length})</span>
                {unstagedChanges.length > 0 && (
                  <button className="btn-icon stage-btn" onClick={(e) => handleStage(".", e)} title="Stage all changes">
                    <Plus size={12} />
                  </button>
                )}
              </div>
              <div className="changes-list">
                {unstagedChanges.length === 0 ? (
                  <div className="git-empty" style={{ padding: "10px", fontSize: "10px" }}>No unstaged changes</div>
                ) : (
                  unstagedChanges.map((item, i) => (
                    <div key={i} className="git-file-item" onClick={() => handleFileClick(item.file)}>
                      {getStatusIcon(item.status)}
                      <span className="git-file-name truncate">{item.file}</span>
                      <button className="btn-icon stage-btn" onClick={(e) => handleStage(item.file, e)} title="Stage changes">
                        <Plus size={12} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </>
      )}

      <style>{`
        .git-panel {
          display: flex;
          flex-direction: column;
          height: 100%;
        }
        .panel-header-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--space-3) var(--space-4);
          border-bottom: 1px solid var(--border-soft);
        }
        .panel-header {
          font-size: var(--text-xs);
          font-weight: 700;
          color: var(--text-muted);
          letter-spacing: 0.1em;
        }
        .btn-icon {
          background: transparent;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2px;
          border-radius: 4px;
        }
        .btn-icon:hover {
          color: var(--text-primary);
          background: var(--bg-3);
        }
        .spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin { 100% { transform: rotate(360deg); } }

        .git-empty {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: var(--space-4);
          text-align: center;
          color: var(--text-muted);
          font-size: var(--text-xs);
        }

        .git-config-box {
          padding: var(--space-3);
          background: rgba(0,0,0,0.2);
          border-bottom: 1px solid var(--border-soft);
          display: flex;
          flex-direction: column;
        }

        .git-commit-box {
          padding: var(--space-3);
          border-bottom: 1px solid var(--border-soft);
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }
        .commit-input {
          width: 100%;
          background: var(--bg-2);
          border: 1px solid var(--border);
          color: var(--text-primary);
          padding: 6px 8px;
          border-radius: var(--radius-sm);
          font-size: var(--text-xs);
          outline: none;
          resize: vertical;
          font-family: var(--font-ui);
        }
        .commit-input:focus {
          border-color: var(--accent);
        }
        .btn-commit {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          background: var(--accent);
          color: black;
          border: none;
          padding: 6px;
          border-radius: var(--radius-sm);
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
        }
        .btn-commit:hover {
          opacity: 0.9;
        }

        .git-changes {
          flex: 1;
          overflow-y: auto;
        }
        .changes-section {
          display: flex;
          flex-direction: column;
        }
        .changes-header {
          display: flex;
          align-items: center;
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          padding: 2px var(--space-3);
          color: var(--text-muted);
          background: rgba(0,0,0,0.2);
        }
        .changes-header:hover .stage-btn {
          opacity: 1;
        }
        .git-file-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 4px var(--space-3);
          cursor: pointer;
          font-size: var(--text-xs);
          color: var(--text-primary);
        }
        .git-file-item:hover {
          background: var(--bg-2);
        }
        .git-file-name {
          flex: 1;
        }
        .stage-btn {
          opacity: 0;
        }
        .git-file-item:hover .stage-btn {
          opacity: 1;
        }
        
        .text-green { color: var(--green, #10b981); }
        .text-red { color: var(--red, #ef4444); }
        .text-blue { color: var(--blue, #3b82f6); }
      `}</style>
    </div>
  );
}
