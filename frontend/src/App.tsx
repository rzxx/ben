import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Redirect, Route, Router, Switch, useLocation } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { Call, Events } from "@wailsio/runtime";
import { ScrollArea } from "@base-ui/react/scroll-area";
import {
  GetDashboard as getStatsDashboard,
  GetOverview as getStatsOverview,
} from "../bindings/ben/statsservice";
import { LeftSidebar } from "./features/layout/LeftSidebar";
import { RightSidebar } from "./features/layout/RightSidebar";
import { TitleBar } from "./features/layout/TitleBar";
import { AlbumDetailView } from "./features/library/AlbumDetailView";
import { AlbumsGridView } from "./features/library/AlbumsGridView";
import { ArtistDetailView } from "./features/library/ArtistDetailView";
import { ArtistsGridView } from "./features/library/ArtistsGridView";
import { TracksListView } from "./features/library/TracksListView";
import { PlayerBar } from "./features/player/PlayerBar";
import { SettingsView } from "./features/settings/SettingsView";
import { StatsView } from "./features/stats/StatsView";
import { BackgroundShader } from "./shared/components/BackgroundShader";
import { useBackgroundShaderStore } from "./shared/store/backgroundShaderStore";
import {
  AlbumDetail,
  ArtistDetail,
  ArtistTopTrack,
  LibraryAlbum,
  LibraryArtist,
  LibraryTrack,
  PageInfo,
  PagedResult,
  PlayerState,
  QueueState,
  ScanProgress,
  ScanStatus,
  SelectedAlbum,
  StatsDashboard,
  StatsOverview,
  StatsRange,
  ThemeExtractOptions,
  ThemeModePreference,
  ThemePalette,
  WatchedRoot,
} from "./features/types";

const settingsService = "main.SettingsService";
const libraryService = "main.LibraryService";
const scannerService = "main.ScannerService";
const queueService = "main.QueueService";
const playerService = "main.PlayerService";
const themeService = "main.ThemeService";

const scanProgressEvent = "scanner:progress";
const queueStateEvent = "queue:state";
const playerStateEvent = "player:state";

const browseLimit = 200;
const detailLimit = 200;
const statsRefreshIntervalMS = 30000;
const appMemoryLocation = memoryLocation({ path: "/albums" });
const maxThemePaletteCacheEntries = 48;
const tailwindThemeTones = [
  50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950,
] as const;
const themeModeStorageKey = "ben.theme-mode";
const darkColorSchemeMediaQuery = "(prefers-color-scheme: dark)";
type ResolvedThemeMode = "light" | "dark";
type TailwindThemeScale = "theme" | "accent";

function parseThemeModePreference(value: string | null): ThemeModePreference {
  if (value === "light" || value === "dark" || value === "system") {
    return value;
  }
  return "system";
}

function resolveThemeMode(
  preference: ThemeModePreference,
  mediaQueryList?: MediaQueryList,
): ResolvedThemeMode {
  if (preference === "light" || preference === "dark") {
    return preference;
  }
  return mediaQueryList?.matches ? "dark" : "light";
}

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
    status: "idle",
    positionMs: 0,
    volume: 80,
    currentIndex: -1,
    queueLength: 0,
    updatedAt: "",
  };
}

function createEmptyStatsOverview(): StatsOverview {
  return {
    totalPlayedMs: 0,
    tracksPlayed: 0,
    completeCount: 0,
    skipCount: 0,
    partialCount: 0,
    topTracks: [],
    topArtists: [],
  };
}

