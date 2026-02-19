import { CSSProperties, FormEvent } from "react";
import { coverPathToURL } from "../../shared/cover";
import {
  QueueState,
  ScanProgress,
  ScanStatus,
  StatsOverview,
  ThemeModePreference,
  ThemePalette,
  ThemePaletteColor,
  WatchedRoot,
} from "../types";
import { BackgroundShaderSettingsSection } from "./BackgroundShaderSettingsSection";
import { useQueueViewStore } from "../../shared/store/queueViewStore";

type SettingsViewProps = {
  lastProgress: ScanProgress | null;
  scanStatus: ScanStatus;
  watchedRoots: WatchedRoot[];
  newRootPath: string;
  errorMessage: string | null;
  queueState: QueueState;
  playerStatus: string;
  statsOverview: StatsOverview;
  currentCoverPath?: string;
  themePalette: ThemePalette | null;
  themeBusy: boolean;
  themeErrorMessage: string | null;
  themeModePreference: ThemeModePreference;
  resolvedThemeMode: "light" | "dark";
  onNewRootPathChange: (value: string) => void;
  onAddWatchedRoot: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onToggleWatchedRoot: (root: WatchedRoot) => Promise<void>;
  onRemoveWatchedRoot: (id: number) => Promise<void>;
  onRunScan: () => Promise<void>;
  onGenerateThemePalette: () => Promise<void>;
  onThemeModePreferenceChange: (next: ThemeModePreference) => void;
};

export function SettingsView(props: SettingsViewProps) {
  const shuffleDebugOpen = useQueueViewStore((state) => state.shuffleDebugOpen);
  const setShuffleDebugOpen = useQueueViewStore(
    (state) => state.setShuffleDebugOpen,
  );
  const coverURL = coverPathToURL(props.currentCoverPath);
  const gradientPreviewStyle = buildGradientPreviewStyle(
    props.themePalette?.gradient ?? [],
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

        <label className="text-theme-700 dark:text-theme-300 mt-3 inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={shuffleDebugOpen}
            onChange={(event) => setShuffleDebugOpen(event.target.checked)}
          />
          Show shuffle debug in queue view
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
        <div className="mt-3">
          <button
            type="button"
            onClick={() => {
              void props.onRunScan();
            }}
            disabled={props.scanStatus.running}
            className="bg-theme-900 text-theme-100 hover:bg-theme-800 dark:bg-theme-100 dark:text-theme-900 dark:hover:bg-theme-200 disabled:bg-theme-700 disabled:text-theme-300 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed"
          >
            {props.scanStatus.running ? "Scanning..." : "Scan Library"}
          </button>
        </div>
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

        <p className="text-theme-600 dark:text-theme-400 mt-3 text-sm">
          Palette extraction runs with the app defaults.
        </p>

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

      <BackgroundShaderSettingsSection />

      <section className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <MetricCard label="Queue Length" value={`${props.queueState.total}`} />
        <MetricCard label="Player Status" value={props.playerStatus} />
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
