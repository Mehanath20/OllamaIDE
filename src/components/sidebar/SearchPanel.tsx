import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FileText } from "lucide-react";
import { useFileStore } from "../../store/fileStore";
import { useEditorStore } from "../../store/editorStore";
import { getLanguageFromExt } from "../../lib/fileIcons";

interface SearchResult {
  file: string;
  line: number;
  text: string;
}

export default function SearchPanel() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const { workspaceRoot } = useFileStore();
  const { openFile } = useEditorStore();

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query.trim() || !workspaceRoot) return;

    setIsSearching(true);
    setError(null);
    setResults([]);

    try {
      const res = await invoke<SearchResult[]>("search_files", {
        path: workspaceRoot,
        query: query.trim()
      });
      setResults(res);
    } catch (err: any) {
      setError(err.toString());
    } finally {
      setIsSearching(false);
    }
  };

  const handleResultClick = async (res: SearchResult) => {
    try {
      const fullPath = `${workspaceRoot}/${res.file}`;
      const content = await invoke<string>("read_file", { path: fullPath });
      const name = res.file.split(/[\\/]/).pop() || res.file;
      const ext = name.split(".").pop() || "";
      openFile({
        path: fullPath,
        name,
        content,
        language: getLanguageFromExt(ext),
        isDirty: false,
      });
    } catch (err) {
      console.error("Failed to open file:", err);
    }
  };

  return (
    <div className="search-panel">
      <div className="panel-header">SEARCH</div>
      
      <div className="search-input-container">
        <form onSubmit={handleSearch} className="search-form">
          <input
            type="text"
            className="search-input"
            placeholder="Search in workspace..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={!workspaceRoot}
          />
        </form>
      </div>

      <div className="search-results">
        {!workspaceRoot ? (
          <div className="search-empty">Open a folder to search</div>
        ) : isSearching ? (
          <div className="search-empty">Searching...</div>
        ) : error ? (
          <div className="search-empty error">{error}</div>
        ) : results.length > 0 ? (
          <div className="results-list">
            {results.map((res, i) => (
              <div key={i} className="search-result-item" onClick={() => handleResultClick(res)}>
                <div className="result-file">
                  <FileText size={12} />
                  <span className="truncate">{res.file}</span>
                  <span className="result-line">:{res.line}</span>
                </div>
                <div className="result-text truncate">{res.text}</div>
              </div>
            ))}
          </div>
        ) : query && (
          <div className="search-empty">No results found.</div>
        )}
      </div>

      <style>{`
        .search-panel {
          display: flex;
          flex-direction: column;
          height: 100%;
        }
        .panel-header {
          font-size: var(--text-xs);
          font-weight: 700;
          color: var(--text-muted);
          letter-spacing: 0.1em;
          padding: var(--space-3) var(--space-4);
          text-transform: uppercase;
        }
        .search-input-container {
          padding: 0 var(--space-3) var(--space-3) var(--space-3);
          border-bottom: 1px solid var(--border-soft);
        }
        .search-form {
          display: flex;
        }
        .search-input {
          width: 100%;
          background: var(--bg-2);
          border: 1px solid var(--border);
          color: var(--text-primary);
          padding: 6px 8px;
          border-radius: var(--radius-sm);
          font-size: var(--text-xs);
          outline: none;
        }
        .search-input:focus {
          border-color: var(--accent);
        }
        .search-results {
          flex: 1;
          overflow-y: auto;
        }
        .search-empty {
          padding: var(--space-4);
          text-align: center;
          color: var(--text-muted);
          font-size: var(--text-xs);
        }
        .search-empty.error {
          color: var(--error);
        }
        .results-list {
          display: flex;
          flex-direction: column;
        }
        .search-result-item {
          padding: var(--space-2) var(--space-3);
          cursor: pointer;
          border-bottom: 1px solid rgba(255,255,255,0.02);
        }
        .search-result-item:hover {
          background: var(--bg-2);
        }
        .result-file {
          display: flex;
          align-items: center;
          gap: 6px;
          color: var(--text-primary);
          font-size: var(--text-xs);
          margin-bottom: 2px;
        }
        .result-line {
          color: var(--text-muted);
        }
        .result-text {
          font-family: var(--font-mono);
          font-size: 10px;
          color: var(--text-muted);
          padding-left: 18px;
        }
      `}</style>
    </div>
  );
}
