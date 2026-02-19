import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";
import { useStore } from "zustand";
import { useBackgroundShaderStore } from "../../shared/store/backgroundShaderStore";
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
import { useBootstrap } from "./BootstrapContext";

type ThemeStoreProviderProps = {
  children: ReactNode;
};

export function ThemeStoreProvider(props: ThemeStoreProviderProps) {
  const { state: bootstrapState } = useBootstrap();
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
    enabled: bootstrapState.isBootstrapped,
  });

  const themePaletteQuery = useQuery({
    ...themeQueries.palette({
      coverPath: resolvedCoverPath,
      options: themeDefaultsQuery.data ?? fallbackThemeOptions,
    }),
    enabled: bootstrapState.isBootstrapped && resolvedCoverPath.length > 0,
  });

  useEffect(() => {
    if (!bootstrapState.isBootstrapped || hasHydratedThemePreference) {
      return;
    }

    const storedThemeMode = window.localStorage.getItem(themeModeStorageKey);
    const nextPreference =
      storedThemeMode === null
        ? bootstrapState.themeModePreference
        : parseThemeModePreference(storedThemeMode);

    themeStore.getState().actions.hydrateThemeModePreference(nextPreference);
  }, [
    bootstrapState.isBootstrapped,
    bootstrapState.themeModePreference,
    hasHydratedThemePreference,
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
    if (!bootstrapState.isBootstrapped) {
      return;
    }

    return scheduleAfterPaintAndIdle(() => {
      themeStore.getState().actions.setShaderReady(true);
    });
  }, [bootstrapState.isBootstrapped, themeStore]);

  return (
    <ThemeStoreContext.Provider value={themeStore}>
      {props.children}
    </ThemeStoreContext.Provider>
  );
}
