/* ============================================================
   InlineSuggest.tsx — Monaco Copilot-Style Ghost Text Provider.
   Debounces completions by 400ms, calls local Ollama's fast
   generate API, and renders ghost text accepted via Tab.
   ============================================================ */
import { useEffect } from "react";
import { useMonaco } from "@monaco-editor/react";
import { generateCompletion } from "../../lib/ollama";
import { useAIStore } from "../../store/aiStore";

export function useInlineCompletions() {
  const monaco = useMonaco();

  useEffect(() => {
    if (!monaco) return;

    // Register completions provider for all languages
    const provider = monaco.languages.registerInlineCompletionsProvider(
      { pattern: "**/*" },
      {
        provideInlineCompletions: async (model, position, _context, token) => {
          const isOnline = useAIStore.getState().ollamaOnline;
          if (!isOnline) return { items: [] };

          const completionModel = useAIStore.getState().completionModel;
          if (!completionModel) return { items: [] };

          // Debounce by 400ms
          await new Promise((resolve) => setTimeout(resolve, 400));
          if (token.isCancellationRequested) {
            return { items: [] };
          }

          const lineNumber = position.lineNumber;
          const column = position.column;

          // Extract prefix and suffix around the cursor
          const value = model.getValue();
          const lines = value.split("\n");

          const startLine = Math.max(0, lineNumber - 15);
          const prefixLines = lines.slice(startLine, lineNumber - 1);
          const currentLine = lines[lineNumber - 1] || "";
          const prefix = prefixLines.join("\n") + "\n" + currentLine.slice(0, column - 1);

          const endLine = Math.min(lines.length, lineNumber + 10);
          const suffixLines = lines.slice(lineNumber, endLine);
          const suffix = currentLine.slice(column - 1) + "\n" + suffixLines.join("\n");

          // Standard Qwen2.5-Coder FIM (Fill-in-the-Middle) template
          // <fim_prefix>pre<fim_suffix>suf<fim_middle>
          let prompt = "";
          const isQwen = completionModel.toLowerCase().includes("qwen");
          if (isQwen) {
            prompt = `<fim_prefix>${prefix}<fim_suffix>${suffix}<fim_middle>`;
          } else {
            prompt = prefix;
          }

          try {
            const completion = await generateCompletion(completionModel, prompt);
            if (!completion || completion.trim() === "" || token.isCancellationRequested) {
              return { items: [] };
            }

            // Strip prefix/suffix tokens if LLM echoed them
            let cleanText = completion;
            if (isQwen) {
              cleanText = cleanText
                .replace("<fim_middle>", "")
                .replace("<fim_suffix>", "")
                .replace("<fim_prefix>", "");
            }

            return {
              items: [
                {
                  insertText: cleanText,
                  range: new monaco.Range(lineNumber, column, lineNumber, column),
                },
              ],
            };
          } catch (err) {
            console.error("Failed to fetch inline completions:", err);
            return { items: [] };
          }
        },
        disposeInlineCompletions: () => {},
      }
    );

    return () => {
      provider.dispose();
    };
  }, [monaco]);
}
