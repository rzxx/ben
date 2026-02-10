import { QueueState } from "../types";

type QueueViewProps = {
  queueState: QueueState;
  onSelectQueueIndex: (index: number) => Promise<void>;
  onRemoveQueueTrack: (index: number) => Promise<void>;
  onClearQueue: () => Promise<void>;
};

export function QueueView(props: QueueViewProps) {
  return (
    <section className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">Queue</h2>
          <p className="text-xs text-zinc-400">
            {props.queueState.total} tracks
          </p>
        </div>
        <button
          type="button"
          onClick={() => void props.onClearQueue()}
          disabled={props.queueState.total === 0}
          className="rounded-md bg-zinc-800 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Clear
        </button>
      </div>

      {props.queueState.entries.length === 0 ? (
        <p className="text-sm text-zinc-400">Queue is empty.</p>
      ) : (
        <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
          {props.queueState.entries.map((track, index) => (
            <li
              key={`${track.id}-${index}`}
              className={`flex items-center gap-2 rounded-md border p-2 ${
                index === props.queueState.currentIndex
                  ? "border-zinc-300 bg-zinc-100/10"
                  : "border-zinc-800 bg-zinc-900/70"
              }`}
            >
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => {
                  void props.onSelectQueueIndex(index);
                }}
              >
                <p className="truncate text-sm font-medium text-zinc-100">
                  {track.title}
                </p>
                <p className="truncate text-xs text-zinc-400">
                  {track.artist} - {track.album}
                </p>
              </button>
              <button
                type="button"
                onClick={() => {
                  void props.onRemoveQueueTrack(index);
                }}
                className="rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-700"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
