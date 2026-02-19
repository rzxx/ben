import type { StatsRange, ThemeExtractOptions } from "../../features/types";

export type BootstrapQueryInput = {
  albumsLimit: number;
  albumsOffset: number;
};

export type LibraryAlbumsQueryInput = {
  search: string;
  artist: string;
  limit: number;
  offset: number;
};

export type LibraryArtistsQueryInput = {
  search: string;
  limit: number;
  offset: number;
};

export type LibraryTracksQueryInput = {
  search: string;
  artist: string;
  album: string;
  limit: number;
  offset: number;
};

export type AlbumDetailQueryInput = {
  title: string;
  albumArtist: string;
  limit: number;
  offset: number;
};

export type ArtistDetailQueryInput = {
  name: string;
  limit: number;
  offset: number;
};

export type ArtistTopTracksQueryInput = {
  name: string;
  limit: number;
};

export type StatsOverviewQueryInput = {
  limit: number;
};

export type StatsDashboardQueryInput = {
  range: StatsRange;
  limit: number;
};

export type ThemePaletteQueryInput = {
  coverPath: string;
  options: ThemeExtractOptions;
};

export const queryKeys = {
  bootstrap: {
    snapshot: (input: BootstrapQueryInput) => ["bootstrap", "snapshot", input] as const,
  },
  library: {
    root: () => ["library"] as const,
    albumsRoot: () => ["library", "albums"] as const,
    artistsRoot: () => ["library", "artists"] as const,
    tracksRoot: () => ["library", "tracks"] as const,
    albumDetailRoot: () => ["library", "album-detail"] as const,
    artistDetailRoot: () => ["library", "artist-detail"] as const,
    artistTopTracksRoot: () => ["library", "artist-top-tracks"] as const,
    albums: (input: LibraryAlbumsQueryInput) => ["library", "albums", input] as const,
    artists: (input: LibraryArtistsQueryInput) => ["library", "artists", input] as const,
    tracks: (input: LibraryTracksQueryInput) => ["library", "tracks", input] as const,
    albumDetail: (input: AlbumDetailQueryInput) => ["library", "album-detail", input] as const,
    artistDetail: (input: ArtistDetailQueryInput) => ["library", "artist-detail", input] as const,
    artistTopTracks: (input: ArtistTopTracksQueryInput) =>
      ["library", "artist-top-tracks", input] as const,
  },
  scanner: {
    status: () => ["scanner", "status"] as const,
    watchedRoots: () => ["scanner", "watched-roots"] as const,
  },
  stats: {
    overviewRoot: () => ["stats", "overview"] as const,
    dashboardRoot: () => ["stats", "dashboard"] as const,
    overview: (input: StatsOverviewQueryInput) => ["stats", "overview", input] as const,
    dashboard: (input: StatsDashboardQueryInput) => ["stats", "dashboard", input] as const,
  },
  theme: {
    defaultOptions: () => ["theme", "default-options"] as const,
    palette: (input: ThemePaletteQueryInput) => ["theme", "palette", input] as const,
  },
} as const;
