import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { SettingsView } from "../../features/settings/SettingsView";
import type { ScanStatus, ThemeExtractOptions } from "../../features/types";
import { useBackgroundShaderStore } from "../../shared/store/backgroundShaderStore";
import { useAppBootstrapQuery } from "../hooks/useAppBootstrapQuery";
import { queryKeys } from "../query/keys";
import { scannerQueries } from "../query/scannerQueries";
import { statsQueries } from "../query/statsQueries";
import { themeQueries } from "../query/themeQueries";
import {
  addWatchedRoot,
  removeWatchedRoot,
  setWatchedRootEnabled,
  triggerScan,
} from "../services/gateway/scannerGateway";
import { generateThemeFromCover } from "../services/gateway/themeGateway";
import {
  useScannerErrorMessage,
  useScannerLastProgress,
  useScannerNewRootPath,
  useScannerRuntimeActions,
} from "../state/scanner/scannerSelectors";
import {
  applyTailwindThemePaletteVariables,
  createDefaultThemeExtractOptions,
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
  options: ThemeExtractOptions;
};

export function SettingsRoute() {
  const queryClient = useQueryClient();
  const { bootstrapSnapshot, isBootstrapped } = useAppBootstrapQuery();

  const scannerActions = useScannerRuntimeActions();
  const scannerNewRootPath = useScannerNewRootPath();
  const scannerLastProgress = useScannerLastProgress();
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

  const [fallbackThemeOptions] = useState<ThemeExtractOptions>(() =>
    createDefaultThemeExtractOptions(),
  );
  const [themeOptions, setThemeOptions] = useState<ThemeExtractOptions>(
    fallbackThemeOptions,
  );
  const [hasEditedThemeOptions, setHasEditedThemeOptions] = useState(false);
  const [themeManualErrorMessage, setThemeManualErrorMessage] = useState<string | null>(
    null,
  );

  const themeDefaultsQuery = useQuery({
    ...themeQueries.defaultOptions(),
    enabled: false,
  });

  const autoThemePaletteQuery = useQuery({
    ...themeQueries.palette({
      coverPath: resolvedCoverPath,
      options: themeDefaultsQuery.data ?? fallbackThemeOptions,
    }),
    enabled: false,
  });

  const effectiveThemeOptions = hasEditedThemeOptions
    ? themeOptions
    : themeDefaultsQuery.data ?? fallbackThemeOptions;

  const generateThemePaletteMutation = useMutation({
    mutationFn: (input: GenerateThemePaletteInput) =>
      generateThemeFromCover(input.coverPath, input.options),
    onMutate: () => {
      setThemeManualErrorMessage(null);
    },
    onSuccess: (palette, input) => {
      queryClient.setQueryData(
        queryKeys.theme.palette({
          coverPath: input.coverPath,
          options: input.options,
        }),
        palette,
      );

      const nextPalette = palette ?? null;
      setBackgroundThemePalette(nextPalette);
      applyTailwindThemePaletteVariables(nextPalette);
    },
    onError: (error: unknown) => {
      setThemeManualErrorMessage(parseError(error));
    },
  });

  const scannerStatusQuery = useQuery({
    ...scannerQueries.status(),
    enabled: isBootstrapped,
  });

  const watchedRootsQuery = useQuery({
    ...scannerQueries.watchedRoots(),
    enabled: isBootstrapped,
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
  const scannerStatus = scannerStatusQuery.data ?? bootstrapSnapshot.scanStatus;
  const watchedRoots = watchedRootsQuery.data ?? [];
  const watchedRootsErrorMessage = watchedRootsQuery.isError
    ? parseError(watchedRootsQuery.error)
    : null;
  const scannerStatusErrorMessage = scannerStatusQuery.isError
    ? parseError(scannerStatusQuery.error)
    : null;
  const scannerErrorMessage =
    scannerRuntimeErrorMessage || watchedRootsErrorMessage || scannerStatusErrorMessage;

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
      currentCoverPath={playbackCoverPath ?? undefined}
      themeOptions={effectiveThemeOptions}
      themePalette={themePalette}
      themeBusy={themeBusy}
      themeErrorMessage={themeErrorMessage}
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
      onThemeOptionsChange={(next) => {
        setHasEditedThemeOptions(true);
        setThemeManualErrorMessage(null);
        setThemeOptions(next);
      }}
      onGenerateThemePalette={async () => {
        if (!resolvedCoverPath) {
          setThemeManualErrorMessage("No cover art available for the current track.");
          return;
        }

        await generateThemePaletteMutation.mutateAsync({
          coverPath: resolvedCoverPath,
          options: effectiveThemeOptions,
        });
      }}
      themeModePreference={themeModePreference}
      resolvedThemeMode={resolvedThemeMode}
      onThemeModePreferenceChange={themeActions.setThemeModePreference}
    />
  );
}
