export type WatchedRoot = {
  id: number;
  path: string;
  enabled: boolean;
  createdAt: string;
};

export type ScanStatus = {
  running: boolean;
  lastRunAt?: string;
  lastMode?: string;
  lastError?: string;
  lastFilesSeen?: number;
  lastIndexed?: number;
  lastSkipped?: number;
};

export type ScanProgress = {
  phase: string;
  message: string;
  percent: number;
  status: string;
  at: string;
};

export type PageInfo = {
  limit: number;
  offset: number;
  total: number;
};

export type PagedResult<T> = {
  items: T[];
  page: PageInfo;
};

export type LibraryArtist = {
  name: string;
  trackCount: number;
  albumCount: number;
};

export type LibraryAlbum = {
  title: string;
  albumArtist: string;
  year?: number;
  trackCount: number;
  coverPath?: string;
};

export type LibraryTrack = {
  id: number;
  title: string;
  artist: string;
  album: string;
  albumArtist: string;
  discNo?: number;
  trackNo?: number;
  durationMs?: number;
  path: string;
  coverPath?: string;
};

export type ArtistDetail = {
  name: string;
  trackCount: number;
  albumCount: number;
  albums: LibraryAlbum[];
  page: PageInfo;
};

export type ArtistTopTrack = {
  trackId: number;
  title: string;
  artist: string;
  album: string;
  albumArtist: string;
  discNo?: number;
  trackNo?: number;
  durationMs?: number;
  path: string;
  coverPath?: string;
  playedMs: number;
  completeCount: number;
  skipCount: number;
  partialCount: number;
};

export type AlbumDetail = {
  title: string;
  albumArtist: string;
  year?: number;
  trackCount: number;
  coverPath?: string;
  tracks: LibraryTrack[];
  page: PageInfo;
};

export type QueueState = {
  entries: LibraryTrack[];
  currentIndex: number;
  currentTrack?: LibraryTrack;
  repeatMode: string;
  shuffle: boolean;
  total: number;
  updatedAt: string;
};

export type PlayerState = {
  status: string;
  positionMs: number;
  volume: number;
  currentTrack?: LibraryTrack;
  currentIndex: number;
  queueLength: number;
  durationMs?: number;
  updatedAt: string;
};

export type SelectedAlbum = {
  title: string;
  albumArtist: string;
};

export type StatsTrack = {
  trackId: number;
  title: string;
  artist: string;
  album: string;
  coverPath?: string;
  playedMs: number;
  completeCount: number;
  skipCount: number;
  partialCount: number;
};

export type StatsArtist = {
  name: string;
  playedMs: number;
  trackCount: number;
};

export type StatsOverview = {
  totalPlayedMs: number;
  tracksPlayed: number;
  completeCount: number;
  skipCount: number;
  partialCount: number;
  topTracks: StatsTrack[];
  topArtists: StatsArtist[];
};

export type StatsRange = "short" | "mid" | "long";

export type StatsSummary = {
  totalPlayedMs: number;
  totalPlays: number;
  tracksPlayed: number;
  artistsPlayed: number;
  albumsPlayed: number;
  completeCount: number;
  skipCount: number;
  partialCount: number;
  completionRate: number;
  skipRate: number;
  partialRate: number;
  completionScore: number;
};

export type StatsQuality = {
  score: number;
};

export type StatsDiscovery = {
  uniqueTracks: number;
  replayPlays: number;
  discoveryRatio: number;
  replayRatio: number;
  score: number;
};

export type StatsStreak = {
  currentDays: number;
  longestDays: number;
  lastActive?: string;
};

export type StatsHeatmapDay = {
  day: string;
  playedMs: number;
  playCount: number;
};

export type StatsAlbum = {
  title: string;
  albumArtist: string;
  playedMs: number;
  playCount: number;
  trackCount: number;
  coverPath?: string;
};

export type StatsGenre = {
  genre: string;
  playedMs: number;
  playCount: number;
  trackCount: number;
};

export type StatsReplayTrack = {
  trackId: number;
  title: string;
  artist: string;
  album: string;
  coverPath?: string;
  playedMs: number;
  totalPlays: number;
  uniqueDays: number;
  playsPerDay: number;
};

export type StatsHour = {
  hour: number;
  playedMs: number;
  share: number;
};

export type StatsWeekday = {
  weekday: number;
  label: string;
  playedMs: number;
  share: number;
};

export type StatsSession = {
  sessionCount: number;
  totalPlayedMs: number;
  averagePlayedMs: number;
  longestPlayedMs: number;
};

export type StatsDashboard = {
  range: StatsRange;
  windowStart?: string;
  generatedAt: string;
  summary: StatsSummary;
  quality: StatsQuality;
  discovery: StatsDiscovery;
  streak: StatsStreak;
  heatmap: StatsHeatmapDay[];
  topTracks: StatsTrack[];
  topArtists: StatsArtist[];
  topAlbums: StatsAlbum[];
  topGenres: StatsGenre[];
  replayTracks: StatsReplayTrack[];
  hourlyProfile: StatsHour[];
  weekdayProfile: StatsWeekday[];
  peakHour: number;
  peakWeekday: number;
  session: StatsSession;
  behaviorWindowDays: number;
};

export type ThemeExtractOptions = {
  maxDimension: number;
  quality: number;
  colorCount: number;
  candidateCount: number;
  quantizationBits: number;
  alphaThreshold: number;
  ignoreNearWhite: boolean;
  ignoreNearBlack: boolean;
  minLuma: number;
  maxLuma: number;
  minChroma: number;
  targetChroma: number;
  maxChroma: number;
  minDelta: number;
  darkBaseLightness: number;
  lightBaseLightness: number;
  darkLightnessDeviation: number;
  lightLightnessDeviation: number;
  darkChromaScale: number;
  lightChromaScale: number;
  workerCount: number;
};

export type ThemePaletteColor = {
  hex: string;
  r: number;
  g: number;
  b: number;
  population: number;
  lightness: number;
  chroma: number;
  hue: number;
};

export type ThemePaletteTone = {
  tone: number;
  color: ThemePaletteColor;
};

export type ThemePalette = {
  primary?: ThemePaletteColor;
  dark?: ThemePaletteColor;
  light?: ThemePaletteColor;
  accent?: ThemePaletteColor;
  themeScale: ThemePaletteTone[];
  accentScale: ThemePaletteTone[];
  gradient: ThemePaletteColor[];
  sourceWidth: number;
  sourceHeight: number;
  sampleWidth: number;
  sampleHeight: number;
  options: ThemeExtractOptions;
};

export type ThemeModePreference = "system" | "light" | "dark";
