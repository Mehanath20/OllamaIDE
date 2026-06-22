/* ============================================================
   agentIndexer.ts — Project Indexer & RAG-Based Context Retrieval
   Solves Problem 2, 4 from requirements:
   - Repository indexing for large projects
   - Smart/relevant context loading (avoids sending entire codebase)
   - File dependency retrieval
   - Semantic-like relevance scoring for context selection
   ============================================================ */
import { invoke } from "@tauri-apps/api/core";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface IndexedFile {
  path: string;
  relativePath: string;
  name: string;
  ext: string;
  size: number;
  imports: string[];          // files this file imports
  exports: string[];          // named exports
  symbols: string[];          // functions, classes, types declared
  keywords: string[];         // top words (TF-IDF like scoring)
  isEntryPoint: boolean;
  lastIndexed: number;
}

export interface ProjectIndex {
  workspaceRoot: string;
  totalFiles: number;
  indexedAt: number;
  files: IndexedFile[];
}

// ─── File Index Store (in-memory, persisted to disk separately) ───────────────

let _projectIndex: ProjectIndex | null = null;

export function getProjectIndex(): ProjectIndex | null {
  return _projectIndex;
}

// ─── Skip Patterns ───────────────────────────────────────────────────────────

const SKIP_DIRS = new Set([
  "node_modules", ".git", ".svn", "dist", "build", "out", ".next",
  "__pycache__", ".venv", "venv", ".cache", "coverage", ".nyc_output",
  ".antinetwork", "target", ".cargo",
]);

const SKIP_EXTS = new Set([
  "png", "jpg", "jpeg", "gif", "svg", "ico", "webp", "bmp",
  "ttf", "woff", "woff2", "eot",
  "mp3", "mp4", "avi", "mov", "wav",
  "zip", "tar", "gz", "rar", "7z",
  "lock", "sum",
]);

const MAX_FILE_SIZE = 200 * 1024; // 200KB max per file for indexing

// ─── Symbol Extraction ────────────────────────────────────────────────────────

