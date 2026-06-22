use serde::{Deserialize, Serialize};
use std::process::Command;
use tauri::{AppHandle, Emitter, Manager};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::sync::Mutex;
use std::collections::HashMap;

pub struct OllamaState {
    pub active_pulls: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

impl OllamaState {
    pub fn new() -> Self {
        Self {
            active_pulls: Mutex::new(HashMap::new()),
        }
    }
}

#[derive(Debug, Serialize)]
pub struct OllamaHealth {
    pub running: bool,
    pub version: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct ChatMessagePayload {
    pub role: String,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub images: Option<Vec<String>>,
}

#[derive(Debug, Serialize, Clone)]
pub struct ChatChunkPayload {
    pub session_id: String,
    pub content: String,
    pub done: bool,
}

#[derive(Debug, Serialize, Clone)]
pub struct PullProgressPayload {
    pub model: String,
    pub status: String,
    pub completed: Option<u64>,
    pub total: Option<u64>,
    pub done: bool,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn check_ollama_health() -> Result<OllamaHealth, String> {
    match reqwest::get("http://localhost:11434/api/version").await {
        Ok(resp) => {
            let json: serde_json::Value = resp
                .json()
                .await
                .map_err(|e| e.to_string())?;
            Ok(OllamaHealth {
                running: true,
                version: json["version"].as_str().map(|s| s.to_string()),
            })
        }
        Err(_) => Ok(OllamaHealth {
            running: false,
            version: None,
        }),
    }
}

#[tauri::command]
pub async fn list_models() -> Result<Vec<String>, String> {
    let resp = reqwest::get("http://localhost:11434/api/tags")
        .await
        .map_err(|e| e.to_string())?;

    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;

    let models = json["models"]
        .as_array()
        .unwrap_or(&vec![])
        .iter()
        .filter_map(|m| m["name"].as_str().map(|s| s.to_string()))
        .collect();

    Ok(models)
}

#[tauri::command]
pub fn start_ollama() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const DETACHED_PROCESS: u32 = 0x00000008;

        // Build a list of candidate paths in priority order
        let mut candidates: Vec<std::path::PathBuf> = vec![];

        // 1. LOCALAPPDATA\Programs\Ollama (default installer path)
        if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
            candidates.push(std::path::PathBuf::from(&local_app_data)
                .join("Programs").join("Ollama").join("ollama app.exe"));
            candidates.push(std::path::PathBuf::from(&local_app_data)
                .join("Programs").join("Ollama").join("ollama.exe"));
        }

        // 2. Program Files
        if let Ok(pf) = std::env::var("ProgramFiles") {
            candidates.push(std::path::PathBuf::from(&pf).join("Ollama").join("ollama app.exe"));
            candidates.push(std::path::PathBuf::from(&pf).join("Ollama").join("ollama.exe"));
        }

        // 3. Try ollama from PATH
        candidates.push(std::path::PathBuf::from("ollama.exe"));

        for candidate in &candidates {
            if candidate.exists() || candidate.to_str().map(|s| s == "ollama.exe").unwrap_or(false) {
                let result = Command::new(candidate)
                    .arg("serve")
                    .creation_flags(DETACHED_PROCESS)
                    .spawn();
                match result {
                    Ok(_) => return Ok(()),
                    Err(_) => continue,
                }
            }
        }

        return Err("Ollama executable not found. Please install Ollama from https://ollama.ai".to_string());
    }

    #[cfg(not(target_os = "windows"))]
    {
        Command::new("ollama")
            .arg("serve")
            .spawn()
            .map_err(|e| format!("Failed to start Ollama: {}. Is it installed?", e))?;
        Ok(())
    }
}

