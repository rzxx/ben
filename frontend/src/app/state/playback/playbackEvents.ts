import { type QueryClient } from "@tanstack/react-query";
import { Events } from "@wailsio/runtime";
import type { PlayerState, QueueState } from "../../../features/types";
import { queryKeys } from "../../query/keys";
import { gatewayEvents } from "../../services/gateway/events";
import type { PlaybackProgressStore } from "./playbackProgressStore";
import type { PlaybackStore } from "./playbackStore";

type PlaybackEventSyncOptions = {
  playbackStore: PlaybackStore;
  playbackProgressStore: PlaybackProgressStore;
  queryClient: QueryClient;
};

export function bindPlaybackEvents(options: PlaybackEventSyncOptions): () => void {
  let lastPlayerStatsRefreshKey = buildPlayerStatsRefreshKey(
    options.playbackStore.getState().playerState,
  );

  const invalidateStatsQueries = () => {
    void options.queryClient.invalidateQueries({
      queryKey: queryKeys.stats.overviewRoot(),
    });
    void options.queryClient.invalidateQueries({
      queryKey: queryKeys.stats.dashboardRoot(),
    });
  };

  const unsubscribeQueue = Events.On(gatewayEvents.queueState, (event) => {
    const queueState = event.data as QueueState;
    options.playbackStore.getState().actions.applyQueueStateFromEvent(queueState);
    invalidateStatsQueries();
  });

  const unsubscribePlayer = Events.On(gatewayEvents.playerState, (event) => {
    const playerState = event.data as PlayerState;
    options.playbackStore
      .getState()
      .actions.applyPlayerStateFromEvent(playerState);
    options.playbackProgressStore
      .getState()
      .actions.applyPlayerStateFromEvent(playerState);

    const nextStatsRefreshKey = buildPlayerStatsRefreshKey(playerState);
    if (nextStatsRefreshKey !== lastPlayerStatsRefreshKey) {
      lastPlayerStatsRefreshKey = nextStatsRefreshKey;
      invalidateStatsQueries();
    }
  });

  return () => {
    unsubscribeQueue();
    unsubscribePlayer();
  };
}

function buildPlayerStatsRefreshKey(playerState: PlayerState): string {
  const trackID = playerState.currentTrack?.id ?? 0;
  return `${playerState.status}:${trackID}`;
}
