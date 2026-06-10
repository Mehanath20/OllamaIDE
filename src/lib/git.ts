// git.ts — Git integration utilities
// Currently provides status queries via the Rust backend.
import { invoke } from "@tauri-apps/api/core";

export interface GitStatus {
  modified: string[];
  staged: string[];
  untracked: string[];
  branch: string;
}

export async function getGitStatus(path: string): Promise<GitStatus> {
  return invoke<GitStatus>("git_status", { path });
}
