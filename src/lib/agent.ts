/* ============================================================
   agent.ts — Antigravity IDE Agent Engine
   
   This is an autonomous coding agent that ACTS immediately.
   It does NOT describe steps — it performs them directly using
   XML action tags that the system parses and executes.
   ============================================================ */
import { invoke } from "@tauri-apps/api/core";
import { useAIStore, ChatMessage, AgentStep } from "../store/aiStore";
import { useFileStore } from "../store/fileStore";
import { useEditorStore } from "../store/editorStore";
import { chatOllama } from "./ollama";
import { getWorkspaceContext } from "./fileUtils";

// Max messages kept in sliding context window
const MAX_HISTORY_MESSAGES = 20;

const AGENT_SYSTEM_PROMPT = `You are Antigravity, an autonomous AI coding agent inside an IDE.
You have DIRECT access to the filesystem and terminal. You DO NOT explain — you ACT.

CRITICAL RULE: When asked to create a file, write code, or do any filesystem task:
  → IMMEDIATELY use the appropriate action tag. Do NOT describe what you will do.
  → Do NOT say "Here's how to do it" or "You can do this by..."
  → Do NOT ask the user to create files themselves.
  → Just use the tag and do it NOW.

## ACTION TAGS (use exactly one per response turn):

### Create or overwrite a file:
<write_file path="filename.ext">
file contents here
</write_file>

### Read a file:
<read_file path="filename.ext"/>

### Run a terminal command:
<run_command>command here</run_command>

### List directory contents:
<list_dir path="path/to/dir"/>

### Search in files:
<search_files query="search term" path="."/>

### Think before acting (optional reasoning):
<think>
brief reasoning
</think>

## EXAMPLES OF CORRECT BEHAVIOR:

User: "create a python file that prints hello world"
CORRECT response:
<write_file path="hello.py">
print("Hello, World!")
</write_file>

User: "create a rust program to print my name is john"
CORRECT response:
<write_file path="main.rs">
fn main() {
    println!("My name is John");
}
</write_file>

User: "create a file called solution.py with a class that sorts a list"
CORRECT response:
<write_file path="solution.py">
class Solution:
    def sort_list(self, nums):
        return sorted(nums)
</write_file>

## RULES:
1. File creation/editing tasks → use <write_file> IMMEDIATELY, no preamble.
2. Use the filename the user specifies. If none given, pick a sensible name.
3. If the user just wants to chat or ask a question → respond with text only (no tags).
4. After a file action completes, briefly confirm what you did (1-2 sentences max).
5. File paths are relative to the workspace root. Use simple filenames (e.g. "hello.py" not "./src/hello.py") unless the user specifies otherwise.
6. For multi-file tasks: handle one file per turn. The system will call you again for the next step.
`;

/**
 * Resolve an absolute path from workspace root + relative path.
 * Handles both Windows (backslash) and Unix (forward slash) paths.
 */
function resolvePath(workspaceRoot: string, relativePath: string): string {
  // Already absolute? Return as-is
  if (relativePath.startsWith("/") || /^[A-Za-z]:/.test(relativePath)) {
    return relativePath;
  }

  // Remove leading ./ or ./
  const clean = relativePath.replace(/^\.\//, "").replace(/^\.\\/, "");

  // Detect Windows path separator from root
  const sep = workspaceRoot.includes("\\") ? "\\" : "/";

  return `${workspaceRoot}${sep}${clean}`;
}

/**
 * Get the effective workspace root for file operations.
 * Falls back to the OS temp/documents directory if no workspace is open.
 */
function getWorkspaceRoot(): string {
  const storeRoot = useFileStore.getState().workspaceRoot;
  if (storeRoot) return storeRoot;

  // No workspace open — use the active file's directory as context
  const activeFile = useEditorStore.getState().activeFile;
  if (activeFile) {
    const parts = activeFile.split(/[/\\]/);
    parts.pop();
    return parts.join("\\") || "C:\\Users\\Public\\Documents";
  }

  return "";
}

/**
 * Parse markdown-like checklist plan.
 */
function parsePlan(text: string): AgentStep[] {
  const planRegex = /<plan>([\s\S]*?)<\/plan>/;
  const match = text.match(planRegex);
  if (!match) return [];

  const lines = match[1].split("\n");
  const steps: AgentStep[] = [];
  let idCounter = 1;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const isCompleted = trimmed.startsWith("- [x]") || trimmed.startsWith("- [X]");
    const isPending = trimmed.startsWith("- [ ]");
    if (isCompleted || isPending) {
      steps.push({
        id: `step-${idCounter++}`,
        text: trimmed.replace(/^-\s*\[[xX ]\]\s*/, ""),
        status: isCompleted ? "completed" : "pending",
      });
    }
  }
  return steps;
}

