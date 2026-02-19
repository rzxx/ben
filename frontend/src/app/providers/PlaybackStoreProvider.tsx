import { type ReactNode, useEffect, useState } from "react";
import { appQueryClient } from "../query/client";
import { bindPlaybackEvents } from "../state/playback/playbackEvents";
import { createPlaybackProgressStore } from "../state/playback/playbackProgressStore";
import {
  PlaybackProgressStoreContext,
  PlaybackStoreContext,
} from "../state/playback/playbackSelectors";
import { createPlaybackStore } from "../state/playback/playbackStore";
import { useBootstrap } from "./BootstrapContext";

type PlaybackStoreProviderProps = {
  children: ReactNode;
};

export function PlaybackStoreProvider(props: PlaybackStoreProviderProps) {
  const { state: bootstrapState } = useBootstrap();

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
    if (!bootstrapState.isBootstrapped) {
      return;
    }

    playbackStore.getState().actions.hydrateFromBootstrap({
      queueState: bootstrapState.queueState,
      playerState: bootstrapState.playerState,
    });
    playbackProgressStore.getState().actions.hydrateFromBootstrap({
      playerState: bootstrapState.playerState,
    });
  }, [
    bootstrapState.isBootstrapped,
    bootstrapState.playerState,
    bootstrapState.queueState,
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
