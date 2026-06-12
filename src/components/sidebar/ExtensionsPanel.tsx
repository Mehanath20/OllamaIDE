import { useState, useEffect, useRef } from "react";
import { Search, Download, Check, Trash2, Loader2, DownloadCloud } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useUIStore } from "../../store/uiStore";

interface Extension {
  id: string;
  name: string;
  publisher: string;
  description: string;
  icon: string;
  installed: boolean;
  installing: boolean;
  downloads: number;
  downloadUrl?: string;
}

export default function ExtensionsPanel() {
  const [query, setQuery] = useState("");
  const [extensions, setExtensions] = useState<Extension[]>([]);
  const [loading, setLoading] = useState(false);
  const { installedExtensions, setInstalledExtensions } = useUIStore() as { installedExtensions: Extension[], setInstalledExtensions: any };
  const [activeTab, setActiveTab] = useState<"marketplace" | "installed">("marketplace");
  const [trustPromptExt, setTrustPromptExt] = useState<Extension | null>(null);
  const [installingSet, setInstallingSet] = useState<Set<string>>(new Set());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const installedSet = new Set(installedExtensions.map((e: Extension) => e.id));

  // Fetch from Open VSX when query changes
  useEffect(() => {
    if (!query.trim()) {
      setExtensions([]);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const jsonStr = await invoke<string>("search_extensions", { query });
        const data = JSON.parse(jsonStr);
        
        const mapped: Extension[] = data.extensions.map((ext: any) => ({
          id: `${ext.namespace}.${ext.name}`,
          name: ext.displayName || ext.name,
          publisher: ext.namespace,
          description: ext.description,
          icon: ext.files?.icon || "📦",
          downloads: ext.downloadCount || 0,
          installed: installedSet.has(`${ext.namespace}.${ext.name}`),
          installing: installingSet.has(`${ext.namespace}.${ext.name}`),
          downloadUrl: ext.files?.download
        }));
        
        setExtensions(mapped);
      } catch (err) {
        console.error("Failed to fetch extensions:", err);
      } finally {
        setLoading(false);
      }
    }, 400);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
    if (num >= 1000) return (num / 1000).toFixed(1) + "K";
    return num.toString();
  };

  const toggleInstall = (ext: Extension) => {
    if (installedSet.has(ext.id)) {
      // Uninstall immediately
      setInstalledExtensions((prev: Extension[]) => prev.filter((e: Extension) => e.id !== ext.id));
      setExtensions(prev => prev.map(e => e.id === ext.id ? { ...e, installed: false } : e));
    } else {
      // Prompt for trust custom modal
      setTrustPromptExt(ext);
    }
  };

  const confirmTrustInstall = async () => {
    if (!trustPromptExt) return;
    const ext = trustPromptExt;
    setTrustPromptExt(null);

    // Show installing state
    const nextInstalling = new Set(installingSet);
    nextInstalling.add(ext.id);
    setInstallingSet(nextInstalling);
    setExtensions(prev => prev.map(e => e.id === ext.id ? { ...e, installing: true } : e));

    try {
      if (ext.downloadUrl) {
        // Actually download the extension
        await invoke("download_extension", { url: ext.downloadUrl, id: ext.id });
      } else {
        // Fallback simulate if no URL available
        await new Promise(r => setTimeout(r, 1500));
      }

      setInstalledExtensions((prev: Extension[]) => [...prev, { ...ext, installed: true, installing: false }]);
      setExtensions(prev => prev.map(e => e.id === ext.id ? { ...e, installing: false, installed: true } : e));
    } catch (err) {
      console.error("Failed to install extension:", err);
      // Optional: show an error notification here
    } finally {
      setInstallingSet((prev: Set<string>) => {
        const s = new Set(prev);
        s.delete(ext.id);
        return s;
      });
    }
  };

  return (
    <div className="extensions-panel">
      <div className="panel-header">EXTENSIONS</div>
      
      <div className="ext-tabs">
        <button 
          className={`ext-tab ${activeTab === 'marketplace' ? 'active' : ''}`}
          onClick={() => setActiveTab('marketplace')}
        >
          Marketplace
        </button>
        <button 
          className={`ext-tab ${activeTab === 'installed' ? 'active' : ''}`}
          onClick={() => setActiveTab('installed')}
        >
          Installed <span className="ext-count">{installedExtensions.length}</span>
        </button>
      </div>

      {activeTab === 'marketplace' && (
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
      )}

      <div className="ext-list">
        {activeTab === 'marketplace' && loading && (
          <div className="ext-loading">
            <Loader2 className="spin" size={20} />
            <p>Searching marketplace...</p>
          </div>
        )}
        
        {activeTab === 'marketplace' && !loading && query && extensions.length === 0 && (
          <div className="ext-empty">No extensions found for "{query}".</div>
        )}

        {activeTab === 'marketplace' && !loading && !query && (
          <div className="ext-empty">
            <DownloadCloud size={32} style={{ opacity: 0.3, marginBottom: '10px' }} />
            <p>Type to search online marketplace</p>
          </div>
        )}

        {activeTab === 'installed' && installedExtensions.length === 0 && (
          <div className="ext-empty">
            <p>No extensions installed</p>
          </div>
        )}

        {activeTab === 'installed' && installedExtensions.length > 0 && (
          <div className="installed-section">
            {installedExtensions.map((ext: Extension) => (
              <div key={ext.id} className="ext-item">
                <div className="ext-icon-box">
                  {ext.icon === "📦" ? "📦" : <img src={ext.icon} alt="icon" onError={(e) => (e.currentTarget.style.display = 'none')} />}
                </div>
                <div className="ext-info">
                  <div className="ext-name-row">
                    <span className="ext-name" title={ext.name}>{ext.name}</span>
                    <span title="Installed"><Check size={12} className="ext-badge-installed" /></span>
                  </div>
                  <div className="ext-desc" title={ext.description}>{ext.description}</div>
                  
                  <div className="ext-meta">
                    <span className="ext-publisher" title={ext.publisher}>{ext.publisher}</span>
                    <span className="ext-downloads"><Download size={10} /> {formatNumber(ext.downloads)}</span>
                  </div>
                  
                  <div className="ext-actions">
                    <button className="ext-btn installed" onClick={() => toggleInstall(ext)}>
                      <Check size={10} /> Installed
                      <span className="uninstall-overlay">
                        <Trash2 size={10} /> Uninstall
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'marketplace' && !loading && query && extensions.map((ext) => (
          <div key={ext.id} className="ext-item">
            <div className="ext-icon-box">
              {ext.icon === "📦" ? "📦" : <img src={ext.icon} alt="icon" onError={(e) => (e.currentTarget.style.display = 'none')} />}
            </div>
            <div className="ext-info">
              <div className="ext-name-row">
                <span className="ext-name" title={ext.name}>{ext.name}</span>
                {ext.installed && <span title="Installed"><Check size={12} className="ext-badge-installed" /></span>}
              </div>
              <div className="ext-desc" title={ext.description}>{ext.description}</div>
              
              <div className="ext-meta">
                <span className="ext-publisher" title={ext.publisher}>{ext.publisher}</span>
                <span className="ext-downloads"><Download size={10} /> {formatNumber(ext.downloads)}</span>
              </div>
              
              <div className="ext-actions">
                {ext.installing ? (
                  <button className="ext-btn installing" disabled>
                    <Loader2 size={10} className="spin" /> Installing...
                  </button>
                ) : ext.installed ? (
                  <button className="ext-btn installed" onClick={() => toggleInstall(ext)}>
                    <Check size={10} /> Installed
                    <span className="uninstall-overlay">
                      <Trash2 size={10} /> Uninstall
                    </span>
                  </button>
                ) : (
                  <button className="ext-btn" onClick={() => toggleInstall(ext)}>
                    <Download size={10} /> Install
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {trustPromptExt && (
        <div className="trust-overlay" onClick={() => setTrustPromptExt(null)}>
          <div className="trust-modal" onClick={(e) => e.stopPropagation()}>
            <div className="trust-icon">⚠️</div>
            <h3>Trust Author?</h3>
            <p>Do you trust the author <strong>{trustPromptExt.publisher}</strong> to execute code on your machine?</p>
            <div className="trust-info">
              <div>Extension: {trustPromptExt.name}</div>
              <div>Downloads: {formatNumber(trustPromptExt.downloads)}</div>
            </div>
            <div className="trust-actions">
              <button className="trust-btn cancel" onClick={() => setTrustPromptExt(null)}>Cancel</button>
              <button className="trust-btn confirm" onClick={confirmTrustInstall}>Install Anyway</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .trust-overlay {
          position: absolute;
          inset: 0;
          background: rgba(0,0,0,0.6);
          backdrop-filter: blur(2px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }
        .trust-modal {
          background: var(--bg-1);
          border: 1px solid rgba(255,255,255,0.1);
          padding: 20px;
          border-radius: 8px;
          width: 85%;
          display: flex;
          flex-direction: column;
          gap: 12px;
          text-align: center;
          box-shadow: 0 10px 30px rgba(0,0,0,0.5);
          animation: popIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes popIn {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        .trust-icon {
          font-size: 24px;
        }
        .trust-modal h3 {
          margin: 0;
          color: white;
          font-size: 14px;
        }
        .trust-modal p {
          margin: 0;
          color: var(--text-secondary);
          font-size: 12px;
          line-height: 1.4;
        }
        .trust-info {
          background: rgba(0,0,0,0.2);
          padding: 8px;
          border-radius: 6px;
          font-size: 11px;
          color: var(--text-muted);
          text-align: left;
        }
        .trust-actions {
          display: flex;
          gap: 8px;
          margin-top: 8px;
        }
        .trust-btn {
          flex: 1;
          padding: 8px;
          border-radius: 4px;
          border: none;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
        }
        .trust-btn.cancel {
          background: rgba(255,255,255,0.1);
          color: white;
        }
        .trust-btn.cancel:hover {
          background: rgba(255,255,255,0.2);
        }
        .trust-btn.confirm {
          background: #a78bfa;
          color: black;
        }
        .trust-btn.confirm:hover {
          background: #8b5cf6;
        }
        .extensions-panel {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: var(--bg-0);
        }
        .panel-header {
          font-size: 10px;
          font-weight: 700;
          color: var(--text-muted);
          letter-spacing: 0.12em;
          padding: 12px 16px;
          text-transform: uppercase;
          background: var(--bg-1);
        }
        .ext-tabs {
          display: flex;
          background: var(--bg-1);
          border-bottom: 1px solid rgba(255,255,255,0.05);
          padding: 0 8px;
        }
        .ext-tab {
          background: transparent;
          border: none;
          color: var(--text-muted);
          padding: 8px 12px;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          border-bottom: 2px solid transparent;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .ext-tab:hover {
          color: var(--text-primary);
        }
        .ext-tab.active {
          color: #a78bfa;
          border-bottom-color: #a78bfa;
        }
        .ext-count {
          background: rgba(255,255,255,0.1);
          color: white;
          padding: 2px 6px;
          border-radius: 10px;
          font-size: 9px;
        }
        .ext-search-container {
          padding: 12px;
          background: var(--bg-1);
          border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        .ext-search-box {
          position: relative;
          display: flex;
          align-items: center;
        }
        .ext-search-icon {
          position: absolute;
          left: 10px;
          color: var(--text-muted);
        }
        .ext-search-input {
          width: 100%;
          background: rgba(0,0,0,0.2);
          border: 1px solid rgba(255,255,255,0.08);
          color: var(--text-primary);
          padding: 8px 10px 8px 30px;
          border-radius: 6px;
          font-size: 12px;
          outline: none;
          transition: all var(--trans-fast);
        }
        .ext-search-input:focus {
          border-color: var(--accent);
          background: rgba(0,0,0,0.4);
          box-shadow: 0 0 0 2px rgba(167, 139, 250, 0.15);
        }
        
        .ext-list {
          flex: 1;
          overflow-y: auto;
          background: var(--bg-1);
        }
        .ext-list::-webkit-scrollbar {
          width: 6px;
        }
        .ext-list::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.1);
          border-radius: 4px;
        }
        .ext-loading, .ext-empty {
          padding: 40px 20px;
          text-align: center;
          color: var(--text-muted);
          font-size: 12px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
        }
        
        .ext-item {
          display: flex;
          gap: 14px;
          padding: 16px 14px;
          border-bottom: 1px solid rgba(255,255,255,0.03);
          transition: background 0.2s;
        }
        .ext-item:hover {
          background: rgba(255,255,255,0.02);
        }
        
        .ext-icon-box {
          width: 44px;
          height: 44px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0,0,0,0.3);
          border: 1px solid rgba(255,255,255,0.05);
          border-radius: 8px;
          font-size: 24px;
          flex-shrink: 0;
          overflow: hidden;
        }
        .ext-icon-box img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        
        .ext-info {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .ext-name-row {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .ext-name {
          font-size: 12px;
          font-weight: 600;
          color: #e2e8f0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ext-badge-installed {
          color: #10b981;
        }
        
        .ext-desc {
          font-size: 11px;
          color: #94a3b8;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          line-height: 1.4;
        }
        
        .ext-meta {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-top: 2px;
          margin-bottom: 6px;
        }
        .ext-publisher {
          font-size: 10px;
          color: #a78bfa;
          opacity: 0.9;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 60%;
        }
        .ext-downloads {
          display: flex;
          align-items: center;
          gap: 3px;
          font-size: 10px;
          color: #64748b;
        }
        
        .ext-actions {
          display: flex;
        }
        
        .ext-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          background: var(--accent);
          color: #ffffff;
          border: none;
          padding: 4px 10px;
          border-radius: 4px;
          font-size: 10px;
          font-weight: 600;
          cursor: pointer;
          position: relative;
          overflow: hidden;
          transition: all 0.2s;
        }
        .ext-btn:hover { 
          opacity: 0.9; 
          transform: translateY(-1px);
        }
        
        .ext-btn.installing {
          background: rgba(167, 139, 250, 0.2);
          color: #a78bfa;
          cursor: default;
          pointer-events: none;
        }
        
        .ext-btn.installed {
          background: rgba(255, 255, 255, 0.05);
          color: var(--text-primary);
          border: 1px solid rgba(255,255,255,0.1);
        }
        
        .ext-btn.installed .uninstall-overlay {
          position: absolute;
          inset: 0;
          background: #ef4444;
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
          opacity: 0;
          transition: opacity 0.2s;
        }
        
        .ext-btn.installed:hover .uninstall-overlay {
          opacity: 1;
        }

        .spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
