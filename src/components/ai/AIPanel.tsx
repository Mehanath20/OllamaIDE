/* ============================================================
   AIPanel.tsx — AI Panel Sidebar Component.
   Features local health checks, auto-start, model selector & puller,
   message history, context injection, and agent executor toggles.
   ============================================================ */
import { useState, useEffect, useRef, KeyboardEvent } from "react";
import { Bot, Send, Sparkles, AlertCircle, RefreshCw, Cpu, Download, ToggleLeft, ToggleRight, CheckSquare, MessageSquare, Code, TerminalSquare } from "lucide-react";
import { useAIStore, ChatMessage as ChatMessageType } from "../../store/aiStore";
import {
  checkOllamaHealth,
  startOllama,
  listModels,
  pullModel,
  chatOllama,
} from "../../lib/ollama";
import { runAgentTurn } from "../../lib/agent";
import { resolveFileMentions } from "../../lib/fileUtils";
import ChatMessage from "./ChatMessage";
import AgentStatus from "./AgentStatus";

const RECOMMENDED_MODELS = [
  { name: "qwen2.5-coder:14b", size: "9.0 GB", desc: "Recommended (Agent & Chat)" },
  { name: "qwen2.5-coder:7b", size: "4.7 GB", desc: "Fast (Completions & Chat)" },
  { name: "llama3.1:8b", size: "4.7 GB", desc: "General Chat Fallback" },
  { name: "codestral", size: "13 GB", desc: "Alternative Code Model" },
];

