import { GetInitialState as getInitialStateBinding } from "../../../../bindings/ben/bootstrapservice";
import type { StartupSnapshot } from "../../../../bindings/ben/models";
import { executeGatewayRequest, type GatewayRequest, type GatewayRequestOptions } from "./gatewayUtils";

export function getAppBootstrap(
  albumsLimit: number,
  albumsOffset: number,
  options?: GatewayRequestOptions,
): GatewayRequest<StartupSnapshot> {
  return executeGatewayRequest(
    () => getInitialStateBinding(albumsLimit, albumsOffset),
    options,
  );
}
