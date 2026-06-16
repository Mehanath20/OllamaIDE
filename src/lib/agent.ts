/* ============================================================
   agent.ts — AntiNetwork Agent Engine (v3)
   Fixes in this version:
   - Multi-strategy path extraction (handles no quotes, spaces, all formats)
   - Raw model output logged for debugging (first 300 chars)
   - System prompt examples NO LONGER contain placeholders (model copies them)
   - Plan parser filters out directory-only entries (css/, js/, etc.)
   - <done> signal properly stops the autonomous loop
   - agentAborted flag checked at every continuation point
   - Max-turn guard (40 turns) prevents infinite loops
   ============================================================ */
import { invoke } from "@tauri-apps/api/core";
import { useAIStore, ChatMessage, AgentStep } from "../store/aiStore";
import { useFileStore } from "../store/fileStore";
import { useEditorStore } from "../store/editorStore";
import { chatOllama } from "./ollama";
import { getWorkspaceContext } from "./fileUtils";

// ─── Constants ───────────────────────────────────────────────────────────────

/** Max messages kept in the sliding context window sent to the model. */
const MAX_HISTORY_MESSAGES = 24;

/**
 * Safety limit: stop after this many auto-continuation turns.
 * Prevents runaway behavior especially with small (3b/7b) models.
 */
const MAX_AUTO_TURNS = 40;

// Module-level counter — reset for every new user message
let autoTurnCount = 0;

// ─── System Prompt ───────────────────────────────────────────────────────────

const AGENT_SYSTEM_PROMPT = `You are AntiNetwork, an autonomous AI coding agent inside a local IDE.
You write COMPLETE code files and use XML action tags to interact with the filesystem.

== RULES (read carefully) ==

1. ALWAYS write 100% complete file contents. No placeholder comments like:
   "// ... rest of code", "/* styles here */", "// TODO", "// implement this"
   Every line of the file must be real, working code.

2. For web UIs: use beautiful CSS — dark backgrounds, vibrant colors, gradients,
   glassmorphism (backdrop-filter), smooth transitions, Google Fonts.

3. To write a file, use EXACTLY this format (the path= attribute is REQUIRED):
   <write_file path="shopping-cart/index.html">
   <!DOCTYPE html>
   <html lang="en">
   <head>
     <meta charset="UTF-8">
     <title>Shop</title>
     <link rel="stylesheet" href="css/style.css">
   </head>
   <body>
     <nav><!-- full nav content --></nav>
     <main><!-- full page content --></main>
   </body>
   </html>
   </write_file>

4. For multi-file projects:
   - FIRST turn: output a <plan> with ONLY actual FILE paths (not folders):
     <plan>
     - [ ] shopping-cart/index.html
     - [ ] shopping-cart/css/style.css
     - [ ] shopping-cart/js/app.js
     </plan>
   - EVERY NEXT turn: write ONE file with <write_file path="...">
   - LAST turn (after writing all files): output <done>All files created.</done>

5. The system auto-continues after each file. Keep writing files until done.
   When you see "[write_file]: Created ..." it means the file saved. Write the next one.

6. NEVER put folders (css/, js/, assets/) in the plan — only actual files.

7. Do NOT wrap <write_file> tags in markdown code fences.

== OTHER ACTIONS ==

Read a file:    <read_file path="file.txt"/>
Run a command:  <run_command>npm install</run_command>
List a folder:  <list_dir path="./src"/>
Search files:   <search_files query="keyword" path="."/>
Signal done:    <done>Summary of what was built.</done>

== IMPORTANT ==
If you are asked to build a website or project — DO NOT EXPLAIN. Start with <plan> immediately.
After the plan, write the FIRST file completely. The system will call you again for each next file.
`;

// ─── Path Resolution ─────────────────────────────────────────────────────────

function resolvePath(workspaceRoot: string, relativePath: string): string {
  if (relativePath.startsWith("/") || /^[A-Za-z]:/.test(relativePath)) {
    return relativePath;
  }
  const clean = relativePath.replace(/^\.[\\/]/, "");
  const sep = workspaceRoot.includes("\\") ? "\\" : "/";
  return `${workspaceRoot}${sep}${clean}`;
}

