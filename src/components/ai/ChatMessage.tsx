/* ============================================================
   ChatMessage.tsx — AI Message visualizer.
   - Properly renders user, assistant, and system messages
   - Strips agent XML tags only on completed messages (not streaming)
   - System messages rendered with action-specific icons
   - Code blocks with syntax highlighting and copy/apply actions
   ============================================================ */
import { useState } from "react";
import { Copy, Check, FileCode, Terminal, FileText, Search, FolderOpen, PlayCircle, AlertTriangle } from "lucide-react";
import { ChatMessage as ChatMessageType, useAIStore } from "../../store/aiStore";
import { useEditorStore } from "../../store/editorStore";
import { invoke } from "@tauri-apps/api/core";

interface Props {
  message: ChatMessageType;
  isStreaming?: boolean;
}

/**
 * Strip agent XML action tags from completed assistant messages.
 * NOT applied during streaming (isStreaming=true) to avoid partial tag flicker.
 */
function cleanAgentOutput(text: string): string {
  let cleaned = text;
  
  // Strip block tags with content
  const blockTags = ["think", "write_file", "run_command", "plan"];
  blockTags.forEach((tag) => {
    const regex = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "g");
    cleaned = cleaned.replace(regex, "");
  });

  // Strip self-closing tags
  const selfClosingTags = ["read_file", "search_files", "list_dir"];
  selfClosingTags.forEach((tag) => {
    const regex = new RegExp(`<${tag}[\\s\\S]*?/>`, "g");
    cleaned = cleaned.replace(regex, "");
  });

  return cleaned.trim();
}

/**
 * Parse a system message to extract the action type and render it nicely.
 */
function parseSystemMessage(content: string): { icon: JSX.Element; label: string; body: string } {
  if (content.startsWith("[read_file")) {
    return { icon: <FileText size={13} />, label: "File Read", body: content.replace(/^\[read_file[^\]]*\]:\s*/, "") };
  }
  if (content.startsWith("[write_file]")) {
    return { icon: <FileCode size={13} />, label: "File Written", body: content.replace(/^\[write_file\]:\s*/, "") };
  }
  if (content.startsWith("[write_file error]")) {
    return { icon: <AlertTriangle size={13} />, label: "Write Error", body: content.replace(/^\[write_file error\]:\s*/, "") };
  }
  if (content.startsWith("[run_command")) {
    return { icon: <PlayCircle size={13} />, label: "Command Output", body: content.replace(/^\[run_command[^\]]*\]:\s*/, "") };
  }
  if (content.startsWith("[list_dir")) {
    return { icon: <FolderOpen size={13} />, label: "Directory", body: content.replace(/^\[list_dir[^\]]*\]:\s*/, "") };
  }
  if (content.startsWith("[search_files")) {
    return { icon: <Search size={13} />, label: "Search Results", body: content.replace(/^\[search_files[^\]]*\]:\s*/, "") };
  }
  if (content.startsWith("[system]")) {
    return { icon: <Terminal size={13} />, label: "System", body: content.replace(/^\[system\]:\s*/, "") };
  }
  // Legacy [System]: format
  if (content.startsWith("[System]:")) {
    return { icon: <Terminal size={13} />, label: "System", body: content.replace(/^\[System\]:\s*/, "") };
  }
  return { icon: <Terminal size={13} />, label: "System", body: content };
}

