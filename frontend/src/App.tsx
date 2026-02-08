import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Redirect, Route, Router, Switch, useLocation } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { Call, Events } from "@wailsio/runtime";
import { LibraryView } from "./features/library/LibraryView";
import { PlayerBar } from "./features/player/PlayerBar";
import { QueueView } from "./features/queue/QueueView";
import { SettingsView } from "./features/settings/SettingsView";
import {
  AlbumDetail,
  ArtistDetail,
  LibraryAlbum,
  LibraryArtist,
  LibraryTrack,
  PageInfo,
  PagedResult,
  PlayerState,
  QueueState,
  ScanProgress,
  ScanStatus,
  WatchedRoot,
} from "./features/types";
import { useLibraryUIStore } from "./shared/store/libraryUIStore";

const settingsService = "main.SettingsService";
const libraryService = "main.LibraryService";
const scannerService = "main.ScannerService";
const queueService = "main.QueueService";
const playerService = "main.PlayerService";

const scanProgressEvent = "scanner:progress";
const queueStateEvent = "queue:state";
const playerStateEvent = "player:state";

const browsePageSize = 10;
const detailPageSize = 14;
const appMemoryLocation = memoryLocation({ path: "/library" });

function createEmptyPage(limit: number, offset: number): PageInfo {
  return {
    limit,
    offset,
    total: 0,
  };
}

function createEmptyQueueState(): QueueState {
  return {
    entries: [],
    currentIndex: -1,
    repeatMode: "off",
    shuffle: false,
    total: 0,
    updatedAt: "",
  };
}

function createEmptyPlayerState(): PlayerState {
  return {
    status: "stopped",
    positionMs: 0,
    volume: 80,
    currentIndex: -1,
    queueLength: 0,
    updatedAt: "",
  };
}

function normalizePagedResult<T>(
  value: unknown,
  limit: number,
  offset: number,
): PagedResult<T> {
  const parsed = value as PagedResult<T> | null;
  if (!parsed || !Array.isArray(parsed.items) || !parsed.page) {
    return {
      items: [],
      page: createEmptyPage(limit, offset),
    };
  }

  return parsed;
}

