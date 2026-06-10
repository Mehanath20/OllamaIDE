/* ============================================================
   MonacoEditor.tsx
   - Full Monaco instance with custom dark theme
   - Ctrl+S saves via write_file (resolves path from store, not prop)
   - Tracks cursor position → uiStore
   - Uses defaultValue to prevent prop-driven re-render loop
   ============================================================ */
import { useRef, useEffect } from "react";
import Editor, { useMonaco } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import { invoke } from "@tauri-apps/api/core";
import { useEditorStore } from "../../store/editorStore";
import { useUIStore } from "../../store/uiStore";
import { save } from "@tauri-apps/plugin-dialog";
import { getLanguageFromExt } from "../../lib/fileIcons";

interface Props {
  path: string;
  content: string;
  language: string;
}

export default function MonacoEditor({ path, content, language }: Props) {
  const monaco = useMonaco();
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const lastExternalContent = useRef<string>(content);
  const { updateContent, markSaved } = useEditorStore();
  const { setCursorPosition, setSelectedCode } = useUIStore();

  // Sync external content changes (e.g. agent writes to an open file)
  // We compare with lastExternalContent to avoid overwriting user's own edits
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    // Only update if the content changed externally (not from the user typing)
    if (content !== lastExternalContent.current) {
      lastExternalContent.current = content;
      const currentEditorValue = editor.getValue();
      if (currentEditorValue !== content) {
        // Preserve cursor position during update
        const position = editor.getPosition();
        editor.setValue(content);
        if (position) editor.setPosition(position);
      }
    }
  }, [content]);

  // Register custom theme once Monaco loads
  useEffect(() => {
    if (!monaco) return;
    monaco.editor.defineTheme("antigravity-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment",           foreground: "546e7a", fontStyle: "italic" },
        { token: "keyword",           foreground: "c792ea", fontStyle: "bold" },
        { token: "string",            foreground: "c3e88d" },
        { token: "number",            foreground: "f78c6c" },
        { token: "type",              foreground: "ffcb6b" },
        { token: "function",          foreground: "82aaff" },
        { token: "variable",          foreground: "eeffff" },
        { token: "delimiter",         foreground: "89ddff" },
        { token: "tag",               foreground: "f07178" },
        { token: "attribute.name",    foreground: "ffcb6b" },
        { token: "attribute.value",   foreground: "c3e88d" },
        { token: "regexp",            foreground: "f07178" },
        { token: "constant",          foreground: "f78c6c" },
        { token: "namespace",         foreground: "ffcb6b" },
      ],
      colors: {
        "editor.background":                    "#0f0f0f",
        "editor.foreground":                    "#f0f0f0",
        "editorLineNumber.foreground":          "#3a3a3a",
        "editorLineNumber.activeForeground":    "#9a9a9a",
        "editor.lineHighlightBackground":       "#161616",
        "editor.lineHighlightBorder":           "#161616",
        "editor.selectionBackground":           "#2a2a3a",
        "editor.inactiveSelectionBackground":   "#1e1e2a",
        "editorIndentGuide.background1":        "#1e1e1e",
        "editorIndentGuide.activeBackground1":  "#333333",
        "editorCursor.foreground":              "#7c3aed",
        "editor.findMatchBackground":           "#7c3aed40",
        "editor.findMatchHighlightBackground":  "#7c3aed20",
        "editorWidget.background":              "#141414",
        "editorWidget.border":                  "#202020",
        "editorSuggestWidget.background":       "#141414",
        "editorSuggestWidget.border":           "#202020",
        "editorSuggestWidget.selectedBackground":"#1e1e1e",
        "editorSuggestWidget.highlightForeground":"#7c3aed",
        "input.background":                     "#141414",
        "input.border":                         "#282828",
        "focusBorder":                          "#7c3aed",
        "scrollbarSlider.background":           "#2a2a2a50",
        "scrollbarSlider.hoverBackground":      "#3a3a3a90",
        "editorGutter.background":              "#0f0f0f",
        "editorOverviewRuler.border":           "#00000000",
        "minimapSlider.background":             "#2a2a2a50",
        "minimapSlider.hoverBackground":        "#3a3a3a90",
      },
    });
    monaco.editor.setTheme("antigravity-dark");
  }, [monaco]);

  const handleMount = (editor: Monaco.editor.IStandaloneCodeEditor) => {
    editorRef.current = editor;
    lastExternalContent.current = content; // baseline for drift detection

    // Listen for custom actions from TitleBar.tsx (Edit/Selection menus)
    const handleEditorAction = (e: Event) => {
      const customEvent = e as CustomEvent<string>;
      const actionId = customEvent.detail;
      editor.trigger("titlebar-menu", actionId, null);
    };
    document.addEventListener("editor-action", handleEditorAction);

    // Clean up event listener when editor is unmounted
    editor.onDidDispose(() => {
      document.removeEventListener("editor-action", handleEditorAction);
    });

    // Ctrl+S → save
    // IMPORTANT: Always read path from the store at save time, not from the closed-over prop.
    editor.addCommand(monaco?.KeyMod.CtrlCmd! | monaco?.KeyCode.KeyS!, async () => {
      const current = editor.getValue();
      // Resolve the canonical path from the store (handles renames, untitled files, etc.)
      const storePath = useEditorStore.getState().activeFile ?? path;
      try {
        if (storePath.startsWith("Untitled-")) {
          const newPath = await save({ defaultPath: "untitled.txt" });
          if (typeof newPath === "string") {
            await invoke("write_file", { path: newPath, content: current });
            const { openFile, closeFile } = useEditorStore.getState();
            closeFile(storePath);
            const name = newPath.split(/[/\\]/).pop() || newPath;
            const ext = name.split(".").pop() || "";
            openFile({
              path: newPath,
              name,
              content: current,
              language: getLanguageFromExt(ext),
              isDirty: false,
            });
          }
        } else {
          await invoke("write_file", { path: storePath, content: current });
          markSaved(storePath);
        }
      } catch (err) {
        console.error("Save failed:", err);
      }
    });

    // Track cursor position
    editor.onDidChangeCursorPosition((e) => {
      setCursorPosition({
        line: e.position.lineNumber,
        column: e.position.column,
      });
    });

    // Track text selection
    editor.onDidChangeCursorSelection((e) => {
      const model = editor.getModel();
      if (model) {
        const selected = model.getValueInRange(e.selection);
        setSelectedCode(selected || null);
      }
    });

    // Focus editor
    editor.focus();
  };

  const handleChange = (value: string | undefined) => {
    if (value !== undefined) {
      updateContent(path, value);
    }
  };

  return (
    <div className="monaco-wrapper">
      <Editor
        height="100%"
        width="100%"
        language={language}
        defaultValue={content}  // Use defaultValue to prevent prop-driven content re-render loop
        theme="antigravity-dark"
        onMount={handleMount}
        onChange={handleChange}
        options={{
          fontSize: 13,
          fontFamily: '"JetBrains Mono", "Cascadia Code", "Fira Code", Consolas, monospace',
          fontLigatures: true,
          lineHeight: 21,
          tabSize: 2,
          minimap: { enabled: true, scale: 1, side: "right", renderCharacters: false },
          scrollBeyondLastLine: false,
          smoothScrolling: true,
          cursorBlinking: "phase",
          cursorSmoothCaretAnimation: "on",
          renderWhitespace: "selection",
          bracketPairColorization: { enabled: true },
          guides: { indentation: true, bracketPairs: true },
          stickyScroll: { enabled: true },
          padding: { top: 14, bottom: 14 },
          overviewRulerBorder: false,
          hideCursorInOverviewRuler: true,
          scrollbar: {
            vertical: "auto",
            horizontal: "auto",
            verticalScrollbarSize: 5,
            horizontalScrollbarSize: 5,
          },
          suggest: {
            showIcons: true,
            preview: true,
            insertMode: "replace",
          },
          quickSuggestions: { other: true, comments: false, strings: true },
          wordWrap: "off",
          renderLineHighlight: "gutter",
          fixedOverflowWidgets: true,
          mouseWheelZoom: true,
          formatOnPaste: true,
          detectIndentation: true,
        }}
      />

      <style>{`
        .monaco-wrapper {
          width: 100%;
          height: 100%;
          background: #0f0f0f;
          overflow: hidden;
        }
      `}</style>
    </div>
  );
}
