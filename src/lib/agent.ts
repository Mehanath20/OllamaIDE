/* ============================================================
   agent.ts — AntiNetwork Agent Engine (v4 — Production)
   Multi-stage pipeline:
     1. Memory Load  → reads project manifest, dep map, decisions
     2. RAG Retrieval → smart context from indexed files
     3. Planner      → generates plan with dependency analysis
     4. Coder        → writes files ONE at a time
     5. Validator    → checks connectivity before saving
     6. Memory Save  → updates manifest + dep map post-write
   ============================================================ */
import { invoke } from "@tauri-apps/api/core";
import { useAIStore, ChatMessage, AgentStep } from "../store/aiStore";
import { useFileStore } from "../store/fileStore";
import { useEditorStore } from "../store/editorStore";
import { chatOllama } from "./ollama";
import { getWorkspaceContext } from "./fileUtils";
import {
  loadProjectMemory, saveProjectMemory,
  updateManifestFromFile, updateDependencyMap,
  formatMemoryAsContext, ProjectMemory,
} from "./agentMemory";
import {
  buildProjectIndex, indexSingleFile,
  retrieveRelevantContext, getDependents, getProjectIndex,
} from "./agentIndexer";
import {
  validateFileConnectivity, formatValidationResult,
} from "./agentValidator";

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_HISTORY_MESSAGES = 20;
const MAX_AUTO_TURNS = 40;
let autoTurnCount = 0;

// In-memory project memory (loaded once per workspace session)
let _projectMemory: ProjectMemory | null = null;
let _indexedWorkspace = "";

// ─── System Prompts ───────────────────────────────────────────────────────────

const BASE_RULES = `You are AntiNetwork, an elite autonomous AI coding agent embedded in a local IDE.
You interact with the filesystem using XML action tags.

== ACTIONS (use EXACTLY these formats) ==
Read a file:   <read_file path="src/app.js"/>
Run command:   <run_command>npm install express</run_command>
List folder:   <list_dir path="./src"/>
Search files:  <search_files query="useState" path="./src"/>
Write a file:  <write_file path="src/App.tsx">FULL FILE CONTENT HERE</write_file>
Task done:     <done>Summary of everything created.</done>

== ANTI-HALLUCINATION LAWS — NEVER BREAK THESE ==
1. NEVER claim a file was created without using <write_file>. No exceptions.
2. NEVER output <done> while files are still pending. You MUST write every file first.
3. NEVER abbreviate file content with '// rest of code', '// TODO', or '...'.
   Every file must contain 100% complete, working, production-ready code.
4. NEVER invent file paths that were not in your plan.
5. NEVER skip a file from the plan. Every planned file MUST be written.
6. ONE action per response. Do NOT mix <write_file> and <done> in the same response.
7. Do NOT wrap <write_file> tags inside markdown code fences.

== FILE CONNECTIVITY LAWS ==
- Every component/module you create MUST be imported somewhere.
- Every page you create MUST be reachable via a link or route.
- Every API/service MUST be called from the frontend.
`;

const CODER_RULES = BASE_RULES + `
== CODER EXECUTION PROTOCOL ==
TURN 1 — Planning: Output ONLY a <plan> listing ALL file paths you will create.
  You MUST start your response immediately with <plan>. Do NOT output any reasoning, architecture decisions, or explanations. Just the plan.
  Use this exact format (one file per line):
  - [ ] index.html
  - [ ] css/style.css
  - [ ] js/app.js
  Do NOT write any code in Turn 1. Only output the <plan> block.
  Do NOT output <done> in Turn 1.

TURN 2+ — Execution: Write exactly ONE file per turn using <write_file path="...">.
  After each file, wait for the system to confirm and tell you the next file.
  Only output <done> when the system confirms ALL files have been written.

== SMALL MODEL OPTIMIZATION (for Qwen/GLM/DeepSeek) ==
- Focus on ONE task at a time.
- Write complete working code without asking for clarification.
- Use standard patterns for the detected tech stack.
- When in doubt, write more code, not less.
- Assume all paths are relative to the project root unless told otherwise.
`;

// ─── Project Type Detection ───────────────────────────────────────────────────

type ProjectType = "html" | "react" | "vue" | "node" | "python" | "generic";

function detectProjectType(query: string): ProjectType {
  const q = query.toLowerCase();
  if (/\breact\b|jsx|tsx|\.jsx|\.tsx|create.react/.test(q)) return "react";
  if (/\bvue\b|\.vue|nuxt/.test(q)) return "vue";
  if (/\bexpress\b|node\.js|nodejs|fastify|koa|nestjs|backend api/.test(q)) return "node";
  if (/\bpython\b|flask|fastapi|django|\.py/.test(q)) return "python";
  if (/html|css|javascript|vanilla|static site|landing page|e.?commerce|portfolio/.test(q)) return "html";
  return "generic";
}

