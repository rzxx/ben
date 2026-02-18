import { X } from "lucide-react";
import { QueueState } from "../types";
import { useQueueViewStore } from "../../shared/store/queueViewStore";

type QueueViewProps = {
  queueState: QueueState;
  onSelectQueueIndex: (index: number) => Promise<void>;
  onRemoveQueueTrack: (index: number) => Promise<void>;
  onClearQueue: () => Promise<void>;
};

export function QueueView(props: QueueViewProps) {
  const debugState = props.queueState.shuffleDebug;
  const shuffleDebugOpen = useQueueViewStore((state) => state.shuffleDebugOpen);
  const recentIndices = normalizeIndices(debugState?.recentIndices);
  const trailIndices = normalizeIndices(debugState?.trailIndices);
  const upcomingIndices = normalizeIndices(debugState?.upcoming);

  return (
    <section className="flex w-76 flex-col gap-3 pl-3">
      <div className="flex items-center justify-between px-2">
        <div>
          <p className="text-theme-600 dark:text-theme-400 text-xs">
            {props.queueState.total} tracks
          </p>
        </div>
        <button
          type="button"
          onClick={() => void props.onClearQueue()}
          disabled={props.queueState.total === 0}
          className="text-accent-700 hover:bg-accent-200 dark:text-accent-200 dark:hover:bg-accent-800 rounded-md px-2 py-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        >
          Clear
        </button>
      </div>

      {props.queueState.entries.length === 0 ? (
        <p className="text-theme-600 dark:text-theme-400 text-sm">
          Queue is empty.
        </p>
      ) : (
        <ul className="flex min-w-0 flex-col gap-2 pr-1">
          {props.queueState.entries.map((track, index) => (
            <li
              key={`${track.id}-${index}`}
              className={`group flex min-w-0 items-center gap-2 rounded-md p-2 transition-colors ${
                index === props.queueState.currentIndex
                  ? ""
                  : "hover:bg-theme-200 dark:hover:bg-theme-800"
              }`}
            >
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => {
                  void props.onSelectQueueIndex(index);
                }}
              >
                <p
                  className={`truncate text-sm font-medium ${index === props.queueState.currentIndex ? "text-accent-700 dark:text-accent-300" : "text-theme-900 dark:text-theme-100"}`}
                >
                  {track.title}
                </p>
                <p className="text-theme-600 dark:text-theme-400 truncate text-xs">
                  {track.artist}
                </p>
              </button>
              <button
                type="button"
                onClick={() => {
                  void props.onRemoveQueueTrack(index);
                }}
                className="group-hover:text-accent-700 hover:text-accent-900 dark:group-hover:text-accent-400 dark:hover:text-accent-200 rounded p-1 transition-colors not-group-hover:hidden"
                aria-label="Remove track from queue"
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {shuffleDebugOpen && debugState ? (
        <details
          open
          className="bg-theme-200/70 border-theme-300/50 dark:bg-theme-900/50 dark:border-theme-700/40 rounded-md border px-2 py-2 text-xs"
        >
          <summary className="text-theme-700 dark:text-theme-300 cursor-pointer font-medium">
            Shuffle Debug
          </summary>

          <div className="mt-2 flex flex-col gap-2">
            <p className="text-theme-700 dark:text-theme-300">
              Session {debugState.sessionVersion} • Cycle {debugState.cycleVersion},{" "}
              {debugState.cycleProgress}/{debugState.cycleLength}
            </p>
            <p className="text-theme-700 dark:text-theme-300">
              Guard prefix {debugState.guardPrefix} • Recent window {debugState.recentWindow}
            </p>

            <DebugIndexList
              label="Recent Guard Set"
              indices={recentIndices}
              queueState={props.queueState}
            />
            <DebugIndexList
              label="Playback Trail (latest first)"
              indices={[...trailIndices].reverse()}
              queueState={props.queueState}
            />
            <DebugIndexList
              label="Upcoming Shuffle Order"
              indices={upcomingIndices}
              queueState={props.queueState}
            />
          </div>
        </details>
      ) : null}
    </section>
  );
}

type DebugIndexListProps = {
  label: string;
  indices: number[] | null | undefined;
  queueState: QueueState;
};

function DebugIndexList(props: DebugIndexListProps) {
  const indices = normalizeIndices(props.indices);
  const shownIndices = indices.slice(0, 10);

  return (
    <div>
      <p className="text-theme-600 dark:text-theme-400 font-medium">{props.label}</p>
      {shownIndices.length === 0 ? (
        <p className="text-theme-500 dark:text-theme-500 mt-1">none</p>
      ) : (
        <ul className="mt-1 flex flex-col gap-1">
          {shownIndices.map((index, order) => {
            const track = props.queueState.entries[index];
            const title = track?.title ?? "Unknown";
            const artist = track?.artist ?? "Unknown Artist";

            return (
              <li
                key={`${props.label}-${index}-${order}`}
                className="text-theme-700 dark:text-theme-300 truncate"
                title={`#${index} ${title} - ${artist}`}
              >
                {order + 1}. #{index} {title} - {artist}
              </li>
            );
          })}
          {indices.length > shownIndices.length ? (
            <li className="text-theme-500 dark:text-theme-500">
              +{indices.length - shownIndices.length} more
            </li>
          ) : null}
        </ul>
      )}
    </div>
  );
}

function normalizeIndices(value: number[] | null | undefined): number[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((index) => Number.isInteger(index));
}
