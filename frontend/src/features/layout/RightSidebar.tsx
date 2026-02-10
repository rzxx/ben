import { PlayerState, QueueState } from "../types";
import { QueueView } from "../queue/QueueView";

type RightSidebarProps = {
  tab: "queue" | "details";
  onTabChange: (tab: "queue" | "details") => void;
  queueState: QueueState;
  playerState: PlayerState;
  onSelectQueueIndex: (index: number) => Promise<void>;
  onRemoveQueueTrack: (index: number) => Promise<void>;
  onClearQueue: () => Promise<void>;
  formatDuration: (durationMS?: number) => string;
};

export function RightSidebar(props: RightSidebarProps) {
  return (
    <aside className="flex h-full min-h-0 flex-col rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
      <div className="mb-3 flex gap-2">
        <button
          type="button"
          onClick={() => props.onTabChange("queue")}
          className={`rounded-md px-3 py-1.5 text-sm ${
            props.tab === "queue"
              ? "bg-zinc-100 text-zinc-900"
              : "bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
          }`}
        >
          Queue
        </button>
        <button
          type="button"
          onClick={() => props.onTabChange("details")}
          className={`rounded-md px-3 py-1.5 text-sm ${
            props.tab === "details"
              ? "bg-zinc-100 text-zinc-900"
              : "bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
          }`}
        >
          Track Details
        </button>
      </div>

      {props.tab === "queue" ? (
        <QueueView
          queueState={props.queueState}
          onSelectQueueIndex={props.onSelectQueueIndex}
          onRemoveQueueTrack={props.onRemoveQueueTrack}
          onClearQueue={props.onClearQueue}
        />
      ) : (
        <TrackDetailsPanel
          playerState={props.playerState}
          formatDuration={props.formatDuration}
        />
      )}
    </aside>
  );
}

type TrackDetailsPanelProps = {
  playerState: PlayerState;
  formatDuration: (durationMS?: number) => string;
};

function TrackDetailsPanel(props: TrackDetailsPanelProps) {
  const track = props.playerState.currentTrack;

  if (!track) {
    return <p className="text-sm text-zinc-400">No track selected.</p>;
  }

  return (
    <section className="flex flex-col gap-2 text-sm">
      <h2 className="text-sm font-semibold text-zinc-100">Current Track</h2>
      <DetailRow label="Title" value={track.title} />
      <DetailRow label="Artist" value={track.artist} />
      <DetailRow label="Album" value={track.album} />
      <DetailRow
        label="Track"
        value={`${track.discNo ? `${track.discNo}-` : ""}${track.trackNo ?? "-"}`}
      />
      <DetailRow label="Status" value={props.playerState.status} />
      <DetailRow
        label="Position"
        value={props.formatDuration(props.playerState.positionMs)}
      />
      <DetailRow
        label="Duration"
        value={props.formatDuration(props.playerState.durationMs)}
      />
      <DetailRow label="Volume" value={`${props.playerState.volume}%`} />
    </section>
  );
}

type DetailRowProps = {
  label: string;
  value: string;
};

function DetailRow(props: DetailRowProps) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1.5">
      <p className="text-xs tracking-wide text-zinc-500 uppercase">
        {props.label}
      </p>
      <p className="truncate text-zinc-200">{props.value}</p>
    </div>
  );
}
