import { createStore, type StoreApi } from "zustand/vanilla";
import type { LibraryTrack, PlayerState, QueueState } from "../../../features/types";
import {
  appendTracks,
  clearQueue,
  getAlbumQueueTrackIDs,
  getAlbumQueueTrackIDsFromTrack,
  getArtistQueueTrackIDs,
  getArtistQueueTrackIDsFromTopTrack,
  nextTrack,
  play,
  previousTrack,
  removeQueueTrack,
  seek,
  setCurrentQueueIndex,
  setQueue,
  setQueueRepeatMode,
  setQueueShuffle,
  setVolume,
  togglePlayback,
} from "../../services/gateway/playbackGateway";
import { toDomainErrorMessage } from "../../services/domainError";
import { createEmptyPlayerState, createEmptyQueueState } from "../../utils/appUtils";

export type QueueRepeatMode = "off" | "all" | "one";

export type PlaybackBootstrapSnapshot = {
  queueState: QueueState;
  playerState: PlayerState;
};

export type PlaybackActions = {
  hydrateFromBootstrap: (snapshot: PlaybackBootstrapSnapshot) => void;
  applyQueueStateFromEvent: (queueState: QueueState) => void;
  applyPlayerStateFromEvent: (playerState: PlayerState) => void;
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

export type PlaybackStoreState = {
  queueState: QueueState;
  playerState: PlayerState;
  transportBusy: boolean;
  errorMessage: string | null;
  hasHydratedFromBootstrap: boolean;
  actions: PlaybackActions;
};

export type PlaybackStore = StoreApi<PlaybackStoreState>;

export function createPlaybackStore(
  initialSnapshot?: PlaybackBootstrapSnapshot,
): PlaybackStore {
  const initialQueueState = initialSnapshot?.queueState ?? createEmptyQueueState();
  const initialPlayerState =
    initialSnapshot?.playerState ?? createEmptyPlayerState();

  let seekRequestInFlight = false;
  let pendingSeekMS: number | null = null;

  return createStore<PlaybackStoreState>((set, get) => {
    const setErrorMessage = (message: string | null) => {
      set({ errorMessage: message });
    };

    const runAction = async (requestFactory: () => Promise<unknown>) => {
      setErrorMessage(null);
      try {
        await requestFactory();
      } catch (error) {
        setErrorMessage(toDomainErrorMessage(error));
      }
    };

    const runTransportAction = async (requestFactory: () => Promise<unknown>) => {
      if (get().transportBusy) {
        return;
      }

      set({ transportBusy: true, errorMessage: null });
      try {
        await requestFactory();
      } catch (error) {
        setErrorMessage(toDomainErrorMessage(error));
      } finally {
        set({ transportBusy: false });
      }
    };

    const actions: PlaybackActions = {
      hydrateFromBootstrap: (snapshot) => {
        set((state) => {
          if (state.hasHydratedFromBootstrap) {
            return state;
          }

          return {
            queueState: snapshot.queueState,
            playerState: snapshot.playerState,
            hasHydratedFromBootstrap: true,
          };
        });
      },
      applyQueueStateFromEvent: (queueState) => {
        set({ queueState, hasHydratedFromBootstrap: true });
      },
      applyPlayerStateFromEvent: (playerState) => {
        set((state) => {
          if (isSameColdPlayerState(state.playerState, playerState)) {
            if (state.hasHydratedFromBootstrap) {
              return state;
            }

            return {
              hasHydratedFromBootstrap: true,
            };
          }

          return {
            playerState: {
              ...playerState,
              positionMs: state.playerState.positionMs,
              durationMs: state.playerState.durationMs,
            },
            hasHydratedFromBootstrap: true,
          };
        });
      },
      setQueue: async (trackIDs, autoplay, startIndex = 0) => {
        if (trackIDs.length === 0) {
          return;
        }

        await runAction(async () => {
          await setQueue(trackIDs, startIndex);
          if (autoplay) {
            await play();
          }
        });
      },
      appendTrack: async (trackID) => {
        await runAction(async () => {
          await appendTracks([trackID]);
        });
      },
      playTrackNow: async (trackID) => {
        await get().actions.setQueue([trackID], true);
      },
      selectQueueIndex: async (index) => {
        await runAction(async () => {
          await setCurrentQueueIndex(index);
          if (get().playerState.status === "playing") {
            await play();
          }
        });
      },
      removeQueueTrack: async (index) => {
        await runAction(async () => {
          await removeQueueTrack(index);
        });
      },
      clearQueue: async () => {
        await runAction(async () => {
          await clearQueue();
        });
      },
      toggleShuffle: async () => {
        await runAction(async () => {
          await setQueueShuffle(!get().queueState.shuffle);
        });
      },
      setRepeatMode: async (mode) => {
        await runAction(async () => {
          await setQueueRepeatMode(mode);
        });
      },
      cycleRepeat: async () => {
        await get().actions.setRepeatMode(nextRepeatMode(get().queueState.repeatMode));
      },
      togglePlayback: async () => {
        await runTransportAction(async () => {
          await togglePlayback();
        });
      },
      nextTrack: async () => {
        await runTransportAction(async () => {
          await nextTrack();
        });
      },
      previousTrack: async () => {
        await runTransportAction(async () => {
          await previousTrack();
        });
      },
      seek: async (positionMS) => {
        if (!get().playerState.currentTrack) {
          return;
        }

        pendingSeekMS = positionMS;
        if (seekRequestInFlight) {
          return;
        }

        seekRequestInFlight = true;

        try {
          while (pendingSeekMS !== null) {
            const nextSeekMS = pendingSeekMS;
            pendingSeekMS = null;
            if (nextSeekMS === null) {
              continue;
            }

            try {
              setErrorMessage(null);
              await seek(nextSeekMS);
            } catch (error) {
              setErrorMessage(toDomainErrorMessage(error));
            }
          }
        } finally {
          seekRequestInFlight = false;
        }
      },
      setVolume: async (volume) => {
        await runAction(async () => {
          await setVolume(volume);
        });
      },
      playAlbum: async (title, albumArtist) => {
        await runAction(async () => {
          const trackIDs = await getAlbumQueueTrackIDs(title, albumArtist);
          await get().actions.setQueue(trackIDs ?? [], true);
        });
      },
      playTrackFromAlbum: async (title, albumArtist, trackID) => {
        await runAction(async () => {
          const trackIDs = await getAlbumQueueTrackIDsFromTrack(
            title,
            albumArtist,
            trackID,
          );
          const queueTrackIDs = trackIDs ?? [];
          const startIndex = queueTrackIDs.indexOf(trackID);
          if (startIndex < 0) {
            throw new Error("Selected track is not part of the album queue.");
          }

          await get().actions.setQueue(queueTrackIDs, true, startIndex);
        });
      },
      playArtistTracks: async (artistName) => {
        await runAction(async () => {
          const trackIDs = await getArtistQueueTrackIDs(artistName);
          await get().actions.setQueue(trackIDs ?? [], true);
        });
      },
      playArtistTopTrack: async (artistName, trackID) => {
        await runAction(async () => {
          const trackIDs = await getArtistQueueTrackIDsFromTopTrack(
            artistName,
            trackID,
          );
          const queueTrackIDs = trackIDs ?? [];
          const startIndex = queueTrackIDs.indexOf(trackID);
          if (startIndex < 0) {
            throw new Error("Selected track is not part of the artist queue.");
          }

          await get().actions.setQueue(queueTrackIDs, true, startIndex);
        });
      },
      clearError: () => {
        setErrorMessage(null);
      },
    };

    return {
      queueState: initialQueueState,
      playerState: initialPlayerState,
      transportBusy: false,
      errorMessage: null,
      hasHydratedFromBootstrap: false,
      actions,
    };
  });
}

function isSameColdPlayerState(current: PlayerState, next: PlayerState): boolean {
  return (
    current.status === next.status &&
    current.volume === next.volume &&
    current.currentIndex === next.currentIndex &&
    current.queueLength === next.queueLength &&
    areTracksEqual(current.currentTrack, next.currentTrack)
  );
}

function areTracksEqual(
  currentTrack: LibraryTrack | undefined,
  nextTrack: LibraryTrack | undefined,
): boolean {
  if (!currentTrack && !nextTrack) {
    return true;
  }

  if (!currentTrack || !nextTrack) {
    return false;
  }

  return (
    currentTrack.id === nextTrack.id &&
    currentTrack.path === nextTrack.path &&
    currentTrack.title === nextTrack.title &&
    currentTrack.artist === nextTrack.artist &&
    currentTrack.album === nextTrack.album &&
    currentTrack.albumArtist === nextTrack.albumArtist &&
    currentTrack.discNo === nextTrack.discNo &&
    currentTrack.trackNo === nextTrack.trackNo &&
    currentTrack.durationMs === nextTrack.durationMs &&
    currentTrack.coverPath === nextTrack.coverPath
  );
}

function nextRepeatMode(repeatMode: string): QueueRepeatMode {
  if (repeatMode === "off") {
    return "all";
  }
  if (repeatMode === "all") {
    return "one";
  }

  return "off";
}
