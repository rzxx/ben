import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { AlbumDetailView } from "../../features/library/AlbumDetailView";
import { libraryQueries } from "../query/libraryQueries";
import { usePlaybackActions } from "../state/playback/playbackSelectors";
import { detailLimit, formatDuration, parseError } from "../utils/appUtils";
import { decodePathSegment } from "../utils/routePaths";

type AlbumDetailRouteProps = {
  albumArtistParam: string;
  albumTitleParam: string;
};

export function AlbumDetailRoute(props: AlbumDetailRouteProps) {
  const [, navigate] = useLocation();
  const playbackActions = usePlaybackActions();

  const albumArtist = decodePathSegment(props.albumArtistParam);
  const albumTitle = decodePathSegment(props.albumTitleParam);

  const albumDetailQuery = useQuery({
    ...libraryQueries.albumDetail({
      title: albumTitle,
      albumArtist,
      limit: detailLimit,
      offset: 0,
    }),
    enabled: albumTitle.length > 0 && albumArtist.length > 0,
  });

  if (albumDetailQuery.isError) {
    return <p className="text-sm text-red-400">{parseError(albumDetailQuery.error)}</p>;
  }

  if (albumDetailQuery.isSuccess && !albumDetailQuery.data) {
    return <p className="text-theme-600 dark:text-theme-400 text-sm">Album not found.</p>;
  }

  return (
    <AlbumDetailView
      albumDetail={albumDetailQuery.data ?? null}
      onBack={() => navigate("/albums")}
      onPlayAlbum={playbackActions.playAlbum}
      onPlayTrackFromAlbum={playbackActions.playTrackFromAlbum}
      formatDuration={formatDuration}
    />
  );
}
