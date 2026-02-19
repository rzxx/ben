import { StatsView } from "../../features/stats/StatsView";
import { useStats } from "../providers/StatsContext";
import { formatPlayedTime } from "../utils/appUtils";

export function StatsRoute() {
  const { state: statsState, actions: statsActions } = useStats();

  return (
    <StatsView
      dashboard={statsState.dashboard}
      range={statsState.range}
      onRangeChange={statsActions.setRange}
      formatPlayedTime={formatPlayedTime}
    />
  );
}
