import { createContext, useContext } from "react";
import { useStore } from "zustand";
import type { ThemeStore, ThemeStoreActions, ThemeStoreState } from "./themeStore";

export const ThemeStoreContext = createContext<ThemeStore | null>(null);

export function useThemeStoreSelector<T>(selector: (state: ThemeStoreState) => T): T {
  const store = useThemeStoreApi();
  return useStore(store, selector);
}

export function useThemeActions(): ThemeStoreActions {
  return useThemeStoreSelector((state) => state.actions);
}

export function useThemeModePreference() {
  return useThemeStoreSelector((state) => state.themeModePreference);
}

export function useResolvedThemeMode() {
  return useThemeStoreSelector((state) => state.resolvedThemeMode);
}

export function useThemeIsShaderReady() {
  return useThemeStoreSelector((state) => state.isShaderReady);
}

export function useThemeErrorMessage() {
  return useThemeStoreSelector((state) => state.errorMessage);
}

function useThemeStoreApi(): ThemeStore {
  const themeStore = useContext(ThemeStoreContext);
  if (!themeStore) {
    throw new Error("Theme store is missing. Wrap with ThemeStoreProvider.");
  }

  return themeStore;
}
