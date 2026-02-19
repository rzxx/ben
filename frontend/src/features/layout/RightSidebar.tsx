import type { ReactNode } from "react";
import { ListMusic, Rows4 } from "lucide-react";
import { ScrollArea } from "@base-ui/react/scroll-area";
import type { LibraryTrack, QueueState } from "../types";
import { QueueView } from "../queue/QueueView";

type RightSidebarProps = {
  tab: "queue" | "details";
  onTabChange: (tab: "queue" | "details") => void;
  queueState: QueueState;
  detailsPanel: ReactNode;
  onSelectQueueIndex: (index: number) => Promise<void>;
  onRemoveQueueTrack: (index: number) => Promise<void>;
  onClearQueue: () => Promise<void>;
};

export function RightSidebar(props: RightSidebarProps) {
  return (
    <aside className="border-theme-300/7 flex h-full min-h-0 w-80 shrink-0 flex-col border-l pt-4 dark:border-white/3">
      <div className="flex gap-2 px-3">
        <button
          type="button"
          onClick={() => props.onTabChange("queue")}
          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors ${
            props.tab === "queue"
              ? "bg-theme-900 text-theme-100 dark:bg-theme-100 dark:text-theme-900"
              : "text-theme-700 hover:bg-theme-200 dark:text-theme-200 dark:hover:bg-theme-800"
          }`}
        >
          <ListMusic size={14} />
          Queue
        </button>
        <button
          type="button"
          onClick={() => props.onTabChange("details")}
          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors ${
            props.tab === "details"
              ? "bg-theme-900 text-theme-100 dark:bg-theme-100 dark:text-theme-900"
              : "text-theme-700 hover:bg-theme-200 dark:text-theme-200 dark:hover:bg-theme-800"
          }`}
        >
          <Rows4 size={14} />
          Track Details
        </button>
      </div>

      <ScrollArea.Root className="mt-3 min-h-0 flex-1">
        <ScrollArea.Viewport className="h-full">
          <ScrollArea.Content className="pb-36">
            {props.tab === "queue" ? (
              <QueueView
                queueState={props.queueState}
                onSelectQueueIndex={props.onSelectQueueIndex}
                onRemoveQueueTrack={props.onRemoveQueueTrack}
                onClearQueue={props.onClearQueue}
              />
            ) : (
              props.detailsPanel
            )}
          </ScrollArea.Content>
        </ScrollArea.Viewport>
        <ScrollArea.Scrollbar className="bg-theme-300/20 pointer-events-none m-2 flex w-1 justify-center rounded opacity-0 transition-opacity duration-150 data-hovering:pointer-events-auto data-hovering:opacity-100 data-scrolling:pointer-events-auto data-scrolling:opacity-100 data-scrolling:duration-0 dark:bg-white/7">
          <ScrollArea.Thumb className="bg-theme-300/50 w-full rounded" />
        </ScrollArea.Scrollbar>
      </ScrollArea.Root>
    </aside>
  );
}

type RightSidebarTrackDetailsPanelProps = {
  currentTrack?: LibraryTrack;
  status: string;
  positionMs: number;
  durationMs?: number;
  volume: number;
  formatDuration: (durationMS?: number) => string;
};

export function RightSidebarTrackDetailsPanel(
  props: RightSidebarTrackDetailsPanelProps,
) {
  const track = props.currentTrack;

  if (!track) {
    return (
      <p className="text-theme-600 dark:text-theme-400 text-sm">
        No track selected.
      </p>
    );
  }

  return (
    <section className="flex flex-col gap-2 px-3 text-sm">
      <h2 className="text-theme-700 dark:text-theme-300 mb-3 px-2 text-sm font-medium">
        Current Track
      </h2>
      <DetailRow label="Title" value={track.title} />
      <DetailRow label="Artist" value={track.artist} />
      <DetailRow label="Album" value={track.album} />
      <DetailRow
        label="Track"
        value={`${track.discNo ? `${track.discNo}-` : ""}${track.trackNo ?? "-"}`}
      />
      <DetailRow label="Status" value={props.status} />
      <DetailRow label="Position" value={props.formatDuration(props.positionMs)} />
      <DetailRow label="Duration" value={props.formatDuration(props.durationMs)} />
      <DetailRow label="Volume" value={`${props.volume}%`} />
    </section>
  );
}

type DetailRowProps = {
  label: string;
  value: string;
};

function DetailRow(props: DetailRowProps) {
  return (
    <div className="px-2 py-1">
      <p className="text-theme-600 dark:text-theme-500 text-xs">
        {props.label}
      </p>
      <p className="text-theme-900 dark:text-theme-100 truncate">
        {props.value}
      </p>
    </div>
  );
}
