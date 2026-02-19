import { createContext, useContext } from "react";
import {
  AlbumDetail,
  ArtistDetail,
  ArtistTopTrack,
  LibraryAlbum,
  LibraryArtist,
  LibraryTrack,
  PagedResult,
} from "../../features/types";

export type LibraryState = {
  albumsPage: PagedResult<LibraryAlbum>;
  artistsPage: PagedResult<LibraryArtist>;
  tracksPage: PagedResult<LibraryTrack>;
  albumDetail: AlbumDetail | null;
  albumDetailKey: string | null;
  artistDetail: ArtistDetail | null;
  artistDetailKey: string | null;
  artistTopTracks: ArtistTopTrack[];
  errorMessage: string | null;
};

export type LibraryActions = {
  loadAlbumsPage: () => Promise<void>;
  ensureArtistsPageLoaded: () => Promise<void>;
  ensureTracksPageLoaded: () => Promise<void>;
  loadAlbumDetail: (title: string, albumArtist: string) => Promise<void>;
  loadArtistDetail: (artistName: string) => Promise<void>;
  clearError: () => void;
};

export type LibraryMeta = {
  hasLoadedArtistsPage: boolean;
  hasLoadedTracksPage: boolean;
};

export type LibraryContextValue = {
  state: LibraryState;
  actions: LibraryActions;
  meta: LibraryMeta;
};

export const LibraryContext = createContext<LibraryContextValue | null>(null);

export function useLibrary(): LibraryContextValue {
  const contextValue = useContext(LibraryContext);
  if (!contextValue) {
    throw new Error("useLibrary must be used within LibraryProvider");
  }

  return contextValue;
}