function AppContent() {
  const [location, navigate] = useLocation();

  const libraryQueryInput = useLibraryUIStore((state) => state.libraryQueryInput);
  const libraryQuery = useLibraryUIStore((state) => state.libraryQuery);
  const artistOffset = useLibraryUIStore((state) => state.artistOffset);
  const albumOffset = useLibraryUIStore((state) => state.albumOffset);
  const trackOffset = useLibraryUIStore((state) => state.trackOffset);
  const selectedArtist = useLibraryUIStore((state) => state.selectedArtist);
  const selectedAlbum = useLibraryUIStore((state) => state.selectedAlbum);
  const setLibraryQueryInput = useLibraryUIStore((state) => state.setLibraryQueryInput);
  const submitLibrarySearch = useLibraryUIStore((state) => state.submitLibrarySearch);
  const setArtistOffset = useLibraryUIStore((state) => state.setArtistOffset);
  const setAlbumOffset = useLibraryUIStore((state) => state.setAlbumOffset);
  const setTrackOffset = useLibraryUIStore((state) => state.setTrackOffset);
  const selectArtist = useLibraryUIStore((state) => state.selectArtist);
  const selectAlbum = useLibraryUIStore((state) => state.selectAlbum);

  const [watchedRoots, setWatchedRoots] = useState<WatchedRoot[]>([]);
  const [newRootPath, setNewRootPath] = useState("");
  const [scanStatus, setScanStatus] = useState<ScanStatus>({ running: false });
  const [lastProgress, setLastProgress] = useState<ScanProgress | null>(null);
  const [queueState, setQueueState] = useState<QueueState>(createEmptyQueueState());
  const [playerState, setPlayerState] = useState<PlayerState>(createEmptyPlayerState());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [transportBusy, setTransportBusy] = useState(false);

  const [artistsPage, setArtistsPage] = useState<PagedResult<LibraryArtist>>({
    items: [],
    page: createEmptyPage(browsePageSize, 0),
  });
  const [albumsPage, setAlbumsPage] = useState<PagedResult<LibraryAlbum>>({
    items: [],
    page: createEmptyPage(browsePageSize, 0),
  });
  const [tracksPage, setTracksPage] = useState<PagedResult<LibraryTrack>>({
    items: [],
    page: createEmptyPage(browsePageSize, 0),
  });

  const [artistDetail, setArtistDetail] = useState<ArtistDetail | null>(null);
  const [albumDetail, setAlbumDetail] = useState<AlbumDetail | null>(null);

  const loadWatchedRoots = useCallback(async () => {
    const roots = await Call.ByName(`${settingsService}.ListWatchedRoots`);
    setWatchedRoots((roots ?? []) as WatchedRoot[]);
  }, []);

  const loadScanStatus = useCallback(async () => {
    const status = await Call.ByName(`${scannerService}.GetStatus`);
    setScanStatus((status ?? { running: false }) as ScanStatus);
  }, []);

  const loadQueueState = useCallback(async () => {
    const state = await Call.ByName(`${queueService}.GetState`);
    setQueueState((state ?? createEmptyQueueState()) as QueueState);
  }, []);

  const loadPlayerState = useCallback(async () => {
    const state = await Call.ByName(`${playerService}.GetState`);
    setPlayerState((state ?? createEmptyPlayerState()) as PlayerState);
  }, []);

  const loadLibraryData = useCallback(async () => {
    const [artistRows, albumRows, trackRows] = await Promise.all([
      Call.ByName(
        `${libraryService}.ListArtists`,
        libraryQuery,
        browsePageSize,
        artistOffset,
      ),
      Call.ByName(
        `${libraryService}.ListAlbums`,
        libraryQuery,
        "",
        browsePageSize,
        albumOffset,
      ),
      Call.ByName(
        `${libraryService}.ListTracks`,
        libraryQuery,
        "",
        "",
        browsePageSize,
        trackOffset,
      ),
    ]);

    setArtistsPage(normalizePagedResult<LibraryArtist>(artistRows, browsePageSize, artistOffset));
    setAlbumsPage(normalizePagedResult<LibraryAlbum>(albumRows, browsePageSize, albumOffset));
    setTracksPage(normalizePagedResult<LibraryTrack>(trackRows, browsePageSize, trackOffset));
  }, [albumOffset, artistOffset, libraryQuery, trackOffset]);

  const loadArtistDetail = useCallback(async (name: string) => {
    const detail = await Call.ByName(
      `${libraryService}.GetArtistDetail`,
      name,
      detailPageSize,
      0,
    );
    setArtistDetail((detail ?? null) as ArtistDetail | null);
  }, []);

  const loadAlbumDetail = useCallback(async (title: string, albumArtist: string) => {
    const detail = await Call.ByName(
      `${libraryService}.GetAlbumDetail`,
      title,
      albumArtist,
      detailPageSize,
      0,
    );
    setAlbumDetail((detail ?? null) as AlbumDetail | null);
  }, []);

  useEffect(() => {
    const initialize = async () => {
      try {
        await Promise.all([
          loadWatchedRoots(),
          loadScanStatus(),
          loadQueueState(),
          loadPlayerState(),
        ]);
      } catch (error) {
        setErrorMessage(parseError(error));
      }
    };

    const unsubscribeScanner = Events.On(scanProgressEvent, (event) => {
      const progress = event.data as ScanProgress;
      setLastProgress(progress);
      void loadScanStatus();

      if (progress.status === "completed") {
        void loadLibraryData();

        if (selectedArtist) {
          void loadArtistDetail(selectedArtist);
        }

        if (selectedAlbum) {
          void loadAlbumDetail(selectedAlbum.title, selectedAlbum.albumArtist);
        }
      }
    });

    const unsubscribeQueue = Events.On(queueStateEvent, (event) => {
      setQueueState(event.data as QueueState);
    });

    const unsubscribePlayer = Events.On(playerStateEvent, (event) => {
      setPlayerState(event.data as PlayerState);
    });

    void initialize();

    return () => {
      unsubscribeScanner();
      unsubscribeQueue();
      unsubscribePlayer();
    };
  }, [
    loadAlbumDetail,
    loadArtistDetail,
    loadLibraryData,
    loadPlayerState,
    loadQueueState,
    loadScanStatus,
    loadWatchedRoots,
    selectedAlbum,
    selectedArtist,
  ]);

  useEffect(() => {
    const runLoad = async () => {
      try {
        setErrorMessage(null);
        await loadLibraryData();
      } catch (error) {
        setErrorMessage(parseError(error));
      }
    };

    void runLoad();
  }, [loadLibraryData]);

  useEffect(() => {
    if (!selectedArtist) {
      return;
    }

    const runLoad = async () => {
      try {
        setErrorMessage(null);
        await loadArtistDetail(selectedArtist);
      } catch (error) {
        setErrorMessage(parseError(error));
      }
    };

    void runLoad();
  }, [loadArtistDetail, selectedArtist]);

  useEffect(() => {
    if (!selectedAlbum) {
      return;
    }

    const runLoad = async () => {
      try {
        setErrorMessage(null);
        await loadAlbumDetail(selectedAlbum.title, selectedAlbum.albumArtist);
      } catch (error) {
        setErrorMessage(parseError(error));
      }
    };

    void runLoad();
  }, [loadAlbumDetail, selectedAlbum]);

  const onAddWatchedRoot = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newRootPath.trim()) {
      return;
    }

    try {
      setErrorMessage(null);
      await Call.ByName(`${settingsService}.AddWatchedRoot`, newRootPath.trim());
      setNewRootPath("");
      await loadWatchedRoots();
    } catch (error) {
      setErrorMessage(parseError(error));
    }
  };

  const onToggleWatchedRoot = async (root: WatchedRoot) => {
    try {
      setErrorMessage(null);
      await Call.ByName(
        `${settingsService}.SetWatchedRootEnabled`,
        root.id,
        !root.enabled,
      );
      await loadWatchedRoots();
    } catch (error) {
      setErrorMessage(parseError(error));
    }
  };

  const onRemoveWatchedRoot = async (id: number) => {
    try {
      setErrorMessage(null);
      await Call.ByName(`${settingsService}.RemoveWatchedRoot`, id);
      await loadWatchedRoots();
    } catch (error) {
      setErrorMessage(parseError(error));
    }
  };

  const onRunFullScan = async () => {
    try {
      setErrorMessage(null);
      await Call.ByName(`${scannerService}.TriggerFullScan`);
      await loadScanStatus();
    } catch (error) {
      setErrorMessage(parseError(error));
    }
  };

  const onRunIncrementalScan = async () => {
    try {
      setErrorMessage(null);
      await Call.ByName(`${scannerService}.TriggerIncrementalScan`);
      await loadScanStatus();
    } catch (error) {
      setErrorMessage(parseError(error));
    }
  };

  const onSubmitLibrarySearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submitLibrarySearch();
    setArtistDetail(null);
    setAlbumDetail(null);
  };

  const onSelectArtist = (name: string) => {
    setArtistDetail(null);
    setAlbumDetail(null);
    selectArtist(name);
  };

  const onSelectAlbum = (title: string, albumArtist: string) => {
    setAlbumDetail(null);
    selectAlbum({
      title,
      albumArtist,
    });
  };

  const onSetQueue = async (trackIDs: number[], autoplay: boolean) => {
    if (trackIDs.length === 0) {
      return;
    }

    try {
      setErrorMessage(null);
      await Call.ByName(`${queueService}.SetQueue`, trackIDs, 0);
      if (autoplay) {
        await Call.ByName(`${playerService}.Play`);
      }
    } catch (error) {
      setErrorMessage(parseError(error));
    }
  };

  const onAppendTrack = async (trackID: number) => {
    try {
      setErrorMessage(null);
      await Call.ByName(`${queueService}.AppendTracks`, [trackID]);
    } catch (error) {
      setErrorMessage(parseError(error));
    }
  };

  const onPlayTrackNow = async (trackID: number) => {
    await onSetQueue([trackID], true);
  };

  const onSelectQueueIndex = async (index: number) => {
    try {
      setErrorMessage(null);
      await Call.ByName(`${queueService}.SetCurrentIndex`, index);
      if (playerState.status === "playing") {
        await Call.ByName(`${playerService}.Play`);
      }
    } catch (error) {
      setErrorMessage(parseError(error));
    }
  };

  const onRemoveQueueTrack = async (index: number) => {
    try {
      setErrorMessage(null);
      await Call.ByName(`${queueService}.RemoveTrack`, index);
    } catch (error) {
      setErrorMessage(parseError(error));
    }
  };

  const onClearQueue = async () => {
    try {
      setErrorMessage(null);
      await Call.ByName(`${queueService}.Clear`);
    } catch (error) {
      setErrorMessage(parseError(error));
    }
  };

  const onSetRepeatMode = async (mode: "off" | "all" | "one") => {
    try {
      setErrorMessage(null);
      await Call.ByName(`${queueService}.SetRepeatMode`, mode);
    } catch (error) {
      setErrorMessage(parseError(error));
    }
  };

  const onToggleShuffle = async () => {
    try {
      setErrorMessage(null);
      await Call.ByName(`${queueService}.SetShuffle`, !queueState.shuffle);
    } catch (error) {
      setErrorMessage(parseError(error));
    }
  };

  const onTogglePlayback = async () => {
    if (transportBusy) {
      return;
    }

    try {
      setTransportBusy(true);
      setErrorMessage(null);
      await Call.ByName(`${playerService}.TogglePlayback`);
    } catch (error) {
      setErrorMessage(parseError(error));
    } finally {
      setTransportBusy(false);
    }
  };

  const onStopPlayback = async () => {
    if (transportBusy) {
      return;
    }

    try {
      setTransportBusy(true);
      setErrorMessage(null);
      await Call.ByName(`${playerService}.Stop`);
    } catch (error) {
      setErrorMessage(parseError(error));
    } finally {
      setTransportBusy(false);
    }
  };

  const onNextTrack = async () => {
    if (transportBusy) {
      return;
    }

    try {
      setTransportBusy(true);
      setErrorMessage(null);
      await Call.ByName(`${playerService}.Next`);
    } catch (error) {
      setErrorMessage(parseError(error));
    } finally {
      setTransportBusy(false);
    }
  };

  const onPreviousTrack = async () => {
    if (transportBusy) {
      return;
    }

    try {
      setTransportBusy(true);
      setErrorMessage(null);
      await Call.ByName(`${playerService}.Previous`);
    } catch (error) {
      setErrorMessage(parseError(error));
    } finally {
      setTransportBusy(false);
    }
  };

  const onSeek = async (positionMS: number) => {
    try {
      setErrorMessage(null);
      await Call.ByName(`${playerService}.Seek`, positionMS);
    } catch (error) {
      setErrorMessage(parseError(error));
    }
  };

  const onSetVolume = async (volume: number) => {
    try {
      setErrorMessage(null);
      await Call.ByName(`${playerService}.SetVolume`, volume);
    } catch (error) {
      setErrorMessage(parseError(error));
    }
  };

  const artistCanGoBack = artistOffset > 0;
  const artistCanGoNext = artistOffset + artistsPage.page.limit < artistsPage.page.total;
  const albumCanGoBack = albumOffset > 0;
  const albumCanGoNext = albumOffset + albumsPage.page.limit < albumsPage.page.total;
  const trackCanGoBack = trackOffset > 0;
  const trackCanGoNext = trackOffset + tracksPage.page.limit < tracksPage.page.total;

  const currentTrack = playerState.currentTrack;
  const hasCurrentTrack = !!currentTrack;
  const seekMax = Math.max(playerState.durationMs ?? 0, 1);
  const seekValue = Math.min(playerState.positionMs, seekMax);
  const playPauseLabel = playerState.status === "playing" ? "Pause" : "Play";

  const visibleTrackIDs = useMemo(
    () => tracksPage.items.map((track) => track.id),
    [tracksPage.items],
  );

  return (
    <div className="app-shell">
      <header className="top-bar">
        <div>
          <p className="eyebrow">Ben</p>
          <h1>Desktop Music Player</h1>
        </div>
        <div className="scan-actions">
          <button onClick={onRunIncrementalScan} disabled={scanStatus.running}>
            {scanStatus.running ? "Scanning..." : "Run Incremental Scan"}
          </button>
          <button
            className="scan-button"
            onClick={onRunFullScan}
            disabled={scanStatus.running}
          >
            {scanStatus.running ? "Scanning..." : "Run Full Scan"}
          </button>
        </div>
      </header>

      <nav className="main-nav" aria-label="Main sections">
        <button
          className={location.startsWith("/library") ? "active" : ""}
          onClick={() => navigate("/library")}
        >
          Library
        </button>
        <button
          className={location.startsWith("/queue") ? "active" : ""}
          onClick={() => navigate("/queue")}
        >
          Queue
        </button>
        <button
          className={location.startsWith("/settings") ? "active" : ""}
          onClick={() => navigate("/settings")}
        >
          Settings
        </button>
      </nav>

      <main className="panel-grid">
        <Switch>
          <Route path="/">
            <Redirect to="/library" replace />
          </Route>

          <Route path="/library">
            <LibraryView
              libraryQueryInput={libraryQueryInput}
              onLibraryQueryInputChange={setLibraryQueryInput}
              onSubmitLibrarySearch={onSubmitLibrarySearch}
              artistsPage={artistsPage}
              albumsPage={albumsPage}
              tracksPage={tracksPage}
              selectedArtist={selectedArtist}
              selectedAlbum={selectedAlbum}
              artistDetail={artistDetail}
              albumDetail={albumDetail}
              artistCanGoBack={artistCanGoBack}
              artistCanGoNext={artistCanGoNext}
              albumCanGoBack={albumCanGoBack}
              albumCanGoNext={albumCanGoNext}
              trackCanGoBack={trackCanGoBack}
              trackCanGoNext={trackCanGoNext}
              visibleTrackIDs={visibleTrackIDs}
              onSelectArtist={onSelectArtist}
              onSelectAlbum={onSelectAlbum}
              onArtistPrev={() => setArtistOffset(artistOffset - browsePageSize)}
              onArtistNext={() => setArtistOffset(artistOffset + browsePageSize)}
              onAlbumPrev={() => setAlbumOffset(albumOffset - browsePageSize)}
              onAlbumNext={() => setAlbumOffset(albumOffset + browsePageSize)}
              onTrackPrev={() => setTrackOffset(trackOffset - browsePageSize)}
              onTrackNext={() => setTrackOffset(trackOffset + browsePageSize)}
              onSetQueue={onSetQueue}
              onAppendTrack={onAppendTrack}
              onPlayTrackNow={onPlayTrackNow}
            />
          </Route>

          <Route path="/settings">
            <SettingsView
              lastProgress={lastProgress}
              scanStatus={scanStatus}
              watchedRoots={watchedRoots}
              newRootPath={newRootPath}
              errorMessage={errorMessage}
              queueState={queueState}
              playerState={playerState}
              onNewRootPathChange={setNewRootPath}
              onAddWatchedRoot={onAddWatchedRoot}
              onToggleWatchedRoot={onToggleWatchedRoot}
              onRemoveWatchedRoot={onRemoveWatchedRoot}
            />
          </Route>

          <Route path="/queue">
            <QueueView
              queueState={queueState}
              playerState={playerState}
              transportBusy={transportBusy}
              hasCurrentTrack={hasCurrentTrack}
              playPauseLabel={playPauseLabel}
              onPreviousTrack={onPreviousTrack}
              onTogglePlayback={onTogglePlayback}
              onNextTrack={onNextTrack}
              onClearQueue={onClearQueue}
              onSetRepeatMode={onSetRepeatMode}
              onToggleShuffle={onToggleShuffle}
              onSelectQueueIndex={onSelectQueueIndex}
              onRemoveQueueTrack={onRemoveQueueTrack}
            />
          </Route>

          <Route path="*">
            <section className="panel queue-panel">
              <h2>Not Found</h2>
              <p>Choose Library, Queue, or Settings.</p>
            </section>
          </Route>
        </Switch>
      </main>

      <PlayerBar
        currentTrack={currentTrack}
        playerState={playerState}
        queueState={queueState}
        transportBusy={transportBusy}
        hasCurrentTrack={hasCurrentTrack}
        playPauseLabel={playPauseLabel}
        seekMax={seekMax}
        seekValue={seekValue}
        onPreviousTrack={onPreviousTrack}
        onTogglePlayback={onTogglePlayback}
        onStopPlayback={onStopPlayback}
        onNextTrack={onNextTrack}
        onSeek={onSeek}
        onSetVolume={onSetVolume}
        formatDuration={formatDuration}
      />
    </div>
  );
}

function App() {
  return (
    <Router
      hook={appMemoryLocation.hook}
      searchHook={appMemoryLocation.searchHook}
    >
      <AppContent />
    </Router>
  );
}

function formatDuration(durationMS?: number): string {
  if (!durationMS || durationMS < 0) {
    return "0:00";
  }

  const totalSeconds = Math.floor(durationMS / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function parseError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Something went wrong.";
}

export default App;