/**
 * Trim message history to prevent context window overflow.
 * Always keeps the first message (initial context) + last N messages.
 */
function trimHistory(messages: ChatMessage[]): ChatMessage[] {
  if (messages.length <= MAX_HISTORY_MESSAGES) return messages;
  const firstMsg = messages[0];
  const tail = messages.slice(-(MAX_HISTORY_MESSAGES - 1));
  return [firstMsg, ...tail];
}

/**
 * Execute a shell command via the Rust backend.
 */
async function runShellCommand(cmd: string): Promise<string> {
  const cwd = getWorkspaceRoot() || ".";
  try {
    return await invoke<string>("execute_shell", { cmd, cwd });
  } catch (err: any) {
    return `Error: ${err.message || err}`;
  }
}

// ─── Main Agent Entry Point ─────────────────────────────────────────────────

/**
 * Run one turn of the agent conversation loop.
 * @param userQuery - The user's message. Pass null for continuation turns.
 */
export async function runAgentTurn(userQuery: string | null): Promise<void> {
  const aiStore = useAIStore.getState();
  const model = aiStore.activeModel;
  const sessionId = `agent-${Date.now()}`;

  aiStore.setStreaming(true);

  let currentHistory: ChatMessage[] = [...aiStore.messages];

  // ── Start of new user task ───────────────────────────────────────────────
  if (userQuery) {
    // Clear agent state (steps/logs) but preserve message history for context
    aiStore.clearAgentState();

    // Gather workspace context for the first message only
    const workspaceCtx = getWorkspaceContext();
    let contextStr = "";

    if (workspaceCtx.activeFile.path) {
      contextStr += `\n\n[Active file: ${workspaceCtx.activeFile.path}]`;
      if (workspaceCtx.activeFile.content) {
        // Limit context to 2000 chars to save tokens
        const preview = workspaceCtx.activeFile.content.slice(0, 2000);
        contextStr += `\n\`\`\`\n${preview}\n\`\`\``;
      }
    }

    const workspaceRoot = getWorkspaceRoot();
    if (workspaceRoot) {
      contextStr += `\n[Workspace: ${workspaceRoot}]`;
      if (workspaceCtx.fileTree) {
        contextStr += `\n[Files:\n${workspaceCtx.fileTree.slice(0, 800)}]`;
      }
    }

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: userQuery + contextStr,
      timestamp: Date.now(),
    };

    aiStore.addMessage(userMsg);
    currentHistory.push(userMsg);
  }

  // Apply sliding window
  const trimmedHistory = trimHistory(currentHistory);

  // Build chat payload — system prompt always first
  const chatPayload = [
    { role: "system" as const, content: AGENT_SYSTEM_PROMPT },
    ...trimmedHistory
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role as "user" | "assistant" | "system", content: m.content })),
  ];

  // Add placeholder for streaming assistant message
  const assistantMsgId = `assistant-${Date.now()}`;
  const assistantMsg: ChatMessage = {
    id: assistantMsgId,
    role: "assistant",
    content: "",
    timestamp: Date.now(),
  };
  aiStore.addMessage(assistantMsg);
  aiStore.setAgentStatus("thinking");
  aiStore.addAgentLog("Thinking...");

  let fullContent = "";

  try {
    await chatOllama(sessionId, model, chatPayload, (chunk, done) => {
      fullContent += chunk;
      aiStore.updateLastMessageContent(fullContent);

      if (done) {
        aiStore.setStreaming(false);
        handleCompletedTurn(fullContent);
      }
    });
  } catch (err: any) {
    aiStore.setStreaming(false);
    aiStore.setAgentStatus("idle");
    aiStore.addAgentLog(`Error: ${err.message || err}`);
    aiStore.updateLastMessageContent(
      `⚠️ Error connecting to Ollama: ${err.message || err}\n\nMake sure Ollama is running and a model is loaded.`
    );
  }
}

// ─── Handle Completed Agent Turn ───────────────────────────────────────────

