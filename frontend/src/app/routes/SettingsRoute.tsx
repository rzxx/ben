import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent } from "react";
import { SettingsView } from "../../features/settings/SettingsView";
import type { ScanStatus } from "../../features/types";
import { useBootstrap } from "../providers/BootstrapContext";
import { useTheme } from "../providers/ThemeContext";
import { queryKeys } from "../query/keys";
import { scannerQueries } from "../query/scannerQueries";
import { statsQueries } from "../query/statsQueries";
import {
  addWatchedRoot,
  removeWatchedRoot,
  setWatchedRootEnabled,
  triggerScan,
} from "../services/gateway/scannerGateway";
import {
  useScannerErrorMessage,
  useScannerLastProgress,
  useScannerNewRootPath,
  useScannerRuntimeActions,
} from "../state/scanner/scannerSelectors";
import { createEmptyStatsOverview, parseError } from "../utils/appUtils";
import {
  usePlaybackCoverPath,
  usePlaybackQueueState,
  usePlaybackStatus,
} from "../state/playback/playbackSelectors";

const statsOverviewLimit = 5;

export function SettingsRoute() {
  const queryClient = useQueryClient();
  const { state: bootstrapState } = useBootstrap();

  const scannerActions = useScannerRuntimeActions();
  const scannerNewRootPath = useScannerNewRootPath();
  const scannerLastProgress = useScannerLastProgress();
  const scannerRuntimeErrorMessage = useScannerErrorMessage();

  const playbackQueueState = usePlaybackQueueState();
  const playbackPlayerStatus = usePlaybackStatus();
  const playbackCoverPath = usePlaybackCoverPath() ?? undefined;
  const { state: themeState, actions: themeActions } = useTheme();

  const scannerStatusQuery = useQuery({
    ...scannerQueries.status(),
    enabled: bootstrapState.isBootstrapped,
  });

  const watchedRootsQuery = useQuery({
    ...scannerQueries.watchedRoots(),
    enabled: bootstrapState.isBootstrapped,
  });

  const addWatchedRootMutation = useMutation({
    mutationFn: (path: string) => addWatchedRoot(path),
    onMutate: () => {
      scannerActions.clearErrorMessage();
    },
    onSuccess: async () => {
      scannerActions.setNewRootPath("");
      await queryClient.invalidateQueries({
        queryKey: queryKeys.scanner.watchedRoots(),
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.scanner.status(),
      });
    },
    onError: (error: unknown) => {
      scannerActions.setErrorMessage(parseError(error));
    },
  });

  const toggleWatchedRootMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      setWatchedRootEnabled(id, enabled),
    onMutate: () => {
      scannerActions.clearErrorMessage();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.scanner.watchedRoots(),
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.scanner.status(),
      });
    },
    onError: (error: unknown) => {
      scannerActions.setErrorMessage(parseError(error));
    },
  });

  const removeWatchedRootMutation = useMutation({
    mutationFn: (id: number) => removeWatchedRoot(id),
    onMutate: () => {
      scannerActions.clearErrorMessage();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.scanner.watchedRoots(),
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.scanner.status(),
      });
    },
    onError: (error: unknown) => {
      scannerActions.setErrorMessage(parseError(error));
    },
  });

  const runScanMutation = useMutation({
    mutationFn: () => triggerScan(),
    onMutate: () => {
      scannerActions.clearErrorMessage();
      queryClient.setQueryData(queryKeys.scanner.status(), (current: ScanStatus | undefined) => ({
        ...(current ?? { running: false }),
        running: true,
      }));
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.scanner.status(),
      });
    },
    onError: (error: unknown) => {
      scannerActions.setErrorMessage(parseError(error));
    },
  });

  const statsOverviewQuery = useQuery({
    ...statsQueries.overview({
      limit: statsOverviewLimit,
    }),
  });

  const statsOverview = statsOverviewQuery.data ?? createEmptyStatsOverview();
  const scannerStatus = scannerStatusQuery.data ?? bootstrapState.scanStatus;
  const watchedRoots = watchedRootsQuery.data ?? [];
  const watchedRootsErrorMessage = watchedRootsQuery.isError
    ? parseError(watchedRootsQuery.error)
    : null;
  const scannerStatusErrorMessage = scannerStatusQuery.isError
    ? parseError(scannerStatusQuery.error)
    : null;
  const scannerErrorMessage =
    scannerRuntimeErrorMessage || watchedRootsErrorMessage || scannerStatusErrorMessage;

  const onAddWatchedRoot = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const path = scannerNewRootPath.trim();
    if (!path) {
      return;
    }

    await addWatchedRootMutation.mutateAsync(path);
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
      currentCoverPath={playbackCoverPath}
      themeOptions={themeState.themeOptions}
      themePalette={themeState.themePalette}
      themeBusy={themeState.themeBusy}
      themeErrorMessage={themeState.themeErrorMessage}
      onNewRootPathChange={scannerActions.setNewRootPath}
      onAddWatchedRoot={onAddWatchedRoot}
      onToggleWatchedRoot={(root) =>
        toggleWatchedRootMutation.mutateAsync({
          id: root.id,
          enabled: !root.enabled,
        })
      }
      onRemoveWatchedRoot={(id) => removeWatchedRootMutation.mutateAsync(id)}
      onRunScan={() => runScanMutation.mutateAsync()}
      onThemeOptionsChange={themeActions.setThemeOptions}
      onGenerateThemePalette={themeActions.generateThemePalette}
      themeModePreference={themeState.themeModePreference}
      resolvedThemeMode={themeState.resolvedThemeMode}
      onThemeModePreferenceChange={themeActions.setThemeModePreference}
    />
  );
}
