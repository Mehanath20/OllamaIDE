import { ReactNode, useState, useRef, useEffect } from "react";
import {
  FolderOpen,
  Search,
  GitBranch,
  Bot,
  Settings,
  Puzzle,
} from "lucide-react";
import { useUIStore } from "../../store/uiStore";

type View = "explorer" | "search" | "git" | "ai" | "extensions";

const NAV_ITEMS: { id: View; icon: ReactNode; label: string }[] = [
  { id: "explorer",   icon: <FolderOpen size={22} />, label: "Explorer" },
  { id: "search",     icon: <Search size={22} />,     label: "Search" },
  { id: "git",        icon: <GitBranch size={22} />,  label: "Source Control" },
  { id: "ai",         icon: <Bot size={22} />,         label: "AI Assistant" },
  { id: "extensions", icon: <Puzzle size={22} />,     label: "Extensions" },
];

export default function ActivityBar() {
  const { 
    sidebarView, 
    setSidebarView, 
    agentPanelOpen, 
    setAgentPanelOpen, 
    setSettingsOpen,
    setCommandPaletteOpen,
    setKeybindingOpen
  } = useUIStore();
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleClick = (id: View) => {
    if (id === "ai") {
      setAgentPanelOpen(!agentPanelOpen);
      return;
    }
    // Toggle off if same icon clicked
    if (sidebarView === id) {
      setSidebarView(null);
    } else {
      setSidebarView(id as any);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setSettingsMenuOpen(false);
      }
    };
    if (settingsMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [settingsMenuOpen]);

  return (
    <div className="activity-bar">
      <div className="activity-top">
        {NAV_ITEMS.map((item) => {
          const isActive = item.id === "ai" ? agentPanelOpen : sidebarView === item.id;
          return (
            <button
              key={item.id}
              className={`activity-item ${isActive ? "activity-item--active" : ""}`}
              title={item.label}
              onClick={() => handleClick(item.id)}
            >
              {item.icon}
              {isActive && <span className="activity-indicator" />}
            </button>
          );
        })}
      </div>

      <div className="activity-bottom">
        <div style={{ position: 'relative', width: '100%' }} ref={menuRef}>
          <button 
            className={`activity-item ${settingsMenuOpen ? "activity-item--active" : ""}`} 
            title="Manage" 
            onClick={() => setSettingsMenuOpen(!settingsMenuOpen)}
          >
            <Settings size={22} />
          </button>

          {settingsMenuOpen && (
            <div className="settings-context-menu">
              <div 
                className="settings-menu-item"
                onClick={() => { 
                  setSettingsOpen(true); 
                  setSettingsMenuOpen(false); 
                  setTimeout(() => {
                    document.getElementById("settings-editor")?.scrollIntoView({ behavior: "smooth" });
                  }, 100);
                }}
              >
                <span>Editor Settings</span>
              </div>
              <div 
                className="settings-menu-item"
                onClick={() => { 
                  setSettingsOpen(true); 
                  setSettingsMenuOpen(false); 
                  setTimeout(() => {
                    document.getElementById("settings-ai")?.scrollIntoView({ behavior: "smooth" });
                  }, 100);
                }}
              >
                <span>Open Antigravity User Settings</span>
                <span className="settings-menu-shortcut">Ctrl+,</span>
              </div>
              <div className="settings-menu-divider" />
              <div 
                className="settings-menu-item"
                onClick={() => { setSidebarView("extensions"); setSettingsMenuOpen(false); }}
              >
                <span>Extensions</span>
                <span className="settings-menu-shortcut">Ctrl+Shift+X</span>
              </div>
              <div 
                className="settings-menu-item"
                onClick={() => { 
                  setKeybindingOpen(true); 
                  setSettingsMenuOpen(false); 
                }}
              >
                <span>Open Keyboard Shortcuts</span>
                <span className="settings-menu-shortcut">Ctrl+K Ctrl+S</span>
              </div>
              <div 
                className="settings-menu-item"
                onClick={() => { 
                  setCommandPaletteOpen(true); 
                  setSettingsMenuOpen(false); 
                }}
              >
                <span>Configure Snippets</span>
              </div>
              <div className="settings-menu-divider" />
              <div 
                className="settings-menu-item"
                onClick={() => { 
                  setCommandPaletteOpen(true); 
                  setSettingsMenuOpen(false); 
                }}
              >
                <span>Tasks</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .activity-bar {
          width: var(--activity-bar-w);
          background: var(--bg-1);
          border-right: 1px solid var(--border-soft);
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          flex-shrink: 0;
          z-index: 50;
        }

        .activity-top,
        .activity-bottom {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: var(--space-2) 0;
          gap: 2px;
          width: 100%;
        }

        .activity-item {
          position: relative;
          width: 100%;
          height: 48px;
          background: transparent;
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--text-muted);
          transition: color var(--trans-fast), background var(--trans-fast);
          border-radius: 0;
        }

        .activity-item:hover { 
          color: var(--text-primary);
          background: rgba(255,255,255,0.04);
        }

        .activity-item--active {
          color: var(--text-primary);
        }

        .activity-indicator {
          position: absolute;
          left: 0;
          top: 50%;
          transform: translateY(-50%);
          width: 2px;
          height: 24px;
          background: var(--accent);
          border-radius: 0 2px 2px 0;
        }

        .settings-context-menu {
          position: absolute;
          bottom: 10px;
          left: 100%;
          margin-left: 10px;
          background: var(--bg-0, #1e1e1e);
          border: 1px solid var(--border-soft, #333);
          border-radius: 6px;
          width: 320px;
          padding: 6px 0;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
          z-index: 1000;
          display: flex;
          flex-direction: column;
        }

        .settings-menu-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 16px;
          color: var(--text-primary, #ccc);
          font-size: 13px;
          cursor: pointer;
        }

        .settings-menu-item:hover {
          background: var(--accent, #007acc);
          color: #fff;
        }

        .settings-menu-shortcut {
          color: var(--text-muted, #888);
          font-size: 12px;
        }

        .settings-menu-item:hover .settings-menu-shortcut {
          color: rgba(255, 255, 255, 0.8);
        }

        .settings-menu-divider {
          height: 1px;
          background: var(--border-soft, #333);
          margin: 4px 0;
        }
      `}</style>
    </div>
  );
}
