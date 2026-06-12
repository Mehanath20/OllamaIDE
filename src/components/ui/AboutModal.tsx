import { useUIStore } from "../../store/uiStore";
import { X, CheckCircle } from "lucide-react";

export default function AboutModal() {
  const { aboutOpen, setAboutOpen } = useUIStore();

  if (!aboutOpen) return null;

  return (
    <div className="modal-overlay" onMouseDown={() => setAboutOpen(false)}>
      <div className="modal-content about-modal" onMouseDown={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={() => setAboutOpen(false)}>
          <X size={16} />
        </button>

        <div className="about-header">
          <div className="about-logo">
            <svg width="48" height="48" viewBox="0 0 64 64" fill="none">
              <path d="M20 44 L32 20 L44 44" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M23 38 L41 38" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round" />
            </svg>
          </div>
          <h2>Ollama IDE</h2>
          <p className="version">Version 0.1.0 (Phase 2 Preview)</p>
        </div>

        <div className="about-body">
          <p className="about-desc">
            A powerful, offline-first AI IDE powered by Ollama and Tauri.
            Designed to bring Antigravity's premium developer experience to your local machine.
          </p>

          <div className="about-specs">
            <div className="spec-item">
              <span className="spec-label">Engine:</span>
              <span className="spec-value">Tauri 2.0 (Rust)</span>
            </div>
            <div className="spec-item">
              <span className="spec-label">Frontend:</span>
              <span className="spec-value">React 18 + Vite</span>
            </div>
            <div className="spec-item">
              <span className="spec-label">Editor:</span>
              <span className="spec-value">Monaco (VS Code Core)</span>
            </div>
            <div className="spec-item">
              <span className="spec-label">AI Backend:</span>
              <span className="spec-value">Local Ollama</span>
            </div>
          </div>
        </div>

        <div className="about-footer">
          <div className="status">
            <CheckCircle size={14} className="status-icon" />
            System Healthy
          </div>
          <button className="btn-primary" onClick={() => setAboutOpen(false)}>Close</button>
        </div>
      </div>

      <style>{`
        .modal-overlay {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0,0,0,0.6);
          backdrop-filter: blur(4px);
          z-index: 99999;
          display: flex;
          align-items: center;
          justify-content: center;
          animation: fade-in var(--trans-fast);
        }

        .modal-content.about-modal {
          background: var(--bg-1);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          width: 440px;
          max-width: 90vw;
          box-shadow: 0 20px 40px rgba(0,0,0,0.5);
          position: relative;
          display: flex;
          flex-direction: column;
          animation: slide-up var(--trans-fast);
        }

        .modal-close {
          position: absolute;
          top: 16px;
          right: 16px;
          background: transparent;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          padding: 4px;
          border-radius: var(--radius-sm);
          transition: all var(--trans-fast);
        }

        .modal-close:hover {
          background: rgba(255,255,255,0.1);
          color: var(--text-primary);
        }

        .about-header {
          padding: 32px 32px 16px 32px;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .about-logo {
          width: 72px;
          height: 72px;
          background: rgba(167, 139, 250, 0.1);
          border: 1px solid rgba(167, 139, 250, 0.2);
          border-radius: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 16px;
        }

        .about-header h2 {
          font-size: 24px;
          font-weight: 700;
          color: var(--text-primary);
          margin-bottom: 4px;
        }

        .version {
          font-size: 13px;
          color: var(--text-muted);
          font-family: var(--font-mono);
        }

        .about-body {
          padding: 0 32px 24px 32px;
        }

        .about-desc {
          font-size: 14px;
          color: var(--text-secondary);
          line-height: 1.6;
          text-align: center;
          margin-bottom: 24px;
        }

        .about-specs {
          background: var(--bg-2);
          border: 1px solid var(--border-soft);
          border-radius: var(--radius-md);
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .spec-item {
          display: flex;
          justify-content: space-between;
          font-size: 13px;
        }

        .spec-label {
          color: var(--text-muted);
        }

        .spec-value {
          color: var(--text-primary);
          font-family: var(--font-mono);
        }

        .about-footer {
          padding: 20px 32px;
          border-top: 1px solid var(--border-soft);
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: rgba(0,0,0,0.2);
          border-radius: 0 0 var(--radius-lg) var(--radius-lg);
        }

        .status {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          color: var(--green);
        }

        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes slide-up {
          from { transform: translateY(10px) scale(0.98); opacity: 0; }
          to { transform: translateY(0) scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
