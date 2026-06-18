import { useState } from "react";
import { X, Edit2 } from "lucide-react";
import { useUIStore } from "../../store/uiStore";

// Mock data for keyboard shortcuts to mimic the VS Code experience
const MOCK_KEYBINDINGS = [
  { id: "1", command: "Accept Inline Completion", keybinding: "Ctrl + /", when: "accessibleViewIsShown && accessibleViewCurrentProv...", source: "System" },
  { id: "2", command: "Accept Inline Suggestion", keybinding: "Tab", when: "inlineEditIsVisible && tabShouldAcceptInlineEdit &...", source: "System" },
  { id: "3", command: "Accept Inline Suggestion", keybinding: "Tab", when: "inInlineEditsPreviewEditor", source: "System" },
  { id: "4", command: "Accept Inline Suggestion Alternative Action", keybinding: "Shift + Tab", when: "inInlineEditsPreviewEditor", source: "System" },
  { id: "5", command: "Accept Inline Suggestion Alternative Action", keybinding: "Shift + Tab", when: "inlineEditIsVisible && inlineSuggestionAlternative...", source: "System" },
  { id: "6", command: "Accept Next Line Of Inline Suggestion", keybinding: "Ctrl + DownArrow", when: "inlineSuggestionVisible && !editorReadonly", source: "System" },
  { id: "7", command: "Accept Next Word Of Inline Suggestion", keybinding: "Ctrl + RightArrow", when: "cursorBeforeGhostText && inlineSuggestionVisible &...", source: "System" },
  { id: "8", command: "Accessible Diff Viewer: Go to Next Difference", keybinding: "F7", when: "isInDiffEditor", source: "System" },
  { id: "9", command: "Accessible Diff Viewer: Go to Previous Difference", keybinding: "Shift + F7", when: "isInDiffEditor", source: "System" },
  { id: "10", command: "Add Cursor Above", keybinding: "Ctrl + Alt + UpArrow", when: "editorTextFocus", source: "System" },
  { id: "11", command: "Add Cursor Below", keybinding: "Ctrl + Alt + DownArrow", when: "editorTextFocus", source: "System" },
  { id: "12", command: "Add Cursors to Line Ends", keybinding: "Shift + Alt + I", when: "editorTextFocus", source: "System" },
  { id: "13", command: "Add Line Comment", keybinding: "Ctrl + K   Ctrl + C", when: "editorTextFocus && !editorReadonly", source: "System" },
  { id: "14", command: "Add Selection to Next Find Match", keybinding: "Ctrl + D", when: "editorFocus", source: "System" },
  { id: "15", command: "Auto Fix...", keybinding: "Shift + Alt + .", when: "textInputFocus && !editorReadonly && supportedCode...", source: "System" },
  { id: "16", command: "Calls: Show Call Hierarchy", keybinding: "Shift + Alt + H", when: "editorHasCallHierarchyProvider", source: "System" },
  { id: "17", command: "Cancel Selection Anchor", keybinding: "Escape", when: "editorTextFocus && selectionAnchorSet", source: "System" },
  { id: "18", command: "Change All Occurrences", keybinding: "Ctrl + F2", when: "editorTextFocus && !editorReadonly", source: "System" },
  { id: "19", command: "Change Language Mode", keybinding: "Ctrl + K   M", when: "!notebookEditorFocused", source: "System" },
  { id: "20", command: "Chat: Focus Most Recent Terminal", keybinding: "Ctrl + Shift + Alt + T", when: "inChat", source: "System" },
  { id: "21", command: "Chat: Focus Most Recent Terminal Output", keybinding: "Ctrl + Shift + Alt + O", when: "inChat", source: "System" },
];

