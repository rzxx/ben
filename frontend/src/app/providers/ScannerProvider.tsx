import { Events } from "@wailsio/runtime";
import {
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useLocation } from "wouter";
import {
  GetStatus as getScannerStatus,
  TriggerScan as triggerScan,
} from "../../../bindings/ben/scannerservice";
import {
  AddWatchedRoot as addWatchedRoot,
  ListWatchedRoots as listWatchedRoots,
  RemoveWatchedRoot as removeWatchedRoot,
  SetWatchedRootEnabled as setWatchedRootEnabled,
} from "../../../bindings/ben/settingsservice";
import { ScanProgress, ScanStatus, WatchedRoot } from "../../features/types";
import { parseError, scanProgressEvent, scheduleAfterPaintAndIdle } from "../utils/appUtils";
import { useBootstrap } from "./BootstrapContext";
import { ScannerContext, ScannerContextValue } from "./ScannerContext";

type ScannerProviderProps = {
  children: ReactNode;
};

export function ScannerProvider(props: ScannerProviderProps) {
  const [location] = useLocation();
  const { state: bootstrapState } = useBootstrap();

  const [watchedRoots, setWatchedRoots] = useState<WatchedRoot[]>([]);
  const [newRootPath, setNewRootPath] = useState("");
  const [scanStatus, setScanStatus] = useState<ScanStatus | null>(null);
  const [lastProgress, setLastProgress] = useState<ScanProgress | null>(null);
  const [scanCompletionCount, setScanCompletionCount] = useState(0);
  const [hasLoadedWatchedRoots, setHasLoadedWatchedRoots] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const resolvedScanStatus = scanStatus ?? bootstrapState.scanStatus;

  const loadScanStatus = useCallback(async () => {
    const status = await getScannerStatus();
    setScanStatus((status ?? { running: false }) as ScanStatus);
  }, []);

  const loadWatchedRoots = useCallback(async () => {
    const roots = await listWatchedRoots();
    setWatchedRoots((roots ?? []) as WatchedRoot[]);
    setHasLoadedWatchedRoots(true);
  }, []);

  const ensureWatchedRootsLoaded = useCallback(async () => {
    if (hasLoadedWatchedRoots) {
      return;
    }

    try {
      setErrorMessage(null);
      await loadWatchedRoots();
    } catch (error) {
      setErrorMessage(parseError(error));
    }
  }, [hasLoadedWatchedRoots, loadWatchedRoots]);

  useEffect(() => {
    const unsubscribeScanner = Events.On(scanProgressEvent, (event) => {
      const progress = event.data as ScanProgress;
      setLastProgress(progress);
      void loadScanStatus();

      if (progress.status === "completed") {
        setScanCompletionCount((count) => count + 1);
      }
    });

    return () => {
      unsubscribeScanner();
    };
  }, [loadScanStatus]);

  useEffect(() => {
    if (!bootstrapState.isBootstrapped || hasLoadedWatchedRoots) {
      return;
    }

    return scheduleAfterPaintAndIdle(() => {
      void ensureWatchedRootsLoaded();
    });
  }, [bootstrapState.isBootstrapped, ensureWatchedRootsLoaded, hasLoadedWatchedRoots]);

  useEffect(() => {
    if (!location.startsWith("/settings") || hasLoadedWatchedRoots) {
      return;
    }

    const timer = window.setTimeout(() => {
      void ensureWatchedRootsLoaded();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [ensureWatchedRootsLoaded, hasLoadedWatchedRoots, location]);

  const addWatchedRootAction = useCallback(
    async (path: string) => {
      const trimmedPath = path.trim();
      if (!trimmedPath) {
        return;
      }

      try {
        setErrorMessage(null);
        await addWatchedRoot(trimmedPath);
        setNewRootPath("");
        await loadWatchedRoots();
      } catch (error) {
        setErrorMessage(parseError(error));
      }
    },
    [loadWatchedRoots],
  );

  const toggleWatchedRootAction = useCallback(
    async (root: WatchedRoot) => {
      try {
        setErrorMessage(null);
        await setWatchedRootEnabled(root.id, !root.enabled);
        await loadWatchedRoots();
      } catch (error) {
        setErrorMessage(parseError(error));
      }
    },
    [loadWatchedRoots],
  );

  const removeWatchedRootAction = useCallback(
    async (id: number) => {
      try {
        setErrorMessage(null);
        await removeWatchedRoot(id);
        await loadWatchedRoots();
      } catch (error) {
        setErrorMessage(parseError(error));
      }
    },
    [loadWatchedRoots],
  );

  const runScanAction = useCallback(async () => {
    try {
      setErrorMessage(null);
      await triggerScan();
      await loadScanStatus();
    } catch (error) {
      setErrorMessage(parseError(error));
    }
  }, [loadScanStatus]);

  const clearErrorAction = useCallback(() => {
    setErrorMessage(null);
  }, []);

  const contextValue = useMemo<ScannerContextValue>(
    () => ({
      state: {
        watchedRoots,
        newRootPath,
        scanStatus: resolvedScanStatus,
        lastProgress,
        errorMessage,
      },
      actions: {
        setNewRootPath,
        addWatchedRoot: addWatchedRootAction,
        toggleWatchedRoot: toggleWatchedRootAction,
        removeWatchedRoot: removeWatchedRootAction,
        runScan: runScanAction,
        ensureWatchedRootsLoaded,
        clearError: clearErrorAction,
      },
      meta: {
        scanCompletionCount,
        hasLoadedWatchedRoots,
      },
    }),
    [
      addWatchedRootAction,
      clearErrorAction,
      ensureWatchedRootsLoaded,
      errorMessage,
      hasLoadedWatchedRoots,
      lastProgress,
      newRootPath,
      removeWatchedRootAction,
      runScanAction,
      scanCompletionCount,
      resolvedScanStatus,
      toggleWatchedRootAction,
      watchedRoots,
    ],
  );

  return (
    <ScannerContext.Provider value={contextValue}>
      {props.children}
    </ScannerContext.Provider>
  );
}
