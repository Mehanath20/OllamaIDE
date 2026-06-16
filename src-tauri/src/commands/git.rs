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
        .arg("-c")
        .arg("core.quotePath=false")
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
            let status = line[0..2].to_string();
            let file = line[3..].to_string();
            results.push(GitFileStatus { file, status });
        }
    }
    Ok(results)
}

#[tauri::command]
pub fn git_add(path: String, file: String) -> Result<(), String> {
    let output = Command::new("git")
        .current_dir(&path)
        .arg("add")
        .arg(&file)
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn git_reset(path: String, file: String) -> Result<(), String> {
    let output = Command::new("git")
        .current_dir(&path)
        .arg("reset")
        .arg("HEAD")
        .arg("--")
        .arg(&file)
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn git_commit(path: String, message: String) -> Result<(), String> {
    let output = Command::new("git")
        .current_dir(&path)
        .arg("commit")
        .arg("-m")
        .arg(&message)
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn git_init(path: String) -> Result<(), String> {
    let output = Command::new("git")
        .current_dir(&path)
        .arg("init")
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn git_config(path: String, name: String, email: String) -> Result<(), String> {
    let out_name = Command::new("git")
        .current_dir(&path)
        .arg("config")
        .arg("user.name")
        .arg(&name)
        .output()
        .map_err(|e| e.to_string())?;
    
    if !out_name.status.success() {
        return Err(String::from_utf8_lossy(&out_name.stderr).to_string());
    }

    let out_email = Command::new("git")
        .current_dir(&path)
        .arg("config")
        .arg("user.email")
        .arg(&email)
        .output()
        .map_err(|e| e.to_string())?;
    
    if !out_email.status.success() {
        return Err(String::from_utf8_lossy(&out_email.stderr).to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn git_push(path: String) -> Result<(), String> {
    let output = Command::new("git")
        .current_dir(&path)
        .arg("push")
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn git_pull(path: String) -> Result<(), String> {
    let output = Command::new("git")
        .current_dir(&path)
        .arg("pull")
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    Ok(())
}