#[tauri::command]
pub async fn pull_model(
    app: AppHandle,
    model: String,
) -> Result<(), String> {
    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "name": model,
        "stream": true
    });

    let mut res = client.post("http://localhost:11434/api/pull")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let err_text = res.text().await.unwrap_or_default();
        return Err(format!("Pull failed: {}", err_text));
    }

    let cancel_flag = Arc::new(AtomicBool::new(false));
    {
        let state = app.state::<OllamaState>();
        let mut pulls = state.active_pulls.lock().await;
        pulls.insert(model.clone(), Arc::clone(&cancel_flag));
    }

    let mut buffer = Vec::new();
    let mut last_error = None;
    let mut cancelled = false;

    while let Some(chunk) = res.chunk().await.map_err(|e| e.to_string())? {
        if cancel_flag.load(Ordering::Relaxed) {
            cancelled = true;
            break;
        }
        buffer.extend_from_slice(&chunk);
        while let Some(pos) = buffer.iter().position(|&b| b == b'\n') {
            let line_bytes = buffer.drain(..=pos).collect::<Vec<u8>>();
            if let Ok(line_str) = String::from_utf8(line_bytes) {
                if line_str.trim().is_empty() {
                    continue;
                }
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(&line_str) {
                    let status = val["status"].as_str().unwrap_or("").to_string();
                    let completed = val["completed"].as_u64();
                    let total = val["total"].as_u64();
                    let error = val["error"].as_str().map(|s| s.to_string());
                    
                    let done = status == "success" || error.is_some();

                    if let Some(ref err_msg) = error {
                        last_error = Some(err_msg.clone());
                    }

                    let _ = app.emit(
                        "ollama-pull-progress",
                        PullProgressPayload {
                            model: model.clone(),
                            status,
                            completed,
                            total,
                            done,
                            error,
                        },
                    );
                }
            }
        }
    }
    {
        let state = app.state::<OllamaState>();
        let mut pulls = state.active_pulls.lock().await;
        pulls.remove(&model);
    }

    if cancelled {
        let _ = app.emit(
            "ollama-pull-progress",
            PullProgressPayload {
                model: model.clone(),
                status: "cancelled".to_string(),
                completed: Some(0),
                total: Some(100),
                done: true,
                error: Some("Download cancelled by user".to_string()),
            },
        );
        return Err("Cancelled by user".to_string());
    }

    if let Some(err) = last_error {
        return Err(format!("Ollama error: {}", err));
    }

    Ok(())
}

#[tauri::command]
pub async fn cancel_pull_model(app: AppHandle, model: String) -> Result<(), String> {
    let state = app.state::<OllamaState>();
    let pulls = state.active_pulls.lock().await;
    if let Some(flag) = pulls.get(&model) {
        flag.store(true, Ordering::Relaxed);
    }
    Ok(())
}

#[tauri::command]
pub async fn delete_model(model: String) -> Result<(), String> {
    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "name": model
    });

    let req = reqwest::Request::new(reqwest::Method::DELETE, reqwest::Url::parse("http://localhost:11434/api/delete").unwrap());
    
    // reqwest doesn't easily let you add body to DELETE via method, so:
    let res = client.request(reqwest::Method::DELETE, "http://localhost:11434/api/delete")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let err_text = res.text().await.unwrap_or_default();
        return Err(format!("Delete failed: {}", err_text));
    }

    Ok(())
}

