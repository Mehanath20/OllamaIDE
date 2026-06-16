import { useState, useEffect, useRef, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Search, GitBranch, Plus } from "lucide-react";
import { useUIStore } from "../../store/uiStore";
import { useFileStore } from "../../store/fileStore";

export default function BranchSelector() {
  const { branchSelectorOpen, setBranchSelectorOpen } = useUIStore() as any;
  const { workspaceRoot, gitRefreshTrigger, triggerGitRefresh } = useFileStore();
  const [query, setQuery] = useState("");
  const [branches, setBranches] = useState<string[]>([]);
  const [currentBranch, setCurrentBranch] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (branchSelectorOpen && workspaceRoot) {
      fetchBranches();
      inputRef.current?.focus();
      setQuery("");
      setSelectedIdx(0);
    }
  }, [branchSelectorOpen, workspaceRoot, gitRefreshTrigger]);

  const fetchBranches = async () => {
    if (!workspaceRoot) return;
    try {
      const list = await invoke<string[]>("git_branch_list", { path: workspaceRoot });
      setBranches(list);
      const current = await invoke<string>("git_current_branch", { path: workspaceRoot });
      setCurrentBranch(current);
    } catch (err) {
      console.error("Failed to fetch branches:", err);
    }
  };

  const close = () => {
    setBranchSelectorOpen(false);
  };

  const filteredBranches = useMemo(() => {
    if (!query) return branches;
    const q = query.toLowerCase();
    return branches.filter((b) => b.toLowerCase().includes(q));
  }, [branches, query]);

  const showCreateOption = query.trim() !== "" && !branches.includes(query.trim());

  const items = showCreateOption 
    ? [...filteredBranches, { type: "create", label: `Create branch '${query.trim()}'`, name: query.trim() }]
    : filteredBranches;

  useEffect(() => {
    setSelectedIdx(0);
  }, [query]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      executeItem(items[selectedIdx]);
    } else if (e.key === "Escape") {
      close();
    }
  };

  const executeItem = async (item: any) => {
    if (!item || !workspaceRoot) return;
    
    try {
      if (typeof item === "string") {
        // Switch branch
        await invoke("git_checkout", { path: workspaceRoot, branch: item });
      } else if (item.type === "create") {
        // Create and switch branch
        await invoke("git_branch_create", { path: workspaceRoot, branch: item.name });
        await invoke("git_checkout", { path: workspaceRoot, branch: item.name });
      }
      triggerGitRefresh();
      close();
    } catch (err: any) {
      alert("Git Error: " + err);
    }
  };

  if (!branchSelectorOpen) return null;

  return (
    <div className="palette-overlay" onClick={close}>
      <div className="palette" onClick={(e) => e.stopPropagation()}>
        {/* Input */}
        <div className="palette-input-row">
          <Search size={16} className="palette-search-icon" />
          <input
            ref={inputRef}
            className="palette-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Search branches or type a new branch name..."
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="palette-esc">Esc</kbd>
        </div>

        {/* Results */}
        <div className="palette-results">
          {items.length === 0 ? (
            <div className="palette-empty">No branches found</div>
          ) : (
            items.map((item: any, i: number) => {
              const isCreate = typeof item !== "string";
              const label = isCreate ? item.label : item;
              const isCurrent = typeof item === "string" && item === currentBranch;

              return (
                <div
                  key={isCreate ? "create" : item}
                  className={`palette-item ${i === selectedIdx ? "palette-item--selected" : ""}`}
                  onClick={() => executeItem(item)}
                  onMouseEnter={() => setSelectedIdx(i)}
                >
                  <span className="palette-item-icon">
                    {isCreate ? <Plus size={14} /> : <GitBranch size={14} />}
                  </span>
                  <span className="palette-item-label" style={{ fontWeight: isCurrent ? 600 : 400 }}>
                    {label} {isCurrent && "(current)"}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
      <style>{`
        /* Inherit .palette* styles from CommandPalette where possible, or redefine */
      `}</style>
    </div>
  );
}
