/* ============================================================
   agent.ts — Offline AI Coding Agent Engine.
   Implements the Read-Think-Act-Repeat loop. Parses system
   tags for plan, think, read_file, write_file, and run_command.

   FIXES APPLIED:
   - Context injection only on first user turn (not every turn)
   - Message history sliding window to prevent context overflow
   - clearAgentState no longer wipes message history
   - File tree refresh after every write_file
   - Windows-safe path resolution (uses backslash normalization)
   ============================================================ */
import { invoke } from "@tauri-apps/api/core";
import { useAIStore, ChatMessage, AgentStep } from "../store/aiStore";
import { useFileStore } from "../store/fileStore";
import { useEditorStore } from "../store/editorStore";
import { chatOllama } from "./ollama";
import { getWorkspaceContext } from "./fileUtils";

// Max messages kept in sliding context window (user + assistant pairs)
const MAX_HISTORY_MESSAGES = 20;

const AGENT_SYSTEM_PROMPT = `You are Antigravity, an AI coding assistant integrated into an offline IDE.
You help users write code, fix bugs, read files, create files, and run terminal commands.

You have access to the following XML-like action tags. Use EXACTLY ONE per response when needed:

1. Read a file:
<read_file path="relative/path/to/file"/>

2. Write or overwrite a file:
<write_file path="relative/path/to/file">
file contents here
</write_file>

3. Run a shell command:
<run_command>command_to_run</run_command>

4. List a directory:
<list_dir path="relative/path/to/dir"/>

5. Search across files:
<search_files query="search_term" path="relative/path/to/search"/>

6. Think and plan:
<think>your reasoning process</think>

7. Show checklist:
<plan>
- [ ] step 1
- [ ] step 2
</plan>

RULES:
- If the user is chatting or asking a question, reply conversationally WITHOUT any action tags.
- If you need to perform a file/shell action, use ONE action tag and stop generating. Wait for the system result.
- After using an action tag, do not repeat the same action. Proceed to the next step.
- Do not make up file contents — read first if unsure.
- When the task is complete, say "Task complete" or summarize what you did.
- Keep responses concise and professional.
`;

/**
 * Executes a terminal command using the custom Rust backend command.
 */
async function runShellCommand(cmd: string): Promise<string> {
  const cwd = useFileStore.getState().workspaceRoot || ".";
  try {
    const output = await invoke<string>("execute_shell", { cmd, cwd });
    return output;
  } catch (err: any) {
    return `Error executing command: ${err.message || err}`;
  }
}

/**
 * Normalize a path for the current OS.
 * Joins workspaceRoot + relative path safely.
 */
