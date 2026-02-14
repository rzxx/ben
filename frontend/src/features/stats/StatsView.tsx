import { ReactNode } from "react";
import { StatsDashboard, StatsRange, StatsReplayTrack } from "../types";

type StatsViewProps = {
  dashboard: StatsDashboard;
  range: StatsRange;
  onRangeChange: (range: StatsRange) => void;
  formatPlayedTime: (durationMS: number) => string;
};

const rangeOptions: Array<{ label: string; value: StatsRange }> = [
  { label: "Short", value: "short" },
  { label: "Mid", value: "mid" },
  { label: "Long", value: "long" },
];

export function StatsView(props: StatsViewProps) {
  const heatmapMax = Math.max(
    1,
    ...props.dashboard.heatmap.map((entry) => entry.playedMs),
  );

  return (
    <section className="flex flex-col gap-4">
      <div className="border-theme-800 bg-theme-900/70 rounded-xl border p-4">
        <h1 className="text-theme-100 text-xl font-semibold">Statistics</h1>
        <p className="text-theme-400 mt-1 text-sm">
          Playback insights and listening patterns.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {rangeOptions.map((option) => {
            const active = props.range === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => props.onRangeChange(option.value)}
                className={`rounded-md px-3 py-1.5 text-sm transition ${
                  active
                    ? "bg-theme-100 text-theme-900"
                    : "bg-theme-800 text-theme-200 hover:bg-theme-700"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      <section className="grid grid-cols-2 gap-2 lg:grid-cols-5">
        <MetricCard
          label="Total Listened"
          value={props.formatPlayedTime(props.dashboard.summary.totalPlayedMs)}
        />
        <MetricCard
          label="Total Plays"
          value={`${props.dashboard.summary.totalPlays}`}
        />
        <MetricCard
          label="Completion Rate"
          value={formatPercent(props.dashboard.summary.completionRate)}
        />
        <MetricCard
          label="Discovery Ratio"
          value={formatPercent(props.dashboard.discovery.discoveryRatio)}
        />
        <MetricCard
          label="Current Streak"
          value={`${props.dashboard.streak.currentDays}d`}
        />
      </section>

      <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Panel title="Completion and Quality">
          <ul className="text-theme-300 space-y-1 text-sm">
            <li>Completions: {props.dashboard.summary.completeCount}</li>
            <li>Skips: {props.dashboard.summary.skipCount}</li>
            <li>Partials: {props.dashboard.summary.partialCount}</li>
            <li>
              Skip rate: {formatPercent(props.dashboard.summary.skipRate)}
            </li>
            <li>
              Listener score: {Math.round(props.dashboard.quality.score)} / 100
            </li>
          </ul>
        </Panel>

        <Panel title="Discovery and Replay">
          <ul className="text-theme-300 space-y-1 text-sm">
            <li>Unique tracks: {props.dashboard.discovery.uniqueTracks}</li>
            <li>Replay plays: {props.dashboard.discovery.replayPlays}</li>
            <li>
              Replay ratio:{" "}
              {formatPercent(props.dashboard.discovery.replayRatio)}
            </li>
            <li>
              Discovery score: {Math.round(props.dashboard.discovery.score)} /
              100
            </li>
            <li>Longest streak: {props.dashboard.streak.longestDays}d</li>
          </ul>
        </Panel>
      </section>

      <Panel title="Daily Heatmap (30 days)">
        <div className="grid grid-cols-10 gap-1">
          {props.dashboard.heatmap.map((entry) => {
            const intensity = Math.max(0.1, entry.playedMs / heatmapMax);
            return (
              <div
                key={entry.day}
                title={`${entry.day} - ${props.formatPlayedTime(entry.playedMs)} - ${entry.playCount} plays`}
                className="border-theme-800 h-6 rounded border"
                style={{
                  backgroundColor: `rgba(229, 229, 229, ${intensity})`,
                }}
              />
            );
          })}
        </div>
      </Panel>

      <section className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Panel title="Top Artists">
          <ol className="text-theme-300 space-y-1 text-sm">
            {props.dashboard.topArtists.map((artist) => (
              <li key={artist.name}>
                {artist.name} - {props.formatPlayedTime(artist.playedMs)}
              </li>
            ))}
          </ol>
        </Panel>

        <Panel title="Top Albums">
          <ol className="text-theme-300 space-y-1 text-sm">
            {props.dashboard.topAlbums.map((album) => (
              <li key={`${album.albumArtist}-${album.title}`}>
                {album.title} - {album.albumArtist}
              </li>
            ))}
          </ol>
        </Panel>

        <Panel title="Top Tracks">
          <ol className="text-theme-300 space-y-1 text-sm">
            {props.dashboard.topTracks.map((track) => (
              <li key={track.trackId}>
                {track.title} - {track.artist}
              </li>
            ))}
          </ol>
        </Panel>
      </section>

      <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Panel title="Top Genres">
          <ul className="text-theme-300 space-y-1 text-sm">
            {props.dashboard.topGenres.map((genre) => (
              <li key={genre.genre}>
                {genre.genre} - {props.formatPlayedTime(genre.playedMs)}
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Most Replayed Tracks">
          <ul className="text-theme-300 space-y-1 text-sm">
            {props.dashboard.replayTracks.map((track) => (
              <li key={track.trackId}>{formatReplayTrack(track)}</li>
            ))}
          </ul>
        </Panel>
      </section>

      <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Panel title="Peak Hour Profile">
          <ul className="text-theme-300 space-y-1 text-sm">
            {props.dashboard.hourlyProfile.map((hour) => (
              <li key={hour.hour}>
                {hour.hour.toString().padStart(2, "0")}:00 -{" "}
                {formatPercent(hour.share)}
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Day-of-Week Profile">
          <ul className="text-theme-300 space-y-1 text-sm">
            {props.dashboard.weekdayProfile.map((day) => (
              <li key={day.weekday}>
                {day.label} - {formatPercent(day.share)}
              </li>
            ))}
          </ul>
        </Panel>
      </section>

      <Panel title="Session Stats">
        <ul className="text-theme-300 space-y-1 text-sm">
          <li>Sessions: {props.dashboard.session.sessionCount}</li>
          <li>
            Average session:{" "}
            {props.formatPlayedTime(props.dashboard.session.averagePlayedMs)}
          </li>
          <li>
            Longest session:{" "}
            {props.formatPlayedTime(props.dashboard.session.longestPlayedMs)}
          </li>
          <li>
            Session window: last {props.dashboard.behaviorWindowDays} days
          </li>
        </ul>
      </Panel>
    </section>
  );
}

type PanelProps = {
  title: string;
  children: ReactNode;
};

function Panel(props: PanelProps) {
  return (
    <section className="border-theme-800 bg-theme-900/70 rounded-xl border p-4">
      <h2 className="text-theme-100 mb-2 text-sm font-semibold">
        {props.title}
      </h2>
      {props.children}
    </section>
  );
}

type MetricCardProps = {
  label: string;
  value: string;
};

function MetricCard(props: MetricCardProps) {
  return (
    <div className="border-theme-800 bg-theme-900/70 rounded-xl border p-3">
      <p className="text-theme-500 text-xs tracking-wide uppercase">
        {props.label}
      </p>
      <p className="text-theme-100 mt-1 text-lg font-semibold">{props.value}</p>
    </div>
  );
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) {
    return "0%";
  }
  return `${value.toFixed(1)}%`;
}

function formatReplayTrack(track: StatsReplayTrack): string {
  return `${track.title} - ${track.artist} (${track.playsPerDay.toFixed(2)} plays/day)`;
}
