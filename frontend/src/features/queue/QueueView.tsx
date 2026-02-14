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
          <p className="text-theme-400 text-xs">
            {props.queueState.total} tracks
          </p>
        </div>
        <button
          type="button"
          onClick={() => void props.onClearQueue()}
          disabled={props.queueState.total === 0}
          className="text-accent-200 hover:bg-accent-800 rounded-md px-2 py-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        >
          Clear
        </button>
      </div>

      {props.queueState.entries.length === 0 ? (
        <p className="text-theme-400 text-sm">Queue is empty.</p>
      ) : (
        <ul className="flex min-w-0 flex-col gap-2 pr-1">
          {props.queueState.entries.map((track, index) => (
            <li
              key={`${track.id}-${index}`}
              className={`group flex min-w-0 items-center gap-2 rounded-md border p-2 transition-colors ${
                index === props.queueState.currentIndex
                  ? "border-white/7"
                  : "hover:bg-theme-800 border-transparent"
              }`}
            >
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => {
                  void props.onSelectQueueIndex(index);
                }}
              >
                <p className="text-theme-100 truncate text-sm font-medium">
                  {track.title}
                </p>
                <p className="text-theme-400 truncate text-xs">
                  {track.artist}
                </p>
              </button>
              <button
                type="button"
                onClick={() => {
                  void props.onRemoveQueueTrack(index);
                }}
                className="text-theme-400/ group-hover:text-theme-400 hover:text-theme-200 rounded p-1 transition-colors not-group-hover:hidden"
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
