import { ListMusic, Rows4 } from "lucide-react";
import { ScrollArea } from "@base-ui/react/scroll-area";
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
    <aside className="flex h-full min-h-0 w-80 shrink-0 flex-col border-l border-neutral-800 bg-neutral-950/30 pt-4">
      <div className="flex gap-2 px-3">
        <button
          type="button"
          onClick={() => props.onTabChange("queue")}
          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm ${
            props.tab === "queue"
              ? "bg-neutral-100 text-neutral-900"
              : "bg-neutral-800 text-neutral-200 hover:bg-neutral-700"
          }`}
        >
          <ListMusic size={14} />
          Queue
        </button>
        <button
          type="button"
          onClick={() => props.onTabChange("details")}
          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm ${
            props.tab === "details"
              ? "bg-neutral-100 text-neutral-900"
              : "bg-neutral-800 text-neutral-200 hover:bg-neutral-700"
          }`}
        >
          <Rows4 size={14} />
          Track Details
        </button>
      </div>

      <ScrollArea.Root className="mt-3 min-h-0 flex-1">
        <ScrollArea.Viewport className="h-full">
          <ScrollArea.Content className="min-w-full px-3 pb-36">
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
          </ScrollArea.Content>
        </ScrollArea.Viewport>
        <ScrollArea.Scrollbar className="pointer-events-none m-2 flex w-1 justify-center rounded bg-neutral-800/80 opacity-0 transition-opacity duration-150 data-hovering:pointer-events-auto data-hovering:opacity-100 data-scrolling:pointer-events-auto data-scrolling:opacity-100 data-scrolling:duration-0">
          <ScrollArea.Thumb className="w-full rounded bg-neutral-500" />
        </ScrollArea.Scrollbar>
      </ScrollArea.Root>
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
    return <p className="text-sm text-neutral-400">No track selected.</p>;
  }

  return (
    <section className="flex flex-col gap-2 text-sm">
      <h2 className="text-sm font-semibold text-neutral-100">Current Track</h2>
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
    <div className="rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1.5">
      <p className="text-xs tracking-wide text-neutral-500 uppercase">
        {props.label}
      </p>
      <p className="truncate text-neutral-200">{props.value}</p>
    </div>
  );
}