async function handleCompletedTurn(content: string): Promise<void> {
  const aiStore = useAIStore.getState();
  aiStore.addAgentLog("Parsing response...");

  // Parse checklist plan if present
  const steps = parsePlan(content);
  if (steps.length > 0) {
    aiStore.setAgentSteps(steps);
  }

  // ── Regex patterns for each action tag ──────────────────────────────────
  const writeFileRx   = /<write_file\s+path="([^"]+)">([\s\S]*?)<\/write_file>/;
  const readFileRx    = /<read_file\s+path="([^"]+)"\s*\/>/;
  const runCommandRx  = /<run_command>([\s\S]*?)<\/run_command>/;
  const listDirRx     = /<list_dir\s+path="([^"]+)"\s*\/>/;
  const searchRx      = /<search_files\s+query="([^"]+)"\s+path="([^"]+)"\s*\/>/;

  const writeMatch   = content.match(writeFileRx);
  const readMatch    = content.match(readFileRx);
  const runMatch     = content.match(runCommandRx);
  const listDirMatch = content.match(listDirRx);
  const searchMatch  = content.match(searchRx);

  // ── 1. WRITE FILE ────────────────────────────────────────────────────────
  if (writeMatch) {
    const targetPath = writeMatch[1].trim();
    const fileContent = writeMatch[2].replace(/^\n/, ""); // strip leading newline

    aiStore.setAgentStatus("generating");
    aiStore.addAgentLog(`Writing file: ${targetPath}`);

    try {
      const workspaceRoot = getWorkspaceRoot();
      const absolutePath = workspaceRoot
        ? resolvePath(workspaceRoot, targetPath)
        : targetPath;

      // Write file to disk via Rust backend
      await invoke("write_file", { path: absolutePath, content: fileContent });
      aiStore.addAgentLog(`✓ Created: ${targetPath}`);

      // Refresh file tree in Explorer
      if (workspaceRoot) {
        try {
          const entries = await invoke<{ name: string; path: string; is_dir: boolean; size?: number }[]>(
            "list_dir", { path: workspaceRoot }
          );
          const { setTree } = useFileStore.getState();
          setTree(entries.map((e) => ({
            name: e.name,
            path: e.path,
            isDir: e.is_dir,
            size: e.size,
            children: undefined,
            expanded: false,
          })));
        } catch {}
      }

      // Determine language from extension
      const ext = targetPath.split(".").pop() || "";
      const langMap: Record<string, string> = {
        ts: "typescript", tsx: "typescriptreact", js: "javascript", jsx: "javascriptreact",
        py: "python", rs: "rust", go: "go", java: "java", cpp: "cpp", c: "c",
        cs: "csharp", rb: "ruby", php: "php", html: "html", css: "css",
        json: "json", yaml: "yaml", yml: "yaml", md: "markdown", sh: "shell",
        bash: "shell", toml: "toml", sql: "sql", kt: "kotlin", swift: "swift",
      };
      const language = langMap[ext.toLowerCase()] || "plaintext";

      // Open the file in the editor
      const editorStore = useEditorStore.getState();
      const fileName = targetPath.split(/[/\\]/).pop() || targetPath;

      // Update if already open, otherwise open fresh
      const existingFile = editorStore.openFiles.find((f) => f.path === absolutePath);
      if (existingFile) {
        editorStore.updateContent(absolutePath, fileContent);
        editorStore.setActiveFile(absolutePath);
        editorStore.markSaved(absolutePath);
      } else {
        editorStore.openFile({
          path: absolutePath,
          name: fileName,
          content: fileContent,
          language,
          isDirty: false,
        });
      }

      // Post system confirmation
      const sysMsg: ChatMessage = {
        id: `sys-${Date.now()}`,
        role: "system",
        content: `[write_file]: Created "${targetPath}" (${fileContent.length} chars) and opened in editor.`,
        timestamp: Date.now(),
      };
      aiStore.addMessage(sysMsg);

    } catch (err: any) {
      aiStore.addAgentLog(`✗ Failed: ${err.message || err}`);
      aiStore.addMessage({
        id: `sys-${Date.now()}`,
        role: "system",
        content: `[write_file error]: Could not write "${targetPath}": ${err.message || err}`,
        timestamp: Date.now(),
      });
    }

    // Continue the agent loop for next steps
    setTimeout(() => runAgentTurn(null), 400);
    return;
  }

  // ── 2. READ FILE ─────────────────────────────────────────────────────────
  if (readMatch) {
    const targetPath = readMatch[1].trim();
    aiStore.setAgentStatus("reading");
    aiStore.addAgentLog(`Reading: ${targetPath}`);

    let fileContent = "";
    try {
      const workspaceRoot = getWorkspaceRoot();
      const absolutePath = workspaceRoot ? resolvePath(workspaceRoot, targetPath) : targetPath;
      fileContent = await invoke<string>("read_file", { path: absolutePath });
      aiStore.addAgentLog(`✓ Read ${fileContent.length} chars`);
    } catch (err: any) {
      fileContent = `Error reading file: ${err.message || err}`;
      aiStore.addAgentLog(`✗ Read failed`);
    }

    aiStore.addMessage({
      id: `sys-${Date.now()}`,
      role: "system",
      content: `[read_file "${targetPath}"]:\n\`\`\`\n${fileContent}\n\`\`\``,
      timestamp: Date.now(),
    });
    setTimeout(() => runAgentTurn(null), 400);
    return;
  }

  // ── 3. RUN COMMAND ───────────────────────────────────────────────────────
  if (runMatch) {
    const cmd = runMatch[1].trim();
    aiStore.setAgentStatus("executing");
    aiStore.addAgentLog(`Awaiting approval: ${cmd}`);
    aiStore.setPendingCommand(cmd);

    const approved = await new Promise<boolean>((resolve) => {
      aiStore.setCommandPermissionResolve(resolve);
    });

    aiStore.setPendingCommand(null);
    aiStore.setCommandPermissionResolve(null);

    if (approved) {
      aiStore.addAgentLog(`Executing: ${cmd}`);
      const output = await runShellCommand(cmd);
      aiStore.addAgentLog(`✓ Done`);
      aiStore.addMessage({
        id: `sys-${Date.now()}`,
        role: "system",
        content: `[run_command \`${cmd}\`]:\n\`\`\`\n${output}\n\`\`\``,
        timestamp: Date.now(),
      });
    } else {
      aiStore.addAgentLog(`Rejected by user`);
      aiStore.addMessage({
        id: `sys-${Date.now()}`,
        role: "system",
        content: `[run_command]: User rejected \`${cmd}\`.`,
        timestamp: Date.now(),
      });
    }

    setTimeout(() => runAgentTurn(null), 400);
    return;
  }

  // ── 4. LIST DIRECTORY ────────────────────────────────────────────────────
  if (listDirMatch) {
    const targetPath = listDirMatch[1].trim();
    aiStore.setAgentStatus("reading");
    aiStore.addAgentLog(`Listing: ${targetPath}`);

    let output = "";
    try {
      const workspaceRoot = getWorkspaceRoot();
      const absolutePath = workspaceRoot ? resolvePath(workspaceRoot, targetPath) : targetPath;
      const entries: any[] = await invoke("list_dir", { path: absolutePath });
      output = entries.map((e) => `${e.is_dir ? "📁" : "📄"} ${e.name}`).join("\n") || "(empty)";
      aiStore.addAgentLog(`✓ Listed ${entries.length} entries`);
    } catch (err: any) {
      output = `Error: ${err.message || err}`;
    }

    aiStore.addMessage({
      id: `sys-${Date.now()}`,
      role: "system",
      content: `[list_dir "${targetPath}"]:\n\`\`\`\n${output}\n\`\`\``,
      timestamp: Date.now(),
    });
    setTimeout(() => runAgentTurn(null), 400);
    return;
  }

  // ── 5. SEARCH FILES ──────────────────────────────────────────────────────
  if (searchMatch) {
    const query = searchMatch[1];
    const targetPath = searchMatch[2];
    aiStore.setAgentStatus("reading");
    aiStore.addAgentLog(`Searching "${query}"...`);

    let output = "";
    try {
      const workspaceRoot = getWorkspaceRoot();
      const absolutePath = workspaceRoot ? resolvePath(workspaceRoot, targetPath) : targetPath;
      const results: any[] = await invoke("search_files", { path: absolutePath, query });
      output = results.length === 0
        ? "No results found."
        : results.map((r) => `${r.file}:${r.line} — ${r.text}`).join("\n");
      aiStore.addAgentLog(`✓ ${results.length} results`);
    } catch (err: any) {
      output = `Error: ${err.message || err}`;
    }

    aiStore.addMessage({
      id: `sys-${Date.now()}`,
      role: "system",
      content: `[search_files "${query}"]:\n\`\`\`\n${output}\n\`\`\``,
      timestamp: Date.now(),
    });
    setTimeout(() => runAgentTurn(null), 400);
    return;
  }

  // ── 6. Plan only — kick off execution ────────────────────────────────────
  if (steps.length > 0) {
    aiStore.addAgentLog("Plan ready — executing...");
    aiStore.addMessage({
      id: `sys-${Date.now()}`,
      role: "system",
      content: "[system]: Plan created. Proceeding with execution.",
      timestamp: Date.now(),
    });
    setTimeout(() => runAgentTurn(null), 400);
    return;
  }

  // ── 7. Pure conversation — no action ─────────────────────────────────────
  aiStore.setAgentStatus("idle");
  aiStore.addAgentLog("Done.");
}
