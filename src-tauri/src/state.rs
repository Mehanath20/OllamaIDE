use std::sync::Mutex;
use crate::terminal::pty_manager::PtyManager;

/// Global application state, wrapped in Mutex for thread-safe access via Tauri's `State`.
pub struct AppState {
    pub pty_manager: Mutex<PtyManager>,
    /// Holds the active file watcher so it stays alive for the app lifetime
    pub watcher: Mutex<Option<notify::RecommendedWatcher>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            pty_manager: Mutex::new(PtyManager::new()),
            watcher: Mutex::new(None),
        }
    }
}
