/* ============================================================
   App.tsx — Phase 2: Full 5-zone IDE layout
   ActivityBar → Sidebar → EditorArea → BottomPanel → StatusBar
   ============================================================ */
import { useEffect, useCallback } from "react";
import { PanelGroup, Panel, PanelResizeHandle } from "react-resizable-panels";
import TitleBar from "./components/layout/TitleBar";
import ActivityBar from "./components/layout/ActivityBar";
import Sidebar from "./components/layout/Sidebar";
import EditorGroup from "./components/editor/EditorGroup";
import BottomPanel from "./components/layout/BottomPanel";
import StatusBar from "./components/layout/StatusBar";
import AICommandPalette from "./components/ui/AICommandPalette";
import CommandPalette from "./components/ui/CommandPalette";
import SettingsModal from "./components/ui/SettingsModal";
import AboutModal from "./components/ui/AboutModal";
import { useUIStore } from "./store/uiStore";
import { useInlineCompletions } from "./components/ai/InlineSuggest";
import DiffReview from "./components/ai/DiffReview";
import AIPanel from "./components/ai/AIPanel";

export default function App() {
  useInlineCompletions();

  const {
    sidebarView,
    bottomPanelOpen,
    agentPanelOpen,
    setBottomPanelOpen,
    commandPaletteOpen,
    quickOpenOpen,
    aiCommandPaletteOpen,
    setCommandPaletteOpen,
    setQuickOpenOpen,
    setAiCommandPaletteOpen,
  } = useUIStore();

  // Global keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Ctrl+Shift+P — Command Palette
      if (e.ctrlKey && e.shiftKey && e.key === "P") {
        e.preventDefault();
        setCommandPaletteOpen(!commandPaletteOpen);
        setQuickOpenOpen(false);
        return;
      }
      // Ctrl+P — Quick File Open
      if (e.ctrlKey && !e.shiftKey && e.key === "p") {
        e.preventDefault();
        setQuickOpenOpen(!quickOpenOpen);
        setCommandPaletteOpen(false);
        return;
      }
      // Ctrl+` — Toggle Terminal
      if (e.ctrlKey && e.key === "`") {
        e.preventDefault();
        setBottomPanelOpen(!bottomPanelOpen);
        return;
      }
      // Ctrl+Shift+A — AI Command Palette
      if (e.ctrlKey && e.shiftKey && e.key === "A") {
        e.preventDefault();
        setAiCommandPaletteOpen(!aiCommandPaletteOpen);
        setCommandPaletteOpen(false);
        setQuickOpenOpen(false);
        return;
      }
      // Escape — close palettes
      if (e.key === "Escape") {
        setCommandPaletteOpen(false);
        setQuickOpenOpen(false);
        setAiCommandPaletteOpen(false);
      }
    },
    [commandPaletteOpen, quickOpenOpen, bottomPanelOpen, aiCommandPaletteOpen, setCommandPaletteOpen, setQuickOpenOpen, setBottomPanelOpen, setAiCommandPaletteOpen]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const { theme } = useUIStore();
  useEffect(() => {
    document.body.className = `theme-${theme}`;
  }, [theme]);

  const sidebarOpen = sidebarView !== null;

  return (
    <div className="app-shell">
      <TitleBar />

      <div className="app-body">
        {/* Left icon strip */}
        <ActivityBar />

        {/* Main resizable area: Sidebar + Editor + Bottom Panel */}
        <PanelGroup direction="horizontal" className="app-main" autoSaveId="ide-horizontal">
          {/* Sidebar */}
          {sidebarOpen && (
            <>
              <Panel
                id="sidebar"
                defaultSize={18}
                minSize={12}
                maxSize={40}
                className="sidebar-panel"
              >
                <Sidebar />
              </Panel>
              <PanelResizeHandle className="resize-handle resize-handle--vertical" />
            </>
          )}

          {/* Editor + Bottom stacked vertically */}
          <Panel id="center" defaultSize={sidebarOpen ? 82 : 100} minSize={40}>
            <PanelGroup direction="vertical" autoSaveId="ide-vertical">
              {/* Editor Area */}
              <Panel id="editor" defaultSize={bottomPanelOpen ? 70 : 100} minSize={30}>
                <EditorGroup />
              </Panel>

              {/* Bottom Panel */}
              {bottomPanelOpen && (
                <>
                  <PanelResizeHandle className="resize-handle resize-handle--horizontal" />
                  <Panel id="bottom" defaultSize={30} minSize={15} maxSize={60}>
                    <BottomPanel />
                  </Panel>
                </>
              )}
            </PanelGroup>
          </Panel>

          {/* AI Agent Panel (Right Side) */}
          {agentPanelOpen && (
            <>
              <PanelResizeHandle className="resize-handle resize-handle--vertical" />
              <Panel
                id="agent-panel"
                defaultSize={25}
                minSize={20}
                maxSize={40}
                className="sidebar-panel"
              >
                <AIPanel />
              </Panel>
            </>
          )}
        </PanelGroup>
      </div>

      <StatusBar />

      {/* Overlays */}
      {(commandPaletteOpen || quickOpenOpen) && (
        <CommandPalette mode={quickOpenOpen ? "quickopen" : "commands"} />
      )}
      {aiCommandPaletteOpen && <AICommandPalette />}
      <DiffReview />
      <SettingsModal />
      <AboutModal />

      <style>{`
        .app-shell {
          display: flex;
          flex-direction: column;
          width: 100vw;
          height: 100vh;
          background: var(--bg-0);
          overflow: hidden;
        }

        .app-body {
          display: flex;
          flex: 1;
          overflow: hidden;
        }

        .app-main {
          flex: 1;
          overflow: hidden;
        }

        .sidebar-panel {
          background: var(--sidebar);
          border-right: 1px solid var(--border-soft);
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        #agent-panel {
          background: var(--ai-panel);
          border-left: 1px solid var(--border-soft);
          border-right: none;
        }

        /* Resize handles */
        .resize-handle {
          background: transparent;
          transition: background var(--trans-fast);
          z-index: 10;
          flex-shrink: 0;
        }

        .resize-handle--vertical {
          width: 4px;
          cursor: col-resize;
        }

        .resize-handle--horizontal {
          height: 4px;
          cursor: row-resize;
        }

        .resize-handle:hover,
        .resize-handle[data-resize-handle-active] {
          background: var(--accent);
        }
      `}</style>
    </div>
  );
}
