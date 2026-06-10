/* ============================================================
   Sidebar.tsx — Panel switcher
   Renders the correct panel based on uiStore.sidebarView
   ============================================================ */

import { useUIStore } from "../../store/uiStore";
import FileExplorer from "../explorer/FileExplorer";
import SearchPanel from "../sidebar/SearchPanel";
import GitPanel from "../sidebar/GitPanel";
import ExtensionsPanel from "../sidebar/ExtensionsPanel";

export default function Sidebar() {
  const { sidebarView } = useUIStore();

  return (
    <div className="sidebar">
      {sidebarView === "explorer" && <FileExplorer />}
      {sidebarView === "search" && <SearchPanel />}
      {sidebarView === "git" && <GitPanel />}
      {sidebarView === "extensions" && <ExtensionsPanel />}

      <style>{`
        .sidebar {
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          background: var(--sidebar);
        }
      `}</style>
    </div>
  );
}
