import { createContext, useContext } from "react";
import { useStore } from "zustand";
import type { QueueState } from "../../../features/types";
import type { PlaybackProgressStore, PlaybackProgressStoreState } from "./playbackProgressStore";
import type { PlaybackActions, PlaybackStore, PlaybackStoreState } from "./playbackStore";

export const PlaybackStoreContext = createContext<PlaybackStore | null>(null);
export const PlaybackProgressStoreContext =
  createContext<PlaybackProgressStore | null>(null);

export function usePlaybackStoreSelector<T>(
  selector: (state: PlaybackStoreState) => T,
): T {
  const store = usePlaybackStoreApi();
  return useStore(store, selector);
}

export function usePlaybackProgressStoreSelector<T>(
  selector: (state: PlaybackProgressStoreState) => T,
): T {
  const store = usePlaybackProgressStoreApi();
  return useStore(store, selector);
}

export function usePlaybackActions(): PlaybackActions {
  return usePlaybackStoreSelector((state) => state.actions);
}

export function usePlaybackQueueState(): QueueState {
  return usePlaybackStoreSelector((state) => state.queueState);
}

export function usePlaybackTransportBusy(): boolean {
  return usePlaybackStoreSelector((state) => state.transportBusy);
}

export function usePlaybackErrorMessage(): string | null {
  return usePlaybackStoreSelector((state) => state.errorMessage);
}

export function usePlaybackCurrentTrack() {
  return usePlaybackStoreSelector((state) => state.playerState.currentTrack);
}

export function usePlaybackStatus(): string {
  return usePlaybackStoreSelector((state) => state.playerState.status);
}

export function usePlaybackVolume(): number {
  return usePlaybackStoreSelector((state) => state.playerState.volume);
}

export function usePlaybackHasCurrentTrack(): boolean {
  return usePlaybackStoreSelector((state) => Boolean(state.playerState.currentTrack));
}

export function usePlaybackCoverPath(): string | null {
  return usePlaybackStoreSelector((state) => {
    const coverPath = state.playerState.currentTrack?.coverPath?.trim();
    return coverPath || null;
  });
}

export function usePlaybackStatsRefreshKey(): string {
  return usePlaybackStoreSelector((state) => {
    const trackID = state.playerState.currentTrack?.id ?? 0;
    return `${state.playerState.status}:${trackID}`;
  });
}

export function usePlaybackProgressPositionMS(): number {
  return usePlaybackProgressStoreSelector((state) => state.positionMs);
}

export function usePlaybackProgressDurationMS(): number {
  return usePlaybackProgressStoreSelector((state) => state.durationMs);
}

export function usePlaybackSeekMax(): number {
  const durationMs = usePlaybackProgressDurationMS();
  return Math.max(durationMs, 1);
}

export function usePlaybackSeekValue(): number {
  const positionMs = usePlaybackProgressPositionMS();
  const seekMax = usePlaybackSeekMax();
  return Math.min(positionMs, seekMax);
}

function usePlaybackStoreApi(): PlaybackStore {
  const playbackStore = useContext(PlaybackStoreContext);
  if (!playbackStore) {
    throw new Error("Playback store is missing. Wrap with PlaybackStoreProvider.");
  }

  return playbackStore;
}

function usePlaybackProgressStoreApi(): PlaybackProgressStore {
  const playbackProgressStore = useContext(PlaybackProgressStoreContext);
  if (!playbackProgressStore) {
    throw new Error(
      "Playback progress store is missing. Wrap with PlaybackStoreProvider.",
    );
  }

  return playbackProgressStore;
}
