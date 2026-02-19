import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { useLocation } from "wouter";
import type { LibraryArtist } from "../../features/types";
import { ArtistsGridView } from "../../features/library/ArtistsGridView";
import { useIntentPrefetch } from "../hooks/useIntentPrefetch";
import { libraryQueries } from "../query/libraryQueries";
import { browseLimit, detailLimit, normalizePagedResult, parseError } from "../utils/appUtils";
import { buildArtistDetailPath } from "../utils/routePaths";

const defaultArtistsQueryInput = {
  search: "",
  limit: browseLimit,
  offset: 0,
} as const;

const artistTopTracksLimit = 5;

export function ArtistsRoute() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const artistsQuery = useQuery({
    ...libraryQueries.artists(defaultArtistsQueryInput),
  });

  const artistsPage = useMemo(
    () => normalizePagedResult<LibraryArtist>(artistsQuery.data, browseLimit),
    [artistsQuery.data],
  );

  const sortedArtists = useMemo(
    () => [...artistsPage.items].sort((a, b) => a.name.localeCompare(b.name)),
    [artistsPage.items],
  );

  const prefetchArtistDetail = useCallback((artistName: string) => {
    void queryClient.prefetchQuery(
      libraryQueries.artistDetail({
        name: artistName,
        limit: detailLimit,
        offset: 0,
      }),
    );
  }, [queryClient]);

  const prefetchArtistTopTracks = useCallback((artistName: string) => {
    void queryClient.prefetchQuery(
      libraryQueries.artistTopTracks({
        name: artistName,
        limit: artistTopTracksLimit,
      }),
    );
  }, [queryClient]);

  const artistIntentPrefetch = useIntentPrefetch(prefetchArtistDetail);

  if (artistsQuery.isError && sortedArtists.length === 0) {
    return <p className="text-sm text-red-400">{parseError(artistsQuery.error)}</p>;
  }

  if (artistsQuery.isPending && sortedArtists.length === 0) {
    return <p className="text-theme-600 dark:text-theme-400 text-sm">Loading artists...</p>;
  }

  return (
    <ArtistsGridView
      artists={sortedArtists}
      onArtistIntent={artistIntentPrefetch.schedule}
      onArtistIntentEnd={artistIntentPrefetch.cancel}
      onSelectArtist={(artistName) => {
        artistIntentPrefetch.cancel();
        prefetchArtistDetail(artistName);
        prefetchArtistTopTracks(artistName);
        navigate(buildArtistDetailPath(artistName));
      }}
    />
  );
}
