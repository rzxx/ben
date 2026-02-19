import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";
import { useStore } from "zustand";
import { useBackgroundShaderStore } from "../../shared/store/backgroundShaderStore";
import { useAppStartup } from "../hooks/useAppStartup";
import { themeQueries } from "../query/themeQueries";
import { usePlaybackCoverPath } from "../state/playback/playbackSelectors";
import { ThemeStoreContext } from "../state/theme/themeSelectors";
import { createThemeStore } from "../state/theme/themeStore";
import {
  applyTailwindThemePaletteVariables,
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
  const { startupSnapshot, isStartupReady } = useAppStartup();
  const playbackCoverPath = usePlaybackCoverPath();
  const resolvedCoverPath = playbackCoverPath?.trim() ?? "";

  const [themeStore] = useState(() => createThemeStore());

  const setBackgroundThemePalette = useBackgroundShaderStore(
    (state) => state.setThemePalette,
  );
  const setBackgroundThemeMode = useBackgroundShaderStore((state) => state.setThemeMode);

  const themeModePreference = useStore(themeStore, (state) => state.themeModePreference);
  const hasHydratedThemePreference = useStore(
    themeStore,
    (state) => state.hasHydratedThemePreference,
  );

  const themePaletteQuery = useQuery({
    ...themeQueries.palette(resolvedCoverPath),
    enabled: isStartupReady && resolvedCoverPath.length > 0,
  });

  useEffect(() => {
    if (!isStartupReady || hasHydratedThemePreference) {
      return;
    }

    const storedThemeMode = window.localStorage.getItem(themeModeStorageKey);
    const nextPreference =
      storedThemeMode === null
        ? startupSnapshot.themeModePreference
        : parseThemeModePreference(storedThemeMode);

    themeStore.getState().actions.hydrateThemeModePreference(nextPreference);
  }, [
    hasHydratedThemePreference,
    isStartupReady,
    startupSnapshot.themeModePreference,
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
    if (themePaletteQuery.isError) {
      themeStore.getState().actions.setErrorMessage(parseError(themePaletteQuery.error));
      return;
    }

    themeStore.getState().actions.clearErrorMessage();
  }, [themePaletteQuery.error, themePaletteQuery.isError, themeStore]);

  useEffect(() => {
    if (!isStartupReady) {
      return;
    }

    return scheduleAfterPaintAndIdle(() => {
      themeStore.getState().actions.setShaderReady(true);
    });
  }, [isStartupReady, themeStore]);

  return (
    <ThemeStoreContext.Provider value={themeStore}>
      {props.children}
    </ThemeStoreContext.Provider>
  );
}
