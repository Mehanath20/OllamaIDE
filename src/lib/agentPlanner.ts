/* ============================================================
   agentPlanner.ts — Planner Brain (Dual-Agent Architecture)
   
   The Planner makes a SINGLE one-shot LLM call to analyze the
   user's project request and produce a structured list of
   TaskPrompts — one per file to create.
   
   Each TaskPrompt contains everything the Coder needs to
   implement that file in complete isolation (fresh context).
   
   The Planner NEVER writes code. It only plans.
   ============================================================ */
import { useAIStore, TaskPrompt } from "../store/aiStore";
import { chatOllama } from "./ollama";
import {
  loadProjectMemory, formatMemoryAsContext, ProjectMemory,
} from "./agentMemory";
import {
  buildProjectIndex, getProjectIndex, retrieveRelevantContext,
} from "./agentIndexer";
import { getWorkspaceContext } from "./fileUtils";
import { useFileStore } from "../store/fileStore";

// ─── Constants ────────────────────────────────────────────────────────────────
// Planner is ONE-SHOT: exactly 1 LLM call, no multi-turn conversation

// ─── Planner System Prompt ────────────────────────────────────────────────────
// Designed to produce structured, parseable output from small models.
// Uses XML because small models handle XML tags more reliably than JSON.
const PLANNER_SYSTEM_PROMPT = `You are the PLANNING BRAIN of an autonomous coding agent.

Your job is NOT to write code. Your job is to analyze the user's project request and produce a detailed file-by-file implementation plan.

OUTPUT FORMAT — You MUST output EXACTLY this XML structure:

<task_list>
<task file="path/to/file1.ext">
<purpose>What this file does</purpose>
<content>Detailed list of what must be in this file — sections, components, features, functions</content>
<connections>How this file connects to other files: imports, links, routes, CSS references</connections>
<design>Layout, colors, typography, responsive behavior, styling details</design>
<constraints>Technical rules: allowed technologies, forbidden patterns</constraints>
</task>
<task file="path/to/file2.ext">
...
</task>
</task_list>

RULES:
1. Output ONLY the <task_list> XML block. No prose, no explanations, no markdown.
2. List files in DEPENDENCY ORDER — files that others depend on come first (CSS before HTML, shared modules before pages).
3. Each <content> must be EXTREMELY detailed — the coder will have NO other context. Describe every section, every element, every feature.
4. Each <connections> must list EVERY link, import, script tag, stylesheet reference, and route.
5. Each <design> must specify colors (hex values), fonts, spacing, layout approach, responsive breakpoints.
6. For HTML projects: index.html is the entry point. All pages share consistent navigation. CSS via <link>, JS via <script> at bottom.
7. For React projects: src/main.tsx renders <App />. Components use PascalCase. State via hooks.
8. NEVER invent file paths you haven't planned. Every path in <connections> must reference a file in your <task_list>.
9. The FIRST task should be the foundational file (CSS, config, or shared utilities).
10. The LAST task should be the entry point file that ties everything together.
`;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getRoot(): string {
  return useFileStore.getState().workspaceRoot || "/tmp/workspace";
}

// ─── Task Parser ──────────────────────────────────────────────────────────────
/**
 * Parses the planner's XML output into TaskPrompt objects.
 * Handles various quirks from small models (missing tags, malformed XML, etc.)
 */
