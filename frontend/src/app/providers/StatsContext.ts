import { createContext, useContext } from "react";
import { StatsDashboard, StatsOverview, StatsRange } from "../../features/types";

export type StatsState = {
  overview: StatsOverview;
  dashboard: StatsDashboard;
  range: StatsRange;
  errorMessage: string | null;
};

export type StatsActions = {
  setRange: (range: StatsRange) => void;
  refreshOverview: () => Promise<void>;
  refreshDashboard: (range: StatsRange) => Promise<void>;
  clearError: () => void;
};

export type StatsMeta = {
  isStatsRoute: boolean;
  hasLoadedOverview: boolean;
};

export type StatsContextValue = {
  state: StatsState;
  actions: StatsActions;
  meta: StatsMeta;
};

export const StatsContext = createContext<StatsContextValue | null>(null);

export function useStats(): StatsContextValue {
  const contextValue = useContext(StatsContext);
  if (!contextValue) {
    throw new Error("useStats must be used within StatsProvider");
  }

  return contextValue;
}
