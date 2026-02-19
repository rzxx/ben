import { createContext, useContext } from "react";
import { useStore } from "zustand";
import type {
  ScannerRuntimeActions,
  ScannerRuntimeStore,
  ScannerRuntimeStoreState,
} from "./scannerRuntimeStore";

export const ScannerRuntimeStoreContext =
  createContext<ScannerRuntimeStore | null>(null);

export function useScannerRuntimeStoreSelector<T>(
  selector: (state: ScannerRuntimeStoreState) => T,
): T {
  const store = useScannerRuntimeStoreApi();
  return useStore(store, selector);
}

export function useScannerRuntimeActions(): ScannerRuntimeActions {
  return useScannerRuntimeStoreSelector((state) => state.actions);
}

export function useScannerNewRootPath(): string {
  return useScannerRuntimeStoreSelector((state) => state.newRootPath);
}

export function useScannerLastProgress() {
  return useScannerRuntimeStoreSelector((state) => state.lastProgress);
}

export function useScannerScanStatus() {
  return useScannerRuntimeStoreSelector((state) => state.scanStatus);
}

export function useScannerWatchedRoots() {
  return useScannerRuntimeStoreSelector((state) => state.watchedRoots);
}

export function useScannerIsRefreshing(): boolean {
  return useScannerRuntimeStoreSelector((state) => state.isRefreshing);
}

export function useScannerIsMutating(): boolean {
  return useScannerRuntimeStoreSelector((state) => state.isMutating);
}

export function useScannerErrorMessage(): string | null {
  return useScannerRuntimeStoreSelector((state) => state.errorMessage);
}

function useScannerRuntimeStoreApi(): ScannerRuntimeStore {
  const scannerRuntimeStore = useContext(ScannerRuntimeStoreContext);
  if (!scannerRuntimeStore) {
    throw new Error("Scanner runtime store is missing. Wrap with ScannerStoreProvider.");
  }

  return scannerRuntimeStore;
}
