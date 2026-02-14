import { CSSProperties, FormEvent } from "react";
import { coverPathToURL } from "../../shared/cover";
import {
  PlayerState,
  QueueState,
  ScanProgress,
  ScanStatus,
  StatsOverview,
  ThemeExtractOptions,
  ThemeModePreference,
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
  themeModePreference: ThemeModePreference;
  resolvedThemeMode: "light" | "dark";
  onNewRootPathChange: (value: string) => void;
  onAddWatchedRoot: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onToggleWatchedRoot: (root: WatchedRoot) => Promise<void>;
  onRemoveWatchedRoot: (id: number) => Promise<void>;
  onThemeOptionsChange: (next: ThemeExtractOptions) => void;
  onGenerateThemePalette: () => Promise<void>;
  onThemeModePreferenceChange: (next: ThemeModePreference) => void;
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
      <div className="border-theme-300 bg-theme-50/80 dark:border-theme-800 dark:bg-theme-900/70 rounded-xl border p-4 backdrop-blur-sm">
        <h1 className="text-theme-900 dark:text-theme-100 text-xl font-semibold">
          Settings
        </h1>
        <p className="text-theme-600 dark:text-theme-400 mt-1 text-sm">
          Scanner, watched folders, and runtime stats.
        </p>
      </div>

      <section className="border-theme-300 bg-theme-50/80 dark:border-theme-800 dark:bg-theme-900/70 rounded-xl border p-4">
        <h2 className="text-theme-900 dark:text-theme-100 text-sm font-semibold">
          Appearance
        </h2>
        <p className="text-theme-600 dark:text-theme-400 mt-1 text-sm">
          Theme mode controls app chrome. Current: {props.resolvedThemeMode}.
        </p>
        <label className="mt-3 block">
          <span className="text-theme-600 dark:text-theme-400 text-xs tracking-wide uppercase">
            Mode
          </span>
          <select
            value={props.themeModePreference}
            onChange={(event) =>
              props.onThemeModePreferenceChange(
                event.target.value as ThemeModePreference,
              )
            }
            className="border-theme-300 bg-theme-100 text-theme-800 focus:border-theme-500 dark:border-theme-700 dark:bg-theme-950 dark:text-theme-200 dark:focus:border-theme-500 mt-1 w-full rounded border px-2 py-1.5 text-sm outline-none sm:w-56"
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
      </section>

      <section className="border-theme-300 bg-theme-50/80 dark:border-theme-800 dark:bg-theme-900/70 rounded-xl border p-4">
        <h2 className="text-theme-900 dark:text-theme-100 text-sm font-semibold">
          Scanner Progress
        </h2>
        {props.lastProgress ? (
          <div className="mt-3 flex flex-col gap-2">
            <div className="text-theme-600 dark:text-theme-400 flex items-center justify-between text-xs">
              <span className="capitalize">{props.lastProgress.phase}</span>
              <span>{props.lastProgress.percent}%</span>
            </div>
            <div className="bg-theme-200 dark:bg-theme-800 h-2 overflow-hidden rounded-full">
              <div
                className="bg-theme-700 dark:bg-theme-200 h-full"
                style={{
                  width: `${Math.max(0, Math.min(100, props.lastProgress.percent))}%`,
                }}
              />
            </div>
            <p className="text-theme-600 dark:text-theme-400 text-xs">
              {props.lastProgress.message}
            </p>
          </div>
        ) : (
          <p className="text-theme-600 dark:text-theme-400 mt-2 text-sm">
            No progress events yet.
          </p>
        )}

        <div className="text-theme-700 dark:text-theme-300 mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
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

      <section className="border-theme-300 bg-theme-50/80 dark:border-theme-800 dark:bg-theme-900/70 rounded-xl border p-4">
        <h2 className="text-theme-900 dark:text-theme-100 text-sm font-semibold">
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
            className="border-theme-300 bg-theme-100 text-theme-800 focus:border-theme-500 dark:border-theme-700 dark:bg-theme-950 dark:text-theme-200 dark:focus:border-theme-500 flex-1 rounded-md border px-3 py-2 text-sm outline-none"
          />
          <button
            type="submit"
            className="bg-theme-900 text-theme-100 hover:bg-theme-800 dark:bg-theme-100 dark:text-theme-900 dark:hover:bg-theme-200 rounded-md px-4 py-2 text-sm font-medium"
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
              className="border-theme-300 bg-theme-100 dark:border-theme-800 dark:bg-theme-900 flex flex-col gap-2 rounded-md border px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
            >
              <label className="text-theme-700 dark:text-theme-300 flex min-w-0 items-center gap-2 text-sm">
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
                className="bg-theme-200 text-theme-800 hover:bg-theme-300 dark:bg-theme-800 dark:text-theme-200 dark:hover:bg-theme-700 w-fit rounded-md px-3 py-1.5 text-xs"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="border-theme-300 bg-theme-50/80 dark:border-theme-800 dark:bg-theme-900/70 rounded-xl border p-4">
        <h2 className="text-theme-900 dark:text-theme-100 text-sm font-semibold">
          Theme Palette Demo
        </h2>
        <p className="text-theme-600 dark:text-theme-400 mt-1 text-sm">
          Backend-generated palette from the active track cover.
        </p>

        <div className="text-theme-700 dark:text-theme-300 mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
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
            label="Dark Base Lightness"
            value={props.themeOptions.darkBaseLightness}
            min={0.02}
            max={0.35}
            step={0.005}
            onChange={(next) =>
              props.onThemeOptionsChange({
                ...props.themeOptions,
                darkBaseLightness: next,
              })
            }
          />
          <NumericSetting
            label="Light Base Lightness"
            value={props.themeOptions.lightBaseLightness}
            min={0.75}
            max={0.99}
            step={0.005}
            onChange={(next) =>
              props.onThemeOptionsChange({
                ...props.themeOptions,
                lightBaseLightness: next,
              })
            }
          />
          <NumericSetting
            label="Dark Lightness Deviation"
            value={props.themeOptions.darkLightnessDeviation}
            min={0.005}
            max={0.3}
            step={0.005}
            onChange={(next) =>
              props.onThemeOptionsChange({
                ...props.themeOptions,
                darkLightnessDeviation: next,
              })
            }
          />
          <NumericSetting
            label="Light Lightness Deviation"
            value={props.themeOptions.lightLightnessDeviation}
            min={0.005}
            max={0.2}
            step={0.005}
            onChange={(next) =>
              props.onThemeOptionsChange({
                ...props.themeOptions,
                lightLightnessDeviation: next,
              })
            }
          />
          <NumericSetting
            label="Dark Chroma Scale"
            value={props.themeOptions.darkChromaScale}
            min={0.05}
            max={1.4}
            step={0.01}
            onChange={(next) =>
              props.onThemeOptionsChange({
                ...props.themeOptions,
                darkChromaScale: next,
              })
            }
          />
          <NumericSetting
            label="Light Chroma Scale"
            value={props.themeOptions.lightChromaScale}
            min={0.05}
            max={1.2}
            step={0.01}
            onChange={(next) =>
              props.onThemeOptionsChange({
                ...props.themeOptions,
                lightChromaScale: next,
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

        <div className="text-theme-700 dark:text-theme-300 mt-3 flex flex-wrap items-center gap-4 text-sm">
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
            className="bg-theme-900 text-theme-100 hover:bg-theme-800 dark:bg-theme-100 dark:text-theme-900 dark:hover:bg-theme-200 disabled:bg-theme-700 disabled:text-theme-300 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed"
          >
            {props.themeBusy ? "Generating..." : "Generate Theme Palette"}
          </button>
          {!coverURL ? (
            <p className="text-theme-600 dark:text-theme-400 text-sm">
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
              className="border-theme-300 dark:border-theme-800 h-40 w-40 rounded-lg border object-cover"
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

                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    <RoleChip
                      label="Primary"
                      color={props.themePalette.primary}
                    />
                    <RoleChip
                      label="Accent"
                      color={props.themePalette.accent}
                    />
                    <RoleChip label="Dark" color={props.themePalette.dark} />
                    <RoleChip label="Light" color={props.themePalette.light} />
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {props.themePalette.themeScale.map((tone) => (
                      <PaletteChip
                        key={`${tone.tone}-${tone.color.hex}`}
                        color={tone.color}
                        label={`Theme ${tone.tone}`}
                      />
                    ))}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {props.themePalette.accentScale.map((tone) => (
                      <PaletteChip
                        key={`accent-${tone.tone}-${tone.color.hex}`}
                        color={tone.color}
                        label={`Accent ${tone.tone}`}
                      />
                    ))}
                  </div>

                  <div className="border-theme-300 dark:border-theme-800 mt-3 overflow-hidden rounded-lg border">
                    <div className="h-28 w-full" style={gradientPreviewStyle} />
                  </div>
                  <p className="text-theme-600 dark:text-theme-400 mt-2 text-xs">
                    Source {props.themePalette.sourceWidth}x
                    {props.themePalette.sourceHeight}, sampled to{" "}
                    {props.themePalette.sampleWidth}x
                    {props.themePalette.sampleHeight}
                  </p>
                </>
              ) : (
                <p className="text-theme-600 dark:text-theme-400 text-sm">
                  Generate a palette to preview swatches and gradient output.
                </p>
              )}
            </div>
          </div>
        ) : null}
      </section>

      <section className="border-theme-300 bg-theme-50/80 dark:border-theme-800 dark:bg-theme-900/70 rounded-xl border p-4">
        <h2 className="text-theme-900 dark:text-theme-100 text-sm font-semibold">
          Background Shader
        </h2>
        <p className="text-theme-600 dark:text-theme-400 mt-1 text-sm">
          Gradient background controls
        </p>

        <div className="text-theme-700 dark:text-theme-300 mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <SelectSetting
            label="Scene Module"
            value={shaderSettings.sceneVariant}
            options={[
              { value: "stableLayered", label: "Stable Layered" },
              { value: "legacyFeedback", label: "Legacy Feedback" },
            ]}
            onChange={(next) => {
              if (!isSceneVariant(next)) {
                return;
              }
              setShaderSettings({ sceneVariant: next });
            }}
          />
          <SelectSetting
            label="Blur Module"
            value={shaderSettings.blurMode}
            options={[
              { value: "mipPyramid", label: "Mip Pyramid" },
              { value: "dualKawase", label: "Dual Kawase" },
              { value: "none", label: "None" },
            ]}
            onChange={(next) => {
              if (!isBlurMode(next)) {
                return;
              }
              setShaderSettings({ blurMode: next });
            }}
          />
          <ToggleSetting
            label="Temporal Accumulation"
            checked={shaderSettings.temporalEnabled}
            onChange={(checked) =>
              setShaderSettings({ temporalEnabled: checked })
            }
          />
        </div>

        <div className="text-theme-700 dark:text-theme-300 mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
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
            label="Max Render DPR"
            value={shaderSettings.maxRenderDpr}
            min={0.75}
            max={2}
            step={0.05}
            onChange={(next) => setShaderSettings({ maxRenderDpr: next })}
          />
          <NumericSetting
            label="Target FPS"
            value={shaderSettings.targetFrameRate}
            min={15}
            max={60}
            step={1}
            onChange={(next) => setShaderSettings({ targetFrameRate: next })}
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
            label="Detail Amount"
            value={shaderSettings.detailAmount}
            min={0}
            max={1}
            step={0.01}
            onChange={(next) => setShaderSettings({ detailAmount: next })}
          />
          <NumericSetting
            label="Detail Scale"
            value={shaderSettings.detailScale}
            min={0.2}
            max={4}
            step={0.01}
            onChange={(next) => setShaderSettings({ detailScale: next })}
          />
          <NumericSetting
            label="Detail Speed"
            value={shaderSettings.detailSpeed}
            min={0}
            max={4}
            step={0.01}
            onChange={(next) => setShaderSettings({ detailSpeed: next })}
          />
          <NumericSetting
            label="Color Drift"
            value={shaderSettings.colorDrift}
            min={0}
            max={1}
            step={0.01}
            onChange={(next) => setShaderSettings({ colorDrift: next })}
          />
          <NumericSetting
            label="Luma Anchor"
            value={shaderSettings.lumaAnchor}
            min={0}
            max={1}
            step={0.01}
            onChange={(next) => setShaderSettings({ lumaAnchor: next })}
          />
          <NumericSetting
            label="Luma Remap Strength"
            value={shaderSettings.lumaRemapStrength}
            min={0}
            max={1}
            step={0.01}
            onChange={(next) =>
              setShaderSettings({ lumaRemapStrength: next })
            }
          />
          <NumericSetting
            label="Light Tint Lightness"
            value={shaderSettings.lightThemeTintLightness}
            min={0.72}
            max={0.96}
            step={0.005}
            onChange={(next) =>
              setShaderSettings({ lightThemeTintLightness: next })
            }
          />
          <NumericSetting
            label="Light Tint Min Chroma"
            value={shaderSettings.lightThemeTintMinChroma}
            min={0}
            max={0.25}
            step={0.005}
            onChange={(next) =>
              setShaderSettings({ lightThemeTintMinChroma: next })
            }
          />
          <NumericSetting
            label="Light Tint Max Chroma"
            value={shaderSettings.lightThemeTintMaxChroma}
            min={0}
            max={0.35}
            step={0.005}
            onChange={(next) =>
              setShaderSettings({ lightThemeTintMaxChroma: next })
            }
          />
          <NumericSetting
            label="Blur Radius"
            value={shaderSettings.blurRadius}
            min={0}
            max={8}
            step={0.05}
            onChange={(next) => setShaderSettings({ blurRadius: next })}
          />
          {shaderSettings.blurMode === "mipPyramid" ? (
            <>
              <NumericSetting
                label="Mip Levels"
                value={shaderSettings.mipLevels}
                min={1}
                max={5}
                step={1}
                onChange={(next) => setShaderSettings({ mipLevels: next })}
              />
              <NumericSetting
                label="Mip Curve"
                value={shaderSettings.mipCurve}
                min={0.2}
                max={3}
                step={0.05}
                onChange={(next) => setShaderSettings({ mipCurve: next })}
              />
            </>
          ) : null}
          {shaderSettings.blurMode === "dualKawase" ? (
            <>
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
            </>
          ) : null}
          {shaderSettings.temporalEnabled ? (
            <>
              <NumericSetting
                label="Temporal Strength"
                value={shaderSettings.temporalStrength}
                min={0}
                max={0.98}
                step={0.01}
                onChange={(next) =>
                  setShaderSettings({ temporalStrength: next })
                }
              />
              <NumericSetting
                label="Temporal Response"
                value={shaderSettings.temporalResponse}
                min={0.01}
                max={1.5}
                step={0.01}
                onChange={(next) =>
                  setShaderSettings({ temporalResponse: next })
                }
              />
              <NumericSetting
                label="Temporal Clamp"
                value={shaderSettings.temporalClamp}
                min={0.01}
                max={1}
                step={0.01}
                onChange={(next) => setShaderSettings({ temporalClamp: next })}
              />
            </>
          ) : null}
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
    <div className="border-theme-300 bg-theme-100 dark:border-theme-800 dark:bg-theme-900 rounded-md border px-2 py-2">
      <p className="text-theme-600 dark:text-theme-500 text-xs tracking-wide uppercase">
        {props.label}
      </p>
      <p className="text-theme-800 dark:text-theme-200 truncate text-sm">
        {props.value}
      </p>
    </div>
  );
}

