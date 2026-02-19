import { FormEvent } from "react";
import { SettingsView } from "../../features/settings/SettingsView";
import { useScanner } from "../providers/ScannerContext";
import { useStats } from "../providers/StatsContext";
import { useTheme } from "../providers/ThemeContext";
import {
  usePlaybackCoverPath,
  usePlaybackPlayerState,
  usePlaybackQueueState,
} from "../state/playback/playbackSelectors";

export function SettingsRoute() {
  const { state: scannerState, actions: scannerActions } = useScanner();
  const playbackQueueState = usePlaybackQueueState();
  const playbackPlayerState = usePlaybackPlayerState();
  const playbackCoverPath = usePlaybackCoverPath() ?? undefined;
  const { state: statsState } = useStats();
  const { state: themeState, actions: themeActions } = useTheme();

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
      playerState={playbackPlayerState}
      statsOverview={statsState.overview}
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
