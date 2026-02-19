import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ArtistDetailView } from "../../features/library/ArtistDetailView";
import { warmCoverPath } from "../../shared/cover";
import { libraryQueries } from "../query/libraryQueries";
import { usePlaybackActions } from "../state/playback/playbackSelectors";
import { detailLimit, formatPlayedTime, parseError } from "../utils/appUtils";
import { buildAlbumDetailPath, decodePathSegment } from "../utils/routePaths";

type ArtistDetailRouteProps = {
  artistNameParam: string;
};

export function ArtistDetailRoute(props: ArtistDetailRouteProps) {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const playbackActions = usePlaybackActions();
  const artistName = decodePathSegment(props.artistNameParam);
  const artistTopTracksLimit = 5;

  const artistDetailQuery = useQuery({
    ...libraryQueries.artistDetail({
      name: artistName,
      limit: detailLimit,
      offset: 0,
    }),
    enabled: artistName.length > 0,
  });

  const artistTopTracksQuery = useQuery({
    ...libraryQueries.artistTopTracks({
      name: artistName,
      limit: artistTopTracksLimit,
    }),
    enabled: artistName.length > 0,
  });

  if (artistDetailQuery.isError) {
    return <p className="text-sm text-red-400">{parseError(artistDetailQuery.error)}</p>;
  }

  if (artistTopTracksQuery.isError) {
    return <p className="text-sm text-red-400">{parseError(artistTopTracksQuery.error)}</p>;
  }

  if (artistDetailQuery.isSuccess && !artistDetailQuery.data) {
    return <p className="text-theme-600 dark:text-theme-400 text-sm">Artist not found.</p>;
  }

  return (
    <ArtistDetailView
      artistDetail={artistDetailQuery.data ?? null}
      topTracks={artistTopTracksQuery.data ?? []}
      onBack={() => navigate("/artists")}
      onPlayArtist={playbackActions.playArtistTracks}
      onPlayTopTrack={playbackActions.playArtistTopTrack}
      onSelectAlbum={(album) => {
        warmCoverPath(album.coverPath, "detail");
        void queryClient.prefetchQuery(
          libraryQueries.albumDetail({
            title: album.title,
            albumArtist: album.albumArtist,
            limit: detailLimit,
            offset: 0,
          }),
        );
        navigate(buildAlbumDetailPath(album.title, album.albumArtist));
      }}
      formatPlayedTime={formatPlayedTime}
    />
  );
}
