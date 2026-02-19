import { type ReactNode, useEffect, useState } from "react";
import { appQueryClient } from "../query/client";
import { bindScannerEvents } from "../state/scanner/scannerEvents";
import { ScannerRuntimeStoreContext } from "../state/scanner/scannerSelectors";
import { createScannerRuntimeStore } from "../state/scanner/scannerRuntimeStore";

type ScannerStoreProviderProps = {
  children: ReactNode;
};

export function ScannerStoreProvider(props: ScannerStoreProviderProps) {
  const [scannerRuntimeStore] = useState(() => createScannerRuntimeStore());

  useEffect(() => {
    return bindScannerEvents({
      scannerRuntimeStore,
      queryClient: appQueryClient,
    });
  }, [scannerRuntimeStore]);

  return (
    <ScannerRuntimeStoreContext.Provider value={scannerRuntimeStore}>
      {props.children}
    </ScannerRuntimeStoreContext.Provider>
  );
}
