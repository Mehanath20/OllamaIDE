/* ============================================================
   session.rs — A single PTY session
   Uses portable-pty for a genuine pseudo-terminal.

   Windows note: portable-pty 0.8 uses ConPTY on Windows 10 1809+.
   The master is kept alive (behind Arc<Mutex>) so we can resize.

   Emits Tauri events:
     "terminal-output" → { session_id: String, data: String }
     "terminal-exited" → { session_id: String, exit_code: i32 }
   ============================================================ */
use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize, PtyPair, SlavePty};
use serde::Serialize;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{AppHandle, Emitter};

#[derive(Serialize, Clone)]
pub struct TerminalOutputPayload {
    pub session_id: String,
    pub data: String,
}

#[derive(Serialize, Clone)]
pub struct TerminalExitedPayload {
    pub session_id: String,
    pub exit_code: i32,
}

/// A single live PTY session.
pub struct PtySession {
    pub shell: String,
    pub cwd: String,
    /// Kept alive so we can call resize()
    master: Arc<Mutex<Box<dyn MasterPty + Send>>>,
    /// Write half of the PTY (keyboard input)
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    /// Kept alive to prevent the channel / PTY session from closing prematurely on Windows
    _slave: Box<dyn SlavePty + Send>,
}

impl PtySession {
    pub fn spawn(
        id: String,
        shell: String,
        cwd: String,
        app: AppHandle,
    ) -> Result<Self, String> {
        let pty_system = native_pty_system();

        // Open a PTY pair at a sensible initial size
        let pair = pty_system
            .openpty(PtySize {
                rows: 24,
                cols: 220,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())?;

        let PtyPair { master, slave } = pair;

        // Build the shell command
        let mut cmd = CommandBuilder::new(&shell);
        cmd.cwd(&cwd);

        // Spawn the child process inside the slave side of the PTY
        let mut child = slave
            .spawn_command(cmd)
            .map_err(|e| e.to_string())?;

        // NOTE: take_writer() and try_clone_reader() MUST be called before
        // wrapping master — each call moves out of master internally.
        let writer = master.take_writer().map_err(|e| e.to_string())?;
        let mut reader = master.try_clone_reader().map_err(|e| e.to_string())?;

        // Now wrap the master for resize calls
        let master_box: Box<dyn MasterPty + Send> = master;
        let master_arc = Arc::new(Mutex::new(master_box));

        // ── Background reader thread ─────────────────────────
        // Reads PTY output bytes and emits them as Tauri events.
        let app_reader = app.clone();
        let id_reader  = id.clone();
        thread::spawn(move || {
            let mut buf = [0u8; 4096];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break, // EOF — process exited
                    Ok(n) => {
                        // Use lossy UTF-8 conversion so ANSI escapes pass through intact
                        let data = String::from_utf8_lossy(&buf[..n]).into_owned();
                        let _ = app_reader.emit(
                            "terminal-output",
                            TerminalOutputPayload {
                                session_id: id_reader.clone(),
                                data,
                            },
                        );
                    }
                    Err(_) => break,
                }
            }

            // Collect exit code after EOF
            let exit_code = child.wait()
                .map(|s| if s.success() { 0i32 } else { 1i32 })
                .unwrap_or(-1i32);

            let _ = app.emit(
                "terminal-exited",
                TerminalExitedPayload {
                    session_id: id_reader,
                    exit_code,
                },
            );
        });

        Ok(Self {
            shell,
            cwd,
            master: master_arc,
            writer: Arc::new(Mutex::new(writer)),
            _slave: slave,
        })
    }

    // ── Write raw bytes to the PTY (keyboard input / paste) ─
    pub fn write_bytes(&self, data: &[u8]) -> Result<(), String> {
        let mut w = self.writer.lock().map_err(|e| e.to_string())?;
        w.write_all(data).map_err(|e| e.to_string())?;
        w.flush().map_err(|e| e.to_string())
    }

    // ── Legacy: write UTF-8 string ───────────────────────────
    pub fn write(&self, data: String) -> Result<(), String> {
        self.write_bytes(data.as_bytes())
    }

    // ── Resize the PTY (SIGWINCH equivalent) ─────────────────
    pub fn resize(&self, cols: u16, rows: u16) -> Result<(), String> {
        let master = self.master.lock().map_err(|e| e.to_string())?;
        master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())
    }

    // ── Detect the platform default shell ────────────────────
    pub fn default_shell() -> String {
        #[cfg(target_os = "windows")]
        {
            // Prefer PowerShell 7 (pwsh) if installed, else fall back to
            // the inbox Windows PowerShell 5.1
            let pwsh = "C:\\Program Files\\PowerShell\\7\\pwsh.exe";
            if std::path::Path::new(pwsh).exists() {
                return pwsh.to_string();
            }
            "powershell.exe".to_string()
        }
        #[cfg(not(target_os = "windows"))]
        {
            std::env::var("SHELL").unwrap_or_else(|_| "bash".to_string())
        }
    }
}
