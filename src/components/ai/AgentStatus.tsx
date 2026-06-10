/* ============================================================
   AgentStatus.tsx — AI Agent Dashboard.
   Renders checklist steps, console logs, running status indicators,
   and interactive prompts for command execution permissions.
   ============================================================ */
import { Square, ShieldAlert, Check, X } from "lucide-react";
import { useAIStore } from "../../store/aiStore";

export default function AgentStatus() {
  const {
    agentStatus,
    agentSteps,
    agentLogs,
    pendingCommand,
    commandPermissionResolve,
    clearAgentState,
  } = useAIStore();

  const isIdle = agentStatus === "idle";

  const handleCommandAccept = () => {
    if (commandPermissionResolve) {
      commandPermissionResolve(true);
    }
  };

  const handleCommandReject = () => {
    if (commandPermissionResolve) {
      commandPermissionResolve(false);
    }
  };

  if (isIdle && agentSteps.length === 0 && agentLogs.length === 0) {
    return null;
  }

  return (
    <div className="agent-status-panel">
      {/* Running status bar */}
      <div className="agent-header">
        <div className="agent-title-row">
          <span className="agent-indicator-pulse" data-status={agentStatus} />
          <span className="agent-header-title">
            Agent Status: <strong style={{ textTransform: "capitalize" }}>{agentStatus}</strong>
          </span>
        </div>
        {!isIdle && (
          <button className="btn-stop-agent" onClick={clearAgentState} title="Stop Agent execution">
            <Square size={12} fill="var(--red)" stroke="var(--red)" />
            <span>Stop</span>
          </button>
        )}
      </div>

      {/* Plan checklist */}
      {agentSteps.length > 0 && (
        <div className="agent-steps-container">
          <div className="agent-section-title">CHECKLIST</div>
          <div className="agent-steps-list">
            {agentSteps.map((step) => (
              <div key={step.id} className="agent-step-item" data-status={step.status}>
                <span className="step-checkbox">
                  {step.status === "completed" ? "✓" : step.status === "running" ? "●" : "○"}
                </span>
                <span className="step-text">{step.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Interactive Command Permission prompt */}
      {pendingCommand && (
        <div className="command-permission-alert">
          <div className="alert-header-row">
            <ShieldAlert size={16} className="alert-icon" />
            <span>Execute Terminal Command?</span>
          </div>
          <pre className="command-preview">
            <code>{pendingCommand}</code>
          </pre>
          <div className="alert-actions-row">
            <button className="btn-alert-action btn-alert-action--reject" onClick={handleCommandReject}>
              <X size={12} /> Reject
            </button>
            <button className="btn-alert-action btn-alert-action--accept" onClick={handleCommandAccept}>
              <Check size={12} /> Run Command
            </button>
          </div>
        </div>
      )}

      {/* Logs / Console output */}
      {agentLogs.length > 0 && (
        <div className="agent-logs-container">
          <div className="agent-section-title">AGENT ACTIVITY LOG</div>
          <div className="agent-logs-console">
            {agentLogs.map((log, index) => (
              <div key={index} className="log-line">
                <span className="log-timestamp">&gt;</span> {log}
              </div>
            ))}
          </div>
        </div>
      )}

      <style>{`
        .agent-status-panel {
          background: #111317;
          border: 1px solid var(--border-soft);
          border-radius: 6px;
          padding: var(--space-3);
          margin-bottom: var(--space-4);
          display: flex;
          flex-direction: column;
          gap: var(--space-3);
        }

        .agent-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .agent-title-row {
          display: flex;
          align-items: center;
          gap: var(--space-2);
        }

        .agent-indicator-pulse {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--text-muted);
        }

        .agent-indicator-pulse[data-status="thinking"] {
          background: var(--yellow);
          box-shadow: 0 0 8px var(--yellow);
          animation: pulse 1.5s infinite;
        }

        .agent-indicator-pulse[data-status="reading"],
        .agent-indicator-pulse[data-status="generating"] {
          background: var(--accent);
          box-shadow: 0 0 8px var(--accent);
          animation: pulse 1.5s infinite;
        }

        .agent-indicator-pulse[data-status="executing"] {
          background: var(--green);
          box-shadow: 0 0 8px var(--green);
          animation: pulse 1.5s infinite;
        }

        @keyframes pulse {
          0% { transform: scale(0.95); opacity: 0.5; }
          50% { transform: scale(1.05); opacity: 1; }
          100% { transform: scale(0.95); opacity: 0.5; }
        }

        .agent-header-title {
          font-size: var(--text-xs);
          color: var(--text-primary);
        }

        .btn-stop-agent {
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.2);
          color: var(--red);
          font-size: 10px;
          font-weight: 700;
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 2px 6px;
          border-radius: 4px;
          cursor: pointer;
        }

        .btn-stop-agent:hover {
          background: var(--red);
          color: white;
        }

        .agent-section-title {
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 0.1em;
          color: var(--text-muted);
          margin-bottom: var(--space-2);
        }

        .agent-steps-list {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .agent-step-item {
          display: flex;
          align-items: flex-start;
          gap: var(--space-2);
          font-size: var(--text-xs);
          color: var(--text-muted);
        }

        .agent-step-item[data-status="completed"] {
          color: var(--green);
          text-decoration: line-through;
        }

        .agent-step-item[data-status="running"] {
          color: var(--yellow);
          font-weight: 600;
        }

        .step-checkbox {
          font-family: monospace;
          font-weight: bold;
          flex-shrink: 0;
        }

        .command-permission-alert {
          background: rgba(245, 158, 11, 0.1);
          border: 1px solid rgba(245, 158, 11, 0.3);
          border-radius: 6px;
          padding: var(--space-3);
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }

        .alert-header-row {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          font-size: var(--text-xs);
          font-weight: 700;
          color: var(--yellow);
        }

        .alert-icon {
          color: var(--yellow);
        }

        .command-preview {
          margin: 0;
          background: rgba(0,0,0,0.3);
          padding: var(--space-2);
          border-radius: 4px;
          overflow-x: auto;
          font-family: var(--font-mono);
          font-size: var(--text-xs);
          color: var(--text-primary);
        }

        .alert-actions-row {
          display: flex;
          justify-content: flex-end;
          gap: var(--space-2);
        }

        .btn-alert-action {
          border: none;
          padding: var(--space-1) var(--space-3);
          border-radius: 4px;
          font-size: 10px;
          font-weight: 700;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .btn-alert-action--accept {
          background: var(--yellow);
          color: black;
        }
        .btn-alert-action--accept:hover {
          background: #d97706;
        }

        .btn-alert-action--reject {
          background: var(--bg-2);
          color: var(--text-primary);
          border: 1px solid var(--border-soft);
        }

        .agent-logs-console {
          max-height: 120px;
          overflow-y: auto;
          background: rgba(0,0,0,0.25);
          border-radius: 4px;
          padding: var(--space-2);
          font-family: var(--font-mono);
          font-size: 10px;
          color: #a78bfa;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .log-line {
          word-break: break-all;
        }

        .log-timestamp {
          color: var(--text-muted);
        }
      `}</style>
    </div>
  );
}
