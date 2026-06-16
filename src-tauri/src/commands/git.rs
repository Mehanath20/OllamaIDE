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

#[tauri::command]
pub fn git_clone(path: String, url: String) -> Result<(), String> {
    let output = Command::new("git")
        .current_dir(&path)
        .arg("clone")
        .arg(&url)
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn git_fetch(path: String) -> Result<(), String> {
    let output = Command::new("git")
        .current_dir(&path)
        .arg("fetch")
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn git_checkout(path: String, branch: String) -> Result<(), String> {
    let output = Command::new("git")
        .current_dir(&path)
        .arg("checkout")
        .arg(&branch)
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn git_branch_create(path: String, branch: String) -> Result<(), String> {
    let output = Command::new("git")
        .current_dir(&path)
        .arg("branch")
        .arg(&branch)
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn git_branch_list(path: String) -> Result<Vec<String>, String> {
    let output = Command::new("git")
        .current_dir(&path)
        .arg("branch")
        .arg("--all")
        .arg("--format=%(refname:short)")
        .output()
        .map_err(|e| e.to_string())?;
    
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    
    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut branches = Vec::new();
    for line in stdout.lines() {
        let trimmed = line.trim();
        if !trimmed.is_empty() {
            branches.push(trimmed.to_string());
        }
    }
    Ok(branches)
}

#[tauri::command]
pub fn git_merge(path: String, branch: String) -> Result<(), String> {
    let output = Command::new("git")
        .current_dir(&path)
        .arg("merge")
        .arg(&branch)
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn git_stash(path: String, action: String) -> Result<(), String> {
    let output = Command::new("git")
        .current_dir(&path)
        .arg("stash")
        .arg(&action)
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    Ok(())
}

#[derive(Debug, Serialize, Clone)]
pub struct GitCommitInfo {
    pub hash: String,
    pub author: String,
    pub date: String,
    pub message: String,
}

#[tauri::command]
pub fn git_log(path: String, limit: u32) -> Result<Vec<GitCommitInfo>, String> {
    let output = Command::new("git")
        .current_dir(&path)
        .arg("log")
        .arg(format!("-n{}", limit))
        .arg("--pretty=format:%H|%an|%ad|%s")
        .arg("--date=short")
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut commits = Vec::new();
    for line in stdout.lines() {
        let parts: Vec<&str> = line.splitn(4, '|').collect();
        if parts.len() == 4 {
            commits.push(GitCommitInfo {
                hash: parts[0].to_string(),
                author: parts[1].to_string(),
                date: parts[2].to_string(),
                message: parts[3].to_string(),
            });
        }
    }
    Ok(commits)
}

#[tauri::command]
pub fn git_diff(path: String, file: String) -> Result<String, String> {
    let mut output = Command::new("git")
        .current_dir(&path)
        .arg("diff")
        .arg("HEAD")
        .arg("--")
        .arg(&file)
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[tauri::command]
pub fn git_current_branch(path: String) -> Result<String, String> {
    let output = Command::new("git")
        .current_dir(&path)
        .arg("branch")
        .arg("--show-current")
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

#[tauri::command]
pub fn git_show_head(path: String, file: String) -> Result<String, String> {
    let output = Command::new("git")
        .current_dir(&path)
        .arg("show")
        .arg(format!("HEAD:{}", file))
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        // If file doesn't exist at HEAD (new file), return empty string
        return Ok("".to_string());
    }
    
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}
