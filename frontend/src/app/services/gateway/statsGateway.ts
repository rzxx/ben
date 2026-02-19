import {
  GetDashboard as getDashboardBinding,
  GetOverview as getOverviewBinding,
} from "../../../../bindings/ben/statsservice";
import type { StatsDashboard, StatsOverview, StatsRange } from "../../../features/types";
import { executeGatewayRequest, type GatewayRequest, type GatewayRequestOptions } from "./gatewayUtils";

export function getStatsOverview(
  limit: number,
  options?: GatewayRequestOptions,
): GatewayRequest<StatsOverview> {
  return executeGatewayRequest(() => getOverviewBinding(limit), options) as GatewayRequest<StatsOverview>;
}

export function getStatsDashboard(
  range: StatsRange,
  limit: number,
  options?: GatewayRequestOptions,
): GatewayRequest<StatsDashboard> {
  return executeGatewayRequest(() => getDashboardBinding(range, limit), options) as GatewayRequest<
    StatsDashboard
  >;
}