function extractSymbols(content: string, ext: string): { imports: string[]; exports: string[]; symbols: string[] } {
  const imports: string[] = [];
  const exports: string[] = [];
  const symbols: string[] = [];

  if (["ts", "tsx", "js", "jsx"].includes(ext)) {
    // Extract imports
    const importRx = /import\s+.*?\s+from\s+['"`]([^'"`]+)['"`]/g;
    let m;
    while ((m = importRx.exec(content)) !== null) {
      imports.push(m[1]);
    }

    // Extract exports
    const exportRx = /export\s+(?:default\s+)?(?:function|class|const|interface|type|enum)\s+(\w+)/g;
    while ((m = exportRx.exec(content)) !== null) {
      exports.push(m[1]);
    }

    // Extract top-level function/class/const declarations
    const declRx = /^(?:async\s+)?(?:function|class)\s+(\w+)|^(?:const|let|var)\s+(\w+)\s*=/mg;
    while ((m = declRx.exec(content)) !== null) {
      const name = m[1] || m[2];
      if (name) symbols.push(name);
    }
  } else if (["py"].includes(ext)) {
    const defRx = /^(?:def|class)\s+(\w+)/mg;
    let m;
    while ((m = defRx.exec(content)) !== null) {
      symbols.push(m[1]);
    }
    const importRx = /^(?:from\s+(\S+)\s+import|import\s+(\S+))/mg;
    while ((m = importRx.exec(content)) !== null) {
      imports.push(m[1] || m[2]);
    }
  }

  return { imports, exports, symbols };
}

function extractKeywords(content: string): string[] {
  // Remove comments, strings, then tokenize
  const cleaned = content
    .replace(/\/\/[^\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/#[^\n]*/g, " ")
    .replace(/['"`][^'"`]*['"`]/g, " ")
    .toLowerCase();

  const tokens = cleaned.match(/[a-z][a-z0-9_]{2,}/g) || [];
  const freq: Record<string, number> = {};
  const stopWords = new Set(["the", "and", "for", "var", "let", "const", "function", "return", "import", "from", "export", "default", "this", "that", "with", "type", "interface"]);

  for (const t of tokens) {
    if (!stopWords.has(t)) {
      freq[t] = (freq[t] || 0) + 1;
    }
  }

  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([k]) => k);
}

// ─── Build Index ──────────────────────────────────────────────────────────────

async function indexFile(absolutePath: string, workspaceRoot: string): Promise<IndexedFile | null> {
  const relPath = absolutePath.replace(workspaceRoot, "").replace(/^[/\\]/, "");
  const parts = relPath.split(/[/\\]/);
  const name = parts[parts.length - 1];
  const ext = name.split(".").pop()?.toLowerCase() || "";

  if (SKIP_EXTS.has(ext)) return null;
  if (parts.some(p => SKIP_DIRS.has(p))) return null;

  try {
    const content = await invoke<string>("read_file", { path: absolutePath });
    if (content.length > MAX_FILE_SIZE) return null;

    const { imports, exports, symbols } = extractSymbols(content, ext);
    const keywords = extractKeywords(content);

    const ENTRY_NAMES = /^(index|main|app|server|index\.html)$/i;
    const isEntryPoint = ENTRY_NAMES.test(name.replace(/\.[^.]+$/, "")) || parts.length <= 2;

    return {
      path: absolutePath,
      relativePath: relPath,
      name,
      ext,
      size: content.length,
      imports,
      exports,
      symbols,
      keywords,
      isEntryPoint,
      lastIndexed: Date.now(),
    };
  } catch {
    return null;
  }
}

async function collectFiles(dirPath: string, workspaceRoot: string, collected: string[]): Promise<void> {
  try {
    const entries = await invoke<{ name: string; path: string; is_dir: boolean }[]>("list_dir", { path: dirPath });
    for (const entry of entries) {
      const parts = entry.path.replace(workspaceRoot, "").replace(/^[/\\]/, "").split(/[/\\]/);
      if (parts.some(p => SKIP_DIRS.has(p))) continue;
      if (entry.is_dir) {
        await collectFiles(entry.path, workspaceRoot, collected);
      } else {
        collected.push(entry.path);
      }
    }
  } catch {}
}

/**
 * Build a full index of the workspace.
 * This is called once when a folder is opened, and incrementally on writes.
 * For large projects, limits to first 2000 files.
 */
export async function buildProjectIndex(
  workspaceRoot: string,
  onProgress?: (done: number, total: number) => void
): Promise<ProjectIndex> {
  const collected: string[] = [];
  await collectFiles(workspaceRoot, workspaceRoot, collected);

  const MAX_FILES = 2000;
  const BATCH_SIZE = 10; // Index 10 files concurrently for speed
  const limited = collected.slice(0, MAX_FILES);

  const files: IndexedFile[] = [];
  for (let i = 0; i < limited.length; i += BATCH_SIZE) {
    const batch = limited.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map(f => indexFile(f, workspaceRoot)));
    for (const indexed of results) {
      if (indexed) files.push(indexed);
    }
    if (onProgress) onProgress(Math.min(i + BATCH_SIZE, limited.length), limited.length);
  }

  const index: ProjectIndex = {
    workspaceRoot,
    totalFiles: files.length,
    indexedAt: Date.now(),
    files,
  };

  _projectIndex = index;
  return index;
}

/**
 * Update the index for a single file after write.
 */
export async function indexSingleFile(absolutePath: string, workspaceRoot: string): Promise<void> {
  if (!_projectIndex) return;

  const indexed = await indexFile(absolutePath, workspaceRoot);
  if (!indexed) return;

  const existing = _projectIndex.files.findIndex(f => f.path === absolutePath);
  if (existing >= 0) {
    _projectIndex.files[existing] = indexed;
  } else {
    _projectIndex.files.push(indexed);
    _projectIndex.totalFiles = _projectIndex.files.length;
  }
}

// ─── Smart Context Retrieval (RAG) ────────────────────────────────────────────

/**
 * Given a user query and the current file, retrieve the most relevant
 * indexed files to inject into the LLM context window.
 *
 * Uses a scoring heuristic:
 *  - Entry points (main, index, app) get a bonus
 *  - Files that directly import or are imported by the active file score high
 *  - Files whose exports/symbols match query keywords score high
 *  - Files that match query text directly score high
 */
