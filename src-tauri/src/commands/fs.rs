use std::fs;
use std::path::Path;
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};
use notify::{Watcher, RecursiveMode, recommended_watcher, Event};
use crate::state::AppState;

#[derive(Debug, Serialize, Clone)]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: Option<u64>,
}

#[derive(Debug, Serialize, Clone)]
pub struct FileChangedPayload {
    pub kind: String,
    pub paths: Vec<String>,
}

#[tauri::command]
pub fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_file(path: String, content: String) -> Result<(), String> {
    if let Some(parent) = Path::new(&path).parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_file(path: String) -> Result<(), String> {
    if let Some(parent) = Path::new(&path).parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::File::create(&path).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn create_dir(path: String) -> Result<(), String> {
    fs::create_dir_all(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_dir(path: String) -> Result<Vec<DirEntry>, String> {
    let entries = fs::read_dir(&path).map_err(|e| e.to_string())?;
    let mut result = Vec::new();

    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let metadata = entry.metadata().map_err(|e| e.to_string())?;
        result.push(DirEntry {
            name: entry.file_name().to_string_lossy().to_string(),
            path: entry.path().to_string_lossy().replace('\\', "/").to_string(),
            is_dir: metadata.is_dir(),
            size: if metadata.is_file() { Some(metadata.len()) } else { None },
        });
    }

    // Sort: directories first, then files, both alphabetically
    result.sort_by(|a, b| {
        b.is_dir.cmp(&a.is_dir).then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(result)
}

#[tauri::command]
pub fn rename_path(old_path: String, new_path: String) -> Result<(), String> {
    fs::rename(&old_path, &new_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_path(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if p.is_dir() {
        fs::remove_dir_all(p).map_err(|e| e.to_string())
    } else {
        fs::remove_file(p).map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn watch_directory(
    state: State<'_, AppState>,
    path: String,
    app: AppHandle,
) -> Result<(), String> {
    let watcher = recommended_watcher(move |result: notify::Result<Event>| {
        if let Ok(event) = result {
            let kind = format!("{:?}", event.kind);
            let paths: Vec<String> = event
                .paths
                .iter()
                .map(|p| p.to_string_lossy().replace('\\', "/").to_string())
                .collect();
            let _ = app.emit("file-changed", FileChangedPayload { kind, paths });
        }
    })
    .map_err(|e| e.to_string())?;

    let mut watcher = watcher;
    watcher
        .watch(Path::new(&path), RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;

    // Store in AppState so it lives for the app's duration
    let mut guard = state.watcher.lock().map_err(|e| e.to_string())?;
    *guard = Some(watcher);

    Ok(())
}

#[derive(Debug, Serialize, Clone)]
pub struct SearchResult {
    pub file: String,
    pub line: usize,
    pub text: String,
}

#[tauri::command]
pub fn search_files(path: String, query: String) -> Result<Vec<SearchResult>, String> {
    let mut results = Vec::new();
    let q = query.to_lowercase();
    
    fn search_dir(dir: &Path, q: &str, results: &mut Vec<SearchResult>, base_path: &Path) {
        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    if let Some(name) = path.file_name() {
                        let name_str = name.to_string_lossy();
                        if name_str == "node_modules" || name_str == "target" || name_str == ".git" {
                            continue;
                        }
                    }
                    search_dir(&path, q, results, base_path);
                } else {
                    if let Ok(content) = fs::read_to_string(&path) {
                        for (i, line) in content.lines().enumerate() {
                            if line.to_lowercase().contains(q) {
                                let rel_path = path.strip_prefix(base_path).unwrap_or(&path).to_string_lossy().replace('\\', "/");
                                results.push(SearchResult {
                                    file: rel_path.to_string(),
                                    line: i + 1,
                                    text: line.trim().to_string(),
                                });
                                // Limit results per file to avoid huge payloads
                                if results.len() > 200 {
                                    return;
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    search_dir(Path::new(&path), &q, &mut results, Path::new(&path));
    Ok(results)
}
