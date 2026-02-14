import { Play, Plus } from "lucide-react";
import { LibraryTrack } from "../types";

type TracksListViewProps = {
  tracks: LibraryTrack[];
  onPlayTrack: (trackID: number) => Promise<void>;
  onQueueTrack: (trackID: number) => Promise<void>;
  onSelectArtist: (artistName: string) => void;
  formatDuration: (durationMS?: number) => string;
};

export function TracksListView(props: TracksListViewProps) {
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-theme-900 dark:text-theme-100 text-xl font-semibold">
        Tracks
      </h1>
      {props.tracks.length === 0 ? (
        <p className="text-theme-600 dark:text-theme-400 text-sm">
          No tracks found.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {props.tracks.map((track) => (
            <li
              key={track.id}
              className="border-theme-300 bg-theme-100/80 dark:border-theme-800 dark:bg-theme-950/15 flex items-center gap-3 rounded-md border px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="text-theme-900 dark:text-theme-100 truncate text-sm">
                  {track.title}
                </p>
                <p className="text-theme-600 dark:text-theme-400 truncate text-xs">
                  <button
                    type="button"
                    onClick={() => props.onSelectArtist(track.artist)}
                    className="text-theme-600 hover:text-theme-800 dark:text-theme-400 dark:hover:text-theme-200 cursor-pointer text-xs transition-colors"
                  >
                    {track.artist}
                  </button>{" "}
                  - {track.album}
                </p>
              </div>
              <p className="text-theme-600 dark:text-theme-500 w-14 shrink-0 text-right text-xs">
                {props.formatDuration(track.durationMs)}
              </p>
              <button
                type="button"
                onClick={() => void props.onQueueTrack(track.id)}
                className="text-theme-600 hover:text-theme-800 dark:text-theme-500 dark:hover:text-theme-200 rounded p-2 transition-colors"
                aria-label={`Queue ${track.title}`}
              >
                <Plus size={14} />
              </button>
              <button
                type="button"
                onClick={() => void props.onPlayTrack(track.id)}
                className="text-theme-600 hover:text-theme-800 dark:text-theme-500 dark:hover:text-theme-200 rounded p-2 transition-colors"
                aria-label={`Play ${track.title}`}
              >
                <Play size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
