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

export type ThemePalette = {
  primary?: ThemePaletteColor;
  secondary?: ThemePaletteColor;
  tertiary?: ThemePaletteColor;
  dark?: ThemePaletteColor;
  light?: ThemePaletteColor;
  accent?: ThemePaletteColor;
  gradient: ThemePaletteColor[];
  sourceWidth: number;
  sourceHeight: number;
  sampleWidth: number;
  sampleHeight: number;
  options: ThemeExtractOptions;
};
