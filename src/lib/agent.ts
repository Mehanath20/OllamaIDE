/* ============================================================
   agent.ts — Offline AI Coding Agent Engine.
   Implements the Read-Think-Act-Repeat loop. Parses system
   tags for plan, think, read_file, write_file, and run_command.
   ============================================================ */
import { invoke } from "@tauri-apps/api/core";
import { useAIStore, ChatMessage, AgentStep } from "../store/aiStore";
import { useFileStore } from "../store/fileStore";
import { useEditorStore } from "../store/editorStore";
import { chatOllama } from "./ollama";
import { getWorkspaceContext } from "./fileUtils";

const AGENT_SYSTEM_PROMPT = `You are Antigravity AI Agent, an advanced coding assistant that runs completely offline.
You help the user solve coding tasks by thinking, planning, reading files, writing files, and running shell commands. You act autonomously and proactively to fix errors and implement features, much like VS Code's automated coding features or Anthropic's Claude Code.

You have access to the following XML-like action tags:
1. Read a file:
<read_file path="relative/path/to/file"/>

2. Write or overwrite a file:
<write_file path="relative/path/to/file">
file contents here
</write_file>

3. Run a shell command (use this to run linters, tests, or builds to spot errors):
<run_command>command_to_run</run_command>

4. List a directory:
<list_dir path="relative/path/to/dir"/>

5. Search across files:
<search_files query="search_term" path="relative/path/to/search"/>

6. Think and reason:
Use <think>your reasoning process</think> to explain what you are doing.

7. Update your checklist/plan:
Use <plan>
- [ ] step 1
- [ ] step 2
</plan> to show your plan. Use [x] for completed steps.

Rules:
- Perform EXACTLY ONE action at a time (e.g. one read_file, one write_file, one run_command, one list_dir, or one search_files).
- After proposing an action, stop generating and wait for the system response.
- Do not make up file content; read files if you need to know their structure or verify changes.
- Always output a <think> tag to explain your strategy.
- When the task is fully complete, output: "TASK COMPLETE".
`;

/**
 * Executes a terminal command using the custom Rust backend command.
 */
async function runShellCommand(cmd: string): Promise<string> {
  const fileState = useFileStore.getState();
  const cwd = fileState.workspaceRoot || ".";
  
  try {
    const output = await invoke<string>("execute_shell", { cmd, cwd });
    return output;
  } catch (err: any) {
    return `Failed to execute command: ${err.message || err}`;
  }
}

/**
 * Parses markdown-like checklist plan:
 * - [ ] Step text
 * - [x] Completed step
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
 * Triggers a single turn of the agent conversation loop.
 */
