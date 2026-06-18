/* ============================================================
   agentValidator.ts — Connectivity & Validation Engine
   Solves Problems 1, 5, 9 from requirements:
   - Pre-save validation of generated code
   - Connectivity checking (imports, routes, exports)
   - Orphan detection
   - Dependency graph validation
   ============================================================ */
import { ProjectMemory } from "./agentMemory";
import { ProjectIndex, getDependents } from "./agentIndexer";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ValidationResult {
  passed: boolean;
  score: number; // 0-100
  issues: ValidationIssue[];
  suggestions: string[];
  connectivityReport: ConnectivityReport;
}

export interface ValidationIssue {
  type: "error" | "warning" | "info";
  category: "import" | "export" | "route" | "api" | "orphan" | "duplicate" | "circular" | "missing_connection";
  file: string;
  message: string;
  suggestion?: string;
}

export interface ConnectivityReport {
  importsResolved: number;
  importsFailed: string[];
  exportsUsed: number;
  exportsUnused: string[];
  routesConnected: string[];
  apisReferenced: string[];
  orphanFiles: string[];
  circularDependencies: string[][];
}

// ─── Circular Dependency Detector ─────────────────────────────────────────────

function detectCircularDeps(depMap: Record<string, string[]>): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const path: string[] = [];

  function dfs(node: string): boolean {
    if (path.includes(node)) {
      const cycleStart = path.indexOf(node);
      cycles.push([...path.slice(cycleStart), node]);
      return true;
    }
    if (visited.has(node)) return false;
    visited.add(node);
    path.push(node);

    for (const dep of (depMap[node] || [])) {
      dfs(dep);
    }

    path.pop();
    return false;
  }

  for (const node of Object.keys(depMap)) {
    if (!visited.has(node)) dfs(node);
  }

  return cycles.slice(0, 5); // return max 5 cycles
}

// ─── Connectivity Checker ─────────────────────────────────────────────────────

/**
 * Validates a generated file for connectivity issues before saving.
 * Checks: imports resolved, no orphan generation, route registration, API usage.
 */
