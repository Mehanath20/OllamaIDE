/* ============================================================
   agentMemory.ts — Persistent Project Memory & Manifest System
   Implements Problem 3, 7, 8 from the requirements:
   - Architecture memory
   - Project manifest (pages, routes, APIs, services, etc.)
   - Dependency map
   - Decisions log
   - Active context
   ============================================================ */
import { invoke } from "@tauri-apps/api/core";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ProjectManifest {
  version: number;
  projectName: string;
  techStack: string[];
  pages: ManifestEntry[];
  components: ManifestEntry[];
  routes: RouteEntry[];
  apis: ApiEntry[];
  services: ManifestEntry[];
  models: ManifestEntry[];
  utilities: ManifestEntry[];
  dbTables: string[];
  lastUpdated: number;
}

export interface ManifestEntry {
  name: string;
  path: string;
  description: string;
  exports: string[];
}

export interface RouteEntry {
  path: string;
  component: string;
  filePath: string;
  auth?: boolean;
}

export interface ApiEntry {
  endpoint: string;
  method: string;
  handler: string;
  filePath: string;
}

export interface DependencyMap {
  [filePath: string]: string[];
}

export interface ArchitectureDecision {
  id: string;
  timestamp: number;
  decision: string;
  rationale: string;
  files: string[];
}

export interface ProjectMemory {
  manifest: ProjectManifest;
  dependencyMap: DependencyMap;
  decisions: ArchitectureDecision[];
  activeContext: string;
  projectRules: string;
  architectureNotes: string;
}

// ─── Default Empty State ──────────────────────────────────────────────────────

const DEFAULT_MANIFEST: ProjectManifest = {
  version: 1,
  projectName: "Unknown Project",
  techStack: [],
  pages: [],
  components: [],
  routes: [],
  apis: [],
  services: [],
  models: [],
  utilities: [],
  dbTables: [],
  lastUpdated: Date.now(),
};

const DEFAULT_MEMORY: ProjectMemory = {
  manifest: DEFAULT_MANIFEST,
  dependencyMap: {},
  decisions: [],
  activeContext: "",
  projectRules: "",
  architectureNotes: "",
};

// ─── Memory File Paths ────────────────────────────────────────────────────────

function getMemoryDir(workspaceRoot: string): string {
  const sep = workspaceRoot.includes("\\") ? "\\" : "/";
  return `${workspaceRoot}${sep}.antinetwork${sep}memory`;
}

function getMemoryPath(workspaceRoot: string, file: string): string {
  const sep = workspaceRoot.includes("\\") ? "\\" : "/";
  return `${getMemoryDir(workspaceRoot)}${sep}${file}`;
}

// ─── Load & Save ─────────────────────────────────────────────────────────────

export async function loadProjectMemory(workspaceRoot: string): Promise<ProjectMemory> {
  try {
    const manifestPath = getMemoryPath(workspaceRoot, "project_manifest.json");
    const depMapPath   = getMemoryPath(workspaceRoot, "dependency_map.json");
    const decisionsPath = getMemoryPath(workspaceRoot, "decisions.json");
    const contextPath  = getMemoryPath(workspaceRoot, "active_context.md");
    const rulesPath    = getMemoryPath(workspaceRoot, "project_rules.md");
    const archPath     = getMemoryPath(workspaceRoot, "architecture.md");

    const [manifest, depMap, decisions, context, rules, arch] = await Promise.allSettled([
      invoke<string>("read_file", { path: manifestPath }),
      invoke<string>("read_file", { path: depMapPath }),
      invoke<string>("read_file", { path: decisionsPath }),
      invoke<string>("read_file", { path: contextPath }),
      invoke<string>("read_file", { path: rulesPath }),
      invoke<string>("read_file", { path: archPath }),
    ]);

    return {
      manifest:          manifest.status === "fulfilled" ? JSON.parse(manifest.value) : DEFAULT_MANIFEST,
      dependencyMap:     depMap.status === "fulfilled" ? JSON.parse(depMap.value) : {},
      decisions:         decisions.status === "fulfilled" ? JSON.parse(decisions.value) : [],
      activeContext:     context.status === "fulfilled" ? context.value : "",
      projectRules:      rules.status === "fulfilled" ? rules.value : "",
      architectureNotes: arch.status === "fulfilled" ? arch.value : "",
    };
  } catch {
    return { ...DEFAULT_MEMORY };
  }
}

