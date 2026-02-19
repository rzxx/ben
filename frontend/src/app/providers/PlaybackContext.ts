import { createContext, useContext } from "react";
import { PlayerState, QueueState } from "../../features/types";

export type QueueRepeatMode = "off" | "all" | "one";

export type PlaybackState = {
  queueState: QueueState;
  playerState: PlayerState;
  transportBusy: boolean;
  errorMessage: string | null;
};

export type PlaybackActions = {
  setQueue: (trackIDs: number[], autoplay: boolean, startIndex?: number) => Promise<void>;
  appendTrack: (trackID: number) => Promise<void>;
  playTrackNow: (trackID: number) => Promise<void>;
  selectQueueIndex: (index: number) => Promise<void>;
  removeQueueTrack: (index: number) => Promise<void>;
  clearQueue: () => Promise<void>;
  toggleShuffle: () => Promise<void>;
  setRepeatMode: (mode: QueueRepeatMode) => Promise<void>;
  cycleRepeat: () => Promise<void>;
  togglePlayback: () => Promise<void>;
  nextTrack: () => Promise<void>;
  previousTrack: () => Promise<void>;
  seek: (positionMS: number) => Promise<void>;
  setVolume: (volume: number) => Promise<void>;
  playAlbum: (title: string, albumArtist: string) => Promise<void>;
  playTrackFromAlbum: (
    title: string,
    albumArtist: string,
    trackID: number,
  ) => Promise<void>;
  playArtistTracks: (artistName: string) => Promise<void>;
  playArtistTopTrack: (artistName: string, trackID: number) => Promise<void>;
  clearError: () => void;
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

export const PlaybackContext = createContext<PlaybackContextValue | null>(null);
export const PlaybackStatsRefreshKeyContext = createContext<string>("idle:0");
export const PlaybackCoverPathContext = createContext<string | null>(null);

export function usePlayback(): PlaybackContextValue {
  const contextValue = useContext(PlaybackContext);
  if (!contextValue) {
    throw new Error("usePlayback must be used within PlaybackProvider");
  }

  return contextValue;
}

export function usePlaybackStatsRefreshKey(): string {
  return useContext(PlaybackStatsRefreshKeyContext);
}

export function usePlaybackCoverPath(): string | null {
  return useContext(PlaybackCoverPathContext);
}
