import { ReactNode } from "react";
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
  const { sidebarView, setSidebarView, agentPanelOpen, setAgentPanelOpen } = useUIStore();

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
        <button className="activity-item" title="Settings" onClick={() => useUIStore.getState().setSettingsOpen(true)}>
          <Settings size={22} />
        </button>
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
      `}</style>
    </div>
  );
}