export async function saveProjectMemory(workspaceRoot: string, memory: ProjectMemory): Promise<void> {
  try {
    const manifestPath  = getMemoryPath(workspaceRoot, "project_manifest.json");
    const depMapPath    = getMemoryPath(workspaceRoot, "dependency_map.json");
    const decisionsPath = getMemoryPath(workspaceRoot, "decisions.json");
    const contextPath   = getMemoryPath(workspaceRoot, "active_context.md");

    memory.manifest.lastUpdated = Date.now();

    await Promise.all([
      invoke("write_file", { path: manifestPath, content: JSON.stringify(memory.manifest, null, 2) }),
      invoke("write_file", { path: depMapPath,   content: JSON.stringify(memory.dependencyMap, null, 2) }),
      invoke("write_file", { path: decisionsPath, content: JSON.stringify(memory.decisions, null, 2) }),
      invoke("write_file", { path: contextPath,  content: memory.activeContext }),
    ]);
  } catch (err) {
    console.warn("Failed to save project memory:", err);
  }
}

// ─── Manifest Updater ─────────────────────────────────────────────────────────

/**
 * Analyzes newly written file content and updates the project manifest.
 * Uses pattern matching to detect pages, components, APIs, routes, etc.
 */
export function updateManifestFromFile(
  memory: ProjectMemory,
  filePath: string,
  content: string,
  workspaceRoot: string
): ProjectMemory {
  const updated = { ...memory };
  const manifest = { ...updated.manifest };

  const relPath = filePath.replace(workspaceRoot, "").replace(/^[/\\]/, "");
  const ext = relPath.split(".").pop()?.toLowerCase() || "";
  const fileName = relPath.split(/[/\\]/).pop() || relPath;
  const nameWithoutExt = fileName.replace(/\.[^.]+$/, "");

  const isSourceFile = ["ts", "tsx", "js", "jsx", "py", "vue", "svelte"].includes(ext);
  if (!isSourceFile) return memory;

  // Extract named exports
  const exportMatches = [...content.matchAll(/export\s+(?:default\s+)?(?:function|class|const|interface|type)\s+(\w+)/g)];
  const exports = exportMatches.map(m => m[1]);

  const entry: ManifestEntry = {
    name: nameWithoutExt,
    path: relPath,
    description: `Auto-detected from ${fileName}`,
    exports,
  };

  // Detect pages (components in /pages/ or /views/ directories)
  if (/[/\\](pages|views|screens)[/\\]/.test(relPath)) {
    const exists = manifest.pages.findIndex(p => p.path === relPath);
    if (exists >= 0) manifest.pages[exists] = entry;
    else manifest.pages.push(entry);
  }
  // Detect components
  else if (/[/\\]components[/\\]/.test(relPath) || /[A-Z]/.test(nameWithoutExt[0] || "")) {
    const exists = manifest.components.findIndex(c => c.path === relPath);
    if (exists >= 0) manifest.components[exists] = entry;
    else if (!manifest.components.some(c => c.path === relPath)) manifest.components.push(entry);
  }

  // Detect API routes (files in /api/ or /routes/)
  if (/[/\\](api|routes)[/\\]/.test(relPath)) {
    const routeMatches = [...content.matchAll(/router\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/gi)];
    for (const m of routeMatches) {
      const apiEntry: ApiEntry = {
        endpoint: m[2],
        method: m[1].toUpperCase(),
        handler: nameWithoutExt,
        filePath: relPath,
      };
      const exists = manifest.apis.findIndex(a => a.endpoint === apiEntry.endpoint && a.method === apiEntry.method);
      if (exists >= 0) manifest.apis[exists] = apiEntry;
      else manifest.apis.push(apiEntry);
    }
  }

  // Detect services (files with "service" or "Service" in the name)
  if (/service/i.test(nameWithoutExt)) {
    const exists = manifest.services.findIndex(s => s.path === relPath);
    if (exists >= 0) manifest.services[exists] = entry;
    else manifest.services.push(entry);
  }

  // Detect utilities
  if (/util|helper|lib/i.test(nameWithoutExt) && !/[/\\]components[/\\]/.test(relPath)) {
    const exists = manifest.utilities.findIndex(u => u.path === relPath);
    if (exists >= 0) manifest.utilities[exists] = entry;
    else manifest.utilities.push(entry);
  }

  updated.manifest = manifest;
  return updated;
}

