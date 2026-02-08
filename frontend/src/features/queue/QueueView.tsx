import { PlayerState, QueueState } from "../types";

type QueueViewProps = {
  queueState: QueueState;
  playerState: PlayerState;
  transportBusy: boolean;
  hasCurrentTrack: boolean;
  playPauseLabel: string;
  onPreviousTrack: () => Promise<void>;
  onTogglePlayback: () => Promise<void>;
  onNextTrack: () => Promise<void>;
  onClearQueue: () => Promise<void>;
  onSetRepeatMode: (mode: "off" | "all" | "one") => Promise<void>;
  onToggleShuffle: () => Promise<void>;
  onSelectQueueIndex: (index: number) => Promise<void>;
  onRemoveQueueTrack: (index: number) => Promise<void>;
};

export function QueueView(props: QueueViewProps) {
  return (
    <section className="panel queue-panel">
      <div className="queue-header">
        <div>
          <h2>Queue</h2>
          <p>{props.queueState.total} track(s) in queue.</p>
        </div>
        <div className="queue-actions">
          <button onClick={() => void props.onPreviousTrack()} disabled={!props.hasCurrentTrack || props.transportBusy}>
            Prev
          </button>
          <button onClick={() => void props.onTogglePlayback()} disabled={props.queueState.total === 0 || props.transportBusy}>
            {props.playPauseLabel}
          </button>
          <button onClick={() => void props.onNextTrack()} disabled={!props.hasCurrentTrack || props.transportBusy}>
            Next
          </button>
          <button onClick={() => void props.onClearQueue()} disabled={props.queueState.total === 0}>
            Clear
          </button>
        </div>
      </div>

      <div className="queue-mode-row">
        <div className="repeat-controls" role="group" aria-label="Repeat mode">
          <button
            className={props.queueState.repeatMode === "off" ? "mode-button active" : "mode-button"}
            onClick={() => {
              void props.onSetRepeatMode("off");
            }}
          >
            Repeat Off
          </button>
          <button
            className={props.queueState.repeatMode === "all" ? "mode-button active" : "mode-button"}
            onClick={() => {
              void props.onSetRepeatMode("all");
            }}
          >
            Repeat All
          </button>
          <button
            className={props.queueState.repeatMode === "one" ? "mode-button active" : "mode-button"}
            onClick={() => {
              void props.onSetRepeatMode("one");
            }}
          >
            Repeat One
          </button>
        </div>
        <button
          className={props.queueState.shuffle ? "mode-button active" : "mode-button"}
          onClick={() => {
            void props.onToggleShuffle();
          }}
        >
          Shuffle {props.queueState.shuffle ? "On" : "Off"}
        </button>
      </div>

      {props.queueState.entries.length === 0 ? (
        <p>Add tracks from Library to build your queue.</p>
      ) : (
        <ul className="queue-list">
          {props.queueState.entries.map((track, index) => (
            <li key={`${track.id}-${index}`} className={index === props.queueState.currentIndex ? "active" : ""}>
              <button
                className="queue-select"
                onClick={() => {
                  void props.onSelectQueueIndex(index);
                }}
              >
                <strong>{track.title}</strong>
                <span>
                  {track.artist} - {track.album}
                </span>
              </button>
              <button
                onClick={() => {
                  void props.onRemoveQueueTrack(index);
                }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
