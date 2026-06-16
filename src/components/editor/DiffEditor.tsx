import { DiffEditor as MonacoDiffEditor } from "@monaco-editor/react";

interface Props {
  original: string;
  modified: string;
  language: string;
}

export default function DiffEditor({ original, modified, language }: Props) {
  return (
    <div style={{ width: "100%", height: "100%", background: "var(--bg-2)" }}>
      <MonacoDiffEditor
        height="100%"
        width="100%"
        language={language}
        original={original}
        modified={modified}
        theme="antigravity-dark"
        options={{
          readOnly: true,
          originalEditable: false,
          renderSideBySide: true,
          minimap: { enabled: false },
          scrollbar: {
            verticalScrollbarSize: 10,
            horizontalScrollbarSize: 10,
          },
        }}
      />
    </div>
  );
}