function getWorkspaceRoot(): string {
  const storeRoot = useFileStore.getState().workspaceRoot;
  if (storeRoot) return storeRoot;
  return "/tmp/DeepCodeWorkspace";
}

// ─── Robust Path Extraction ───────────────────────────────────────────────────

/**
 * Extract the file path from a <write_file ...> opening tag using multiple strategies.
 * Small models often omit quotes, use different attribute names, or add extra spaces.
 *
 * Strategies tried in order:
 *  1. path="..." or path='...'   (standard double or single quotes)
 *  2. path=...                   (no quotes, stops at space or >)
 *  3. file="..." / name="..."    (alternate attribute names)
 *  4. First line of content      (if it looks like a file path — e.g. "index.html")
 */
function extractFilePath(openingTag: string, fileContent: string): string {
  // Strategy 1+2: any of path / file / name attributes, quoted or unquoted
  const attrPatterns = [
    /\bpath\s*=\s*["']([^"'>\n]+)["']/i,   // path="..." or path='...'
    /\bpath\s*=\s*([^\s>"']+)/i,            // path=filename.ext (no quotes)
    /\bfile\s*=\s*["']([^"'>\n]+)["']/i,   // file="..."
    /\bfile\s*=\s*([^\s>"']+)/i,            // file=filename.ext
    /\bname\s*=\s*["']([^"'>\n]+)["']/i,   // name="..."
    /\bname\s*=\s*([^\s>"']+)/i,            // name=filename.ext
  ];

  for (const pattern of attrPatterns) {
    const m = openingTag.match(pattern);
    if (m && m[1] && m[1] !== ">" && !m[1].startsWith("<")) {
      return m[1].trim();
    }
  }

  // Strategy 3: look at first non-empty line of content for a path-like value
  // e.g. model sometimes writes: <write_file>\nindex.html\n<!DOCTYPE...
  const firstLines = fileContent.split("\n").slice(0, 3);
  for (const line of firstLines) {
    const trimmed = line.trim();
    // Accept if it looks like a file path: contains a dot, no spaces, not HTML/code
    if (
      trimmed &&
      trimmed.includes(".") &&
      !trimmed.includes(" ") &&
      !trimmed.startsWith("<") &&
      !trimmed.startsWith("/") &&
      /\.(html|css|js|ts|json|md|txt|jsx|tsx|py|rs|go|java|php|rb|sql|yaml|yml|toml|sh|xml|svg)$/i.test(trimmed)
    ) {
      return trimmed;
    }
  }

  return "untitled.txt";
}

// ─── Plan Parsing ─────────────────────────────────────────────────────────────

/**
 * Parse a <plan> block into AgentStep list.
 * Filters out directory entries (entries ending in / or with no file extension).
 */
function parsePlan(text: string): AgentStep[] {
  const planRegex = /<plan>([\s\S]*?)<\/plan>/i;
  const match = text.match(planRegex);
  if (!match) return [];

  const lines = match[1].split("\n");
  const steps: AgentStep[] = [];
  let idCounter = 1;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const isCompleted = /^-\s*\[[xX]\]/.test(trimmed);
    const isPending = /^-\s*\[\s\]/.test(trimmed);
    if (isCompleted || isPending) {
      const text = trimmed.replace(/^-\s*\[[xX\s]\]\s*/, "").trim();

      // Skip pure directory entries (no file extension, or ends with /)
      if (!text || text.endsWith("/") || text.endsWith("\\")) continue;
      if (!text.includes(".")) continue;  // skip entries without a dot (directories)

      steps.push({
        id: `step-${idCounter++}`,
        text,
        status: isCompleted ? "completed" : "pending",
      });
    }
  }
  return steps;
}

// ─── History Trimming ─────────────────────────────────────────────────────────

function trimHistory(messages: ChatMessage[]): ChatMessage[] {
  if (messages.length <= MAX_HISTORY_MESSAGES) return messages;
  const firstMsg = messages[0];
  const tail = messages.slice(-(MAX_HISTORY_MESSAGES - 1));
  return [firstMsg, ...tail];
}

// ─── Shell Command ────────────────────────────────────────────────────────────

async function runShellCommand(cmd: string): Promise<string> {
  const cwd = getWorkspaceRoot() || ".";
  try {
    return await invoke<string>("execute_shell", { cmd, cwd });
  } catch (err: any) {
    return `Error: ${err.message || err}`;
  }
}

// ─── File Tree Refresh ────────────────────────────────────────────────────────

async function refreshFileTree(workspaceRoot: string): Promise<void> {
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
  } catch {
    // Best-effort — silently ignore refresh errors
  }
}

// ─── Open File in Editor ──────────────────────────────────────────────────────

const LANG_MAP: Record<string, string> = {
  ts: "typescript", tsx: "typescriptreact", js: "javascript", jsx: "javascriptreact",
  py: "python", rs: "rust", go: "go", java: "java", cpp: "cpp", c: "c",
  cs: "csharp", rb: "ruby", php: "php", html: "html", css: "css",
  json: "json", yaml: "yaml", yml: "yaml", md: "markdown", sh: "shell",
  bash: "shell", toml: "toml", sql: "sql", kt: "kotlin", swift: "swift",
  vue: "vue", svelte: "svelte", xml: "xml", txt: "plaintext",
};

function openInEditor(absolutePath: string, relativePath: string, content: string): void {
  const ext = relativePath.split(".").pop()?.toLowerCase() || "";
  const language = LANG_MAP[ext] || "plaintext";
  const fileName = relativePath.split(/[/\\]/).pop() || relativePath;
  const editorStore = useEditorStore.getState();

  const existingFile = editorStore.openFiles.find((f) => f.path === absolutePath);
  if (existingFile) {
    editorStore.updateContent(absolutePath, content);
    editorStore.setActiveFile(absolutePath);
    editorStore.markSaved(absolutePath);
  } else {
    editorStore.openFile({
      path: absolutePath,
      name: fileName,
      content,
      language,
      isDirty: false,
    });
  }
}

// ─── Workspace Context Builder ────────────────────────────────────────────────

function buildWorkspaceContext(): string {
  const workspaceCtx = getWorkspaceContext();
  const workspaceRoot = getWorkspaceRoot();
  let ctx = "";

  if (workspaceRoot) {
    ctx += `\n\n[Workspace Root: ${workspaceRoot}]`;
  }

  if (workspaceCtx.activeFile.path) {
    ctx += `\n[Active file: ${workspaceCtx.activeFile.path}]`;
    if (workspaceCtx.activeFile.content) {
      const preview = workspaceCtx.activeFile.content.slice(0, 3000);
      const truncated = workspaceCtx.activeFile.content.length > 3000 ? "\n... (truncated)" : "";
      ctx += `\n\`\`\`\n${preview}${truncated}\n\`\`\``;
    }
  }

  if (workspaceCtx.fileTree) {
    ctx += `\n[Project file tree:\n${workspaceCtx.fileTree.slice(0, 1500)}]`;
  }

  return ctx;
}

// ─── Main Agent Entry Point ───────────────────────────────────────────────────

export async function runAgentTurn(
  userQuery: string | null,
  attachedImages: string[] = []
): Promise<void> {
  const aiStore = useAIStore.getState();
  const model = aiStore.activeModel;
  const sessionId = `agent-${Date.now()}`;

  // ── New user query: reset everything ─────────────────────────────────────
  if (userQuery) {
    autoTurnCount = 0;
    aiStore.clearAgentState();
    // clearAgentState sets agentAborted=true as a side-effect; clear it now
    aiStore.setAgentAborted(false);
  }

  // ── Bail if user clicked Stop ─────────────────────────────────────────────
  if (useAIStore.getState().agentAborted) {
    return;
  }

  // ── Safety: max turn guard ────────────────────────────────────────────────
  autoTurnCount++;
  if (autoTurnCount > MAX_AUTO_TURNS) {
    aiStore.setAgentStatus("idle");
    aiStore.addAgentLog(`⚠ Reached max turns (${MAX_AUTO_TURNS}). Stopping.`);
    aiStore.addMessage({
      id: `sys-${Date.now()}`,
      role: "system",
      content: `[system]: Agent stopped after ${MAX_AUTO_TURNS} turns. Ask the agent to continue if the task is incomplete.`,
      timestamp: Date.now(),
    });
    return;
  }

  aiStore.setStreaming(true);
  let currentHistory: ChatMessage[] = [...aiStore.messages];

  // ── Inject workspace context into new user messages ───────────────────────
  if (userQuery) {
    const contextStr = buildWorkspaceContext();
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: userQuery + contextStr,
      timestamp: Date.now(),
      images: attachedImages.length > 0 ? attachedImages : undefined,
    };
    aiStore.addMessage(userMsg);
    currentHistory.push(userMsg);
  }

  // Apply sliding window
  const trimmedHistory = trimHistory(currentHistory);

  // Build the Ollama chat payload.
  //
  // KEY RULE: The payload must NEVER end with two consecutive assistant messages
  // and must NEVER end without a user/instruction message — otherwise the model
  // returns empty output and the agent loop silently dies.
  //
  // We map messages as follows:
  //   • role=="user"      → user    (normal user messages)
  //   • role=="assistant" → assistant (model responses)
  //   • role=="system" with content starting with "[" → user
  //       These are internal tool confirmations like "[write_file]: Created..."
  //       We remap them to "user" so the model treats them as instructions.
  //   • any other system message → skip (prevents re-sending the system prompt)
  const chatPayload: { role: "user" | "assistant" | "system"; content: string; images?: string[] }[] = [
    { role: "system", content: AGENT_SYSTEM_PROMPT, images: undefined },
  ];

  for (const m of trimmedHistory) {
    if (m.role === "user" || m.role === "assistant") {
      chatPayload.push({ role: m.role, content: m.content, images: m.images });
    } else if (m.role === "system" && m.content.startsWith("[")) {
      // Tool result / confirmation — include as a user-role instruction
      chatPayload.push({ role: "user", content: m.content, images: undefined });
    }
    // Any other system message (e.g. duplicated system prompt) is skipped
  }

  // Ensure the payload does not end with an assistant message.
  // If it does, the model has nothing to respond to and will return empty.
  // Inject a minimal continuation prompt so the agent keeps going.
  const last = chatPayload[chatPayload.length - 1];
  if (last && last.role === "assistant") {
    // Determine what file to write next based on pending plan steps
    const pendingSteps = useAIStore.getState().agentSteps.filter((s) => s.status === "pending");
    if (pendingSteps.length > 0) {
      const nextFile = pendingSteps[0].text;
      chatPayload.push({
        role: "user",
        content: `Write the next file now: "${nextFile}". Use <write_file path="${nextFile}"> with 100% complete content. No explanations, no preamble — just the file.`,
        images: undefined,
      });
    } else {
      chatPayload.push({
        role: "user",
        content: `All files from the plan have been written. Output <done>summary</done> now.`,
        images: undefined,
      });
    }
  }

  // Add streaming placeholder for the assistant reply
  const assistantMsg: ChatMessage = {
    id: `assistant-${Date.now()}`,
    role: "assistant",
    content: "",
    timestamp: Date.now(),
  };
  aiStore.addMessage(assistantMsg);
  aiStore.setAgentStatus("thinking");
  aiStore.addAgentLog(`Thinking... (turn ${autoTurnCount}/${MAX_AUTO_TURNS})`);

  let fullContent = "";

  try {
    await chatOllama(sessionId, model, chatPayload, (chunk, done) => {
      fullContent += chunk;
      aiStore.updateLastMessageContent(fullContent);

      if (done) {
        aiStore.setStreaming(false);
        // Log a preview of raw output to help debug model format issues
        const preview = fullContent.slice(0, 300).replace(/\n/g, "↵");
        aiStore.addAgentLog(`Raw[0:300]: ${preview}`);
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

// ─── Handle Completed Agent Turn ─────────────────────────────────────────────

async function handleCompletedTurn(content: string): Promise<void> {
  const aiStore = useAIStore.getState();

  // ── Stop if user clicked the Stop button ─────────────────────────────────
  if (aiStore.agentAborted) {
    aiStore.addAgentLog("⛔ Stopped by user.");
    return;
  }

  aiStore.addAgentLog("Parsing response...");

  // ── Parse plan steps ──────────────────────────────────────────────────────
  const steps = parsePlan(content);
  if (steps.length > 0) {
    aiStore.setAgentSteps(steps);
  }

  // ── Action tag regexes ────────────────────────────────────────────────────
  // Very permissive: allows missing quotes, extra spaces, any attribute order
  const writeFileRx  = /<write_file\b([^>]*)>([\s\S]*?)<\/write_file>/i;
  const readFileRx   = /<read_file\b([^>]*)\/>/i;
  const runCommandRx = /<run_command>([\s\S]*?)<\/run_command>/i;
  const listDirRx    = /<list_dir\b([^>]*)\/>/i;
  const searchRx     = /<search_files\b([^>]*)\/>/i;
  const doneRx       = /<done>([\s\S]*?)<\/done>/i;

  const writeMatch   = content.match(writeFileRx);
  const readMatch    = content.match(readFileRx);
  const runMatch     = content.match(runCommandRx);
  const listDirMatch = content.match(listDirRx);
  const searchMatch  = content.match(searchRx);
  const doneMatch    = content.match(doneRx);

  // Helper for simple single-attribute extraction (used by read/list/search)
  const extractAttr = (attrs: string, attrName: string): string | null => {
    const rx = new RegExp(`\\b${attrName}\\s*=\\s*["']?([^"'\\s>]+)["']?`, "i");
    const m = attrs.match(rx);
    return m ? m[1].trim() : null;
  };

  // ── DONE signal ───────────────────────────────────────────────────────────
  if (doneMatch) {
    const summary = doneMatch[1].trim();
    aiStore.setAgentStatus("idle");
    aiStore.addAgentLog(`✅ Task complete. ${summary}`);
    const currentSteps = useAIStore.getState().agentSteps;
    if (currentSteps.length > 0) {
      aiStore.setAgentSteps(currentSteps.map((s) => ({ ...s, status: "completed" as const })));
    }
    return; // Do NOT continue the loop
  }

  // ── 1. WRITE FILE ─────────────────────────────────────────────────────────
  if (writeMatch) {
    const attrStr    = writeMatch[1]; // everything between <write_file and >
    let fileContent  = writeMatch[2]; // everything between the tags

    // Strip markdown code fences the model may have accidentally added
    fileContent = fileContent
      .replace(/^\s*```[a-z]*\n?/i, "")
      .replace(/\n?```\s*$/i, "")
      .replace(/^\n/, "");

    // Multi-strategy path extraction using the full opening tag + content
    const fullOpeningTag = `<write_file ${attrStr}>`;
    let targetPath = extractFilePath(fullOpeningTag, fileContent);

    // Sanitize: strip leading slashes to keep relative
    targetPath = targetPath.replace(/^\/+/, "");

    aiStore.setAgentStatus("generating");
    aiStore.addAgentLog(`Writing file: ${targetPath} (${fileContent.length} chars)`);

    try {
      const workspaceRoot = getWorkspaceRoot();
      const absolutePath  = workspaceRoot ? resolvePath(workspaceRoot, targetPath) : targetPath;

      await invoke("write_file", { path: absolutePath, content: fileContent });
      aiStore.addAgentLog(`✓ Created: ${targetPath}`);

      if (workspaceRoot) await refreshFileTree(workspaceRoot);
      openInEditor(absolutePath, targetPath, fileContent);

      // Tick off the matching plan step
      const currentSteps = useAIStore.getState().agentSteps;
      const matchedStep  = currentSteps.find(
        (s) => (s.text.includes(targetPath) || targetPath.includes(s.text)) && s.status === "pending"
      );
      if (matchedStep) {
        aiStore.updateAgentStepStatus(matchedStep.id, "completed");
      }

      // Inject an explicit next-step instruction as a system message.
      // This gets remapped to role:"user" in the chatPayload builder, ensuring
      // the model always has a user message to respond to on the next turn.
      const afterSteps = useAIStore.getState().agentSteps.filter((s) => s.status === "pending");
      if (afterSteps.length > 0) {
        const nextFile = afterSteps[0].text;
        aiStore.addMessage({
          id: `sys-${Date.now()}`,
          role: "system",
          content: `[write_file]: Created "${targetPath}" (${fileContent.length} chars). ${afterSteps.length} file(s) remaining. Write the next file now: "${nextFile}". Use <write_file path="${nextFile}"> with 100% complete content.`,
          timestamp: Date.now(),
        });
      } else {
        aiStore.addMessage({
          id: `sys-${Date.now()}`,
          role: "system",
          content: `[write_file]: Created "${targetPath}" (${fileContent.length} chars). All files written. Output <done>summary</done> now.`,
          timestamp: Date.now(),
        });
      }

    } catch (err: any) {
      aiStore.addAgentLog(`✗ Failed: ${err.message || err}`);
      aiStore.addMessage({
        id: `sys-${Date.now()}`,
        role: "system",
        content: `[write_file error]: Could not write "${targetPath}": ${err.message || err}. Try again.`,
        timestamp: Date.now(),
      });
    }

    setTimeout(() => runAgentTurn(null), 500);
    return;
  }

  // ── 2. READ FILE ──────────────────────────────────────────────────────────
  if (readMatch) {
    const targetPath = extractAttr(readMatch[1], "path|file|name") || "";
    aiStore.setAgentStatus("reading");
    aiStore.addAgentLog(`Reading: ${targetPath}`);

    let fileContent = "";
    try {
      const workspaceRoot = getWorkspaceRoot();
      const absolutePath  = workspaceRoot ? resolvePath(workspaceRoot, targetPath) : targetPath;
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
    setTimeout(() => runAgentTurn(null), 500);
    return;
  }

  // ── 3. RUN COMMAND ────────────────────────────────────────────────────────
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
      aiStore.addAgentLog("Rejected by user");
      aiStore.addMessage({
        id: `sys-${Date.now()}`,
        role: "system",
        content: `[run_command]: User rejected \`${cmd}\`.`,
        timestamp: Date.now(),
      });
    }

    setTimeout(() => runAgentTurn(null), 500);
    return;
  }

  // ── 4. LIST DIRECTORY ─────────────────────────────────────────────────────
  if (listDirMatch) {
    const targetPath = extractAttr(listDirMatch[1], "path|dir") || ".";
    aiStore.setAgentStatus("reading");
    aiStore.addAgentLog(`Listing: ${targetPath}`);

    let output = "";
    try {
      const workspaceRoot = getWorkspaceRoot();
      const absolutePath  = workspaceRoot ? resolvePath(workspaceRoot, targetPath) : targetPath;
      const entries: any[] = await invoke("list_dir", { path: absolutePath });
      output = entries.length === 0
        ? "(empty directory)"
        : entries.map((e) => `${e.is_dir ? "📁" : "📄"} ${e.name}`).join("\n");
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
    setTimeout(() => runAgentTurn(null), 500);
    return;
  }

  // ── 5. SEARCH FILES ───────────────────────────────────────────────────────
  if (searchMatch) {
    const query      = extractAttr(searchMatch[1], "query") || "";
    const targetPath = extractAttr(searchMatch[1], "path|dir") || ".";
    aiStore.setAgentStatus("reading");
    aiStore.addAgentLog(`Searching: "${query}"`);

    let output = "";
    try {
      const workspaceRoot = getWorkspaceRoot();
      const absolutePath  = workspaceRoot ? resolvePath(workspaceRoot, targetPath) : targetPath;
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
    setTimeout(() => runAgentTurn(null), 500);
    return;
  }

  // ── 6. Plan only (no file action yet) — prompt model to start writing ─────
  if (steps.length > 0) {
    aiStore.addAgentLog(`Plan ready (${steps.length} files). Starting execution...`);
    // Inject an explicit instruction so the model doesn't return empty
    const firstFile = steps[0]?.text || "the first file";
    aiStore.addMessage({
      id: `sys-${Date.now()}`,
      role: "system",
      content: `[system]: Plan received (${steps.length} files). Write the FIRST file now: "${firstFile}". Use <write_file path="${firstFile}"> with 100% complete content.`,
      timestamp: Date.now(),
    });
    setTimeout(() => runAgentTurn(null), 500);
    return;
  }

  // ── 7. No action detected — pure conversation ─────────────────────────────
  aiStore.setAgentStatus("idle");
  aiStore.addAgentLog("Done.");
}
