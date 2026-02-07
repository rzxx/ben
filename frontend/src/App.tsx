import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Call, Events } from "@wailsio/runtime";

type WatchedRoot = {
  id: number;
  path: string;
  enabled: boolean;
  createdAt: string;
};

type ScanStatus = {
  running: boolean;
  lastRunAt?: string;
  lastError?: string;
};

type ScanProgress = {
  phase: string;
  message: string;
  percent: number;
  status: string;
  at: string;
};

const settingsService = "main.SettingsService";
const scannerService = "main.ScannerService";
const scanProgressEvent = "scanner:progress";

function App() {
  const [watchedRoots, setWatchedRoots] = useState<WatchedRoot[]>([]);
  const [newRootPath, setNewRootPath] = useState("");
  const [scanStatus, setScanStatus] = useState<ScanStatus>({ running: false });
  const [lastProgress, setLastProgress] = useState<ScanProgress | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<
    "library" | "queue" | "settings"
  >("settings");

  const loadWatchedRoots = useCallback(async () => {
    const roots = await Call.ByName(`${settingsService}.ListWatchedRoots`);
    setWatchedRoots((roots ?? []) as WatchedRoot[]);
  }, []);

  const loadScanStatus = useCallback(async () => {
    const status = await Call.ByName(`${scannerService}.GetStatus`);
    setScanStatus((status ?? { running: false }) as ScanStatus);
  }, []);

  useEffect(() => {
    const initialize = async () => {
      try {
        await Promise.all([loadWatchedRoots(), loadScanStatus()]);
      } catch (error) {
        setErrorMessage(parseError(error));
      }
    };

    const unsubscribe = Events.On(scanProgressEvent, (event) => {
      const progress = event.data as ScanProgress;
      setLastProgress(progress);
      void loadScanStatus();
    });

    void initialize();
    return () => {
      unsubscribe();
    };
  }, [loadScanStatus, loadWatchedRoots]);

  const watchedRootCount = useMemo(() => watchedRoots.length, [watchedRoots]);

  const onAddWatchedRoot = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newRootPath.trim()) {
      return;
    }

    try {
      setErrorMessage(null);
      await Call.ByName(
        `${settingsService}.AddWatchedRoot`,
        newRootPath.trim(),
      );
      setNewRootPath("");
      await loadWatchedRoots();
    } catch (error) {
      setErrorMessage(parseError(error));
    }
  };

  const onToggleWatchedRoot = async (root: WatchedRoot) => {
    try {
      setErrorMessage(null);
      await Call.ByName(
        `${settingsService}.SetWatchedRootEnabled`,
        root.id,
        !root.enabled,
      );
      await loadWatchedRoots();
    } catch (error) {
      setErrorMessage(parseError(error));
    }
  };

  const onRemoveWatchedRoot = async (id: number) => {
    try {
      setErrorMessage(null);
      await Call.ByName(`${settingsService}.RemoveWatchedRoot`, id);
      await loadWatchedRoots();
    } catch (error) {
      setErrorMessage(parseError(error));
    }
  };

  const onRunFullScan = async () => {
    try {
      setErrorMessage(null);
      await Call.ByName(`${scannerService}.TriggerFullScan`);
      await loadScanStatus();
    } catch (error) {
      setErrorMessage(parseError(error));
    }
  };

  return (
    <div className="app-shell">
      <header className="top-bar">
        <div>
          <p className="eyebrow">Ben</p>
          <h1>Desktop Music Player</h1>
        </div>
        <button
          className="scan-button"
          onClick={onRunFullScan}
          disabled={scanStatus.running}
        >
          {scanStatus.running ? "Scanning..." : "Run Full Scan"}
        </button>
      </header>

      <nav className="main-nav" aria-label="Main sections">
        <button
          className={activeView === "library" ? "active" : ""}
          onClick={() => setActiveView("library")}
        >
          Library
        </button>
        <button
          className={activeView === "queue" ? "active" : ""}
          onClick={() => setActiveView("queue")}
        >
          Queue
        </button>
        <button
          className={activeView === "settings" ? "active" : ""}
          onClick={() => setActiveView("settings")}
        >
          Settings
        </button>
      </nav>

      <main className="panel-grid">
        <section className="panel">
          <h2>Library Snapshot</h2>
          <p>
            Library browsing views come next after scanner and metadata wiring.
          </p>
          <div className="stat-list">
            <div>
              <span>Watched folders</span>
              <strong>{watchedRootCount}</strong>
            </div>
            <div>
              <span>Scan state</span>
              <strong>{scanStatus.running ? "Running" : "Idle"}</strong>
            </div>
            <div>
              <span>Current view</span>
              <strong>{activeView}</strong>
            </div>
          </div>
        </section>

        <section className="panel">
          <h2>Scanner Progress</h2>
          <p>
            The scanner service is a skeleton flow and now emits progress
            events.
          </p>
          {lastProgress ? (
            <div className="progress-card">
              <div className="progress-top">
                <span>{lastProgress.phase}</span>
                <span>{lastProgress.percent}%</span>
              </div>
              <p>{lastProgress.message}</p>
              <div className="progress-track">
                <div style={{ width: `${lastProgress.percent}%` }} />
              </div>
            </div>
          ) : (
            <p>No progress events yet. Start a full scan to verify wiring.</p>
          )}
          {scanStatus.lastRunAt ? (
            <p>Last run: {new Date(scanStatus.lastRunAt).toLocaleString()}</p>
          ) : null}
          {scanStatus.lastError ? (
            <p className="error">{scanStatus.lastError}</p>
          ) : null}
        </section>

        <section className="panel settings-panel">
          <h2>Watched Folders</h2>
          <form onSubmit={onAddWatchedRoot} className="add-form">
            <input
              type="text"
              value={newRootPath}
              onChange={(event) => setNewRootPath(event.target.value)}
              placeholder="C:\\Music"
              autoComplete="off"
            />
            <button type="submit">Add</button>
          </form>

          {errorMessage ? <p className="error">{errorMessage}</p> : null}

          <ul className="root-list">
            {watchedRoots.map((root) => (
              <li key={root.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={root.enabled}
                    onChange={() => {
                      void onToggleWatchedRoot(root);
                    }}
                  />
                  <span>{root.path}</span>
                </label>
                <button
                  onClick={() => {
                    void onRemoveWatchedRoot(root.id);
                  }}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="player-bar">
        <div>
          <p className="eyebrow">Player</p>
          <strong>Queue and playback controls ship in the next slice.</strong>
        </div>
        <div className="transport-placeholder">
          <button disabled>Prev</button>
          <button disabled>Play</button>
          <button disabled>Next</button>
        </div>
      </footer>
    </div>
  );
}

function parseError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Something went wrong.";
}

export default App;
