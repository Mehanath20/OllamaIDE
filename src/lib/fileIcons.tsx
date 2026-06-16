import React from "react";
import {
  SiTypescript,
  SiJavascript,
  SiHtml5,
  SiCss,
  SiPython,
  SiRust,
  SiGo,
  SiCplusplus,
  SiC,
  SiPhp,
  SiRuby,
  SiSwift,
  SiKotlin,
  SiJson,
  SiYaml,
  SiXml,
  SiMarkdown,
  SiGnubash,
  SiDocker,
  SiGit,
  SiReact,
  SiSass,
  SiLess,
} from "react-icons/si";
import { FaJava } from "react-icons/fa";
import { TbBrandCSharp } from "react-icons/tb";
import {
  VscFile,
  VscFileMedia,
  VscFileZip,
  VscLock,
  VscSettingsGear,
} from "react-icons/vsc";

const iconSize = 14;

// Default file icon
const DefaultIcon = <VscFile size={iconSize} color="#8a93a5" />;

const EXT_ICONS: Record<string, React.ReactNode> = {
  // Web
  html: <SiHtml5 size={iconSize} color="#E34F26" />,
  htm: <SiHtml5 size={iconSize} color="#E34F26" />,
  css: <SiCss size={iconSize} color="#1572B6" />,
  scss: <SiSass size={iconSize} color="#CC6699" />,
  sass: <SiSass size={iconSize} color="#CC6699" />,
  less: <SiLess size={iconSize} color="#1D365D" />,
  js: <SiJavascript size={iconSize} color="#F7DF1E" />,
  jsx: <SiReact size={iconSize} color="#61DAFB" />,
  ts: <SiTypescript size={iconSize} color="#3178C6" />,
  tsx: <SiReact size={iconSize} color="#61DAFB" />,
  json: <SiJson size={iconSize} color="#CBCB41" />,
  jsonc: <SiJson size={iconSize} color="#CBCB41" />,
  // Systems / Backend
  rs: <SiRust size={iconSize} color="#DEA584" />,
  go: <SiGo size={iconSize} color="#00ADD8" />,
  py: <SiPython size={iconSize} color="#3776AB" />,
  java: <FaJava size={iconSize} color="#007396" />,
  c: <SiC size={iconSize} color="#A8B9CC" />,
  h: <SiC size={iconSize} color="#A8B9CC" />,
  cpp: <SiCplusplus size={iconSize} color="#00599C" />,
  cc: <SiCplusplus size={iconSize} color="#00599C" />,
  cxx: <SiCplusplus size={iconSize} color="#00599C" />,
  cs: <TbBrandCSharp size={iconSize} color="#239120" />,
  php: <SiPhp size={iconSize} color="#777BB4" />,
  rb: <SiRuby size={iconSize} color="#CC342D" />,
  swift: <SiSwift size={iconSize} color="#F05138" />,
  kt: <SiKotlin size={iconSize} color="#0095D5" />,
  // Config / Data
  toml: <VscSettingsGear size={iconSize} color="#8a93a5" />,
  yaml: <SiYaml size={iconSize} color="#CB171E" />,
  yml: <SiYaml size={iconSize} color="#CB171E" />,
  xml: <SiXml size={iconSize} color="#00609C" />,
  env: <VscSettingsGear size={iconSize} color="#f0e93a" />,
  // Docs
  md: <SiMarkdown size={iconSize} color="#000000" style={{ filter: "invert(1)" }} />,
  mdx: <SiMarkdown size={iconSize} color="#000000" style={{ filter: "invert(1)" }} />,
  txt: <VscFile size={iconSize} color="#8a93a5" />,
  // Shell
  sh: <SiGnubash size={iconSize} color="#4EAA25" />,
  bash: <SiGnubash size={iconSize} color="#4EAA25" />,
  zsh: <SiGnubash size={iconSize} color="#4EAA25" />,
  ps1: <VscSettingsGear size={iconSize} color="#012456" />,
  // Media
  png: <VscFileMedia size={iconSize} color="#a0b885" />,
  jpg: <VscFileMedia size={iconSize} color="#a0b885" />,
  jpeg: <VscFileMedia size={iconSize} color="#a0b885" />,
  gif: <VscFileMedia size={iconSize} color="#a0b885" />,
  svg: <VscFileMedia size={iconSize} color="#a0b885" />,
  ico: <VscFileMedia size={iconSize} color="#a0b885" />,
  webp: <VscFileMedia size={iconSize} color="#a0b885" />,
  // Archive
  zip: <VscFileZip size={iconSize} color="#8a93a5" />,
  tar: <VscFileZip size={iconSize} color="#8a93a5" />,
  gz: <VscFileZip size={iconSize} color="#8a93a5" />,
  // Other
  lock: <VscLock size={iconSize} color="#cf9932" />,
  gitignore: <SiGit size={iconSize} color="#F05032" />,
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

export function getFileIcon(filename: string): React.ReactNode {
  const lower = filename.toLowerCase();
  // Special filenames
  if (lower === "dockerfile")          return <SiDocker size={iconSize} color="#2496ED" />;
  if (lower === ".gitignore")          return <SiGit size={iconSize} color="#F05032" />;
  if (lower === ".env" || lower.startsWith(".env.")) return <VscSettingsGear size={iconSize} color="#f0e93a" />;
  if (lower === "package.json")        return <SiJson size={iconSize} color="#CB3837" />; // npm-like red/json
  if (lower === "cargo.toml")          return <SiRust size={iconSize} color="#DEA584" />;

  const ext = lower.split(".").pop() || "";
  return EXT_ICONS[ext] || DefaultIcon;
}

export function getLanguageFromExt(ext: string): string {
  return EXT_LANG[ext.toLowerCase()] || "plaintext";
}
