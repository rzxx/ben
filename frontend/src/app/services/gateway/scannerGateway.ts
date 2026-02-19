import {
  GetStatus as getStatusBinding,
  TriggerFullScan as triggerFullScanBinding,
  TriggerIncrementalScan as triggerIncrementalScanBinding,
  TriggerScan as triggerScanBinding,
} from "../../../../bindings/ben/scannerservice";
import {
  AddWatchedRoot as addWatchedRootBinding,
  ListWatchedRoots as listWatchedRootsBinding,
  RemoveWatchedRoot as removeWatchedRootBinding,
  SetWatchedRootEnabled as setWatchedRootEnabledBinding,
} from "../../../../bindings/ben/settingsservice";
import type { ScanStatus, WatchedRoot } from "../../../features/types";
import { executeGatewayRequest, type GatewayRequest, type GatewayRequestOptions } from "./gatewayUtils";

export function getScannerStatus(options?: GatewayRequestOptions): GatewayRequest<ScanStatus> {
  return executeGatewayRequest(() => getStatusBinding(), options) as GatewayRequest<ScanStatus>;
}

export function triggerScan(options?: GatewayRequestOptions): GatewayRequest<void> {
  return executeGatewayRequest(() => triggerScanBinding(), options) as GatewayRequest<void>;
}

export function triggerFullScan(options?: GatewayRequestOptions): GatewayRequest<void> {
  return executeGatewayRequest(() => triggerFullScanBinding(), options) as GatewayRequest<void>;
}

export function triggerIncrementalScan(options?: GatewayRequestOptions): GatewayRequest<void> {
  return executeGatewayRequest(() => triggerIncrementalScanBinding(), options) as GatewayRequest<void>;
}

export function listWatchedRoots(options?: GatewayRequestOptions): GatewayRequest<WatchedRoot[]> {
  return executeGatewayRequest(() => listWatchedRootsBinding(), options) as GatewayRequest<
    WatchedRoot[]
  >;
}

export function addWatchedRoot(
  path: string,
  options?: GatewayRequestOptions,
): GatewayRequest<WatchedRoot> {
  return executeGatewayRequest(() => addWatchedRootBinding(path), options) as GatewayRequest<
    WatchedRoot
  >;
}

export function removeWatchedRoot(id: number, options?: GatewayRequestOptions): GatewayRequest<void> {
  return executeGatewayRequest(() => removeWatchedRootBinding(id), options) as GatewayRequest<void>;
}

export function setWatchedRootEnabled(
  id: number,
  enabled: boolean,
  options?: GatewayRequestOptions,
): GatewayRequest<void> {
  return executeGatewayRequest(() => setWatchedRootEnabledBinding(id, enabled), options) as GatewayRequest<void>;
}
