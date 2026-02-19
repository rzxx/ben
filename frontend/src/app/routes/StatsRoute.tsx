import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import type { StatsRange } from "../../features/types";
import { StatsView } from "../../features/stats/StatsView";
import { statsQueries } from "../query/statsQueries";
import {
  createEmptyStatsDashboard,
  formatPlayedTime,
  parseError,
  statsRefreshIntervalMS,
} from "../utils/appUtils";

const statsDashboardLimit = 10;

export function StatsRoute() {
  const [range, setRange] = useState<StatsRange>("short");

  const dashboardQuery = useQuery({
    ...statsQueries.dashboard({
      range,
      limit: statsDashboardLimit,
    }),
    refetchInterval: statsRefreshIntervalMS,
  });

  const dashboard = useMemo(
    () => dashboardQuery.data ?? createEmptyStatsDashboard(range),
    [dashboardQuery.data, range],
  );

  if (dashboardQuery.isError && !dashboardQuery.data) {
    return <p className="text-sm text-red-400">{parseError(dashboardQuery.error)}</p>;
  }

  if (dashboardQuery.isPending && !dashboardQuery.data) {
    return <p className="text-theme-600 dark:text-theme-400 text-sm">Loading stats...</p>;
  }

  return (
    <StatsView
      dashboard={dashboard}
      range={range}
      onRangeChange={setRange}
      formatPlayedTime={formatPlayedTime}
    />
  );
}
