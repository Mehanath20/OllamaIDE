import { useState } from "react";
import { Puzzle, Search, Download, Check, Trash2 } from "lucide-react";

interface Extension {
  id: string;
  name: string;
  publisher: string;
  description: string;
  icon: string;
  installed: boolean;
}

const MOCK_EXTENSIONS: Extension[] = [
  { id: "esbenp.prettier-vscode", name: "Prettier - Code formatter", publisher: "Prettier", description: "Code formatter using prettier", icon: "✨", installed: true },
  { id: "dbaeumer.vscode-eslint", name: "ESLint", publisher: "Microsoft", description: "Integrates ESLint JavaScript into the IDE", icon: "⚡", installed: false },
  { id: "ms-python.python", name: "Python", publisher: "Microsoft", description: "IntelliSense (Pylance), Linting, Debugging", icon: "🐍", installed: false },
  { id: "ms-vscode.cpptools", name: "C/C++", publisher: "Microsoft", description: "C/C++ IntelliSense, debugging, and code navigation.", icon: "⚙️", installed: false },
  { id: "dsznajder.es7-react-js-snippets", name: "ES7+ React/Redux", publisher: "dsznajder", description: "Extensions for React, React-Native and Redux", icon: "⚛️", installed: true },
];

export default function ExtensionsPanel() {
  const [query, setQuery] = useState("");
  const [extensions, setExtensions] = useState<Extension[]>(MOCK_EXTENSIONS);

  const toggleInstall = (id: string) => {
    setExtensions(extensions.map(ext => ext.id === id ? { ...ext, installed: !ext.installed } : ext));
  };

  const filtered = extensions.filter(ext => ext.name.toLowerCase().includes(query.toLowerCase()) || ext.description.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="extensions-panel">
      <div className="panel-header">EXTENSIONS</div>
      
      <div className="ext-search-container">
        <div className="ext-search-box">
          <Search size={14} className="ext-search-icon" />
          <input
            type="text"
            className="ext-search-input"
            placeholder="Search Extensions in Marketplace"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="ext-list">
        {filtered.length === 0 ? (
          <div className="ext-empty">No extensions found.</div>
        ) : (
          filtered.map((ext) => (
            <div key={ext.id} className="ext-item">
              <div className="ext-icon-box">{ext.icon}</div>
              <div className="ext-info">
                <div className="ext-name">{ext.name}</div>
                <div className="ext-desc truncate" title={ext.description}>{ext.description}</div>
                <div className="ext-meta">
                  <span className="ext-publisher">{ext.publisher}</span>
                  {ext.installed ? (
                    <button className="ext-btn installed" onClick={() => toggleInstall(ext.id)}>
                      <Check size={10} /> Installed
                      <span className="uninstall-overlay">
                        <Trash2 size={10} /> Uninstall
                      </span>
                    </button>
                  ) : (
                    <button className="ext-btn" onClick={() => toggleInstall(ext.id)}>
                      <Download size={10} /> Install
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <style>{`
        .extensions-panel {
          display: flex;
          flex-direction: column;
          height: 100%;
        }
        .panel-header {
          font-size: var(--text-xs);
          font-weight: 700;
          color: var(--text-muted);
          letter-spacing: 0.1em;
          padding: var(--space-3) var(--space-4);
          text-transform: uppercase;
        }
        .ext-search-container {
          padding: 0 var(--space-3) var(--space-3) var(--space-3);
          border-bottom: 1px solid var(--border-soft);
        }
        .ext-search-box {
          position: relative;
          display: flex;
          align-items: center;
        }
        .ext-search-icon {
          position: absolute;
          left: 8px;
          color: var(--text-muted);
        }
        .ext-search-input {
          width: 100%;
          background: var(--bg-2);
          border: 1px solid var(--border);
          color: var(--text-primary);
          padding: 6px 8px 6px 28px;
          border-radius: var(--radius-sm);
          font-size: var(--text-xs);
          outline: none;
        }
        .ext-search-input:focus {
          border-color: var(--accent);
        }
        
        .ext-list {
          flex: 1;
          overflow-y: auto;
        }
        .ext-empty {
          padding: var(--space-4);
          text-align: center;
          color: var(--text-muted);
          font-size: var(--text-xs);
        }
        .ext-item {
          display: flex;
          gap: 12px;
          padding: var(--space-3);
          border-bottom: 1px solid rgba(255,255,255,0.02);
        }
        .ext-item:hover {
          background: var(--bg-2);
        }
        .ext-icon-box {
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--bg-3);
          border-radius: var(--radius-sm);
          font-size: 20px;
          flex-shrink: 0;
        }
        .ext-info {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .ext-name {
          font-size: 11px;
          font-weight: 600;
          color: var(--text-primary);
        }
        .ext-desc {
          font-size: 10px;
          color: var(--text-muted);
        }
        .ext-meta {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-top: 4px;
        }
        .ext-publisher {
          font-size: 9px;
          color: var(--text-muted);
          opacity: 0.7;
        }
        .ext-btn {
          display: flex;
          align-items: center;
          gap: 4px;
          background: var(--accent);
          color: black;
          border: none;
          padding: 3px 6px;
          border-radius: 3px;
          font-size: 9px;
          font-weight: 600;
          cursor: pointer;
          position: relative;
          overflow: hidden;
        }
        .ext-btn:hover { opacity: 0.9; }
        .ext-btn.installed {
          background: transparent;
          color: var(--text-primary);
          border: 1px solid var(--border);
        }
        .ext-btn.installed .uninstall-overlay {
          position: absolute;
          inset: 0;
          background: var(--error);
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
          opacity: 0;
          transition: opacity 100ms;
        }
        .ext-btn.installed:hover .uninstall-overlay {
          opacity: 1;
        }
      `}</style>
    </div>
  );
}
