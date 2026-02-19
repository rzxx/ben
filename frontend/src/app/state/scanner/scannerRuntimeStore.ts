import { createStore, type StoreApi } from "zustand/vanilla";
import type { ScanProgress, ScanStatus, WatchedRoot } from "../../../features/types";
import { toDomainErrorMessage } from "../../services/domainError";
import {
  addWatchedRoot,
  getScannerStatus,
  listWatchedRoots,
  removeWatchedRoot,
  setWatchedRootEnabled,
  triggerScan,
} from "../../services/gateway/scannerGateway";

export type ScannerRuntimeActions = {
  hydrateFromStartup: (scanStatus: ScanStatus) => void;
  refreshScannerState: () => Promise<void>;
  refreshStatus: () => Promise<void>;
  refreshWatchedRoots: () => Promise<void>;
  addWatchedRoot: (path: string) => Promise<void>;
  setWatchedRootEnabled: (id: number, enabled: boolean) => Promise<void>;
  removeWatchedRoot: (id: number) => Promise<void>;
  runScan: () => Promise<void>;
  setNewRootPath: (value: string) => void;
  applyProgress: (progress: ScanProgress) => void;
  setErrorMessage: (message: string | null) => void;
  clearErrorMessage: () => void;
};

export type ScannerRuntimeStoreState = {
  newRootPath: string;
  lastProgress: ScanProgress | null;
  scanStatus: ScanStatus;
  watchedRoots: WatchedRoot[];
  isRefreshing: boolean;
  isMutating: boolean;
  hasHydratedFromStartup: boolean;
  errorMessage: string | null;
  actions: ScannerRuntimeActions;
};

export type ScannerRuntimeStore = StoreApi<ScannerRuntimeStoreState>;

export function createScannerRuntimeStore(): ScannerRuntimeStore {
  return createStore<ScannerRuntimeStoreState>((set) => {
    const setErrorMessage = (message: string | null) => {
      set({ errorMessage: message });
    };

    const readScannerStatus = async (): Promise<ScanStatus> => {
      const scanStatus = await getScannerStatus();
      return scanStatus ?? { running: false };
    };

    const readWatchedRoots = async (): Promise<WatchedRoot[]> => {
      const watchedRoots = await listWatchedRoots();
      return watchedRoots ?? [];
    };

    const runMutation = async (requestFactory: () => Promise<void>) => {
      set({ isMutating: true, errorMessage: null });
      try {
        await requestFactory();
      } catch (error) {
        setErrorMessage(toDomainErrorMessage(error));
      } finally {
        set({ isMutating: false });
      }
    };

    const refreshStatus = async () => {
      set({ errorMessage: null });
      try {
        const scanStatus = await readScannerStatus();
        set({ scanStatus });
      } catch (error) {
        setErrorMessage(toDomainErrorMessage(error));
      }
    };

    const refreshWatchedRoots = async () => {
      set({ errorMessage: null });
      try {
        const watchedRoots = await readWatchedRoots();
        set({ watchedRoots });
      } catch (error) {
        setErrorMessage(toDomainErrorMessage(error));
      }
    };

    const refreshScannerState = async () => {
      set({ isRefreshing: true, errorMessage: null });
      try {
        const [scanStatus, watchedRoots] = await Promise.all([
          readScannerStatus(),
          readWatchedRoots(),
        ]);
        set({ scanStatus, watchedRoots });
      } catch (error) {
        setErrorMessage(toDomainErrorMessage(error));
      } finally {
        set({ isRefreshing: false });
      }
    };

    const actions: ScannerRuntimeActions = {
      hydrateFromStartup: (scanStatus) => {
        set((state) => {
          if (state.hasHydratedFromStartup) {
            return state;
          }

          return {
            scanStatus,
            hasHydratedFromStartup: true,
          };
        });
      },
      refreshScannerState,
      refreshStatus,
      refreshWatchedRoots,
      addWatchedRoot: async (path) => {
        const normalizedPath = path.trim();
        if (!normalizedPath) {
          return;
        }

        await runMutation(async () => {
          await addWatchedRoot(normalizedPath);
          const [scanStatus, watchedRoots] = await Promise.all([
            readScannerStatus(),
            readWatchedRoots(),
          ]);
          set({
            scanStatus,
            watchedRoots,
            newRootPath: "",
          });
        });
      },
      setWatchedRootEnabled: async (id, enabled) => {
        await runMutation(async () => {
          await setWatchedRootEnabled(id, enabled);
          const [scanStatus, watchedRoots] = await Promise.all([
            readScannerStatus(),
            readWatchedRoots(),
          ]);
          set({ scanStatus, watchedRoots });
        });
      },
      removeWatchedRoot: async (id) => {
        await runMutation(async () => {
          await removeWatchedRoot(id);
          const [scanStatus, watchedRoots] = await Promise.all([
            readScannerStatus(),
            readWatchedRoots(),
          ]);
          set({ scanStatus, watchedRoots });
        });
      },
      runScan: async () => {
        await runMutation(async () => {
          set((state) => ({
            scanStatus: {
              ...state.scanStatus,
              running: true,
            },
          }));
          await triggerScan();
          const scanStatus = await readScannerStatus();
          set({ scanStatus });
        });
      },
      setNewRootPath: (value) => {
        set({ newRootPath: value });
      },
      applyProgress: (progress) => {
        set({
          lastProgress: progress,
        });
      },
      setErrorMessage: (message) => {
        setErrorMessage(message);
      },
      clearErrorMessage: () => {
        setErrorMessage(null);
      },
    };

    return {
      newRootPath: "",
      lastProgress: null,
      scanStatus: { running: false },
      watchedRoots: [],
      isRefreshing: false,
      isMutating: false,
      hasHydratedFromStartup: false,
      errorMessage: null,
      actions,
    };
  });
}
