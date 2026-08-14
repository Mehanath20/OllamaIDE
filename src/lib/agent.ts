/* ============================================================
   agent.ts — AntiNetwork Agent Engine (v6 — Dual-Agent)
   Orchestrator: routes to Planner+Coder (isolated contexts)
   or Monolithic mode (legacy fallback for edits).
   Optimised for Qwen 2.5 Coder 3B (small-model tuning)
   ============================================================ */
import { invoke } from "@tauri-apps/api/core";
import { remove } from "@tauri-apps/plugin-fs";
import { useAIStore, ChatMessage, AgentStep, TaskPrompt } from "../store/aiStore";
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
import { validateFileConnectivity, formatValidationResult } from "./agentValidator";
import { runPlanner, buildWrittenSoFarSummary } from "./agentPlanner";
import { runCoderTask } from "./agentCoder";

// ─── Constants (tuned for Qwen 2.5 Coder 3B) ─────────────────────────────────
// 3B models have a small effective context (~4K tokens usable for generation).
// Keep everything SHORT to avoid the model losing track of the XML format.
const MAX_HISTORY    = 4;           // fewer history turns → more room for code
const MAX_TURNS      = 30;          // 3B loops fast; cap earlier
const TURN_DELAY_MS  = 300;         // slight extra breathing room between turns
const CTX_BUDGET     = 1_500;       // tiny context injection — preserve token budget
const FIRST_MSG_CAP  = 3_000;       // small initial message cap for 3B
const MSG_CAP        = 800;         // very short follow-up messages
const MAX_CONT       = 3;           // fewer continuation attempts (3B loses track easily)
const MAX_NO_ACTION  = 3;           // give 3B a bit more retries before skipping
const TINY_CONT_LEN  = 200;         // auto-close shorter continuations for 3B

// ─── Module State ─────────────────────────────────────────────────────────────
let _turnCount       = 0;
let _contAttempts    = 0;
let _noActionCount   = 0;
let _sessionId       = `s-${Date.now()}`;
let _projectMemory: ProjectMemory | null = null;
let _indexedRoot     = "";
let _isEditMode      = false;
let _projectType: ProjectType = "generic";
const _written       = new Map<string, string>(); // path → content written this task

// ─── Project Type Detection ───────────────────────────────────────────────────
type ProjectType = "html" | "react" | "vue" | "node" | "python" | "generic";

function detectProjectType(q: string): ProjectType {
  const s = q.toLowerCase();
  if (/\breact\b|jsx|tsx|create.react/.test(s)) return "react";
  if (/\bvue\b|\.vue|nuxt/.test(s)) return "vue";
  if (/\bexpress\b|nodejs|fastify|nestjs/.test(s)) return "node";
  if (/\bpython\b|flask|fastapi|django/.test(s)) return "python";
  if (/html|css|javascript|vanilla|website|landing|e.?commerce|management\s*system|library|portfolio/.test(s)) return "html";
  return "generic";
}

function detectEditIntent(q: string): boolean {
  const s = q.toLowerCase();
  const edit   = /\b(change|update|fix|modify|edit|add to|remove|refactor|improve|adjust|replace|convert)\b/.test(s);
  const create = /\b(build|create|generate|new project|from scratch|write a|create a)\b/.test(s);
  return edit && !create;
}

// ─── System Prompts (tuned for Qwen 2.5 Coder 3B) ───────────────────────────
// DESIGN PRINCIPLE: 3B models work best with SHORT, IMPERATIVE, NUMBERED rules.
// Long paragraphs and repeated context cause the model to forget the XML format.
// Keep every prompt as short as possible while preserving critical constraints.
const BASE = `You are AntiNetwork, a coding agent in a local IDE.
You output ONLY XML action tags — no prose, no markdown, no JSON.

AVAILABLE TAGS (use exactly one per reply):
<read_file path="..."/>             — read a file
<list_dir path="..."/>              — list a directory
<search_files query="..." path="..."/> — search for text
<run_command>COMMAND</run_command>   — run a shell command (needs user approval)
<write_file path="...">CODE</write_file> — write a complete file
<delete_file path="..."/>           — delete a file
<done>SUMMARY</done>                — task finished

RULES:
1. Output ONE tag per reply. Nothing else.
2. <write_file> must contain the FULL file. No "// ...", no placeholders.
3. No markdown fences around tags.
4. Never output <done> if any planned file is unwritten.
5. Never invent paths. Use only paths you inspected or planned.
`;

// CODER: simplified single-step for 3B — skip mandatory plan phase,
// go straight to writing; the engine will manage file sequencing.
const CODER_SYS = BASE + `
TASK FLOW:
- For a new project: first output a <plan> block listing files, then write them one by one.
- For each file: output <write_file path="FILENAME">FULL CODE</write_file>.
- Wait for [FILE SAVED] before writing the next file.
- When ALL files are written: output <done>brief summary</done>.

<plan> FORMAT (file names only, one per line):
<plan>
src/index.html
src/style.css
src/app.js
</plan>
`;

// EDIT: even simpler for 3B — just read, rewrite, done.
const EDIT_SYS = BASE + `
EDIT MODE:
- Read the file first with <read_file path="..."/>.
- Then rewrite it completely: <write_file path="...">FULL UPDATED CODE</write_file>.
- Then output <done>what changed</done>.
- Do NOT create new files unless asked.
`;

const ARCH_SYS    = BASE + `ARCHITECT MODE: Write only .md documentation files. No source code.`;
const DEBUG_SYS   = BASE + `DEBUGGER MODE: Read the failing file, explain the root cause, fix it with <write_file>.`;
const REVIEW_SYS  = BASE + `REVIEWER MODE: Read the code, then write "code_review.md" covering security, performance, dead code.`;
const DOC_SYS     = BASE + `DOCUMENTER MODE: Rewrite each file with full JSDoc comments. Output 100% of original code — do not remove anything.`;