export async function validateFileConnectivity(
  filePath: string,
  fileContent: string,
  memory: ProjectMemory,
  index: ProjectIndex | null,
  workspaceRoot: string
): Promise<ValidationResult> {
  const issues: ValidationIssue[] = [];
  const suggestions: string[] = [];
  const relPath = filePath.replace(workspaceRoot, "").replace(/^[/\\]/, "");

  const report: ConnectivityReport = {
    importsResolved: 0,
    importsFailed: [],
    exportsUsed: 0,
    exportsUnused: [],
    routesConnected: [],
    apisReferenced: [],
    orphanFiles: [],
    circularDependencies: [],
  };

  // 1. Check imports
  const importRx = /import\s+.*?\s+from\s+['"`]([^'"`]+)['"`]/g;
  let m;
  while ((m = importRx.exec(fileContent)) !== null) {
    const importPath = m[1];
    if (!importPath.startsWith(".")) {
      report.importsResolved++;
      continue; // external packages — assume installed
    }

    // Check if the local import target exists in index
    if (index) {
      const depName = importPath.split("/").pop()?.replace(/\.[^.]+$/, "") || "";
      const found = index.files.some(f =>
        f.relativePath.includes(importPath.replace(/^\.\.?\//, "")) ||
        f.name.replace(/\.[^.]+$/, "") === depName
      );

      if (found) {
        report.importsResolved++;
      } else {
        report.importsFailed.push(importPath);
        issues.push({
          type: "error",
          category: "import",
          file: relPath,
          message: `Cannot resolve local import: "${importPath}"`,
          suggestion: `Ensure the file "${importPath}" is created before using this import.`,
        });
      }
    }
  }

  // 2. Extract exports and check if they're referenced anywhere
  const exportRx = /export\s+(?:default\s+)?(?:function|class|const|interface|type)\s+(\w+)/g;
  const fileExports: string[] = [];
  while ((m = exportRx.exec(fileContent)) !== null) {
    fileExports.push(m[1]);
  }

  if (index && fileExports.length > 0) {
    for (const exp of fileExports) {
      const usedElsewhere = index.files.some(f =>
        f.path !== filePath &&
        (f.imports.some(i => i.includes(relPath.replace(/\.[^.]+$/, ""))) ||
         f.keywords.includes(exp.toLowerCase()))
      );

      if (usedElsewhere || exp.match(/^(App|main|index|default)/i)) {
        report.exportsUsed++;
      } else {
        report.exportsUnused.push(exp);
      }
    }
  }

  // 3. Check for potential orphan: if this is a new component, check if it's imported anywhere
  if (fileExports.length > 0 && index) {
    const dependents = getDependents(relPath);
    if (dependents.length === 0 && !relPath.match(/index|main|app|server/i)) {
      issues.push({
        type: "warning",
        category: "orphan",
        file: relPath,
        message: `"${relPath}" is not imported anywhere in the project.`,
        suggestion: `Remember to import and use this file in your application entry point or router.`,
      });
      report.orphanFiles.push(relPath);
    }
  }

  // 4. Check for duplicate file in manifest
  const allManifestPaths = [
    ...memory.manifest.pages.map(p => p.path),
    ...memory.manifest.components.map(c => c.path),
    ...memory.manifest.services.map(s => s.path),
    ...memory.manifest.utilities.map(u => u.path),
  ];

  const isDuplicate = allManifestPaths.includes(relPath);
  if (isDuplicate) {
    // This is an update, not a new file — generally fine
    issues.push({
      type: "info",
      category: "duplicate",
      file: relPath,
      message: `Updating existing file: "${relPath}"`,
    });
  }

  // 5. Circular dependency detection
  const updatedDepMap = { ...memory.dependencyMap };
  const importRx2 = /import\s+.*?\s+from\s+['"`](\.\/[^'"`]+)['"`]/g;
  const localDeps: string[] = [];
  while ((m = importRx2.exec(fileContent)) !== null) {
    localDeps.push(m[1]);
  }
  updatedDepMap[relPath] = localDeps;

  const cycles = detectCircularDeps(updatedDepMap);
  if (cycles.length > 0) {
    report.circularDependencies = cycles;
    cycles.forEach(cycle => {
      issues.push({
        type: "warning",
        category: "circular",
        file: relPath,
        message: `Circular dependency detected: ${cycle.join(" → ")}`,
        suggestion: "Consider restructuring to remove circular imports.",
      });
    });
  }

  // 6. Check route registration for page/view files
  if (/[/\\](pages|views|screens)[/\\]/.test(relPath)) {
    const routerFiles = index?.files.filter(f =>
      f.name.match(/router|routes|App\.(tsx?|jsx?)/i)
    ) || [];

    const componentName = relPath.split(/[/\\]/).pop()?.replace(/\.[^.]+$/, "") || "";
    const isRegistered = routerFiles.some(rf =>
      rf.imports.some(i => i.includes(componentName))
    );

    if (!isRegistered && routerFiles.length > 0) {
      issues.push({
        type: "warning",
        category: "route",
        file: relPath,
        message: `Page "${componentName}" may not be registered in the router.`,
        suggestion: `Add a route for "${componentName}" in your router configuration.`,
      });
    }
  }

  // 7. Generate connectivity suggestions
  if (issues.some(i => i.category === "orphan")) {
    const componentName = relPath.split(/[/\\]/).pop()?.replace(/\.[^.]+$/, "") || "";
    const entryPoints = index?.files.filter(f => f.isEntryPoint) || [];
    if (entryPoints.length > 0) {
      suggestions.push(`Add \`import ${componentName} from './${relPath.replace(/\.[^.]+$/, "")}'\` to ${entryPoints[0].relativePath}`);
    }
  }

  // Calculate score
  const errorCount = issues.filter(i => i.type === "error").length;
  const warnCount = issues.filter(i => i.type === "warning").length;
  const score = Math.max(0, 100 - errorCount * 20 - warnCount * 5);
  const passed = errorCount === 0;

  return {
    passed,
    score,
    issues,
    suggestions,
    connectivityReport: report,
  };
}

/**
 * Format a validation result as a concise string for logging/display.
 */
export function formatValidationResult(result: ValidationResult): string {
  if (result.passed && result.issues.length === 0) {
    return `✅ Validation passed (score: ${result.score}/100)`;
  }

  let out = `📋 Validation Report (score: ${result.score}/100)\n`;

  const errors = result.issues.filter(i => i.type === "error");
  const warnings = result.issues.filter(i => i.type === "warning");
  const infos = result.issues.filter(i => i.type === "info");

  if (errors.length > 0) {
    out += `\n❌ Errors (${errors.length}):\n`;
    errors.forEach(e => out += `  • [${e.category}] ${e.message}\n`);
  }
  if (warnings.length > 0) {
    out += `\n⚠️  Warnings (${warnings.length}):\n`;
    warnings.forEach(w => out += `  • [${w.category}] ${w.message}\n`);
  }
  if (infos.length > 0) {
    out += `\nℹ️  Info (${infos.length}):\n`;
    infos.forEach(i => out += `  • ${i.message}\n`);
  }
  if (result.suggestions.length > 0) {
    out += `\n💡 Suggestions:\n`;
    result.suggestions.forEach(s => out += `  • ${s}\n`);
  }
  if (result.connectivityReport.orphanFiles.length > 0) {
    out += `\n🔗 Orphan files: ${result.connectivityReport.orphanFiles.join(", ")}\n`;
  }

  return out;
}
