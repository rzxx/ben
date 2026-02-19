import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { useLocation } from "wouter";
import type { LibraryAlbum } from "../../features/types";
import { warmCoverPath } from "../../shared/cover";
import { AlbumsGridView } from "../../features/library/AlbumsGridView";
import { useIntentPrefetch } from "../hooks/useIntentPrefetch";
import { libraryQueries } from "../query/libraryQueries";
import { browseLimit, detailLimit, normalizePagedResult, parseError } from "../utils/appUtils";
import { buildAlbumDetailPath } from "../utils/routePaths";

const defaultAlbumsQueryInput = {
  search: "",
  artist: "",
  limit: browseLimit,
  offset: 0,
} as const;

export function AlbumsRoute() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const albumsQuery = useQuery({
    ...libraryQueries.albums(defaultAlbumsQueryInput),
  });

  const albumsPage = useMemo(
    () => normalizePagedResult<LibraryAlbum>(albumsQuery.data, browseLimit),
    [albumsQuery.data],
  );

  const sortedAlbums = useMemo(
    () => [...albumsPage.items].sort((a, b) => a.title.localeCompare(b.title)),
    [albumsPage.items],
  );

  const prefetchAlbumDetail = useCallback((album: LibraryAlbum) => {
    warmCoverPath(album.coverPath, "detail");

    void queryClient.prefetchQuery(
      libraryQueries.albumDetail({
        title: album.title,
        albumArtist: album.albumArtist,
        limit: detailLimit,
        offset: 0,
      }),
    );
  }, [queryClient]);

  const albumIntentPrefetch = useIntentPrefetch(prefetchAlbumDetail);

  if (albumsQuery.isError && sortedAlbums.length === 0) {
    return <p className="text-sm text-red-400">{parseError(albumsQuery.error)}</p>;
  }

  if (albumsQuery.isPending && sortedAlbums.length === 0) {
    return <p className="text-theme-600 dark:text-theme-400 text-sm">Loading albums...</p>;
  }

  return (
    <AlbumsGridView
      albums={sortedAlbums}
      onAlbumIntent={albumIntentPrefetch.schedule}
      onAlbumIntentEnd={albumIntentPrefetch.cancel}
      onSelectAlbum={(album) => {
        albumIntentPrefetch.cancel();
        prefetchAlbumDetail(album);
        navigate(buildAlbumDetailPath(album.title, album.albumArtist));
      }}
    />
  );
}
