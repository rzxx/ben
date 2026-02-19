import { useSyncExternalStore } from "react";
import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

type HistoryEntry = {
  key: string;
  path: string;
  search: string;
  scrollTop: number;
};

type NavigateOptions = {
  replace?: boolean;
  state?: unknown;
  transition?: boolean;
};

type AppLocationState = {
  entries: HistoryEntry[];
  index: number;
  push: (href: string) => void;
  replace: (href: string) => void;
  go: (delta: number) => void;
  back: () => void;
  forward: () => void;
  setCurrentScroll: (scrollTop: number) => void;
};

const defaultEntry: HistoryEntry = {
  key: "entry-default",
  path: "/albums",
  search: "",
  scrollTop: 0,
};

let historyEntryCounter = 0;

const appLocationStore = createStore<AppLocationState>((set) => ({
  entries: [createHistoryEntry("/albums")],
  index: 0,
  push: (href) => {
    set((state) => {
      const nextEntry = createHistoryEntry(href);
      const baseEntries = state.entries.slice(0, state.index + 1);
      baseEntries.push(nextEntry);
      return {
        entries: baseEntries,
        index: baseEntries.length - 1,
      };
    });
  },
  replace: (href) => {
    set((state) => {
      const nextEntry = createHistoryEntry(href);
      if (state.entries.length === 0) {
        return {
          entries: [nextEntry],
          index: 0,
        };
      }

      const nextEntries = state.entries.slice();
      nextEntries[state.index] = nextEntry;
      return { entries: nextEntries };
    });
  },
  go: (delta) => {
    set((state) => {
      if (state.entries.length === 0) {
        return state;
      }

      const nextIndex = clamp(state.index + delta, 0, state.entries.length - 1);
      if (nextIndex === state.index) {
        return state;
      }

      return { index: nextIndex };
    });
  },
  back: () => {
    set((state) => {
      if (state.index === 0) {
        return state;
      }

      return { index: state.index - 1 };
    });
  },
  forward: () => {
    set((state) => {
      if (state.index >= state.entries.length - 1) {
        return state;
      }

      return { index: state.index + 1 };
    });
  },
  setCurrentScroll: (scrollTop) => {
    set((state) => {
      const currentEntry = state.entries[state.index];
      if (!currentEntry) {
        return state;
      }

      const nextScrollTop = Number.isFinite(scrollTop) ? Math.max(scrollTop, 0) : 0;
      if (currentEntry.scrollTop === nextScrollTop) {
        return state;
      }

      const nextEntries = state.entries.slice();
      nextEntries[state.index] = {
        ...currentEntry,
        scrollTop: nextScrollTop,
      };
      return { entries: nextEntries };
    });
  },
}));

const navigate = (href: string, options?: NavigateOptions) => {
  if (options?.replace) {
    appLocationStore.getState().replace(href);
    return;
  }

  appLocationStore.getState().push(href);
};

const subscribeToLocation = (listener: () => void) =>
  appLocationStore.subscribe(listener);

const getPathSnapshot = () => getCurrentHistoryEntry().path;

const getSearchSnapshot = () => getCurrentHistoryEntry().search;

function useAppLocation(): [string, typeof navigate] {
  const path = useSyncExternalStore(
    subscribeToLocation,
    getPathSnapshot,
    getPathSnapshot,
  );
  return [path, navigate];
}

function useAppSearch() {
  return useSyncExternalStore(
    subscribeToLocation,
    getSearchSnapshot,
    getSearchSnapshot,
  );
}

useAppLocation.searchHook = useAppSearch;

export const appLocation = {
  hook: useAppLocation,
  searchHook: useAppSearch,
  navigate,
};

export function useAppHistoryNavigation() {
  const canGoBack = useStore(appLocationStore, (state) => state.index > 0);
  const canGoForward = useStore(
    appLocationStore,
    (state) => state.index < state.entries.length - 1,
  );
  const back = useStore(appLocationStore, (state) => state.back);
  const forward = useStore(appLocationStore, (state) => state.forward);
  const go = useStore(appLocationStore, (state) => state.go);
  const setCurrentScroll = useStore(appLocationStore, (state) => state.setCurrentScroll);
  const currentEntryKey = useStore(
    appLocationStore,
    (state) => state.entries[state.index]?.key ?? defaultEntry.key,
  );

  return {
    canGoBack,
    canGoForward,
    back,
    forward,
    go,
    setCurrentScroll,
    currentEntryKey,
  };
}

export function getCurrentHistoryEntryScrollTop(): number {
  return getCurrentHistoryEntry().scrollTop;
}

function createHistoryEntry(href: string): HistoryEntry {
  const { path, search } = splitHref(href);
  historyEntryCounter += 1;
  return {
    key: `entry-${historyEntryCounter}`,
    path,
    search,
    scrollTop: 0,
  };
}

function getCurrentHistoryEntry(): HistoryEntry {
  const state = appLocationStore.getState();
  return state.entries[state.index] ?? state.entries[0] ?? defaultEntry;
}

function splitHref(href: string): { path: string; search: string } {
  const normalizedHref = href.trim();
  const [rawPath, ...searchParts] = normalizedHref.split("?");
  const path = normalizePath(rawPath);
  return {
    path,
    search: searchParts.join("?"),
  };
}

function normalizePath(path: string): string {
  if (!path) {
    return "/";
  }

  if (path.startsWith("/")) {
    return path;
  }

  return `/${path}`;
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }

  if (value > max) {
    return max;
  }

  return value;
}
