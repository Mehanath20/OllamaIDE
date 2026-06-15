use tauri::Manager;
use crate::state::AppState;

mod state;
mod commands;
mod terminal;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            // Filesystem
            commands::fs::read_file,
            commands::fs::write_file,
            commands::fs::create_file,
            commands::fs::create_dir,
            commands::fs::list_dir,
            commands::fs::rename_path,
            commands::fs::delete_path,
            commands::fs::watch_directory,
            commands::fs::search_files,
            commands::fs::search_extensions,
            commands::fs::download_extension,
            commands::git::git_status,
            commands::git::git_add,
            commands::git::git_commit,
            commands::git::git_init,
            commands::git::git_config,
            commands::git::git_push,
            commands::git::git_pull,
            commands::process::execute_shell,
            // Terminal — Phase 3 (new API)
            commands::terminal::create_terminal,
            commands::terminal::write_to_terminal,
            commands::terminal::resize_terminal,
            commands::terminal::kill_terminal,
            commands::terminal::list_terminals,
            // Terminal — Phase 2 (backward compat)
            commands::terminal::create_pty,
            commands::terminal::write_to_pty,
            commands::terminal::kill_pty,
            // AI
            commands::ollama::check_ollama_health,
            commands::ollama::list_models,
            commands::ollama::start_ollama,
            commands::ollama::pull_model,
            commands::ollama::chat_ollama,
            commands::ollama::generate_completion,
        ])
        .setup(|_app| {
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
