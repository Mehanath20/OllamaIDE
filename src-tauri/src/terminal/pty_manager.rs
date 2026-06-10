/* ============================================================
   pty_manager.rs — HashMap of active PTY sessions
   ============================================================ */
use std::collections::HashMap;
use serde::Serialize;
use tauri::AppHandle;
use crate::terminal::session::PtySession;

#[derive(Serialize, Clone)]
pub struct SessionInfo {
    pub id: String,
    pub shell: String,
    pub cwd: String,
}

/// Manages all active PTY sessions.
pub struct PtyManager {
    sessions: HashMap<String, PtySession>,
}

impl PtyManager {
    pub fn new() -> Self {
        Self {
            sessions: HashMap::new(),
        }
    }

    /// Create a new PTY session. Returns the session id.
    pub fn create_session(
        &mut self,
        id: String,
        shell: Option<String>,
        cwd: String,
        app: AppHandle,
    ) -> Result<String, String> {
        if self.sessions.contains_key(&id) {
            return Err(format!("Session '{}' already exists", id));
        }
        let shell_path = shell.unwrap_or_else(PtySession::default_shell);
        let session = PtySession::spawn(id.clone(), shell_path, cwd, app)?;
        self.sessions.insert(id.clone(), session);
        Ok(id)
    }

    /// Write raw string bytes to a session.
    pub fn write_to_session(&self, id: &str, data: String) -> Result<(), String> {
        let session = self
            .sessions
            .get(id)
            .ok_or_else(|| format!("Session '{}' not found", id))?;
        session.write(data)
    }

    /// Write raw bytes to a session.
    pub fn write_bytes_to_session(&self, id: &str, data: Vec<u8>) -> Result<(), String> {
        let session = self
            .sessions
            .get(id)
            .ok_or_else(|| format!("Session '{}' not found", id))?;
        session.write_bytes(&data)
    }

    /// Resize a session's PTY.
    pub fn resize_session(&self, id: &str, cols: u16, rows: u16) -> Result<(), String> {
        let session = self
            .sessions
            .get(id)
            .ok_or_else(|| format!("Session '{}' not found", id))?;
        session.resize(cols, rows)
    }

    /// Kill (remove) a session.
    pub fn kill_session(&mut self, id: &str) -> Result<(), String> {
        self.sessions
            .remove(id)
            .ok_or_else(|| format!("Session '{}' not found", id))?;
        Ok(())
    }

    /// List all active sessions.
    pub fn list_sessions(&self) -> Vec<SessionInfo> {
        self.sessions
            .iter()
            .map(|(id, s)| SessionInfo {
                id: id.clone(),
                shell: s.shell.clone(),
                cwd: s.cwd.clone(),
            })
            .collect()
    }
}
