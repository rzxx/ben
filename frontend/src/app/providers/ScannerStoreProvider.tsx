import { type ReactNode, useEffect, useState } from "react";
import { useAppStartup } from "../hooks/useAppStartup";
import { appQueryClient } from "../query/client";
import { bindScannerEvents } from "../state/scanner/scannerEvents";
import { ScannerRuntimeStoreContext } from "../state/scanner/scannerSelectors";
import { createScannerRuntimeStore } from "../state/scanner/scannerRuntimeStore";

type ScannerStoreProviderProps = {
  children: ReactNode;
};

export function ScannerStoreProvider(props: ScannerStoreProviderProps) {
  const { startupSnapshot, isStartupReady } = useAppStartup();
  const [scannerRuntimeStore] = useState(() => createScannerRuntimeStore());

  useEffect(() => {
    return bindScannerEvents({
      scannerRuntimeStore,
      queryClient: appQueryClient,
    });
  }, [scannerRuntimeStore]);

  useEffect(() => {
    if (!isStartupReady) {
      return;
    }

    scannerRuntimeStore
      .getState()
      .actions.hydrateFromStartup(startupSnapshot.scanStatus);
    void scannerRuntimeStore.getState().actions.refreshScannerState();
  }, [isStartupReady, scannerRuntimeStore, startupSnapshot.scanStatus]);

  return (
    <ScannerRuntimeStoreContext.Provider value={scannerRuntimeStore}>
      {props.children}
    </ScannerRuntimeStoreContext.Provider>
  );
}
