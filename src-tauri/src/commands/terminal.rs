/* ============================================================
   terminal.rs — Tauri commands for PTY management
   All Phase 3 commands + backward-compat aliases for Phase 2
   ============================================================ */
use crate::state::AppState;
use crate::terminal::pty_manager::SessionInfo;
use tauri::{AppHandle, State};
use uuid::Uuid;

// ─── Phase 3 Commands ────────────────────────────────────────────────────────

/// Create a new terminal session.
/// `shell_path` is optional — omit to use the OS default shell.
/// Returns the generated session UUID.
#[tauri::command]
pub fn create_terminal(
    state: State<'_, AppState>,
    app: AppHandle,
    shell_path: Option<String>,
    cwd: String,
) -> Result<String, String> {
    let id = Uuid::new_v4().to_string();
    let mut manager = state.pty_manager.lock().map_err(|e| e.to_string())?;
    manager.create_session(id.clone(), shell_path, cwd, app)?;
    Ok(id)
}

/// Write raw bytes to a terminal (keyboard input / paste).
#[tauri::command]
pub fn write_to_terminal(
    state: State<'_, AppState>,
    session_id: String,
    data: Vec<u8>,
) -> Result<(), String> {
    let manager = state.pty_manager.lock().map_err(|e| e.to_string())?;
    manager.write_bytes_to_session(&session_id, data)
}

/// Resize the PTY dimensions (SIGWINCH equivalent).
#[tauri::command]
pub fn resize_terminal(
    state: State<'_, AppState>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let manager = state.pty_manager.lock().map_err(|e| e.to_string())?;
    manager.resize_session(&session_id, cols, rows)
}

/// Kill a terminal session.
#[tauri::command]
pub fn kill_terminal(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<(), String> {
    let mut manager = state.pty_manager.lock().map_err(|e| e.to_string())?;
    manager.kill_session(&session_id)
}

/// List all active terminal sessions.
#[tauri::command]
pub fn list_terminals(state: State<'_, AppState>) -> Result<Vec<SessionInfo>, String> {
    let manager = state.pty_manager.lock().map_err(|e| e.to_string())?;
    Ok(manager.list_sessions())
}

// ─── Phase 2 Backward-Compat Aliases ─────────────────────────────────────────

/// Legacy: create_pty — delegates to create_session with string id.
#[tauri::command]
pub fn create_pty(
    state: State<'_, AppState>,
    app: AppHandle,
    id: String,
    cwd: String,
) -> Result<(), String> {
    let mut manager = state.pty_manager.lock().map_err(|e| e.to_string())?;
    manager.create_session(id, None, cwd, app)?;
    Ok(())
}

/// Legacy: write_to_pty — write UTF-8 string.
#[tauri::command]
pub fn write_to_pty(
    state: State<'_, AppState>,
    id: String,
    data: String,
) -> Result<(), String> {
    let manager = state.pty_manager.lock().map_err(|e| e.to_string())?;
    manager.write_to_session(&id, data)
}

/// Legacy: kill_pty.
#[tauri::command]
pub fn kill_pty(
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    let mut manager = state.pty_manager.lock().map_err(|e| e.to_string())?;
    manager.kill_session(&id)
}
