import { useState, useEffect, useRef, useMemo } from "react";
import { Sparkles, Code, Bug, Wrench, FileText, CheckCircle2 } from "lucide-react";
import { useUIStore } from "../../store/uiStore";
import { useAIStore } from "../../store/aiStore";
import { runAgentTurn } from "../../lib/agent";

interface CommandItem {
  id: string;
  label: string;
  icon: JSX.Element;
  action: () => void;
}

export default function AICommandPalette() {
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  
  const { setAiCommandPaletteOpen, setAgentPanelOpen } = useUIStore();
  const { setAgentMode } = useAIStore.getState();

  const close = () => {
    setAiCommandPaletteOpen(false);
  };

  const triggerAIAction = (taskText: string) => {
    close();
    setAgentPanelOpen(true);
    setAgentMode(true);
    
    // Pass the task to the agent
    setTimeout(() => {
      runAgentTurn(taskText);
    }, 100);
  };

  const commands: CommandItem[] = useMemo(() => [
    {
      id: "generate-component",
      label: "Generate React Component",
      icon: <Code size={14} className="ai-icon" />,
      action: () => triggerAIAction("Generate a new React component"),
    },
    {
      id: "fix-errors",
      label: "Fix Errors in active file",
      icon: <Bug size={14} className="ai-icon" />,
      action: () => triggerAIAction("Fix errors in the active file"),
    },
    {
      id: "refactor",
      label: "Refactor Project",
      icon: <Wrench size={14} className="ai-icon" />,
      action: () => triggerAIAction("Refactor this project to improve structure"),
    },
    {
      id: "docs",
      label: "Generate Documentation",
      icon: <FileText size={14} className="ai-icon" />,
      action: () => triggerAIAction("Generate comprehensive documentation"),
    },
    {
      id: "api",
      label: "Create API Route",
      icon: <Sparkles size={14} className="ai-icon" />,
      action: () => triggerAIAction("Create a new API route"),
    },
    {
      id: "tests",
      label: "Generate Tests",
      icon: <CheckCircle2 size={14} className="ai-icon" />,
      action: () => triggerAIAction("Write unit tests for the active file"),
    },
  ], []);

  const filteredCommands = useMemo(() => {
    if (!query) return commands;
    const q = query.toLowerCase();
    return commands.filter((c) => c.label.toLowerCase().includes(q));
  }, [commands, query]);

  useEffect(() => {
    setSelectedIdx(0);
  }, [query]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, filteredCommands.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filteredCommands[selectedIdx]) {
        filteredCommands[selectedIdx].action();
      } else if (query.trim()) {
        // Fallback: If typing a custom query and pressing Enter
        triggerAIAction(query.trim());
      }
    } else if (e.key === "Escape") {
      close();
    }
  };

  return (
    <div className="palette-overlay" onClick={close}>
      <div className="palette ai-palette" onClick={(e) => e.stopPropagation()}>
        <div className="palette-input-row">
          <Sparkles size={16} className="palette-search-icon ai-icon" />
          <input
            ref={inputRef}
            className="palette-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask AI to generate, fix, or refactor..."
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="palette-esc">Esc</kbd>
        </div>

        <div className="palette-results">
          {filteredCommands.length === 0 ? (
            <div className="palette-empty">No AI commands found</div>
          ) : (
            filteredCommands.map((item, i) => (
              <div
                key={item.id}
                className={`palette-item ${i === selectedIdx ? "palette-item--selected" : ""}`}
                onClick={() => item.action()}
                onMouseEnter={() => setSelectedIdx(i)}
              >
                <span className="palette-item-icon">{item.icon}</span>
                <span className="palette-item-label">{item.label}</span>
              </div>
            ))
          )}
        </div>
      </div>

      <style>{`
        .ai-palette {
          border: 1px solid rgba(124, 58, 237, 0.3) !important;
          box-shadow: 0 24px 80px rgba(124, 58, 237, 0.15) !important;
        }

        .ai-icon {
          color: var(--accent);
        }

        .palette-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.6);
          z-index: 10000;
          display: flex;
          align-items: flex-start;
          justify-content: center;
          padding-top: 80px;
          backdrop-filter: blur(4px);
          animation: paletteFade 100ms ease both;
        }

        @keyframes paletteFade {
          from { opacity: 0; }
          to   { opacity: 1; }
        }

        .palette {
          width: 600px;
          max-width: calc(100vw - 32px);
          background: var(--bg-3);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          box-shadow: 0 24px 80px rgba(0,0,0,0.7);
          overflow: hidden;
          animation: paletteSlide 120ms ease both;
        }

        @keyframes paletteSlide {
          from { transform: translateY(-8px) scale(0.98); opacity: 0; }
          to   { transform: translateY(0) scale(1); opacity: 1; }
        }

        .palette-input-row {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          padding: var(--space-3) var(--space-4);
          border-bottom: 1px solid var(--border-soft);
        }

        .palette-search-icon { color: var(--text-muted); flex-shrink: 0; }

        .palette-input {
          flex: 1;
          background: transparent;
          border: none;
          outline: none;
          color: var(--text-primary);
          font-size: var(--text-base);
          font-family: var(--font-ui);
          caret-color: var(--accent);
        }

        .palette-input::placeholder { color: var(--text-muted); }

        .palette-esc {
          background: var(--bg-4);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          padding: 2px 6px;
          font-family: var(--font-mono);
          font-size: var(--text-xs);
          color: var(--text-muted);
          cursor: pointer;
        }

        .palette-results {
          max-height: 380px;
          overflow-y: auto;
          padding: 4px;
        }

        .palette-empty {
          padding: var(--space-6);
          text-align: center;
          color: var(--text-muted);
          font-size: var(--text-sm);
        }

        .palette-item {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          padding: 8px var(--space-3);
          border-radius: var(--radius-md);
          cursor: pointer;
          transition: background var(--trans-fast);
        }

        .palette-item--selected { background: var(--bg-4); }

        .palette-item-icon {
          color: var(--text-muted);
          display: flex;
          align-items: center;
          flex-shrink: 0;
          font-size: 14px;
        }

        .palette-item-label {
          flex: 1;
          font-size: var(--text-sm);
          color: var(--text-primary);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
      `}</style>
    </div>
  );
}
