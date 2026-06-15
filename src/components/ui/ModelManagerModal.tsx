import { useState, KeyboardEvent } from "react";
import { X, Search, Download, Cpu, CheckCircle2, Box, Database } from "lucide-react";
import { useUIStore } from "../../store/uiStore";
import { useAIStore } from "../../store/aiStore";
import { pullModel, listModels } from "../../lib/ollama";

const RECOMMENDED_MODELS = [
  // Qwen Coding Series
  { name: "qwen2.5-coder:7b", size: "4.7 GB", params: "7B", desc: "Fast & capable coding assistant. Good for laptops." },
  { name: "qwen2.5-coder:14b", size: "9.0 GB", params: "14B", desc: "Excellent balance of speed and advanced coding logic." },
  { name: "qwen2.5-coder:32b", size: "20.0 GB", params: "32B", desc: "Pro-tier coding model. Requires heavy RAM/VRAM." },
  { name: "qwen2.5-coder:72b", size: "43.0 GB", params: "72B", desc: "Ultimate Qwen coder. Extreme hardware required." },
  // Qwen General Series
  { name: "qwen2.5:14b", size: "9.0 GB", params: "14B", desc: "Alibaba's robust general-purpose instruct model." },
  { name: "qwen2.5:72b", size: "43.0 GB", params: "72B", desc: "Massive general intelligence model." },
  // Llama Series
  { name: "llama3.3:70b", size: "43.0 GB", params: "70B", desc: "Meta's state-of-the-art heavy model." },
  { name: "llama3.1:8b", size: "4.7 GB", params: "8B", desc: "Meta's highly capable versatile model." },
  { name: "llama3.2:3b", size: "2.0 GB", params: "3B", desc: "Meta's lightweight and lightning-fast model." },
  // DeepSeek Series
  { name: "deepseek-coder-v2:16b", size: "8.9 GB", params: "16B", desc: "Powerful mixture-of-experts coding model." },
  { name: "deepseek-coder-v2:236b", size: "133.0 GB", params: "236B", desc: "Ultimate MoE model. Insane hardware needed." },
  // Other Great Models
  { name: "mistral-nemo:latest", size: "7.1 GB", params: "12B", desc: "Mistral & Nvidia's highly capable 12B architecture." },
  { name: "gemma2:27b", size: "16.0 GB", params: "27B", desc: "Google's heavy Gemma 2 model with deep logic." },
  { name: "phi3.5:latest", size: "2.2 GB", params: "3.8B", desc: "Microsoft's tiny but highly performant model." }
];

