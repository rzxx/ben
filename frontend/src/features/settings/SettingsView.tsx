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
    <>
      <section className="panel">
        <h2>Scanner Progress</h2>
        <p>Full and incremental scans walk folders, upsert changes, and reconcile stale track rows.</p>
        {props.lastProgress ? (
          <div className="progress-card">
            <div className="progress-top">
              <span>{props.lastProgress.phase}</span>
              <span>{props.lastProgress.percent}%</span>
            </div>
            <p>{props.lastProgress.message}</p>
            <div className="progress-track">
              <div style={{ width: `${props.lastProgress.percent}%` }} />
            </div>
          </div>
        ) : (
          <p>No progress events yet. Start a full scan to verify wiring.</p>
        )}
        {props.scanStatus.lastRunAt ? <p>Last run: {new Date(props.scanStatus.lastRunAt).toLocaleString()}</p> : null}
        {props.scanStatus.lastMode ? <p>Mode: {props.scanStatus.lastMode}</p> : null}
        {props.scanStatus.lastRunAt ? (
          <div className="scan-totals">
            <span>Seen: {props.scanStatus.lastFilesSeen ?? 0}</span>
            <span>Indexed: {props.scanStatus.lastIndexed ?? 0}</span>
            <span>Skipped: {props.scanStatus.lastSkipped ?? 0}</span>
          </div>
        ) : null}
        {props.scanStatus.lastError ? <p className="error">{props.scanStatus.lastError}</p> : null}
      </section>

      <section className="panel settings-panel">
        <h2>Watched Folders</h2>
        <form onSubmit={(event) => void props.onAddWatchedRoot(event)} className="add-form">
          <input
            type="text"
            value={props.newRootPath}
            onChange={(event) => props.onNewRootPathChange(event.target.value)}
            placeholder="C:\\Music"
            autoComplete="off"
          />
          <button type="submit">Add</button>
        </form>

        {props.errorMessage ? <p className="error">{props.errorMessage}</p> : null}

        <ul className="root-list">
          {props.watchedRoots.map((root) => (
            <li key={root.id}>
              <label>
                <input
                  type="checkbox"
                  checked={root.enabled}
                  onChange={() => {
                    void props.onToggleWatchedRoot(root);
                  }}
                />
                <span>{root.path}</span>
              </label>
              <button
                onClick={() => {
                  void props.onRemoveWatchedRoot(root.id);
                }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2>Runtime State</h2>
        <p>Queue and player state now come from backend events.</p>
        <div className="stat-list">
          <div>
            <span>Queue Length</span>
            <strong>{props.queueState.total}</strong>
          </div>
          <div>
            <span>Player Status</span>
            <strong>{props.playerState.status}</strong>
          </div>
          <div>
            <span>Volume</span>
            <strong>{props.playerState.volume}%</strong>
          </div>
        </div>
      </section>

      <section className="panel">
        <h2>Listening Stats</h2>
        <p>Stats are tracked from player heartbeat, skip, and completion events.</p>

        <div className="stat-list">
          <div>
            <span>Total Played</span>
            <strong>{formatPlayedTime(props.statsOverview.totalPlayedMs)}</strong>
          </div>
          <div>
            <span>Tracks Played</span>
            <strong>{props.statsOverview.tracksPlayed}</strong>
          </div>
          <div>
            <span>Completions</span>
            <strong>{props.statsOverview.completeCount}</strong>
          </div>
          <div>
            <span>Skips</span>
            <strong>{props.statsOverview.skipCount}</strong>
          </div>
        </div>

        <h3>Top Tracks</h3>
        {props.statsOverview.topTracks.length === 0 ? (
          <p>No listening history yet.</p>
        ) : (
          <ul className="entity-list">
            {props.statsOverview.topTracks.map((track) => (
              <li key={track.trackId}>
                <div className="entity-row">
                  <strong>{track.title}</strong>
                  <span>
                    {track.artist} - {track.album}
                  </span>
                  <span>
                    {formatPlayedTime(track.playedMs)} - {track.completeCount} completes - {track.skipCount} skips
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}

        <h3>Top Artists</h3>
        {props.statsOverview.topArtists.length === 0 ? (
          <p>No artist stats yet.</p>
        ) : (
          <ul className="entity-list">
            {props.statsOverview.topArtists.map((artist) => (
              <li key={artist.name}>
                <div className="entity-row">
                  <strong>{artist.name}</strong>
                  <span>
                    {formatPlayedTime(artist.playedMs)} across {artist.trackCount} tracks
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
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
