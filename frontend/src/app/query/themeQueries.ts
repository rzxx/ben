import { queryOptions } from "@tanstack/react-query";
import { getThemeDefaultOptions, generateThemeFromCover } from "../services/gateway/themeGateway";
import { type ThemePaletteQueryInput, queryKeys } from "./keys";
import { defaultQueryStaleTimeMS, queryCacheGCTimeMS } from "./options";

export const themeQueries = {
  defaultOptions: () =>
    queryOptions({
      queryKey: queryKeys.theme.defaultOptions(),
      queryFn: ({ signal }) => getThemeDefaultOptions({ signal }),
      staleTime: defaultQueryStaleTimeMS,
      gcTime: queryCacheGCTimeMS,
    }),
  palette: (input: ThemePaletteQueryInput) =>
    queryOptions({
      queryKey: queryKeys.theme.palette(input),
      queryFn: ({ signal }) => generateThemeFromCover(input.coverPath, input.options, { signal }),
      gcTime: queryCacheGCTimeMS,
    }),
};
