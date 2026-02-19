import type { DefaultOptions } from "@tanstack/react-query";
import { isDomainCancelledError } from "../services/domainError";

export const queryCacheGCTimeMS = 1000 * 60 * 15;
export const defaultQueryStaleTimeMS = 1000 * 20;
export const browseListStaleTimeMS = 1000 * 60;
export const detailStaleTimeMS = 1000 * 30;

const defaultQueryRetryCount = 1;

export const appQueryDefaultOptions: DefaultOptions = {
  queries: {
    gcTime: queryCacheGCTimeMS,
    staleTime: defaultQueryStaleTimeMS,
    retry: (failureCount, error) => {
      if (isDomainCancelledError(error)) {
        return false;
      }

      return failureCount < defaultQueryRetryCount;
    },
    refetchOnWindowFocus: false,
  },
  mutations: {
    gcTime: queryCacheGCTimeMS,
    retry: 0,
  },
};