export default function ChatMessage({ message, isStreaming = false }: Props) {
  const { role, content } = message;
  const isUser = role === "user";
  const isSystem = role === "system";

  // Clean display content for assistant messages (only when not streaming)
  let displayContent = content;
  if (role === "assistant" && !isStreaming) {
    displayContent = cleanAgentOutput(content);
  }

  // Don't render empty messages
  if (!displayContent && !isStreaming) return null;
  // Don't render empty non-streaming assistant messages
  if (role === "assistant" && !displayContent && content && !isStreaming) return null;

  // Strip workspace context from user messages for display (it's internal)
  let userDisplayContent = content;
  if (isUser) {
    userDisplayContent = content.replace(/\n+\[(?:Active file|Workspace):[^]*$/, "").trim();
  }

  return (
    <div className={`msg-wrapper msg-wrapper--${role}`}>
      <div className={`msg-avatar msg-avatar--${role}`}>
        {isUser ? "👤" : isSystem ? "⚙" : "✦"}
      </div>

      <div className={`msg-bubble msg-bubble--${role}`}>
        {message.images && message.images.length > 0 && (
          <div className="msg-images">
            {message.images.map((b64, idx) => (
              <img key={idx} src={`data:image/png;base64,${b64}`} alt="attachment" className="msg-attached-img" />
            ))}
          </div>
        )}
        {isSystem ? (
          <SystemMessageContent content={content} />
        ) : isUser ? (
          <div className="user-text">{userDisplayContent}</div>
        ) : (
          <RichText content={displayContent} />
        )}
      </div>

      <style>{`
        .msg-wrapper {
          display: flex;
          gap: 12px;
          padding: 12px var(--space-4);
          max-width: 100%;
          animation: msgIn 120ms ease both;
        }
        @keyframes msgIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .msg-wrapper--user {
          flex-direction: row-reverse;
        }
        .msg-wrapper--system {
          padding: 6px var(--space-4);
          justify-content: center;
        }
        .msg-avatar {
          width: 28px;
          height: 28px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          flex-shrink: 0;
          margin-top: 2px;
        }
        .msg-avatar--user {
          background: linear-gradient(135deg, var(--accent), #4f46e5);
          color: white;
          font-size: 12px;
          box-shadow: 0 2px 8px var(--accent-soft);
        }
        .msg-avatar--assistant {
          background: #121212;
          border: 1px solid rgba(124,58,237,0.4);
          color: var(--accent);
          font-size: 16px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        }
        .msg-avatar--system {
          display: none; /* Hide avatar for system messages, we center them instead */
        }
        .msg-bubble {
          flex: 1;
          max-width: calc(100% - 40px);
          font-size: var(--text-sm);
          line-height: 1.6;
          color: var(--text-primary);
          overflow-x: auto;
        }
        .msg-bubble--user {
          background: rgba(124, 58, 237, 0.1);
          border: 1px solid rgba(124, 58, 237, 0.25);
          border-radius: 12px 12px 2px 12px;
          padding: 10px 14px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .msg-bubble--system {
          max-width: 100%;
          display: flex;
          justify-content: center;
        }
        .user-text {
          white-space: pre-wrap;
          word-break: break-word;
        }
        .msg-images {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 8px;
        }
        .msg-attached-img {
          max-width: 200px;
          max-height: 200px;
          border-radius: 6px;
          border: 1px solid rgba(255,255,255,0.1);
          object-fit: cover;
        }
      `}</style>
    </div>
  );
}

function SystemMessageContent({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false);
  const { icon, label, body } = parseSystemMessage(content);
  
  const hasCodeBlock = body.includes("```");
  const isSuccess = label === "File Written" || label === "Command Output" || label === "Directory" || label === "Search Results" || label === "File Read";
  const isError = label === "Write Error";

  return (
    <div className={`sys-msg ${isError ? "sys-msg--error" : ""}`}>
      <button
        className="sys-msg-header"
        onClick={() => hasCodeBlock && setExpanded(!expanded)}
        style={{ cursor: hasCodeBlock ? "pointer" : "default" }}
      >
        <span className={`sys-icon ${isError ? "sys-icon--error" : isSuccess ? "sys-icon--success" : ""}`}>
          {icon}
        </span>
        <span className="sys-label">{label}</span>
        {hasCodeBlock && (
          <span className="sys-toggle">{expanded ? "▼" : "▶"}</span>
        )}
      </button>
      {expanded && hasCodeBlock && (
        <div className="sys-body">
          <RichText content={body} />
        </div>
      )}
      {!hasCodeBlock && (
        <div className="sys-inline-body">{body}</div>
      )}
      <style>{`
        .sys-msg {
          display: flex;
          flex-direction: column;
          gap: 6px;
          background: var(--bg-2);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          padding: 8px 12px;
          width: 100%;
          max-width: 400px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.2);
          transition: border-color var(--trans-fast);
        }
        .sys-msg:hover { border-color: var(--border-soft); }
        .sys-msg--error { border-color: rgba(239, 68, 68, 0.3); background: rgba(239, 68, 68, 0.05); }
        .sys-msg--error .sys-label { color: var(--error); }
        .sys-msg-header {
          display: flex;
          align-items: center;
          gap: 8px;
          background: transparent;
          border: none;
          color: var(--text-secondary);
          font-size: 11px;
          font-family: var(--font-ui);
          text-align: left;
          padding: 0;
          outline: none;
        }
        .sys-icon { display: flex; align-items: center; color: var(--text-muted); }
        .sys-icon--success { color: var(--green); }
        .sys-icon--error   { color: var(--error); }
        .sys-label {
          font-weight: 600;
          letter-spacing: 0.05em;
          text-transform: uppercase;
        }
        .sys-toggle { font-size: 9px; margin-left: auto; color: var(--text-muted); }
        .sys-body { 
          margin-top: 4px;
          background: var(--bg-0);
          border-radius: var(--radius-sm);
          padding: 4px;
        }
        .sys-inline-body {
          font-size: 12px;
          color: var(--text-primary);
          line-height: 1.5;
          white-space: pre-wrap;
          word-break: break-word;
        }
      `}</style>
    </div>
  );
}

function RichText({ content }: { content: string }) {
  const parts = content.split(/(```[\s\S]*?```|`[^`\n]+`)/g);

  return (
    <div className="rich-text-flow">
      {parts.map((part, index) => {
        // Fenced code block
        if (part.startsWith("```") && part.endsWith("```")) {
          const inner = part.slice(3, -3);
          const lines = inner.split("\n");
          const language = lines[0].trim() || "text";
          const code = lines.slice(1).join("\n").replace(/\n$/, "");
          return <CodeBlock key={index} code={code} language={language} />;
        }
        // Inline code
        if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
          return (
            <code key={index} className="inline-code">
              {part.slice(1, -1)}
            </code>
          );
        }
        return <FormattedText key={index} text={part} />;
      })}
      <style>{`
        .rich-text-flow { display: flex; flex-direction: column; gap: 4px; }
        .inline-code {
          background: rgba(255,255,255,0.07);
          color: #c3e88d;
          padding: 1px 5px;
          border-radius: 3px;
          font-family: var(--font-mono);
          font-size: 0.85em;
        }
      `}</style>
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
    const promptPath = window.prompt(
      "Enter file path to apply this code to:",
      activeFile || "src/main.ts"
    );
    if (!promptPath) return;
    let oldContent = "";
    try {
      oldContent = await invoke<string>("read_file", { path: promptPath });
    } catch { oldContent = ""; }
    setPendingFileChange({ path: promptPath, oldContent, newContent: code });
  };

  return (
    <div className="code-block">
      <div className="code-block-header">
        <span className="code-lang">{language}</span>
        <div className="code-actions">
          <button className="code-btn" onClick={handleCopy} title="Copy">
            {copied ? <Check size={13} className="copied-icon" /> : <Copy size={13} />}
            {copied ? "Copied!" : "Copy"}
          </button>
          <button className="code-btn" onClick={handleApply} title="Apply to file">
            <FileCode size={13} />
            Apply
          </button>
        </div>
      </div>
      <pre className="code-block-body"><code>{code}</code></pre>
      <style>{`
        .code-block {
          margin: var(--space-2) 0;
          background: #0c0c0c;
          border: 1px solid #1e1e1e;
          border-radius: var(--radius-md);
          overflow: hidden;
        }
        .code-block-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 5px var(--space-3);
          background: #111;
          border-bottom: 1px solid #1e1e1e;
        }
        .code-lang {
          font-family: var(--font-mono);
          font-size: var(--text-xs);
          color: #5a5a7a;
          letter-spacing: 0.06em;
        }
        .code-actions { display: flex; gap: 4px; }
        .code-btn {
          display: flex;
          align-items: center;
          gap: 4px;
          background: transparent;
          border: 1px solid #1e1e1e;
          color: var(--text-muted);
          font-size: var(--text-xs);
          font-family: var(--font-ui);
          padding: 2px 8px;
          border-radius: var(--radius-sm);
          cursor: pointer;
          transition: all var(--trans-fast);
        }
        .code-btn:hover { color: var(--text-primary); background: #1a1a1a; }
        .copied-icon { color: var(--green); }
        .code-block-body {
          padding: var(--space-3);
          margin: 0;
          overflow-x: auto;
          font-family: var(--font-mono);
          font-size: 12px;
          line-height: 1.6;
          color: #d4d4d4;
        }
      `}</style>
    </div>
  );
}

function FormattedText({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <>
      {lines.map((line, idx) => {
        // Heading
        if (line.match(/^#{1,3}\s/)) {
          const level = line.match(/^(#{1,3})\s/)![1].length;
          const headingText = line.replace(/^#{1,3}\s/, "");
          const sizes = ["1.1em", "1em", "0.95em"];
          return (
            <p key={idx} style={{ fontWeight: 700, fontSize: sizes[level - 1], margin: "8px 0 4px", color: "var(--text-primary)" }}>
              <InlineParts text={headingText} />
            </p>
          );
        }
        // Bullet list
        if (line.match(/^[-*]\s/)) {
          return (
            <div key={idx} style={{ display: "flex", gap: "8px", margin: "2px 0", paddingLeft: "4px" }}>
              <span style={{ color: "var(--accent)", flexShrink: 0, marginTop: "2px" }}>•</span>
              <span><InlineParts text={line.replace(/^[-*]\s/, "")} /></span>
            </div>
          );
        }
        // Numbered list
        if (line.match(/^\d+\.\s/)) {
          const num = line.match(/^(\d+)\.\s/)![1];
          return (
            <div key={idx} style={{ display: "flex", gap: "8px", margin: "2px 0", paddingLeft: "4px" }}>
              <span style={{ color: "var(--accent)", flexShrink: 0, minWidth: "16px" }}>{num}.</span>
              <span><InlineParts text={line.replace(/^\d+\.\s/, "")} /></span>
            </div>
          );
        }
        // Horizontal rule
        if (line.match(/^---+$/)) {
          return <hr key={idx} style={{ border: "none", borderTop: "1px solid var(--border)", margin: "8px 0" }} />;
        }
        // Empty line → spacing
        if (!line.trim()) {
          return <div key={idx} style={{ height: "6px" }} />;
        }
        return (
          <p key={idx} style={{ margin: "3px 0" }}>
            <InlineParts text={line} />
          </p>
        );
      })}
    </>
  );
}

function InlineParts({ text }: { text: string }) {
  // Parse **bold** and *italic* inline
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return (
    <span>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={i}>{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
          return <em key={i}>{part.slice(1, -1)}</em>;
        }
        return part;
      })}
    </span>
  );
}
