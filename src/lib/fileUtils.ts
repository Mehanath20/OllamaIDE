/* ============================================================
   fileUtils.ts — LLM Context Gathering & Mentions Parser.
   Gathers active editor text, cursor, selection, workspace tree,
   recent terminal history, and resolves @file mentions.
   ============================================================ */
import { invoke } from "@tauri-apps/api/core";
import { useEditorStore } from "../store/editorStore";
import { useUIStore } from "../store/uiStore";
import { useFileStore, FileNode } from "../store/fileStore";
import { useTerminalStore } from "../store/terminalStore";

/**
 * Trigger a file tree refresh for the given root.
 * Called by the agent after write_file to update the Explorer.
 */
export async function list_dir_recursive(rootPath: string): Promise<void> {
  try {
    const entries = await invoke<{ name: string; path: string; is_dir: boolean; size?: number }[]>(
      "list_dir",
      { path: rootPath }
    );
    const tree: FileNode[] = entries.map((e) => ({
      name: e.name,
      path: e.path,
      isDir: e.is_dir,
      size: e.size,
      children: undefined,
      expanded: false,
    }));
    useFileStore.getState().setTree(tree);
  } catch (err) {
    console.warn("list_dir_recursive failed:", err);
  }
}


/**
 * Textually serialize the workspace directory tree up to 3 levels deep.
 */
export function serializeWorkspaceTree(nodes: FileNode[], depth = 0): string {
  if (depth > 3) return "... (too deep)";
  let result = "";
  for (const node of nodes) {
    const indent = "  ".repeat(depth);
    if (node.isDir) {
      result += `${indent}📁 ${node.name}/\n`;
      if (node.children) {
        result += serializeWorkspaceTree(node.children, depth + 1);
      }
    } else {
      result += `${indent}📄 ${node.name}\n`;
    }
  }
  return result;
}

export interface WorkspaceContext {
  activeFile: {
    path: string | null;
    name: string | null;
    content: string | null;
    cursor: { line: number; column: number } | null;
    selection: string | null;
  };
  fileTree: string;
  terminalOutput: string | null;
}

/**
 * Gather the current workspace state to inject into the LLM context.
 */
export function getWorkspaceContext(): WorkspaceContext {
  const editorState = useEditorStore.getState();
  const uiState = useUIStore.getState();
  const fileState = useFileStore.getState();
  const terminalState = useTerminalStore.getState();

  const activeFilePath = editorState.activeFile;
  const activeFileObj = editorState.openFiles.find((f) => f.path === activeFilePath);

  // Active Terminal Output
  let terminalOutput: string | null = null;
  if (terminalState.activeId) {
    const activeSession = terminalState.sessions.find((s) => s.id === terminalState.activeId);
    if (activeSession?.recentOutput) {
      terminalOutput = activeSession.recentOutput;
    }
  }

  return {
    activeFile: {
      path: activeFilePath,
      name: activeFileObj ? activeFileObj.name : null,
      content: activeFileObj ? activeFileObj.content : null,
      cursor: uiState.cursorPosition,
      selection: uiState.selectedCode,
    },
    fileTree: serializeWorkspaceTree(fileState.tree),
    terminalOutput,
  };
}

/**
 * Scans the prompt for `@filename` mentions, searches the workspace tree
 * to find matching files, reads their contents, and returns a compiled block.
 * Also returns the cleaned prompt with mentions highlighted or intact.
 */
export async function resolveFileMentions(prompt: string): Promise<{
  cleanedPrompt: string;
  injectedContext: string;
}> {
  const mentionRegex = /@([a-zA-Z0-9_\-\.\/]+)/g;
  const matches = [...prompt.matchAll(mentionRegex)];
  if (matches.length === 0) {
    return { cleanedPrompt: prompt, injectedContext: "" };
  }

  const fileState = useFileStore.getState();
  const allFiles: { name: string; path: string }[] = [];

  // Flatten the file tree to find matches
  function flatten(nodes: FileNode[]) {
    for (const n of nodes) {
      if (!n.isDir) {
        allFiles.push({ name: n.name, path: n.path });
      } else if (n.children) {
        flatten(n.children);
      }
    }
  }
  flatten(fileState.tree);

  let injectedContext = "\n\n--- Mentioned Files Context ---\n";
  const processed = new Set<string>();

  for (const match of matches) {
    const fileNameOrPath = match[1];
    if (processed.has(fileNameOrPath)) continue;
    processed.add(fileNameOrPath);

    // Look for exact match by name, or partial match by path suffix
    const found = allFiles.find(
      (f) =>
        f.name.toLowerCase() === fileNameOrPath.toLowerCase() ||
        f.path.toLowerCase().endsWith(fileNameOrPath.toLowerCase())
    );

    if (found) {
      try {
        const content = await invoke<string>("read_file", { path: found.path });
        injectedContext += `\n[File: ${found.name} (${found.path})]\n\`\`\`\n${content}\n\`\`\`\n`;
      } catch (err) {
        injectedContext += `\n[File: ${found.name} - Failed to read contents]\n`;
      }
    }
  }

  injectedContext += "\n-------------------------------\n";

  return {
    cleanedPrompt: prompt,
    injectedContext,
  };
}
