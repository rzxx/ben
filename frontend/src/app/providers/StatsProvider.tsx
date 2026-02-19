import {
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocation } from "wouter";
import {
  getStatsDashboard,
  getStatsOverview,
} from "../services/gateway/statsGateway";
import { StatsDashboard, StatsOverview, StatsRange } from "../../features/types";
import {
  createEmptyStatsDashboard,
  createEmptyStatsOverview,
  parseError,
  scheduleAfterPaintAndIdle,
  statsRefreshIntervalMS,
} from "../utils/appUtils";
import { useBootstrap } from "./BootstrapContext";
import { usePlaybackStatsRefreshKey } from "./PlaybackContext";
import { StatsContext, StatsContextValue } from "./StatsContext";

type StatsProviderProps = {
  children: ReactNode;
};

export function StatsProvider(props: StatsProviderProps) {
  const [location] = useLocation();
  const { state: bootstrapState } = useBootstrap();
  const playbackStatsRefreshKey = usePlaybackStatsRefreshKey();
  const isStatsRoute = location.startsWith("/stats");

  const [overview, setOverview] = useState<StatsOverview>(createEmptyStatsOverview());
  const [range, setRange] = useState<StatsRange>("short");
  const [dashboard, setDashboard] = useState<StatsDashboard>(
    createEmptyStatsDashboard("short"),
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasLoadedOverview, setHasLoadedOverview] = useState(false);

  const statsRangeRef = useRef<StatsRange>("short");
  const statsOverviewRequestTokenRef = useRef(0);
  const statsDashboardRequestTokenRef = useRef(0);
  const statsOverviewRequestRef = useRef<ReturnType<typeof getStatsOverview> | null>(null);
  const statsDashboardRequestRef = useRef<ReturnType<typeof getStatsDashboard> | null>(null);

  useEffect(() => {
    statsRangeRef.current = range;
  }, [range]);

  const refreshOverview = useCallback(async () => {
    statsOverviewRequestRef.current?.cancel();
    const requestToken = statsOverviewRequestTokenRef.current + 1;
    statsOverviewRequestTokenRef.current = requestToken;

    const request = getStatsOverview(5);
    statsOverviewRequestRef.current = request;

    try {
      const nextOverview = await request;
      if (requestToken !== statsOverviewRequestTokenRef.current) {
        return;
      }

      setOverview((nextOverview ?? createEmptyStatsOverview()) as StatsOverview);
      setHasLoadedOverview(true);
    } catch (error) {
      if (requestToken !== statsOverviewRequestTokenRef.current) {
        return;
      }

      setErrorMessage(parseError(error));
    } finally {
      if (statsOverviewRequestRef.current === request) {
        statsOverviewRequestRef.current = null;
      }
    }
  }, []);

  const refreshDashboard = useCallback(async (nextRange: StatsRange) => {
    statsDashboardRequestRef.current?.cancel();
    const requestToken = statsDashboardRequestTokenRef.current + 1;
    statsDashboardRequestTokenRef.current = requestToken;

    const request = getStatsDashboard(nextRange, 10);
    statsDashboardRequestRef.current = request;

    try {
      const nextDashboard = await request;
      if (requestToken !== statsDashboardRequestTokenRef.current) {
        return;
      }

      setDashboard((nextDashboard ?? createEmptyStatsDashboard(nextRange)) as StatsDashboard);
    } catch (error) {
      if (requestToken !== statsDashboardRequestTokenRef.current) {
        return;
      }

      setErrorMessage(parseError(error));
    } finally {
      if (statsDashboardRequestRef.current === request) {
        statsDashboardRequestRef.current = null;
      }
    }
  }, []);

  useEffect(() => {
    if (!bootstrapState.isBootstrapped || hasLoadedOverview) {
      return;
    }

    return scheduleAfterPaintAndIdle(() => {
      void refreshOverview();
    });
  }, [bootstrapState.isBootstrapped, hasLoadedOverview, refreshOverview]);

  useEffect(() => {
    if (!isStatsRoute || hasLoadedOverview) {
      return;
    }

    void refreshOverview();
  }, [hasLoadedOverview, isStatsRoute, refreshOverview]);

  useEffect(() => {
    if (!isStatsRoute) {
      return;
    }

    void refreshOverview();
    void refreshDashboard(range);
  }, [isStatsRoute, range, refreshDashboard, refreshOverview]);

  useEffect(() => {
    if (!bootstrapState.isBootstrapped) {
      return;
    }

    void refreshOverview();
    if (isStatsRoute) {
      void refreshDashboard(statsRangeRef.current);
    }
  }, [bootstrapState.isBootstrapped, isStatsRoute, playbackStatsRefreshKey, refreshDashboard, refreshOverview]);

  useEffect(() => {
    if (!isStatsRoute) {
      return;
    }

    const timer = window.setInterval(() => {
      void refreshOverview();
      void refreshDashboard(statsRangeRef.current);
    }, statsRefreshIntervalMS);

    return () => {
      window.clearInterval(timer);
    };
  }, [isStatsRoute, refreshDashboard, refreshOverview]);

  useEffect(() => {
    return () => {
      statsOverviewRequestTokenRef.current += 1;
      statsDashboardRequestTokenRef.current += 1;
      statsOverviewRequestRef.current?.cancel();
      statsDashboardRequestRef.current?.cancel();
    };
  }, []);

  const clearErrorAction = useCallback(() => {
    setErrorMessage(null);
  }, []);

  const contextValue = useMemo<StatsContextValue>(
    () => ({
      state: {
        overview,
        dashboard,
        range,
        errorMessage,
      },
      actions: {
        setRange,
        refreshOverview,
        refreshDashboard,
        clearError: clearErrorAction,
      },
      meta: {
        isStatsRoute,
        hasLoadedOverview,
      },
    }),
    [
      clearErrorAction,
      dashboard,
      errorMessage,
      hasLoadedOverview,
      isStatsRoute,
      overview,
      range,
      refreshDashboard,
      refreshOverview,
    ],
  );

  return <StatsContext.Provider value={contextValue}>{props.children}</StatsContext.Provider>;
}