function createEmptyStatsDashboard(range: StatsRange): StatsDashboard {
  return {
    range,
    generatedAt: "",
    summary: {
      totalPlayedMs: 0,
      totalPlays: 0,
      tracksPlayed: 0,
      artistsPlayed: 0,
      albumsPlayed: 0,
      completeCount: 0,
      skipCount: 0,
      partialCount: 0,
      completionRate: 0,
      skipRate: 0,
      partialRate: 0,
      completionScore: 0,
    },
    quality: {
      score: 0,
    },
    discovery: {
      uniqueTracks: 0,
      replayPlays: 0,
      discoveryRatio: 0,
      replayRatio: 0,
      score: 0,
    },
    streak: {
      currentDays: 0,
      longestDays: 0,
    },
    heatmap: [],
    topTracks: [],
    topArtists: [],
    topAlbums: [],
    topGenres: [],
    replayTracks: [],
    hourlyProfile: [],
    weekdayProfile: [],
    peakHour: -1,
    peakWeekday: -1,
    session: {
      sessionCount: 0,
      totalPlayedMs: 0,
      averagePlayedMs: 0,
      longestPlayedMs: 0,
    },
    behaviorWindowDays: 30,
  };
}

function createDefaultThemeExtractOptions(): ThemeExtractOptions {
  return {
    maxDimension: 220,
    quality: 2,
    colorCount: 5,
    candidateCount: 24,
    quantizationBits: 5,
    alphaThreshold: 16,
    ignoreNearWhite: true,
    ignoreNearBlack: false,
    minLuma: 0.02,
    maxLuma: 0.98,
    minChroma: 0.03,
    targetChroma: 0.14,
    maxChroma: 0.32,
    minDelta: 0.08,
    darkBaseLightness: 0.145,
    lightBaseLightness: 0.968,
    darkLightnessDeviation: 0.045,
    lightLightnessDeviation: 0.03,
    darkChromaScale: 0.6,
    lightChromaScale: 0.35,
    workerCount: 0,
  };
}

function buildThemePaletteCacheKey(
  coverPath: string,
  options: ThemeExtractOptions,
): string {
  return `${coverPath}|${JSON.stringify(options)}`;
}

function normalizePagedResult<T>(
  value: unknown,
  limit: number,
): PagedResult<T> {
  const parsed = value as PagedResult<T> | null;
  if (!parsed || !Array.isArray(parsed.items) || !parsed.page) {
    return {
      items: [],
      page: createEmptyPage(limit, 0),
    };
  }

  return parsed;
}

function applyTailwindThemePaletteVariables(
  palette: ThemePalette | null,
  root: HTMLElement = document.documentElement,
) {
  applyPaletteScaleVariables(root, "theme", palette?.themeScale ?? []);
  applyPaletteScaleVariables(root, "accent", palette?.accentScale ?? []);
}

function applyPaletteScaleVariables(
  root: HTMLElement,
  scale: TailwindThemeScale,
  tones: ThemePalette["themeScale"],
) {
  const toneByValue = new Map<number, string>();
  for (const tone of tones) {
    const hex = tone.color?.hex?.trim();
    if (hex) {
      toneByValue.set(tone.tone, hex);
    }
  }

  for (const tone of tailwindThemeTones) {
    const cssVariable = `--color-${scale}-${tone}`;
    const hex = toneByValue.get(tone);
    if (hex) {
      root.style.setProperty(cssVariable, hex);
      continue;
    }
    root.style.removeProperty(cssVariable);
  }
}

