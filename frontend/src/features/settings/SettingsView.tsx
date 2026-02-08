import { FormEvent } from "react";
import { PlayerState, QueueState, ScanProgress, ScanStatus, WatchedRoot } from "../types";

type SettingsViewProps = {
  lastProgress: ScanProgress | null;
  scanStatus: ScanStatus;
  watchedRoots: WatchedRoot[];
  newRootPath: string;
  errorMessage: string | null;
  queueState: QueueState;
  playerState: PlayerState;
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
    </>
  );
}
