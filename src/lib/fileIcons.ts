/* ============================================================
   fileIcons.ts — File extension → icon emoji & Monaco language ID
   ============================================================ */

const EXT_ICONS: Record<string, string> = {
  // Web
  html: "🌐", htm: "🌐",
  css: "🎨", scss: "🎨", sass: "🎨", less: "🎨",
  js: "🟨", jsx: "🟨",
  ts: "🔷", tsx: "🔷",
  json: "📋", jsonc: "📋",
  // Systems / Backend
  rs: "🦀",
  go: "🐹",
  py: "🐍",
  java: "☕",
  c: "⚙️", h: "⚙️",
  cpp: "⚙️", cc: "⚙️", cxx: "⚙️",
  cs: "🟣",
  php: "🐘",
  rb: "💎",
  swift: "🍎",
  kt: "🟠",
  // Config / Data
  toml: "⚙️", yaml: "📄", yml: "📄", xml: "📄", env: "🔑",
  // Docs
  md: "📝", mdx: "📝", txt: "📄",
  // Shell
  sh: "💲", bash: "💲", zsh: "💲", ps1: "💲",
  // Media
  png: "🖼️", jpg: "🖼️", jpeg: "🖼️", gif: "🖼️", svg: "🖼️", ico: "🖼️",
  webp: "🖼️",
  // Archive
  zip: "🗜️", tar: "🗜️", gz: "🗜️",
  // Other
  lock: "🔒", gitignore: "🙈",
};

const EXT_LANG: Record<string, string> = {
  js: "javascript",  jsx: "javascriptreact",
  ts: "typescript",  tsx: "typescriptreact",
  html: "html",      htm: "html",
  css: "css",        scss: "scss",   sass: "scss",  less: "less",
  json: "json",      jsonc: "jsonc",
  rs: "rust",
  go: "go",
  py: "python",
  java: "java",
  c: "c",            h: "c",
  cpp: "cpp",        cc: "cpp",     cxx: "cpp",
  cs: "csharp",
  php: "php",
  rb: "ruby",
  swift: "swift",
  kt: "kotlin",
  toml: "toml",
  yaml: "yaml",      yml: "yaml",
  xml: "xml",
  md: "markdown",    mdx: "markdown",
  sh: "shell",       bash: "shell", zsh: "shell",   ps1: "powershell",
  sql: "sql",
  dockerfile: "dockerfile",
};

export function getFileIcon(filename: string): string {
  const lower = filename.toLowerCase();
  // Special filenames
  if (lower === "dockerfile")          return "🐳";
  if (lower === ".gitignore")          return "🙈";
  if (lower === ".env" || lower.startsWith(".env.")) return "🔑";
  if (lower === "package.json")        return "📦";
  if (lower === "cargo.toml")          return "🦀";

  const ext = lower.split(".").pop() || "";
  return EXT_ICONS[ext] || "📄";
}

export function getLanguageFromExt(ext: string): string {
  return EXT_LANG[ext.toLowerCase()] || "plaintext";
}
