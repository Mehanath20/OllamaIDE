/* ============================================================
   MonacoEditor.tsx
   - Full Monaco instance with custom dark theme
   - Ctrl+S saves via write_file
   - Tracks cursor position → uiStore
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
  const { updateContent, markSaved } = useEditorStore();
  const { setCursorPosition } = useUIStore() as any;

  // Register custom theme once Monaco loads
  useEffect(() => {
    if (!monaco) return;
    monaco.editor.defineTheme("antigravity-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment",   foreground: "546e7a", fontStyle: "italic" },
        { token: "keyword",   foreground: "c792ea", fontStyle: "bold" },
        { token: "string",    foreground: "c3e88d" },
        { token: "number",    foreground: "f78c6c" },
        { token: "type",      foreground: "ffcb6b" },
        { token: "function",  foreground: "82aaff" },
        { token: "variable",  foreground: "eeffff" },
        { token: "delimiter", foreground: "89ddff" },
        { token: "tag",       foreground: "f07178" },
        { token: "attribute.name",  foreground: "ffcb6b" },
        { token: "attribute.value", foreground: "c3e88d" },
      ],
      colors: {
        "editor.background":           "#101010",
        "editor.foreground":           "#F5F5F5",
        "editorLineNumber.foreground": "#52525b",
        "editorLineNumber.activeForeground": "#ffffff",
        "editor.lineHighlightBackground":   "#181818",
        "editor.selectionBackground":        "#333333",
        "editor.inactiveSelectionBackground":"#2a2a2a",
        "editorIndentGuide.background1":     "#333333",
        "editorIndentGuide.activeBackground1":"#e4e4e750",
        "editorCursor.foreground":           "#ffffff",
        "editor.findMatchBackground":        "#ffffff40",
        "editor.findMatchHighlightBackground":"#ffffff20",
        "editorWidget.background":           "#1f1f1f",
        "editorWidget.border":               "#202020",
        "editorSuggestWidget.background":    "#1f1f1f",
        "editorSuggestWidget.border":        "#202020",
        "editorSuggestWidget.selectedBackground":"#181818",
        "input.background":                  "#1f1f1f",
        "input.border":                      "#333333",
        "scrollbarSlider.background":        "#33333350",
        "scrollbarSlider.hoverBackground":   "#52525b90",
      },
    });
    monaco.editor.setTheme("antigravity-dark");
  }, [monaco]);

  const handleMount = (editor: Monaco.editor.IStandaloneCodeEditor) => {
    editorRef.current = editor;

    // Listen for custom actions from TitleBar.tsx (Edit/Selection menus)
    const handleEditorAction = (e: Event) => {
      const customEvent = e as CustomEvent<string>;
      const actionId = customEvent.detail;
      editor.trigger('titlebar-menu', actionId, null);
    };
    document.addEventListener("editor-action", handleEditorAction);

    // Clean up event listener when editor is unmounted
    editor.onDidDispose(() => {
      document.removeEventListener("editor-action", handleEditorAction);
    });

    // Ctrl+S → save
    editor.addCommand(monaco?.KeyMod.CtrlCmd! | monaco?.KeyCode.KeyS!, async () => {
      const current = editor.getValue();
      try {
        if (path.startsWith("Untitled-")) {
          const newPath = await save({ defaultPath: "Untitled.txt" });
          if (typeof newPath === "string") {
            await invoke("write_file", { path: newPath, content: current });
            const { openFile, closeFile } = useEditorStore.getState();
            closeFile(path);
            const name = newPath.split(/[\\/]/).pop() || newPath;
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
          await invoke("write_file", { path, content: current });
          markSaved(path);
        }
      } catch (err) {
        console.error("Save failed:", err);
      }
    });

    // Track cursor position
    editor.onDidChangeCursorPosition((e) => {
      if (typeof setCursorPosition === "function") {
        setCursorPosition({
          line: e.position.lineNumber,
          column: e.position.column,
        });
      }
    });

    // Track text selection
    editor.onDidChangeCursorSelection((e) => {
      const model = editor.getModel();
      if (model) {
        const selected = model.getValueInRange(e.selection);
        const { setSelectedCode } = useUIStore.getState() as any;
        if (typeof setSelectedCode === "function") {
          setSelectedCode(selected || null);
        }
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
        value={content}
        theme="antigravity-dark"
        onMount={handleMount}
        onChange={handleChange}
        options={{
          fontSize: 14,
          fontFamily: '"JetBrains Mono", "Fira Code", monospace',
          fontLigatures: true,
          lineHeight: 22,
          tabSize: 2,
          minimap: { enabled: true, scale: 1, side: "right" },
          scrollBeyondLastLine: false,
          smoothScrolling: true,
          cursorBlinking: "phase",
          cursorSmoothCaretAnimation: "on",
          renderWhitespace: "selection",
          bracketPairColorization: { enabled: true },
          guides: { indentation: true, bracketPairs: true },
          stickyScroll: { enabled: true },
          padding: { top: 12, bottom: 12 },
          overviewRulerBorder: false,
          hideCursorInOverviewRuler: true,
          scrollbar: {
            vertical: "visible",
            horizontal: "visible",
            verticalScrollbarSize: 6,
            horizontalScrollbarSize: 6,
          },
          suggest: {
            showIcons: true,
            preview: true,
          },
          quickSuggestions: { other: true, comments: false, strings: true },
          wordWrap: "off",
          renderLineHighlight: "gutter",
          fixedOverflowWidgets: true,
        }}
      />

      <style>{`
        .monaco-wrapper {
          width: 100%;
          height: 100%;
          background: var(--bg-2);
          overflow: hidden;
        }
      `}</style>
    </div>
  );
}
