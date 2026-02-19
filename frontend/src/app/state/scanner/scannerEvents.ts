import { type QueryClient } from "@tanstack/react-query";
import { Events } from "@wailsio/runtime";
import type { ScanProgress } from "../../../features/types";
import { queryKeys } from "../../query/keys";
import { gatewayEvents } from "../../services/gateway/events";
import type { ScannerRuntimeStore } from "./scannerRuntimeStore";

type ScannerEventSyncOptions = {
  scannerRuntimeStore: ScannerRuntimeStore;
  queryClient: QueryClient;
};

export function bindScannerEvents(options: ScannerEventSyncOptions): () => void {
  const invalidateLibraryQueries = () => {
    void options.queryClient.invalidateQueries({
      queryKey: queryKeys.library.albumsRoot(),
    });
    void options.queryClient.invalidateQueries({
      queryKey: queryKeys.library.artistsRoot(),
    });
    void options.queryClient.invalidateQueries({
      queryKey: queryKeys.library.tracksRoot(),
    });
    void options.queryClient.invalidateQueries({
      queryKey: queryKeys.library.albumDetailRoot(),
    });
    void options.queryClient.invalidateQueries({
      queryKey: queryKeys.library.artistDetailRoot(),
    });
    void options.queryClient.invalidateQueries({
      queryKey: queryKeys.library.artistTopTracksRoot(),
    });
  };

  const unsubscribeScanner = Events.On(gatewayEvents.scanProgress, (event) => {
    const progress = event.data as ScanProgress;
    options.scannerRuntimeStore.getState().actions.applyProgress(progress);

    if (progress.status !== "completed") {
      return;
    }

    void options.scannerRuntimeStore.getState().actions.refreshStatus();
    invalidateLibraryQueries();
  });

  return () => {
    unsubscribeScanner();
  };
}