const HTML_GUIDE = `
HTML/JS PROJECT RULES:
- index.html is the entry point. Every page links to it via nav.
- CSS: <link rel="stylesheet" href="..."> in the <head> of EVERY html file.
- JS:  <script src="..."></script> at BOTTOM of every html file that needs it.
- No ES modules. Use global window variables.
- All data in localStorage. Use relative paths for assets.
`;
const REACT_GUIDE = `
REACT PROJECT RULES:
- Entry: src/main.tsx renders <App />. App.tsx sets up React Router.
- Components: PascalCase default exports. Import CSS at component top.
- State: useState/useEffect. Never use document.getElementById.
- package.json must list react, react-dom, react-router-dom.
`;
const NODE_GUIDE = `
NODE/EXPRESS RULES:
- Entry: server.js starts HTTP server. Routes in /routes/ imported in server.js.
- Use async/await. Error-handling middleware goes last.
- package.json must list all deps.
`;
const VUE_GUIDE = `
VUE RULES:
- Entry: src/main.js mounts App. App.vue has <router-view />.
- Each .vue: <template>, <script setup>, <style scoped>.
`;

function getSystemPrompt(persona: string, editMode: boolean): string {
  if (editMode) return EDIT_SYS;
  switch (persona) {
    case "Architect":  return ARCH_SYS;
    case "Debugger":   return DEBUG_SYS;
    case "Reviewer":   return REVIEW_SYS;
    case "Documenter": return DOC_SYS;
    default:           return CODER_SYS;
  }
}