export default function AIPanel() {
  const {
    messages,
    installedModels,
    activeModel,
    isStreaming,
    ollamaOnline,
    isPulling,
    pullProgress,
    agentMode,
    addMessage,
    updateLastMessageContent,
    setStreaming,
    setOllamaOnline,
    setOllamaVersion,
    setInstalledModels,
    setActiveModel,
    setIsPulling,
    setPullProgress,
    setAgentMode,
  } = useAIStore();

  const [inputVal, setInputVal] = useState("");
  const [checking, setChecking] = useState(false);
  const [pullInput, setPullInput] = useState(RECOMMENDED_MODELS[0].name);
  const [isStarting, setIsStarting] = useState(false);
  const [activeTab, setActiveTab] = useState<"chat" | "agent" | "review" | "terminal">("chat");
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Connection check on mount
  useEffect(() => {
    checkConnection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

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

  const handlePullModel = async () => {
    if (!pullInput.trim()) return;
    setIsPulling(true);
    setPullProgress("Requesting pull...");
    try {
      await pullModel(pullInput, (p) => {
        if (p.completed && p.total) {
          const percent = ((p.completed / p.total) * 100).toFixed(0);
          setPullProgress(`Downloading: ${percent}% (${(p.completed/1e9).toFixed(1)} GB / ${(p.total/1e9).toFixed(1)} GB)`);
        } else {
          setPullProgress(p.status || "Downloading...");
        }
      });
      alert(`Model ${pullInput} pulled successfully!`);
      // Refresh models
      const models = await listModels();
      setInstalledModels(models);
      setActiveModel(pullInput);
    } catch (err: any) {
      alert(`Failed to pull model: ${err.message || err}`);
    } finally {
      setIsPulling(false);
      setPullProgress("");
    }
  };

  const handleSendMessage = async () => {
    if (!inputVal.trim() || isStreaming) return;
    const prompt = inputVal;
    setInputVal("");

    // Resolve @file mentions and inject file contents
    const { cleanedPrompt, injectedContext } = await resolveFileMentions(prompt);
    const finalPrompt = cleanedPrompt + injectedContext;

    if (agentMode) {
      // Trigger Agent Mode execution loop
      runAgentTurn(finalPrompt);
    } else {
      // Standard streaming Chat Mode
      const userMessage: ChatMessageType = {
        id: `user-${Date.now()}`,
        role: "user",
        content: prompt,
        timestamp: Date.now(),
      };
      addMessage(userMessage);

      // System prompt for chat
      const chatHistory = [
        { role: "system" as const, content: "You are Antigravity, a professional coding assistant. Provide precise, clean answers." },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
        { role: "user" as const, content: finalPrompt },
      ];

      const assistantMsgId = `assistant-${Date.now()}`;
      const placeholder: ChatMessageType = {
        id: assistantMsgId,
        role: "assistant",
        content: "",
        timestamp: Date.now(),
      };
      addMessage(placeholder);
      setStreaming(true);

      let contentBuffer = "";
      try {
        await chatOllama(assistantMsgId, activeModel, chatHistory, (chunk, done) => {
          contentBuffer += chunk;
          updateLastMessageContent(contentBuffer);
          if (done) {
            setStreaming(false);
          }
        });
      } catch (err: any) {
        setStreaming(false);
        updateLastMessageContent(`Error calling Ollama: ${err.message || err}`);
      }
    }
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
          <span className="ai-header-title">🤖 AI Agent</span>
        </div>
        {ollamaOnline && installedModels.length > 0 && (
          <select
            className="model-select"
            value={activeModel}
            onChange={(e) => setActiveModel(e.target.value)}
          >
            {installedModels.map((m) => (
              <option key={m} value={m}>
                {m.length > 15 ? m.substring(0, 15) + "..." : m}
              </option>
            ))}
          </select>
        )}
        <button className="btn-refresh-connection" onClick={checkConnection} title="Refresh connection">
          <RefreshCw size={12} className={checking ? "spin" : ""} />
        </button>
      </div>

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
          {/* Models Pulling interface if no models downloaded */}
          {installedModels.length === 0 && (
            <div className="missing-models-alert">
              <Cpu size={24} className="missing-icon" />
              <h4>No LLM Models Detected</h4>
              <p>Download a coding model to get started. Qwen2.5-Coder is highly recommended.</p>

              <div className="pull-model-group">
                <select
                  className="pull-select"
                  value={pullInput}
                  onChange={(e) => setPullInput(e.target.value)}
                >
                  {RECOMMENDED_MODELS.map((m) => (
                    <option key={m.name} value={m.name}>
                      {m.name} ({m.size})
                    </option>
                  ))}
                </select>
                <button
                  className="btn-action btn-action--primary"
                  onClick={handlePullModel}
                  disabled={isPulling}
                >
                  <Download size={14} />
                  <span>{isPulling ? "Pulling..." : "Download Model"}</span>
                </button>
              </div>

              {isPulling && <div className="pull-progress-bar">{pullProgress}</div>}
            </div>
          )}

          {installedModels.length > 0 && (
            <>
              {/* Tab Navigation */}
              <div className="ai-tabs-row">
                <button className={`ai-tab-btn ${activeTab === "chat" ? "active" : ""}`} onClick={() => {setActiveTab("chat"); setAgentMode(false);}}>
                  <MessageSquare size={14} /> Chat
                </button>
                <button className={`ai-tab-btn ${activeTab === "agent" ? "active" : ""}`} onClick={() => {setActiveTab("agent"); setAgentMode(true);}}>
                  <Sparkles size={14} /> Agent
                </button>
                <button className={`ai-tab-btn ${activeTab === "review" ? "active" : ""}`} onClick={() => setActiveTab("review")}>
                  <Code size={14} /> Review
                </button>
                <button className={`ai-tab-btn ${activeTab === "terminal" ? "active" : ""}`} onClick={() => setActiveTab("terminal")}>
                  <TerminalSquare size={14} /> Terminal
                </button>
              </div>

              {/* Tab Content Area */}
              <div className="chat-messages-scroll">
                {activeTab === "chat" && (
                  <>
                    {messages.length === 0 ? (
                      <div className="chat-welcome">
                        <Bot size={40} className="welcome-bot" />
                        <h3>Welcome to Antigravity AI</h3>
                        <p>Ask questions, write files, or trigger agent tasks. Mentions like <code>@filename</code> will load file context automatically.</p>
                      </div>
                    ) : (
                      messages.map((m) => <ChatMessage key={m.id} message={m} />)
                    )}
                    {isStreaming && (
                      <div className="assistant-typing">
                        <span className="dot" />
                        <span className="dot" />
                        <span className="dot" />
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </>
                )}

                {activeTab === "agent" && (
                  <div className="agent-tab-content">
                    <AgentStatus />
                  </div>
                )}

                {activeTab === "review" && (
                  <div className="placeholder-tab-content">
                    <Code size={32} className="placeholder-icon" />
                    <p>Code Review tools will appear here when active.</p>
                  </div>
                )}

                {activeTab === "terminal" && (
                  <div className="placeholder-tab-content">
                    <TerminalSquare size={32} className="placeholder-icon" />
                    <p>Agent terminal session view.</p>
                  </div>
                )}
              </div>

              {/* Chat Input & Mode Controls */}
              <div className="chat-footer">

                <div className="chat-input-wrapper">
                  <textarea
                    className="chat-textarea"
                    rows={1}
                    value={inputVal}
                    onChange={(e) => setInputVal(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={
                      agentMode
                        ? "Describe an agent task... (use @filename)"
                        : "Ask AI coding questions... (use @filename)"
                    }
                  />
                  <button
                    className="chat-submit-btn"
                    onClick={handleSendMessage}
                    disabled={isStreaming || !inputVal.trim()}
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
          padding: var(--space-3) var(--space-4);
          background: var(--bg-1);
          border-bottom: 1px solid var(--border-soft);
          flex-shrink: 0;
          gap: var(--space-2);
        }

        .ai-header-left {
          display: flex;
          align-items: center;
          gap: var(--space-2);
        }

        .sparkle-icon {
          color: var(--accent);
        }

        .ai-header-title {
          font-size: var(--text-xs);
          font-weight: 700;
          color: var(--text-muted);
          letter-spacing: 0.1em;
        }

        .model-select {
          flex: 1;
          max-width: 140px;
          background: var(--bg-2);
          border: 1px solid var(--border-soft);
          border-radius: 4px;
          color: var(--text-primary);
          font-size: var(--text-xs);
          padding: 2px 6px;
          outline: none;
        }

        .btn-refresh-connection {
          background: transparent;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 4px;
          border-radius: 4px;
        }

        .btn-refresh-connection:hover {
          color: var(--text-primary);
          background: rgba(255, 255, 255, 0.05);
        }

        .spin {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

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
          gap: var(--space-2);
        }

        .welcome-bot {
          color: var(--accent);
          margin-bottom: var(--space-2);
        }

        .chat-welcome h3 {
          font-size: var(--text-md);
          font-weight: 700;
          color: var(--text-primary);
          margin: 0;
        }

        .chat-welcome p {
          font-size: var(--text-sm);
          line-height: 1.5;
          margin: 0;
        }

        .chat-welcome code {
          background: rgba(255,255,255,0.05);
          padding: 2px 4px;
          border-radius: 4px;
          color: var(--accent);
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

        .ai-tabs-row {
          display: flex;
          align-items: center;
          gap: 2px;
          padding: 0 var(--space-2);
          border-bottom: 1px solid var(--border-soft);
          background: var(--bg-2);
        }

        .ai-tab-btn {
          background: transparent;
          border: none;
          color: var(--text-muted);
          font-size: 11px;
          font-weight: 600;
          padding: var(--space-2) var(--space-3);
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          border-bottom: 2px solid transparent;
          transition: all 0.2s;
        }

        .ai-tab-btn:hover {
          color: var(--text-primary);
        }

        .ai-tab-btn.active {
          color: var(--accent);
          border-bottom-color: var(--accent);
        }

        .agent-tab-content {
          display: flex;
          flex-direction: column;
          gap: var(--space-4);
        }

        .agent-tasks-placeholder {
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
      `}</style>
    </div>
  );
}
