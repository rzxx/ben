import { queryOptions } from "@tanstack/react-query";
import { getStatsDashboard, getStatsOverview } from "../services/gateway/statsGateway";
import {
  type StatsDashboardQueryInput,
  type StatsOverviewQueryInput,
  queryKeys,
} from "./keys";
import { defaultQueryStaleTimeMS, queryCacheGCTimeMS } from "./options";

export const statsQueries = {
  overview: (input: StatsOverviewQueryInput) =>
    queryOptions({
      queryKey: queryKeys.stats.overview(input),
      queryFn: ({ signal }) => getStatsOverview(input.limit, { signal }),
      staleTime: defaultQueryStaleTimeMS,
      gcTime: queryCacheGCTimeMS,
    }),
  dashboard: (input: StatsDashboardQueryInput) =>
    queryOptions({
      queryKey: queryKeys.stats.dashboard(input),
      queryFn: ({ signal }) => getStatsDashboard(input.range, input.limit, { signal }),
      staleTime: defaultQueryStaleTimeMS,
      gcTime: queryCacheGCTimeMS,
    }),
};
