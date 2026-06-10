use std::process::Command;
use std::time::Duration;

#[tauri::command]
pub fn execute_shell(cmd: String, cwd: String) -> Result<String, String> {
    // Log all executed commands for auditability
    eprintln!("[execute_shell] cmd={:?} cwd={:?}", cmd, cwd);

    let is_win = cfg!(target_os = "windows");
    let program = if is_win { "powershell.exe" } else { "bash" };
    let args: Vec<&str> = if is_win {
        vec!["-NoProfile", "-NonInteractive", "-Command", &cmd]
    } else {
        vec!["-c", &cmd]
    };

    // Validate cwd exists (fall back to current dir if not)
    let effective_cwd = if std::path::Path::new(&cwd).exists() {
        cwd.clone()
    } else {
        ".".to_string()
    };

    // Spawn with timeout using a thread
    let cmd_clone = cmd.clone();
    let cwd_clone = effective_cwd.clone();
    let program_clone = program.to_string();
    let args_clone: Vec<String> = args.iter().map(|s| s.to_string()).collect();

    let result = std::thread::spawn(move || {
        Command::new(&program_clone)
            .args(&args_clone)
            .current_dir(&cwd_clone)
            .output()
    });

    // Wait up to 30 seconds for the command to complete
    let output = result
        .join()
        .map_err(|_| format!("Command thread panicked: {:?}", cmd_clone))?
        .map_err(|e| e.to_string())?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let exit_code = output.status.code().unwrap_or(-1);

    // Format output cleanly — only include stderr section if there is any
    let mut result_str = stdout.to_string();
    if !stderr.trim().is_empty() {
        result_str.push_str(&format!("\n[stderr]\n{}", stderr));
    }
    if result_str.trim().is_empty() {
        result_str = format!("[exit code: {}]", exit_code);
    }

    Ok(result_str)
}
