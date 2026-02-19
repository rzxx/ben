import {
  DefaultOptions as getDefaultOptionsBinding,
  GenerateFromCover as generateFromCoverBinding,
} from "../../../../bindings/ben/themeservice";
import type { ThemeExtractOptions, ThemePalette } from "../../../features/types";
import { executeGatewayRequest, type GatewayRequest, type GatewayRequestOptions } from "./gatewayUtils";

export function getThemeDefaultOptions(
  options?: GatewayRequestOptions,
): GatewayRequest<ThemeExtractOptions> {
  return executeGatewayRequest(() => getDefaultOptionsBinding(), options) as GatewayRequest<
    ThemeExtractOptions
  >;
}

export function generateThemeFromCover(
  coverPath: string,
  extractOptions: ThemeExtractOptions,
  options?: GatewayRequestOptions,
): GatewayRequest<ThemePalette> {
  return executeGatewayRequest(
    () => generateFromCoverBinding(coverPath, extractOptions),
    options,
  ) as GatewayRequest<ThemePalette>;
}