function MetricCard(props: MetricProps) {
  return (
    <div className="border-theme-300 bg-theme-50/80 dark:border-theme-800 dark:bg-theme-900/70 rounded-xl border p-4">
      <p className="text-theme-600 dark:text-theme-500 text-xs tracking-wide uppercase">
        {props.label}
      </p>
      <p className="text-theme-900 dark:text-theme-100 mt-1 text-lg font-semibold">
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

type SelectOption = {
  value: string;
  label: string;
};

type SelectSettingProps = {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (next: string) => void;
};

type ToggleSettingProps = {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
};

function SelectSetting(props: SelectSettingProps) {
  return (
    <label className="border-theme-300 bg-theme-100 dark:border-theme-800 dark:bg-theme-900 rounded-md border px-2 py-2">
      <p className="text-theme-600 dark:text-theme-500 text-xs tracking-wide uppercase">
        {props.label}
      </p>
      <select
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        className="border-theme-300 bg-theme-50 text-theme-800 focus:border-theme-500 dark:border-theme-700 dark:bg-theme-950 dark:text-theme-200 dark:focus:border-theme-500 mt-1 w-full rounded border px-2 py-1 text-sm outline-none"
      >
        {props.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ToggleSetting(props: ToggleSettingProps) {
  return (
    <label className="border-theme-300 bg-theme-100 text-theme-800 dark:border-theme-800 dark:bg-theme-900 dark:text-theme-200 flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
      <span className="text-theme-600 dark:text-theme-400 text-xs tracking-wide uppercase">
        {props.label}
      </span>
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(event) => props.onChange(event.target.checked)}
      />
    </label>
  );
}

function NumericSetting(props: NumericSettingProps) {
  return (
    <label className="border-theme-300 bg-theme-100 dark:border-theme-800 dark:bg-theme-900 rounded-md border px-2 py-2">
      <p className="text-theme-600 dark:text-theme-500 text-xs tracking-wide uppercase">
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
        className="border-theme-300 bg-theme-50 text-theme-800 focus:border-theme-500 dark:border-theme-700 dark:bg-theme-950 dark:text-theme-200 dark:focus:border-theme-500 mt-1 w-full rounded border px-2 py-1 text-sm outline-none"
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
    <div className="border-theme-300 bg-theme-100 dark:border-theme-800 dark:bg-theme-900 min-w-32 rounded-md border p-2">
      <p className="text-theme-600 dark:text-theme-500 text-xs tracking-wide uppercase">
        {props.label}
      </p>
      <div
        className="border-theme-300 dark:border-theme-700 mt-1 h-10 w-full rounded border"
        style={{ backgroundColor: props.color.hex }}
      />
      <p className="text-theme-800 dark:text-theme-200 mt-1 text-xs font-medium">
        {props.color.hex}
      </p>
      <p className="text-theme-600 dark:text-theme-400 text-[11px]">
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
    <div className="border-theme-300 bg-theme-100 dark:border-theme-800 dark:bg-theme-900 rounded-md border p-2">
      <p className="text-theme-600 dark:text-theme-500 text-xs tracking-wide uppercase">
        {props.label}
      </p>
      <div
        className="border-theme-300 dark:border-theme-700 mt-1 h-8 w-full rounded border"
        style={{ backgroundColor: props.color?.hex ?? "#111111" }}
      />
      <p className="text-theme-700 dark:text-theme-300 mt-1 text-xs">
        {props.color?.hex ?? "-"}
      </p>
    </div>
  );
}

function isSceneVariant(
  value: string,
): value is "stableLayered" | "legacyFeedback" {
  return value === "stableLayered" || value === "legacyFeedback";
}

function isBlurMode(
  value: string,
): value is "mipPyramid" | "dualKawase" | "none" {
  return value === "mipPyramid" || value === "dualKawase" || value === "none";
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
