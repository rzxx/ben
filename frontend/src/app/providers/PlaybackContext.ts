import { useMemo } from "react";
import {
  usePlaybackActions,
  usePlaybackCoverPath,
  usePlaybackErrorMessage,
  usePlaybackHasCurrentTrack,
  usePlaybackPlayerState,
  usePlaybackQueueState,
  usePlaybackSeekMax,
  usePlaybackSeekValue,
  usePlaybackStatsRefreshKey,
  usePlaybackTransportBusy,
} from "../state/playback/playbackSelectors";
import type {
  PlaybackActions,
  QueueRepeatMode,
} from "../state/playback/playbackStore";

export type { PlaybackActions, QueueRepeatMode };

export type PlaybackState = {
  queueState: ReturnType<typeof usePlaybackQueueState>;
  playerState: ReturnType<typeof usePlaybackPlayerState>;
  transportBusy: boolean;
  errorMessage: string | null;
};

export type PlaybackMeta = {
  hasCurrentTrack: boolean;
  seekMax: number;
  seekValue: number;
};

export type PlaybackContextValue = {
  state: PlaybackState;
  actions: PlaybackActions;
  meta: PlaybackMeta;
};

export function usePlayback(): PlaybackContextValue {
  const queueState = usePlaybackQueueState();
  const playerState = usePlaybackPlayerState();
  const transportBusy = usePlaybackTransportBusy();
  const errorMessage = usePlaybackErrorMessage();
  const actions = usePlaybackActions();
  const hasCurrentTrack = usePlaybackHasCurrentTrack();
  const seekMax = usePlaybackSeekMax();
  const seekValue = usePlaybackSeekValue();

  return useMemo(
    () => ({
      state: {
        queueState,
        playerState,
        transportBusy,
        errorMessage,
      },
      actions,
      meta: {
        hasCurrentTrack,
        seekMax,
        seekValue,
      },
    }),
    [
      actions,
      errorMessage,
      hasCurrentTrack,
      playerState,
      queueState,
      seekMax,
      seekValue,
      transportBusy,
    ],
  );
}

export { usePlaybackStatsRefreshKey, usePlaybackCoverPath };