export async function runAgentTurn(userQuery: string | null): Promise<void> {
  const aiStore = useAIStore.getState();
  const model = aiStore.activeModel;
  const sessionId = "agent-session";

  aiStore.setStreaming(true);

  let currentHistory: ChatMessage[] = [...aiStore.messages];

  // 1. If userQuery is provided, initialize new conversation
  if (userQuery) {
    aiStore.clearAgentState();
    const workspaceContext = getWorkspaceContext();
    
    let contextStr = `\n\n=== Workspace Context ===\n`;
    if (workspaceContext.activeFile.path) {
      contextStr += `Active File: ${workspaceContext.activeFile.path}\n`;
      contextStr += `Active File Content:\n\`\`\`\n${workspaceContext.activeFile.content || ""}\n\`\`\`\n`;
    }
    contextStr += `File Tree:\n${workspaceContext.fileTree}\n`;
    if (workspaceContext.terminalOutput) {
      contextStr += `Recent Terminal Output:\n${workspaceContext.terminalOutput}\n`;
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

  // Ensure system prompt is at the head
  const chatMessages = [
    { role: "system" as const, content: AGENT_SYSTEM_PROMPT },
    ...currentHistory.map((m) => ({ role: m.role, content: m.content })),
  ];

  // Add a blank placeholder assistant message
  const assistantMsgId = `assistant-${Date.now()}`;
  const assistantMessage: ChatMessage = {
    id: assistantMsgId,
    role: "assistant",
    content: "",
    timestamp: Date.now(),
  };
  aiStore.addMessage(assistantMessage);

  aiStore.setAgentStatus("thinking");
  aiStore.addAgentLog("Consulting LLM...");

  let fullContent = "";

  try {
    await chatOllama(sessionId, model, chatMessages, (chunk, done) => {
      fullContent += chunk;
      aiStore.updateLastMessageContent(fullContent);

      // Extract reasoning on the fly
      const thinkMatch = fullContent.match(/<think>([\s\S]*?)$/);
      if (thinkMatch) {
        const activeThought = thinkMatch[1].replace(/<\/think>/g, "").trim();
        if (activeThought) {
          aiStore.setAgentStatus("thinking");
        }
      }

      if (done) {
        aiStore.setStreaming(false);
        handleCompletedTurn(fullContent);
      }
    });
  } catch (err: any) {
    aiStore.setStreaming(false);
    aiStore.setAgentStatus("idle");
    aiStore.addAgentLog(`Error calling LLM: ${err.message || err}`);
    aiStore.updateLastMessageContent(`An error occurred: ${err.message || err}`);
  }
}

/**
 * Handle a complete generation from the Agent
 */
async function handleCompletedTurn(content: string) {
  const aiStore = useAIStore.getState();
  aiStore.addAgentLog("Turn generated. Analyzing next step...");

  // Parse plan if present
  const steps = parsePlan(content);
  if (steps.length > 0) {
    aiStore.setAgentSteps(steps);
  }

  // Parse actions
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

  // 1. Read File Action
  if (readMatch) {
    const targetPath = readMatch[1];
    aiStore.setAgentStatus("reading");
    aiStore.addAgentLog(`Action: Reading file [${targetPath}]`);

    let fileContent = "";
    try {
      const workspaceRoot = useFileStore.getState().workspaceRoot || "";
      const absolutePath = workspaceRoot ? `${workspaceRoot}/${targetPath}`.replace(/\/+/g, "/") : targetPath;
      fileContent = await invoke<string>("read_file", { path: absolutePath });
      aiStore.addAgentLog(`Read success for [${targetPath}]`);
    } catch (err: any) {
      fileContent = `Error reading file: ${err.message || err}`;
      aiStore.addAgentLog(`Read failed for [${targetPath}]: ${err.message || err}`);
    }

    const systemMessage: ChatMessage = {
      id: `sys-${Date.now()}`,
      role: "system",
      content: `[System]: Content of file "${targetPath}":\n\`\`\`\n${fileContent}\n\`\`\``,
      timestamp: Date.now(),
    };
    aiStore.addMessage(systemMessage);

    // Auto-continue loop
    setTimeout(() => runAgentTurn(null), 1000);
    return;
  }

  // 2. Write File Action
  if (writeMatch) {
    const targetPath = writeMatch[1];
    const newContent = writeMatch[2];
    aiStore.setAgentStatus("generating");
    aiStore.addAgentLog(`Action: Automatically writing file [${targetPath}]`);

    try {
      const workspaceRoot = useFileStore.getState().workspaceRoot || "";
      const absolutePath = workspaceRoot ? `${workspaceRoot}/${targetPath}`.replace(/\/+/g, "/") : targetPath;
      
      // Write the file to the file system
      await invoke("write_file", { path: absolutePath, content: newContent });
      aiStore.addAgentLog(`Successfully wrote file [${targetPath}]`);

      // Automatically update the code editor if the file is open
      const editorStore = useEditorStore.getState();
      const isOpen = editorStore.openFiles.find((f) => f.path === absolutePath || f.path === targetPath);
      
      if (isOpen) {
        editorStore.updateContent(isOpen.path, newContent);
      } else {
        editorStore.openFile({
          path: absolutePath,
          name: targetPath.split("/").pop() || targetPath,
          content: newContent,
          language: "plaintext", // will rely on monaco to adapt or keep simple
          isDirty: false
        });
      }

      const systemMessage: ChatMessage = {
        id: `sys-${Date.now()}`,
        role: "system",
        content: `[System]: Successfully wrote and opened file "${targetPath}".`,
        timestamp: Date.now(),
      };
      aiStore.addMessage(systemMessage);
    } catch (err: any) {
      aiStore.addAgentLog(`Failed to write file [${targetPath}]: ${err.message || err}`);
      const systemMessage: ChatMessage = {
        id: `sys-${Date.now()}`,
        role: "system",
        content: `[System]: Failed to write file "${targetPath}": ${err.message || err}`,
        timestamp: Date.now(),
      };
      aiStore.addMessage(systemMessage);
    }

    // Auto-continue loop
    setTimeout(() => runAgentTurn(null), 1000);
    return;
  }

  // 3. Run Command Action
  if (runMatch) {
    const cmd = runMatch[1].trim();
    aiStore.setAgentStatus("executing");
    aiStore.addAgentLog(`Action Proposed: Run shell command [${cmd}]`);

    aiStore.setPendingCommand(cmd);

    const cmdPromise = new Promise<boolean>((resolve) => {
      aiStore.setCommandPermissionResolve(resolve);
    });

    const approved = await cmdPromise;
    aiStore.setPendingCommand(null);
    aiStore.setCommandPermissionResolve(null);

    if (approved) {
      aiStore.addAgentLog(`Executing command [${cmd}]...`);
      const output = await runShellCommand(cmd);
      aiStore.addAgentLog(`Command finished.`);

      const systemMessage: ChatMessage = {
        id: `sys-${Date.now()}`,
        role: "system",
        content: `[System]: Executed command "${cmd}". Output:\n\`\`\`\n${output}\n\`\`\``,
        timestamp: Date.now(),
      };
      aiStore.addMessage(systemMessage);
    } else {
      aiStore.addAgentLog(`User REJECTED command execution [${cmd}].`);
      const systemMessage: ChatMessage = {
        id: `sys-${Date.now()}`,
        role: "system",
        content: `[System]: User rejected executing command "${cmd}".`,
        timestamp: Date.now(),
      };
      aiStore.addMessage(systemMessage);
    }

    // Auto-continue loop
    setTimeout(() => runAgentTurn(null), 1000);
    return;
  }

  // 4. List Directory Action
  if (listDirMatch) {
    const targetPath = listDirMatch[1];
    aiStore.setAgentStatus("reading");
    aiStore.addAgentLog(`Action: Listing directory [${targetPath}]`);

    let dirContent = "";
    try {
      const workspaceRoot = useFileStore.getState().workspaceRoot || "";
      const absolutePath = workspaceRoot ? `${workspaceRoot}/${targetPath}`.replace(/\/+/g, "/") : targetPath;
      
      const entries: any[] = await invoke("list_dir", { path: absolutePath });
      dirContent = entries.map(e => `${e.is_dir ? "[DIR]" : "[FILE]"} ${e.name}${e.size ? ` (${e.size} bytes)` : ""}`).join("\n");
      if (!dirContent) dirContent = "(Empty directory)";
      aiStore.addAgentLog(`List success for [${targetPath}]`);
    } catch (err: any) {
      dirContent = `Error listing directory: ${err.message || err}`;
      aiStore.addAgentLog(`List failed for [${targetPath}]: ${err.message || err}`);
    }

    const systemMessage: ChatMessage = {
      id: `sys-${Date.now()}`,
      role: "system",
      content: `[System]: Content of directory "${targetPath}":\n\`\`\`\n${dirContent}\n\`\`\``,
      timestamp: Date.now(),
    };
    aiStore.addMessage(systemMessage);

    setTimeout(() => runAgentTurn(null), 1000);
    return;
  }

  // 5. Search Files Action
  if (searchMatch) {
    const query = searchMatch[1];
    const targetPath = searchMatch[2];
    aiStore.setAgentStatus("reading");
    aiStore.addAgentLog(`Action: Searching "${query}" in [${targetPath}]`);

    let searchContent = "";
    try {
      const workspaceRoot = useFileStore.getState().workspaceRoot || "";
      const absolutePath = workspaceRoot ? `${workspaceRoot}/${targetPath}`.replace(/\/+/g, "/") : targetPath;
      
      const results: any[] = await invoke("search_files", { path: absolutePath, query });
      if (results.length === 0) {
        searchContent = "No results found.";
      } else {
        searchContent = results.map(r => `${r.file}:${r.line} - ${r.text}`).join("\n");
      }
      aiStore.addAgentLog(`Search success for "${query}"`);
    } catch (err: any) {
      searchContent = `Error searching: ${err.message || err}`;
      aiStore.addAgentLog(`Search failed for "${query}": ${err.message || err}`);
    }

    const systemMessage: ChatMessage = {
      id: `sys-${Date.now()}`,
      role: "system",
      content: `[System]: Search results for "${query}" in "${targetPath}":\n\`\`\`\n${searchContent}\n\`\`\``,
      timestamp: Date.now(),
    };
    aiStore.addMessage(systemMessage);

    setTimeout(() => runAgentTurn(null), 1000);
    return;
  }

  // 6. No action / Complete
  if (steps.length > 0) {
    aiStore.addAgentLog("Plan generated. Prompting LLM to start execution...");
    const systemMessage: ChatMessage = {
      id: `sys-${Date.now()}`,
      role: "system",
      content: `[System]: Plan updated. Please proceed with executing the next step using <read_file>, <write_file>, or <run_command>. If the task is fully complete, output "TASK COMPLETE".`,
      timestamp: Date.now(),
    };
    aiStore.addMessage(systemMessage);
    setTimeout(() => runAgentTurn(null), 1000);
    return;
  }

  aiStore.setAgentStatus("idle");
  aiStore.addAgentLog("Task finished or no action requested.");
}
