import { create } from "zustand";

export interface ExtensionState {
  activeWorkers: Map<string, Worker>;
  registerWorker: (id: string, worker: Worker) => void;
  terminateWorker: (id: string) => void;
  terminateAll: () => void;
}

export const useExtensionStore = create<ExtensionState>((set, get) => ({
  activeWorkers: new Map(),
  
  registerWorker: (id, worker) => {
    set((state) => {
      const newMap = new Map(state.activeWorkers);
      newMap.set(id, worker);
      return { activeWorkers: newMap };
    });
  },

  terminateWorker: (id) => {
    const worker = get().activeWorkers.get(id);
    if (worker) {
      worker.terminate();
    }
    set((state) => {
      const newMap = new Map(state.activeWorkers);
      newMap.delete(id);
      return { activeWorkers: newMap };
    });
  },

  terminateAll: () => {
    get().activeWorkers.forEach(worker => worker.terminate());
    set({ activeWorkers: new Map() });
  }
}));