// ─── Dependency Map Updater ───────────────────────────────────────────────────

/**
 * Parses import statements from a file and updates the dependency map.
 */
export function updateDependencyMap(
  depMap: DependencyMap,
  filePath: string,
  content: string,
  workspaceRoot: string
): DependencyMap {
  const updated = { ...depMap };
  const relPath = filePath.replace(workspaceRoot, "").replace(/^[/\\]/, "");

  // Match all import statements: static and dynamic
  const importRegex = /(?:import\s+.*?\s+from\s+|require\s*\(\s*)['"`]([^'"`]+)['"`]/g;
  const deps: string[] = [];
  let match;

  while ((match = importRegex.exec(content)) !== null) {
    const dep = match[1];
    // Only track local file imports (starting with ./ or ../)
    if (dep.startsWith(".")) {
      deps.push(dep);
    }
  }

  updated[relPath] = [...new Set(deps)];
  return updated;
}

// ─── Format Memory as Context String ─────────────────────────────────────────

/**
 * Formats the project memory into a concise context string for injection
 * into the LLM prompt. Keeps it compact to save context window.
 */
export function formatMemoryAsContext(memory: ProjectMemory): string {
  const { manifest, dependencyMap, decisions, architectureNotes } = memory;

  let ctx = `\n\n=== PROJECT MEMORY ===\n`;
  ctx += `Project: ${manifest.projectName}\n`;
  ctx += `Tech Stack: ${manifest.techStack.join(", ") || "Unknown"}\n\n`;

  if (manifest.pages.length > 0) {
    ctx += `PAGES (${manifest.pages.length}):\n`;
    manifest.pages.forEach(p => ctx += `  - ${p.name}: ${p.path}\n`);
    ctx += "\n";
  }

  if (manifest.components.length > 0) {
    ctx += `COMPONENTS (${manifest.components.length}):\n`;
    manifest.components.slice(0, 20).forEach(c => ctx += `  - ${c.name}: ${c.path} [exports: ${c.exports.slice(0, 3).join(", ")}]\n`);
    if (manifest.components.length > 20) ctx += `  ... and ${manifest.components.length - 20} more\n`;
    ctx += "\n";
  }

  if (manifest.routes.length > 0) {
    ctx += `ROUTES:\n`;
    manifest.routes.forEach(r => ctx += `  ${r.path} → ${r.component}\n`);
    ctx += "\n";
  }

  if (manifest.apis.length > 0) {
    ctx += `API ENDPOINTS (${manifest.apis.length}):\n`;
    manifest.apis.slice(0, 15).forEach(a => ctx += `  ${a.method} ${a.endpoint} → ${a.handler}\n`);
    ctx += "\n";
  }

  if (manifest.services.length > 0) {
    ctx += `SERVICES: ${manifest.services.map(s => s.name).join(", ")}\n\n`;
  }

  if (architectureNotes) {
    ctx += `ARCHITECTURE NOTES:\n${architectureNotes.slice(0, 500)}\n\n`;
  }

  if (decisions.length > 0) {
    const recent = decisions.slice(-3);
    ctx += `RECENT DECISIONS:\n`;
    recent.forEach(d => ctx += `  - ${d.decision}\n`);
    ctx += "\n";
  }

  // Orphan detection: files with no dependents
  const allDeps = new Set(Object.values(dependencyMap).flat());
  const orphans = Object.keys(dependencyMap).filter(f => {
    const base = f.split(/[/\\]/).pop()?.replace(/\.[^.]+$/, "") || "";
    return !allDeps.has(f) && !allDeps.has(`./${f}`) && !base.match(/index|main|app/i);
  });
  if (orphans.length > 0) {
    ctx += `⚠️ POTENTIAL ORPHAN FILES (not imported anywhere):\n`;
    orphans.slice(0, 5).forEach(o => ctx += `  - ${o}\n`);
    ctx += "\n";
  }

  ctx += `=== END PROJECT MEMORY ===\n`;
  return ctx;
}
