use serde::Serialize;
use std::process::Command;

#[derive(Debug, Serialize, Clone)]
pub struct GitFileStatus {
    pub file: String,
    pub status: String,
}

#[tauri::command]
pub fn git_status(path: String) -> Result<Vec<GitFileStatus>, String> {
    let output = Command::new("git")
        .current_dir(&path)
        .arg("status")
        .arg("--porcelain")
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut results = Vec::new();
    for line in stdout.lines() {
        if line.len() > 3 {
            let status = line[0..2].trim().to_string();
            let file = line[3..].to_string();
            results.push(GitFileStatus { file, status });
        }
    }
    Ok(results)
}
