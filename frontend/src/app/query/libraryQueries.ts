import { queryOptions } from "@tanstack/react-query";
import {
  getAlbumDetail,
  getArtistDetail,
  getArtistTopTracks,
  listAlbums,
  listArtists,
  listTracks,
} from "../services/gateway/libraryGateway";
import {
  type AlbumDetailQueryInput,
  type ArtistDetailQueryInput,
  type ArtistTopTracksQueryInput,
  type LibraryAlbumsQueryInput,
  type LibraryArtistsQueryInput,
  type LibraryTracksQueryInput,
  queryKeys,
} from "./keys";
import { browseListStaleTimeMS, detailStaleTimeMS, queryCacheGCTimeMS } from "./options";

export const libraryQueries = {
  albums: (input: LibraryAlbumsQueryInput) =>
    queryOptions({
      queryKey: queryKeys.library.albums(input),
      queryFn: ({ signal }) =>
        listAlbums(input.search, input.artist, input.limit, input.offset, { signal }),
      staleTime: browseListStaleTimeMS,
      gcTime: queryCacheGCTimeMS,
    }),
  artists: (input: LibraryArtistsQueryInput) =>
    queryOptions({
      queryKey: queryKeys.library.artists(input),
      queryFn: ({ signal }) => listArtists(input.search, input.limit, input.offset, { signal }),
      staleTime: browseListStaleTimeMS,
      gcTime: queryCacheGCTimeMS,
    }),
  tracks: (input: LibraryTracksQueryInput) =>
    queryOptions({
      queryKey: queryKeys.library.tracks(input),
      queryFn: ({ signal }) =>
        listTracks(input.search, input.artist, input.album, input.limit, input.offset, {
          signal,
        }),
      staleTime: browseListStaleTimeMS,
      gcTime: queryCacheGCTimeMS,
    }),
  albumDetail: (input: AlbumDetailQueryInput) =>
    queryOptions({
      queryKey: queryKeys.library.albumDetail(input),
      queryFn: ({ signal }) =>
        getAlbumDetail(input.title, input.albumArtist, input.limit, input.offset, { signal }),
      staleTime: detailStaleTimeMS,
      gcTime: queryCacheGCTimeMS,
    }),
  artistDetail: (input: ArtistDetailQueryInput) =>
    queryOptions({
      queryKey: queryKeys.library.artistDetail(input),
      queryFn: ({ signal }) => getArtistDetail(input.name, input.limit, input.offset, { signal }),
      staleTime: detailStaleTimeMS,
      gcTime: queryCacheGCTimeMS,
    }),
  artistTopTracks: (input: ArtistTopTracksQueryInput) =>
    queryOptions({
      queryKey: queryKeys.library.artistTopTracks(input),
      queryFn: ({ signal }) => getArtistTopTracks(input.name, input.limit, { signal }),
      staleTime: detailStaleTimeMS,
      gcTime: queryCacheGCTimeMS,
    }),
};
