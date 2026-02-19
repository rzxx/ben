import { queryOptions } from "@tanstack/react-query";
import type {
  LibraryAlbum,
  PagedResult,
  PlayerState,
  QueueState,
  ScanStatus,
  ThemeModePreference,
} from "../../features/types";
import { getAppBootstrap } from "../services/gateway/bootstrapGateway";
import {
  bootstrapAlbumsOffset,
  browseLimit,
  createEmptyAlbumsPage,
  createEmptyPlayerState,
  createEmptyQueueState,
  normalizePagedResult,
  parseThemeModePreference,
} from "../utils/appUtils";
import { type BootstrapQueryInput, queryKeys } from "./keys";
import { queryCacheGCTimeMS } from "./options";

export type AppBootstrapSnapshot = {
  queueState: QueueState;
  playerState: PlayerState;
  scanStatus: ScanStatus;
  albumsPage: PagedResult<LibraryAlbum>;
  themeModePreference: ThemeModePreference;
};

export const defaultBootstrapQueryInput: BootstrapQueryInput = {
  albumsLimit: browseLimit,
  albumsOffset: bootstrapAlbumsOffset,
};

export const bootstrapQueries = {
  snapshot: (input: BootstrapQueryInput = defaultBootstrapQueryInput) =>
    queryOptions({
      queryKey: queryKeys.bootstrap.snapshot(input),
      queryFn: ({ signal }) =>
        getAppBootstrap(input.albumsLimit, input.albumsOffset, { signal }),
      select: (snapshot): AppBootstrapSnapshot => ({
        queueState: (snapshot?.queueState ?? createEmptyQueueState()) as QueueState,
        playerState: (snapshot?.playerState ?? createEmptyPlayerState()) as PlayerState,
        scanStatus: (snapshot?.scanStatus ?? { running: false }) as ScanStatus,
        albumsPage: normalizePagedResult<LibraryAlbum>(
          snapshot?.albumsPage,
          input.albumsLimit,
        ),
        themeModePreference: parseThemeModePreference(snapshot?.themeModePreference ?? null),
      }),
      staleTime: Number.POSITIVE_INFINITY,
      gcTime: queryCacheGCTimeMS,
    }),
};

const emptyBootstrapSnapshot: AppBootstrapSnapshot = {
  queueState: createEmptyQueueState(),
  playerState: createEmptyPlayerState(),
  scanStatus: { running: false },
  albumsPage: createEmptyAlbumsPage(),
  themeModePreference: "system",
};

export function createEmptyBootstrapSnapshot(): AppBootstrapSnapshot {
  return emptyBootstrapSnapshot;
}
