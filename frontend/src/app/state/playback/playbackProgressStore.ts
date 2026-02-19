import { createStore, type StoreApi } from "zustand/vanilla";
import type { PlayerState } from "../../../features/types";

export type PlaybackProgressBootstrapSnapshot = {
  playerState: PlayerState;
};

export type PlaybackProgressActions = {
  hydrateFromBootstrap: (snapshot: PlaybackProgressBootstrapSnapshot) => void;
  applyPlayerStateFromEvent: (playerState: PlayerState) => void;
};

export type PlaybackProgressStoreState = {
  positionMs: number;
  durationMs: number;
  hasHydratedFromBootstrap: boolean;
  actions: PlaybackProgressActions;
};

export type PlaybackProgressStore = StoreApi<PlaybackProgressStoreState>;

export function createPlaybackProgressStore(
  initialSnapshot?: PlaybackProgressBootstrapSnapshot,
): PlaybackProgressStore {
  const initialPositionMS = initialSnapshot?.playerState.positionMs ?? 0;
  const initialDurationMS = initialSnapshot?.playerState.durationMs ?? 0;

  return createStore<PlaybackProgressStoreState>((set) => {
    const actions: PlaybackProgressActions = {
      hydrateFromBootstrap: (snapshot) => {
        const { positionMS, durationMS } = selectProgress(snapshot.playerState);
        set((state) => {
          if (state.hasHydratedFromBootstrap) {
            return state;
          }

          return {
            positionMs: positionMS,
            durationMs: durationMS,
            hasHydratedFromBootstrap: true,
          };
        });
      },
      applyPlayerStateFromEvent: (playerState) => {
        const { positionMS, durationMS } = selectProgress(playerState);
        set((state) => {
          if (
            state.positionMs === positionMS &&
            state.durationMs === durationMS &&
            state.hasHydratedFromBootstrap
          ) {
            return state;
          }

          return {
            positionMs: positionMS,
            durationMs: durationMS,
            hasHydratedFromBootstrap: true,
          };
        });
      },
    };

    return {
      positionMs: initialPositionMS,
      durationMs: initialDurationMS,
      hasHydratedFromBootstrap: false,
      actions,
    };
  });
}

function selectProgress(playerState: PlayerState): {
  positionMS: number;
  durationMS: number;
} {
  return {
    positionMS: playerState.positionMs,
    durationMS: playerState.durationMs ?? 0,
  };
}
