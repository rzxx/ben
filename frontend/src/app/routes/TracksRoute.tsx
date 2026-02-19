import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useLocation } from "wouter";
import type { LibraryTrack } from "../../features/types";
import { TracksListView } from "../../features/library/TracksListView";
import { libraryQueries } from "../query/libraryQueries";
import { usePlaybackActions } from "../state/playback/playbackSelectors";
import { browseLimit, detailLimit, formatDuration, normalizePagedResult, parseError } from "../utils/appUtils";
import { buildArtistDetailPath } from "../utils/routePaths";

const defaultTracksQueryInput = {
  search: "",
  artist: "",
  album: "",
  limit: browseLimit,
  offset: 0,
} as const;

const artistTopTracksLimit = 5;

export function TracksRoute() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const playbackActions = usePlaybackActions();

  const tracksQuery = useQuery({
    ...libraryQueries.tracks(defaultTracksQueryInput),
  });

  const tracksPage = useMemo(
    () => normalizePagedResult<LibraryTrack>(tracksQuery.data, browseLimit),
    [tracksQuery.data],
  );

  if (tracksQuery.isError && tracksPage.items.length === 0) {
    return <p className="text-sm text-red-400">{parseError(tracksQuery.error)}</p>;
  }

  if (tracksQuery.isPending && tracksPage.items.length === 0) {
    return <p className="text-theme-600 dark:text-theme-400 text-sm">Loading tracks...</p>;
  }

  const prefetchArtistDetail = (artistName: string) => {
    void queryClient.prefetchQuery(
      libraryQueries.artistDetail({
        name: artistName,
        limit: detailLimit,
        offset: 0,
      }),
    );
    void queryClient.prefetchQuery(
      libraryQueries.artistTopTracks({
        name: artistName,
        limit: artistTopTracksLimit,
      }),
    );
  };

  return (
    <TracksListView
      tracks={tracksPage.items}
      onPlayTrack={playbackActions.playTrackNow}
      onQueueTrack={playbackActions.appendTrack}
      onSelectArtist={(artistName) => {
        prefetchArtistDetail(artistName);
        navigate(buildArtistDetailPath(artistName));
      }}
      formatDuration={formatDuration}
    />
  );
}
