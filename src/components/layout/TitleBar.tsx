import { useState, useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useFileStore } from "../../store/fileStore";
import { useEditorStore } from "../../store/editorStore";
import { useUIStore } from "../../store/uiStore";
import { useTerminalStore } from "../../store/terminalStore";
import { useAIStore } from "../../store/aiStore";
import { open, save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { getLanguageFromExt } from "../../lib/fileIcons";


type MenuItemDef =
  | { type: "separator" }
  | { type: "item"; label: string; shortcut?: string; action?: string; disabled?: boolean }
  | { type: "submenu"; label: string; action?: string; disabled?: boolean };

const fileMenuStructure: MenuItemDef[] = [
  { type: "item", label: "New Text File", shortcut: "Ctrl+N", action: "new-file" },
  { type: "item", label: "New File...", shortcut: "Ctrl+Alt+Windows+N", action: "new-file" },
  { type: "item", label: "New Folder...", action: "new-folder" },
  { type: "item", label: "New Window", shortcut: "Ctrl+Shift+N", action: "unsupported" },
  { type: "submenu", label: "New Window with Profile", action: "unsupported" },
  { type: "separator" },
  { type: "item", label: "Open File...", shortcut: "Ctrl+O", action: "open-file" },
  { type: "item", label: "Open Folder...", shortcut: "Ctrl+K Ctrl+O", action: "open-folder" },
  { type: "item", label: "Open Workspace from File...", action: "unsupported" },
  { type: "submenu", label: "Open Recent", action: "unsupported" },
  { type: "separator" },
  { type: "item", label: "Add Folder to Workspace...", action: "unsupported" },
  { type: "item", label: "Save Workspace As...", action: "unsupported" },
  { type: "item", label: "Duplicate Workspace", action: "unsupported" },
  { type: "separator" },
  { type: "item", label: "Save", shortcut: "Ctrl+S", action: "save" },
  { type: "item", label: "Save As...", shortcut: "Ctrl+Shift+S", action: "save-as" },
  { type: "item", label: "Save All", shortcut: "Ctrl+K S", action: "save-all" },
  { type: "separator" },
  { type: "submenu", label: "Share", action: "unsupported" },
  { type: "separator" },
  { type: "item", label: "Auto Save", action: "unsupported" },
  { type: "item", label: "Preferences", action: "view:settings" },
  { type: "separator" },
  { type: "item", label: "Revert File", action: "revert" },
  { type: "item", label: "Close Editor", shortcut: "Ctrl+F4", action: "close-editor" },
  { type: "item", label: "Close Folder", shortcut: "Ctrl+K F", action: "close-folder" },
  { type: "item", label: "Close Window", shortcut: "Alt+F4", action: "close-window" },
  { type: "separator" },
  { type: "item", label: "Exit", action: "exit" },
];

const editMenuStructure: MenuItemDef[] = [
  { type: "item", label: "Undo", shortcut: "Ctrl+Z", action: "editor:undo" },
  { type: "item", label: "Redo", shortcut: "Ctrl+Y", action: "editor:redo" },
  { type: "separator" },
  { type: "item", label: "Cut", shortcut: "Ctrl+X", action: "editor:editor.action.clipboardCutAction" },
  { type: "item", label: "Copy", shortcut: "Ctrl+C", action: "editor:editor.action.clipboardCopyAction" },
  { type: "item", label: "Paste", shortcut: "Ctrl+V", action: "editor:editor.action.clipboardPasteAction" },
  { type: "separator" },
  { type: "item", label: "Find", shortcut: "Ctrl+F", action: "editor:actions.find" },
  { type: "item", label: "Replace", shortcut: "Ctrl+H", action: "editor:editor.action.startFindReplaceAction" },
  { type: "separator" },
  { type: "item", label: "Find in Files", shortcut: "Ctrl+Shift+F", action: "view:search" },
  { type: "item", label: "Replace in Files", shortcut: "Ctrl+Shift+H", action: "view:search" },
  { type: "separator" },
  { type: "item", label: "Toggle Line Comment", shortcut: "Ctrl+/", action: "editor:editor.action.commentLine" },
  { type: "item", label: "Toggle Block Comment", shortcut: "Shift+Alt+A", action: "editor:editor.action.blockComment" },
  { type: "item", label: "Emmet: Expand Abbreviation", shortcut: "Tab", action: "unsupported" },
];

const selectionMenuStructure: MenuItemDef[] = [
  { type: "item", label: "Select All", shortcut: "Ctrl+A", action: "editor:editor.action.selectAll" },
  { type: "item", label: "Expand Selection", shortcut: "Shift+Alt+RightArrow", action: "editor:editor.action.smartSelect.expand" },
  { type: "item", label: "Shrink Selection", shortcut: "Shift+Alt+LeftArrow", action: "editor:editor.action.smartSelect.shrink" },
  { type: "separator" },
  { type: "item", label: "Copy Line Up", shortcut: "Shift+Alt+UpArrow", action: "editor:editor.action.copyLinesUpAction" },
  { type: "item", label: "Copy Line Down", shortcut: "Shift+Alt+DownArrow", action: "editor:editor.action.copyLinesDownAction" },
  { type: "item", label: "Move Line Up", shortcut: "Alt+UpArrow", action: "editor:editor.action.moveLinesUpAction" },
  { type: "item", label: "Move Line Down", shortcut: "Alt+DownArrow", action: "editor:editor.action.moveLinesDownAction" },
  { type: "item", label: "Duplicate Selection", action: "editor:editor.action.duplicateSelection" },
  { type: "separator" },
  { type: "item", label: "Add Cursor Above", shortcut: "Ctrl+Alt+UpArrow", action: "editor:editor.action.insertCursorAbove" },
  { type: "item", label: "Add Cursor Below", shortcut: "Ctrl+Alt+DownArrow", action: "editor:editor.action.insertCursorBelow" },
  { type: "item", label: "Add Cursors to Line Ends", shortcut: "Shift+Alt+I", action: "editor:editor.action.insertCursorAtEndOfEachLineSelected" },
  { type: "item", label: "Add Next Occurrence", shortcut: "Ctrl+D", action: "editor:editor.action.addSelectionToNextFindMatch" },
  { type: "item", label: "Add Previous Occurrence", action: "editor:editor.action.addSelectionToPreviousFindMatch" },
  { type: "item", label: "Select All Occurrences", action: "editor:editor.action.selectHighlights" },
  { type: "separator" },
  { type: "item", label: "Switch to Ctrl+Click for Multi-Cursor", action: "unsupported" },
  { type: "item", label: "Column Selection Mode", action: "unsupported" },
];

const viewMenuStructure: MenuItemDef[] = [
  { type: "item", label: "Command Palette...", shortcut: "Ctrl+Shift+P", action: "view:command-palette" },
  { type: "item", label: "Open View...", action: "unsupported" },
  { type: "separator" },
  { type: "submenu", label: "Appearance", action: "unsupported" },
  { type: "submenu", label: "Editor Layout", action: "unsupported" },
  { type: "separator" },
  { type: "item", label: "Explorer", shortcut: "Ctrl+Shift+E", action: "view:explorer" },
  { type: "item", label: "Search", shortcut: "Ctrl+Shift+F", action: "view:search" },
  { type: "item", label: "Source Control", shortcut: "Ctrl+Shift+G", action: "view:git" },
  { type: "item", label: "Run", shortcut: "Ctrl+Shift+D", action: "unsupported" },
  { type: "item", label: "Extensions", shortcut: "Ctrl+Shift+X", action: "view:extensions" },
  { type: "separator" },
  { type: "item", label: "Problems", shortcut: "Ctrl+Shift+M", action: "view:bottom:problems" },
  { type: "item", label: "Output", shortcut: "Ctrl+Shift+U", action: "view:bottom:output" },
  { type: "item", label: "Debug Console", shortcut: "Ctrl+Shift+Y", action: "view:bottom:debug" },
  { type: "item", label: "Terminal", shortcut: "Ctrl+`", action: "view:bottom:terminal" },
  { type: "separator" },
  { type: "item", label: "Word Wrap", shortcut: "Alt+Z", action: "editor:editor.action.toggleWordWrap" },
];

const goMenuStructure: MenuItemDef[] = [
  { type: "item", label: "Back", shortcut: "Alt+LeftArrow", action: "unsupported" },
  { type: "item", label: "Forward", shortcut: "Alt+RightArrow", action: "unsupported" },
  { type: "item", label: "Last Edit Location", shortcut: "Ctrl+K Ctrl+Q", action: "unsupported" },
  { type: "separator" },
  { type: "submenu", label: "Switch Editor", action: "unsupported" },
  { type: "submenu", label: "Switch Group", action: "unsupported" },
  { type: "separator" },
  { type: "item", label: "Go to File...", shortcut: "Ctrl+P", action: "view:quick-open" },
  { type: "item", label: "Go to Symbol in Workspace...", shortcut: "Ctrl+T", action: "unsupported" },
  { type: "separator" },
  { type: "item", label: "Go to Symbol in Editor...", shortcut: "Ctrl+Shift+O", action: "editor:editor.action.quickOutline" },
  { type: "item", label: "Go to Definition", shortcut: "F12", action: "editor:editor.action.revealDefinition" },
  { type: "item", label: "Go to Declaration", action: "editor:editor.action.revealDeclaration" },
  { type: "item", label: "Go to Type Definition", action: "editor:editor.action.goToTypeDefinition" },
  { type: "item", label: "Go to Implementations", shortcut: "Ctrl+F12", action: "editor:editor.action.goToImplementation" },
  { type: "item", label: "Go to References", shortcut: "Shift+F12", action: "editor:editor.action.referenceSearch.trigger" },
  { type: "separator" },
  { type: "item", label: "Go to Line/Column...", shortcut: "Ctrl+G", action: "editor:editor.action.gotoLine" },
  { type: "item", label: "Go to Bracket", shortcut: "Ctrl+Shift+\\", action: "editor:editor.action.jumpToBracket" },
  { type: "separator" },
  { type: "item", label: "Next Problem", shortcut: "F8", action: "editor:editor.action.marker.next" },
  { type: "item", label: "Previous Problem", shortcut: "Shift+F8", action: "editor:editor.action.marker.prev" },
  { type: "separator" },
  { type: "item", label: "Next Change", shortcut: "Alt+F3", action: "unsupported" },
  { type: "item", label: "Previous Change", shortcut: "Shift+Alt+F3", action: "unsupported" },
];

const runMenuStructure: MenuItemDef[] = [
  { type: "item", label: "Start Debugging", shortcut: "F5", action: "run-active-file" },
  { type: "item", label: "Run Without Debugging", shortcut: "Ctrl+F5", action: "run-active-file" },
  { type: "item", label: "Stop Debugging", shortcut: "Shift+F5", action: "unsupported" },
  { type: "item", label: "Restart Debugging", shortcut: "Ctrl+Shift+F5", action: "unsupported" },
  { type: "separator" },
  { type: "item", label: "Open Configurations", action: "unsupported" },
  { type: "item", label: "Add Configuration...", action: "unsupported" },
  { type: "separator" },
  { type: "item", label: "Step Over", shortcut: "F10", action: "unsupported" },
  { type: "item", label: "Step Into", shortcut: "F11", action: "unsupported" },
  { type: "item", label: "Step Out", shortcut: "Shift+F11", action: "unsupported" },
  { type: "item", label: "Continue", shortcut: "F5", action: "unsupported" },
  { type: "separator" },
  { type: "item", label: "Toggle Breakpoint", shortcut: "F9", action: "unsupported" },
  { type: "submenu", label: "New Breakpoint", action: "unsupported" },
  { type: "separator" },
  { type: "item", label: "Enable All Breakpoints", action: "unsupported" },
  { type: "item", label: "Disable All Breakpoints", action: "unsupported" },
  { type: "item", label: "Remove All Breakpoints", action: "unsupported" },
  { type: "separator" },
  { type: "item", label: "Install Additional Debuggers...", action: "unsupported" },
];

const terminalMenuStructure: MenuItemDef[] = [
  { type: "item", label: "New Terminal", shortcut: "Ctrl+Shift+`", action: "new-terminal" },
  { type: "item", label: "Split Terminal", shortcut: "Ctrl+Shift+5", action: "unsupported" },
  { type: "item", label: "New Terminal Window", shortcut: "Ctrl+Shift+Alt+`", action: "unsupported" },
  { type: "separator" },
  { type: "item", label: "Run Task...", action: "unsupported" },
  { type: "item", label: "Run Build Task...", shortcut: "Ctrl+Shift+B", action: "unsupported" },
  { type: "item", label: "Run Active File", action: "run-active-file" },
  { type: "item", label: "Run Selected Text", action: "unsupported" },
  { type: "separator" },
  { type: "item", label: "Show Running Tasks...", action: "unsupported" },
  { type: "item", label: "Restart Running Task...", action: "unsupported" },
  { type: "item", label: "Terminate Task...", action: "unsupported" },
  { type: "separator" },
  { type: "item", label: "Configure Tasks...", action: "unsupported" },
  { type: "item", label: "Configure Default Build Task...", action: "unsupported" },
];

const helpMenuStructure: MenuItemDef[] = [
  { type: "item", label: "Welcome", action: "help:welcome" },
  { type: "item", label: "Show All Commands", shortcut: "Ctrl+Shift+P", action: "view:command-palette" },
  { type: "item", label: "Editor Playground", action: "unsupported" },
  { type: "item", label: "Open Walkthrough...", action: "unsupported" },
  { type: "item", label: "Provide Feedback", action: "unsupported" },
  { type: "separator" },
  { type: "item", label: "View License", action: "unsupported" },
  { type: "separator" },
  { type: "item", label: "Restart Window", action: "help:restart" },
  { type: "item", label: "Open Process Explorer", action: "unsupported" },
  { type: "separator" },
  { type: "item", label: "Check for Updates...", action: "unsupported" },
  { type: "separator" },
  { type: "item", label: "About", action: "help:about" },
];

export default function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const appWindow = getCurrentWindow();

  const { workspaceRoot, setWorkspaceRoot, setCreatingItem, setTree } = useFileStore();
  const { openFiles, activeFile, openFile, closeFile, updateContent, markSaved } = useEditorStore();
  const { setSidebarView, setBottomPanelOpen, setBottomPanelTab, commandPaletteOpen, setCommandPaletteOpen, quickOpenOpen, setQuickOpenOpen, setSettingsOpen, setAboutOpen } = useUIStore();

  const handleMenuAction = async (action: string) => {
    setActiveMenu(null);

    try {
      if (action.startsWith("editor:")) {
        const monacoAction = action.replace("editor:", "");
        document.dispatchEvent(new CustomEvent("editor-action", { detail: monacoAction }));
        return;
      }

      if (action.startsWith("view:")) {
        const viewAction = action.replace("view:", "");
        if (viewAction === "command-palette") {
          setCommandPaletteOpen(!commandPaletteOpen);
        } else if (viewAction.startsWith("bottom:")) {
          setBottomPanelOpen(true);
          setBottomPanelTab(viewAction.split(":")[1] as any);
        } else if (viewAction === "quick-open") {
          setQuickOpenOpen(!quickOpenOpen);
        } else if (viewAction === "settings") {
          setSettingsOpen(true);
        } else {
          setSidebarView(viewAction as any);
        }
        return;
      }

      if (action.startsWith("help:")) {
        const helpAction = action.replace("help:", "");
        if (helpAction === "about") {
          setAboutOpen(true);
        } else if (helpAction === "welcome") {
          openFile({
            path: "Welcome.md",
            name: "Welcome",
            content: "# Welcome to Ollama IDE\n\nYour powerful offline AI assistant.",
            language: "markdown",
            isDirty: false,
          });
        } else if (helpAction === "restart") {
          window.location.reload();
        }
        return;
      }

      switch (action) {
        case "unsupported": {
          alert("This feature is currently not supported in the offline engine.");
          break;
        }
        case "run-active-file": {
          if (!activeFile) {
            alert("No active file to run.");
            return;
          }
          const ext = activeFile.split(".").pop()?.toLowerCase();
          const activeTerminal = useTerminalStore.getState().activeId;
          
          if (!activeTerminal) {
            alert("Please open a Terminal first before running the file.");
            setBottomPanelOpen(true);
            return;
          }

          let runCmd = "";
          if (ext === "py") runCmd = `python "${activeFile}"`;
          else if (ext === "js") runCmd = `node "${activeFile}"`;
          else if (ext === "ts") runCmd = `npx tsx "${activeFile}"`;
          else if (ext === "html") runCmd = `start "${activeFile}"`;
          else if (ext === "c") runCmd = `gcc "${activeFile}" -o temp_out.exe; .\\temp_out.exe`;
          else if (ext === "cpp") runCmd = `g++ "${activeFile}" -o temp_out.exe; .\\temp_out.exe`;
          else if (ext === "rs") runCmd = `rustc "${activeFile}" -o temp_out.exe; .\\temp_out.exe`;
          else if (ext === "go") runCmd = `go run "${activeFile}"`;
          else if (ext === "java") runCmd = `java "${activeFile}"`;
          else if (ext === "sh") runCmd = `bash "${activeFile}"`;
          else if (ext === "bat" || ext === "cmd" || ext === "ps1") runCmd = `& "${activeFile}"`;
          else runCmd = `start "${activeFile}"`; // Fallback to OS default

          setBottomPanelOpen(true);
          try {
            await invoke("write_to_terminal", { 
              sessionId: activeTerminal, 
              data: Array.from(new TextEncoder().encode(runCmd + "\r\n")) 
            });
          } catch (e) {
            console.error("Failed to run file in terminal:", e);
          }
          break;
        }
        case "new-terminal": {
          setBottomPanelOpen(true);
          setBottomPanelTab("terminal");
          document.dispatchEvent(new CustomEvent("new-terminal-action"));
          break;
        }
        case "new-file": {
          if (!workspaceRoot) {
            const untitledId = `Untitled-${Date.now()}`;
            openFile({
              path: untitledId,
              name: "Untitled",
              content: "",
              language: "plaintext",
              isDirty: true,
            });
            return;
          }
          setCreatingItem({ type: "file", parentPath: null });
          break;
        }
        case "new-folder": {
          if (!workspaceRoot) {
            const parentDir = await open({ directory: true, multiple: false, title: "Select Parent Directory for New Folder" });
            if (typeof parentDir === "string") {
              const folderName = prompt("Enter new folder name:");
              if (folderName) {
                const newFolderPath = `${parentDir}/${folderName}`;
                try {
                  await invoke("create_dir", { path: newFolderPath });
                  setWorkspaceRoot(newFolderPath);
                  const entries = await invoke<{ name: string; path: string; is_dir: boolean; size?: number }[]>(
                    "list_dir",
                    { path: newFolderPath }
                  );
                  setTree(entries.map((e) => ({
                    name: e.name,
                    path: e.path,
                    isDir: e.is_dir,
                    size: e.size,
                    expanded: false,
                  })));
                  await invoke("watch_directory", { path: newFolderPath });
                } catch (err) {
                  alert("Failed to create folder: " + err);
                }
              }
            }
            return;
          }
          setCreatingItem({ type: "folder", parentPath: null });
          break;
        }
        case "open-file": {
          const selected = await open({ directory: false, multiple: false });
          if (typeof selected === "string") {
            const content = await invoke<string>("read_file", { path: selected });
            const name = selected.split(/[\\/]/).pop() || selected;
            const ext = name.split(".").pop() || "";
            openFile({
              path: selected,
              name,
              content,
              language: getLanguageFromExt(ext),
              isDirty: false,
            });
          }
          break;
        }
        case "open-folder": {
          const selected = await open({ directory: true, multiple: false });
          if (typeof selected === "string") {
            setWorkspaceRoot(selected);
            const entries = await invoke<{ name: string; path: string; is_dir: boolean; size?: number }[]>(
              "list_dir",
              { path: selected }
            );
            setTree(entries.map((e) => ({
              name: e.name,
              path: e.path,
              isDir: e.is_dir,
              size: e.size,
              expanded: false,
            })));
            await invoke("watch_directory", { path: selected });
          }
          break;
        }
        case "save": {
          if (!activeFile) return;
          const fileData = openFiles.find(f => f.path === activeFile);
          if (fileData) {
            if (activeFile.startsWith("Untitled-")) {
              const newPath = await save({ defaultPath: "Untitled.txt" });
              if (typeof newPath === "string") {
                await invoke("write_file", { path: newPath, content: fileData.content });
                closeFile(activeFile);
                const name = newPath.split(/[\\/]/).pop() || newPath;
                const ext = name.split(".").pop() || "";
                openFile({
                  path: newPath,
                  name,
                  content: fileData.content,
                  language: getLanguageFromExt(ext),
                  isDirty: false,
                });
              }
            } else {
              await invoke("write_file", { path: activeFile, content: fileData.content });
              markSaved(activeFile);
            }
          }
          break;
        }
        case "save-as": {
          if (!activeFile) return;
          const fileData = openFiles.find(f => f.path === activeFile);
          if (fileData) {
            const newPath = await save({ defaultPath: fileData.name });
            if (typeof newPath === "string") {
              await invoke("write_file", { path: newPath, content: fileData.content });
              const content = await invoke<string>("read_file", { path: newPath });
              const name = newPath.split(/[\\/]/).pop() || newPath;
              const ext = name.split(".").pop() || "";
              openFile({
                path: newPath,
                name,
                content,
                language: getLanguageFromExt(ext),
                isDirty: false,
              });
            }
          }
          break;
        }
        case "save-all": {
          for (const f of openFiles) {
            if (f.isDirty) {
              await invoke("write_file", { path: f.path, content: f.content });
              markSaved(f.path);
            }
          }
          break;
        }
        case "revert": {
          if (!activeFile) return;
          try {
            const content = await invoke<string>("read_file", { path: activeFile });
            updateContent(activeFile, content);
            markSaved(activeFile);
          } catch (e) {
            console.error("Failed to revert:", e);
          }
          break;
        }
        case "close-editor": {
          if (activeFile) closeFile(activeFile);
          break;
        }
        case "close-folder": {
          setWorkspaceRoot("");
          setTree([]);
          break;
        }
        case "close-window":
        case "exit": {
          appWindow.close();
          break;
        }
      }
    } catch (err) {
      console.error(`Action ${action} failed:`, err);
    }
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.titlebar-menu')) {
        setActiveMenu(null);
      }
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  const minimize = () => appWindow.minimize();
  const toggleMax = async () => {
    await appWindow.toggleMaximize();
    setIsMaximized(await appWindow.isMaximized());
  };
  const close = () => appWindow.close();

  const getMenuStructure = (menuName: string): MenuItemDef[] | null => {
    switch (menuName) {
      case "File": return fileMenuStructure;
      case "Edit": return editMenuStructure;
      case "Selection": return selectionMenuStructure;
      case "View": return viewMenuStructure;
      case "Go": return goMenuStructure;
      case "Run": return runMenuStructure;
      case "Terminal": return terminalMenuStructure;
      case "Help": return helpMenuStructure;
      default: return null;
    }
  };

  return (
    <div className="titlebar" data-tauri-drag-region>
      <div className="titlebar-left" data-tauri-drag-region>
        <span className="titlebar-logo">
          <img src="/icon.png" alt="Logo" width="16" height="16" style={{ borderRadius: '4px' }} />
        </span>
        <span className="titlebar-name">AntiNetwork</span>
      </div>

      <div className="titlebar-center" data-tauri-drag-region>
        <div className="titlebar-menu">
          {["File", "Edit", "Selection", "View", "Go", "Run", "Terminal", "Help"].map((menu) => {
            const structure = getMenuStructure(menu);
            return (
              <div key={menu} className="menu-container">
                <button
                  className={`titlebar-menu-item ${activeMenu === menu ? "active" : ""}`}
                  onClick={() => setActiveMenu(activeMenu === menu ? null : menu)}
                >
                  {menu}
                </button>

                {activeMenu === menu && structure && (
                  <div className="titlebar-dropdown">
                    {structure.map((item, i) => {
                      if (item.type === "separator") {
                        return <div key={i} className="dropdown-separator" />;
                      }
                      return (
                        <button
                          key={i}
                          className={`dropdown-item ${item.disabled ? "disabled" : ""}`}
                          disabled={item.disabled}
                          onClick={() => {
                            if (item.type === "item" && item.action && !item.disabled) {
                              handleMenuAction(item.action);
                            }
                          }}
                        >
                          <span className="dropdown-label">{item.label}</span>
                          {item.type === "submenu" && <span className="dropdown-submenu-icon">▶</span>}
                          {item.type === "item" && item.shortcut && (
                            <span className="dropdown-shortcut">{item.shortcut}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="titlebar-agent-status">
        <span className="status-item">
          <span className="status-dot"></span>
          Model: {useAIStore.getState().activeModel || "Qwen 7B"}
        </span>
        <span className="status-item">⚡ {Math.floor(Math.random() * 5 + 15)} tok/s</span>
        <span className="status-item">🧠 {openFiles.length} files loaded</span>
      </div>

      <div className="titlebar-controls">
        <button className="wc-btn wc-minimize" onClick={minimize} title="Minimize">
          <svg width="10" height="1" viewBox="0 0 10 1"><rect width="10" height="1" fill="currentColor" /></svg>
        </button>
        <button className="wc-btn wc-maximize" onClick={toggleMax} title={isMaximized ? "Restore" : "Maximize"}>
          {isMaximized ? (
            <svg width="10" height="10" viewBox="0 0 10 10">
              <path d="M2 0H10V8H8V2H0V0H2Z" fill="currentColor" />
              <rect x="0" y="2" width="8" height="8" stroke="currentColor" strokeWidth="1" fill="none" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10">
              <rect x="0" y="0" width="10" height="10" stroke="currentColor" strokeWidth="1" fill="none" />
            </svg>
          )}
        </button>
        <button className="wc-btn wc-close" onClick={close} title="Close">
          <svg width="10" height="10" viewBox="0 0 10 10">
            <path d="M0 0L10 10M10 0L0 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <style>{`
        .titlebar {
          height: var(--titlebar-h);
          background: var(--bg-1);
          border-bottom: 1px solid var(--border-soft);
          display: flex;
          align-items: center;
          flex-shrink: 0;
          position: relative;
          z-index: 100;
        }

        .titlebar-left {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          padding: 0 var(--space-3);
          flex-shrink: 0;
        }

        .titlebar-logo { display: flex; align-items: center; }

        .titlebar-name {
          font-size: var(--text-sm);
          font-weight: 600;
          color: var(--text-secondary);
          letter-spacing: 0.01em;
        }

        .titlebar-center { 
          flex: 1; 
          display: flex;
          align-items: center;
          padding-left: var(--space-4);
        }

        .titlebar-menu {
          display: flex;
          gap: 2px;
        }

        .menu-container {
          position: relative;
        }

        .titlebar-agent-status {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          margin-right: var(--space-4);
          font-size: 11px;
          color: var(--text-muted);
        }

        .status-item {
          display: flex;
          align-items: center;
          gap: 4px;
          font-family: var(--font-mono);
        }

        .status-dot {
          width: 8px;
          height: 8px;
          background: var(--green);
          border-radius: 50%;
          box-shadow: 0 0 4px var(--green);
        }

        .titlebar-menu-item {
          background: transparent;
          border: none;
          color: var(--text-secondary);
          font-size: var(--text-xs);
          padding: 4px 8px;
          border-radius: var(--radius-sm);
          cursor: pointer;
          transition: background var(--trans-fast), color var(--trans-fast);
        }

        .titlebar-menu-item:hover, .titlebar-menu-item.active {
          background: rgba(255,255,255,0.06);
          color: var(--text-primary);
        }

        .titlebar-dropdown {
          position: absolute;
          top: 100%;
          left: 0;
          background: var(--bg-3);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          box-shadow: 0 8px 32px rgba(0,0,0,0.5);
          padding: 4px 0;
          min-width: 280px;
          z-index: 9999;
          display: flex;
          flex-direction: column;
        }

        .dropdown-item {
          background: transparent;
          border: none;
          color: var(--text-secondary);
          font-size: var(--text-sm);
          padding: 6px 16px;
          text-align: left;
          cursor: pointer;
          display: flex;
          justify-content: space-between;
          align-items: center;
          width: 100%;
        }

        .dropdown-item:hover:not(.disabled) {
          background: var(--accent);
          color: var(--text-inverse);
        }

        .dropdown-item.disabled {
          color: var(--text-muted);
          cursor: default;
        }

        .dropdown-shortcut {
          font-size: 11px;
          opacity: 0.7;
          margin-left: 24px;
        }

        .dropdown-submenu-icon {
          font-size: 10px;
          opacity: 0.7;
        }

        .dropdown-separator {
          height: 1px;
          background: var(--border);
          margin: 4px 12px;
        }

        .titlebar-controls {
          display: flex;
          height: 100%;
          flex-shrink: 0;
        }

        .wc-btn {
          width: 46px;
          height: 100%;
          background: transparent;
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--text-muted);
          transition: background var(--trans-fast), color var(--trans-fast);
        }

        .wc-btn:hover { background: var(--bg-4); color: var(--text-primary); }
        .wc-close:hover { background: #c42b1c !important; color: #fff !important; }
      `}</style>
    </div>
  );
}
