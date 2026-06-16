/* ============================================================
   ollama.ts — Frontend client for local Ollama service.
   Proxies all LLM streaming and requests via Tauri commands
   to bypass browser CORS restrictions and run fully offline.
   ============================================================ */
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface OllamaHealth {
  running: boolean;
  version: string | null;
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface PullProgress {
  model: string;
  status: string;
  completed?: number;
  total?: number;
  done: boolean;
  error?: string;
}

export async function checkOllamaHealth(): Promise<OllamaHealth> {
  return invoke<OllamaHealth>("check_ollama_health");
}

export async function startOllama(): Promise<void> {
  return invoke("start_ollama");
}

export async function listModels(): Promise<string[]> {
  return invoke<string[]>("list_models");
}

export async function pullModel(
  model: string,
  onProgress: (progress: PullProgress) => void
): Promise<void> {
  const unlisten = await listen<PullProgress>("ollama-pull-progress", (event) => {
    if (event.payload.model === model) {
      onProgress(event.payload);
    }
  });

  try {
    await invoke("pull_model", { model });
  } finally {
    unlisten();
  }
}

export async function chatOllama(
  sessionId: string,
  model: string,
  messages: ChatMessage[],
  onChunk: (chunk: string, done: boolean) => void
): Promise<void> {
  const unlisten = await listen<{ session_id: string; content: string; done: boolean }>(
    "ollama-chat-chunk",
    (event) => {
      if (event.payload.session_id === sessionId) {
        onChunk(event.payload.content, event.payload.done);
      }
    }
  );

  try {
    await invoke("chat_ollama", { sessionId, model, messages });
  } finally {
    unlisten();
  }
}

export async function generateCompletion(
  model: string,
  prompt: string
): Promise<string> {
  return invoke<string>("generate_completion", { model, prompt });
}

export async function cancelModelPull(model: string): Promise<void> {
  return invoke("cancel_pull_model", { model });
}

export async function deleteModel(model: string): Promise<void> {
  return invoke("delete_model", { model });
}
