import {
  LibraryAlbum,
  PageInfo,
  PagedResult,
  PlayerState,
  QueueState,
  StatsDashboard,
  StatsOverview,
  StatsRange,
  ThemeExtractOptions,
  ThemeModePreference,
  ThemePalette,
} from "../../features/types";
import { toDomainErrorMessage } from "../services/domainError";
import { gatewayEvents } from "../services/gateway/events";

export const scanProgressEvent = gatewayEvents.scanProgress;
export const queueStateEvent = gatewayEvents.queueState;
export const playerStateEvent = gatewayEvents.playerState;

export const browseLimit = 200;
export const detailLimit = 200;
export const statsRefreshIntervalMS = 30000;
export const bootstrapAlbumsOffset = 0;
export const postPaintIdleTimeoutMS = 1200;
export const maxThemePaletteCacheEntries = 48;
export const themeModeStorageKey = "ben.theme-mode";
export const darkColorSchemeMediaQuery = "(prefers-color-scheme: dark)";
export const themeExtractOptionsDefaults: ThemeExtractOptions = {
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

const tailwindThemeTones = [
  50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950,
] as const;

type TailwindThemeScale = "theme" | "accent";

export type ResolvedThemeMode = "light" | "dark";

export function parseThemeModePreference(value: string | null): ThemeModePreference {
  if (value === "light" || value === "dark" || value === "system") {
    return value;
  }

  return "system";
}

export function resolveThemeMode(
  preference: ThemeModePreference,
  mediaQueryList?: MediaQueryList,
): ResolvedThemeMode {
  if (preference === "light" || preference === "dark") {
    return preference;
  }

  return mediaQueryList?.matches ? "dark" : "light";
}

export function createEmptyPage(limit: number, offset: number): PageInfo {
  return {
    limit,
    offset,
    total: 0,
  };
}

export function createEmptyQueueState(): QueueState {
  return {
    entries: [],
    currentIndex: -1,
    repeatMode: "off",
    shuffle: false,
    shuffleDebug: undefined,
    total: 0,
    updatedAt: "",
  };
}

export function createEmptyPlayerState(): PlayerState {
  return {
    status: "idle",
    positionMs: 0,
    volume: 80,
    currentIndex: -1,
    queueLength: 0,
    updatedAt: "",
  };
}

export function createEmptyStatsOverview(): StatsOverview {
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

export function createEmptyStatsDashboard(range: StatsRange): StatsDashboard {
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

export function normalizePagedResult<T>(
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

export function applyTailwindThemePaletteVariables(
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

export function scheduleAfterPaintAndIdle(callback: () => void): () => void {
  let cancelled = false;
  let timeoutId = 0;
  let idleId = 0;

  const run = () => {
    if (cancelled) {
      return;
    }

    callback();
  };

  const requestIdle: (
    callback: IdleRequestCallback,
    options?: IdleRequestOptions,
  ) => number = window.requestIdleCallback
    ? (nextCallback, options) => window.requestIdleCallback(nextCallback, options)
    : (nextCallback) =>
        window.setTimeout(
          () =>
            nextCallback({
              didTimeout: false,
              timeRemaining: () => 0,
            }),
          1,
        );

  const cancelIdle: (id: number) => void = window.cancelIdleCallback
    ? (id) => window.cancelIdleCallback(id)
    : (id) => {
        window.clearTimeout(id);
      };

  const paintId = window.requestAnimationFrame(() => {
    timeoutId = window.setTimeout(() => {
      idleId = requestIdle(run, { timeout: postPaintIdleTimeoutMS });
    }, 0);
  });

  return () => {
    cancelled = true;
    window.cancelAnimationFrame(paintId);
    if (timeoutId) {
      window.clearTimeout(timeoutId);
    }
    if (idleId) {
      cancelIdle(idleId);
    }
  };
}

export function formatDuration(durationMS?: number): string {
  if (!durationMS || durationMS < 0) {
    return "0:00";
  }

  const totalSeconds = Math.floor(durationMS / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function formatPlayedTime(durationMS: number): string {
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

export function parseError(error: unknown): string {
  return toDomainErrorMessage(error);
}

export function createEmptyAlbumsPage(): PagedResult<LibraryAlbum> {
  return {
    items: [],
    page: createEmptyPage(browseLimit, 0),
  };
}
