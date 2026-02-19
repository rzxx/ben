import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { SettingsView } from "../../features/settings/SettingsView";
import { useBackgroundShaderStore } from "../../shared/store/backgroundShaderStore";
import { queryKeys } from "../query/keys";
import { statsQueries } from "../query/statsQueries";
import { themeQueries } from "../query/themeQueries";
import { generateThemeFromCover } from "../services/gateway/themeGateway";
import {
  useScannerErrorMessage,
  useScannerLastProgress,
  useScannerNewRootPath,
  useScannerRuntimeActions,
  useScannerScanStatus,
  useScannerWatchedRoots,
} from "../state/scanner/scannerSelectors";
import {
  applyTailwindThemePaletteVariables,
  themeExtractOptionsDefaults,
  createEmptyStatsOverview,
  parseError,
} from "../utils/appUtils";
import {
  usePlaybackCoverPath,
  usePlaybackQueueState,
  usePlaybackStatus,
} from "../state/playback/playbackSelectors";
import {
  useResolvedThemeMode,
  useThemeActions,
  useThemeModePreference,
} from "../state/theme/themeSelectors";

const statsOverviewLimit = 5;

type GenerateThemePaletteInput = {
  coverPath: string;
};

export function SettingsRoute() {
  const queryClient = useQueryClient();

  const scannerActions = useScannerRuntimeActions();
  const scannerNewRootPath = useScannerNewRootPath();
  const scannerLastProgress = useScannerLastProgress();
  const scannerStatus = useScannerScanStatus();
  const watchedRoots = useScannerWatchedRoots();
  const scannerRuntimeErrorMessage = useScannerErrorMessage();

  const playbackQueueState = usePlaybackQueueState();
  const playbackPlayerStatus = usePlaybackStatus();
  const playbackCoverPath = usePlaybackCoverPath();
  const resolvedCoverPath = playbackCoverPath?.trim() ?? "";
  const setBackgroundThemePalette = useBackgroundShaderStore(
    (state) => state.setThemePalette,
  );

  const themeActions = useThemeActions();
  const themeModePreference = useThemeModePreference();
  const resolvedThemeMode = useResolvedThemeMode();

  const [themeManualErrorMessage, setThemeManualErrorMessage] = useState<string | null>(
    null,
  );

  const autoThemePaletteQuery = useQuery({
    ...themeQueries.palette(resolvedCoverPath),
    enabled: false,
  });

  const generateThemePaletteMutation = useMutation({
    mutationFn: (input: GenerateThemePaletteInput) =>
      generateThemeFromCover(input.coverPath, themeExtractOptionsDefaults),
    onMutate: () => {
      setThemeManualErrorMessage(null);
    },
    onSuccess: (palette, input) => {
      queryClient.setQueryData(queryKeys.theme.palette(input.coverPath), palette);

      const nextPalette = palette ?? null;
      setBackgroundThemePalette(nextPalette);
      applyTailwindThemePaletteVariables(nextPalette);
    },
    onError: (error: unknown) => {
      setThemeManualErrorMessage(parseError(error));
    },
  });

  const statsOverviewQuery = useQuery({
    ...statsQueries.overview({
      limit: statsOverviewLimit,
    }),
  });

  const statsOverview = statsOverviewQuery.data ?? createEmptyStatsOverview();
  const scannerErrorMessage = scannerRuntimeErrorMessage;

  const autoThemeErrorMessage = autoThemePaletteQuery.isError
    ? parseError(autoThemePaletteQuery.error)
    : null;

  const manualThemePalette =
    generateThemePaletteMutation.variables?.coverPath === resolvedCoverPath
      ? generateThemePaletteMutation.data
      : null;

  const themePalette =
    manualThemePalette ?? autoThemePaletteQuery.data ?? null;
  const themeBusy =
    generateThemePaletteMutation.isPending || autoThemePaletteQuery.isFetching;
  const themeErrorMessage = themeManualErrorMessage || autoThemeErrorMessage;

  const onAddWatchedRoot = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const path = scannerNewRootPath.trim();
    if (!path) {
      return;
    }

    await scannerActions.addWatchedRoot(path);
  };

  return (
    <SettingsView
      lastProgress={scannerLastProgress}
      scanStatus={scannerStatus}
      watchedRoots={watchedRoots}
      newRootPath={scannerNewRootPath}
      errorMessage={scannerErrorMessage}
      queueState={playbackQueueState}
      playerStatus={playbackPlayerStatus}
      statsOverview={statsOverview}
      currentCoverPath={playbackCoverPath ?? undefined}
      themePalette={themePalette}
      themeBusy={themeBusy}
      themeErrorMessage={themeErrorMessage}
      onNewRootPathChange={scannerActions.setNewRootPath}
      onAddWatchedRoot={onAddWatchedRoot}
      onToggleWatchedRoot={(root) =>
        scannerActions.setWatchedRootEnabled(root.id, !root.enabled)
      }
      onRemoveWatchedRoot={(id) => scannerActions.removeWatchedRoot(id)}
      onRunScan={() => scannerActions.runScan()}
      onGenerateThemePalette={async () => {
        if (!resolvedCoverPath) {
          setThemeManualErrorMessage("No cover art available for the current track.");
          return;
        }

        await generateThemePaletteMutation.mutateAsync({
          coverPath: resolvedCoverPath,
        });
      }}
      themeModePreference={themeModePreference}
      resolvedThemeMode={resolvedThemeMode}
      onThemeModePreferenceChange={themeActions.setThemeModePreference}
    />
  );
}
