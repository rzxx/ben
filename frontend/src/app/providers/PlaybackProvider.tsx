import { Events } from "@wailsio/runtime";
import {
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
} from "../services/gateway/playbackGateway";
import { PlayerState, QueueState } from "../../features/types";
import {
  parseError,
  playerStateEvent,
  queueStateEvent,
} from "../utils/appUtils";
import { useBootstrap } from "./BootstrapContext";
import {
  PlaybackContext,
  PlaybackContextValue,
  PlaybackCoverPathContext,
  PlaybackStatsRefreshKeyContext,
  QueueRepeatMode,
} from "./PlaybackContext";

type PlaybackProviderProps = {
  children: ReactNode;
};

export function PlaybackProvider(props: PlaybackProviderProps) {
  const { state: bootstrapState } = useBootstrap();

  const [queueState, setQueueState] = useState<QueueState | null>(null);
  const [playerState, setPlayerState] = useState<PlayerState | null>(null);
  const [transportBusy, setTransportBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const seekRequestInFlightRef = useRef(false);
  const pendingSeekMSRef = useRef<number | null>(null);

  const resolvedQueueState = queueState ?? bootstrapState.queueState;
  const resolvedPlayerState = playerState ?? bootstrapState.playerState;

  useEffect(() => {
    const unsubscribeQueue = Events.On(queueStateEvent, (event) => {
      setQueueState(event.data as QueueState);
    });

    const unsubscribePlayer = Events.On(playerStateEvent, (event) => {
      setPlayerState(event.data as PlayerState);
    });

    return () => {
      unsubscribeQueue();
      unsubscribePlayer();
    };
  }, []);

  const setQueueAction = useCallback(
    async (trackIDs: number[], autoplay: boolean, startIndex = 0) => {
      if (trackIDs.length === 0) {
        return;
      }

      try {
        setErrorMessage(null);
        await setQueue(trackIDs, startIndex);
        if (autoplay) {
          await play();
        }
      } catch (error) {
        setErrorMessage(parseError(error));
      }
    },
    [],
  );

  const appendTrackAction = useCallback(async (trackID: number) => {
    try {
      setErrorMessage(null);
      await appendTracks([trackID]);
    } catch (error) {
      setErrorMessage(parseError(error));
    }
  }, []);

  const playTrackNowAction = useCallback(
    async (trackID: number) => {
      await setQueueAction([trackID], true);
    },
    [setQueueAction],
  );

  const selectQueueIndexAction = useCallback(
    async (index: number) => {
      try {
        setErrorMessage(null);
        await setCurrentQueueIndex(index);
        if (resolvedPlayerState.status === "playing") {
          await play();
        }
      } catch (error) {
        setErrorMessage(parseError(error));
      }
    },
    [resolvedPlayerState.status],
  );

  const removeQueueTrackAction = useCallback(async (index: number) => {
    try {
      setErrorMessage(null);
      await removeQueueTrack(index);
    } catch (error) {
      setErrorMessage(parseError(error));
    }
  }, []);

  const clearQueueAction = useCallback(async () => {
    try {
      setErrorMessage(null);
      await clearQueue();
    } catch (error) {
      setErrorMessage(parseError(error));
    }
  }, []);

  const toggleShuffleAction = useCallback(async () => {
    try {
      setErrorMessage(null);
      await setQueueShuffle(!resolvedQueueState.shuffle);
    } catch (error) {
      setErrorMessage(parseError(error));
    }
  }, [resolvedQueueState.shuffle]);

  const setRepeatModeAction = useCallback(async (mode: QueueRepeatMode) => {
    try {
      setErrorMessage(null);
      await setQueueRepeatMode(mode);
    } catch (error) {
      setErrorMessage(parseError(error));
    }
  }, []);

  const cycleRepeatAction = useCallback(async () => {
    const nextMode = nextRepeatMode(resolvedQueueState.repeatMode);
    await setRepeatModeAction(nextMode);
  }, [resolvedQueueState.repeatMode, setRepeatModeAction]);

  const togglePlaybackAction = useCallback(async () => {
    if (transportBusy) {
      return;
    }

    try {
      setTransportBusy(true);
      setErrorMessage(null);
      await togglePlayback();
    } catch (error) {
      setErrorMessage(parseError(error));
    } finally {
      setTransportBusy(false);
    }
  }, [transportBusy]);

  const nextTrackAction = useCallback(async () => {
    if (transportBusy) {
      return;
    }

    try {
      setTransportBusy(true);
      setErrorMessage(null);
      await nextTrack();
    } catch (error) {
      setErrorMessage(parseError(error));
    } finally {
      setTransportBusy(false);
    }
  }, [transportBusy]);

  const previousTrackAction = useCallback(async () => {
    if (transportBusy) {
      return;
    }

    try {
      setTransportBusy(true);
      setErrorMessage(null);
      await previousTrack();
    } catch (error) {
      setErrorMessage(parseError(error));
    } finally {
      setTransportBusy(false);
    }
  }, [transportBusy]);

  const seekAction = useCallback(
    async (positionMS: number) => {
      if (!resolvedPlayerState.currentTrack) {
        return;
      }

      pendingSeekMSRef.current = positionMS;
      if (seekRequestInFlightRef.current) {
        return;
      }

      seekRequestInFlightRef.current = true;

      try {
        while (pendingSeekMSRef.current !== null) {
          const nextSeekMS = pendingSeekMSRef.current;
          pendingSeekMSRef.current = null;
          if (nextSeekMS === null) {
            continue;
          }

          try {
            setErrorMessage(null);
            await seek(nextSeekMS);
          } catch (error) {
            setErrorMessage(parseError(error));
          }
        }
      } finally {
        seekRequestInFlightRef.current = false;
      }
    },
    [resolvedPlayerState.currentTrack],
  );

  const setVolumeAction = useCallback(async (volume: number) => {
    try {
      setErrorMessage(null);
      await setVolume(volume);
    } catch (error) {
      setErrorMessage(parseError(error));
    }
  }, []);

  const playAlbumAction = useCallback(
    async (title: string, albumArtist: string) => {
      try {
        setErrorMessage(null);
        const trackIDs = (await getAlbumQueueTrackIDs(title, albumArtist)) as number[];
        await setQueueAction(trackIDs ?? [], true);
      } catch (error) {
        setErrorMessage(parseError(error));
      }
    },
    [setQueueAction],
  );

  const playTrackFromAlbumAction = useCallback(
    async (title: string, albumArtist: string, trackID: number) => {
      try {
        setErrorMessage(null);
        const trackIDs = (await getAlbumQueueTrackIDsFromTrack(
          title,
          albumArtist,
          trackID,
        )) as number[];
        const queueTrackIDs = trackIDs ?? [];
        const startIndex = queueTrackIDs.indexOf(trackID);
        if (startIndex < 0) {
          throw new Error("Selected track is not part of the album queue.");
        }

        await setQueueAction(queueTrackIDs, true, startIndex);
      } catch (error) {
        setErrorMessage(parseError(error));
      }
    },
    [setQueueAction],
  );

  const playArtistTracksAction = useCallback(
    async (artistName: string) => {
      try {
        setErrorMessage(null);
        const trackIDs = (await getArtistQueueTrackIDs(artistName)) as number[];
        await setQueueAction(trackIDs ?? [], true);
      } catch (error) {
        setErrorMessage(parseError(error));
      }
    },
    [setQueueAction],
  );

  const playArtistTopTrackAction = useCallback(
    async (artistName: string, trackID: number) => {
      try {
        setErrorMessage(null);
        const trackIDs = (await getArtistQueueTrackIDsFromTopTrack(
          artistName,
          trackID,
        )) as number[];
        const queueTrackIDs = trackIDs ?? [];
        const startIndex = queueTrackIDs.indexOf(trackID);
        if (startIndex < 0) {
          throw new Error("Selected track is not part of the artist queue.");
        }

        await setQueueAction(queueTrackIDs, true, startIndex);
      } catch (error) {
        setErrorMessage(parseError(error));
      }
    },
    [setQueueAction],
  );

  const clearErrorAction = useCallback(() => {
    setErrorMessage(null);
  }, []);

  const hasCurrentTrack = Boolean(resolvedPlayerState.currentTrack);
  const seekMax = Math.max(resolvedPlayerState.durationMs ?? 0, 1);
  const seekValue = Math.min(resolvedPlayerState.positionMs, seekMax);
  const statsRefreshKey = `${resolvedPlayerState.status}:${resolvedPlayerState.currentTrack?.id ?? 0}`;
  const currentCoverPath = resolvedPlayerState.currentTrack?.coverPath?.trim() || null;

  const contextValue = useMemo<PlaybackContextValue>(
    () => ({
      state: {
        queueState: resolvedQueueState,
        playerState: resolvedPlayerState,
        transportBusy,
        errorMessage,
      },
      actions: {
        setQueue: setQueueAction,
        appendTrack: appendTrackAction,
        playTrackNow: playTrackNowAction,
        selectQueueIndex: selectQueueIndexAction,
        removeQueueTrack: removeQueueTrackAction,
        clearQueue: clearQueueAction,
        toggleShuffle: toggleShuffleAction,
        setRepeatMode: setRepeatModeAction,
        cycleRepeat: cycleRepeatAction,
        togglePlayback: togglePlaybackAction,
        nextTrack: nextTrackAction,
        previousTrack: previousTrackAction,
        seek: seekAction,
        setVolume: setVolumeAction,
        playAlbum: playAlbumAction,
        playTrackFromAlbum: playTrackFromAlbumAction,
        playArtistTracks: playArtistTracksAction,
        playArtistTopTrack: playArtistTopTrackAction,
        clearError: clearErrorAction,
      },
      meta: {
        hasCurrentTrack,
        seekMax,
        seekValue,
      },
    }),
    [
      appendTrackAction,
      clearErrorAction,
      clearQueueAction,
      cycleRepeatAction,
      errorMessage,
      hasCurrentTrack,
      nextTrackAction,
      playAlbumAction,
      playArtistTopTrackAction,
      playArtistTracksAction,
      playTrackFromAlbumAction,
      playTrackNowAction,
      resolvedPlayerState,
      previousTrackAction,
      resolvedQueueState,
      removeQueueTrackAction,
      seekAction,
      seekMax,
      seekValue,
      selectQueueIndexAction,
      setQueueAction,
      setRepeatModeAction,
      setVolumeAction,
      togglePlaybackAction,
      toggleShuffleAction,
      transportBusy,
    ],
  );

  return (
    <PlaybackContext.Provider value={contextValue}>
      <PlaybackStatsRefreshKeyContext.Provider value={statsRefreshKey}>
        <PlaybackCoverPathContext.Provider value={currentCoverPath}>
          {props.children}
        </PlaybackCoverPathContext.Provider>
      </PlaybackStatsRefreshKeyContext.Provider>
    </PlaybackContext.Provider>
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