function resolvePath(workspaceRoot: string, relativePath: string): string {
  // Normalize slashes: on Windows, use backslashes in the Rust layer
  // The Rust backend handles both, but we normalize here for consistency
  const separator = workspaceRoot.includes("\\") ? "\\" : "/";
  
  // If the path is already absolute, return as-is
  if (relativePath.startsWith("/") || /^[A-Za-z]:/.test(relativePath)) {
    return relativePath.replace(/[/\\]/g, separator);
  }
  
  // Remove leading ./ from relative path
  const cleanRelative = relativePath.replace(/^\.\//, "");
  
  return `${workspaceRoot}${separator}${cleanRelative}`.replace(/[/\\]{2,}/g, separator);
}

/**
 * Parses markdown-like checklist plan.
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
 * Trims message history to the sliding window size.
 * Always keeps the first user message (which has workspace context).
 */
function trimHistory(messages: ChatMessage[]): ChatMessage[] {
  if (messages.length <= MAX_HISTORY_MESSAGES) return messages;
  // Keep the first message (with workspace context) + the last N messages
  const firstMsg = messages[0];
  const tail = messages.slice(-MAX_HISTORY_MESSAGES + 1);
  return [firstMsg, ...tail];
}

/**
 * Triggers a single turn of the agent conversation loop.
 */
export async function runAgentTurn(userQuery: string | null): Promise<void> {
  const aiStore = useAIStore.getState();
  const model = aiStore.activeModel;
  const sessionId = `agent-${Date.now()}`;

  aiStore.setStreaming(true);

  let currentHistory: ChatMessage[] = [...aiStore.messages];

  // 1. If userQuery is provided, this is the start of a new task.
  if (userQuery) {
    // Only clear agent steps/logs, NOT message history (preserve conversation context)
    aiStore.clearAgentState();

    // Gather workspace context ONLY for the initial user message
    const workspaceContext = getWorkspaceContext();
    let contextStr = `\n\n=== Workspace ===\n`;
    if (workspaceContext.activeFile.path) {
      contextStr += `Active file: ${workspaceContext.activeFile.path}\n`;
      if (workspaceContext.activeFile.content) {
        contextStr += `\`\`\`\n${workspaceContext.activeFile.content.slice(0, 3000)}\n\`\`\`\n`;
      }
    }
    if (workspaceContext.fileTree) {
      contextStr += `File tree:\n${workspaceContext.fileTree}\n`;
    }

    const initialUserMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: `${userQuery}${contextStr}`,
      timestamp: Date.now(),
    };

    aiStore.addMessage(initialUserMessage);
    currentHistory.push(initialUserMessage);
  }

  // Apply sliding window to prevent context overflow
  const trimmedHistory = trimHistory(currentHistory);

  // Build the full chat payload with system prompt at head
  const chatMessages = [
    { role: "system" as const, content: AGENT_SYSTEM_PROMPT },
    ...trimmedHistory
      .filter((m) => m.role !== "system") // Don't double-include system messages from history display
      .map((m) => ({ role: m.role, content: m.content })),
  ];

  // Add a blank placeholder assistant message for streaming
  const assistantMsgId = `assistant-${Date.now()}`;
  const assistantMessage: ChatMessage = {
    id: assistantMsgId,
    role: "assistant",
    content: "",
    timestamp: Date.now(),
  };
  aiStore.addMessage(assistantMessage);

  aiStore.setAgentStatus("thinking");
  aiStore.addAgentLog("Thinking...");

  let fullContent = "";

  try {
    await chatOllama(sessionId, model, chatMessages, (chunk, done) => {
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
    aiStore.updateLastMessageContent(`An error occurred: ${err.message || err}`);
  }
}

/**
 * Handle a complete generation from the Agent
 */
async function handleCompletedTurn(content: string) {
  const aiStore = useAIStore.getState();
  aiStore.addAgentLog("Analyzing response...");

  // Parse plan if present
  const steps = parsePlan(content);
  if (steps.length > 0) {
    aiStore.setAgentSteps(steps);
  }

  // Parse actions (only first match per turn — one action at a time)
  const readFileRegex = /<read_file\s+path="([^"]+)"\s*\/>/;
  const writeFileRegex = /<write_file\s+path="([^"]+)">([\s\S]*?)<\/write_file>/;
  const runCommandRegex = /<run_command>([\s\S]*?)<\/run_command>/;
  const listDirRegex = /<list_dir\s+path="([^"]+)"\s*\/>/;
  const searchFilesRegex = /<search_files\s+query="([^"]+)"\s+path="([^"]+)"\s*\/>/;

  const readMatch = content.match(readFileRegex);
  const writeMatch = content.match(writeFileRegex);
  const runMatch = content.match(runCommandRegex);
  const listDirMatch = content.match(listDirRegex);
  const searchMatch = content.match(searchFilesRegex);

  // ── 1. Read File ─────────────────────────────────────────────
  if (readMatch) {
    const targetPath = readMatch[1];
    aiStore.setAgentStatus("reading");
    aiStore.addAgentLog(`Reading: ${targetPath}`);

    let fileContent = "";
    try {
      const workspaceRoot = useFileStore.getState().workspaceRoot || "";
      const absolutePath = workspaceRoot ? resolvePath(workspaceRoot, targetPath) : targetPath;
      fileContent = await invoke<string>("read_file", { path: absolutePath });
      aiStore.addAgentLog(`✓ Read: ${targetPath}`);
    } catch (err: any) {
      fileContent = `Error reading file: ${err.message || err}`;
      aiStore.addAgentLog(`✗ Read failed: ${targetPath}`);
    }

    const systemMessage: ChatMessage = {
      id: `sys-${Date.now()}`,
      role: "system",
      content: `[read_file result for "${targetPath}"]:\n\`\`\`\n${fileContent}\n\`\`\``,
      timestamp: Date.now(),
    };
    aiStore.addMessage(systemMessage);
    setTimeout(() => runAgentTurn(null), 500);
    return;
  }

  // ── 2. Write File ────────────────────────────────────────────
  if (writeMatch) {
    const targetPath = writeMatch[1];
    const newContent = writeMatch[2].replace(/^\n/, ""); // strip leading newline
    aiStore.setAgentStatus("generating");
    aiStore.addAgentLog(`Writing: ${targetPath}`);

    try {
      const workspaceRoot = useFileStore.getState().workspaceRoot || "";
      const absolutePath = workspaceRoot ? resolvePath(workspaceRoot, targetPath) : targetPath;

      await invoke("write_file", { path: absolutePath, content: newContent });
      aiStore.addAgentLog(`✓ Wrote: ${targetPath}`);

      // Refresh the file tree so the new file appears in Explorer
      if (workspaceRoot) {
        const { list_dir_recursive } = await import("../lib/fileUtils");
        list_dir_recursive(workspaceRoot);
      }

      // Update editor if file is open, otherwise open it
      const editorStore = useEditorStore.getState();
      const openFile = editorStore.openFiles.find(
        (f) => f.path === absolutePath || f.path === targetPath
      );

      if (openFile) {
        editorStore.updateContent(openFile.path, newContent);
      } else {
        const name = targetPath.split(/[/\\]/).pop() || targetPath;
        const ext = name.split(".").pop() || "";
        const { getLanguageFromExt } = await import("../lib/fileIcons");
        editorStore.openFile({
          path: absolutePath,
          name,
          content: newContent,
          language: getLanguageFromExt(ext),
          isDirty: false,
        });
      }

      const systemMessage: ChatMessage = {
        id: `sys-${Date.now()}`,
        role: "system",
        content: `[write_file]: Successfully wrote "${targetPath}" (${newContent.length} chars)`,
        timestamp: Date.now(),
      };
      aiStore.addMessage(systemMessage);
    } catch (err: any) {
      aiStore.addAgentLog(`✗ Write failed: ${targetPath}: ${err.message || err}`);
      const systemMessage: ChatMessage = {
        id: `sys-${Date.now()}`,
        role: "system",
        content: `[write_file error]: Failed to write "${targetPath}": ${err.message || err}`,
        timestamp: Date.now(),
      };
      aiStore.addMessage(systemMessage);
    }

    setTimeout(() => runAgentTurn(null), 500);
    return;
  }

  // ── 3. Run Command ───────────────────────────────────────────
  if (runMatch) {
    const cmd = runMatch[1].trim();
    aiStore.setAgentStatus("executing");
    aiStore.addAgentLog(`Requesting command: ${cmd}`);

    aiStore.setPendingCommand(cmd);

    const cmdPromise = new Promise<boolean>((resolve) => {
      aiStore.setCommandPermissionResolve(resolve);
    });

    const approved = await cmdPromise;
    aiStore.setPendingCommand(null);
    aiStore.setCommandPermissionResolve(null);

    if (approved) {
      aiStore.addAgentLog(`Executing: ${cmd}`);
      const output = await runShellCommand(cmd);
      aiStore.addAgentLog(`✓ Command complete`);

      const systemMessage: ChatMessage = {
        id: `sys-${Date.now()}`,
        role: "system",
        content: `[run_command result for \`${cmd}\`]:\n\`\`\`\n${output}\n\`\`\``,
        timestamp: Date.now(),
      };
      aiStore.addMessage(systemMessage);
    } else {
      aiStore.addAgentLog(`Command rejected by user`);
      const systemMessage: ChatMessage = {
        id: `sys-${Date.now()}`,
        role: "system",
        content: `[run_command]: User rejected executing \`${cmd}\`.`,
        timestamp: Date.now(),
      };
      aiStore.addMessage(systemMessage);
    }

    setTimeout(() => runAgentTurn(null), 500);
    return;
  }

  // ── 4. List Directory ────────────────────────────────────────
  if (listDirMatch) {
    const targetPath = listDirMatch[1];
    aiStore.setAgentStatus("reading");
    aiStore.addAgentLog(`Listing: ${targetPath}`);

    let dirContent = "";
    try {
      const workspaceRoot = useFileStore.getState().workspaceRoot || "";
      const absolutePath = workspaceRoot ? resolvePath(workspaceRoot, targetPath) : targetPath;

      const entries: any[] = await invoke("list_dir", { path: absolutePath });
      dirContent = entries
        .map((e) => `${e.is_dir ? "📁" : "📄"} ${e.name}${e.size ? ` (${e.size}b)` : ""}`)
        .join("\n");
      if (!dirContent) dirContent = "(empty directory)";
      aiStore.addAgentLog(`✓ Listed: ${targetPath}`);
    } catch (err: any) {
      dirContent = `Error: ${err.message || err}`;
      aiStore.addAgentLog(`✗ List failed: ${targetPath}`);
    }

    const systemMessage: ChatMessage = {
      id: `sys-${Date.now()}`,
      role: "system",
      content: `[list_dir result for "${targetPath}"]:\n\`\`\`\n${dirContent}\n\`\`\``,
      timestamp: Date.now(),
    };
    aiStore.addMessage(systemMessage);
    setTimeout(() => runAgentTurn(null), 500);
    return;
  }

  // ── 5. Search Files ──────────────────────────────────────────
  if (searchMatch) {
    const query = searchMatch[1];
    const targetPath = searchMatch[2];
    aiStore.setAgentStatus("reading");
    aiStore.addAgentLog(`Searching "${query}" in ${targetPath}`);

    let searchContent = "";
    try {
      const workspaceRoot = useFileStore.getState().workspaceRoot || "";
      const absolutePath = workspaceRoot ? resolvePath(workspaceRoot, targetPath) : targetPath;

      const results: any[] = await invoke("search_files", { path: absolutePath, query });
      searchContent = results.length === 0
        ? "No results found."
        : results.map((r) => `${r.file}:${r.line} — ${r.text}`).join("\n");
      aiStore.addAgentLog(`✓ Search done: ${results.length} results`);
    } catch (err: any) {
      searchContent = `Error: ${err.message || err}`;
      aiStore.addAgentLog(`✗ Search failed`);
    }

    const systemMessage: ChatMessage = {
      id: `sys-${Date.now()}`,
      role: "system",
      content: `[search_files result for "${query}" in "${targetPath}"]:\n\`\`\`\n${searchContent}\n\`\`\``,
      timestamp: Date.now(),
    };
    aiStore.addMessage(systemMessage);
    setTimeout(() => runAgentTurn(null), 500);
    return;
  }

  // ── 6. Plan only (no action yet) ────────────────────────────
  if (steps.length > 0) {
    aiStore.addAgentLog("Plan ready — starting execution...");
    const systemMessage: ChatMessage = {
      id: `sys-${Date.now()}`,
      role: "system",
      content: `[system]: Plan created. Execute each step using the action tags.`,
      timestamp: Date.now(),
    };
    aiStore.addMessage(systemMessage);
    setTimeout(() => runAgentTurn(null), 500);
    return;
  }

  // ── 7. No action — conversation complete ──────────────────────
  aiStore.setAgentStatus("idle");
  aiStore.addAgentLog("Done.");
}