export function parsePlannerOutput(raw: string): TaskPrompt[] {
  const tasks: TaskPrompt[] = [];

  // Extract <task_list> block, or use entire output if tag is missing
  let block = raw;
  const listMatch = raw.match(/<task_list>([\s\S]*?)<\/task_list>/i);
  if (listMatch) block = listMatch[1];

  // Match individual <task> blocks
  const taskRx = /<task\s+file\s*=\s*["']([^"']+)["']\s*>([\s\S]*?)<\/task>/gi;
  let match;
  let id = 1;

  while ((match = taskRx.exec(block)) !== null) {
    const filePath = match[1].trim().replace(/^\.\//, "").replace(/^\/+/, "");
    const body = match[2];

    // Extract fields with fallbacks
    const getField = (tag: string): string => {
      const rx = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i");
      const m = body.match(rx);
      return m ? m[1].trim() : "";
    };

    // Skip invalid entries (no file path or empty body)
    if (!filePath || !filePath.includes(".")) continue;

    tasks.push({
      id: `task-${id++}`,
      targetFile: filePath,
      purpose: getField("purpose") || `Implement ${filePath}`,
      inputFiles: [], // populated by orchestrator based on connections
      connections: getField("connections") || "",
      contentRequirements: getField("content") || "",
      designRequirements: getField("design") || "",
      technicalConstraints: getField("constraints") || "",
      writtenSoFar: "", // populated by orchestrator as tasks complete
    });
  }

  // Fallback: if XML parsing failed, try to extract file paths like the old plan parser
  if (tasks.length === 0) {
    const planMatch = raw.match(/<plan>([\s\S]*?)<\/plan>/i);
    if (planMatch) {
      const lines = planMatch[1].split("\n");
      for (const line of lines) {
        const fp = line.trim().replace(/^[-*•\d.)\s]+/, "").trim();
        if (fp && fp.includes(".") && !fp.includes(" ") && /\.[a-zA-Z0-9]{1,6}$/.test(fp)) {
          tasks.push({
            id: `task-${id++}`,
            targetFile: fp.replace(/^\.\//, "").replace(/^\/+/, ""),
            purpose: `Implement ${fp}`,
            inputFiles: [],
            connections: "",
            contentRequirements: "",
            designRequirements: "",
            technicalConstraints: "",
            writtenSoFar: "",
          });
        }
      }
    }
  }

  return tasks;
}

// ─── Build Planner Context ────────────────────────────────────────────────────
/**
 * Builds a compact context string for the planner.
 * Includes project memory, file tree, and relevant existing files.
 */
async function buildPlannerContext(userQuery: string): Promise<string> {
  const root = getRoot();
  const ws = getWorkspaceContext();
  let memory: ProjectMemory;

  try {
    memory = await loadProjectMemory(root);
  } catch {
    memory = {
      manifest: { version: 1, projectName: "Unknown", techStack: [], pages: [], components: [], routes: [], apis: [], services: [], models: [], utilities: [], dbTables: [], lastUpdated: Date.now() },
      dependencyMap: {},
      decisions: [],
      activeContext: "",
      projectRules: "",
      architectureNotes: "",
    };
  }

  // Ensure index is built
  const idx = getProjectIndex();
  if (!idx) {
    try {
      await buildProjectIndex(root, (done, total) => {
        if (done % 50 === 0) useAIStore.getState().addAgentLog(`  Indexing: ${done}/${total}`);
      });
    } catch { /* non-fatal */ }
  }

  let ctx = "";
  const budget = 3000; // planner gets a larger context budget than coder
  let remaining = budget;
  const add = (s: string) => { const chunk = s.slice(0, remaining); ctx += chunk; remaining -= chunk.length; };

  add(`\n[Workspace: ${root}]`);

  // Inject project memory
  const memCtx = formatMemoryAsContext(memory);
  if (memCtx.length > 10) add(memCtx.slice(0, 1200));

  // Inject file tree
  if (ws.fileTree && remaining > 300) {
    add(`\n[Project File Tree:\n${ws.fileTree.slice(0, 800)}]`);
  }

  // Inject relevant existing files via RAG
  if (remaining > 500) {
    try {
      const rag = await retrieveRelevantContext(userQuery, ws.activeFile.path, 4, Math.min(remaining - 100, 2000));
      add(rag);
    } catch { /* non-fatal */ }
  }

  return ctx;
}

// ─── Main Planner Entry Point ─────────────────────────────────────────────────
/**
 * Runs the Planner: a single one-shot LLM call that produces a TaskPrompt[]
 * for the orchestrator to feed to the Coder one task at a time.
 *
 * Returns the parsed task list, or an empty array on failure.
 */
export async function runPlanner(userQuery: string): Promise<TaskPrompt[]> {
  const store = useAIStore.getState();
  const plannerModel = store.plannerModel || store.activeModel;

  store.setAgentPhase("planning");
  store.setAgentStatus("planning");
  store.addAgentLog("🧠 Planner: Analyzing project request...");
  store.addAgentLog(`📦 Planner model: ${plannerModel}`);

  // Build context
  const ctx = await buildPlannerContext(userQuery);
  store.addAgentLog("✓ Planner context built.");

  // Build payload — single user message, no history
  const sessionId = `planner-${Date.now()}`;
  const payload: { role: "user" | "assistant" | "system"; content: string }[] = [
    { role: "system", content: PLANNER_SYSTEM_PROMPT },
    { role: "user", content: userQuery + ctx },
  ];

  // Stream response
  let fullContent = "";
  const assistantMsg = {
    id: `planner-msg-${Date.now()}`,
    role: "assistant" as const,
    content: "",
    timestamp: Date.now(),
  };
  store.addMessage(assistantMsg);
  store.setStreaming(true);

  return new Promise<TaskPrompt[]>((resolve) => {
    chatOllama(sessionId, plannerModel, payload, (chunk, done) => {
      fullContent += chunk;

      // Debounced UI update
      useAIStore.getState().updateLastMessageContent(fullContent);

      if (done) {
        useAIStore.getState().setStreaming(false);
        useAIStore.getState().updateLastMessageContent(fullContent);

        // Parse the planner output
        const tasks = parsePlannerOutput(fullContent);

        if (tasks.length > 0) {
          useAIStore.getState().addAgentLog(`✅ Planner produced ${tasks.length} task(s):`);
          tasks.forEach((t, i) => {
            useAIStore.getState().addAgentLog(`  ${i + 1}. ${t.targetFile} — ${t.purpose.slice(0, 60)}`);
          });
        } else {
          useAIStore.getState().addAgentLog("⚠️ Planner failed to produce valid tasks. Will fall back to monolithic mode.");
        }

        resolve(tasks);
      }
    }).catch((err) => {
      useAIStore.getState().setStreaming(false);
      useAIStore.getState().addAgentLog(`❌ Planner error: ${err.message || err}`);
      resolve([]);
    });
  });
}

/**
 * Builds a "written so far" summary string for the Coder's context.
 * Lists completed files with their purpose — NOT full code content.
 * This lets the coder know what exists without bloating context.
 */
export function buildWrittenSoFarSummary(
  completedTasks: TaskPrompt[],
  writtenFiles: Map<string, string>
): string {
  if (completedTasks.length === 0) return "";

  let summary = "\n[FILES ALREADY WRITTEN — do NOT recreate these]:\n";
  for (const task of completedTasks) {
    const content = writtenFiles.get(task.targetFile);
    const lineCount = content ? content.split("\n").length : 0;
    const firstLine = content ? content.split("\n")[0].trim().slice(0, 80) : "";
    summary += `  ✓ ${task.targetFile} (${lineCount} lines) — ${task.purpose.slice(0, 60)}\n`;
    if (firstLine) summary += `    First line: ${firstLine}\n`;
  }
  return summary;
}
