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
import { LibraryTrack, QueueState } from "../types";

type PlayerBarProps = {
  currentTrack?: LibraryTrack;
  playerStatus: string;
  positionMs: number;
  durationMs: number;
  volume: number;
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
  onOpenAlbum: (track: LibraryTrack) => void;
  onOpenArtist: (artistName: string) => void;
  formatDuration: (durationMS?: number) => string;
};

export function PlayerBar(props: PlayerBarProps) {
  const isPlaying = props.playerStatus === "playing";
  const RepeatIcon = props.queueState.repeatMode === "one" ? Repeat1 : Repeat;
  const currentTrack = props.currentTrack;

  return (
    <footer className="dark:bg-theme-900/25 bg-theme-100-desat/75 border-theme-500/15 fixed inset-x-4 bottom-4 z-40 mx-auto rounded-2xl border px-8 py-4 shadow-xl shadow-black/7 backdrop-blur-xl backdrop-saturate-150 lg:inset-x-0 lg:max-w-4xl xl:max-w-6xl 2xl:max-w-360 dark:border-white/7 dark:shadow-black/35 dark:backdrop-brightness-75">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
        <div className="flex min-w-0 items-center gap-3 lg:w-72 lg:shrink-0">
          <CoverArt
            coverPath={props.currentTrack?.coverPath}
            alt={
              props.currentTrack
                ? `${props.currentTrack.album} cover`
                : "No cover"
            }
            variant="player"
            className="h-12 w-12 rounded-md"
            loading="eager"
          />
          <div className="min-w-0">
            {currentTrack ? (
              <button
                type="button"
                onClick={() => props.onOpenAlbum(currentTrack)}
                className="text-theme-900 hover:text-accent-950 dark:text-theme-100 dark:hover:text-theme-200 block max-w-full cursor-pointer truncate text-left text-sm font-medium transition-colors"
              >
                {currentTrack.title}
              </button>
            ) : (
              <p className="text-theme-900 dark:text-theme-100 truncate text-sm font-medium">
                No track selected
              </p>
            )}
            <div className="text-theme-600 dark:text-theme-400 truncate text-xs">
              {currentTrack ? (
                <button
                  type="button"
                  onClick={() => props.onOpenArtist(currentTrack.artist)}
                  className="text-theme-600 hover:text-theme-800 dark:text-theme-400 dark:hover:text-theme-500 max-w-full cursor-pointer truncate text-left text-xs transition-colors"
                >
                  {currentTrack.artist}
                </button>
              ) : (
                "Select a track to start playback"
              )}
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => void props.onToggleShuffle()}
              className={`cursor-pointer rounded p-2 transition-colors ${
                props.queueState.shuffle
                  ? "text-accent-700 hover:text-accent-800 dark:text-accent-200 dark:hover:text-accent-100"
                  : "text-theme-400 hover:text-theme-700 dark:text-theme-500 dark:hover:text-theme-200"
              }`}
              aria-label="Toggle shuffle"
            >
              <Shuffle size={16} />
            </button>

            <button
              type="button"
              onClick={() => void props.onPreviousTrack()}
              disabled={!props.hasCurrentTrack || props.transportBusy}
              className="text-theme-700 hover:text-theme-600 disabled:text-theme-400 dark:text-theme-200 dark:hover:text-theme-100 dark:disabled:text-theme-600 cursor-pointer rounded p-2 transition-colors disabled:cursor-not-allowed"
              aria-label="Previous track"
            >
              <SkipBack size={16} fill="currentColor" />
            </button>

            <button
              type="button"
              onClick={() => void props.onTogglePlayback()}
              disabled={props.queueState.total === 0 || props.transportBusy}
              className="bg-accent-700 text-accent-50 hover:bg-accent-600 dark:bg-accent-50 dark:text-accent-900 dark:hover:bg-accent-200 cursor-pointer rounded-full bg-linear-to-b from-white/21 to-black/21 p-3 shadow-md shadow-black/25 transition hover:scale-105 active:scale-90 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? (
                <Pause size={18} fill="currentColor" />
              ) : (
                <Play size={18} fill="currentColor" />
              )}
            </button>

            <button
              type="button"
              onClick={() => void props.onNextTrack()}
              disabled={!props.hasCurrentTrack || props.transportBusy}
              className="text-theme-700 hover:text-theme-600 disabled:text-theme-400 dark:text-theme-200 dark:hover:text-theme-100 dark:disabled:text-theme-600 cursor-pointer rounded p-2 transition-colors disabled:cursor-not-allowed"
              aria-label="Next track"
            >
              <SkipForward size={16} fill="currentColor" />
            </button>

            <button
              type="button"
              onClick={() => void props.onCycleRepeat()}
              className={`cursor-pointer rounded p-2 transition-colors ${
                props.queueState.repeatMode === "off"
                  ? "text-theme-400 hover:text-theme-700 dark:text-theme-500 dark:hover:text-theme-200"
                  : "text-accent-700 hover:text-accent-800 dark:text-accent-200 dark:hover:text-accent-100"
              }`}
              aria-label="Cycle repeat mode"
            >
              <RepeatIcon size={16} />
            </button>
          </div>

          <div className="flex items-center justify-center gap-3">
            <span className="text-theme-700 dark:text-theme-300 -mt-0.5 w-10 shrink-0 text-right text-xs">
              {props.formatDuration(props.positionMs)}
            </span>
            <span className="max-w-160 flex-1">
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
            </span>
            <span className="text-theme-600 dark:text-theme-400 -mt-0.5 w-10 shrink-0 text-xs">
              {props.formatDuration(props.durationMs)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 lg:w-56 lg:shrink-0">
          <Volume2 size={16} className="text-theme-700 dark:text-theme-300" />
          <SingleValueSlider
            ariaLabel="Volume"
            min={0}
            max={100}
            step={1}
            value={props.volume}
            onValueChange={(nextValue) => {
              void props.onSetVolume(nextValue);
            }}
          />
          {/* <span className="w-9 text-xs text-theme-300">
            {props.playerState.volume}%
          </span> */}
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
        <Slider.Track className="bg-theme-300 relative h-1.5 w-full rounded-full dark:bg-black/50">
          <Slider.Indicator className="bg-theme-600 dark:bg-theme-300 absolute h-full rounded-full bg-linear-to-b from-white/7 to-black/7" />
          <Slider.Thumb
            aria-label={props.ariaLabel}
            className="bg-theme-900 border-theme-700 dark:bg-theme-100 block h-4 w-4 rounded-full border bg-linear-to-b from-white/15 to-black/15 shadow-md dark:border-black/28"
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
