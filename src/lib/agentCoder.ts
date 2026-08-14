/* ============================================================
   agentCoder.ts — Coder Brain (Dual-Agent Architecture)
   
   The Coder receives ONE TaskPrompt at a time and makes a
   COMPLETELY FRESH LLM call to implement that single file.
   
   KEY PRINCIPLE: Each call gets its own session ID and ZERO
   conversation history from previous files. The context window
   contains ONLY:
     1. Coder system prompt (XML tag format + rules)
     2. Task prompt from the Planner (injected as user message)
     3. Relevant existing file contents (read from disk on demand)
   
   After the file is saved (or fails), the context is DESTROYED.
   The orchestrator then creates a NEW Coder call for the next task.
   ============================================================ */
import { invoke } from "@tauri-apps/api/core";
import { useAIStore, TaskPrompt } from "../store/aiStore";
import { useFileStore } from "../store/fileStore";
import { useEditorStore } from "../store/editorStore";
import { chatOllama } from "./ollama";
import {
  loadProjectMemory, saveProjectMemory, ProjectMemory,
  updateManifestFromFile, updateDependencyMap,
} from "./agentMemory";
import {
  indexSingleFile, getProjectIndex,
} from "./agentIndexer";
import { validateFileConnectivity, formatValidationResult } from "./agentValidator";

// ─── Constants (tuned for small models) ───────────────────────────────────────
const MAX_CODER_TURNS   = 6;      // max LLM calls per single file (incl. continuations)
const TURN_DELAY_MS     = 300;
const TINY_CONT_LEN     = 200;    // auto-close if continuation is shorter than this
const MAX_CONT          = 3;      // max continuation attempts for truncated output
const MAX_FILE_READ     = 4000;   // max chars to read from an existing file for context

// ─── Coder System Prompt ──────────────────────────────────────────────────────
// Ultra-minimal. The coder's ONLY job is to write ONE file.
const CODER_SYSTEM_PROMPT = `You are a precise coding agent. Your ONLY job is to write ONE complete file.

OUTPUT FORMAT — Use EXACTLY this XML tag:
<write_file path="FILENAME">
FULL COMPLETE FILE CONTENT HERE
</write_file>

RULES:
1. Output ONE <write_file> tag containing the ENTIRE file. Nothing else.
2. The file must be COMPLETE. No "// ...", no "/* rest of code */", no placeholders.
3. No markdown fences around the tag. No prose before or after.
4. Use the EXACT file path specified in the task.
5. Include ALL imports, ALL functions, ALL content described in the task.
6. If CSS classes or file paths are referenced in the task, use them EXACTLY.
7. When EXISTING PROJECT FILES are shown, you MUST reference the exact same:
   - CSS class names (do NOT invent new class names if they already exist)
   - Navigation links and href paths (keep consistent across pages)
   - Header/footer/nav structure (copy the same pattern from existing pages)
   - Color values, font settings, spacing from CSS variables
8. For HTML files: use the EXACT <link> stylesheet references from the task.
9. For CSS files: define classes that will be used by the HTML files described.
`;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getRoot(): string {
  return useFileStore.getState().workspaceRoot || "/tmp/workspace";
}

