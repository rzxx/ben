import { type ReactNode, useEffect, useState } from "react";
import { useAppStartup } from "../hooks/useAppStartup";
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
  const { startupSnapshot, isStartupReady } = useAppStartup();

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
    if (!isStartupReady) {
      return;
    }

    playbackStore.getState().actions.hydrateFromBootstrap({
      queueState: startupSnapshot.queueState,
      playerState: startupSnapshot.playerState,
    });
    playbackProgressStore.getState().actions.hydrateFromBootstrap({
      playerState: startupSnapshot.playerState,
    });
  }, [
    isStartupReady,
    playbackProgressStore,
    playbackStore,
    startupSnapshot.playerState,
    startupSnapshot.queueState,
  ]);

  return (
    <PlaybackStoreContext.Provider value={playbackStore}>
      <PlaybackProgressStoreContext.Provider value={playbackProgressStore}>
        {props.children}
      </PlaybackProgressStoreContext.Provider>
    </PlaybackStoreContext.Provider>
  );
}
