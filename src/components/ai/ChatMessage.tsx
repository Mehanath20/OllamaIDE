/* ============================================================
   ChatMessage.tsx — AI Message visualizer.
   Supports custom markdown formatting, code block actions
   (Copy Code, Apply to File diff), and styling.
   ============================================================ */
import { useState } from "react";
import { Copy, Check, FileCode, Terminal } from "lucide-react";
import { ChatMessage as ChatMessageType, useAIStore } from "../../store/aiStore";
import { useEditorStore } from "../../store/editorStore";
import { invoke } from "@tauri-apps/api/core";

interface Props {
  message: ChatMessageType;
}

export default function ChatMessage({ message }: Props) {
  const { role, content } = message;
  const isUser = role === "user";
  const isSystem = role === "system";

  return (
    <div className={`msg-wrapper msg-wrapper--${role}`}>
      <div className="msg-avatar">
        {isUser ? "👤" : isSystem ? "⚙️" : "🤖"}
      </div>

      <div className="msg-bubble">
        {isSystem ? (
          <div className="msg-system-content">
            <Terminal size={14} className="sys-icon" />
            <span>{content}</span>
          </div>
        ) : (
          <RichText content={content} />
        )}
      </div>

      <style>{`
        .msg-wrapper {
          display: flex;
          gap: var(--space-3);
          margin-bottom: var(--space-4);
          max-width: 100%;
        }
        .msg-wrapper--user {
          flex-direction: row-reverse;
        }
        .msg-avatar {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: var(--bg-2);
          border: 1px solid var(--border-soft);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: var(--text-sm);
          flex-shrink: 0;
        }
        .msg-wrapper--user .msg-avatar {
          background: var(--accent);
          color: white;
        }
        .msg-bubble {
          flex: 1;
          max-width: calc(100% - 40px);
          background: var(--bg-1);
          border: 1px solid var(--border-soft);
          padding: var(--space-3) var(--space-4);
          border-radius: 8px;
          font-size: var(--text-sm);
          line-height: 1.5;
          color: var(--text-primary);
          overflow-x: auto;
        }
        .msg-wrapper--user .msg-bubble {
          background: rgba(124, 58, 237, 0.1);
          border-color: rgba(124, 58, 237, 0.25);
        }
        .msg-system-content {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          color: var(--text-muted);
          font-family: monospace;
          font-size: var(--text-xs);
        }
        .sys-icon {
          color: var(--accent);
        }
      `}</style>
    </div>
  );
}

function RichText({ content }: { content: string }) {
  // Simple custom parser for markdown code blocks (```lang ... ```)
  const parts = content.split(/```/g);

  return (
    <div className="rich-text-flow">
      {parts.map((part, index) => {
        const isCodeBlock = index % 2 === 1;
        if (isCodeBlock) {
          // Parse language and code
          const lines = part.split("\n");
          const firstLine = lines[0].trim();
          const language = firstLine || "text";
          const code = lines.slice(1).join("\n").replace(/\n$/, "");
          return <CodeBlock key={index} code={code} language={language} />;
        } else {
          return <FormattedInlineText key={index} text={part} />;
        }
      })}
    </div>
  );
}

function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);
  const activeFile = useEditorStore((s) => s.activeFile);
  const setPendingFileChange = useAIStore((s) => s.setPendingFileChange);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleApply = async () => {
    // Propose active file or ask user for path
    let target = activeFile;
    const promptPath = window.prompt("Enter file path to apply this code to:", target || "src/main.ts");
    if (!promptPath) return;

    let oldContent = "";
    try {
      oldContent = await invoke<string>("read_file", { path: promptPath });
    } catch {
      oldContent = "";
    }

    setPendingFileChange({
      path: promptPath,
      oldContent,
      newContent: code,
    });
  };

  return (
    <div className="code-block-container">
      <div className="code-block-header">
        <span className="code-lang">{language}</span>
        <div className="code-actions">
          <button className="code-action-btn" onClick={handleCopy} title="Copy code">
            {copied ? <Check size={14} className="copied" /> : <Copy size={14} />}
          </button>
          <button className="code-action-btn" onClick={handleApply} title="Apply to file">
            <FileCode size={14} />
            <span style={{ fontSize: "10px", marginLeft: "4px" }}>Apply</span>
          </button>
        </div>
      </div>
      <pre className="code-block-content">
        <code>{code}</code>
      </pre>

      <style>{`
        .code-block-container {
          margin: var(--space-3) 0;
          background: #111317;
          border: 1px solid var(--border-soft);
          border-radius: 6px;
          overflow: hidden;
        }
        .code-block-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: var(--space-2) var(--space-3);
          background: #171a1f;
          border-bottom: 1px solid var(--border-soft);
          font-family: monospace;
          font-size: var(--text-xs);
          color: var(--text-muted);
        }
        .code-actions {
          display: flex;
          gap: var(--space-2);
        }
        .code-action-btn {
          background: transparent;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          display: flex;
          align-items: center;
          padding: 2px 6px;
          border-radius: 4px;
        }
        .code-action-btn:hover {
          color: var(--text-primary);
          background: rgba(255, 255, 255, 0.05);
        }
        .code-block-content {
          padding: var(--space-3);
          margin: 0;
          overflow-x: auto;
          font-family: var(--font-mono);
          font-size: var(--text-xs);
          color: #e8eaf0;
        }
        .copied {
          color: var(--green);
        }
      `}</style>
    </div>
  );
}

function FormattedInlineText({ text }: { text: string }) {
  // Basic markdown inline parser for bold (**bold**) and inline code (`code`)
  const lines = text.split("\n");

  return (
    <>
      {lines.map((line, idx) => {
        if (line.trim().startsWith("- ")) {
          return (
            <ul key={idx} style={{ margin: "4px 0", paddingLeft: "20px" }}>
              <li>
                <FormattedLine line={line.replace(/^-\s*/, "")} />
              </li>
            </ul>
          );
        }
        if (line.trim().startsWith("### ")) {
          return (
            <h4 key={idx} style={{ margin: "12px 0 6px", fontSize: "14px", fontWeight: "bold" }}>
              <FormattedLine line={line.replace(/^###\s*/, "")} />
            </h4>
          );
        }
        return (
          <p key={idx} style={{ margin: "6px 0" }}>
            <FormattedLine line={line} />
          </p>
        );
      })}
    </>
  );
}

function FormattedLine({ line }: { line: string }) {
  // Parse bold and code segments
  const parts = line.split(/(\*\*|`)/g);
  let isBold = false;
  let isInlineCode = false;

  return (
    <span>
      {parts.map((part, index) => {
        if (part === "**") {
          isBold = !isBold;
          return null;
        }
        if (part === "`") {
          isInlineCode = !isInlineCode;
          return null;
        }
        if (isInlineCode) {
          return (
            <code
              key={index}
              style={{
                background: "rgba(255,255,255,0.06)",
                padding: "2px 4px",
                borderRadius: "4px",
                fontFamily: "monospace",
                color: "#ffcb6b",
              }}
            >
              {part}
            </code>
          );
        }
        if (isBold) {
          return <strong key={index}>{part}</strong>;
        }
        return part;
      })}
    </span>
  );
}
