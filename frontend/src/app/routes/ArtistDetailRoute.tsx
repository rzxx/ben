import { useEffect } from "react";
import { useLocation } from "wouter";
import { ArtistDetailView } from "../../features/library/ArtistDetailView";
import { useLibrary } from "../providers/LibraryContext";
import { usePlaybackActions } from "../state/playback/playbackSelectors";
import { formatPlayedTime } from "../utils/appUtils";
import { buildAlbumDetailPath, decodePathSegment } from "../utils/routePaths";

type ArtistDetailRouteProps = {
  artistNameParam: string;
};

export function ArtistDetailRoute(props: ArtistDetailRouteProps) {
  const [, navigate] = useLocation();
  const { state: libraryState, actions: libraryActions } = useLibrary();
  const playbackActions = usePlaybackActions();
  const loadArtistDetail = libraryActions.loadArtistDetail;

  const artistName = decodePathSegment(props.artistNameParam);

  useEffect(() => {
    void loadArtistDetail(artistName);
  }, [artistName, loadArtistDetail]);

  const detailMatchesRoute = libraryState.artistDetail?.name === artistName;

  return (
    <ArtistDetailView
      artistDetail={detailMatchesRoute ? libraryState.artistDetail : null}
      topTracks={detailMatchesRoute ? libraryState.artistTopTracks : []}
      onBack={() => navigate("/artists")}
      onPlayArtist={playbackActions.playArtistTracks}
      onPlayTopTrack={playbackActions.playArtistTopTrack}
      onSelectAlbum={(album) => {
        navigate(buildAlbumDetailPath(album.title, album.albumArtist));
      }}
      formatPlayedTime={formatPlayedTime}
    />
  );
}