export default function ModelManagerModal() {
  const { modelLibraryOpen, setModelLibraryOpen } = useUIStore() as any;
  const { 
    installedModels, 
    setInstalledModels,
    activeModel,
    setActiveModel,
    isPulling,
    setIsPulling,
    pullProgress,
    setPullProgress
  } = useAIStore() as any;

  const [searchInput, setSearchInput] = useState("");

  if (!modelLibraryOpen) return null;

  const handlePull = async (modelName: string) => {
    if (!modelName.trim() || isPulling) return;
    
    setIsPulling(true);
    setPullProgress("Requesting pull...");
    
    try {
      await pullModel(modelName.trim(), (p: any) => {
        if (p.completed && p.total) {
          const percent = ((p.completed / p.total) * 100).toFixed(1);
          setPullProgress(`Downloading: ${percent}% (${(p.completed/1e9).toFixed(1)} GB / ${(p.total/1e9).toFixed(1)} GB)`);
        } else {
          setPullProgress(p.status || "Downloading...");
        }
      });
      
      // Refresh models
      const models = await listModels();
      let pulledModel = models.find((m: string) => m === modelName.trim() || m.startsWith(modelName.trim() + ":"));
      if (!pulledModel) {
        pulledModel = modelName.trim() + (modelName.includes(":") ? "" : ":latest");
        models.push(pulledModel);
      }
      setInstalledModels(models);
      setActiveModel(pulledModel);
      
    } catch (err: any) {
      alert(`Failed to pull model: ${err.message || err}`);
    } finally {
      setIsPulling(false);
      setPullProgress("");
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && searchInput.trim() && !isPulling) {
      handlePull(searchInput.trim());
    }
  };

  const isModelInstalled = (modelName: string) => {
    const base = modelName.includes(":") ? modelName : `${modelName}:latest`;
    return installedModels.includes(base) || installedModels.includes(modelName);
  };

  const handleSetModel = (modelName: string) => {
    const base = modelName.includes(":") ? modelName : `${modelName}:latest`;
    const actualModel = installedModels.find((m: string) => m === base || m === modelName);
    if (actualModel) {
      setActiveModel(actualModel);
    }
  };

  return (
    <div className="settings-overlay" onClick={() => setModelLibraryOpen(false)}>
      <div className="model-modal" onClick={(e) => e.stopPropagation()}>
        
        {/* Header */}
        <div className="model-header">
          <div className="model-title">
            <Box size={18} /> Model Library
          </div>
          <button className="model-close" onClick={() => setModelLibraryOpen(false)}>
            <X size={18} />
          </button>
        </div>

        <div className="model-body">
          {/* Global Pull Progress inside modal */}
          {isPulling && (
            <div className="model-pull-progress-banner">
              <div className="pull-icon-wrapper">
                <Download size={16} className="spin-slow" />
              </div>
              <div className="pull-info">
                <span className="pull-text">{pullProgress}</span>
                <div className="pull-bar-bg">
                  <div 
                    className="pull-bar-fill" 
                    style={{ 
                      width: pullProgress.includes('%') 
                        ? `${pullProgress.split('%')[0].split(': ')[1]}%` 
                        : '100%' 
                    }} 
                  />
                </div>
              </div>
            </div>
          )}

          {/* Search Bar for Custom Models */}
          <div className="model-search-section">
            <h3 className="section-title">Pull Custom Model</h3>
            <div className="search-bar-wrapper">
              <Search size={16} className="search-icon" />
              <input 
                type="text" 
                className="search-input"
                placeholder="Enter model tag from ollama.com (e.g. qwen2.5-coder:1.5b)"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isPulling}
              />
              <button 
                className="btn-pull-custom"
                onClick={() => handlePull(searchInput)}
                disabled={!searchInput.trim() || isPulling}
              >
                <Download size={14} /> Pull
              </button>
            </div>
          </div>

          <hr className="model-divider" />

          {/* Recommended Models Grid */}
          <div className="model-list-section">
            <h3 className="section-title">Recommended Models</h3>
            
            <div className="model-grid">
              {RECOMMENDED_MODELS.map((m) => {
                const installed = isModelInstalled(m.name);
                const isActive = activeModel === m.name || activeModel === `${m.name}:latest`;
                
                return (
                  <div key={m.name} className={`model-card ${installed ? 'installed' : ''} ${isActive ? 'active' : ''}`}>
                    <div className="model-card-header">
                      <div className="model-card-title">
                        <Cpu size={16} /> {m.name.split(':')[0]}
                        <span className="model-tag">{m.name.split(':')[1] || 'latest'}</span>
                      </div>
                      {installed ? (
                        <div className="status-badge installed">
                          <CheckCircle2 size={12} /> Local
                        </div>
                      ) : (
                        <div className="status-badge not-installed">Cloud</div>
                      )}
                    </div>
                    
                    <p className="model-desc">{m.desc}</p>
                    
                    <div className="model-meta">
                      <span className="meta-item"><Database size={12} /> {m.params}</span>
                      <span className="meta-item">{m.size}</span>
                    </div>

                    <div className="model-actions">
                      {installed ? (
                        <button 
                          className={`btn-model-action ${isActive ? 'btn-active' : 'btn-select'}`}
                          onClick={() => handleSetModel(m.name)}
                        >
                          {isActive ? "Active Model" : "Select Model"}
                        </button>
                      ) : (
                        <button 
                          className="btn-model-action btn-download"
                          onClick={() => handlePull(m.name)}
                          disabled={isPulling}
                        >
                          <Download size={14} /> Download
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

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

        .model-modal {
          width: 700px;
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

        .model-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 20px 24px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          background: linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0) 100%);
        }

        .model-title {
          font-weight: 700;
          font-size: 16px;
          display: flex;
          align-items: center;
          gap: 10px;
          color: #ffffff;
          letter-spacing: 0.02em;
        }

        .model-title svg {
          color: #a78bfa;
        }

        .model-close {
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

        .model-close:hover {
          background: rgba(255, 255, 255, 0.1);
          color: #ffffff;
          transform: rotate(90deg);
        }

        .model-body {
          flex: 1;
          overflow-y: auto;
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 24px;
        }
        
        .model-body::-webkit-scrollbar { width: 6px; }
        .model-body::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.1);
          border-radius: 10px;
        }

        .model-pull-progress-banner {
          display: flex;
          align-items: center;
          gap: 16px;
          background: rgba(167, 139, 250, 0.1);
          border: 1px solid rgba(167, 139, 250, 0.2);
          border-radius: 12px;
          padding: 16px;
        }

        .pull-icon-wrapper {
          background: rgba(167, 139, 250, 0.2);
          padding: 10px;
          border-radius: 50%;
          color: #a78bfa;
          display: flex;
        }

        .spin-slow {
          animation: spin 2s linear infinite;
        }

        @keyframes spin { to { transform: rotate(360deg); } }

        .pull-info {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .pull-text {
          font-family: monospace;
          font-size: 13px;
          color: #e2e8f0;
          font-weight: 500;
        }

        .pull-bar-bg {
          height: 6px;
          background: rgba(0,0,0,0.5);
          border-radius: 3px;
          overflow: hidden;
        }

        .pull-bar-fill {
          height: 100%;
          background: #a78bfa;
          border-radius: 3px;
          transition: width 0.2s ease-out;
        }

        .section-title {
          font-size: 12px;
          color: rgba(255,255,255,0.5);
          text-transform: uppercase;
          letter-spacing: 0.08em;
          font-weight: 700;
          margin-bottom: 12px;
        }

        .search-bar-wrapper {
          display: flex;
          align-items: center;
          background: rgba(0,0,0,0.4);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          padding: 4px 4px 4px 12px;
          transition: border-color 0.2s;
        }

        .search-bar-wrapper:focus-within {
          border-color: #a78bfa;
        }

        .search-icon {
          color: rgba(255,255,255,0.4);
          margin-right: 8px;
        }

        .search-input {
          flex: 1;
          background: transparent;
          border: none;
          color: #fff;
          font-size: 14px;
          outline: none;
          padding: 8px 0;
        }

        .search-input::placeholder {
          color: rgba(255,255,255,0.3);
        }

        .btn-pull-custom {
          background: #a78bfa;
          color: #fff;
          border: none;
          padding: 8px 16px;
          border-radius: 6px;
          font-weight: 600;
          font-size: 13px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          transition: background 0.2s;
        }

        .btn-pull-custom:hover:not(:disabled) {
          background: #8b5cf6;
        }

        .btn-pull-custom:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .model-divider {
          border: 0;
          height: 1px;
          background: rgba(255,255,255,0.05);
          margin: 0;
        }

        .model-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 16px;
        }

        .model-card {
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 12px;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          transition: transform 0.2s, border-color 0.2s, background 0.2s;
        }

        .model-card:hover {
          transform: translateY(-2px);
          border-color: rgba(167, 139, 250, 0.3);
          background: rgba(255,255,255,0.04);
        }

        .model-card.active {
          border-color: #a78bfa;
          background: rgba(167, 139, 250, 0.05);
        }

        .model-card-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
        }

        .model-card-title {
          font-size: 15px;
          font-weight: 600;
          color: #fff;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .model-tag {
          font-size: 11px;
          background: rgba(255,255,255,0.1);
          padding: 2px 6px;
          border-radius: 4px;
          color: rgba(255,255,255,0.8);
          font-weight: 500;
        }

        .status-badge {
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          padding: 3px 8px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .status-badge.installed {
          background: rgba(16, 185, 129, 0.15);
          color: #34d399;
          border: 1px solid rgba(16, 185, 129, 0.3);
        }

        .status-badge.not-installed {
          background: rgba(255,255,255,0.05);
          color: rgba(255,255,255,0.4);
          border: 1px solid rgba(255,255,255,0.1);
        }

        .model-desc {
          font-size: 13px;
          color: rgba(255,255,255,0.6);
          line-height: 1.4;
          margin: 0;
          flex: 1;
        }

        .model-meta {
          display: flex;
          gap: 12px;
          font-size: 12px;
          color: rgba(255,255,255,0.4);
          font-family: monospace;
        }

        .meta-item {
          display: flex;
          align-items: center;
          gap: 4px;
          background: rgba(0,0,0,0.3);
          padding: 4px 8px;
          border-radius: 4px;
        }

        .model-actions {
          margin-top: auto;
          display: flex;
        }

        .btn-model-action {
          width: 100%;
          padding: 10px;
          border-radius: 8px;
          font-weight: 600;
          font-size: 13px;
          cursor: pointer;
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 6px;
          transition: all 0.2s;
          border: none;
        }

        .btn-download {
          background: rgba(167, 139, 250, 0.1);
          color: #a78bfa;
          border: 1px solid rgba(167, 139, 250, 0.2);
        }

        .btn-download:hover:not(:disabled) {
          background: #a78bfa;
          color: #fff;
        }

        .btn-select {
          background: rgba(255,255,255,0.05);
          color: #fff;
          border: 1px solid rgba(255,255,255,0.1);
        }

        .btn-select:hover {
          background: rgba(255,255,255,0.1);
        }

        .btn-active {
          background: rgba(16, 185, 129, 0.1);
          color: #34d399;
          border: 1px solid rgba(16, 185, 129, 0.3);
          cursor: default;
        }
      `}</style>
    </div>
  );
}