function resolvePath(root: string, rel: string): string {
  if (rel.startsWith("/") || /^[A-Za-z]:/.test(rel)) return rel;
  const sep = root.includes("\\") ? "\\" : "/";
  return `${root}${sep}${rel.replace(/^\.[\\/]/, "")}`;
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

async function refreshTree(root: string): Promise<void> {
  try {
    const entries = await invoke<{ name: string; path: string; is_dir: boolean; size?: number }[]>("list_dir", { path: root });
    useFileStore.getState().setTree(entries.map(e => ({ name: e.name, path: e.path, isDir: e.is_dir, size: e.size, children: undefined, expanded: false })));
  } catch { /* non-fatal */ }
}

// ─── Build Coder User Message ─────────────────────────────────────────────────
/**
 * Builds the complete user message for the Coder from a TaskPrompt.
 * This is the ONLY context the coder receives — no conversation history.
 * 
 * CRITICAL: Injects ALL previously written files so the coder can reference
 * exact CSS class names, HTML IDs, navigation paths, and shared structures.
 */
async function buildCoderPrompt(task: TaskPrompt, writtenFiles: Map<string, string>): Promise<string> {
  const root = getRoot();
  let prompt = `TASK: Write the complete file "${task.targetFile}"

PURPOSE: ${task.purpose}
`;

  // Content requirements
  if (task.contentRequirements) {
    prompt += `\nCONTENT REQUIREMENTS:\n${task.contentRequirements}\n`;
  }

  // Connections
  if (task.connections) {
    prompt += `\nCONNECTIONS (maintain these exactly):\n${task.connections}\n`;
  }

  // Design requirements
  if (task.designRequirements) {
    prompt += `\nDESIGN:\n${task.designRequirements}\n`;
  }

  // Technical constraints
  if (task.technicalConstraints) {
    prompt += `\nCONSTRAINTS:\n${task.technicalConstraints}\n`;
  }

  // Written-so-far summary (file names + purpose, NOT full code)
  if (task.writtenSoFar) {
    prompt += `\n${task.writtenSoFar}`;
  }

  // ── CRITICAL: Inject ALL previously written files ──────────────────────────
  // The Coder MUST see files that were already written in this session
  // (especially CSS, config, shared modules) so it can reference correct
  // class names, IDs, navigation links, and shared UI structures.
  //
  // Priority order: CSS files first (design system), then config, then pages.

  if (writtenFiles.size > 0) {
    prompt += `\n\n═══ EXISTING PROJECT FILES (written in this session) ═══\n`;
    prompt += `IMPORTANT: You MUST use the EXACT class names, IDs, CSS selectors,\n`;
    prompt += `navigation links, and file paths from these files. Do NOT invent new ones.\n\n`;

    // Sort files: CSS first, then config/utils, then pages/components
    const sortedPaths = [...writtenFiles.keys()].sort((a, b) => {
      const priority = (p: string) => {
        if (p.endsWith('.css')) return 0;
        if (p.match(/config|util|lib|shared/i)) return 1;
        if (p.match(/index|main|app/i)) return 2;
        return 3;
      };
      return priority(a) - priority(b);
    });

    let contextBudget = 12000;

    for (const relPath of sortedPaths) {
      if (contextBudget <= 0) break;

      const content = writtenFiles.get(relPath)!;
      const isCSSorConfig = relPath.endsWith('.css') || relPath.match(/config|package|tsconfig/i);

      // CSS files get full content (they define the design system)
      const maxLen = isCSSorConfig ? 6000 : MAX_FILE_READ;
      const excerpt = content.slice(0, maxLen);
      const truncated = content.length > maxLen;

      prompt += `──── [${relPath}] (${content.split('\n').length} lines) ────\n`;
      prompt += `\`\`\`\n${excerpt}${truncated ? '\n... (truncated)' : ''}\n\`\`\`\n\n`;
      contextBudget -= excerpt.length;
    }

    prompt += `═══ END EXISTING FILES ═══\n`;
  }

  // ── Also read files from DISK that were NOT written this session ─────────
  const filesToReadFromDisk = new Set<string>();

  const allText = task.connections + ' ' + task.contentRequirements + ' ' + task.designRequirements;
  const fileRefRx = /[\w./\\-]+\.\w{1,6}/g;
  const refs = allText.match(fileRefRx) || [];
  for (const ref of refs) {
    const cleaned = ref.replace(/^\.\//, '').replace(/^\/+/, '');
    if (cleaned.includes('.') && !writtenFiles.has(cleaned)) {
      filesToReadFromDisk.add(cleaned);
    }
  }

  if (filesToReadFromDisk.size > 0) {
    let diskBudget = 4000;
    for (const relPath of filesToReadFromDisk) {
      if (diskBudget <= 0) break;
      const absPath = resolvePath(root, relPath);
      try {
        const content = await invoke<string>("read_file", { path: absPath });
        const excerpt = content.slice(0, MAX_FILE_READ);
        prompt += `\n[PRE-EXISTING FILE: ${relPath}]\n\`\`\`\n${excerpt}${content.length > MAX_FILE_READ ? '\n... (truncated)' : ''}\n\`\`\`\n`;
        diskBudget -= excerpt.length;
      } catch { /* file doesn't exist yet */ }
    }
  }

  prompt += `\nNow output <write_file path="${task.targetFile}">FULL COMPLETE CODE</write_file>.
CRITICAL RULES:
- Use the EXACT same CSS class names from the CSS files shown above
- Use the EXACT same navigation links and file paths as other pages
- Maintain consistent header/nav/footer structure across all pages
- No markdown fences. No prose. Just the XML tag.`;

  return prompt;
}

// ─── Extract path from write_file tag ─────────────────────────────────────────
function extractWritePath(tagAttrs: string): string | null {
  const patterns = [
    /\bpath\s*=\s*["']([^"'>\n]+)["']/i,
    /\bpath\s*=\s*([^\s>"']+)/i,
    /\bfile\s*=\s*["']([^"'>\n]+)["']/i,
  ];
  for (const p of patterns) {
    const m = tagAttrs.match(p);
    if (m?.[1] && m[1] !== ">" && !m[1].startsWith("<")) return m[1].trim();
  }
  return null;
}

// ─── Coder Result Type ────────────────────────────────────────────────────────
export interface CoderResult {
  success: boolean;
  filePath: string;
  content: string;
  error?: string;
}

// ─── Main Coder Entry Point ───────────────────────────────────────────────────
/**
 * Runs the Coder for a single TaskPrompt.
 * Creates a completely fresh LLM session — no history from previous files.
 * 
 * Returns a CoderResult indicating success/failure.
 */
export async function runCoderTask(
  task: TaskPrompt,
  writtenFiles: Map<string, string>,
  projectMemory: ProjectMemory | null,
): Promise<CoderResult> {
  const store = useAIStore.getState();
  const model = store.activeModel;
  const root = getRoot();

  store.setAgentPhase("coding");
  store.setAgentStatus("generating");
  store.addAgentLog(`\n🔨 Coder: Starting "${task.targetFile}" (fresh context)`);

  // Build the coder prompt
  const userMessage = await buildCoderPrompt(task, writtenFiles);
  store.addAgentLog(`📝 Coder prompt: ${userMessage.length} chars`);

  // FRESH session — no history from previous files
  const sessionId = `coder-${task.id}-${Date.now()}`;
  const payload: { role: "user" | "assistant" | "system"; content: string }[] = [
    { role: "system", content: CODER_SYSTEM_PROMPT },
    { role: "user", content: userMessage },
  ];

  // Stream response with truncation handling
  let turnCount = 0;
  let contAttempts = 0;
  let truncatedContent: string | null = null;

  const attemptCoderCall = (
    msgs: { role: "user" | "assistant" | "system"; content: string }[],
    sid: string
  ): Promise<CoderResult> => {
    return new Promise<CoderResult>((resolve) => {
      turnCount++;
      if (turnCount > MAX_CODER_TURNS) {
        store.addAgentLog(`⚠️ Coder: Max turns reached for "${task.targetFile}"`);
        resolve({ success: false, filePath: task.targetFile, content: "", error: "Max coder turns exceeded" });
        return;
      }

      if (store.agentAborted) {
        resolve({ success: false, filePath: task.targetFile, content: "", error: "Aborted by user" });
        return;
      }

      const assistantMsg = {
        id: `coder-${task.id}-${Date.now()}`,
        role: "assistant" as const,
        content: "",
        timestamp: Date.now(),
      };
      store.addMessage(assistantMsg);
      store.setStreaming(true);
      store.setAgentStatus("generating");
      store.addAgentLog(`  Coder thinking... (turn ${turnCount}/${MAX_CODER_TURNS})`);

      let fullContent = "";

      chatOllama(sid, model, msgs, (chunk, done) => {
        fullContent += chunk;
        useAIStore.getState().updateLastMessageContent(fullContent);

        if (done) {
          useAIStore.getState().setStreaming(false);
          useAIStore.getState().updateLastMessageContent(fullContent);

          // Handle continuation of truncated content
          if (truncatedContent !== null) {
            const clean = fullContent
              .replace(/^[\s\S]*?(Sure|Continuing|Here is|Of course)[^\n]*\n/i, "")
              .replace(/^\s*```[a-z0-9-]*\n?/im, "")
              .replace(/\n?```\s*$/im, "");

            let assembled = truncatedContent;

            // Detect restart
            const fileStart = assembled.replace(/<write_file\b[^>]*>/i, "").trim().slice(0, 60);
            const isRestart = fileStart.length > 20 && clean.includes(fileStart);
            if (isRestart) {
              store.addAgentLog("  ⚠️ Model restarted file — replacing.");
              const tagM = assembled.match(/^<write_file\b[^>]*>/i);
              assembled = (tagM ? tagM[0] + "\n" : "") + clean;
            } else {
              // Stitch overlap
              let stitched = false;
              for (let len = Math.min(assembled.length, clean.length, 400); len > 0; len--) {
                if (assembled.endsWith(clean.slice(0, len))) {
                  assembled += clean.slice(len);
                  stitched = true;
                  break;
                }
              }
              if (!stitched) assembled += clean;
            }

            // Auto-close short continuations
            if (!assembled.includes("</write_file>") && clean.trim().length < TINY_CONT_LEN) {
              assembled += "\n</write_file>";
            }

            if (assembled.includes("</write_file>")) {
              truncatedContent = null;
              store.addAgentLog("  ✓ Multi-turn file assembled.");
              const fullMatch = assembled.match(/<write_file\b([^>]*)>([\s\S]*?)<\/write_file>/i);
              if (fullMatch) {
                handleWriteFile(fullMatch[1], fullMatch[2], resolve);
                return;
              }
            } else {
              contAttempts++;
              if (contAttempts >= MAX_CONT) {
                assembled += "\n</write_file>";
                truncatedContent = null;
                const fm = assembled.match(/<write_file\b([^>]*)>([\s\S]*?)<\/write_file>/i);
                if (fm) {
                  store.addAgentLog("  ⚠️ Max continuations — force-saving.");
                  handleWriteFile(fm[1], fm[2], resolve);
                  return;
                }
              } else {
                truncatedContent = assembled;
                const snippet = assembled.slice(-120);
                const contMsgs: typeof msgs = [
                  ...msgs,
                  { role: "assistant", content: assembled },
                  { role: "user", content: `[CONTINUE]: File cut off. Continue EXACTLY from here:\n\`\`\`\n...${snippet}\n\`\`\`\nOutput ONLY the remaining raw code. Do NOT output <write_file>. Do NOT restart the file.` },
                ];
                setTimeout(() => {
                  attemptCoderCall(contMsgs, `${sid}-cont-${contAttempts}`).then(resolve);
                }, TURN_DELAY_MS);
                return;
              }
            }
          }

          // Check for complete write_file
          const writeM = fullContent.match(/<write_file\b([^>]*)>([\s\S]*?)<\/write_file>/i);
          if (writeM) {
            handleWriteFile(writeM[1], writeM[2], resolve);
            return;
          }

          // Check for truncated write_file (started but not closed)
          const openTag = fullContent.match(/<write_file\b([^>]*)>([\s\S]*)$/i);
          if (openTag && !fullContent.includes("</write_file>")) {
            const pathRaw = extractWritePath(`<write_file ${openTag[1]}>`);
            if (pathRaw) {
              truncatedContent = openTag[0];
              store.addAgentLog(`  ⚠️ Token limit hit — requesting continuation for "${pathRaw}"`);
              const contMsgs: typeof msgs = [
                ...msgs,
                { role: "assistant", content: fullContent },
                { role: "user", content: `[CONTINUE]: Response cut off while writing "${pathRaw}". Continue EXACTLY from where you stopped. Do NOT output <write_file> tag. Output ONLY the remaining raw code.` },
              ];
              setTimeout(() => {
                attemptCoderCall(contMsgs, `${sid}-cont-${contAttempts}`).then(resolve);
              }, TURN_DELAY_MS);
              return;
            }
          }

          // No write_file found — re-prompt once
          if (turnCount < MAX_CODER_TURNS) {
            store.addAgentLog("  ⚠️ No <write_file> in response. Re-prompting.");
            const retryMsgs: typeof msgs = [
              ...msgs,
              { role: "assistant", content: fullContent },
              { role: "user", content: `You did not output a <write_file> tag. Write the COMPLETE file "${task.targetFile}" now using:\n<write_file path="${task.targetFile}">\nFULL CODE HERE\n</write_file>\n\nNo markdown fences. No prose. Just the XML tag.` },
            ];
            setTimeout(() => {
              attemptCoderCall(retryMsgs, `${sid}-retry-${turnCount}`).then(resolve);
            }, TURN_DELAY_MS);
          } else {
            resolve({ success: false, filePath: task.targetFile, content: "", error: "Coder failed to produce write_file tag" });
          }
        }
      }).catch((err) => {
        useAIStore.getState().setStreaming(false);
        store.addAgentLog(`  ❌ Coder error: ${err.message || err}`);
        resolve({ success: false, filePath: task.targetFile, content: "", error: err.message || String(err) });
      });
    });
  };

  // Helper: process a matched write_file and save
  const handleWriteFile = async (
    attrs: string,
    rawBody: string,
    resolve: (result: CoderResult) => void
  ) => {
    let body = rawBody
      .replace(/^\s*```[a-z0-9-]*\n?/im, "")
      .replace(/\n?```\s*$/im, "")
      .replace(/^\n/, "");

    const pathRaw = extractWritePath(`<write_file ${attrs}>`);
    const relPath = (pathRaw || task.targetFile).replace(/^\/+/, "");
    const absPath = resolvePath(root, relPath);

    store.addAgentLog(`  📝 Saving: ${relPath} (${body.length} chars)`);

    // Validate connectivity
    const mem = projectMemory || await loadProjectMemory(root);
    const idx = getProjectIndex();
    const val = await validateFileConnectivity(absPath, body, mem, idx, root);
    store.addAgentLog(val.passed ? `  ✅ Validated (${val.score}/100)` : `  ⚠️ Validation: ${formatValidationResult(val)}`);

    try {
      await invoke("write_file", { path: absPath, content: body });
      store.addAgentLog(`  ✓ Saved: ${relPath}`);

      // Background work
      indexSingleFile(absPath, root).catch(() => {});
      refreshTree(root).catch(() => {});
      openInEditor(absPath, relPath, body);

      // Update memory
      if (projectMemory) {
        const updated = updateManifestFromFile(projectMemory, absPath, body, root);
        updated.dependencyMap = updateDependencyMap(updated.dependencyMap, absPath, body, root);
        saveProjectMemory(root, updated).catch(() => {});
      }

      resolve({ success: true, filePath: relPath, content: body });
    } catch (err: any) {
      store.addAgentLog(`  ✗ Write failed: ${err.message || err}`);
      resolve({ success: false, filePath: relPath, content: body, error: err.message || String(err) });
    }
  };

  // Start the first coder call
  return attemptCoderCall(payload, sessionId);
}