export default function Keybinding() {
  const { keybindingOpen, setKeybindingOpen } = useUIStore();
  const [query, setQuery] = useState("");
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  if (!keybindingOpen) return null;

  const filtered = MOCK_KEYBINDINGS.filter(kb => 
    kb.command.toLowerCase().includes(query.toLowerCase()) || 
    kb.keybinding.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="kb-overlay" onClick={() => setKeybindingOpen(false)}>
      <div className="kb-modal" onClick={(e) => e.stopPropagation()}>
        <div className="kb-header">
          <div className="kb-search-container">
            <input 
              type="text" 
              className="kb-search-input" 
              placeholder="Type to search in keybindings" 
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
          </div>
          <button className="kb-close" onClick={() => setKeybindingOpen(false)}>
            <X size={18} />
          </button>
        </div>

        <div className="kb-body">
          <table className="kb-table">
            <thead>
              <tr>
                <th style={{ width: "35%" }}>Command</th>
                <th style={{ width: "25%" }}>Keybinding</th>
                <th style={{ width: "30%" }}>When</th>
                <th style={{ width: "10%" }}>Source</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((kb) => (
                <tr 
                  key={kb.id} 
                  onMouseEnter={() => setHoveredId(kb.id)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  <td className="kb-command-col">
                    <span className="kb-edit-icon" style={{ opacity: hoveredId === kb.id ? 1 : 0 }}>
                      <Edit2 size={12} />
                    </span>
                    {kb.command}
                  </td>
                  <td>
                    {kb.keybinding.split("   ").map((part, i) => (
                      <span key={i}>
                        {i > 0 && <span style={{ margin: '0 4px' }}> </span>}
                        <span className="kb-key">{part}</span>
                      </span>
                    ))}
                  </td>
                  <td className="kb-when">{kb.when}</td>
                  <td>{kb.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <style>{`
        .kb-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
          z-index: 10000;
          display: flex;
          align-items: center;
          justify-content: center;
          backdrop-filter: blur(2px);
          animation: kbFade 150ms ease-out;
        }

        @keyframes kbFade {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .kb-modal {
          width: 90vw;
          max-width: 1100px;
          height: 80vh;
          background: #1e1e1e;
          border: 1px solid var(--border-soft, #333);
          border-radius: 8px;
          box-shadow: 0 16px 48px rgba(0, 0, 0, 0.6);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          font-family: var(--font-ui), sans-serif;
        }

        .kb-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          background: #252526;
          border-bottom: 1px solid #333;
        }

        .kb-search-container {
          flex: 1;
          display: flex;
          align-items: center;
          background: #3c3c3c;
          border: 1px solid transparent;
          border-radius: 4px;
          padding: 4px 8px;
          max-width: 600px;
        }

        .kb-search-container:focus-within {
          border-color: var(--accent, #007acc);
        }

        .kb-search-input {
          flex: 1;
          background: transparent;
          border: none;
          color: #cccccc;
          font-size: 13px;
          outline: none;
          padding: 4px;
        }

        .kb-search-input::placeholder {
          color: #999;
        }

        .kb-close {
          background: transparent;
          border: none;
          color: #999;
          cursor: pointer;
          padding: 6px;
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-left: 16px;
        }

        .kb-close:hover {
          background: rgba(255, 255, 255, 0.1);
          color: #fff;
        }

        .kb-body {
          flex: 1;
          overflow: auto;
          background: #1e1e1e;
        }

        .kb-table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
        }

        .kb-table th {
          position: sticky;
          top: 0;
          background: #1e1e1e;
          color: #cccccc;
          font-weight: 600;
          font-size: 12px;
          padding: 8px 12px;
          border-bottom: 1px solid #333;
          z-index: 10;
        }

        .kb-table td {
          padding: 4px 12px;
          color: #cccccc;
          font-size: 12px;
          border-bottom: 1px solid transparent;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .kb-table tr {
          height: 28px;
        }

        .kb-table tr:hover {
          background: #2a2d2e;
        }

        .kb-command-col {
          display: flex;
          align-items: center;
          color: #d4d4d4;
        }

        .kb-edit-icon {
          width: 16px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: #cccccc;
          margin-right: 8px;
          cursor: pointer;
        }

        .kb-edit-icon:hover {
          color: #fff;
        }

        .kb-key {
          display: inline-block;
          background: #333333;
          border-radius: 3px;
          padding: 2px 6px;
          font-family: var(--font-mono), monospace;
          color: #d4d4d4;
          box-shadow: inset 0 -1px 0 rgba(0,0,0,0.4);
        }

        .kb-when {
          color: #a0a0a0;
          font-family: var(--font-mono), monospace;
          font-size: 11px;
        }
      `}</style>
    </div>
  );
}