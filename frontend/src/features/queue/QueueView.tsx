import { X } from "lucide-react";
import { QueueState } from "../types";

type QueueViewProps = {
  queueState: QueueState;
  onSelectQueueIndex: (index: number) => Promise<void>;
  onRemoveQueueTrack: (index: number) => Promise<void>;
  onClearQueue: () => Promise<void>;
};

export function QueueView(props: QueueViewProps) {
  return (
    <section className="flex w-76 flex-col gap-3 pl-3">
      <div className="flex items-center justify-between px-2">
        <div>
          <p className="text-xs text-neutral-400">
            {props.queueState.total} tracks
          </p>
        </div>
        <button
          type="button"
          onClick={() => void props.onClearQueue()}
          disabled={props.queueState.total === 0}
          className="rounded-md px-2 py-1 text-xs text-neutral-200 transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Clear
        </button>
      </div>

      {props.queueState.entries.length === 0 ? (
        <p className="text-sm text-neutral-400">Queue is empty.</p>
      ) : (
        <ul className="flex min-w-0 flex-col gap-2 pr-1">
          {props.queueState.entries.map((track, index) => (
            <li
              key={`${track.id}-${index}`}
              className={`group flex min-w-0 items-center gap-2 rounded-md border p-2 transition-colors ${
                index === props.queueState.currentIndex
                  ? "border-white/7"
                  : "border-transparent hover:bg-neutral-800"
              }`}
            >
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => {
                  void props.onSelectQueueIndex(index);
                }}
              >
                <p className="truncate text-sm font-medium text-neutral-100">
                  {track.title}
                </p>
                <p className="truncate text-xs text-neutral-400">
                  {track.artist}
                </p>
              </button>
              <button
                type="button"
                onClick={() => {
                  void props.onRemoveQueueTrack(index);
                }}
                className="text-neutral-400/ rounded p-1 transition-colors not-group-hover:hidden group-hover:text-neutral-400 hover:text-neutral-200"
                aria-label="Remove track from queue"
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
