import { useLocation } from "wouter";
import { TracksListView } from "../../features/library/TracksListView";
import { useLibrary } from "../providers/LibraryContext";
import { usePlayback } from "../providers/PlaybackContext";
import { formatDuration } from "../utils/appUtils";
import { buildArtistDetailPath } from "../utils/routePaths";

export function TracksRoute() {
  const [, navigate] = useLocation();
  const { state: libraryState } = useLibrary();
  const { actions: playbackActions } = usePlayback();

  return (
    <TracksListView
      tracks={libraryState.tracksPage.items}
      onPlayTrack={playbackActions.playTrackNow}
      onQueueTrack={playbackActions.appendTrack}
      onSelectArtist={(artistName) => {
        navigate(buildArtistDetailPath(artistName));
      }}
      formatDuration={formatDuration}
    />
  );
}
