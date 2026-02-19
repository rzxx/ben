import { createStore, type StoreApi } from "zustand/vanilla";
import type { ThemeModePreference } from "../../../features/types";
import type { ResolvedThemeMode } from "../../utils/appUtils";

export type ThemeStoreActions = {
  hydrateThemeModePreference: (next: ThemeModePreference) => void;
  setThemeModePreference: (next: ThemeModePreference) => void;
  setResolvedThemeMode: (next: ResolvedThemeMode) => void;
  setShaderReady: (ready: boolean) => void;
  setErrorMessage: (message: string | null) => void;
  clearErrorMessage: () => void;
};

export type ThemeStoreState = {
  themeModePreference: ThemeModePreference;
  resolvedThemeMode: ResolvedThemeMode;
  isShaderReady: boolean;
  hasHydratedThemePreference: boolean;
  errorMessage: string | null;
  actions: ThemeStoreActions;
};

export type ThemeStore = StoreApi<ThemeStoreState>;

export function createThemeStore(): ThemeStore {
  return createStore<ThemeStoreState>((set) => {
    const actions: ThemeStoreActions = {
      hydrateThemeModePreference: (next) => {
        set((state) => {
          if (state.hasHydratedThemePreference) {
            return state;
          }

          return {
            themeModePreference: next,
            hasHydratedThemePreference: true,
          };
        });
      },
      setThemeModePreference: (next) => {
        set({
          themeModePreference: next,
          hasHydratedThemePreference: true,
        });
      },
      setResolvedThemeMode: (next) => {
        set((state) => {
          if (state.resolvedThemeMode === next) {
            return state;
          }

          return { resolvedThemeMode: next };
        });
      },
      setShaderReady: (ready) => {
        set((state) => {
          if (state.isShaderReady === ready) {
            return state;
          }

          return { isShaderReady: ready };
        });
      },
      setErrorMessage: (message) => {
        set((state) => {
          if (state.errorMessage === message) {
            return state;
          }

          return { errorMessage: message };
        });
      },
      clearErrorMessage: () => {
        set((state) => {
          if (state.errorMessage === null) {
            return state;
          }

          return { errorMessage: null };
        });
      },
    };

    return {
      themeModePreference: "system",
      resolvedThemeMode: "dark",
      isShaderReady: false,
      hasHydratedThemePreference: false,
      errorMessage: null,
      actions,
    };
  });
}
