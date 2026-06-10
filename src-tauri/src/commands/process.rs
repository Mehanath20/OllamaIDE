use std::process::Command;

#[tauri::command]
pub fn execute_shell(cmd: String, cwd: String) -> Result<String, String> {
    let is_win = cfg!(target_os = "windows");
    let program = if is_win { "powershell.exe" } else { "bash" };
    let args = if is_win { vec!["-Command", &cmd] } else { vec!["-c", &cmd] };

    let output = Command::new(program)
        .args(args)
        .current_dir(&cwd)
        .output()
        .map_err(|e| e.to_string())?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    Ok(format!("STDOUT:\n{}\nSTDERR:\n{}", stdout, stderr))
}
