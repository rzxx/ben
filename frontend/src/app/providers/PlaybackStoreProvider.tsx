import { type ReactNode, useEffect, useState } from "react";
import { useAppBootstrapQuery } from "../hooks/useAppBootstrapQuery";
import { appQueryClient } from "../query/client";
import { bindPlaybackEvents } from "../state/playback/playbackEvents";
import { createPlaybackProgressStore } from "../state/playback/playbackProgressStore";
import {
  PlaybackProgressStoreContext,
  PlaybackStoreContext,
} from "../state/playback/playbackSelectors";
import { createPlaybackStore } from "../state/playback/playbackStore";

type PlaybackStoreProviderProps = {
  children: ReactNode;
};

export function PlaybackStoreProvider(props: PlaybackStoreProviderProps) {
  const { bootstrapSnapshot, isBootstrapped } = useAppBootstrapQuery();

  const [playbackStore] = useState(() => createPlaybackStore());
  const [playbackProgressStore] = useState(() => createPlaybackProgressStore());

  useEffect(() => {
    return bindPlaybackEvents({
      playbackStore,
      playbackProgressStore,
      queryClient: appQueryClient,
    });
  }, [playbackProgressStore, playbackStore]);

  useEffect(() => {
    if (!isBootstrapped) {
      return;
    }

    playbackStore.getState().actions.hydrateFromBootstrap({
      queueState: bootstrapSnapshot.queueState,
      playerState: bootstrapSnapshot.playerState,
    });
    playbackProgressStore.getState().actions.hydrateFromBootstrap({
      playerState: bootstrapSnapshot.playerState,
    });
  }, [
    bootstrapSnapshot.playerState,
    bootstrapSnapshot.queueState,
    isBootstrapped,
    playbackProgressStore,
    playbackStore,
  ]);

  return (
    <PlaybackStoreContext.Provider value={playbackStore}>
      <PlaybackProgressStoreContext.Provider value={playbackProgressStore}>
        {props.children}
      </PlaybackProgressStoreContext.Provider>
    </PlaybackStoreContext.Provider>
  );
}
