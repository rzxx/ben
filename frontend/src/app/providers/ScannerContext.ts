import { createContext, useContext } from "react";
import { ScanProgress, ScanStatus, WatchedRoot } from "../../features/types";

export type ScannerState = {
  watchedRoots: WatchedRoot[];
  newRootPath: string;
  scanStatus: ScanStatus;
  lastProgress: ScanProgress | null;
  errorMessage: string | null;
};

export type ScannerActions = {
  setNewRootPath: (value: string) => void;
  addWatchedRoot: (path: string) => Promise<void>;
  toggleWatchedRoot: (root: WatchedRoot) => Promise<void>;
  removeWatchedRoot: (id: number) => Promise<void>;
  runScan: () => Promise<void>;
  ensureWatchedRootsLoaded: () => Promise<void>;
  clearError: () => void;
};

export type ScannerMeta = {
  scanCompletionCount: number;
  hasLoadedWatchedRoots: boolean;
};

export type ScannerContextValue = {
  state: ScannerState;
  actions: ScannerActions;
  meta: ScannerMeta;
};

export const ScannerContext = createContext<ScannerContextValue | null>(null);

export function useScanner(): ScannerContextValue {
  const contextValue = useContext(ScannerContext);
  if (!contextValue) {
    throw new Error("useScanner must be used within ScannerProvider");
  }

  return contextValue;
}