function getProjectGuide(t: ProjectType): string {
  if (t === "html")  return HTML_GUIDE;
  if (t === "react") return REACT_GUIDE;
  if (t === "node")  return NODE_GUIDE;
  if (t === "vue")   return VUE_GUIDE;
  return "";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getRoot(): string {
  return useFileStore.getState().workspaceRoot || "/tmp/workspace";
}

function resolvePath(root: string, rel: string): string {
  if (rel.startsWith("/") || /^[A-Za-z]:/.test(rel)) return rel;
  const sep = root.includes("\\") ? "\\" : "/";
  return `${root}${sep}${rel.replace(/^\.[\\/]/, "")}`;
}

function extractPath(tag: string, body: string): string | null {
  const patterns = [
    /\bpath\s*=\s*["']([^"'>\n]+)["']/i,
    /\bpath\s*=\s*([^\s>"']+)/i,
    /\bfile\s*=\s*["']([^"'>\n]+)["']/i,
    /\bname\s*=\s*["']([^"'>\n]+)["']/i,
  ];
  for (const p of patterns) {
    const m = tag.match(p);
    if (m?.[1] && m[1] !== ">" && !m[1].startsWith("<")) return m[1].trim();
  }
  // Fallback: first line of content that looks like a file path
  for (const line of body.split("\n").slice(0, 3)) {
    const t = line.trim();
    if (t && t.includes(".") && !t.includes(" ") && !t.startsWith("<") &&
        /\.(html|css|js|ts|json|md|txt|jsx|tsx|py|rs|go|java|php|sql|yaml|yml|toml|sh|svg)$/i.test(t)) {
      return t;
    }
  }
  return null;
}

function parsePlan(text: string): AgentStep[] {
  let block = "";
  const closed = text.match(/<plan>([\s\S]*?)<\/plan>/i);
  if (closed) block = closed[1];
  else {
    const open = text.match(/<plan>([\s\S]*)$/i);
    if (open) block = open[1];
  }
  if (!block) return [];

  let id = 1;
  const steps: AgentStep[] = [];
  for (const raw of block.split("\n")) {
    const line = raw.trim();
    if (!line) continue;

    let fp: string | null = null;
    // Extract file path from common list formats or tree structures
    // Match: - [ ] file, 1. file, - file, ├── file, file
    const cleaned = line.replace(/^([-*•]\s*\[[xX\s]\]|^\d+\.\s+|^[-*•]\s+|^[│├└─\s]+)/, "").trim();
    
    // Valid file paths must contain a dot (for extension) and no spaces
    if (cleaned && cleaned.includes(".") && !cleaned.includes(" ")) {
      fp = cleaned;
    }

    if (!fp) continue;
    fp = fp.split(" ")[0].replace(/^\.\//, "").replace(/^\/+/, "");
    if (fp.endsWith("/") || fp.endsWith("\\")) continue;
    if (!fp.match(/\.[a-zA-Z0-9]{1,6}$/)) continue;
    steps.push({ id: `step-${id++}`, text: fp, status: "pending" });
  }
  return steps;
}

function trimHistory(msgs: ChatMessage[]): ChatMessage[] {
  if (msgs.length <= MAX_HISTORY) return msgs;
  const first = msgs[0]; // always keep initial task
  const tail  = msgs.slice(-MAX_HISTORY);
  const tailIds = new Set(tail.map(m => m.id));
  return tailIds.has(first.id) ? tail : [first, ...tail];
}

async function runShell(cmd: string): Promise<string> {
  try { return await invoke<string>("execute_shell", { cmd, cwd: getRoot() }); }
  catch (e: any) { return `Error: ${e.message || e}`; }
}

async function refreshTree(root: string): Promise<void> {
  try {
    const entries = await invoke<{ name: string; path: string; is_dir: boolean; size?: number }[]>("list_dir", { path: root });
    useFileStore.getState().setTree(entries.map(e => ({ name: e.name, path: e.path, isDir: e.is_dir, size: e.size, children: undefined, expanded: false })));
  } catch { /* non-fatal */ }
}

const LANG_MAP: Record<string, string> = {
  ts:"typescript",tsx:"typescriptreact",js:"javascript",jsx:"javascriptreact",
  py:"python",rs:"rust",go:"go",java:"java",cpp:"cpp",c:"c",cs:"csharp",
  rb:"ruby",php:"php",html:"html",css:"css",json:"json",yaml:"yaml",
  yml:"yaml",md:"markdown",sh:"shell",toml:"toml",sql:"sql",vue:"vue",svelte:"svelte",
};

function openInEditor(absPath: string, relPath: string, content: string): void {
  const ext  = relPath.split(".").pop()?.toLowerCase() || "";
  const lang = LANG_MAP[ext] || "plaintext";
  const name = relPath.split(/[/\\]/).pop() || relPath;
  const store = useEditorStore.getState();
  const ex = store.openFiles.find(f => f.path === absPath);
  if (ex) { store.updateContent(absPath, content); store.setActiveFile(absPath); store.markSaved(absPath); }
  else store.openFile({ path: absPath, name, content, language: lang, isDirty: false });
}

function getWrittenSummary(): string {
  if (_written.size === 0) return "";
  let out = "\n[WRITTEN SO FAR]:\n";
  let chars = 0;
  for (const [p, c] of _written) {
    const firstLine = c.split("\n")[0].trim().slice(0, 80);
    const entry = `  ${p} (${c.split("\n").length} lines) — ${firstLine}\n`;
    if (chars + entry.length > 600) break;
    out += entry;
    chars += entry.length;
  }
  return out;
}

// ─── Memory & Index ───────────────────────────────────────────────────────────
async function ensureMemory(): Promise<ProjectMemory> {
  const root = getRoot();
  if (!_projectMemory) _projectMemory = await loadProjectMemory(root);
  if (_indexedRoot !== root) {
    const store = useAIStore.getState();
    store.addAgentLog("🔍 Indexing project files...");
    await buildProjectIndex(root, (done, total) => {
      if (done % 50 === 0) store.addAgentLog(`  Indexed ${done}/${total} files`);
    });
    _indexedRoot = root;
    store.addAgentLog(`✓ Index built: ${getProjectIndex()?.totalFiles || 0} files`);
  }
  return _projectMemory!;
}

// ─── Context Builder ──────────────────────────────────────────────────────────
async function buildContext(userQuery: string): Promise<string> {
  const ws  = getWorkspaceContext();
  const root = getRoot();
  const mem = await ensureMemory();
  const isGenerating = _written.size > 0;

  let ctx = "";
  let budget = CTX_BUDGET;
  const add = (s: string) => { if (budget > 0) { ctx += s.slice(0, budget); budget -= s.length; } };

  add(`\n[Workspace: ${root}]`);

  if (ws.activeFile.path && !isGenerating) {
    add(`\n[Active file: ${ws.activeFile.path}]`);
    if (ws.activeFile.content) add(`\n\`\`\`\n${ws.activeFile.content.slice(0, 350)}\n...\n\`\`\``);
  }

  if (!isGenerating && budget > 400) add(formatMemoryAsContext(mem).slice(0, 800));

  if (budget > 700) {
    const rag = await retrieveRelevantContext(userQuery, ws.activeFile.path, isGenerating ? 2 : 4, Math.min(budget - 200, isGenerating ? 1000 : 2000));
    add(rag);
  }

  if (!isGenerating && budget > 300 && ws.fileTree) add(`\n[Tree:\n${ws.fileTree.slice(0, 500)}]`);

  return ctx;
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────
export async function runAgentTurn(userQuery: string | null, attachedImages: string[] = []): Promise<void> {
  const store = useAIStore.getState();
  const model = store.activeModel;

  // ── New task initialisation ──────────────────────────────────────────────────
  if (userQuery) {
    _turnCount    = 0;
    _contAttempts = 0;
    _noActionCount = 0;
    store.clearAgentState();
    store.setAgentAborted(false);
    _written.clear();
    const detectedType = detectProjectType(userQuery);
    if (detectedType !== "generic" || _projectType === "generic") {
      _projectType = detectedType;
    }
    _sessionId   = `s-${Date.now()}`;
    _isEditMode  = detectEditIntent(userQuery) && _indexedRoot !== "";

    // ── Route to Planner+Coder if enabled and this is a new project ──────────
    const arch = store.agentArchitecture;
    if (arch === "planner-coder" && !_isEditMode) {
      store.addAgentLog("🧠 Dual-Agent mode: Planner → Coder pipeline");
      // Run the planner-coder flow instead of the monolithic loop
      runPlannerCoderFlow(userQuery, attachedImages);
      return;
    }

    if (_isEditMode) store.addAgentLog("✏️ Edit mode: targeting existing files.");
    if (!_isEditMode && store.agentArchitecture === "planner-coder") {
      store.addAgentLog("ℹ️ Edit detected — using monolithic mode.");
    }
  }

  if (useAIStore.getState().agentAborted) return;

  _turnCount++;
  if (_turnCount > MAX_TURNS) {
    useAIStore.getState().setAgentAborted(true);
    useAIStore.getState().setAgentStatus("idle");
    useAIStore.getState().setTruncatedFile(null);
    if (_turnCount === MAX_TURNS + 1) {
      useAIStore.getState().addAgentLog(`⚠ Max turns (${MAX_TURNS}) reached. Stopping.`);
      useAIStore.getState().addMessage({ id: `sys-${Date.now()}`, role: "system", timestamp: Date.now(),
        content: `[system]: Agent reached the ${MAX_TURNS}-turn limit. Send a new message to continue.` });
    }
    return;
  }

  store.setStreaming(true);
  let history: ChatMessage[] = [...useAIStore.getState().messages];

  // ── Inject workspace context for the initial turn ─────────────────────────
  if (userQuery) {
    useAIStore.getState().addAgentLog("🧠 Loading project memory & context...");
    useAIStore.getState().addAgentLog(`📦 Project type: ${_projectType}`);
    const ctx   = await buildContext(userQuery);
    const guide = getProjectGuide(_projectType);
    const msg: ChatMessage = {
      id: `user-${Date.now()}`, role: "user", timestamp: Date.now(),
      content: userQuery + ctx + guide,
      images: attachedImages.length > 0 ? attachedImages : undefined,
    };
    useAIStore.getState().addMessage(msg);
    history.push(msg);
  }

  // ── Build LLM payload ─────────────────────────────────────────────────────
  const payload: { role: "user" | "assistant" | "system"; content: string; images?: string[] }[] = [
    { role: "system", content: getSystemPrompt(useAIStore.getState().activePersona, _isEditMode) },
  ];

  let firstUser = true;
  let lastContent = "";
  for (const m of trimHistory(history)) {
    if (m.role === "user" || m.role === "assistant") {
      const cap     = firstUser ? FIRST_MSG_CAP : MSG_CAP;
      const content = m.content.length > cap ? m.content.slice(0, cap) + "\n...[truncated]" : m.content;
      if (content === lastContent) continue;
      lastContent = content;
      payload.push({ role: m.role, content, images: m.images });
      if (m.role === "user") firstUser = false;
    } else if (m.role === "system" && m.content.startsWith("[")) {
      const content = m.content.length > MSG_CAP ? m.content.slice(0, MSG_CAP) : m.content;
      if (content === lastContent) continue;
      lastContent = content;
      payload.push({ role: "user", content });
    }
  }

  // Payload must not end with assistant — append a push if needed
  if (payload[payload.length - 1]?.role === "assistant") {
    const pending = useAIStore.getState().agentSteps.filter(s => s.status === "pending");
    payload.push({
      role: "user",
      content: pending.length > 0
        ? `Write the complete working code for "${pending[0].text}" now using <write_file path="${pending[0].text}"> tag. Output the XML directly, NO markdown fences.`
        : `Output <done>summary</done> now.`,
    });
  }

  // ── Stream response ───────────────────────────────────────────────────────
  const assistantMsg: ChatMessage = { id: `a-${Date.now()}`, role: "assistant", content: "", timestamp: Date.now() };
  useAIStore.getState().addMessage(assistantMsg);
  useAIStore.getState().setAgentStatus("thinking");
  useAIStore.getState().addAgentLog(`Thinking... (turn ${_turnCount}/${MAX_TURNS})`);

  let fullContent = "";
  let debounce: ReturnType<typeof setTimeout> | null = null;
  const sid = _sessionId;

  try {
    await chatOllama(sid, model, payload, (chunk, done) => {
      if (sid !== _sessionId) return; // discard stale ghost sessions
      fullContent += chunk;
      if (!debounce) debounce = setTimeout(() => { useAIStore.getState().updateLastMessageContent(fullContent); debounce = null; }, 100);
      if (done) {
        if (debounce) { clearTimeout(debounce); debounce = null; }
        useAIStore.getState().updateLastMessageContent(fullContent);
        useAIStore.getState().setStreaming(false);
        setTimeout(() => handleCompletedTurn(fullContent), 0);
      }
    });
  } catch (err: any) {
    useAIStore.getState().setStreaming(false);
    useAIStore.getState().setAgentStatus("idle");
    const msg = err.message || String(err);
    useAIStore.getState().addAgentLog(`❌ Error: ${msg}`);
    useAIStore.getState().updateLastMessageContent(
      `⚠️ **Ollama error:** ${msg}\n\n**Fixes:**\n- Ensure Ollama is running\n- Try a larger model (7B+) for complex tasks\n- Restart Ollama from the title bar`
    );
  }
}

// ─── Turn Handler ─────────────────────────────────────────────────────────────
async function handleCompletedTurn(content: string): Promise<void> {
  const store = useAIStore.getState();
  if (store.agentAborted) { store.addAgentLog("⛔ Stopped by user."); return; }

  // ── Parse plan (only accepted when no steps exist yet) ────────────────────
  const newSteps = parsePlan(content);
  const hasExisting = useAIStore.getState().agentSteps.some(s => s.status === "pending");
  if (newSteps.length > 0) {
    if (!hasExisting) {
      useAIStore.getState().setAgentSteps(newSteps);
      useAIStore.getState().addAgentLog(`📋 Plan accepted: ${newSteps.length} files.`);
    } else {
      useAIStore.getState().addAgentLog("⚠️ Duplicate <plan> ignored (already executing).");
    }
  } else if (content.match(/<plan>([\s\S]*?)<\/plan>/i)) {
    useAIStore.getState().addAgentLog("⚠️ Found <plan> tag but could not extract any valid file paths.");
  }

  // ── Match action tags ─────────────────────────────────────────────────────
  const writeM  = content.match(/<write_file\b([^>]*)>([\s\S]*?)<\/write_file>/i);
  const readM   = content.match(/<read_file\b([^>]*)\/>/i);
  const runM    = content.match(/<run_command>([\s\S]*?)<\/run_command>/i);
  const listM   = content.match(/<list_dir\b([^>]*)\/>/i);
  const searchM = content.match(/<search_files\b([^>]*)\/>/i);
  const doneM   = content.match(/<done>([\s\S]*?)<\/done>/i);
  const deleteM = content.match(/<delete_file\b([^>]*)\/>/i);

  const attr = (attrs: string, name: string) => {
    const m = attrs.match(new RegExp(`\\b${name}\\s*=\\s*["']?([^"'\\s>]+)["']?`, "i"));
    return m ? m[1].trim() : null;
  };

  const anyAction = !!(writeM || readM || runM || listM || searchM || doneM || deleteM);
  if (anyAction) _noActionCount = 0;


  // ── Continuation mode: stitch partial file ────────────────────────────────
  const truncated = useAIStore.getState().truncatedFile;
  let effectiveWriteM = writeM;

  if (truncated) {
    // Strip conversational filler & markdown fences that small models add
    const clean = content
      .replace(/^[\s\S]*?(Sure|Continuing|Here is|Of course)[^\n]*\n/i, "")
      .replace(/^\s*```[a-z0-9-]*\n?/im, "")
      .replace(/\n?```\s*$/im, "");

    let assembled = truncated.contentSoFar;

    // Detect restart: model re-emitted the beginning of the file
    const fileStart = assembled.replace(/<write_file\b[^>]*>/i, "").trim().slice(0, 60);
    const isRestart = fileStart.length > 20 && clean.includes(fileStart);
    if (isRestart) {
      useAIStore.getState().addAgentLog("⚠️ Model restarted — replacing with new content.");
      const tagM = assembled.match(/^<write_file\b[^>]*>/i);
      assembled  = (tagM ? tagM[0] + "\n" : "") + clean;
    } else {
      // Stitch: find longest overlap to avoid duplicate characters
      let stitched = false;
      for (let len = Math.min(assembled.length, clean.length, 400); len > 0; len--) {
        if (assembled.endsWith(clean.slice(0, len))) { assembled += clean.slice(len); stitched = true; break; }
      }
      if (!stitched) assembled += clean;
    }

    // Auto-close if continuation is tiny (model likely just finished)
    if (!assembled.includes("</write_file>") && clean.trim().length < TINY_CONT_LEN) {
      useAIStore.getState().addAgentLog("⚠️ Short continuation — auto-closing file.");
      assembled += "\n</write_file>";
    }

    if (assembled.includes("</write_file>")) {
      useAIStore.getState().addAgentLog("✓ Multi-turn file assembled.");
      useAIStore.getState().setTruncatedFile(null);
      const fullMatch = assembled.match(/<write_file\b([^>]*)>([\s\S]*?)<\/write_file>/i);
      if (fullMatch) effectiveWriteM = fullMatch;
      // fall through to write handler
    } else {
      _contAttempts++;
      if (_contAttempts >= MAX_CONT) {
        useAIStore.getState().addAgentLog(`⚠️ Max continuations hit. Force-saving "${truncated.path}".`);
        assembled += "\n</write_file>";
        useAIStore.getState().setTruncatedFile(null);
        _contAttempts = 0;
        const fm = assembled.match(/<write_file\b([^>]*)>([\s\S]*?)<\/write_file>/i);
        if (fm) effectiveWriteM = fm;
      } else {
        useAIStore.getState().addAgentLog(`⚠️ Still truncated (attempt ${_contAttempts}/${MAX_CONT}).`);
        useAIStore.getState().setTruncatedFile({ path: truncated.path, contentSoFar: assembled });
        const snippet = assembled.slice(-120);
        sysMsg(`[CONTINUE]: File cut off. Continue EXACTLY from here:\n\`\`\`\n...${snippet}\n\`\`\`\nCRITICAL: Start with the very next character. Do NOT output a <plan>. Do NOT output <write_file>. Output ONLY the exact remaining raw code to finish the file.`);
        setTimeout(() => runAgentTurn(null), TURN_DELAY_MS);
        return;
      }
    }
  }

  // ── Detect new truncation (model started a file but ran out of tokens) ────
  if (!effectiveWriteM && !truncated) {
    const openTag = content.match(/<write_file\b([^>]*)>([\s\S]*)$/i);
    if (openTag && !content.includes("</write_file>")) {
      const pathRaw = extractPath(`<write_file ${openTag[1]}>`, "");
      if (!pathRaw) {
        sysMsg(`[ERROR]: Token limit hit, but no valid path found in <write_file> tag. Rewrite the file from the start using <write_file path="filename.ext"> tag.`);
      } else {
        const tp = pathRaw.replace(/^\/+/, "");
        useAIStore.getState().addAgentLog(`⚠️ Token limit hit — saving partial: ${tp}`);
        useAIStore.getState().setTruncatedFile({ path: tp, contentSoFar: openTag[0] });
        sysMsg(`[CONTINUE]: Response cut off while writing "${tp}". Continue EXACTLY from where you stopped. CRITICAL: Do NOT output a <plan>. Do NOT output a <write_file> tag. Output ONLY the remaining raw code. Do NOT repeat any code already written.`);
      }
      setTimeout(() => runAgentTurn(null), TURN_DELAY_MS);
      return;
    }
  }

  // ── <write_file> ──────────────────────────────────────────────────────────
  if (effectiveWriteM) {
    // Auto-complete guard: don't write if all steps are already done
    const allSteps = useAIStore.getState().agentSteps;
    if (allSteps.length > 0 && !allSteps.some(s => s.status === "pending")) {
      useAIStore.getState().addAgentLog("✅ All files already written. Auto-completing.");
      useAIStore.getState().setAgentStatus("idle");
      return;
    }

    let body = effectiveWriteM[2]
      .replace(/^\s*```[a-z0-9-]*\n?/im, "")
      .replace(/\n?```\s*$/im, "")
      .replace(/^\n/, "");

    const pathRaw = extractPath(`<write_file ${effectiveWriteM[1]}>`, body);
    if (!pathRaw) {
      sysMsg(`[ERROR]: Missing path in <write_file> tag. Use: <write_file path="your/file.ext">`);
      setTimeout(() => runAgentTurn(null), 500);
      return;
    }

    const relPath = pathRaw.replace(/^\/+/, "");
    const absPath = resolvePath(getRoot(), relPath);

    useAIStore.getState().setAgentStatus("generating");
    useAIStore.getState().addAgentLog(`📝 Writing: ${relPath} (${body.length} chars)`);

    // Connectivity validation
    const mem = await ensureMemory();
    const idx = getProjectIndex();
    const val = await validateFileConnectivity(absPath, body, mem, idx, getRoot());
    useAIStore.getState().addAgentLog(val.passed ? `✅ Validated (${val.score}/100)` : `⚠️ Validation: ${formatValidationResult(val)}`);

    try {
      await invoke("write_file", { path: absPath, content: body });
      useAIStore.getState().addAgentLog(`✓ Saved: ${relPath}`);
      _written.set(relPath, body);

      // Async background work — don't block the turn pipeline
      indexSingleFile(absPath, getRoot()).catch(() => {});
      refreshTree(getRoot()).catch(() => {});
      openInEditor(absPath, relPath, body);

      if (_projectMemory) {
        _projectMemory = updateManifestFromFile(_projectMemory, absPath, body, getRoot());
        _projectMemory.dependencyMap = updateDependencyMap(_projectMemory.dependencyMap, absPath, body, getRoot());
        saveProjectMemory(getRoot(), _projectMemory).catch(() => {});
      }

      // Tick off plan step
      const steps = useAIStore.getState().agentSteps;
      const matched = steps.find(s => (s.text === relPath || relPath.includes(s.text) || s.text.includes(relPath)) && s.status === "pending");
      if (matched) useAIStore.getState().updateAgentStepStatus(matched.id, "completed");

      // Dependents hint
      const deps = getDependents(relPath);
      if (deps.length > 0) useAIStore.getState().addAgentLog(`🔗 Dependents: ${deps.slice(0, 4).join(", ")}`);

      // Reset counters for next file
      _contAttempts  = 0;
      _noActionCount = 0;

      const remaining = useAIStore.getState().agentSteps.filter(s => s.status === "pending");
      if (remaining.length > 0) {
        const next = remaining[0].text;
        sysMsg(`[FILE SAVED]: ✓ "${relPath}" written. ${remaining.length} file(s) remaining.${getWrittenSummary()}\nWrite the complete working code for "${next}" now using the <write_file path="${next}"> tag.`);
      } else {
        sysMsg(`[ALL FILES WRITTEN]: ✓ All ${useAIStore.getState().agentSteps.length} files saved.\nOutput <done>Brief summary of what was built.</done> now.`);
      }
    } catch (err: any) {
      useAIStore.getState().addAgentLog(`✗ Write failed: ${err.message || err}`);
      sysMsg(`[write_file error]: Failed to write "${relPath}": ${err.message || err}. Please try again.`);
    }

    setTimeout(() => runAgentTurn(null), TURN_DELAY_MS);
    return;
  }

  // ── <read_file> ───────────────────────────────────────────────────────────
  if (readM) {
    const tp = attr(readM[1], "path|file|name") || "";
    useAIStore.getState().setAgentStatus("reading");
    useAIStore.getState().addAgentLog(`📖 Reading: ${tp}`);
    let fc = "";
    try { fc = await invoke<string>("read_file", { path: resolvePath(getRoot(), tp) }); }
    catch (e: any) { fc = `Error: ${e.message}`; }
    sysMsg(`[read_file "${tp}"]:\n\`\`\`\n${fc}\n\`\`\``);
    setTimeout(() => runAgentTurn(null), TURN_DELAY_MS);
    return;
  }

  // ── <delete_file> ───────────────────────────────────────────────────────────
  if (deleteM) {
    const tp = attr(deleteM[1], "path|file|name") || "";
    useAIStore.getState().setAgentStatus("executing");
    useAIStore.getState().addAgentLog(`🗑️ Deleting: ${tp}`);
    const absPath = resolvePath(getRoot(), tp);
    try {
      await remove(absPath);
      sysMsg(`[delete_file "${tp}"]:\n✓ File deleted successfully.`);
    } catch (e: any) {
      sysMsg(`[delete_file error]: ${e.message}`);
    }
    setTimeout(() => runAgentTurn(null), TURN_DELAY_MS);
    return;
  }

  // ── <run_command> ─────────────────────────────────────────────────────────
  if (runM) {
    const cmd = runM[1].trim();
    useAIStore.getState().setAgentStatus("executing");
    useAIStore.getState().addAgentLog(`⏳ Awaiting approval: ${cmd}`);
    useAIStore.getState().setPendingCommand(cmd);
    const approved = await new Promise<boolean>(resolve => useAIStore.getState().setCommandPermissionResolve(resolve));
    useAIStore.getState().setPendingCommand(null);
    useAIStore.getState().setCommandPermissionResolve(null);
    if (approved) {
      const out = await runShell(cmd);
      useAIStore.getState().addAgentLog(`✓ Command done`);
      sysMsg(`[run_command \`${cmd}\`]:\n\`\`\`\n${out}\n\`\`\``);
    } else {
      sysMsg(`[run_command]: User rejected \`${cmd}\`.`);
    }
    setTimeout(() => runAgentTurn(null), TURN_DELAY_MS);
    return;
  }

  // ── <list_dir> ────────────────────────────────────────────────────────────
  if (listM) {
    const tp = attr(listM[1], "path|dir") || ".";
    useAIStore.getState().setAgentStatus("reading");
    try {
      const entries: any[] = await invoke("list_dir", { path: resolvePath(getRoot(), tp) });
      const out = entries.length === 0 ? "(empty)" : entries.map(e => `${e.is_dir ? "📁" : "📄"} ${e.name}`).join("\n");
      useAIStore.getState().addAgentLog(`✓ Listed ${entries.length} entries`);
      sysMsg(`[list_dir "${tp}"]:\n\`\`\`\n${out}\n\`\`\``);
    } catch (e: any) { sysMsg(`[list_dir error]: ${e.message}`); }
    setTimeout(() => runAgentTurn(null), TURN_DELAY_MS);
    return;
  }

  // ── <search_files> ────────────────────────────────────────────────────────
  if (searchM) {
    const query = attr(searchM[1], "query") || "";
    const tp    = attr(searchM[1], "path|dir") || ".";
    useAIStore.getState().setAgentStatus("reading");
    try {
      const results: any[] = await invoke("search_files", { path: resolvePath(getRoot(), tp), query });
      const out = results.length === 0 ? "No results." : results.map(r => `${r.file}:${r.line} — ${r.text}`).join("\n");
      useAIStore.getState().addAgentLog(`✓ ${results.length} result(s) for "${query}"`);
      sysMsg(`[search_files "${query}"]:\n\`\`\`\n${out}\n\`\`\``);
    } catch (e: any) { sysMsg(`[search_files error]: ${e.message}`); }
    setTimeout(() => runAgentTurn(null), TURN_DELAY_MS);
    return;
  }

  // ── <done> ────────────────────────────────────────────────────────────────
  if (doneM) {
    const stillPending = useAIStore.getState().agentSteps.filter(s => s.status === "pending");
    if (stillPending.length > 0) {
      useAIStore.getState().addAgentLog(`⚠️ Premature <done> — ${stillPending.length} file(s) unwritten. Re-prompting.`);
      sysMsg(`You sent <done> too early. ${stillPending.length} files remain.\nWrite the complete code for "${stillPending[0].text}" now using the <write_file path="${stillPending[0].text}"> tag.`);
      setTimeout(() => runAgentTurn(null), TURN_DELAY_MS);
      return;
    }
    useAIStore.getState().setAgentStatus("idle");
    useAIStore.getState().addAgentLog(`✅ Task complete.`);
    useAIStore.getState().setAgentSteps(
      useAIStore.getState().agentSteps.map(s => ({ ...s, status: "completed" as const }))
    );
    if (_projectMemory) {
      _projectMemory.activeContext = `Last task completed at ${new Date().toISOString()}`;
      saveProjectMemory(getRoot(), _projectMemory).catch(() => {});
    }
    return;
  }

  // ── Plan received — scaffold folders, then trigger first file ─────────────
  if (newSteps.length > 0) {
    await scaffoldAndStart(newSteps);
    return;
  }

  // ── No action detected — re-prompt or skip ────────────────────────────────
  const pending = useAIStore.getState().agentSteps.filter(s => s.status === "pending");
  if (pending.length > 0 && !useAIStore.getState().truncatedFile) {
    _noActionCount++;
    const nextFile = pending[0].text;

    if (_noActionCount > MAX_NO_ACTION) {
      // Skip stuck file
      _noActionCount = 0;
      _contAttempts  = 0;
      const stuck = useAIStore.getState().agentSteps.find(s => s.text === nextFile && s.status === "pending");
      if (stuck) useAIStore.getState().updateAgentStepStatus(stuck.id, "failed");
      useAIStore.getState().addAgentLog(`⏭️ Skipping stuck file "${nextFile}".`);

      const nextPending = useAIStore.getState().agentSteps.filter(s => s.status === "pending");
      if (nextPending.length > 0) {
        sysMsg(`[SKIP]: "${nextFile}" skipped. Write the complete working code for "${nextPending[0].text}" using the <write_file path="${nextPending[0].text}"> tag.`);
      } else {
        sysMsg(`[ALL FILES DONE]: Output <done>summary</done> now.`);
      }
      setTimeout(() => runAgentTurn(null), TURN_DELAY_MS);
      return;
    }

    useAIStore.getState().addAgentLog(`⚠️ No action (${_noActionCount}/${MAX_NO_ACTION}). Re-prompting: ${nextFile}`);
    sysMsg(`[ACTION REQUIRED]: Write the complete, working code for "${nextFile}" now.\nUse the <write_file path="${nextFile}"> tag. Write the FULL file content — no placeholders, no markdown fences.`);
    setTimeout(() => runAgentTurn(null), TURN_DELAY_MS);
    return;
  }

  // ── Pure conversation — nothing to orchestrate ────────────────────────────
  useAIStore.getState().setAgentStatus("idle");
  useAIStore.getState().addAgentLog("Done.");
}

// ─── Utility: add a system message ───────────────────────────────────────────
function sysMsg(content: string): void {
  useAIStore.getState().addMessage({ id: `sys-${Date.now()}`, role: "system", timestamp: Date.now(), content });
}


// --- Folder Scaffolding ---
async function scaffoldAndStart(steps: AgentStep[]): Promise<void> {
  const root = getRoot();
  const dirs = new Set<string>();
  for (const s of steps) {
    const parts = s.text.replace(/\\/g, '/').split('/');
    for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/'));
  }
  if (dirs.size === 0) { useAIStore.getState().addAgentLog('No subdirs needed.'); triggerFirstFile(steps); return; }
  const sorted = [...dirs].sort();
  useAIStore.getState().addAgentLog('Creating ' + sorted.length + ' folder(s)...');
  const results = await Promise.allSettled(sorted.map(d => invoke('create_dir', { path: resolvePath(root, d) })));
  let log = 'Folder scaffold:\n';
  sorted.forEach((d, i) => { log += '  ' + (results[i].status === 'fulfilled' ? 'ok' : 'fail') + ' ' + d + '\n'; });
  useAIStore.getState().addAgentLog(log.trimEnd());
  refreshTree(root).catch(() => {});
  const fileList = steps.map((s, i) => (i+1) + '. ' + s.text).join('\n');
  const firstFile = steps[0].text;
  sysMsg('[SCAFFOLD COMPLETE]: All ' + sorted.length + ' folder(s) created. ' + steps.length + ' files to write.\n\nFILE LIST:\n' + fileList + '\n\nWrite the complete working code for file 1 of ' + steps.length + ': "' + firstFile + '" using the <write_file path="' + firstFile + '"> tag. Output the XML directly, without markdown fences.\nDo NOT output <done> yet.');
  setTimeout(() => runAgentTurn(null), TURN_DELAY_MS);
}
function triggerFirstFile(steps: AgentStep[]): void {
  const fileList = steps.map((s, i) => (i+1) + '. ' + s.text).join('\n');
  const firstFile = steps[0].text;
  sysMsg('[PLAN ACCEPTED]: ' + steps.length + ' files to write.\n\nFILE LIST:\n' + fileList + '\n\nWrite the complete working code for file 1 of ' + steps.length + ': "' + firstFile + '" using the <write_file path="' + firstFile + '"> tag. Output the XML directly, without markdown fences.');
  setTimeout(() => runAgentTurn(null), TURN_DELAY_MS);
}

// ─── Planner + Coder Orchestration Flow ───────────────────────────────────────
/**
 * Runs the full Planner → Coder pipeline:
 * 1. Calls the Planner (one-shot LLM call) to get TaskPrompt[]
 * 2. Scaffolds any needed directories
 * 3. Iterates through tasks, calling the Coder for each with a FRESH context
 * 4. Tracks progress and updates UI
 * 5. Falls back to monolithic mode if planner fails
 */
async function runPlannerCoderFlow(userQuery: string, attachedImages: string[]): Promise<void> {
  const store = useAIStore.getState();
  const root = getRoot();

  // Ensure memory & index are ready
  store.addAgentLog("🔍 Preparing project index...");
  await ensureMemory();

  // ── Phase 1: Run the Planner ──────────────────────────────────────────────
  const tasks = await runPlanner(userQuery);

  if (tasks.length === 0) {
    // Planner failed — fall back to monolithic mode
    store.addAgentLog("⚠️ Planner produced no tasks. Falling back to classic mode.");
    store.setAgentPhase("idle");
    // Re-run as monolithic by temporarily switching architecture
    const origArch = store.agentArchitecture;
    store.setAgentArchitecture("monolithic");
    await runAgentTurn(userQuery, attachedImages);
    store.setAgentArchitecture(origArch);
    return;
  }

  // Store tasks in the queue
  store.setPlannerTaskQueue(tasks);
  store.setCurrentTaskIndex(0);

  // Convert tasks to AgentSteps for the UI checklist
  const steps: AgentStep[] = tasks.map((t, i) => ({
    id: `step-${i + 1}`,
    text: `${t.targetFile} — ${t.purpose.slice(0, 50)}`,
    status: "pending" as const,
  }));
  store.setAgentSteps(steps);

  // ── Phase 1.5: Scaffold directories ───────────────────────────────────────
  const dirs = new Set<string>();
  for (const t of tasks) {
    const parts = t.targetFile.replace(/\\/g, '/').split('/');
    for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/'));
  }
  if (dirs.size > 0) {
    const sorted = [...dirs].sort();
    store.addAgentLog(`📁 Creating ${sorted.length} folder(s)...`);
    await Promise.allSettled(sorted.map(d => invoke('create_dir', { path: resolvePath(root, d) })));
    refreshTree(root).catch(() => {});
  }

  // ── Phase 2: Run the Coder for each task ──────────────────────────────────
  store.setAgentPhase("coding");
  const completedTasks: TaskPrompt[] = [];

  for (let i = 0; i < tasks.length; i++) {
    if (useAIStore.getState().agentAborted) {
      store.addAgentLog("⛔ Stopped by user.");
      break;
    }

    const task = tasks[i];
    store.setCurrentTaskIndex(i);

    // Mark step as running
    const stepId = `step-${i + 1}`;
    useAIStore.getState().updateAgentStepStatus(stepId, "running");

    // Build the "written so far" summary for this task
    task.writtenSoFar = buildWrittenSoFarSummary(completedTasks, _written);

    store.addAgentLog(`\n━━━ Task ${i + 1}/${tasks.length}: ${task.targetFile} ━━━`);

    // Run the Coder with a FRESH context — no history from previous files
    const result = await runCoderTask(task, _written, _projectMemory);

    if (result.success) {
      _written.set(result.filePath, result.content);
      completedTasks.push(task);
      useAIStore.getState().updateAgentStepStatus(stepId, "completed");
      store.addAgentLog(`✅ Completed: ${result.filePath}`);

      // Update project memory
      if (_projectMemory) {
        _projectMemory = updateManifestFromFile(_projectMemory, resolvePath(root, result.filePath), result.content, root);
        _projectMemory.dependencyMap = updateDependencyMap(_projectMemory.dependencyMap, resolvePath(root, result.filePath), result.content, root);
        saveProjectMemory(root, _projectMemory).catch(() => {});
      }
    } else {
      useAIStore.getState().updateAgentStepStatus(stepId, "failed");
      store.addAgentLog(`❌ Failed: ${result.filePath} — ${result.error}`);
    }
  }

  // ── Phase 3: Done ─────────────────────────────────────────────────────────
  const succeeded = completedTasks.length;
  const failed = tasks.length - succeeded;
  store.setAgentPhase("idle");
  store.setAgentStatus("idle");
  store.addAgentLog(`\n🏁 Pipeline complete: ${succeeded} succeeded, ${failed} failed out of ${tasks.length} tasks.`);

  // Add a summary message
  const summaryMsg: ChatMessage = {
    id: `done-${Date.now()}`,
    role: "assistant",
    content: `✅ **Project complete!**\n\n${succeeded}/${tasks.length} files written successfully:\n${completedTasks.map(t => `- ✓ \`${t.targetFile}\``).join('\n')}${failed > 0 ? `\n\n${failed} file(s) failed — check logs for details.` : ''}`,
    timestamp: Date.now(),
  };
  useAIStore.getState().addMessage(summaryMsg);

  if (_projectMemory) {
    _projectMemory.activeContext = `Last task completed at ${new Date().toISOString()} — ${succeeded} files written`;
    saveProjectMemory(root, _projectMemory).catch(() => {});
  }
}

// --- Public Exports ---
export function resetAgentMemory(): void { _projectMemory = null; _indexedRoot = ''; }
export async function reindexWorkspace(): Promise<void> { _indexedRoot = ''; await ensureMemory(); }
