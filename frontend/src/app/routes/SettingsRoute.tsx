import { useQuery } from "@tanstack/react-query";
import { FormEvent } from "react";
import { SettingsView } from "../../features/settings/SettingsView";
import { useScanner } from "../providers/ScannerContext";
import { useTheme } from "../providers/ThemeContext";
import { statsQueries } from "../query/statsQueries";
import { createEmptyStatsOverview } from "../utils/appUtils";
import {
  usePlaybackCoverPath,
  usePlaybackQueueState,
  usePlaybackStatus,
} from "../state/playback/playbackSelectors";

const statsOverviewLimit = 5;

export function SettingsRoute() {
  const { state: scannerState, actions: scannerActions } = useScanner();
  const playbackQueueState = usePlaybackQueueState();
  const playbackPlayerStatus = usePlaybackStatus();
  const playbackCoverPath = usePlaybackCoverPath() ?? undefined;
  const { state: themeState, actions: themeActions } = useTheme();

  const statsOverviewQuery = useQuery({
    ...statsQueries.overview({
      limit: statsOverviewLimit,
    }),
  });

  const statsOverview = statsOverviewQuery.data ?? createEmptyStatsOverview();

  const onAddWatchedRoot = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await scannerActions.addWatchedRoot(scannerState.newRootPath);
  };

  return (
    <SettingsView
      lastProgress={scannerState.lastProgress}
      scanStatus={scannerState.scanStatus}
      watchedRoots={scannerState.watchedRoots}
      newRootPath={scannerState.newRootPath}
      errorMessage={scannerState.errorMessage}
      queueState={playbackQueueState}
      playerStatus={playbackPlayerStatus}
      statsOverview={statsOverview}
      currentCoverPath={playbackCoverPath}
      themeOptions={themeState.themeOptions}
      themePalette={themeState.themePalette}
      themeBusy={themeState.themeBusy}
      themeErrorMessage={themeState.themeErrorMessage}
      onNewRootPathChange={scannerActions.setNewRootPath}
      onAddWatchedRoot={onAddWatchedRoot}
      onToggleWatchedRoot={scannerActions.toggleWatchedRoot}
      onRemoveWatchedRoot={scannerActions.removeWatchedRoot}
      onRunScan={scannerActions.runScan}
      onThemeOptionsChange={themeActions.setThemeOptions}
      onGenerateThemePalette={themeActions.generateThemePalette}
      themeModePreference={themeState.themeModePreference}
      resolvedThemeMode={themeState.resolvedThemeMode}
      onThemeModePreferenceChange={themeActions.setThemeModePreference}
    />
  );
}
