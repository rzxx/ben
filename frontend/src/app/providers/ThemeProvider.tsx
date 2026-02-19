import {
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocation } from "wouter";
import {
  generateThemeFromCover,
  getThemeDefaultOptions,
} from "../services/gateway/themeGateway";
import {
  ThemeExtractOptions,
  ThemeModePreference,
  ThemePalette,
} from "../../features/types";
import { useBackgroundShaderStore } from "../../shared/store/backgroundShaderStore";
import {
  ResolvedThemeMode,
  applyTailwindThemePaletteVariables,
  buildThemePaletteCacheKey,
  createDefaultThemeExtractOptions,
  darkColorSchemeMediaQuery,
  maxThemePaletteCacheEntries,
  parseError,
  parseThemeModePreference,
  resolveThemeMode,
  scheduleAfterPaintAndIdle,
  themeModeStorageKey,
} from "../utils/appUtils";
import { useBootstrap } from "./BootstrapContext";
import { usePlaybackCoverPath } from "./PlaybackContext";
import { ThemeContext, ThemeContextValue } from "./ThemeContext";

type ThemeProviderProps = {
  children: ReactNode;
};

export function ThemeProvider(props: ThemeProviderProps) {
  const [location] = useLocation();
  const { state: bootstrapState } = useBootstrap();
  const playbackCoverPath = usePlaybackCoverPath();

  const setBackgroundThemePalette = useBackgroundShaderStore(
    (state) => state.setThemePalette,
  );
  const setBackgroundThemeMode = useBackgroundShaderStore((state) => state.setThemeMode);

  const [themeOptions, setThemeOptions] = useState<ThemeExtractOptions>(
    createDefaultThemeExtractOptions(),
  );
  const [themePalette, setThemePalette] = useState<ThemePalette | null>(null);
  const [themeBusy, setThemeBusy] = useState(false);
  const [themeErrorMessage, setThemeErrorMessage] = useState<string | null>(null);
  const [themeModePreference, setThemeModePreference] =
    useState<ThemeModePreference>("system");
  const [resolvedThemeMode, setResolvedThemeMode] =
    useState<ResolvedThemeMode>("dark");
  const [hasLoadedThemeDefaults, setHasLoadedThemeDefaults] = useState(false);
  const [isShaderReady, setIsShaderReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const hasResolvedThemePreferenceRef = useRef(false);
  const themeRequestTokenRef = useRef(0);
  const themeOptionsRef = useRef(themeOptions);
  const themePaletteCacheRef = useRef(new Map<string, ThemePalette>());

  useEffect(() => {
    themeOptionsRef.current = themeOptions;
  }, [themeOptions]);

  const loadThemeDefaults = useCallback(async () => {
    const options = await getThemeDefaultOptions();
    setThemeOptions((options ?? createDefaultThemeExtractOptions()) as ThemeExtractOptions);
    setHasLoadedThemeDefaults(true);
  }, []);

  useEffect(() => {
    if (!bootstrapState.isBootstrapped || hasResolvedThemePreferenceRef.current) {
      return;
    }

    hasResolvedThemePreferenceRef.current = true;
    const storedThemeMode = window.localStorage.getItem(themeModeStorageKey);
    const storedPreference =
      storedThemeMode === null
        ? bootstrapState.themeModePreference
        : parseThemeModePreference(storedThemeMode);
    setThemeModePreference(storedPreference);
  }, [bootstrapState.isBootstrapped, bootstrapState.themeModePreference]);

  useEffect(() => {
    if (!hasResolvedThemePreferenceRef.current) {
      return;
    }

    window.localStorage.setItem(themeModeStorageKey, themeModePreference);
  }, [themeModePreference]);

  useEffect(() => {
    const mediaQueryList = window.matchMedia(darkColorSchemeMediaQuery);

    const applyThemeMode = () => {
      const nextResolvedTheme = resolveThemeMode(themeModePreference, mediaQueryList);
      setResolvedThemeMode(nextResolvedTheme);
      const root = document.documentElement;
      root.classList.toggle("dark", nextResolvedTheme === "dark");
      root.dataset.theme = nextResolvedTheme;
    };

    applyThemeMode();

    if (themeModePreference !== "system") {
      return;
    }

    mediaQueryList.addEventListener("change", applyThemeMode);
    return () => {
      mediaQueryList.removeEventListener("change", applyThemeMode);
    };
  }, [themeModePreference]);

  useEffect(() => {
    setBackgroundThemePalette(themePalette);
  }, [setBackgroundThemePalette, themePalette]);

  useEffect(() => {
    applyTailwindThemePaletteVariables(themePalette);
  }, [themePalette]);

  useEffect(() => {
    setBackgroundThemeMode(resolvedThemeMode);
  }, [resolvedThemeMode, setBackgroundThemeMode]);

  const generateThemePaletteForCover = useCallback(async (coverPath: string) => {
    const trimmedPath = coverPath.trim();
    if (!trimmedPath) {
      return;
    }

    const currentThemeOptions = themeOptionsRef.current;
    const cacheKey = buildThemePaletteCacheKey(trimmedPath, currentThemeOptions);
    const cachedPalette = themePaletteCacheRef.current.get(cacheKey);
    if (cachedPalette) {
      setThemeErrorMessage(null);
      setThemeBusy(false);
      setThemePalette(cachedPalette);
      return;
    }

    const requestToken = themeRequestTokenRef.current + 1;
    themeRequestTokenRef.current = requestToken;

    try {
      setThemeBusy(true);
      setThemeErrorMessage(null);
      const nextPalette = await generateThemeFromCover(trimmedPath, currentThemeOptions);

      if (requestToken !== themeRequestTokenRef.current) {
        return;
      }

      const palette = (nextPalette ?? null) as ThemePalette | null;
      setThemePalette(palette);
      if (palette) {
        themePaletteCacheRef.current.set(cacheKey, palette);
        while (themePaletteCacheRef.current.size > maxThemePaletteCacheEntries) {
          const oldestKey = themePaletteCacheRef.current.keys().next().value as
            | string
            | undefined;
          if (!oldestKey) {
            break;
          }
          themePaletteCacheRef.current.delete(oldestKey);
        }
      }
    } catch (error) {
      if (requestToken === themeRequestTokenRef.current) {
        setThemeErrorMessage(parseError(error));
      }
    } finally {
      if (requestToken === themeRequestTokenRef.current) {
        setThemeBusy(false);
      }
    }
  }, []);

  const generateThemePalette = useCallback(async () => {
    const coverPath = playbackCoverPath?.trim();
    if (!coverPath) {
      setThemeErrorMessage("No cover art available for the current track.");
      return;
    }

    await generateThemePaletteForCover(coverPath);
  }, [generateThemePaletteForCover, playbackCoverPath]);

  useEffect(() => {
    setThemeErrorMessage(null);
  }, [playbackCoverPath]);

  useEffect(() => {
    const coverPath = playbackCoverPath?.trim();
    if (!coverPath) {
      themeRequestTokenRef.current += 1;
      setThemeBusy(false);
      return;
    }

    void generateThemePaletteForCover(coverPath);
  }, [generateThemePaletteForCover, playbackCoverPath]);

  useEffect(() => {
    if (!bootstrapState.isBootstrapped || hasLoadedThemeDefaults) {
      return;
    }

    return scheduleAfterPaintAndIdle(() => {
      void loadThemeDefaults().catch((error: unknown) => {
        setErrorMessage(parseError(error));
      });
    });
  }, [bootstrapState.isBootstrapped, hasLoadedThemeDefaults, loadThemeDefaults]);

  useEffect(() => {
    if (!location.startsWith("/settings") || hasLoadedThemeDefaults) {
      return;
    }

    void loadThemeDefaults().catch((error: unknown) => {
      setErrorMessage(parseError(error));
    });
  }, [hasLoadedThemeDefaults, loadThemeDefaults, location]);

  useEffect(() => {
    if (!bootstrapState.isBootstrapped) {
      return;
    }

    return scheduleAfterPaintAndIdle(() => {
      setIsShaderReady(true);
    });
  }, [bootstrapState.isBootstrapped]);

  const clearErrorAction = useCallback(() => {
    setErrorMessage(null);
    setThemeErrorMessage(null);
  }, []);

  const contextValue = useMemo<ThemeContextValue>(
    () => ({
      state: {
        themeOptions,
        themePalette,
        themeBusy,
        themeErrorMessage,
        themeModePreference,
        resolvedThemeMode,
        errorMessage,
      },
      actions: {
        setThemeOptions,
        generateThemePalette,
        setThemeModePreference,
        clearError: clearErrorAction,
      },
      meta: {
        hasLoadedThemeDefaults,
        isShaderReady,
      },
    }),
    [
      clearErrorAction,
      errorMessage,
      generateThemePalette,
      hasLoadedThemeDefaults,
      isShaderReady,
      resolvedThemeMode,
      themeBusy,
      themeErrorMessage,
      themeModePreference,
      themeOptions,
      themePalette,
    ],
  );

  return <ThemeContext.Provider value={contextValue}>{props.children}</ThemeContext.Provider>;
}
