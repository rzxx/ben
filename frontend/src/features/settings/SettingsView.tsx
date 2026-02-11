import { FormEvent } from "react";
import {
  PlayerState,
  QueueState,
  ScanProgress,
  ScanStatus,
  StatsOverview,
  WatchedRoot,
} from "../types";

type SettingsViewProps = {
  lastProgress: ScanProgress | null;
  scanStatus: ScanStatus;
  watchedRoots: WatchedRoot[];
  newRootPath: string;
  errorMessage: string | null;
  queueState: QueueState;
  playerState: PlayerState;
  statsOverview: StatsOverview;
  onNewRootPathChange: (value: string) => void;
  onAddWatchedRoot: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onToggleWatchedRoot: (root: WatchedRoot) => Promise<void>;
  onRemoveWatchedRoot: (id: number) => Promise<void>;
};

export function SettingsView(props: SettingsViewProps) {
  return (
    <section className="flex flex-col gap-5">
      <div className="rounded-xl border border-neutral-800 bg-neutral-900/70 p-4">
        <h1 className="text-xl font-semibold text-neutral-100">Settings</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Scanner, watched folders, and runtime stats.
        </p>
      </div>

      <section className="rounded-xl border border-neutral-800 bg-neutral-900/70 p-4">
        <h2 className="text-sm font-semibold text-neutral-100">
          Scanner Progress
        </h2>
        {props.lastProgress ? (
          <div className="mt-3 flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs text-neutral-400">
              <span className="capitalize">{props.lastProgress.phase}</span>
              <span>{props.lastProgress.percent}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-neutral-800">
              <div
                className="h-full bg-neutral-200"
                style={{
                  width: `${Math.max(0, Math.min(100, props.lastProgress.percent))}%`,
                }}
              />
            </div>
            <p className="text-xs text-neutral-400">
              {props.lastProgress.message}
            </p>
          </div>
        ) : (
          <p className="mt-2 text-sm text-neutral-400">
            No progress events yet.
          </p>
        )}

        <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-neutral-300 sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            label="Running"
            value={props.scanStatus.running ? "Yes" : "No"}
          />
          <Metric
            label="Last run"
            value={
              props.scanStatus.lastRunAt
                ? new Date(props.scanStatus.lastRunAt).toLocaleString()
                : "-"
            }
          />
          <Metric
            label="Seen"
            value={`${props.scanStatus.lastFilesSeen ?? 0}`}
          />
          <Metric
            label="Indexed"
            value={`${props.scanStatus.lastIndexed ?? 0}`}
          />
        </div>
        {props.scanStatus.lastError ? (
          <p className="mt-2 text-sm text-red-400">
            {props.scanStatus.lastError}
          </p>
        ) : null}
      </section>

      <section className="rounded-xl border border-neutral-800 bg-neutral-900/70 p-4">
        <h2 className="text-sm font-semibold text-neutral-100">
          Watched Folders
        </h2>
        <form
          className="mt-3 flex flex-col gap-2 sm:flex-row"
          onSubmit={(event) => void props.onAddWatchedRoot(event)}
        >
          <input
            type="text"
            value={props.newRootPath}
            onChange={(event) => props.onNewRootPathChange(event.target.value)}
            placeholder="C:\\Music"
            className="flex-1 rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 outline-none focus:border-neutral-500"
          />
          <button
            type="submit"
            className="rounded-md bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-200"
          >
            Add
          </button>
        </form>

        {props.errorMessage ? (
          <p className="mt-2 text-sm text-red-400">{props.errorMessage}</p>
        ) : null}

        <ul className="mt-3 flex flex-col gap-2">
          {props.watchedRoots.map((root) => (
            <li
              key={root.id}
              className="flex flex-col gap-2 rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
            >
              <label className="flex min-w-0 items-center gap-2 text-sm text-neutral-300">
                <input
                  type="checkbox"
                  checked={root.enabled}
                  onChange={() => {
                    void props.onToggleWatchedRoot(root);
                  }}
                />
                <span className="truncate">{root.path}</span>
              </label>
              <button
                type="button"
                onClick={() => {
                  void props.onRemoveWatchedRoot(root.id);
                }}
                className="w-fit rounded-md bg-neutral-800 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-700"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <MetricCard label="Queue Length" value={`${props.queueState.total}`} />
        <MetricCard label="Player Status" value={props.playerState.status} />
        <MetricCard
          label="Total Played"
          value={formatPlayedTime(props.statsOverview.totalPlayedMs)}
        />
      </section>
    </section>
  );
}

type MetricProps = {
  label: string;
  value: string;
};

function Metric(props: MetricProps) {
  return (
    <div className="rounded-md border border-neutral-800 bg-neutral-900 px-2 py-2">
      <p className="text-xs tracking-wide text-neutral-500 uppercase">
        {props.label}
      </p>
      <p className="truncate text-sm text-neutral-200">{props.value}</p>
    </div>
  );
}

function MetricCard(props: MetricProps) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/70 p-4">
      <p className="text-xs tracking-wide text-neutral-500 uppercase">
        {props.label}
      </p>
      <p className="mt-1 text-lg font-semibold text-neutral-100">
        {props.value}
      </p>
    </div>
  );
}

function formatPlayedTime(durationMS: number): string {
  if (!durationMS || durationMS <= 0) {
    return "0m";
  }

  const totalMinutes = Math.floor(durationMS / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours <= 0) {
    return `${minutes}m`;
  }

  return `${hours}h ${minutes}m`;
}