function AppContent() {
  const [location, navigate] = useLocation();
  const isStatsRoute = location.startsWith("/stats");

  const [watchedRoots, setWatchedRoots] = useState<WatchedRoot[]>([]);
  const [newRootPath, setNewRootPath] = useState("");
  const [scanStatus, setScanStatus] = useState<ScanStatus>({ running: false });
  const [lastProgress, setLastProgress] = useState<ScanProgress | null>(null);
  const [queueState, setQueueState] = useState<QueueState>(
    createEmptyQueueState(),
  );
  const [playerState, setPlayerState] = useState<PlayerState>(
    createEmptyPlayerState(),
  );
  const [statsOverview, setStatsOverview] = useState<StatsOverview>(
    createEmptyStatsOverview(),
  );
  const [statsRange, setStatsRange] = useState<StatsRange>("short");
  const [statsDashboard, setStatsDashboard] = useState<StatsDashboard>(
    createEmptyStatsDashboard("short"),
  );
  const [themeOptions, setThemeOptions] = useState<ThemeExtractOptions>(
    createDefaultThemeExtractOptions(),
  );
  const [generatedThemePalette, setGeneratedThemePalette] =
    useState<ThemePalette | null>(null);
  const [themeBusy, setThemeBusy] = useState(false);
  const [themeErrorMessage, setThemeErrorMessage] = useState<string | null>(
    null,
  );
  const [themeModePreference, setThemeModePreference] =
    useState<ThemeModePreference>("system");
  const [resolvedThemeMode, setResolvedThemeMode] =
    useState<ResolvedThemeMode>("dark");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [transportBusy, setTransportBusy] = useState(false);

  const [artistsPage, setArtistsPage] = useState<PagedResult<LibraryArtist>>({
    items: [],
    page: createEmptyPage(browseLimit, 0),
  });
  const [albumsPage, setAlbumsPage] = useState<PagedResult<LibraryAlbum>>({
    items: [],
    page: createEmptyPage(browseLimit, 0),
  });
  const [tracksPage, setTracksPage] = useState<PagedResult<LibraryTrack>>({
    items: [],
    page: createEmptyPage(browseLimit, 0),
  });

  const [selectedAlbum, setSelectedAlbum] = useState<SelectedAlbum | null>(
    null,
  );
  const [selectedArtist, setSelectedArtist] = useState<string | null>(null);
  const [albumDetail, setAlbumDetail] = useState<AlbumDetail | null>(null);
  const [artistDetail, setArtistDetail] = useState<ArtistDetail | null>(null);
  const [artistTopTracks, setArtistTopTracks] = useState<ArtistTopTrack[]>([]);
  const [rightSidebarTab, setRightSidebarTab] = useState<"queue" | "details">(
    "queue",
  );

  const setBackgroundThemePalette = useBackgroundShaderStore(
    (state) => state.setThemePalette,
  );
  const setBackgroundThemeMode = useBackgroundShaderStore(
    (state) => state.setThemeMode,
  );

  const statsRefreshKeyRef = useRef("");
  const statsRangeRef = useRef<StatsRange>("short");
  const statsRouteRef = useRef(false);
  const statsOverviewRequestTokenRef = useRef(0);
  const statsDashboardRequestTokenRef = useRef(0);
  const statsOverviewRequestRef = useRef<ReturnType<
    typeof getStatsOverview
  > | null>(null);
  const statsDashboardRequestRef = useRef<ReturnType<
    typeof getStatsDashboard
  > | null>(null);
  const seekRequestInFlightRef = useRef(false);
  const pendingSeekMSRef = useRef<number | null>(null);
  const themeRequestTokenRef = useRef(0);
  const themeOptionsRef = useRef(themeOptions);
  const themePaletteCacheRef = useRef(new Map<string, ThemePalette>());

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

  const loadStatsOverview = useCallback(async () => {
    statsOverviewRequestRef.current?.cancel();
    const requestToken = statsOverviewRequestTokenRef.current + 1;
    statsOverviewRequestTokenRef.current = requestToken;

    const request = getStatsOverview(5);
    statsOverviewRequestRef.current = request;

    try {
      const overview = await request;
      if (requestToken !== statsOverviewRequestTokenRef.current) {
        return;
      }
      setStatsOverview(
        (overview ?? createEmptyStatsOverview()) as StatsOverview,
      );
    } catch (error) {
      if (requestToken !== statsOverviewRequestTokenRef.current) {
        return;
      }
      throw error;
    } finally {
      if (statsOverviewRequestRef.current === request) {
        statsOverviewRequestRef.current = null;
      }
    }
  }, []);

  const loadStatsDashboard = useCallback(async (range: StatsRange) => {
    statsDashboardRequestRef.current?.cancel();
    const requestToken = statsDashboardRequestTokenRef.current + 1;
    statsDashboardRequestTokenRef.current = requestToken;

    const request = getStatsDashboard(range, 10);
    statsDashboardRequestRef.current = request;

    try {
      const dashboard = await request;
      if (requestToken !== statsDashboardRequestTokenRef.current) {
        return;
      }
      setStatsDashboard(
        (dashboard ?? createEmptyStatsDashboard(range)) as StatsDashboard,
      );
    } catch (error) {
      if (requestToken !== statsDashboardRequestTokenRef.current) {
        return;
      }
      throw error;
    } finally {
      if (statsDashboardRequestRef.current === request) {
        statsDashboardRequestRef.current = null;
      }
    }
  }, []);

  const loadThemeDefaults = useCallback(async () => {
    const options = await Call.ByName(`${themeService}.DefaultOptions`);
    setThemeOptions(
      (options ?? createDefaultThemeExtractOptions()) as ThemeExtractOptions,
    );
  }, []);

  const loadLibraryData = useCallback(async () => {
    const [artistRows, albumRows, trackRows] = await Promise.all([
      Call.ByName(`${libraryService}.ListArtists`, "", browseLimit, 0),
      Call.ByName(`${libraryService}.ListAlbums`, "", "", browseLimit, 0),
      Call.ByName(`${libraryService}.ListTracks`, "", "", "", browseLimit, 0),
    ]);

    setArtistsPage(
      normalizePagedResult<LibraryArtist>(artistRows, browseLimit),
    );
    setAlbumsPage(normalizePagedResult<LibraryAlbum>(albumRows, browseLimit));
    setTracksPage(normalizePagedResult<LibraryTrack>(trackRows, browseLimit));
  }, []);

  const loadArtistData = useCallback(async (name: string) => {
    const [detail, topTracks] = await Promise.all([
      Call.ByName(`${libraryService}.GetArtistDetail`, name, detailLimit, 0),
      Call.ByName(`${libraryService}.GetArtistTopTracks`, name, 5),
    ]);

    setArtistDetail((detail ?? null) as ArtistDetail | null);
    setArtistTopTracks((topTracks ?? []) as ArtistTopTrack[]);
  }, []);

  const loadAlbumDetail = useCallback(
    async (title: string, albumArtist: string) => {
      const detail = await Call.ByName(
        `${libraryService}.GetAlbumDetail`,
        title,
        albumArtist,
        detailLimit,
        0,
      );
      setAlbumDetail((detail ?? null) as AlbumDetail | null);
    },
    [],
  );

  useEffect(() => {
    const initialize = async () => {
      try {
        await Promise.all([
          loadWatchedRoots(),
          loadScanStatus(),
          loadQueueState(),
          loadPlayerState(),
          loadStatsOverview(),
          loadThemeDefaults(),
          loadLibraryData(),
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
      }
    });

    const unsubscribeQueue = Events.On(queueStateEvent, (event) => {
      setQueueState(event.data as QueueState);
    });

    const unsubscribePlayer = Events.On(playerStateEvent, (event) => {
      const nextState = event.data as PlayerState;
      setPlayerState(nextState);

      const refreshKey = `${nextState.status}:${nextState.currentTrack?.id ?? 0}`;
      if (refreshKey !== statsRefreshKeyRef.current) {
        statsRefreshKeyRef.current = refreshKey;
        void loadStatsOverview();
        if (statsRouteRef.current) {
          void loadStatsDashboard(statsRangeRef.current);
        }
      }
    });

    void initialize();

    return () => {
      unsubscribeScanner();
      unsubscribeQueue();
      unsubscribePlayer();
    };
  }, [
    loadLibraryData,
    loadPlayerState,
    loadQueueState,
    loadScanStatus,
    loadStatsDashboard,
    loadStatsOverview,
    loadThemeDefaults,
    loadWatchedRoots,
  ]);

  useEffect(() => {
    statsRouteRef.current = isStatsRoute;
  }, [isStatsRoute]);

  useEffect(() => {
    statsRangeRef.current = statsRange;
  }, [statsRange]);

  useEffect(() => {
    if (!isStatsRoute) {
      return;
    }
    void loadStatsOverview();
    void loadStatsDashboard(statsRange);
  }, [isStatsRoute, loadStatsDashboard, loadStatsOverview, statsRange]);

  useEffect(() => {
    return () => {
      statsOverviewRequestTokenRef.current += 1;
      statsDashboardRequestTokenRef.current += 1;
      statsOverviewRequestRef.current?.cancel();
      statsDashboardRequestRef.current?.cancel();
    };
  }, []);

  useEffect(() => {
    themeOptionsRef.current = themeOptions;
  }, [themeOptions]);

  useEffect(() => {
    const storedPreference = parseThemeModePreference(
      window.localStorage.getItem(themeModeStorageKey),
    );
    setThemeModePreference(storedPreference);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(themeModeStorageKey, themeModePreference);
  }, [themeModePreference]);

  useEffect(() => {
    const mediaQueryList = window.matchMedia(darkColorSchemeMediaQuery);

    const applyThemeMode = () => {
      const nextResolvedTheme = resolveThemeMode(
        themeModePreference,
        mediaQueryList,
      );
      setResolvedThemeMode(nextResolvedTheme);
      const root = document.documentElement;
      root.classList.toggle("dark", nextResolvedTheme === "dark");
      root.dataset.theme = nextResolvedTheme;
    };

    applyThemeMode();

    if (themeModePreference !== "system") {
      return;
    }

    mediaQueryList.addEventListener("change", applyThemeMode);
    return () => {
      mediaQueryList.removeEventListener("change", applyThemeMode);
    };
  }, [themeModePreference]);

  useEffect(() => {
    setBackgroundThemePalette(generatedThemePalette);
  }, [generatedThemePalette, setBackgroundThemePalette]);

  useEffect(() => {
    applyTailwindThemePaletteVariables(generatedThemePalette);
  }, [generatedThemePalette]);

  useEffect(() => {
    setBackgroundThemeMode(resolvedThemeMode);
  }, [resolvedThemeMode, setBackgroundThemeMode]);

  useEffect(() => {
    setThemeErrorMessage(null);
  }, [playerState.currentTrack?.coverPath]);

  useEffect(() => {
    if (!selectedArtist) {
      setArtistDetail(null);
      setArtistTopTracks([]);
      return;
    }

    const runLoad = async () => {
      try {
        setErrorMessage(null);
        await loadArtistData(selectedArtist);
      } catch (error) {
        setErrorMessage(parseError(error));
      }
    };

    void runLoad();
  }, [loadArtistData, selectedArtist]);

  useEffect(() => {
    if (!selectedAlbum) {
      setAlbumDetail(null);
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

  useEffect(() => {
    if (!isStatsRoute) {
      return;
    }

    const timer = window.setInterval(() => {
      void loadStatsOverview();
      void loadStatsDashboard(statsRangeRef.current);
    }, statsRefreshIntervalMS);

    return () => {
      window.clearInterval(timer);
    };
  }, [isStatsRoute, loadStatsDashboard, loadStatsOverview]);

  const onAddWatchedRoot = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newRootPath.trim()) {
      return;
    }

    try {
      setErrorMessage(null);
      await Call.ByName(
        `${settingsService}.AddWatchedRoot`,
        newRootPath.trim(),
      );
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

  const onSetQueue = async (
    trackIDs: number[],
    autoplay: boolean,
    startIndex = 0,
  ) => {
    if (trackIDs.length === 0) {
      return;
    }

    try {
      setErrorMessage(null);
      await Call.ByName(`${queueService}.SetQueue`, trackIDs, startIndex);
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

  const onCycleRepeat = async () => {
    const nextMode =
      queueState.repeatMode === "off"
        ? "all"
        : queueState.repeatMode === "all"
          ? "one"
          : "off";
    await onSetRepeatMode(nextMode);
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
    if (!playerState.currentTrack) {
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
          await Call.ByName(`${playerService}.Seek`, nextSeekMS);
        } catch (error) {
          setErrorMessage(parseError(error));
        }
      }
    } finally {
      seekRequestInFlightRef.current = false;
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

  const onPlayAlbum = async (title: string, albumArtist: string) => {
    try {
      setErrorMessage(null);
      const trackIDs = (await Call.ByName(
        `${libraryService}.GetAlbumQueueTrackIDs`,
        title,
        albumArtist,
      )) as number[];
      await onSetQueue(trackIDs ?? [], true);
    } catch (error) {
      setErrorMessage(parseError(error));
    }
  };

  const onPlayTrackFromAlbum = async (
    title: string,
    albumArtist: string,
    trackID: number,
  ) => {
    try {
      setErrorMessage(null);
      const trackIDs = (await Call.ByName(
        `${libraryService}.GetAlbumQueueTrackIDsFromTrack`,
        title,
        albumArtist,
        trackID,
      )) as number[];
      const queueTrackIDs = trackIDs ?? [];
      const startIndex = queueTrackIDs.indexOf(trackID);
      if (startIndex < 0) {
        throw new Error("Selected track is not part of the album queue.");
      }
      await onSetQueue(queueTrackIDs, true, startIndex);
    } catch (error) {
      setErrorMessage(parseError(error));
    }
  };

  const onPlayArtistTracks = async (artistName: string) => {
    try {
      setErrorMessage(null);
      const trackIDs = (await Call.ByName(
        `${libraryService}.GetArtistQueueTrackIDs`,
        artistName,
      )) as number[];
      await onSetQueue(trackIDs ?? [], true);
    } catch (error) {
      setErrorMessage(parseError(error));
    }
  };

  const onPlayArtistTopTrack = async (artistName: string, trackID: number) => {
    try {
      setErrorMessage(null);
      const trackIDs = (await Call.ByName(
        `${libraryService}.GetArtistQueueTrackIDsFromTopTrack`,
        artistName,
        trackID,
      )) as number[];
      const queueTrackIDs = trackIDs ?? [];
      const startIndex = queueTrackIDs.indexOf(trackID);
      if (startIndex < 0) {
        throw new Error("Selected track is not part of the artist queue.");
      }
      await onSetQueue(queueTrackIDs, true, startIndex);
    } catch (error) {
      setErrorMessage(parseError(error));
    }
  };

  const generateThemePaletteForCover = useCallback(
    async (coverPath: string) => {
      const trimmedPath = coverPath.trim();
      if (!trimmedPath) {
        return;
      }

      const currentThemeOptions = themeOptionsRef.current;
      const cacheKey = buildThemePaletteCacheKey(
        trimmedPath,
        currentThemeOptions,
      );
      const cachedPalette = themePaletteCacheRef.current.get(cacheKey);
      if (cachedPalette) {
        setThemeErrorMessage(null);
        setThemeBusy(false);
        setGeneratedThemePalette(cachedPalette);
        return;
      }

      const requestToken = themeRequestTokenRef.current + 1;
      themeRequestTokenRef.current = requestToken;

      try {
        setThemeBusy(true);
        setThemeErrorMessage(null);
        const nextPalette = await Call.ByName(
          `${themeService}.GenerateFromCover`,
          trimmedPath,
          currentThemeOptions,
        );

        if (requestToken !== themeRequestTokenRef.current) {
          return;
        }

        const palette = (nextPalette ?? null) as ThemePalette | null;
        setGeneratedThemePalette(palette);
        if (palette) {
          themePaletteCacheRef.current.set(cacheKey, palette);
          while (
            themePaletteCacheRef.current.size > maxThemePaletteCacheEntries
          ) {
            const oldestKey = themePaletteCacheRef.current.keys().next()
              .value as string | undefined;
            if (!oldestKey) {
              break;
            }
            themePaletteCacheRef.current.delete(oldestKey);
          }
        }
      } catch (error) {
        if (requestToken === themeRequestTokenRef.current) {
          setThemeErrorMessage(parseError(error));
        }
      } finally {
        if (requestToken === themeRequestTokenRef.current) {
          setThemeBusy(false);
        }
      }
    },
    [],
  );

  const onGenerateThemePalette = async () => {
    const coverPath = playerState.currentTrack?.coverPath?.trim();
    if (!coverPath) {
      setThemeErrorMessage("No cover art available for the current track.");
      return;
    }

    await generateThemePaletteForCover(coverPath);
  };

  useEffect(() => {
    const coverPath = playerState.currentTrack?.coverPath?.trim();
    if (!coverPath) {
      themeRequestTokenRef.current += 1;
      setThemeBusy(false);
      return;
    }

    void generateThemePaletteForCover(coverPath);
  }, [generateThemePaletteForCover, playerState.currentTrack?.coverPath]);

  const currentTrack = playerState.currentTrack;
  const hasCurrentTrack = !!currentTrack;
  const seekMax = Math.max(playerState.durationMs ?? 0, 1);
  const seekValue = Math.min(playerState.positionMs, seekMax);

  const sortedAlbums = useMemo(
    () => [...albumsPage.items].sort((a, b) => a.title.localeCompare(b.title)),
    [albumsPage.items],
  );
  const sortedArtists = useMemo(
    () => [...artistsPage.items].sort((a, b) => a.name.localeCompare(b.name)),
    [artistsPage.items],
  );

  const openAlbumView = useCallback(
    (title: string, albumArtist: string) => {
      setSelectedAlbum({ title, albumArtist });
      navigate("/albums");
    },
    [navigate],
  );

  const openArtistView = useCallback(
    (artistName: string) => {
      setSelectedArtist(artistName);
      navigate("/artists");
    },
    [navigate],
  );

  return (
    <div className="bg-theme-50 text-theme-900 dark:bg-theme-950 dark:text-theme-100 relative isolate flex h-dvh flex-col overflow-hidden">
      <BackgroundShader />

      <TitleBar />

      <div className="relative z-10 flex min-h-0 flex-1">
        <LeftSidebar
          location={location}
          onNavigate={navigate}
          scanRunning={scanStatus.running}
          onRunIncrementalScan={onRunIncrementalScan}
          onRunFullScan={onRunFullScan}
        />

        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          <ScrollArea.Root className="min-h-0 flex-1">
            <ScrollArea.Viewport className="h-full">
              <ScrollArea.Content className="min-w-full px-4 pt-4 pb-36 lg:px-6">
                <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-3">
                  {errorMessage ? (
                    <p className="rounded-md border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-300">
                      {errorMessage}
                    </p>
                  ) : null}

                  <Switch>
                    <Route path="/">
                      <Redirect to="/albums" replace />
                    </Route>

                    <Route path="/albums">
                      {selectedAlbum ? (
                        <AlbumDetailView
                          albumDetail={albumDetail}
                          onBack={() => setSelectedAlbum(null)}
                          onPlayAlbum={onPlayAlbum}
                          onPlayTrackFromAlbum={onPlayTrackFromAlbum}
                          formatDuration={formatDuration}
                        />
                      ) : (
                        <AlbumsGridView
                          albums={sortedAlbums}
                          onSelectAlbum={(album) => {
                            openAlbumView(album.title, album.albumArtist);
                          }}
                        />
                      )}
                    </Route>

                    <Route path="/artists">
                      {selectedArtist ? (
                        <ArtistDetailView
                          artistDetail={artistDetail}
                          topTracks={artistTopTracks}
                          onBack={() => setSelectedArtist(null)}
                          onPlayArtist={onPlayArtistTracks}
                          onPlayTopTrack={onPlayArtistTopTrack}
                          onSelectAlbum={(album) => {
                            openAlbumView(album.title, album.albumArtist);
                          }}
                          formatPlayedTime={formatPlayedTime}
                        />
                      ) : (
                        <ArtistsGridView
                          artists={sortedArtists}
                          onSelectArtist={(artistName) => {
                            openArtistView(artistName);
                          }}
                        />
                      )}
                    </Route>

                    <Route path="/tracks">
                      <TracksListView
                        tracks={tracksPage.items}
                        onPlayTrack={onPlayTrackNow}
                        onQueueTrack={onAppendTrack}
                        onSelectArtist={openArtistView}
                        formatDuration={formatDuration}
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
                        statsOverview={statsOverview}
                        currentCoverPath={playerState.currentTrack?.coverPath}
                        themeOptions={themeOptions}
                        themePalette={generatedThemePalette}
                        themeBusy={themeBusy}
                        themeErrorMessage={themeErrorMessage}
                        onNewRootPathChange={setNewRootPath}
                        onAddWatchedRoot={onAddWatchedRoot}
                        onToggleWatchedRoot={onToggleWatchedRoot}
                        onRemoveWatchedRoot={onRemoveWatchedRoot}
                        onThemeOptionsChange={setThemeOptions}
                        onGenerateThemePalette={onGenerateThemePalette}
                        themeModePreference={themeModePreference}
                        resolvedThemeMode={resolvedThemeMode}
                        onThemeModePreferenceChange={setThemeModePreference}
                      />
                    </Route>

                    <Route path="/stats">
                      <StatsView
                        dashboard={statsDashboard}
                        range={statsRange}
                        onRangeChange={setStatsRange}
                        formatPlayedTime={formatPlayedTime}
                      />
                    </Route>

                    <Route path="*">
                      <section>
                        <h1 className="text-theme-900 dark:text-theme-100 text-xl font-semibold">
                          Not Found
                        </h1>
                        <p className="text-theme-600 dark:text-theme-400 text-sm">
                          Choose Albums, Artists, Tracks, Stats, or Settings.
                        </p>
                      </section>
                    </Route>
                  </Switch>
                </div>
              </ScrollArea.Content>
            </ScrollArea.Viewport>
            <ScrollArea.Scrollbar className="bg-theme-300/20 dark:bg-theme-300/50 pointer-events-none m-2 flex w-1 justify-center rounded opacity-0 transition-opacity duration-150 data-hovering:pointer-events-auto data-hovering:opacity-100 data-scrolling:pointer-events-auto data-scrolling:opacity-100 data-scrolling:duration-0">
              <ScrollArea.Thumb className="bg-theme-300/50 w-full rounded" />
            </ScrollArea.Scrollbar>
          </ScrollArea.Root>
        </main>

        <RightSidebar
          tab={rightSidebarTab}
          onTabChange={setRightSidebarTab}
          queueState={queueState}
          playerState={playerState}
          onSelectQueueIndex={onSelectQueueIndex}
          onRemoveQueueTrack={onRemoveQueueTrack}
          onClearQueue={onClearQueue}
          formatDuration={formatDuration}
        />
      </div>

      <PlayerBar
        currentTrack={currentTrack}
        playerState={playerState}
        queueState={queueState}
        transportBusy={transportBusy}
        hasCurrentTrack={hasCurrentTrack}
        seekMax={seekMax}
        seekValue={seekValue}
        onPreviousTrack={onPreviousTrack}
        onTogglePlayback={onTogglePlayback}
        onNextTrack={onNextTrack}
        onToggleShuffle={onToggleShuffle}
        onCycleRepeat={onCycleRepeat}
        onSeek={onSeek}
        onSetVolume={onSetVolume}
        onOpenAlbum={(track) => openAlbumView(track.album, track.albumArtist)}
        onOpenArtist={openArtistView}
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

function formatPlayedTime(durationMS: number): string {
  if (!durationMS || durationMS <= 0) {
    return "0m";
  }

  const totalMinutes = Math.floor(durationMS / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours <= 0) {
    return `${minutes}m`;
  }

  return `${hours}h ${minutes}m`;
}

function parseError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Something went wrong.";
}

export default App;
