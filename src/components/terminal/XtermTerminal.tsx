/* ============================================================
   XtermTerminal.tsx — VS Code-grade xterm.js terminal
   IMPORTANT: This component does NOT create the PTY session.
   The session is created by BottomPanel BEFORE this mounts.
   This component only:
     1. Renders the xterm.js canvas
     2. Subscribes to "terminal-output" events for this sessionId
     3. Sends keystrokes via write_to_terminal (raw bytes)
     4. Sends SIGWINCH via resize_terminal on panel resize
     5. Handles "terminal-exited" to show exit banner
     6. Ctrl+F opens inline search (SearchAddon)
   ============================================================ */
import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { SearchAddon } from "@xterm/addon-search";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "@xterm/xterm/css/xterm.css";
import { useTerminalStore } from "../../store/terminalStore";

interface Props {
  sessionId: string;
  isActive: boolean;
}

interface TerminalOutputEvent {
  session_id: string;
  data: string;
}

interface TerminalExitedEvent {
  session_id: string;
  exit_code: number;
}

export default function XtermTerminal({ sessionId, isActive }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const searchBarRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchVisibleRef = useRef(false);
  const markSessionDead = useTerminalStore((s) => s.markSessionDead);

  useEffect(() => {
    if (!containerRef.current) return;

    // ── Create xterm instance ────────────────────────────────
    const term = new Terminal({
      fontFamily: '"JetBrains Mono", "Cascadia Code", "Fira Code", Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.4,
      letterSpacing: 0,
      cursorBlink: true,
      cursorStyle: "block",
      scrollback: 10000,
      allowTransparency: true,
      windowsMode: false,
      convertEol: true,
      theme: {
        background:          "#000000",
        foreground:          "#ffffff",
        cursor:              "#e4e4e7",
        cursorAccent:        "#000000",
        selectionBackground: "#333333",
        black:               "#000000",
        red:                 "#ef4444",
        green:               "#10b981",
        yellow:              "#f59e0b",
        blue:                "#3b82f6",
        magenta:             "#7c3aed",
        cyan:                "#06b6d4",
        white:               "#e8eaf0",
        brightBlack:         "#5a6270",
        brightRed:           "#f87171",
        brightGreen:         "#34d399",
        brightYellow:        "#fbbf24",
        brightBlue:          "#60a5fa",
        brightMagenta:       "#a78bfa",
        brightCyan:          "#22d3ee",
        brightWhite:         "#f9fafb",
      },
    });

    // ── Load addons ─────────────────────────────────────────
    const fitAddon    = new FitAddon();
    const webLinks    = new WebLinksAddon();
    const searchAddon = new SearchAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinks);
    term.loadAddon(searchAddon);

    term.open(containerRef.current);

    // Fit after a brief delay to let the DOM settle
    requestAnimationFrame(() => {
      try { fitAddon.fit(); } catch {}
      sendResize(fitAddon, sessionId);
    });

    termRef.current    = term;
    fitAddonRef.current    = fitAddon;
    searchAddonRef.current = searchAddon;

    // ── Listen for PTY output ────────────────────────────────
    // The Rust backend emits "terminal-output" with { session_id, data }
    const unlistenOutput = listen<TerminalOutputEvent>("terminal-output", (ev) => {
      if (ev.payload.session_id === sessionId) {
        term.write(ev.payload.data);
        useTerminalStore.getState().appendOutput(sessionId, ev.payload.data);
      }
    });

    // ── Listen for process exit ──────────────────────────────
    const unlistenExit = listen<TerminalExitedEvent>("terminal-exited", (ev) => {
      if (ev.payload.session_id === sessionId) {
        const code  = ev.payload.exit_code;
        const color = code === 0 ? "\x1b[32m" : "\x1b[31m";
        term.writeln(`\r\n${color}[Process exited with code ${code}]\x1b[0m`);
        markSessionDead(sessionId);
      }
    });

    // ── Send keystrokes → PTY (raw bytes) ───────────────────
    term.onData((data) => {
      const bytes = Array.from(new TextEncoder().encode(data));
      invoke("write_to_terminal", { sessionId, data: bytes }).catch(console.error);
    });

    // ── Ctrl+F → inline search ───────────────────────────────
    term.attachCustomKeyEventHandler((ev) => {
      if (ev.ctrlKey && ev.key === "f" && ev.type === "keydown") {
        toggleSearch();
        return false;
      }
      if (ev.key === "Escape" && ev.type === "keydown" && searchVisibleRef.current) {
        hideSearch();
        return false;
      }
      return true;
    });

    // ── Resize observer ──────────────────────────────────────
    const observer = new ResizeObserver(() => {
      try {
        fitAddon.fit();
        sendResize(fitAddon, sessionId);
      } catch {}
    });
    observer.observe(containerRef.current);

    // ── Cleanup ──────────────────────────────────────────────
    return () => {
      observer.disconnect();
      unlistenOutput.then((fn) => fn());
      unlistenExit.then((fn) => fn());
      term.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // ── Refit when this tab becomes active ───────────────────
  useEffect(() => {
    if (isActive) {
      requestAnimationFrame(() => {
        try {
          fitAddonRef.current?.fit();
          sendResize(fitAddonRef.current!, sessionId);
        } catch {}
      });
    }
  }, [isActive, sessionId]);

  // ── Search helpers ────────────────────────────────────────
  function toggleSearch() {
    searchVisibleRef.current ? hideSearch() : showSearch();
  }
  function showSearch() {
    searchVisibleRef.current = true;
    if (searchBarRef.current) {
      searchBarRef.current.style.display = "flex";
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    }
  }
  function hideSearch() {
    searchVisibleRef.current = false;
    if (searchBarRef.current) searchBarRef.current.style.display = "none";
    searchAddonRef.current?.clearDecorations();
    termRef.current?.focus();
  }
  function doSearch(query: string, direction: "next" | "prev" = "next") {
    if (!query) return;
    const opts = {
      caseSensitive: false,
      decorations: {
        matchBackground:           "#e4e4e744",
        matchBorder:               "#e4e4e7",
        matchOverviewRuler:        "#e4e4e7",
        activeMatchBackground:     "#e4e4e7",
        activeMatchBorder:         "#ffffff",
        activeMatchColorOverviewRuler: "#ffffff",
      },
    };
    if (direction === "next") searchAddonRef.current?.findNext(query, opts);
    else                       searchAddonRef.current?.findPrevious(query, opts);
  }

  return (
    <div className="xterm-wrapper" style={{ display: isActive ? "flex" : "none" }}>

      {/* Inline search bar (hidden by default) */}
      <div ref={searchBarRef} className="xterm-search-bar" style={{ display: "none" }}>
        <input
          ref={searchInputRef}
          className="xterm-search-input"
          placeholder="Find in terminal…"
          onChange={(e) => doSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") doSearch(e.currentTarget.value, e.shiftKey ? "prev" : "next");
            if (e.key === "Escape") hideSearch();
          }}
        />
        <button className="xterm-search-btn" onClick={() => doSearch(searchInputRef.current?.value ?? "", "prev")}>↑</button>
        <button className="xterm-search-btn" onClick={() => doSearch(searchInputRef.current?.value ?? "", "next")}>↓</button>
        <button className="xterm-search-close" onClick={hideSearch}>✕</button>
      </div>

      {/* Terminal canvas */}
      <div ref={containerRef} className="xterm-container" />

      <style>{`
        .xterm-wrapper {
          position: relative;
          flex: 1;
          flex-direction: column;
          overflow: hidden;
          background: var(--bg-0);
          min-height: 0;
        }
        .xterm-container {
          flex: 1;
          min-height: 0;
          overflow: hidden;
          padding: 4px 6px;
        }
        /* Fix xterm canvas sizing */
        .xterm { height: 100% !important; }
        .xterm-viewport { overflow-y: auto !important; }

        /* Inline search bar */
        .xterm-search-bar {
          position: absolute;
          top: 0;
          right: 0;
          z-index: 100;
          display: flex;
          align-items: center;
          gap: 4px;
          background: var(--bg-3);
          border: 1px solid var(--border);
          border-radius: 0 0 0 var(--radius-md);
          padding: 4px 8px;
          box-shadow: 0 4px 16px rgba(0,0,0,0.4);
          animation: sbFade 80ms ease both;
        }
        @keyframes sbFade { from { opacity:0; transform:translateY(-4px); } to { opacity:1; transform:translateY(0); } }
        .xterm-search-input {
          background: var(--bg-2);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          color: var(--text-primary);
          font-size: var(--text-sm);
          font-family: var(--font-ui);
          padding: 3px 8px;
          outline: none;
          width: 200px;
        }
        .xterm-search-input:focus { border-color: var(--accent); }
        .xterm-search-btn {
          background: var(--bg-4);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          color: var(--text-secondary);
          cursor: pointer;
          padding: 2px 8px;
          font-size: var(--text-sm);
          transition: background var(--trans-fast);
        }
        .xterm-search-btn:hover { background: var(--bg-5); color: var(--text-primary); }
        .xterm-search-close {
          background: transparent;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          font-size: 14px;
          padding: 2px 4px;
        }
        .xterm-search-close:hover { color: var(--text-primary); }
      `}</style>
    </div>
  );
}

// ── Helper: send terminal dimensions to Rust ──────────────────────────────────
function sendResize(fitAddon: FitAddon | null, sessionId: string) {
  if (!fitAddon) return;
  const dims = fitAddon.proposeDimensions();
  if (!dims) return;
  invoke("resize_terminal", {
    sessionId,
    cols: dims.cols,
    rows: dims.rows,
  }).catch(() => {});
}
