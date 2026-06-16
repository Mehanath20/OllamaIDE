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
        .manage(commands::dap::DapState::new())
        .manage(commands::ollama::OllamaState::new())
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
            commands::git::git_reset,
            commands::git::git_commit,
            commands::git::git_init,
            commands::git::git_config,
            commands::git::git_push,
            commands::git::git_pull,
            commands::git::git_clone,
            commands::git::git_fetch,
            commands::git::git_checkout,
            commands::git::git_branch_create,
            commands::git::git_branch_list,
            commands::git::git_merge,
            commands::git::git_stash,
            commands::git::git_log,
            commands::git::git_diff,
            commands::git::git_current_branch,
            commands::git::git_show_head,
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
            commands::ollama::start_ollama,
            commands::ollama::list_models,
            commands::ollama::pull_model,
            commands::ollama::cancel_pull_model,
            commands::ollama::delete_model,
            commands::ollama::chat_ollama,
            commands::ollama::generate_completion,
            // DAP
            commands::dap::start_debug_session,
            commands::dap::send_dap_message,
            commands::dap::stop_debug_session,
        ])
        .setup(|_app| {
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
