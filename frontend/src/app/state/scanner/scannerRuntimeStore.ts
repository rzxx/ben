import { createStore, type StoreApi } from "zustand/vanilla";
import type { ScanProgress } from "../../../features/types";

export type ScannerRuntimeActions = {
  setNewRootPath: (value: string) => void;
  applyProgress: (progress: ScanProgress) => void;
  setErrorMessage: (message: string | null) => void;
  clearErrorMessage: () => void;
};

export type ScannerRuntimeStoreState = {
  newRootPath: string;
  lastProgress: ScanProgress | null;
  errorMessage: string | null;
  actions: ScannerRuntimeActions;
};

export type ScannerRuntimeStore = StoreApi<ScannerRuntimeStoreState>;

export function createScannerRuntimeStore(): ScannerRuntimeStore {
  return createStore<ScannerRuntimeStoreState>((set) => {
    const actions: ScannerRuntimeActions = {
      setNewRootPath: (value) => {
        set({ newRootPath: value });
      },
      applyProgress: (progress) => {
        set({
          lastProgress: progress,
        });
      },
      setErrorMessage: (message) => {
        set({ errorMessage: message });
      },
      clearErrorMessage: () => {
        set({ errorMessage: null });
      },
    };

    return {
      newRootPath: "",
      lastProgress: null,
      errorMessage: null,
      actions,
    };
  });
}
