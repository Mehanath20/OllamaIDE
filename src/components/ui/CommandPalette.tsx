/* ============================================================
   CommandPalette.tsx
   - mode="commands" → Ctrl+Shift+P fuzzy command list
   - mode="quickopen" → Ctrl+P fuzzy file open
   ============================================================ */
import { useState, useEffect, useRef, useMemo, ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Search, Terminal, FolderOpen, Sidebar, Bot } from "lucide-react";
import { useUIStore } from "../../store/uiStore";
import { useEditorStore } from "../../store/editorStore";
import { useFileStore, FileNode } from "../../store/fileStore";
import { getLanguageFromExt, getFileIcon } from "../../lib/fileIcons";
import { open } from "@tauri-apps/plugin-dialog";

interface Props {
  mode: "commands" | "quickopen";
}

interface CommandItem {
  id: string;
  label: string;
  icon: ReactNode;
  shortcut?: string;
  action: () => void;
}

export default function CommandPalette({ mode }: Props) {
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const {
    setCommandPaletteOpen,
    setQuickOpenOpen,
    setSidebarView,
    setBottomPanelOpen,
    bottomPanelOpen,
    sidebarView,
  } = useUIStore();
  const { openFile } = useEditorStore();
  const { tree } = useFileStore();

  const close = () => {
    setCommandPaletteOpen(false);
    setQuickOpenOpen(false);
  };

  // Flatten file tree for quick-open
  const allFiles = useMemo(() => flattenTree(tree), [tree]);

  // Commands list
  const commands: CommandItem[] = useMemo(() => [
    {
      id: "open-folder",
      label: "Open Folder…",
      icon: <FolderOpen size={14} />,
      shortcut: "",
      action: async () => {
        close();
        const selected = await open({ directory: true, multiple: false });
        if (typeof selected === "string") {
          const { setWorkspaceRoot, setTree } = useFileStore.getState();
          setWorkspaceRoot(selected);
          const entries = await invoke<{ name: string; path: string; is_dir: boolean; size?: number }[]>(
            "list_dir", { path: selected }
          );
          setTree(entries.map((e) => ({ name: e.name, path: e.path, isDir: e.is_dir, size: e.size, expanded: false })));
          setSidebarView("explorer");
          try { await invoke("watch_directory", { path: selected }); } catch {}
        }
      },
    },
    {
      id: "toggle-sidebar",
      label: "Toggle Primary Sidebar",
      icon: <Sidebar size={14} />,
      shortcut: "Ctrl+B",
      action: () => {
        close();
        setSidebarView(sidebarView ? null : "explorer");
      },
    },
    {
      id: "toggle-terminal",
      label: "Toggle Terminal",
      icon: <Terminal size={14} />,
      shortcut: "Ctrl+`",
      action: () => {
        close();
        setBottomPanelOpen(!bottomPanelOpen);
      },
    },
    {
      id: "explorer",
      label: "Show Explorer",
      icon: <FolderOpen size={14} />,
      action: () => { close(); setSidebarView("explorer"); },
    },
    {
      id: "ai",
      label: "Show AI Assistant",
      icon: <Bot size={14} />,
      action: () => { close(); setSidebarView("ai"); },
    },
  ], [bottomPanelOpen, sidebarView]);

  const filteredCommands = useMemo(() => {
    if (!query) return commands;
    const q = query.toLowerCase();
    return commands.filter((c) => c.label.toLowerCase().includes(q));
  }, [commands, query]);

  const filteredFiles = useMemo(() => {
    if (!query) return allFiles.slice(0, 50);
    const q = query.toLowerCase();
    return allFiles
      .filter((f) => f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q))
      .slice(0, 50);
  }, [allFiles, query]);

  const items = mode === "quickopen" ? filteredFiles : filteredCommands;

  useEffect(() => {
    setSelectedIdx(0);
  }, [query]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      executeItem(items[selectedIdx]);
    } else if (e.key === "Escape") {
      close();
    }
  };

  const executeItem = async (item: any) => {
    if (!item) return;
    if (mode === "quickopen") {
      // Open file
      try {
        const content = await invoke<string>("read_file", { path: item.path });
        const ext = item.name.split(".").pop() || "";
        openFile({
          path: item.path,
          name: item.name,
          content,
          language: getLanguageFromExt(ext),
          isDirty: false,
        });
        close();
      } catch (err) {
        console.error("Failed to open file:", err);
      }
    } else {
      item.action?.();
    }
  };

  const placeholder =
    mode === "quickopen"
      ? "Type to search files…"
      : "Type a command…";

  return (
    <div className="palette-overlay" onClick={close}>
      <div className="palette" onClick={(e) => e.stopPropagation()}>
        {/* Input */}
        <div className="palette-input-row">
          <Search size={16} className="palette-search-icon" />
          <input
            ref={inputRef}
            className="palette-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder={placeholder}
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="palette-esc">Esc</kbd>
        </div>

        {/* Results */}
        <div className="palette-results">
          {items.length === 0 ? (
            <div className="palette-empty">No results found</div>
          ) : (
            items.map((item: any, i: number) => (
              <div
                key={item.id || item.path}
                className={`palette-item ${i === selectedIdx ? "palette-item--selected" : ""}`}
                onClick={() => executeItem(item)}
                onMouseEnter={() => setSelectedIdx(i)}
              >
                <span className="palette-item-icon">
                  {mode === "quickopen"
                    ? <span>{getFileIcon(item.name)}</span>
                    : item.icon}
                </span>
                <span className="palette-item-label">{item.label || item.name}</span>
                {item.shortcut && (
                  <kbd className="palette-shortcut">{item.shortcut}</kbd>
                )}
                {mode === "quickopen" && item.path && (
                  <span className="palette-item-path truncate">
                    {item.path.replace(/\\/g, "/")}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <style>{`
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

        .palette-shortcut {
          background: var(--bg-4);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          padding: 1px 6px;
          font-family: var(--font-mono);
          font-size: var(--text-xs);
          color: var(--text-muted);
          flex-shrink: 0;
        }

        .palette-item-path {
          font-size: var(--text-xs);
          color: var(--text-muted);
          max-width: 200px;
        }
      `}</style>
    </div>
  );
}

function flattenTree(nodes: FileNode[]): FileNode[] {
  const result: FileNode[] = [];
  function walk(items: FileNode[]) {
    for (const item of items) {
      if (!item.isDir) result.push(item);
      if (item.children) walk(item.children);
    }
  }
  walk(nodes);
  return result;
}
