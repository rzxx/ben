import { LibraryTrack, PlayerState, QueueState } from "../types";
import { CoverArt } from "../../shared/components/CoverArt";

type PlayerBarProps = {
  currentTrack?: LibraryTrack;
  playerState: PlayerState;
  queueState: QueueState;
  transportBusy: boolean;
  hasCurrentTrack: boolean;
  playPauseLabel: string;
  seekMax: number;
  seekValue: number;
  onPreviousTrack: () => Promise<void>;
  onTogglePlayback: () => Promise<void>;
  onNextTrack: () => Promise<void>;
  onSeek: (positionMS: number) => Promise<void>;
  onSetVolume: (volume: number) => Promise<void>;
  formatDuration: (durationMS?: number) => string;
};

export function PlayerBar(props: PlayerBarProps) {
  return (
    <footer className="player-bar">
      <div className="player-main">
        <CoverArt
          coverPath={props.currentTrack?.coverPath}
          alt={props.currentTrack ? `${props.currentTrack.album} cover` : "No cover"}
          className="player-cover"
          loading="eager"
        />
        <div className="player-copy">
          <p className="eyebrow">Player</p>
          {props.currentTrack ? (
            <>
              <strong>
                {props.currentTrack.title} - {props.currentTrack.artist}
              </strong>
              <p>
                {props.currentTrack.album} • {props.playerState.status}
              </p>
            </>
          ) : (
            <strong>No track selected</strong>
          )}
        </div>
      </div>

      <div className="player-controls">
        <div className="transport-placeholder">
          <button onClick={() => void props.onPreviousTrack()} disabled={!props.hasCurrentTrack || props.transportBusy}>
            Prev
          </button>
          <button onClick={() => void props.onTogglePlayback()} disabled={props.queueState.total === 0 || props.transportBusy}>
            {props.playPauseLabel}
          </button>
          <button onClick={() => void props.onNextTrack()} disabled={!props.hasCurrentTrack || props.transportBusy}>
            Next
          </button>
        </div>

        <div className="seek-wrap">
          <span>{props.formatDuration(props.playerState.positionMs)}</span>
          <input
            type="range"
            min={0}
            max={props.seekMax}
            value={props.seekValue}
            onChange={(event) => {
              void props.onSeek(Number(event.target.value));
            }}
            disabled={!props.hasCurrentTrack || props.playerState.status === "idle"}
          />
          <span>{props.formatDuration(props.playerState.durationMs)}</span>
        </div>

        <div className="volume-wrap">
          <span>Vol</span>
          <input
            type="range"
            min={0}
            max={100}
            value={props.playerState.volume}
            onChange={(event) => {
              void props.onSetVolume(Number(event.target.value));
            }}
          />
          <span>{props.playerState.volume}%</span>
        </div>
      </div>
    </footer>
  );
}
