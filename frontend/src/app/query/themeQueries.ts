import { queryOptions } from "@tanstack/react-query";
import { generateThemeFromCover } from "../services/gateway/themeGateway";
import { themeExtractOptionsDefaults } from "../utils/appUtils";
import { queryKeys } from "./keys";
import { queryCacheGCTimeMS } from "./options";

export const themeQueries = {
  palette: (coverPath: string) =>
    queryOptions({
      queryKey: queryKeys.theme.palette(coverPath),
      queryFn: ({ signal }) =>
        generateThemeFromCover(coverPath, themeExtractOptionsDefaults, {
          signal,
        }),
      gcTime: queryCacheGCTimeMS,
    }),
};
