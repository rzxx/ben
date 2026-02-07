import { FormEvent, useCallback, useEffect, useState } from "react";
import { Call, Events } from "@wailsio/runtime";

type WatchedRoot = {
  id: number;
  path: string;
  enabled: boolean;
  createdAt: string;
};

type ScanStatus = {
  running: boolean;
  lastRunAt?: string;
  lastMode?: string;
  lastError?: string;
  lastFilesSeen?: number;
  lastIndexed?: number;
  lastSkipped?: number;
};

type ScanProgress = {
  phase: string;
  message: string;
  percent: number;
  status: string;
  at: string;
};

type PageInfo = {
  limit: number;
  offset: number;
  total: number;
};

type PagedResult<T> = {
  items: T[];
  page: PageInfo;
};

type LibraryArtist = {
  name: string;
  trackCount: number;
  albumCount: number;
};

type LibraryAlbum = {
  title: string;
  albumArtist: string;
  year?: number;
  trackCount: number;
};

type LibraryTrack = {
  id: number;
  title: string;
  artist: string;
  album: string;
  albumArtist: string;
  discNo?: number;
  trackNo?: number;
  durationMs?: number;
  path: string;
};

type ArtistDetail = {
  name: string;
  trackCount: number;
  albumCount: number;
  albums: LibraryAlbum[];
  page: PageInfo;
};

type AlbumDetail = {
  title: string;
  albumArtist: string;
  year?: number;
  trackCount: number;
  tracks: LibraryTrack[];
  page: PageInfo;
};

const settingsService = "main.SettingsService";
const libraryService = "main.LibraryService";
const scannerService = "main.ScannerService";
const scanProgressEvent = "scanner:progress";

const browsePageSize = 10;
const detailPageSize = 14;

