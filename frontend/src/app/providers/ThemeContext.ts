import { createContext, useContext } from "react";
import {
  ThemeExtractOptions,
  ThemeModePreference,
  ThemePalette,
} from "../../features/types";
import { ResolvedThemeMode } from "../utils/appUtils";

export type ThemeState = {
  themeOptions: ThemeExtractOptions;
  themePalette: ThemePalette | null;
  themeBusy: boolean;
  themeErrorMessage: string | null;
  themeModePreference: ThemeModePreference;
  resolvedThemeMode: ResolvedThemeMode;
  errorMessage: string | null;
};

export type ThemeActions = {
  setThemeOptions: (next: ThemeExtractOptions) => void;
  generateThemePalette: () => Promise<void>;
  setThemeModePreference: (next: ThemeModePreference) => void;
  clearError: () => void;
};

export type ThemeMeta = {
  hasLoadedThemeDefaults: boolean;
  isShaderReady: boolean;
};

export type ThemeContextValue = {
  state: ThemeState;
  actions: ThemeActions;
  meta: ThemeMeta;
};

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const contextValue = useContext(ThemeContext);
  if (!contextValue) {
    throw new Error("useTheme must be used within ThemeProvider");
  }

  return contextValue;
}
