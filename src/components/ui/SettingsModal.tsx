import { X, Monitor, Cpu, Paintbrush, FileCode } from "lucide-react";
import { useUIStore } from "../../store/uiStore";

export default function SettingsModal() {
  const { settingsOpen, setSettingsOpen } = useUIStore();

  if (!settingsOpen) return null;

  return (
    <div className="settings-overlay" onClick={() => setSettingsOpen(false)}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <div className="settings-title">
            <Monitor size={18} /> Settings
          </div>
          <button className="settings-close" onClick={() => setSettingsOpen(false)}>
            <X size={18} />
          </button>
        </div>

        <div className="settings-body">
          {/* AI Settings */}
          <div className="settings-section">
            <h3 className="settings-section-title">
              <Cpu size={14} /> AI Configuration
            </h3>
            <div className="settings-group">
              <label className="settings-label">Default Model</label>
              <select className="settings-select" defaultValue="qwen2.5:7b">
                <option value="qwen2.5:7b">Qwen 2.5 (7B)</option>
                <option value="llama3:8b">Llama 3 (8B)</option>
                <option value="phi3:mini">Phi 3 Mini</option>
              </select>
            </div>
            <div className="settings-group">
              <label className="settings-label">Inference Mode</label>
              <select className="settings-select" defaultValue="local">
                <option value="local">Local (Ollama)</option>
                <option value="cloud">Cloud (OpenAI API)</option>
              </select>
            </div>
          </div>

          {/* Theme Settings */}
          <div className="settings-section">
            <h3 className="settings-section-title">
              <Paintbrush size={14} /> Appearance
            </h3>
            <div className="settings-group">
              <label className="settings-label">Theme</label>
              <select className="settings-select" defaultValue="dark">
                <option value="dark">Dark (Default)</option>
                <option value="light">Light</option>
                <option value="monokai">Monokai</option>
              </select>
            </div>
          </div>

          {/* Editor Settings */}
          <div className="settings-section">
            <h3 className="settings-section-title">
              <FileCode size={14} /> Editor
            </h3>
            <div className="settings-group">
              <label className="settings-label">Font Size</label>
              <input type="number" className="settings-input" defaultValue={14} />
            </div>
            <div className="settings-group">
              <label className="settings-label">Tab Size</label>
              <input type="number" className="settings-input" defaultValue={2} />
            </div>
            <div className="settings-checkbox-group">
              <input type="checkbox" id="format-save" defaultChecked />
              <label htmlFor="format-save">Format on Save</label>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .settings-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.6);
          z-index: 10000;
          display: flex;
          align-items: center;
          justify-content: center;
          backdrop-filter: blur(4px);
          animation: settingsFade 150ms ease;
        }

        @keyframes settingsFade {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .settings-modal {
          width: 500px;
          max-width: 90vw;
          max-height: 85vh;
          background: var(--bg-1);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          box-shadow: 0 24px 80px rgba(0,0,0,0.5);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          animation: settingsSlide 200ms ease;
        }

        @keyframes settingsSlide {
          from { transform: scale(0.96) translateY(10px); opacity: 0; }
          to { transform: scale(1) translateY(0); opacity: 1; }
        }

        .settings-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--space-4) var(--space-5);
          border-bottom: 1px solid var(--border-soft);
          background: var(--bg-2);
        }

        .settings-title {
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 8px;
          color: var(--text-primary);
        }

        .settings-close {
          background: transparent;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: var(--radius-sm);
          padding: 4px;
        }

        .settings-close:hover {
          background: var(--bg-3);
          color: var(--text-primary);
        }

        .settings-body {
          flex: 1;
          overflow-y: auto;
          padding: var(--space-5);
          display: flex;
          flex-direction: column;
          gap: var(--space-6);
        }

        .settings-section {
          display: flex;
          flex-direction: column;
          gap: var(--space-4);
        }

        .settings-section-title {
          font-size: var(--text-sm);
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          display: flex;
          align-items: center;
          gap: 6px;
          margin-bottom: 4px;
        }

        .settings-group {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .settings-label {
          color: var(--text-primary);
          font-size: var(--text-sm);
        }

        .settings-select, .settings-input {
          background: var(--bg-2);
          border: 1px solid var(--border);
          color: var(--text-primary);
          padding: 6px 12px;
          border-radius: var(--radius-sm);
          font-size: var(--text-sm);
          outline: none;
          width: 200px;
        }

        .settings-select:focus, .settings-input:focus {
          border-color: var(--accent);
        }

        .settings-checkbox-group {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: var(--text-sm);
          color: var(--text-primary);
        }
      `}</style>
    </div>
  );
}