function createEmptyPage(limit: number, offset: number): PageInfo {
  return {
    limit,
    offset,
    total: 0,
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

function App() {
  const [watchedRoots, setWatchedRoots] = useState<WatchedRoot[]>([]);
  const [newRootPath, setNewRootPath] = useState("");
  const [scanStatus, setScanStatus] = useState<ScanStatus>({ running: false });
  const [lastProgress, setLastProgress] = useState<ScanProgress | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<"library" | "queue" | "settings">(
    "library",
  );

  const [libraryQueryInput, setLibraryQueryInput] = useState("");
  const [libraryQuery, setLibraryQuery] = useState("");
  const [artistOffset, setArtistOffset] = useState(0);
  const [albumOffset, setAlbumOffset] = useState(0);
  const [trackOffset, setTrackOffset] = useState(0);

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

  const [selectedArtist, setSelectedArtist] = useState<string | null>(null);
  const [selectedAlbum, setSelectedAlbum] = useState<{
    title: string;
    albumArtist: string;
  } | null>(null);
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
        await Promise.all([loadWatchedRoots(), loadScanStatus()]);
      } catch (error) {
        setErrorMessage(parseError(error));
      }
    };

    const unsubscribe = Events.On(scanProgressEvent, (event) => {
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

    void initialize();

    return () => {
      unsubscribe();
    };
  }, [
    loadAlbumDetail,
    loadArtistDetail,
    loadLibraryData,
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
    setLibraryQuery(libraryQueryInput.trim());
    setArtistOffset(0);
    setAlbumOffset(0);
    setTrackOffset(0);
    setSelectedArtist(null);
    setSelectedAlbum(null);
    setArtistDetail(null);
    setAlbumDetail(null);
  };

  const artistCanGoBack = artistOffset > 0;
  const artistCanGoNext = artistOffset + artistsPage.page.limit < artistsPage.page.total;
  const albumCanGoBack = albumOffset > 0;
  const albumCanGoNext = albumOffset + albumsPage.page.limit < albumsPage.page.total;
  const trackCanGoBack = trackOffset > 0;
  const trackCanGoNext = trackOffset + tracksPage.page.limit < tracksPage.page.total;

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
          className={activeView === "library" ? "active" : ""}
          onClick={() => setActiveView("library")}
        >
          Library
        </button>
        <button
          className={activeView === "queue" ? "active" : ""}
          onClick={() => setActiveView("queue")}
        >
          Queue
        </button>
        <button
          className={activeView === "settings" ? "active" : ""}
          onClick={() => setActiveView("settings")}
        >
          Settings
        </button>
      </nav>

      <main className="panel-grid">
        {activeView === "library" ? (
          <>
            <section className="panel">
              <h2>Library Browser</h2>
              <p>Paginated data contracts for artists, albums, and tracks.</p>

              <form className="search-form" onSubmit={onSubmitLibrarySearch}>
                <input
                  value={libraryQueryInput}
                  onChange={(event) => setLibraryQueryInput(event.target.value)}
                  placeholder="Search title, artist, or album"
                  autoComplete="off"
                />
                <button type="submit">Search</button>
              </form>

              <div className="stat-list">
                <div>
                  <span>Artists Matched</span>
                  <strong>{artistsPage.page.total}</strong>
                </div>
                <div>
                  <span>Albums Matched</span>
                  <strong>{albumsPage.page.total}</strong>
                </div>
                <div>
                  <span>Tracks Matched</span>
                  <strong>{tracksPage.page.total}</strong>
                </div>
              </div>

              <div className="library-groups">
                <div className="library-group">
                  <h3>Artists</h3>
                  <ul className="entity-list">
                    {artistsPage.items.map((artist) => (
                      <li key={artist.name}>
                        <button
                          className={`entity-button ${selectedArtist === artist.name ? "selected" : ""}`}
                          onClick={() => {
                            setArtistDetail(null);
                            setAlbumDetail(null);
                            setSelectedArtist(artist.name);
                            setSelectedAlbum(null);
                          }}
                        >
                          <strong>{artist.name}</strong>
                          <span>
                            {artist.albumCount} albums - {artist.trackCount} tracks
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <div className="pager">
                    <button
                      disabled={!artistCanGoBack}
                      onClick={() => setArtistOffset((value) => Math.max(0, value - browsePageSize))}
                    >
                      Prev
                    </button>
                    <button
                      disabled={!artistCanGoNext}
                      onClick={() => setArtistOffset((value) => value + browsePageSize)}
                    >
                      Next
                    </button>
                  </div>
                </div>

                <div className="library-group">
                  <h3>Albums</h3>
                  <ul className="entity-list">
                    {albumsPage.items.map((album) => (
                      <li key={`${album.albumArtist}-${album.title}`}>
                        <button
                          className={`entity-button ${
                            selectedAlbum?.title === album.title &&
                            selectedAlbum?.albumArtist === album.albumArtist
                              ? "selected"
                              : ""
                          }`}
                          onClick={() => {
                            setAlbumDetail(null);
                            setSelectedAlbum({
                              title: album.title,
                              albumArtist: album.albumArtist,
                            });
                          }}
                        >
                          <strong>{album.title}</strong>
                          <span>
                            {album.albumArtist}
                            {album.year ? ` (${album.year})` : ""}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <div className="pager">
                    <button
                      disabled={!albumCanGoBack}
                      onClick={() => setAlbumOffset((value) => Math.max(0, value - browsePageSize))}
                    >
                      Prev
                    </button>
                    <button
                      disabled={!albumCanGoNext}
                      onClick={() => setAlbumOffset((value) => value + browsePageSize)}
                    >
                      Next
                    </button>
                  </div>
                </div>

                <div className="library-group">
                  <h3>Tracks</h3>
                  <ul className="entity-list">
                    {tracksPage.items.map((track) => (
                      <li key={track.id}>
                        <div className="entity-row">
                          <strong>{track.title}</strong>
                          <span>
                            {track.artist} - {track.album}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <div className="pager">
                    <button
                      disabled={!trackCanGoBack}
                      onClick={() => setTrackOffset((value) => Math.max(0, value - browsePageSize))}
                    >
                      Prev
                    </button>
                    <button
                      disabled={!trackCanGoNext}
                      onClick={() => setTrackOffset((value) => value + browsePageSize)}
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            </section>

            <section className="panel">
              <h2>Artist Detail</h2>
              {artistDetail ? (
                <>
                  <p className="summary-row">
                    <strong>{artistDetail.name}</strong> - {artistDetail.albumCount} albums - {artistDetail.trackCount} tracks
                  </p>
                  <ul className="entity-list">
                    {artistDetail.albums.map((album) => (
                      <li key={`${album.albumArtist}-${album.title}`}>
                        <div className="entity-row">
                          <strong>{album.title}</strong>
                          <span>
                            {album.albumArtist}
                            {album.year ? ` (${album.year})` : ""} - {album.trackCount} tracks
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p>Select an artist to load album details.</p>
              )}
            </section>

            <section className="panel">
              <h2>Album Detail</h2>
              {albumDetail ? (
                <>
                  <p className="summary-row">
                    <strong>{albumDetail.title}</strong> - {albumDetail.albumArtist}
                    {albumDetail.year ? ` (${albumDetail.year})` : ""} - {albumDetail.trackCount} tracks
                  </p>
                  <ul className="entity-list">
                    {albumDetail.tracks.map((track) => (
                      <li key={track.id}>
                        <div className="entity-row">
                          <strong>
                            {track.discNo ? `${track.discNo}-` : ""}
                            {track.trackNo ? `${track.trackNo}. ` : ""}
                            {track.title}
                          </strong>
                          <span>{track.artist}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p>Select an album to load full track order.</p>
              )}
            </section>
          </>
        ) : null}

        {activeView === "settings" ? (
          <>
            <section className="panel">
              <h2>Scanner Progress</h2>
              <p>
                Full and incremental scans walk folders, upsert changes, and
                reconcile stale track rows.
              </p>
              {lastProgress ? (
                <div className="progress-card">
                  <div className="progress-top">
                    <span>{lastProgress.phase}</span>
                    <span>{lastProgress.percent}%</span>
                  </div>
                  <p>{lastProgress.message}</p>
                  <div className="progress-track">
                    <div style={{ width: `${lastProgress.percent}%` }} />
                  </div>
                </div>
              ) : (
                <p>No progress events yet. Start a full scan to verify wiring.</p>
              )}
              {scanStatus.lastRunAt ? (
                <p>Last run: {new Date(scanStatus.lastRunAt).toLocaleString()}</p>
              ) : null}
              {scanStatus.lastMode ? <p>Mode: {scanStatus.lastMode}</p> : null}
              {scanStatus.lastRunAt ? (
                <div className="scan-totals">
                  <span>Seen: {scanStatus.lastFilesSeen ?? 0}</span>
                  <span>Indexed: {scanStatus.lastIndexed ?? 0}</span>
                  <span>Skipped: {scanStatus.lastSkipped ?? 0}</span>
                </div>
              ) : null}
              {scanStatus.lastError ? (
                <p className="error">{scanStatus.lastError}</p>
              ) : null}
            </section>

            <section className="panel settings-panel">
              <h2>Watched Folders</h2>
              <form onSubmit={onAddWatchedRoot} className="add-form">
                <input
                  type="text"
                  value={newRootPath}
                  onChange={(event) => setNewRootPath(event.target.value)}
                  placeholder="C:\\Music"
                  autoComplete="off"
                />
                <button type="submit">Add</button>
              </form>

              {errorMessage ? <p className="error">{errorMessage}</p> : null}

              <ul className="root-list">
                {watchedRoots.map((root) => (
                  <li key={root.id}>
                    <label>
                      <input
                        type="checkbox"
                        checked={root.enabled}
                        onChange={() => {
                          void onToggleWatchedRoot(root);
                        }}
                      />
                      <span>{root.path}</span>
                    </label>
                    <button
                      onClick={() => {
                        void onRemoveWatchedRoot(root.id);
                      }}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            </section>

            <section className="panel">
              <h2>Library Counters</h2>
              <p>Browse contracts now report totals directly per screen.</p>
              <div className="stat-list">
                <div>
                  <span>Artists</span>
                  <strong>{artistsPage.page.total}</strong>
                </div>
                <div>
                  <span>Albums</span>
                  <strong>{albumsPage.page.total}</strong>
                </div>
                <div>
                  <span>Tracks</span>
                  <strong>{tracksPage.page.total}</strong>
                </div>
              </div>
            </section>
          </>
        ) : null}

        {activeView === "queue" ? (
          <section className="panel queue-panel">
            <h2>Queue</h2>
            <p>
              Queue and playback controls are still pending the Player v1 slice.
            </p>
          </section>
        ) : null}
      </main>

      <footer className="player-bar">
        <div>
          <p className="eyebrow">Player</p>
          <strong>Queue and playback controls ship in the next slice.</strong>
        </div>
        <div className="transport-placeholder">
          <button disabled>Prev</button>
          <button disabled>Play</button>
          <button disabled>Next</button>
        </div>
      </footer>
    </div>
  );
}

function parseError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Something went wrong.";
}

export default App;
