/* ============================================================
   AIPanel.tsx — AI Panel Sidebar Component.
   Features local health checks, auto-start, model selector & puller,
   message history, context injection, and agent executor toggles.
   ============================================================ */
import { useState, useEffect, useRef, KeyboardEvent } from "react";
import { 
  Bot, 
  Send, 
  AlertCircle, 
  RefreshCw, 
  Cpu, 
  Download, 
  Plus, 
  Image as ImageIcon,
  X 
} from "lucide-react";
import { useAIStore } from "../../store/aiStore";
import { useUIStore } from "../../store/uiStore";
import {
  checkOllamaHealth,
  startOllama,
  listModels,
} from "../../lib/ollama";
import { runAgentTurn, reindexWorkspace, resetAgentMemory } from "../../lib/agent";
import { resolveFileMentions } from "../../lib/fileUtils";
import { useFileStore } from "../../store/fileStore";
import ChatMessage from "./ChatMessage";
import AgentStatus from "./AgentStatus";
import { Brain, Code2 } from "lucide-react";


export default function AIPanel() {
  const {
    messages,
    installedModels,
    activeModel,
    isStreaming,
    ollamaOnline,
    isPulling,
    pullProgress,
    setOllamaOnline,
    setOllamaVersion,
    setInstalledModels,
    setActiveModel,
    activePersona,
    setActivePersona,
    clearMessages,
    setAgentAborted,
    plannerModel,
    setPlannerModel,
    agentArchitecture,
    setAgentArchitecture,
  } = useAIStore();
  const { setModelLibraryOpen } = useUIStore() as any;

  const [inputVal, setInputVal] = useState("");
  const [checking, setChecking] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isIndexing, setIsIndexing] = useState(false);
  const [attachedImages, setAttachedImages] = useState<string[]>([]);

  const { workspaceRoot } = useFileStore();
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);



  // Connection check on mount
  useEffect(() => {
    checkConnection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset agent memory whenever workspace changes
  useEffect(() => {
    resetAgentMemory();
  }, [workspaceRoot]);

  // Auto-scroll chat to bottom ONLY when a new message is added
  // (NOT on isStreaming changes — that fires 10x/sec during streaming and causes jank)
  const msgCount = messages.length;
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgCount]);

  const checkConnection = async () => {
    setChecking(true);
    try {
      const h = await checkOllamaHealth();
      setOllamaOnline(h.running);
      setOllamaVersion(h.version);
      if (h.running) {
        const models = await listModels();
        setInstalledModels(models);
        // Set default models if installed
        if (models.length > 0) {
          if (models.includes("qwen2.5-coder:14b") && activeModel === "qwen2.5-coder:14b") {
            // keep default
          } else if (!models.includes(activeModel)) {
            setActiveModel(models[0]);
          }
        }
      }
    } catch {
      setOllamaOnline(false);
    } finally {
      setChecking(false);
    }
  };

  const handleAutoStart = async () => {
    setIsStarting(true);
    try {
      await startOllama();
      // Poll health check every 2 seconds for 10 seconds
      let attempts = 0;
      const interval = setInterval(async () => {
        attempts++;
        const h = await checkOllamaHealth();
        if (h.running || attempts > 5) {
          clearInterval(interval);
          setOllamaOnline(h.running);
          setOllamaVersion(h.version);
          if (h.running) {
            const models = await listModels();
            setInstalledModels(models);
          }
          setIsStarting(false);
        }
      }, 2000);
    } catch (err: any) {
      alert(`Start failed: ${err.message || err}`);
      setIsStarting(false);
    }
  };

  const handleSendMessage = async () => {
    if ((!inputVal.trim() && attachedImages.length === 0) || isStreaming) return;
    const prompt = inputVal || "Examine the attached image.";
    setInputVal("");
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    
    // Pass images, then clear state
    const imagesToSend = [...attachedImages];
    setAttachedImages([]);

    // Resolve @file mentions and inject file contents
    const { cleanedPrompt, injectedContext } = await resolveFileMentions(prompt);
    const finalPrompt = cleanedPrompt + injectedContext;

    // Trigger Agent Mode execution loop for everything
    runAgentTurn(finalPrompt, imagesToSend);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    Array.from(e.target.files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Strip data URL prefix for Ollama
        const base64 = result.split(',')[1];
        if (base64) {
          setAttachedImages((prev) => [...prev, base64]);
        }
      };
      reader.readAsDataURL(file);
    });
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removeImage = (index: number) => {
    setAttachedImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="ai-panel">
      {/* Header section with Model Selection */}
      <div className="ai-header">
        <div className="ai-header-left">
          <span className="ai-header-title">✦ AI</span>
          <select 
            className="persona-select" 
            value={activePersona} 
            onChange={(e) => setActivePersona(e.target.value as any)}
            title="Select AI Persona"
          >
            <option value="Coder">Coder</option>
            <option value="Architect">Architect</option>
            <option value="Debugger">Debugger</option>
            <option value="Reviewer">Reviewer</option>
            <option value="Documenter">Documenter</option>
          </select>
          {/* Architecture mode toggle */}
          <button
            className={`btn-arch-toggle ${agentArchitecture === 'planner-coder' ? 'active' : ''}`}
            onClick={() => setAgentArchitecture(
              agentArchitecture === 'planner-coder' ? 'monolithic' : 'planner-coder'
            )}
            title={agentArchitecture === 'planner-coder' 
              ? 'Dual-Agent mode (Planner → Coder). Click for Classic mode.' 
              : 'Classic mode. Click for Dual-Agent (Planner → Coder).'}
          >
            {agentArchitecture === 'planner-coder' ? '🧠⚡' : '⚙️'}
          </button>
        </div>
        <div className="ai-header-right">
          {ollamaOnline && (
            <div className="model-dropdown-container">
              <select
                className="model-select"
                value={activeModel || ""}
                onChange={(e) => setActiveModel(e.target.value)}
                title="Select Coder Model"
              >
                {installedModels.length === 0 ? (
                  <option disabled value="">No models installed</option>
                ) : (
                  <>
                    {!installedModels.includes(activeModel) && activeModel && (
                      <option value={activeModel}>{activeModel}</option>
                    )}
                    {installedModels.map(model => (
                      <option key={model} value={model}>{model}</option>
                    ))}
                  </>
                )}
              </select>
              <button 
                className="btn-pull-new" 
                title="Download another model"
                onClick={() => setModelLibraryOpen(true)}
              >
                <Plus size={10} />
              </button>
            </div>
          )}
          {messages.length > 0 && (
            <button
              className="btn-header-action"
              onClick={() => { clearMessages(); }}
              title="New conversation"
            >
              <Plus size={13} />
            </button>
          )}
          {isStreaming && (
            <button
              className="btn-header-action btn-stop"
              onClick={() => setAgentAborted(true)}
              title="Stop agent"
            >
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--red, #ef4444)' }}>■</span>
            </button>
          )}
          <button
            className="btn-header-action"
            onClick={async () => {
              setIsIndexing(true);
              await reindexWorkspace();
              setIsIndexing(false);
            }}
            title="Re-index project (RAG context)"
            disabled={isIndexing}
          >
            <RefreshCw size={12} className={isIndexing ? "spin" : ""} />
          </button>
        </div>
      </div>

      {/* Dual-Agent Model Selector Row — shown when planner-coder is active */}
      {ollamaOnline && agentArchitecture === 'planner-coder' && installedModels.length > 0 && (
        <div className="dual-model-row">
          <div className="dual-model-col">
            <div className="dual-model-label">
              <Brain size={11} />
              <span>Planner</span>
            </div>
            <select
              className="dual-model-select"
              value={plannerModel || activeModel}
              onChange={(e) => setPlannerModel(e.target.value)}
              title="Model for planning (generates task prompts)"
            >
              {installedModels.map(model => (
                <option key={model} value={model}>{model}</option>
              ))}
            </select>
          </div>
          <div className="dual-model-divider" />
          <div className="dual-model-col">
            <div className="dual-model-label">
              <Code2 size={11} />
              <span>Coder</span>
            </div>
            <select
              className="dual-model-select"
              value={activeModel}
              onChange={(e) => setActiveModel(e.target.value)}
              title="Model for coding (writes files with fresh context)"
            >
              {installedModels.map(model => (
                <option key={model} value={model}>{model}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Main Screen Content */}
      {!ollamaOnline ? (
        <div className="offline-setup-screen">
          <AlertCircle size={40} className="offline-icon" />
          <h3 className="offline-title">Ollama Offline</h3>
          <p className="offline-text">
            No local server detected at <code>http://localhost:11434</code>. Please ensure Ollama is installed and running.
          </p>

          <div className="offline-actions">
            <button className="btn-action btn-action--primary" onClick={handleAutoStart} disabled={isStarting}>
              {isStarting ? "Launching..." : "Auto-Start Ollama"}
            </button>
            <span className="install-location-label">Path: D:\Ollama\ollama app.exe</span>
            <button className="btn-action btn-action--secondary" onClick={checkConnection} disabled={checking}>
              {checking ? "Checking..." : "Retry Connection"}
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Global Pull Progress Banner */}
          {isPulling && (
            <div className="global-pull-banner">
              <Download size={14} className="spin-slow" />
              <span>{pullProgress}</span>
            </div>
          )}

          {/* Models Pulling interface if no models downloaded */}
          {installedModels.length === 0 && !isPulling && (
            <div className="missing-models-alert">
              <Cpu size={24} className="missing-icon" />
              <h4>No LLM Models Detected</h4>
              <p>Download a coding model to get started. Qwen2.5-Coder is highly recommended.</p>

              <div className="pull-model-group">
                <button
                  className="btn-action btn-action--primary"
                  onClick={() => setModelLibraryOpen(true)}
                  disabled={isPulling}
                >
                  <Download size={14} />
                  <span>{isPulling ? "Pulling..." : "Open Model Library"}</span>
                </button>
              </div>

              {isPulling && <div className="pull-progress-bar">{pullProgress}</div>}
            </div>
          )}

          {installedModels.length > 0 && (
            <>
              {/* Main Interaction Area */}
              <div className="chat-messages-scroll">
                <AgentStatus />
                
                {messages.length === 0 ? (
                  <div className="chat-welcome">
                    <Bot size={36} className="welcome-bot" />
                    <h3>AntiNetwork</h3>
                    <p>Ask anything, create files, run commands.<br/>Use <code>@filename</code> to load file context.</p>
                    <div className="welcome-hints">
                      <div className="hint-chip">✦ Write code</div>
                      <div className="hint-chip">⚡ Run commands</div>
                      <div className="hint-chip">🔍 Search files</div>
                    </div>
                  </div>
                ) : (
                  messages.map((m, idx) => (
                    <ChatMessage
                      key={m.id}
                      message={m}
                      isStreaming={isStreaming && idx === messages.length - 1}
                    />
                  ))
                )}
                
                {isStreaming && (
                  <div className="assistant-typing">
                    <span className="dot" />
                    <span className="dot" />
                    <span className="dot" />
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Chat Input & Mode Controls */}
              <div className="chat-footer">
                {attachedImages.length > 0 && (
                  <div className="chat-image-preview">
                    {attachedImages.map((b64, idx) => (
                      <div key={idx} className="preview-thumb">
                        <img src={`data:image/png;base64,${b64}`} alt="attachment" />
                        <button className="remove-img" onClick={() => removeImage(idx)}>
                          <X size={10} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="chat-input-wrapper">
                  <button 
                    className="btn-attach" 
                    title="Attach image (for vision models)"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <ImageIcon size={14} />
                  </button>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    hidden 
                    accept="image/*" 
                    multiple
                    onChange={handleImageUpload} 
                  />
                  <textarea
                    ref={textareaRef}
                    className="chat-textarea"
                    rows={1}
                    value={inputVal}
                    onChange={(e) => {
                      setInputVal(e.target.value);
                      e.target.style.height = 'auto';
                      e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask a question or describe an agent task... (use @filename)"
                  />
                  <button
                    className="chat-submit-btn"
                    onClick={handleSendMessage}
                    disabled={isStreaming || (!inputVal.trim() && attachedImages.length === 0)}
                  >
                    <Send size={14} />
                  </button>
                </div>
              </div>
            </>
          )}
        </>
      )}

      <style>{`
        .ai-panel {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: var(--bg-1);
          color: var(--text-primary);
          overflow: hidden;
        }

        .ai-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 var(--space-3) 0 var(--space-4);
          height: 40px;
          background: var(--bg-1);
          border-bottom: 1px solid var(--border-soft);
          flex-shrink: 0;
        }

        .ai-header-left {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          flex: 1;
        }

        .ai-header-right {
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .ai-header-title {
          font-size: var(--text-xs);
          font-weight: 700;
          color: var(--accent);
          letter-spacing: 0.12em;
        }

        .persona-select {
          background: transparent;
          border: 1px solid var(--border-soft);
          border-radius: 4px;
          color: var(--text-primary);
          font-size: 11px;
          font-weight: 600;
          padding: 2px 4px;
          cursor: pointer;
          outline: none;
        }

        .persona-select option {
          background: var(--bg-2);
          color: var(--text-primary);
        }

        .btn-arch-toggle {
          background: var(--bg-2);
          border: 1px solid var(--border-soft);
          border-radius: 4px;
          padding: 2px 6px;
          font-size: 11px;
          cursor: pointer;
          transition: all 0.15s;
          line-height: 1;
        }
        .btn-arch-toggle.active {
          background: rgba(124, 58, 237, 0.15);
          border-color: rgba(124, 58, 237, 0.4);
        }
        .btn-arch-toggle:hover {
          background: rgba(124, 58, 237, 0.25);
        }

        /* Dual Model Selector Row */
        .dual-model-row {
          display: flex;
          align-items: stretch;
          gap: 0;
          padding: 0 var(--space-3);
          border-bottom: 1px solid var(--border-soft);
          background: rgba(0,0,0,0.15);
          flex-shrink: 0;
        }

        .dual-model-col {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 2px;
          padding: 6px 8px;
        }

        .dual-model-divider {
          width: 1px;
          background: var(--border-soft);
          margin: 4px 0;
        }

        .dual-model-label {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 0.08em;
          color: var(--text-muted);
          text-transform: uppercase;
        }

        .dual-model-select {
          background: var(--bg-2);
          border: 1px solid var(--border-soft);
          border-radius: 4px;
          color: var(--text-primary);
          font-size: 10px;
          font-weight: 600;
          padding: 3px 4px;
          cursor: pointer;
          outline: none;
          width: 100%;
        }

        .dual-model-select option {
          background: var(--bg-2);
          color: var(--text-primary);
        }

        .model-dropdown-container {
          display: flex;
          background: #000000; /* initial color black */
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 6px;
          overflow: hidden;
          margin-right: 4px;
        }

        .model-select {
          background: transparent !important;
          border: none;
          color: white !important;
          font-size: 11px;
          font-weight: 600;
          padding: 4px 8px;
          cursor: pointer;
          outline: none;
          max-width: 140px;
          text-overflow: ellipsis;
        }

        .model-select option {
          background: var(--bg-2);
          color: var(--text-primary);
        }

        .btn-pull-new {
          background: transparent;
          border: none;
          color: rgba(255, 255, 255, 0.8);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0 8px;
          border-left: 1px solid rgba(255, 255, 255, 0.2);
          transition: background var(--trans-fast), color var(--trans-fast);
        }

        .btn-pull-new:hover {
          background: var(--accent);
          color: white;
        }

        .btn-header-action {
          background: transparent;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 4px;
          border-radius: var(--radius-sm);
          transition: color var(--trans-fast), background var(--trans-fast);
        }
        .btn-header-action:hover {
          color: var(--text-primary);
          background: var(--bg-3);
        }

        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }

        .offline-setup-screen {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: var(--space-6);
          text-align: center;
          gap: var(--space-4);
        }

        .offline-icon {
          color: var(--yellow);
        }

        .offline-title {
          font-size: var(--text-lg);
          font-weight: 700;
          color: var(--text-primary);
        }

        .offline-text {
          font-size: var(--text-sm);
          color: var(--text-muted);
          line-height: 1.5;
          margin: 0;
        }

        .offline-text code {
          background: rgba(255, 255, 255, 0.05);
          padding: 2px 4px;
          border-radius: 4px;
          color: var(--yellow);
        }

        .offline-actions {
          display: flex;
          flex-direction: column;
          gap: var(--space-3);
          width: 100%;
          max-width: 200px;
          margin-top: var(--space-2);
        }

        .install-location-label {
          font-size: 10px;
          color: var(--text-muted);
          word-break: break-all;
        }

        .btn-action {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: var(--space-2);
          padding: var(--space-2) var(--space-4);
          border-radius: 4px;
          font-size: var(--text-sm);
          font-weight: 600;
          cursor: pointer;
          border: none;
          transition: background var(--trans-fast);
        }

        .btn-action--primary {
          background: var(--accent);
          color: white;
        }
        .btn-action--primary:hover:not(:disabled) {
          background: #6d28d9;
        }
        .btn-action--primary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .btn-action--secondary {
          background: var(--bg-2);
          border: 1px solid var(--border-soft);
          color: var(--text-primary);
        }
        .btn-action--secondary:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.05);
        }

        .missing-models-alert {
          margin: var(--space-4);
          padding: var(--space-4);
          background: rgba(124, 58, 237, 0.05);
          border: 1px solid rgba(124, 58, 237, 0.2);
          border-radius: 6px;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: var(--space-2);
        }

        .missing-icon {
          color: var(--accent);
        }

        .missing-models-alert h4 {
          font-size: var(--text-sm);
          font-weight: 700;
          color: var(--text-primary);
          margin: 0;
        }

        .missing-models-alert p {
          font-size: var(--text-xs);
          color: var(--text-muted);
          margin: 0;
          line-height: 1.4;
        }

        .pull-model-group {
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
          width: 100%;
          margin-top: var(--space-2);
        }

        .pull-select {
          background: var(--bg-2);
          border: 1px solid var(--border-soft);
          color: var(--text-primary);
          font-size: var(--text-xs);
          padding: var(--space-2);
          border-radius: 4px;
        }

        .pull-progress-bar {
          font-family: monospace;
          font-size: 10px;
          color: var(--yellow);
          margin-top: var(--space-2);
          word-break: break-all;
        }

        .global-pull-banner {
          display: flex;
          align-items: center;
          gap: 8px;
          background: rgba(124, 58, 237, 0.1);
          border-bottom: 1px solid rgba(124, 58, 237, 0.2);
          padding: 8px 12px;
          font-size: 11px;
          color: var(--accent);
          font-family: monospace;
        }

        .spin-slow {
          animation: spin 2s linear infinite;
        }

        .chat-messages-scroll {
          flex: 1;
          overflow-y: auto;
          padding: var(--space-4);
          display: flex;
          flex-direction: column;
        }

        .chat-welcome {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          color: var(--text-muted);
          padding: var(--space-6) var(--space-4);
          gap: var(--space-3);
        }

        .welcome-bot {
          color: var(--accent);
          opacity: 0.6;
          margin-bottom: var(--space-1);
        }

        .chat-welcome h3 {
          font-size: var(--text-base);
          font-weight: 700;
          color: var(--text-primary);
          margin: 0;
        }

        .chat-welcome p {
          font-size: var(--text-sm);
          line-height: 1.6;
          margin: 0;
          max-width: 220px;
        }

        .welcome-hints {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          justify-content: center;
          margin-top: var(--space-2);
        }

        .hint-chip {
          background: var(--bg-3);
          border: 1px solid var(--border);
          border-radius: 20px;
          padding: 3px 10px;
          font-size: var(--text-xs);
          color: var(--text-secondary);
        }

        .chat-welcome code {
          background: rgba(255,255,255,0.06);
          padding: 1px 5px;
          border-radius: 3px;
          color: var(--accent);
          font-family: var(--font-mono);
          font-size: 0.9em;
        }

        .assistant-typing {
          display: flex;
          gap: 4px;
          padding: var(--space-2) var(--space-3);
          background: var(--bg-1);
          border-radius: 12px;
          width: fit-content;
          align-self: flex-start;
          margin-bottom: var(--space-4);
        }

        .assistant-typing .dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--text-muted);
          animation: jump 1.4s infinite ease-in-out both;
        }

        .assistant-typing .dot:nth-child(1) { animation-delay: -0.32s; }
        .assistant-typing .dot:nth-child(2) { animation-delay: -0.16s; }

        @keyframes jump {
          0%, 80%, 100% { transform: scale(0); }
          40% { transform: scale(1); }
        }

        .chat-footer {
          padding: var(--space-3) var(--space-4) var(--space-4);
          border-top: 1px solid var(--border-soft);
          background: var(--bg-1);
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }

        .mode-selector-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 11px;
          color: var(--text-muted);
        }

        .btn-toggle-mode {
          background: transparent;
          border: none;
          cursor: pointer;
          color: var(--text-muted);
          padding: 0;
          display: flex;
          align-items: center;
        }

        .btn-toggle-mode:hover {
          color: var(--text-primary);
        }

        .toggle-icon {
          transition: color 0.2s;
        }

        .toggle-icon.active {
          color: var(--accent);
        }

        .chat-input-wrapper {
          position: relative;
          background: var(--bg-2);
          border: 1px solid var(--border-soft);
          border-radius: 6px;
          display: flex;
          align-items: flex-end;
          padding: 4px var(--space-2);
        }

        .chat-textarea {
          flex: 1;
          background: transparent;
          border: none;
          outline: none;
          color: var(--text-primary);
          font-size: var(--text-sm);
          line-height: 1.4;
          resize: none;
          max-height: 120px;
          padding: var(--space-2) 0;
          margin-right: 32px;
          font-family: inherit;
        }

        .chat-submit-btn {
          position: absolute;
          right: var(--space-2);
          bottom: 6px;
          background: var(--accent);
          border: none;
          color: white;
          width: 24px;
          height: 24px;
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: background 0.15s;
        }

        .chat-submit-btn:hover:not(:disabled) {
          background: #6d28d9;
        }

        .chat-submit-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          background: var(--bg-1);
          color: var(--text-muted);
          border: 1px solid var(--border-soft);
        }

        .agent-tasks-container {
          background: rgba(0,0,0,0.1);
          border: 1px solid var(--border-soft);
          border-radius: 6px;
          padding: var(--space-3);
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }

        .agent-tasks-header {
          font-size: var(--text-sm);
          font-weight: 700;
          color: var(--text-primary);
          margin-bottom: var(--space-2);
        }

        .agent-task-item {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          font-size: var(--text-xs);
          color: var(--text-muted);
        }

        .task-icon.checked {
          color: var(--green);
        }

        .placeholder-tab-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: var(--text-muted);
          text-align: center;
          padding: var(--space-6);
          gap: var(--space-3);
        }

        .placeholder-icon {
          opacity: 0.5;
        }

        .chat-input-wrapper {
          display: flex;
          background: var(--bg-2);
          border: 1px solid var(--border-soft);
          border-radius: var(--radius-sm);
          padding: var(--space-2) var(--space-3);
          gap: var(--space-2);
          align-items: flex-end;
          transition: border-color var(--trans-fast);
          position: relative;
        }

        .chat-input-wrapper:focus-within {
          border-color: var(--accent);
        }

        .btn-attach {
          background: transparent;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          padding: 4px;
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: color var(--trans-fast);
        }
        .btn-attach:hover { color: var(--text-primary); }

        .chat-textarea {
          flex: 1;
          background: transparent;
          border: none;
          color: var(--text-primary);
          font-family: var(--font-sans);
          font-size: var(--text-sm);
          resize: none;
          outline: none;
          max-height: 150px;
          padding: 2px 0;
          line-height: 1.5;
        }

        .chat-submit-btn {
          background: var(--accent);
          color: white;
          border: none;
          border-radius: 4px;
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: background var(--trans-fast), opacity var(--trans-fast);
          flex-shrink: 0;
          position: relative !important;
          right: auto !important;
          bottom: auto !important;
        }

        .chat-submit-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .chat-submit-btn:not(:disabled):hover {
          background: var(--accent-light, #9353d3);
        }
        
        .chat-image-preview {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          padding: 8px 12px;
          background: var(--bg-1);
          border-bottom: 1px solid var(--border-soft);
        }
        
        .preview-thumb {
          position: relative;
          width: 50px;
          height: 50px;
          border-radius: 6px;
          overflow: hidden;
          border: 1px solid var(--border);
        }
        
        .preview-thumb img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        
        .remove-img {
          position: absolute;
          top: 2px;
          right: 2px;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: rgba(0,0,0,0.6);
          color: white;
          border: none;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          padding: 0;
        }
        .remove-img:hover { background: rgba(255,0,0,0.8); }
      `}</style>
    </div>
  );
}
