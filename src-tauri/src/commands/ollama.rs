use serde::{Deserialize, Serialize};
use std::process::Command;
use tauri::{AppHandle, Emitter};

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

    let mut buffer = Vec::new();
    let mut last_error = None;

    while let Some(chunk) = res.chunk().await.map_err(|e| e.to_string())? {
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

    if let Some(err) = last_error {
        return Err(format!("Ollama error: {}", err));
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
    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "model": model,
        "messages": messages,
        "stream": true
    });

    let mut res = client.post("http://localhost:11434/api/chat")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let mut buffer = Vec::new();
    while let Some(chunk) = res.chunk().await.map_err(|e| e.to_string())? {
        buffer.extend_from_slice(&chunk);
        while let Some(pos) = buffer.iter().position(|&b| b == b'\n') {
            let line_bytes = buffer.drain(..=pos).collect::<Vec<u8>>();
            if let Ok(line_str) = String::from_utf8(line_bytes) {
                if line_str.trim().is_empty() {
                    continue;
                }
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(&line_str) {
                    let content = val["message"]["content"].as_str().unwrap_or("").to_string();
                    let done = val["done"].as_bool().unwrap_or(false);

                    let _ = app.emit(
                        "ollama-chat-chunk",
                        ChatChunkPayload {
                            session_id: session_id.clone(),
                            content,
                            done,
                        },
                    );
                }
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