#[tauri::command]
pub async fn chat_ollama(
    app: AppHandle,
    session_id: String,
    model: String,
    messages: Vec<ChatMessagePayload>,
) -> Result<(), String> {
    // Separate connect timeout (fast-fail if Ollama is down) from read timeout (long for generation)
    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(10))
        .timeout(std::time::Duration::from_secs(600))
        .build()
        .map_err(|e| e.to_string())?;

    let body = serde_json::json!({
        "model": model,
        "messages": messages,
        "stream": true,
        "keep_alive": "10m",
        "options": {
            // Use 8192 context — safe for small (2B–7B) and large (14B+) models alike.
            // 32768 would OOM tiny models and cause malformed responses mid-stream.
            "num_ctx": 8192,
            // Generous token budget for file generation, but not so high it stalls small models
            "num_predict": 4096,
            "temperature": 0.1,
            "top_p": 0.9,
            "repeat_penalty": 1.05
        }
    });

    let res = client.post("http://localhost:11434/api/chat")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Connection error: {}. Is Ollama running?", e))?;

    // ── Check HTTP status BEFORE streaming ─────────────────────────────────────
    // If Ollama returns 4xx/5xx (model not found, bad request, etc.) the body is
    // a JSON error string — NOT a stream. Trying to decode it as a stream
    // produces the "error decoding response body" panic.
    if !res.status().is_success() {
        let status = res.status();
        let err_body = res.text().await.unwrap_or_else(|_| "Unknown error".to_string());
        // Emit a final "done" chunk with the error so the frontend shows it
        let _ = app.emit(
            "ollama-chat-chunk",
            ChatChunkPayload {
                session_id: session_id.clone(),
                content: format!("⚠️ Ollama error {}: {}", status, err_body),
                done: true,
            },
        );
        return Err(format!("Ollama returned {}: {}", status, err_body));
    }

    let mut res = res;
    let mut buffer = Vec::new();
    let mut had_content = false;
    let mut finished = false;

    loop {
        match res.chunk().await {
            Ok(Some(chunk)) => {
                buffer.extend_from_slice(&chunk);
                while let Some(pos) = buffer.iter().position(|&b| b == b'\n') {
                    let line_bytes = buffer.drain(..=pos).collect::<Vec<u8>>();
                    // Skip non-UTF8 lines instead of crashing
                    let line_str = match String::from_utf8(line_bytes) {
                        Ok(s) => s,
                        Err(_) => continue,
                    };
                    if line_str.trim().is_empty() { continue; }

                    // Skip lines that are not valid JSON (e.g. Ollama keep-alive pings)
                    let val = match serde_json::from_str::<serde_json::Value>(&line_str) {
                        Ok(v) => v,
                        Err(_) => continue,
                    };

                    // Surface Ollama-level errors embedded in the stream
                    if let Some(err) = val["error"].as_str() {
                        let _ = app.emit(
                            "ollama-chat-chunk",
                            ChatChunkPayload {
                                session_id: session_id.clone(),
                                content: format!("\n⚠️ Model error: {}", err),
                                done: true,
                            },
                        );
                        return Err(format!("Model error: {}", err));
                    }

                    let content = val["message"]["content"].as_str().unwrap_or("").to_string();
                    let done = val["done"].as_bool().unwrap_or(false);
                    if done { finished = true; }

                    if !content.is_empty() { had_content = true; }

                    let _ = app.emit(
                        "ollama-chat-chunk",
                        ChatChunkPayload {
                            session_id: session_id.clone(),
                            content,
                            done,
                        },
                    );

                    if done { break; }
                }
            }
            Ok(None) => {
                // Stream ended — if we never got a `done: true` event, emit one now
                // so the frontend doesn't hang waiting forever
                if had_content && !finished {
                    let _ = app.emit(
                        "ollama-chat-chunk",
                        ChatChunkPayload {
                            session_id: session_id.clone(),
                            content: String::new(),
                            done: true,
                        },
                    );
                }
                break;
            }
            Err(e) => {
                // Chunk read error — emit done so frontend recovers gracefully
                let _ = app.emit(
                    "ollama-chat-chunk",
                    ChatChunkPayload {
                        session_id: session_id.clone(),
                        content: format!("\n⚠️ Stream interrupted: {}", e),
                        done: true,
                    },
                );
                return Err(format!("Stream error: {}", e));
            }
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn generate_completion(model: String, prompt: String) -> Result<String, String> {
    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "model": model,
        "prompt": prompt,
        "stream": false,
        "options": {
            "num_predict": 64,
            "temperature": 0.2
        }
    });

    let resp = client.post("http://localhost:11434/api/generate")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let text = json["response"].as_str().unwrap_or("").to_string();
    Ok(text)
}
