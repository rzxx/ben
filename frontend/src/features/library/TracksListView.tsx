import { Play, Plus } from "lucide-react";
import { LibraryTrack } from "../types";

type TracksListViewProps = {
  tracks: LibraryTrack[];
  onPlayTrack: (trackID: number) => Promise<void>;
  onQueueTrack: (trackID: number) => Promise<void>;
  formatDuration: (durationMS?: number) => string;
};

export function TracksListView(props: TracksListViewProps) {
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-zinc-100">Tracks</h1>
      {props.tracks.length === 0 ? (
        <p className="text-sm text-zinc-400">No tracks found.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {props.tracks.map((track) => (
            <li
              key={track.id}
              className="flex items-center gap-3 rounded-md border border-zinc-800 bg-zinc-900/70 px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-zinc-100">{track.title}</p>
                <p className="truncate text-xs text-zinc-400">
                  {track.artist} - {track.album}
                </p>
              </div>
              <p className="w-14 shrink-0 text-right text-xs text-zinc-500">
                {props.formatDuration(track.durationMs)}
              </p>
              <button
                type="button"
                onClick={() => void props.onQueueTrack(track.id)}
                className="rounded bg-zinc-800 p-2 text-zinc-200 hover:bg-zinc-700"
                aria-label={`Queue ${track.title}`}
              >
                <Plus size={14} />
              </button>
              <button
                type="button"
                onClick={() => void props.onPlayTrack(track.id)}
                className="rounded bg-zinc-800 p-2 text-zinc-200 hover:bg-zinc-700"
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
