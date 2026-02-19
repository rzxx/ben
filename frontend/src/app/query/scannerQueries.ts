import { queryOptions } from "@tanstack/react-query";
import { getScannerStatus, listWatchedRoots } from "../services/gateway/scannerGateway";
import { queryKeys } from "./keys";
import { defaultQueryStaleTimeMS, queryCacheGCTimeMS } from "./options";

export const scannerQueries = {
  status: () =>
    queryOptions({
      queryKey: queryKeys.scanner.status(),
      queryFn: ({ signal }) => getScannerStatus({ signal }),
      staleTime: defaultQueryStaleTimeMS,
      gcTime: queryCacheGCTimeMS,
    }),
  watchedRoots: () =>
    queryOptions({
      queryKey: queryKeys.scanner.watchedRoots(),
      queryFn: ({ signal }) => listWatchedRoots({ signal }),
      staleTime: defaultQueryStaleTimeMS,
      gcTime: queryCacheGCTimeMS,
    }),
};
