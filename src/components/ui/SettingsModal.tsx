import { useState, useEffect } from "react";
import { X, Monitor, Cpu, Paintbrush, FileCode, Save } from "lucide-react";
import { useUIStore } from "../../store/uiStore";
import { useAIStore } from "../../store/aiStore";

export default function SettingsModal() {
  const { 
    settingsOpen, 
    setSettingsOpen, 
    theme, 
    setTheme,
    fontSize,
    setFontSize,
    tabSize,
    setTabSize,
    formatOnSave,
    setFormatOnSave
  } = useUIStore() as any;

  const { activeModel, setActiveModel, installedModels } = useAIStore() as any;

  const [localTheme, setLocalTheme] = useState(theme);
  const [localFontSize, setLocalFontSize] = useState(fontSize);
  const [localTabSize, setLocalTabSize] = useState(tabSize);
  const [localFormatOnSave, setLocalFormatOnSave] = useState(formatOnSave);
  const [localActiveModel, setLocalActiveModel] = useState(activeModel);

  useEffect(() => {
    if (settingsOpen) {
      setLocalTheme(theme);
      setLocalFontSize(fontSize);
      setLocalTabSize(tabSize);
      setLocalFormatOnSave(formatOnSave);
      setLocalActiveModel(activeModel);
    }
  }, [settingsOpen, theme, fontSize, tabSize, formatOnSave, activeModel]);

  const handleSave = () => {
    setTheme(localTheme);
    setFontSize(localFontSize);
    setTabSize(localTabSize);
    setFormatOnSave(localFormatOnSave);
    setActiveModel(localActiveModel);
    setSettingsOpen(false);
  };

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
          <div className="settings-section" id="settings-ai">
            <h3 className="settings-section-title">
              <Cpu size={14} /> AI Configuration
            </h3>
            <div className="settings-group">
              <label className="settings-label">Default Model</label>
              <select 
                className="settings-select" 
                value={localActiveModel || ""} 
                onChange={(e) => setLocalActiveModel(e.target.value)}
              >
                {installedModels.map((m: string) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div className="settings-group">
              <label className="settings-label">Inference Mode</label>
              <select className="settings-select" defaultValue="local">
                <option value="local">Local (Ollama)</option>
                <option value="cloud">Cloud (OpenAI API) - Coming soon</option>
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
              <select 
                className="settings-select" 
                value={localTheme}
                onChange={(e) => setLocalTheme(e.target.value)}
              >
                <option value="dark">Dark (Default)</option>
                <option value="light">Light</option>
                <option value="monokai">Monokai</option>
              </select>
            </div>
          </div>

          {/* Editor Settings */}
          <div className="settings-section" id="settings-editor">
            <h3 className="settings-section-title">
              <FileCode size={14} /> Editor
            </h3>
            <div className="settings-group">
              <label className="settings-label">Font Size</label>
              <input 
                type="number" 
                className="settings-input" 
                value={localFontSize} 
                onChange={(e) => setLocalFontSize(parseInt(e.target.value) || 14)}
              />
            </div>
            <div className="settings-group">
              <label className="settings-label">Tab Size</label>
              <input 
                type="number" 
                className="settings-input" 
                value={localTabSize} 
                onChange={(e) => setLocalTabSize(parseInt(e.target.value) || 2)}
              />
            </div>
            <div 
              className="settings-checkbox-group" 
              onClick={() => setLocalFormatOnSave(!localFormatOnSave)}
            >
              <input 
                type="checkbox" 
                id="format-save" 
                checked={localFormatOnSave} 
                readOnly
              />
              <label htmlFor="format-save" onClick={(e) => e.preventDefault()}>Format on Save</label>
            </div>
          </div>
        </div>

        <div className="settings-footer">
          <button className="settings-save-btn" onClick={handleSave}>
            <Save size={14} /> Save Changes
          </button>
        </div>
      </div>

      <style>{`
        .settings-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.4);
          z-index: 10000;
          display: flex;
          align-items: center;
          justify-content: center;
          backdrop-filter: blur(8px);
          animation: settingsFade 200ms ease-out;
        }

        @keyframes settingsFade {
          from { opacity: 0; backdrop-filter: blur(0px); }
          to { opacity: 1; backdrop-filter: blur(8px); }
        }

        .settings-modal {
          width: 540px;
          max-width: 90vw;
          max-height: 85vh;
          background: rgba(15, 18, 25, 0.85);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 16px;
          box-shadow: 0 32px 96px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255,255,255,0.05);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          animation: settingsSlide 300ms cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes settingsSlide {
          from { transform: scale(0.94) translateY(20px); opacity: 0; }
          to { transform: scale(1) translateY(0); opacity: 1; }
        }

        .settings-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 20px 24px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          background: linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0) 100%);
        }
        
        .settings-footer {
          display: flex;
          justify-content: flex-end;
          padding: 16px 24px;
          border-top: 1px solid rgba(255, 255, 255, 0.05);
          background: rgba(0, 0, 0, 0.2);
        }

        .settings-save-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          background: var(--accent);
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 8px;
          font-weight: 600;
          font-size: 13px;
          cursor: pointer;
          transition: background 0.2s, transform 0.1s;
        }

        .settings-save-btn:hover {
          background: #8b5cf6;
        }

        .settings-save-btn:active {
          transform: scale(0.98);
        }

        .settings-title {
          font-weight: 700;
          font-size: 16px;
          display: flex;
          align-items: center;
          gap: 10px;
          color: #ffffff;
          letter-spacing: 0.02em;
        }

        .settings-title svg {
          color: #a78bfa;
        }

        .settings-close {
          background: transparent;
          border: none;
          color: rgba(255, 255, 255, 0.5);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
          padding: 6px;
          transition: all 0.2s;
        }

        .settings-close:hover {
          background: rgba(255, 255, 255, 0.1);
          color: #ffffff;
          transform: rotate(90deg);
        }

        .settings-body {
          flex: 1;
          overflow-y: auto;
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 32px;
        }
        
        .settings-body::-webkit-scrollbar {
          width: 6px;
        }
        .settings-body::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.1);
          border-radius: 10px;
        }

        .settings-section {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .settings-section-title {
          font-size: 12px;
          color: #a78bfa;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          font-weight: 700;
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 4px;
        }

        .settings-group {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.04);
          padding: 12px 16px;
          border-radius: 10px;
          transition: background 0.2s, border-color 0.2s;
        }

        .settings-group:hover {
          background: rgba(255, 255, 255, 0.04);
          border-color: rgba(167, 139, 250, 0.3);
        }

        .settings-label {
          color: #e2e8f0;
          font-size: 14px;
          font-weight: 500;
        }

        .settings-select, .settings-input {
          background: #000000 !important;
          border: 1px solid rgba(255, 255, 255, 0.2);
          color: #ffffff !important;
          padding: 8px 14px;
          border-radius: 8px;
          font-size: 13px;
          outline: none;
          width: 220px;
          transition: all 0.2s;
          box-shadow: inset 0 2px 4px rgba(0,0,0,0.2);
        }

        .settings-select option {
          background: #0f1219;
          color: white;
        }

        .settings-select:hover, .settings-input:hover {
          border-color: rgba(255, 255, 255, 0.4);
        }

        .settings-select:focus, .settings-input:focus {
          border-color: #a78bfa;
          box-shadow: 0 0 0 2px rgba(167, 139, 250, 0.2), inset 0 2px 4px rgba(0,0,0,0.2);
        }

        .settings-checkbox-group {
          display: flex;
          align-items: center;
          gap: 12px;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.04);
          padding: 12px 16px;
          border-radius: 10px;
          font-size: 14px;
          font-weight: 500;
          color: #e2e8f0;
          transition: all 0.2s;
          cursor: pointer;
        }

        .settings-checkbox-group:hover {
          background: rgba(255, 255, 255, 0.04);
          border-color: rgba(167, 139, 250, 0.3);
        }

        .settings-checkbox-group input[type="checkbox"] {
          width: 16px;
          height: 16px;
          accent-color: #000000;
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}
