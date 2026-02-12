import { CSSProperties, FormEvent } from "react";
import { coverPathToURL } from "../../shared/cover";
import {
  PlayerState,
  QueueState,
  ScanProgress,
  ScanStatus,
  StatsOverview,
  ThemeExtractOptions,
  ThemePalette,
  ThemePaletteColor,
  WatchedRoot,
} from "../types";
import { useBackgroundShaderStore } from "../../shared/store/backgroundShaderStore";

type SettingsViewProps = {
  lastProgress: ScanProgress | null;
  scanStatus: ScanStatus;
  watchedRoots: WatchedRoot[];
  newRootPath: string;
  errorMessage: string | null;
  queueState: QueueState;
  playerState: PlayerState;
  statsOverview: StatsOverview;
  currentCoverPath?: string;
  themeOptions: ThemeExtractOptions;
  themePalette: ThemePalette | null;
  themeBusy: boolean;
  themeErrorMessage: string | null;
  onNewRootPathChange: (value: string) => void;
  onAddWatchedRoot: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onToggleWatchedRoot: (root: WatchedRoot) => Promise<void>;
  onRemoveWatchedRoot: (id: number) => Promise<void>;
  onThemeOptionsChange: (next: ThemeExtractOptions) => void;
  onGenerateThemePalette: () => Promise<void>;
};

