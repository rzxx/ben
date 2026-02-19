import { useEffect } from "react";
import { useLocation } from "wouter";
import { AlbumDetailView } from "../../features/library/AlbumDetailView";
import { useLibrary } from "../providers/LibraryContext";
import { usePlayback } from "../providers/PlaybackContext";
import { formatDuration } from "../utils/appUtils";
import { decodePathSegment } from "../utils/routePaths";

type AlbumDetailRouteProps = {
  albumArtistParam: string;
  albumTitleParam: string;
};

export function AlbumDetailRoute(props: AlbumDetailRouteProps) {
  const [, navigate] = useLocation();
  const { state: libraryState, actions: libraryActions } = useLibrary();
  const { actions: playbackActions } = usePlayback();
  const loadAlbumDetail = libraryActions.loadAlbumDetail;

  const albumArtist = decodePathSegment(props.albumArtistParam);
  const albumTitle = decodePathSegment(props.albumTitleParam);

  useEffect(() => {
    void loadAlbumDetail(albumTitle, albumArtist);
  }, [albumArtist, albumTitle, loadAlbumDetail]);

  const detailMatchesRoute =
    libraryState.albumDetail?.title === albumTitle &&
    libraryState.albumDetail?.albumArtist === albumArtist;

  return (
    <AlbumDetailView
      albumDetail={detailMatchesRoute ? libraryState.albumDetail : null}
      onBack={() => navigate("/albums")}
      onPlayAlbum={playbackActions.playAlbum}
      onPlayTrackFromAlbum={playbackActions.playTrackFromAlbum}
      formatDuration={formatDuration}
    />
  );
}
