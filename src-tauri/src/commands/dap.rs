use std::process::Stdio;
use std::sync::Arc;
use tauri::{AppHandle, Manager, Emitter};
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::process::{ChildStdin, Command};
use tokio::sync::Mutex;
use std::collections::HashMap;

// Global state to store active DAP sessions
pub struct DapState {
    pub sessions: Mutex<HashMap<String, Arc<Mutex<ChildStdin>>>>,
}

impl DapState {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
        }
    }
}

#[tauri::command]
pub async fn start_debug_session(
    app: AppHandle,
    session_id: String,
    adapter_cmd: String,
    adapter_args: Vec<String>,
) -> Result<(), String> {
    let mut cmd = Command::new(&adapter_cmd);
    cmd.args(&adapter_args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| format!("Failed to spawn adapter: {}", e))?;

    let stdin = child.stdin.take().ok_or("Failed to open stdin")?;
    let stdout = child.stdout.take().ok_or("Failed to open stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to open stderr")?;

    let state = app.state::<DapState>();
    {
        let mut sessions = state.sessions.lock().await;
        sessions.insert(session_id.clone(), Arc::new(Mutex::new(stdin)));
    }

    // Spawn a task to read stdout (DAP messages)
    let app_handle = app.clone();
    let session_id_clone = session_id.clone();
    tokio::spawn(async move {
        let mut reader = BufReader::new(stdout);
        loop {
            // DAP messages are HTTP-like headers followed by a JSON body.
            // Example: "Content-Length: 119\r\n\r\n{...}"
            let mut header_buf = String::new();
            let mut content_length = 0;

            loop {
                header_buf.clear();
                let bytes_read = reader.read_line(&mut header_buf).await.unwrap_or(0);
                if bytes_read == 0 {
                    break; // EOF
                }
                let line = header_buf.trim();
                if line.is_empty() {
                    break; // End of headers
                }
                if line.to_lowercase().starts_with("content-length:") {
                    let parts: Vec<&str> = line.split(':').collect();
                    if parts.len() == 2 {
                        content_length = parts[1].trim().parse::<usize>().unwrap_or(0);
                    }
                }
            }

            if content_length > 0 {
                let mut body_buf = vec![0; content_length];
                if reader.read_exact(&mut body_buf).await.is_ok() {
                    if let Ok(msg) = String::from_utf8(body_buf) {
                        let _ = app_handle.emit("dap-message", serde_json::json!({
                            "session_id": session_id_clone,
                            "message": msg
                        }));
                    }
                }
            } else {
                break; // Invalid or missing Content-Length means process died or bad protocol
            }
        }
        
        // When we exit the loop, the adapter has terminated
        let _ = app_handle.emit("dap-terminated", serde_json::json!({
            "session_id": session_id_clone
        }));
    });

    // Spawn a task to read stderr
    let app_handle_err = app.clone();
    let session_id_err = session_id.clone();
    tokio::spawn(async move {
        let mut reader = BufReader::new(stderr);
        let mut line = String::new();
        while let Ok(bytes) = reader.read_line(&mut line).await {
            if bytes == 0 { break; }
            let _ = app_handle_err.emit("dap-error", serde_json::json!({
                "session_id": session_id_err,
                "error": line
            }));
            line.clear();
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn send_dap_message(
    app: AppHandle,
    session_id: String,
    message: String,
) -> Result<(), String> {
    let state = app.state::<DapState>();
    let sessions = state.sessions.lock().await;
    
    if let Some(stdin_mutex) = sessions.get(&session_id) {
        let mut stdin = stdin_mutex.lock().await;
        
        let payload = format!("Content-Length: {}\r\n\r\n{}", message.len(), message);
        stdin.write_all(payload.as_bytes()).await.map_err(|e| e.to_string())?;
        stdin.flush().await.map_err(|e| e.to_string())?;
        
        Ok(())
    } else {
        Err(format!("DAP session {} not found", session_id))
    }
}

#[tauri::command]
pub async fn stop_debug_session(
    app: AppHandle,
    session_id: String,
) -> Result<(), String> {
    let state = app.state::<DapState>();
    let mut sessions = state.sessions.lock().await;
    
    if sessions.remove(&session_id).is_some() {
        // Removing the Stdin from the map drops it, which should signal the adapter to exit.
        // We could also keep the `Child` and explicitly `.kill()` it if needed.
        Ok(())
    } else {
        Err(format!("DAP session {} not found", session_id))
    }
}
