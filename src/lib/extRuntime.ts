import { useExtensionStore } from "../store/useExtensionStore";
import { useUIStore } from "../store/uiStore";

// The sandbox template code that runs INSIDE the Web Worker
const WORKER_TEMPLATE = `
  const anti = {
    commands: {
      registerCommand: (commandId, callback) => {
        // We register it locally, and also inform the main thread
        self.postMessage({ type: 'REGISTER_COMMAND', commandId });
        self.__commands = self.__commands || {};
        self.__commands[commandId] = callback;
      }
    },
    window: {
      showInformationMessage: (message) => {
        self.postMessage({ type: 'SHOW_INFO', message });
      },
      showErrorMessage: (message) => {
        self.postMessage({ type: 'SHOW_ERROR', message });
      }
    }
  };

  // Provide module.exports for commonjs extensions
  const module = { exports: {} };
  const exports = module.exports;

  // Listen for command execution from main thread
  self.addEventListener('message', async (e) => {
    const data = e.data;
    if (data.type === 'EXECUTE_COMMAND') {
      const fn = self.__commands && self.__commands[data.commandId];
      if (fn) {
        try {
          await fn(...(data.args || []));
        } catch(err) {
          self.postMessage({ type: 'SHOW_ERROR', message: 'Command failed: ' + err.message });
        }
      }
    } else if (data.type === 'EVAL_CODE') {
      try {
        const run = new Function('anti', 'module', 'exports', data.code);
        run(anti, module, exports);
        
        // If extension exposes an activate function, call it
        if (typeof module.exports.activate === 'function') {
          module.exports.activate({ subscriptions: [] });
        } else if (typeof self.activate === 'function') {
          self.activate({ subscriptions: [] });
        }
        
      } catch (err) {
        self.postMessage({ type: 'SHOW_ERROR', message: 'Extension failed to load: ' + err.message });
      }
    }
  });
`;

export function launchExtension(extId: string, extCode: string) {
  const store = useExtensionStore.getState();
  
  // Terminate old worker if restarting
  if (store.activeWorkers.has(extId)) {
    store.terminateWorker(extId);
  }

  // Create a Blob with the sandbox template
  const blob = new Blob([WORKER_TEMPLATE], { type: 'application/javascript' });
  const workerUrl = URL.createObjectURL(blob);
  
  const worker = new Worker(workerUrl);

  worker.onmessage = (e) => {
    const data = e.data;
    if (data.type === 'REGISTER_COMMAND') {
      // Register in UI Store so CommandPalette can see it
      useUIStore.getState().registerExtensionCommand(data.commandId, (...args: any[]) => {
        worker.postMessage({ type: 'EXECUTE_COMMAND', commandId: data.commandId, args });
      });
    } else if (data.type === 'SHOW_INFO') {
      alert(`[Extension: ${extId}] ${data.message}`);
    } else if (data.type === 'SHOW_ERROR') {
      console.error(`[Extension: ${extId}] ${data.message}`);
    }
  };

  worker.onerror = (e) => {
    console.error(`Worker error in extension ${extId}:`, e);
  };

  // Start the extension by sending its code
  worker.postMessage({ type: 'EVAL_CODE', code: extCode });

  // Store it
  store.registerWorker(extId, worker);
}