function getProjectTypeGuide(type: ProjectType): string {
  switch (type) {
    case "react":
      return `
== REACT PROJECT RULES ==
- Entry point is src/index.tsx or src/main.tsx — it MUST render <App />.
- App.tsx imports ALL page components and sets up React Router.
- Every component file exports a default function (PascalCase name).
- Use useState/useEffect for state. Import them from 'react'.
- CSS: import './ComponentName.css' at the top of each component.
- Never use document.getElementById in React — use refs or state.
- package.json must include: react, react-dom, react-router-dom.
`;
    case "vue":
      return `
== VUE PROJECT RULES ==
- Entry point is src/main.js — it mounts the App component.
- App.vue is the root component with <router-view /> for routing.
- Each .vue file has <template>, <script>, <style scoped> sections.
- Use Vue Router for navigation between pages.
- Components use defineComponent or <script setup> syntax.
`;
    case "node":
      return `
== NODE/EXPRESS PROJECT RULES ==
- Entry point is server.js or index.js — it starts the HTTP server.
- Routes are defined in a /routes/ directory and imported in server.js.
- Middleware (auth, cors, bodyParser) is configured in server.js.
- Use async/await for all database/IO operations.
- package.json must list all dependencies with correct version ranges.
- Always include error handling middleware at the end of server.js.
`;
    case "python":
      return `
== PYTHON PROJECT RULES ==
- Entry point is main.py or app.py.
- Use relative imports between project modules.
- requirements.txt must list ALL dependencies.
- Flask: routes use @app.route decorator and return jsonify().
- FastAPI: routes use @app.get/post decorators with Pydantic models.
`;
    case "html":
    default:
      return `
== HTML/CSS/JS PROJECT RULES ==
- index.html is the entry point. ALL pages must have a nav link back to index.html.
- Every CSS file must be linked in EVERY HTML file that uses it: <link rel="stylesheet" href="css/style.css">.
- Every JS file must be loaded at the BOTTOM of EVERY HTML file that uses it: <script src="js/app.js"></script>.
- NEVER use ES modules (import/export) in plain HTML projects — use global variables and functions.
- cart.js, products.js, app.js must all be loaded in the correct order (dependencies first).
- Store shared data (cart, products) in localStorage and window globals.
- Use relative paths for all assets: ../images/photo.jpg NOT /images/photo.jpg.
`;
  }
}

const PLANNER_RULES = BASE_RULES + `
== PLANNING RULES ==
1. Analyze the request and output a <plan> with file paths that are FULLY CONNECTED.
2. Include an "entrypoint" file that imports everything else.
3. List files in dependency order: utilities first, then services, then components, then pages.
4. Include a dependency note: <!-- FILE: src/A.tsx imports src/B.tsx -->
`;

const ARCHITECT_RULES = BASE_RULES + `
== ARCHITECT RULES ==
1. Design the system architecture and write only documentation files (.md).
2. Focus on folder structure, tech stack decisions, and data flow diagrams.
3. Do NOT write source code implementation files.
`;

const DEBUGGER_RULES = BASE_RULES + `
== DEBUGGER RULES ==
1. Read the failing file first with <read_file>.
2. Check related files using the dependency information provided.
3. Explain the root cause, then fix with <write_file>.
4. After fixing, check if dependent files also need updating.
`;

const REVIEWER_RULES = BASE_RULES + `
== REVIEWER RULES ==
1. Read and analyze the provided code.
2. Write findings to "code_review.md" using <write_file>.
3. Check for: security issues, performance bottlenecks, missing error handling, dead code.
`;

const DOCUMENTER_RULES = BASE_RULES + `
== DOCUMENTER RULES ==
1. Read source files, then rewrite them with full JSDoc/docstring documentation.
2. Write 100% complete file content including all original code plus documentation.
`;

