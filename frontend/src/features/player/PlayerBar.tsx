import { Slider } from "@base-ui/react/slider";
import {
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
} from "lucide-react";
import { CoverArt } from "../../shared/components/CoverArt";
import { LibraryTrack, PlayerState, QueueState } from "../types";

type PlayerBarProps = {
  currentTrack?: LibraryTrack;
  playerState: PlayerState;
  queueState: QueueState;
  transportBusy: boolean;
  hasCurrentTrack: boolean;
  seekMax: number;
  seekValue: number;
  onPreviousTrack: () => Promise<void>;
  onTogglePlayback: () => Promise<void>;
  onNextTrack: () => Promise<void>;
  onToggleShuffle: () => Promise<void>;
  onCycleRepeat: () => Promise<void>;
  onSeek: (positionMS: number) => Promise<void>;
  onSetVolume: (volume: number) => Promise<void>;
  formatDuration: (durationMS?: number) => string;
};

export function PlayerBar(props: PlayerBarProps) {
  const isPlaying = props.playerState.status === "playing";
  const RepeatIcon = props.queueState.repeatMode === "one" ? Repeat1 : Repeat;

  return (
    <footer className="fixed inset-x-8 bottom-4 z-40 rounded-2xl border border-zinc-800 bg-zinc-950/25 px-8 py-4 shadow-xl backdrop-blur-lg">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
        <div className="flex min-w-0 items-center gap-3 lg:w-72 lg:shrink-0">
          <CoverArt
            coverPath={props.currentTrack?.coverPath}
            alt={
              props.currentTrack
                ? `${props.currentTrack.album} cover`
                : "No cover"
            }
            className="h-12 w-12 rounded-md"
            loading="eager"
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-zinc-100">
              {props.currentTrack?.title ?? "No track selected"}
            </p>
            <p className="truncate text-xs text-zinc-400">
              {props.currentTrack
                ? props.currentTrack.artist
                : "Select a track to start playback"}
            </p>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => void props.onToggleShuffle()}
              className={`rounded p-2 transition-colors ${
                props.queueState.shuffle
                  ? "text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-200"
              }`}
              aria-label="Toggle shuffle"
            >
              <Shuffle size={16} />
            </button>

            <button
              type="button"
              onClick={() => void props.onPreviousTrack()}
              disabled={!props.hasCurrentTrack || props.transportBusy}
              className="rounded p-2 text-zinc-200 transition-colors hover:text-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-600"
              aria-label="Previous track"
            >
              <SkipBack size={16} />
            </button>

            <button
              type="button"
              onClick={() => void props.onTogglePlayback()}
              disabled={props.queueState.total === 0 || props.transportBusy}
              className="rounded-full bg-zinc-100 p-3 text-zinc-900 hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? <Pause size={18} /> : <Play size={18} />}
            </button>

            <button
              type="button"
              onClick={() => void props.onNextTrack()}
              disabled={!props.hasCurrentTrack || props.transportBusy}
              className="rounded p-2 text-zinc-200 transition-colors hover:text-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-600"
              aria-label="Next track"
            >
              <SkipForward size={16} />
            </button>

            <button
              type="button"
              onClick={() => void props.onCycleRepeat()}
              className={`rounded p-2 transition-colors ${
                props.queueState.repeatMode === "off"
                  ? "text-zinc-500 hover:text-zinc-200"
                  : "text-zinc-100"
              }`}
              aria-label="Cycle repeat mode"
            >
              <RepeatIcon size={16} />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="w-10 shrink-0 text-right text-xs text-zinc-500">
              {props.formatDuration(props.playerState.positionMs)}
            </span>
            <SingleValueSlider
              ariaLabel="Track position"
              min={0}
              max={props.seekMax}
              step={1}
              value={props.seekValue}
              disabled={!props.hasCurrentTrack}
              onValueChange={(nextValue) => {
                void props.onSeek(nextValue);
              }}
            />
            <span className="w-10 shrink-0 text-xs text-zinc-500">
              {props.formatDuration(props.playerState.durationMs)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 lg:w-56 lg:shrink-0">
          <Volume2 size={16} className="text-zinc-400" />
          <SingleValueSlider
            ariaLabel="Volume"
            min={0}
            max={100}
            step={1}
            value={props.playerState.volume}
            onValueChange={(nextValue) => {
              void props.onSetVolume(nextValue);
            }}
          />
          <span className="w-9 text-xs text-zinc-500">
            {props.playerState.volume}%
          </span>
        </div>
      </div>
    </footer>
  );
}

type SingleValueSliderProps = {
  ariaLabel: string;
  min: number;
  max: number;
  step: number;
  value: number;
  disabled?: boolean;
  onValueChange: (nextValue: number) => void;
};

function SingleValueSlider(props: SingleValueSliderProps) {
  return (
    <Slider.Root
      min={props.min}
      max={props.max}
      step={props.step}
      value={clamp(props.value, props.min, props.max)}
      disabled={props.disabled}
      onValueChange={(value) => {
        const nextValue = Array.isArray(value)
          ? (value[0] ?? props.min)
          : value;
        props.onValueChange(nextValue);
      }}
      className="flex w-full min-w-0 items-center"
    >
      <Slider.Control className="flex h-4 w-full items-center">
        <Slider.Track className="relative h-1.5 w-full rounded-full bg-zinc-800">
          <Slider.Indicator className="absolute h-full rounded-full bg-zinc-200" />
          <Slider.Thumb
            aria-label={props.ariaLabel}
            className="block h-3.5 w-3.5 rounded-full border border-zinc-500 bg-zinc-100 shadow"
          />
        </Slider.Track>
      </Slider.Control>
    </Slider.Root>
  );
}

function clamp(value: number, minimum: number, maximum: number): number {
  if (value < minimum) {
    return minimum;
  }
  if (value > maximum) {
    return maximum;
  }

  return value;
}
