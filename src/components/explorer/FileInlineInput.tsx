import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { File, Folder } from "lucide-react";
import { useFileStore } from "../../store/fileStore";

interface Props {
  parentPath: string | null;
  type: "file" | "folder";
  depth: number;
  onComplete: () => void;
  onCancel: () => void;
}

export default function FileInlineInput({ parentPath, type, depth, onComplete, onCancel }: Props) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const { workspaceRoot } = useFileStore();

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  const handleKeyDown = async (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onCancel();
      return;
    }

    if (e.key === "Enter") {
      if (!value.trim()) {
        onCancel();
        return;
      }

      const baseDir = parentPath || workspaceRoot;
      if (!baseDir) {
        onCancel();
        return;
      }

      const targetPath = `${baseDir}/${value.trim()}`;
      
      try {
        if (type === "file") {
          await invoke("create_file", { path: targetPath });
        } else {
          await invoke("create_dir", { path: targetPath });
        }
        onComplete();
      } catch (err) {
        console.error(`Failed to create ${type}:`, err);
        // You could show an error toast here
      }
    }
  };

  const indent = depth * 12;

  return (
    <div className="tree-item inline-input-wrapper" style={{ paddingLeft: `${8 + indent}px` }}>
      <span className="tree-chevron">
         <span style={{ width: 12 }} />
      </span>
      {type === "file" ? (
        <File size={13} className="file-icon file-icon--file" />
      ) : (
        <Folder size={14} className="file-icon file-icon--folder" />
      )}
      <input
        ref={inputRef}
        className="rename-input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={onCancel}
        onClick={(e) => e.stopPropagation()}
        placeholder={`New ${type}...`}
      />
      <style>{`
        .inline-input-wrapper {
          display: flex;
          align-items: center;
          gap: 4px;
          height: 22px;
        }
        .rename-input {
          flex: 1;
          background: var(--bg-3);
          border: 1px solid var(--accent);
          color: var(--text-primary);
          font-size: var(--text-sm);
          font-family: var(--font-ui);
          padding: 0 4px;
          outline: none;
          border-radius: var(--radius-sm);
          height: 18px;
        }
      `}</style>
    </div>
  );
}