function getSystemPrompt(persona: string): string {
  switch (persona) {
    case "Architect": return ARCHITECT_RULES;
    case "Debugger": return DEBUGGER_RULES;
    case "Reviewer": return REVIEWER_RULES;
    case "Documenter": return DOCUMENTER_RULES;
    case "Planner": return PLANNER_RULES;
    default: return CODER_RULES;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getWorkspaceRoot(): string {
  return useFileStore.getState().workspaceRoot || "/tmp/workspace";
}

function resolvePath(root: string, rel: string): string {
  if (rel.startsWith("/") || /^[A-Za-z]:/.test(rel)) return rel;
  const clean = rel.replace(/^\.[\\/]/, "");
  const sep = root.includes("\\") ? "\\" : "/";
  return `${root}${sep}${clean}`;
}

function extractFilePath(openTag: string, content: string): string {
  const patterns = [
    /\bpath\s*=\s*["']([^"'>\n]+)["']/i,
    /\bpath\s*=\s*([^\s>"']+)/i,
    /\bfile\s*=\s*["']([^"'>\n]+)["']/i,
    /\bname\s*=\s*["']([^"'>\n]+)["']/i,
  ];
  for (const p of patterns) {
    const m = openTag.match(p);
    if (m?.[1] && m[1] !== ">" && !m[1].startsWith("<")) return m[1].trim();
  }
  // Fallback: first line looks like a path
  for (const line of content.split("\n").slice(0, 3)) {
    const t = line.trim();
    if (t && t.includes(".") && !t.includes(" ") && !t.startsWith("<") &&
      /\.(html|css|js|ts|json|md|txt|jsx|tsx|py|rs|go|java|php|rb|sql|yaml|yml|toml|sh|xml|svg)$/i.test(t)) {
      return t;
    }
  }
  return "untitled.txt";
}

function parsePlan(text: string): AgentStep[] {
  let planContent = "";
  const m = text.match(/<plan>([\s\S]*?)<\/plan>/i);
  if (m) {
    planContent = m[1];
  } else {
    // Fallback: If <plan> exists but is unclosed, grab everything after it
    const openMatch = text.match(/<plan>([\s\S]*)$/i);
    if (openMatch) planContent = openMatch[1];
  }
  
  if (!planContent) return [];
  let id = 1;
  const lines = planContent.split("\n").map(l => l.trim()).filter(Boolean);
  const steps: AgentStep[] = [];

  for (const line of lines) {
    let filePath: string | null = null;
    let isCompleted = false;

    // Format 1: - [ ] path/file.ext  OR  - [x] path/file.ext
    if (line.match(/^[-*•]\s*\[[xX\s]\]/)) {
      filePath = line.replace(/^[-*•]\s*\[[xX\s]\]\s*/, "").trim();
      isCompleted = line.includes("[x]") || line.includes("[X]");
    }
    // Format 2: 1. path/file.ext  (numbered list)
    else if (line.match(/^\d+\.\s+/)) {
      filePath = line.replace(/^\d+\.\s+/, "").trim();
    }
    // Format 3: - path/file.ext  (plain bullet)
    else if (line.match(/^[-*•]\s+/) && !line.includes("[")) {
      filePath = line.replace(/^[-*•]\s+/, "").trim();
    }
    // Format 4: bare path on its own line that looks like a file
    else if (!line.startsWith("<") && !line.startsWith("#") && line.includes(".") && !line.includes(" ")) {
      filePath = line;
    }

    if (!filePath) continue;
    // Strip any trailing description after a space
    filePath = filePath.split(" ")[0];
    // Reject directories and non-files
    if (filePath.endsWith("/") || filePath.endsWith("\\")) continue;
    if (!filePath.match(/\.[a-zA-Z0-9]{1,6}$/)) continue;
    // Strip leading ./ or /
    filePath = filePath.replace(/^\.\//, "").replace(/^\/+/, "");

    steps.push({
      id: `step-${id++}`,
      text: filePath,
      status: isCompleted ? "completed" : "pending",
    });
  }
  return steps;
}

function trimHistory(msgs: ChatMessage[]): ChatMessage[] {
  if (msgs.length <= MAX_HISTORY_MESSAGES) return msgs;
  return [msgs[0], ...msgs.slice(-(MAX_HISTORY_MESSAGES - 1))];
}

async function runShell(cmd: string): Promise<string> {
  try {
    return await invoke<string>("execute_shell", { cmd, cwd: getWorkspaceRoot() });
  } catch (err: any) {
    return `Error: ${err.message || err}`;
  }
}

async function refreshFileTree(root: string): Promise<void> {
  try {
    const entries = await invoke<{ name: string; path: string; is_dir: boolean; size?: number }[]>("list_dir", { path: root });
    useFileStore.getState().setTree(entries.map(e => ({
      name: e.name, path: e.path, isDir: e.is_dir, size: e.size, children: undefined, expanded: false,
    })));
  } catch { }
}

const LANG_MAP: Record<string, string> = {
  ts: "typescript", tsx: "typescriptreact", js: "javascript", jsx: "javascriptreact",
  py: "python", rs: "rust", go: "go", java: "java", cpp: "cpp", c: "c",
  cs: "csharp", rb: "ruby", php: "php", html: "html", css: "css",
  json: "json", yaml: "yaml", yml: "yaml", md: "markdown", sh: "shell",
  toml: "toml", sql: "sql", kt: "kotlin", swift: "swift", vue: "vue", svelte: "svelte",
};

function openInEditor(absPath: string, relPath: string, content: string): void {
  const ext = relPath.split(".").pop()?.toLowerCase() || "";
  const lang = LANG_MAP[ext] || "plaintext";
  const name = relPath.split(/[/\\]/).pop() || relPath;
  const store = useEditorStore.getState();
  const existing = store.openFiles.find(f => f.path === absPath);
  if (existing) {
    store.updateContent(absPath, content);
    store.setActiveFile(absPath);
    store.markSaved(absPath);
  } else {
    store.openFile({ path: absPath, name, content, language: lang, isDirty: false });
  }
}

// ─── Written Files Ledger ─────────────────────────────────────────────────────
// Tracks files written in the CURRENT task for pre-write context injection

const _writtenThisTask: Map<string, string> = new Map(); // path → content
let _currentProjectType: ProjectType = "generic";

function getWrittenFileSummary(): string {
  if (_writtenThisTask.size === 0) return "";

  let summary = `\n== FILES ALREADY WRITTEN THIS SESSION ==\n`;
  for (const [path, content] of _writtenThisTask) {
    // Show first 40 lines of each file for import/structure reference
    const preview = content.split("\n").slice(0, 40).join("\n");
    const truncated = content.split("\n").length > 40 ? "\n... (truncated)" : "";
    summary += `\n[${path}]\n\`\`\`\n${preview}${truncated}\n\`\`\`\n`;
  }
  summary += `\nIMPORTANT: Reference these files for correct import paths and variable names.\n`;
  return summary;
}

// ─── Memory + Index Initialization ───────────────────────────────────────────

async function ensureMemoryAndIndex(): Promise<ProjectMemory> {
  const root = getWorkspaceRoot();

  // Load memory if not already loaded for this workspace
  if (!_projectMemory) {
    _projectMemory = await loadProjectMemory(root);
  }

  // Build index if workspace changed or not yet indexed
  if (_indexedWorkspace !== root) {
    const aiStore = useAIStore.getState();
    aiStore.addAgentLog("🔍 Indexing project files...");
    await buildProjectIndex(root, (done, total) => {
      if (done % 50 === 0) aiStore.addAgentLog(`  Indexed ${done}/${total} files`);
    });
    _indexedWorkspace = root;
    aiStore.addAgentLog(`✓ Index built: ${getProjectIndex()?.totalFiles || 0} files`);
  }

  return _projectMemory;
}

// ─── Context Builder ──────────────────────────────────────────────────────────

async function buildFullContext(userQuery: string): Promise<string> {
  const workspaceCtx = getWorkspaceContext();
  const root = getWorkspaceRoot();
  const memory = await ensureMemoryAndIndex();

  let ctx = "";

  if (root) ctx += `\n[Workspace: ${root}]`;

  // Active file
  if (workspaceCtx.activeFile.path) {
    ctx += `\n[Active file: ${workspaceCtx.activeFile.path}]`;
    if (workspaceCtx.activeFile.content) {
      const preview = workspaceCtx.activeFile.content.slice(0, 2000);
      ctx += `\n\`\`\`\n${preview}${workspaceCtx.activeFile.content.length > 2000 ? "\n...(truncated)" : ""}\n\`\`\``;
    }
  }

  // Project memory (manifest, decisions, rules)
  ctx += formatMemoryAsContext(memory);

  // RAG: smart relevant files
  const ragCtx = await retrieveRelevantContext(
    userQuery,
    workspaceCtx.activeFile.path,
    6,   // max files
    4000 // max chars total
  );
  ctx += ragCtx;

  // Impact analysis: if active file has dependents, note them
  if (workspaceCtx.activeFile.path) {
    const relPath = workspaceCtx.activeFile.path.replace(root, "").replace(/^[/\\]/, "");
    const dependents = getDependents(relPath);
    if (dependents.length > 0) {
      ctx += `\n[Files that import this file (will be affected by changes): ${dependents.slice(0, 8).join(", ")}]`;
    }
  }

  // Workspace tree (compact)
  if (workspaceCtx.fileTree) {
    ctx += `\n[Project tree (top-level):\n${workspaceCtx.fileTree.slice(0, 1200)}]`;
  }

  return ctx;
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

export async function runAgentTurn(
  userQuery: string | null,
  attachedImages: string[] = []
): Promise<void> {
  const aiStore = useAIStore.getState();
  const model = aiStore.activeModel;
  const sessionId = `agent-${Date.now()}`;

  if (userQuery) {
    autoTurnCount = 0;
    aiStore.clearAgentState();
    aiStore.setAgentAborted(false);
    // Reset per-task state
    _writtenThisTask.clear();
    _currentProjectType = detectProjectType(userQuery);
  }

  if (useAIStore.getState().agentAborted) return;

  autoTurnCount++;
  if (autoTurnCount > MAX_AUTO_TURNS) {
    aiStore.setAgentStatus("idle");
    aiStore.addAgentLog(`⚠ Max turns (${MAX_AUTO_TURNS}) reached. Stopping.`);
    aiStore.addMessage({
      id: `sys-${Date.now()}`, role: "system", timestamp: Date.now(),
      content: `[system]: Agent stopped after ${MAX_AUTO_TURNS} turns. Ask it to continue if needed.`
    });
    return;
  }

  aiStore.setStreaming(true);
  let history: ChatMessage[] = [...aiStore.messages];

  // Inject enriched context for new user messages
  if (userQuery) {
    aiStore.addAgentLog("🧠 Loading project memory & context...");
    aiStore.addAgentLog(`📦 Project type detected: ${_currentProjectType}`);
    const contextStr = await buildFullContext(userQuery);
    // Add project-type-specific guide to the system context
    const projectGuide = getProjectTypeGuide(_currentProjectType);
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: userQuery + contextStr + projectGuide,
      timestamp: Date.now(),
      images: attachedImages.length > 0 ? attachedImages : undefined,
    };
    aiStore.addMessage(userMsg);
    history.push(userMsg);
  }

  const trimmedHistory = trimHistory(history);

  // Build chat payload
  const payload: { role: "user" | "assistant" | "system"; content: string; images?: string[] }[] = [
    { role: "system", content: getSystemPrompt(aiStore.activePersona) },
  ];

  for (const m of trimmedHistory) {
    if (m.role === "user" || m.role === "assistant") {
      payload.push({ role: m.role, content: m.content, images: m.images });
    } else if (m.role === "system" && m.content.startsWith("[")) {
      payload.push({ role: "user", content: m.content });
    }
  }

  // Ensure payload doesn't end with assistant message
  const last = payload[payload.length - 1];
  if (last?.role === "assistant") {
    const pending = useAIStore.getState().agentSteps.filter(s => s.status === "pending");
    if (pending.length > 0) {
      payload.push({
        role: "user",
        content: `Write the next file now: "${pending[0].text}". Use <write_file path="${pending[0].text}"> with 100% complete content.`
      });
    } else {
      payload.push({ role: "user", content: `All files written. Output <done>summary</done> now.` });
    }
  }

  const assistantMsg: ChatMessage = { id: `assistant-${Date.now()}`, role: "assistant", content: "", timestamp: Date.now() };
  aiStore.addMessage(assistantMsg);
  aiStore.setAgentStatus("thinking");
  aiStore.addAgentLog(`Thinking... (turn ${autoTurnCount}/${MAX_AUTO_TURNS})`);

  let fullContent = "";
  try {
    await chatOllama(sessionId, model, payload, (chunk, done) => {
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
    aiStore.updateLastMessageContent(`⚠️ Ollama error: ${err.message || err}\n\nEnsure Ollama is running.`);
  }
}

// ─── Handle Completed Turn ────────────────────────────────────────────────────

async function handleCompletedTurn(content: string): Promise<void> {
  const aiStore = useAIStore.getState();
  if (aiStore.agentAborted) { aiStore.addAgentLog("⛔ Stopped by user."); return; }

  aiStore.addAgentLog("Parsing response...");

  const steps = parsePlan(content);
  if (steps.length > 0) aiStore.setAgentSteps(steps);

  const writeRx = /<write_file\b([^>]*)>([\s\S]*?)<\/write_file>/i;
  const readRx = /<read_file\b([^>]*)\/>/i;
  const runRx = /<run_command>([\s\S]*?)<\/run_command>/i;
  const listRx = /<list_dir\b([^>]*)\/>/i;
  const searchRx = /<search_files\b([^>]*)\/>/i;
  const doneRx = /<done>([\s\S]*?)<\/done>/i;

  let writeM = content.match(writeRx);
  const readM = content.match(readRx);
  const runM = content.match(runRx);
  const listM = content.match(listRx);
  const searchM = content.match(searchRx);
  const doneM = content.match(doneRx);

  const attr = (attrs: string, name: string): string | null => {
    const m = attrs.match(new RegExp(`\\b${name}\\s*=\\s*["']?([^"'\\s>]+)["']?`, "i"));
    return m ? m[1].trim() : null;
  };

  // ── DONE ────────────────────────────────────────────────────────────────────
  // CRITICAL: BLOCK <done> if there are still pending plan steps.
  // This is the primary fix for the hallucination bug where the model
  // emits <done> on the same turn as the <plan> without writing any files.
  if (doneM) {
    const pendingSteps = useAIStore.getState().agentSteps.filter(s => s.status === "pending");

    if (pendingSteps.length > 0) {
      // Model hallucinated a done — force it to write the next file
      aiStore.addAgentLog(`⚠️ Premature <done> blocked! ${pendingSteps.length} files still unwritten.`);
      aiStore.addMessage({
        id: `sys-${Date.now()}`, role: "system", timestamp: Date.now(),
        content: `[BLOCKED]: You output <done> but ${pendingSteps.length} files have NOT been written yet.\nYou MUST write them all before signaling done.\nWrite the next file NOW: "${pendingSteps[0].text}"\nUse: <write_file path="${pendingSteps[0].text}">...complete content...</write_file>\nDo NOT output <done> until ALL files are physically written.`,
      });
      setTimeout(() => runAgentTurn(null), 500);
      return;
    }

    // All steps confirmed written — safe to accept done
    aiStore.setAgentStatus("idle");
    aiStore.addAgentLog(`✅ Task complete: ${doneM[1].trim()}`);
    const currentSteps = useAIStore.getState().agentSteps;
    if (currentSteps.length > 0) {
      aiStore.setAgentSteps(currentSteps.map(s => ({ ...s, status: "completed" as const })));
    }
    if (_projectMemory) {
      const root = getWorkspaceRoot();
      _projectMemory.activeContext = `Last task: ${doneM[1].trim()} at ${new Date().toISOString()}`;
      await saveProjectMemory(root, _projectMemory);
    }
    return;
  }

  // ── MULTI-TURN CONTINUATION HANDLING ────────────────────────────────────────
  const truncatedFile = aiStore.truncatedFile;

  if (truncatedFile) {
    // We are currently in the middle of a multi-turn file generation.
    // The current content is just a continuation of the previous cut-off content.
    // Clean the continuation content of any markdown blocks small models might add
    const cleanContent = content
      .replace(/^\s*(Sure, here is the continuation|Continuing|Here is the rest|.*previous response got cut off.*).*?\n/i, "") // Strip conversational filler
      .replace(/^\s*```[a-z]*\n?/i, "")
      .replace(/\n?```\s*$/i, "");

    let appendedContent = truncatedFile.contentSoFar;
    
    // Check for overlap to prevent snippet duplication (in case the model repeated the end of the previous chunk)
    let overlapFound = false;
    for (let len = Math.min(appendedContent.length, cleanContent.length, 500); len > 0; len--) {
      if (appendedContent.endsWith(cleanContent.substring(0, len))) {
        appendedContent += cleanContent.substring(len);
        overlapFound = true;
        break;
      }
    }
    if (!overlapFound) {
      appendedContent += cleanContent;
    }

    // Auto-close if the continuation is short (meaning the model likely finished the file but forgot to close the tag)
    if (!appendedContent.includes("</write_file>") && cleanContent.trim().length < 500) {
      useAIStore.getState().addAgentLog("⚠️ Continuation was short and tag unclosed. Auto-closing file.");
      appendedContent += "\n</write_file>";
    }

    // Check if the model FINALLY closed the tag
    if (appendedContent.includes("</write_file>")) {
      // It finished! Synthesize the match to process normally.
      aiStore.addAgentLog("✓ Truncated file completed.");
      // Clear the truncated state immediately so it doesn't loop
      aiStore.setTruncatedFile(null);

      const openTagMatch = appendedContent.match(/<write_file\b([^>]*)>([\s\S]*?)<\/write_file>/i);
      if (openTagMatch) {
        writeM = openTagMatch;
      }
    } else {
      // Still truncated! Hit max tokens again.
      aiStore.addAgentLog("⚠️ Still truncated. Requesting another continuation...");
      aiStore.setTruncatedFile({ path: truncatedFile.path, contentSoFar: appendedContent });

      aiStore.addMessage({
        id: `sys-${Date.now()}`, role: "user", timestamp: Date.now(),
        content: `Your response hit the limit again. Please continue writing the code exactly from where you left off.\n` +
          `Do NOT repeat any code you already wrote. Start your response with the exact next character.\n` +
          `Do NOT include any conversational text or markdown code fences.`,
      });
      setTimeout(() => runAgentTurn(null), 500);
      return;
    }
    // If we appended content and found </write_file>, we synthesized writeM.
    // If not, we already returned. So if we are here, writeM is defined and we process it normally.
  }

  // ── WRITE FILE ──────────────────────────────────────────────────────────────
  let writeMatch = writeM;

  if (!writeMatch && !truncatedFile) {
    // Check if the model hit token limits and left an unclosed <write_file> tag
    const openTagMatch = content.match(/<write_file\b([^>]*)>([\s\S]*)$/i);
    if (openTagMatch && !content.includes("</write_file>")) {
      let targetPath = extractFilePath(`<write_file ${openTagMatch[1]}>`, "").replace(/^\/+/, "");

      // Save the state into the store so the NEXT turn knows to append
      aiStore.setTruncatedFile({
        path: targetPath,
        contentSoFar: openTagMatch[0] // this includes the tag and the partial content
      });

      aiStore.addAgentLog(`⚠️ Token limit hit. Saving partial file: ${targetPath}`);

      // We don't synthesize a match here anymore because we don't want to save a broken file.
      // We just ask for the continuation right away.
      aiStore.addMessage({
        id: `sys-${Date.now()}`, role: "user", timestamp: Date.now(),
        content: `Your last response hit the maximum length limit before finishing the file "${targetPath}".\n` +
          `Please continue exactly from where you left off. Start your response with the exact next character.\n` +
          `Do NOT repeat any code you already wrote. Do NOT include any conversational text or markdown code fences.`,
      });
      setTimeout(() => runAgentTurn(null), 500);
      return;
    }
  }

  if (writeMatch) {
    let fileContent = writeMatch[2]
      .replace(/^\s*```[a-z]*\n?/i, "")
      .replace(/\n?```\s*$/i, "")
      .replace(/^\n/, "");

    let targetPath = extractFilePath(`<write_file ${writeMatch[1]}>`, fileContent).replace(/^\/+/, "");

    aiStore.setAgentStatus("generating");
    aiStore.addAgentLog(`📝 Writing: ${targetPath} (${fileContent.length} chars)`);

    const root = getWorkspaceRoot();
    const absPath = resolvePath(root, targetPath);

    // ── Stage: Connectivity Validation ────────────────────────────────────────
    const memory = await ensureMemoryAndIndex();
    const idx = getProjectIndex();
    const validation = await validateFileConnectivity(absPath, fileContent, memory, idx, root);

    if (!validation.passed) {
      aiStore.addAgentLog(`⚠️ Validation issues found:\n${formatValidationResult(validation)}`);
    } else {
      aiStore.addAgentLog(`✅ Validation passed (${validation.score}/100)`);
    }

    // Log orphan warning explicitly so user sees it
    const orphanIssues = validation.issues.filter(i => i.category === "orphan");
    if (orphanIssues.length > 0) {
      aiStore.addAgentLog(`🔗 Note: ${orphanIssues[0].message}`);
      if (validation.suggestions.length > 0) {
        aiStore.addAgentLog(`💡 ${validation.suggestions[0]}`);
      }
    }

    try {
      await invoke("write_file", { path: absPath, content: fileContent });
      aiStore.addAgentLog(`✓ Created: ${targetPath}`);

      // Track written file for pre-write context injection
      _writtenThisTask.set(targetPath, fileContent);

      // ── Stage: Update Index + Memory ────────────────────────────────────────
      await indexSingleFile(absPath, root);

      if (_projectMemory) {
        _projectMemory = updateManifestFromFile(_projectMemory, absPath, fileContent, root);
        _projectMemory.dependencyMap = updateDependencyMap(_projectMemory.dependencyMap, absPath, fileContent, root);
        // Save memory asynchronously (don't block the agent)
        saveProjectMemory(root, _projectMemory).catch(() => { });
      }

      await refreshFileTree(root);
      openInEditor(absPath, targetPath, fileContent);

      // Tick off plan step
      const currentSteps = useAIStore.getState().agentSteps;
      const matched = currentSteps.find(s =>
        (s.text.includes(targetPath) || targetPath.includes(s.text)) && s.status === "pending"
      );
      if (matched) aiStore.updateAgentStepStatus(matched.id, "completed");

      // Check for dependent files that may need updating
      const relPath = targetPath.replace(/^[/\\]/, "");
      const dependents = getDependents(relPath);
      if (dependents.length > 0) {
        aiStore.addAgentLog(`🔗 Dependent files (may need import updates): ${dependents.slice(0, 5).join(", ")}`);
      }

      let sysMsg: string;
      const remaining = useAIStore.getState().agentSteps.filter(s => s.status === "pending");

      if (remaining.length > 0) {
        const nextFile = remaining[0].text;
        // Build pre-write context: what files have already been written
        const writtenSummary = getWrittenFileSummary();
        sysMsg = `[SYSTEM — FILE WRITTEN]: ✓ "${targetPath}" saved successfully.\n` +
          `${remaining.length} file(s) still remaining in plan.\n` +
          `NEXT ACTION REQUIRED: Write "${nextFile}" now.\n` +
          writtenSummary +
          `Use exactly: <write_file path="${nextFile}">...complete code...</write_file>\n` +
          `Do NOT output <done>. Do NOT skip this file. Write it in full.\n` +
          `CRITICAL: Your code in "${nextFile}" MUST correctly reference and connect to the files above.`;
      } else {
        // All files written — trigger connectivity verification pass
        const allWritten = [..._writtenThisTask.keys()].join(", ");
        sysMsg = `[SYSTEM — ALL FILES WRITTEN]: ✓ "${targetPath}" saved. All ${useAIStore.getState().agentSteps.length} planned files have been written.\n` +
          `Files created: ${allWritten}\n\n` +
          `FINAL CONNECTIVITY CHECK:\n` +
          `Before outputting <done>, verify:\n` +
          `1. Does index.html (or App.tsx/main.py/server.js) link/import ALL other files?\n` +
          `2. Are all navigation links between pages correct?\n` +
          `3. Do all JS/CSS files get loaded in every HTML file that needs them?\n` +
          `4. Is every component/module imported by something?\n` +
          `If anything is missing: use <write_file> to update the entry point.\n` +
          `If everything is connected: output <done>Complete description of what was built.</done>`;
      }
      aiStore.addMessage({ id: `sys-${Date.now()}`, role: "system", timestamp: Date.now(), content: sysMsg });

    } catch (err: any) {
      aiStore.addAgentLog(`✗ Failed to write: ${err.message || err}`);
      aiStore.addMessage({
        id: `sys-${Date.now()}`, role: "system", timestamp: Date.now(),
        content: `[write_file error]: Could not write "${targetPath}": ${err.message || err}. Try again.`
      });
    }

    setTimeout(() => runAgentTurn(null), 500);
    return;
  }

  // ── READ FILE ───────────────────────────────────────────────────────────────
  if (readM) {
    const targetPath = attr(readM[1], "path|file|name") || "";
    aiStore.setAgentStatus("reading");
    aiStore.addAgentLog(`📖 Reading: ${targetPath}`);
    let fc = "";
    try {
      const root = getWorkspaceRoot();
      fc = await invoke<string>("read_file", { path: resolvePath(root, targetPath) });
      aiStore.addAgentLog(`✓ Read ${fc.length} chars`);
    } catch (err: any) {
      fc = `Error: ${err.message || err}`;
    }
    aiStore.addMessage({
      id: `sys-${Date.now()}`, role: "system", timestamp: Date.now(),
      content: `[read_file "${targetPath}"]:\n\`\`\`\n${fc}\n\`\`\``
    });
    setTimeout(() => runAgentTurn(null), 500);
    return;
  }

  // ── RUN COMMAND ─────────────────────────────────────────────────────────────
  if (runM) {
    const cmd = runM[1].trim();
    aiStore.setAgentStatus("executing");
    aiStore.addAgentLog(`⏳ Awaiting approval: ${cmd}`);
    aiStore.setPendingCommand(cmd);

    const approved = await new Promise<boolean>(resolve => {
      aiStore.setCommandPermissionResolve(resolve);
    });
    aiStore.setPendingCommand(null);
    aiStore.setCommandPermissionResolve(null);

    if (approved) {
      const output = await runShell(cmd);
      aiStore.addAgentLog(`✓ Command done`);
      aiStore.addMessage({
        id: `sys-${Date.now()}`, role: "system", timestamp: Date.now(),
        content: `[run_command \`${cmd}\`]:\n\`\`\`\n${output}\n\`\`\``
      });
    } else {
      aiStore.addMessage({
        id: `sys-${Date.now()}`, role: "system", timestamp: Date.now(),
        content: `[run_command]: User rejected \`${cmd}\`.`
      });
    }
    setTimeout(() => runAgentTurn(null), 500);
    return;
  }

  // ── LIST DIRECTORY ──────────────────────────────────────────────────────────
  if (listM) {
    const targetPath = attr(listM[1], "path|dir") || ".";
    aiStore.setAgentStatus("reading");
    let output = "";
    try {
      const root = getWorkspaceRoot();
      const entries: any[] = await invoke("list_dir", { path: resolvePath(root, targetPath) });
      output = entries.length === 0 ? "(empty)" : entries.map(e => `${e.is_dir ? "📁" : "📄"} ${e.name}`).join("\n");
      aiStore.addAgentLog(`✓ Listed ${entries.length} entries`);
    } catch (err: any) { output = `Error: ${err.message}`; }
    aiStore.addMessage({
      id: `sys-${Date.now()}`, role: "system", timestamp: Date.now(),
      content: `[list_dir "${targetPath}"]:\n\`\`\`\n${output}\n\`\`\``
    });
    setTimeout(() => runAgentTurn(null), 500);
    return;
  }

  // ── SEARCH FILES ────────────────────────────────────────────────────────────
  if (searchM) {
    const query = attr(searchM[1], "query") || "";
    const targetPath = attr(searchM[1], "path|dir") || ".";
    aiStore.setAgentStatus("reading");
    let output = "";
    try {
      const root = getWorkspaceRoot();
      const results: any[] = await invoke("search_files", { path: resolvePath(root, targetPath), query });
      output = results.length === 0 ? "No results." : results.map(r => `${r.file}:${r.line} — ${r.text}`).join("\n");
      aiStore.addAgentLog(`✓ ${results.length} search results`);
    } catch (err: any) { output = `Error: ${err.message}`; }
    aiStore.addMessage({
      id: `sys-${Date.now()}`, role: "system", timestamp: Date.now(),
      content: `[search_files "${query}"]:\n\`\`\`\n${output}\n\`\`\``
    });
    setTimeout(() => runAgentTurn(null), 500);
    return;
  }

  // ── PLAN ONLY ───────────────────────────────────────────────────────────────
  if (steps.length > 0) {
    aiStore.addAgentLog(`📋 Plan ready: ${steps.length} files. Starting execution...`);
    const firstFile = steps[0].text;
    aiStore.addMessage({
      id: `sys-${Date.now()}`, role: "system", timestamp: Date.now(),
      content: `[SYSTEM — PLAN ACCEPTED]: ${steps.length} files queued.\n` +
        `START NOW: Write the first file: "${firstFile}"\n` +
        `Use: <write_file path="${firstFile}">...complete production-ready code...</write_file>\n` +
        `Rules:\n` +
        `- Write 100% complete code. No placeholders.\n` +
        `- Do NOT output <done> yet — you have ${steps.length} files to write first.\n` +
        `- After this file is saved, the system will tell you the next file to write.`,
    });
    setTimeout(() => runAgentTurn(null), 500);
    return;
  }

  // ── NO ACTION DETECTED — re-prompt to prevent idle hallucination ─────────────
  const pendingAfterNoAction = useAIStore.getState().agentSteps.filter(s => s.status === "pending");
  if (pendingAfterNoAction.length > 0 && !aiStore.truncatedFile) {
    // Model responded with text but no action tag — force it to act
    // We check !aiStore.truncatedFile to ensure we don't accidentally yell at it
    // if it was just trying to continue a file but didn't output a tag (which is expected).
    const nextFile = pendingAfterNoAction[0].text;
    aiStore.addAgentLog(`⚠️ No action detected. Re-prompting for: ${nextFile}`);
    aiStore.addMessage({
      id: `sys-${Date.now()}`, role: "system", timestamp: Date.now(),
      content: `[SYSTEM — ACTION REQUIRED]: Your last response contained no <write_file> action.\n` +
        `You still have ${pendingAfterNoAction.length} file(s) to write.\n` +
        `Write "${nextFile}" RIGHT NOW using:\n` +
        `<write_file path="${nextFile}">\n[complete file content]\n</write_file>\n` +
        `Do not explain. Do not plan again. Just write the file.`,
    });
    setTimeout(() => runAgentTurn(null), 500);
    return;
  }

  // ── PURE CONVERSATION (no plan, no action, no pending steps) ─────────────────
  aiStore.setAgentStatus("idle");
  aiStore.addAgentLog("Done.");
}

// ─── Public: Reset Memory (call when switching workspaces) ────────────────────

export function resetAgentMemory(): void {
  _projectMemory = null;
  _indexedWorkspace = "";
}

// ─── Public: Force Re-index ───────────────────────────────────────────────────

export async function reindexWorkspace(): Promise<void> {
  _indexedWorkspace = "";
  await ensureMemoryAndIndex();
}