export async function retrieveRelevantContext(
  query: string,
  activeFilePath: string | null,
  maxFiles = 8,
  maxTokensTotal = 6000
): Promise<string> {
  if (!_projectIndex || _projectIndex.files.length === 0) {
    return "";
  }

  const queryTokens = query.toLowerCase().match(/[a-z][a-z0-9_]{2,}/g) || [];
  const querySet = new Set(queryTokens);

  // Find the active file in index
  const activeIndexed = activeFilePath
    ? _projectIndex.files.find(f => f.path === activeFilePath)
    : null;

  const scored: Array<{ file: IndexedFile; score: number }> = [];

  for (const file of _projectIndex.files) {
    let score = 0;

    // Entry points
    if (file.isEntryPoint) score += 3;

    // Direct import relationship with active file
    if (activeIndexed) {
      if (activeIndexed.imports.some(i => file.relativePath.includes(i) || file.name.includes(i.split("/").pop() || ""))) {
        score += 10;
      }
      if (file.imports.some(i => activeIndexed.relativePath.includes(i) || activeIndexed.name.includes(i.split("/").pop() || ""))) {
        score += 8;
      }
    }

    // Keyword overlap with query
    const kws = new Set(file.keywords);
    for (const qt of querySet) {
      if (kws.has(qt)) score += 2;
      if (file.name.toLowerCase().includes(qt)) score += 5;
      if (file.symbols.some(s => s.toLowerCase().includes(qt))) score += 4;
      if (file.exports.some(e => e.toLowerCase().includes(qt))) score += 3;
    }

    // Same directory as active file
    if (activeFilePath && file.relativePath.includes(activeFilePath.split(/[/\\]/).slice(0, -1).join("/"))) {
      score += 2;
    }

    if (score > 0) scored.push({ file, score });
  }

  scored.sort((a, b) => b.score - a.score);
  const topFiles = scored.slice(0, maxFiles);

  if (topFiles.length === 0) return "";

  let ctx = "\n\n=== SMART CONTEXT (Relevant Project Files) ===\n";
  let totalChars = 0;

  for (const { file, score } of topFiles) {
    const budget = Math.min(maxTokensTotal * 4 - totalChars, 2000); // chars budget per file
    if (budget < 200) break;

    try {
      const content = await invoke<string>("read_file", { path: file.path });
      const excerpt = content.slice(0, budget);
      const truncated = content.length > budget ? "\n... (truncated)" : "";

      ctx += `\n[File: ${file.relativePath} | relevance: ${score} | exports: ${file.exports.slice(0, 5).join(", ")}]\n`;
      ctx += "```\n" + excerpt + truncated + "\n```\n";

      totalChars += excerpt.length + 100;
      if (totalChars >= maxTokensTotal * 4) break;
    } catch {}
  }

  ctx += "\n=== END SMART CONTEXT ===\n";
  return ctx;
}

/**
 * Get files that depend on (import) a given file.
 * Used for impact analysis during refactoring (Problem 10).
 */
export function getDependents(relativePath: string): string[] {
  if (!_projectIndex) return [];
  const normalizedTarget = relativePath.replace(/\.[^.]+$/, ""); // strip extension

  return _projectIndex.files
    .filter(f => f.imports.some(i => {
      const normalized = i.replace(/\.[^.]+$/, "");
      return normalized.endsWith(normalizedTarget) || normalizedTarget.endsWith(normalized.replace(/^\.\//, ""));
    }))
    .map(f => f.relativePath);
}

/**
 * Get files that a given file imports.
 */
export function getDependencies(relativePath: string): IndexedFile[] {
  if (!_projectIndex) return [];
  const file = _projectIndex.files.find(f => f.relativePath === relativePath);
  if (!file) return [];

  return file.imports
    .map(i => _projectIndex!.files.find(f =>
      f.relativePath.includes(i.replace(/^[./]+/, "")) ||
      f.name === i.split("/").pop()
    ))
    .filter(Boolean) as IndexedFile[];
}
