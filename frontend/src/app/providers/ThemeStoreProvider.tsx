import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";
import { useStore } from "zustand";
import { useBackgroundShaderStore } from "../../shared/store/backgroundShaderStore";
import { useAppBootstrapQuery } from "../hooks/useAppBootstrapQuery";
import { themeQueries } from "../query/themeQueries";
import { usePlaybackCoverPath } from "../state/playback/playbackSelectors";
import { ThemeStoreContext } from "../state/theme/themeSelectors";
import { createThemeStore } from "../state/theme/themeStore";
import {
  applyTailwindThemePaletteVariables,
  createDefaultThemeExtractOptions,
  darkColorSchemeMediaQuery,
  parseError,
  parseThemeModePreference,
  resolveThemeMode,
  scheduleAfterPaintAndIdle,
  themeModeStorageKey,
} from "../utils/appUtils";

type ThemeStoreProviderProps = {
  children: ReactNode;
};

export function ThemeStoreProvider(props: ThemeStoreProviderProps) {
  const { bootstrapSnapshot, isBootstrapped } = useAppBootstrapQuery();
  const playbackCoverPath = usePlaybackCoverPath();
  const resolvedCoverPath = playbackCoverPath?.trim() ?? "";

  const [themeStore] = useState(() => createThemeStore());
  const [fallbackThemeOptions] = useState(() => createDefaultThemeExtractOptions());

  const setBackgroundThemePalette = useBackgroundShaderStore(
    (state) => state.setThemePalette,
  );
  const setBackgroundThemeMode = useBackgroundShaderStore((state) => state.setThemeMode);

  const themeModePreference = useStore(themeStore, (state) => state.themeModePreference);
  const hasHydratedThemePreference = useStore(
    themeStore,
    (state) => state.hasHydratedThemePreference,
  );

  const themeDefaultsQuery = useQuery({
    ...themeQueries.defaultOptions(),
    enabled: isBootstrapped,
  });

  const themePaletteQuery = useQuery({
    ...themeQueries.palette({
      coverPath: resolvedCoverPath,
      options: themeDefaultsQuery.data ?? fallbackThemeOptions,
    }),
    enabled: isBootstrapped && resolvedCoverPath.length > 0,
  });

  useEffect(() => {
    if (!isBootstrapped || hasHydratedThemePreference) {
      return;
    }

    const storedThemeMode = window.localStorage.getItem(themeModeStorageKey);
    const nextPreference =
      storedThemeMode === null
        ? bootstrapSnapshot.themeModePreference
        : parseThemeModePreference(storedThemeMode);

    themeStore.getState().actions.hydrateThemeModePreference(nextPreference);
  }, [
    bootstrapSnapshot.themeModePreference,
    hasHydratedThemePreference,
    isBootstrapped,
    themeStore,
  ]);

  useEffect(() => {
    if (!hasHydratedThemePreference) {
      return;
    }

    window.localStorage.setItem(themeModeStorageKey, themeModePreference);
  }, [hasHydratedThemePreference, themeModePreference]);

  useEffect(() => {
    const mediaQueryList = window.matchMedia(darkColorSchemeMediaQuery);

    const applyThemeMode = () => {
      const nextResolvedTheme = resolveThemeMode(themeModePreference, mediaQueryList);
      themeStore.getState().actions.setResolvedThemeMode(nextResolvedTheme);

      const root = document.documentElement;
      root.classList.toggle("dark", nextResolvedTheme === "dark");
      root.dataset.theme = nextResolvedTheme;

      setBackgroundThemeMode(nextResolvedTheme);
    };

    applyThemeMode();

    if (themeModePreference !== "system") {
      return;
    }

    mediaQueryList.addEventListener("change", applyThemeMode);
    return () => {
      mediaQueryList.removeEventListener("change", applyThemeMode);
    };
  }, [setBackgroundThemeMode, themeModePreference, themeStore]);

  useEffect(() => {
    if (themePaletteQuery.data === undefined) {
      return;
    }

    const nextPalette = themePaletteQuery.data ?? null;
    setBackgroundThemePalette(nextPalette);
    applyTailwindThemePaletteVariables(nextPalette);
  }, [setBackgroundThemePalette, themePaletteQuery.data]);

  useEffect(() => {
    if (themeDefaultsQuery.isError) {
      themeStore.getState().actions.setErrorMessage(parseError(themeDefaultsQuery.error));
      return;
    }

    themeStore.getState().actions.clearErrorMessage();
  }, [themeDefaultsQuery.error, themeDefaultsQuery.isError, themeStore]);

  useEffect(() => {
    if (!isBootstrapped) {
      return;
    }

    return scheduleAfterPaintAndIdle(() => {
      themeStore.getState().actions.setShaderReady(true);
    });
  }, [isBootstrapped, themeStore]);

  return (
    <ThemeStoreContext.Provider value={themeStore}>
      {props.children}
    </ThemeStoreContext.Provider>
  );
}