export function SettingsView(props: SettingsViewProps) {
  const coverURL = coverPathToURL(props.currentCoverPath);
  const gradientPreviewStyle = buildGradientPreviewStyle(
    props.themePalette?.gradient ?? [],
  );
  const shaderSettings = useBackgroundShaderStore((state) => state.settings);
  const setShaderSettings = useBackgroundShaderStore(
    (state) => state.setSettings,
  );

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

      <section className="rounded-xl border border-neutral-800 bg-neutral-900/70 p-4">
        <h2 className="text-sm font-semibold text-neutral-100">
          Theme Palette Demo
        </h2>
        <p className="mt-1 text-sm text-neutral-400">
          Backend-generated palette from the active track cover.
        </p>

        <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-neutral-300 sm:grid-cols-2 lg:grid-cols-4">
          <NumericSetting
            label="Max Dimension"
            value={props.themeOptions.maxDimension}
            min={64}
            max={1024}
            step={1}
            onChange={(next) =>
              props.onThemeOptionsChange({
                ...props.themeOptions,
                maxDimension: next,
              })
            }
          />
          <NumericSetting
            label="Quality"
            value={props.themeOptions.quality}
            min={1}
            max={12}
            step={1}
            onChange={(next) =>
              props.onThemeOptionsChange({
                ...props.themeOptions,
                quality: next,
              })
            }
          />
          <NumericSetting
            label="Color Count"
            value={props.themeOptions.colorCount}
            min={3}
            max={10}
            step={1}
            onChange={(next) =>
              props.onThemeOptionsChange({
                ...props.themeOptions,
                colorCount: next,
              })
            }
          />
          <NumericSetting
            label="Candidates"
            value={props.themeOptions.candidateCount}
            min={3}
            max={128}
            step={1}
            onChange={(next) =>
              props.onThemeOptionsChange({
                ...props.themeOptions,
                candidateCount: next,
              })
            }
          />
          <NumericSetting
            label="Quantization Bits"
            value={props.themeOptions.quantizationBits}
            min={4}
            max={6}
            step={1}
            onChange={(next) =>
              props.onThemeOptionsChange({
                ...props.themeOptions,
                quantizationBits: next,
              })
            }
          />
          <NumericSetting
            label="Min Chroma"
            value={props.themeOptions.minChroma}
            min={0}
            max={0.4}
            step={0.01}
            onChange={(next) =>
              props.onThemeOptionsChange({
                ...props.themeOptions,
                minChroma: next,
              })
            }
          />
          <NumericSetting
            label="Target Chroma"
            value={props.themeOptions.targetChroma}
            min={0.02}
            max={0.42}
            step={0.01}
            onChange={(next) =>
              props.onThemeOptionsChange({
                ...props.themeOptions,
                targetChroma: next,
              })
            }
          />
          <NumericSetting
            label="Max Chroma"
            value={props.themeOptions.maxChroma}
            min={0.06}
            max={0.5}
            step={0.01}
            onChange={(next) =>
              props.onThemeOptionsChange({
                ...props.themeOptions,
                maxChroma: next,
              })
            }
          />
          <NumericSetting
            label="Min Delta (OKLab)"
            value={props.themeOptions.minDelta}
            min={0.01}
            max={0.45}
            step={0.01}
            onChange={(next) =>
              props.onThemeOptionsChange({
                ...props.themeOptions,
                minDelta: next,
              })
            }
          />
          <NumericSetting
            label="Alpha Threshold"
            value={props.themeOptions.alphaThreshold}
            min={0}
            max={254}
            step={1}
            onChange={(next) =>
              props.onThemeOptionsChange({
                ...props.themeOptions,
                alphaThreshold: next,
              })
            }
          />
          <NumericSetting
            label="Min Luma"
            value={props.themeOptions.minLuma}
            min={0}
            max={1}
            step={0.01}
            onChange={(next) =>
              props.onThemeOptionsChange({
                ...props.themeOptions,
                minLuma: next,
              })
            }
          />
          <NumericSetting
            label="Max Luma"
            value={props.themeOptions.maxLuma}
            min={0}
            max={1}
            step={0.01}
            onChange={(next) =>
              props.onThemeOptionsChange({
                ...props.themeOptions,
                maxLuma: next,
              })
            }
          />
          <NumericSetting
            label="Workers"
            value={props.themeOptions.workerCount}
            min={0}
            max={32}
            step={1}
            onChange={(next) =>
              props.onThemeOptionsChange({
                ...props.themeOptions,
                workerCount: next,
              })
            }
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-neutral-300">
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={props.themeOptions.ignoreNearWhite}
              onChange={(event) =>
                props.onThemeOptionsChange({
                  ...props.themeOptions,
                  ignoreNearWhite: event.target.checked,
                })
              }
            />
            Ignore near white
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={props.themeOptions.ignoreNearBlack}
              onChange={(event) =>
                props.onThemeOptionsChange({
                  ...props.themeOptions,
                  ignoreNearBlack: event.target.checked,
                })
              }
            />
            Ignore near black
          </label>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={!coverURL || props.themeBusy}
            onClick={() => {
              void props.onGenerateThemePalette();
            }}
            className="rounded-md bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 transition-colors hover:bg-neutral-200 disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-400"
          >
            {props.themeBusy ? "Generating..." : "Generate Theme Palette"}
          </button>
          {!coverURL ? (
            <p className="text-sm text-neutral-400">
              Play a track with cover art to run the demo.
            </p>
          ) : null}
        </div>

        {props.themeErrorMessage ? (
          <p className="mt-2 text-sm text-red-400">{props.themeErrorMessage}</p>
        ) : null}

        {coverURL ? (
          <div className="mt-4 flex flex-col gap-3 lg:flex-row">
            <img
              src={coverURL}
              alt="Current cover"
              className="h-40 w-40 rounded-lg border border-neutral-800 object-cover"
            />

            <div className="min-w-0 flex-1">
              {props.themePalette ? (
                <>
                  <div className="flex flex-wrap gap-2">
                    {props.themePalette.gradient.map((color, index) => (
                      <PaletteChip
                        key={`${color.hex}-${index}`}
                        color={color}
                        label={`Gradient ${index + 1}`}
                      />
                    ))}
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-6">
                    <RoleChip
                      label="Primary"
                      color={props.themePalette.primary}
                    />
                    <RoleChip
                      label="Secondary"
                      color={props.themePalette.secondary}
                    />
                    <RoleChip
                      label="Tertiary"
                      color={props.themePalette.tertiary}
                    />
                    <RoleChip
                      label="Accent"
                      color={props.themePalette.accent}
                    />
                    <RoleChip label="Dark" color={props.themePalette.dark} />
                    <RoleChip label="Light" color={props.themePalette.light} />
                  </div>

                  <div className="mt-3 overflow-hidden rounded-lg border border-neutral-800">
                    <div className="h-28 w-full" style={gradientPreviewStyle} />
                  </div>
                  <p className="mt-2 text-xs text-neutral-400">
                    Source {props.themePalette.sourceWidth}x
                    {props.themePalette.sourceHeight}, sampled to{" "}
                    {props.themePalette.sampleWidth}x
                    {props.themePalette.sampleHeight}
                  </p>
                </>
              ) : (
                <p className="text-sm text-neutral-400">
                  Generate a palette to preview swatches and gradient output.
                </p>
              )}
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-xl border border-neutral-800 bg-neutral-900/70 p-4">
        <h2 className="text-sm font-semibold text-neutral-100">
          Background Shader
        </h2>
        <p className="mt-1 text-sm text-neutral-400">
          WebGPU Perlin gradient controls. Palette transitions use OKLab
          interpolation in shader.
        </p>

        <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-neutral-300 sm:grid-cols-2 lg:grid-cols-3">
          <NumericSetting
            label="Effect Opacity"
            value={shaderSettings.opacity}
            min={0}
            max={1}
            step={0.01}
            onChange={(next) => setShaderSettings({ opacity: next })}
          />
          <NumericSetting
            label="Transition (sec)"
            value={shaderSettings.colorTransitionSeconds}
            min={0}
            max={16}
            step={0.1}
            onChange={(next) =>
              setShaderSettings({ colorTransitionSeconds: next })
            }
          />
          <NumericSetting
            label="Render Scale"
            value={shaderSettings.renderScale}
            min={0.2}
            max={1}
            step={0.01}
            onChange={(next) => setShaderSettings({ renderScale: next })}
          />
          <NumericSetting
            label="Noise Scale"
            value={shaderSettings.noiseScale}
            min={0.1}
            max={5}
            step={0.01}
            onChange={(next) => setShaderSettings({ noiseScale: next })}
          />
          <NumericSetting
            label="Flow Speed"
            value={shaderSettings.flowSpeed}
            min={0}
            max={5}
            step={0.01}
            onChange={(next) => setShaderSettings({ flowSpeed: next })}
          />
          <NumericSetting
            label="Warp Strength"
            value={shaderSettings.warpStrength}
            min={0}
            max={1.5}
            step={0.01}
            onChange={(next) => setShaderSettings({ warpStrength: next })}
          />
          <NumericSetting
            label="Blur Radius"
            value={shaderSettings.blurRadius}
            min={0}
            max={8}
            step={0.05}
            onChange={(next) => setShaderSettings({ blurRadius: next })}
          />
          <NumericSetting
            label="Blur Radius Step"
            value={shaderSettings.blurRadiusStep}
            min={0}
            max={3}
            step={0.05}
            onChange={(next) => setShaderSettings({ blurRadiusStep: next })}
          />
          <NumericSetting
            label="Blur Passes"
            value={shaderSettings.blurPasses}
            min={0}
            max={8}
            step={1}
            onChange={(next) => setShaderSettings({ blurPasses: next })}
          />
          <NumericSetting
            label="Blur Downsample"
            value={shaderSettings.blurDownsample}
            min={1.1}
            max={4}
            step={0.1}
            onChange={(next) => setShaderSettings({ blurDownsample: next })}
          />
          <NumericSetting
            label="Grain Strength"
            value={shaderSettings.grainStrength}
            min={0}
            max={0.25}
            step={0.001}
            onChange={(next) => setShaderSettings({ grainStrength: next })}
          />
          <NumericSetting
            label="Grain Scale"
            value={shaderSettings.grainScale}
            min={0.1}
            max={8}
            step={0.01}
            onChange={(next) => setShaderSettings({ grainScale: next })}
          />
        </div>
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

type NumericSettingProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (next: number) => void;
};

function NumericSetting(props: NumericSettingProps) {
  return (
    <label className="rounded-md border border-neutral-800 bg-neutral-900 px-2 py-2">
      <p className="text-xs tracking-wide text-neutral-500 uppercase">
        {props.label}
      </p>
      <input
        type="number"
        value={props.value}
        min={props.min}
        max={props.max}
        step={props.step}
        onChange={(event) => {
          const parsed = Number(event.target.value);
          if (!Number.isFinite(parsed)) {
            return;
          }
          props.onChange(parsed);
        }}
        className="mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-sm text-neutral-200 outline-none focus:border-neutral-500"
      />
    </label>
  );
}

type PaletteChipProps = {
  label: string;
  color: ThemePaletteColor;
};

function PaletteChip(props: PaletteChipProps) {
  return (
    <div className="min-w-32 rounded-md border border-neutral-800 bg-neutral-900 p-2">
      <p className="text-xs tracking-wide text-neutral-500 uppercase">
        {props.label}
      </p>
      <div
        className="mt-1 h-10 w-full rounded border border-neutral-700"
        style={{ backgroundColor: props.color.hex }}
      />
      <p className="mt-1 text-xs font-medium text-neutral-200">
        {props.color.hex}
      </p>
      <p className="text-[11px] text-neutral-400">
        L {Math.round(props.color.lightness * 100)}% | C{" "}
        {Math.round(props.color.chroma * 100)}%
      </p>
    </div>
  );
}

type RoleChipProps = {
  label: string;
  color?: ThemePaletteColor;
};

function RoleChip(props: RoleChipProps) {
  return (
    <div className="rounded-md border border-neutral-800 bg-neutral-900 p-2">
      <p className="text-xs tracking-wide text-neutral-500 uppercase">
        {props.label}
      </p>
      <div
        className="mt-1 h-8 w-full rounded border border-neutral-700"
        style={{ backgroundColor: props.color?.hex ?? "#111111" }}
      />
      <p className="mt-1 text-xs text-neutral-300">{props.color?.hex ?? "-"}</p>
    </div>
  );
}

function buildGradientPreviewStyle(colors: ThemePaletteColor[]): CSSProperties {
  if (colors.length === 0) {
    return {
      background:
        "linear-gradient(135deg, rgba(24,24,27,1) 0%, rgba(9,9,11,1) 100%)",
    };
  }

  const anchors = colors.slice(0, 4);
  const ordered = [
    anchors[0]?.hex,
    anchors[1]?.hex ?? anchors[0]?.hex,
    anchors[2]?.hex ?? anchors[0]?.hex,
    anchors[3]?.hex ?? anchors[1]?.hex ?? anchors[0]?.hex,
  ];

  return {
    backgroundImage: `radial-gradient(circle at 12% 24%, ${ordered[0]} 0%, transparent 50%), radial-gradient(circle at 82% 28%, ${ordered[1]} 0%, transparent 48%), radial-gradient(circle at 24% 86%, ${ordered[2]} 0%, transparent 44%), linear-gradient(135deg, ${ordered[3]} 0%, #09090b 92%)`,
  };
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
