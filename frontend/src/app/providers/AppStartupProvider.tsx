import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import type {
  LibraryAlbum,
  PlayerState,
  QueueState,
  ScanStatus,
} from "../../features/types";
import {
  AppStartupContext,
  type AppStartupSnapshot,
  type AppStartupState,
} from "../startup/startupContext";
import { queryKeys } from "../query/keys";
import { getAppStartupSnapshot } from "../services/gateway/startupGateway";
import {
  bootstrapAlbumsOffset,
  browseLimit,
  createEmptyAlbumsPage,
  createEmptyPlayerState,
  createEmptyQueueState,
  normalizePagedResult,
  parseError,
  parseThemeModePreference,
} from "../utils/appUtils";

type StartupQueryInput = {
  albumsLimit: number;
  albumsOffset: number;
};

type AppStartupProviderProps = {
  children: ReactNode;
};

const defaultStartupQueryInput: StartupQueryInput = {
  albumsLimit: browseLimit,
  albumsOffset: bootstrapAlbumsOffset,
};

const defaultAlbumsQueryInput = {
  search: "",
  artist: "",
  limit: defaultStartupQueryInput.albumsLimit,
  offset: defaultStartupQueryInput.albumsOffset,
} as const;

const emptyStartupSnapshot: AppStartupSnapshot = {
  queueState: createEmptyQueueState(),
  playerState: createEmptyPlayerState(),
  scanStatus: { running: false },
  albumsPage: createEmptyAlbumsPage(),
  themeModePreference: "system",
};

export function AppStartupProvider(props: AppStartupProviderProps) {
  const queryClient = useQueryClient();
  const [startupSnapshot, setStartupSnapshot] = useState<AppStartupSnapshot>(
    emptyStartupSnapshot,
  );
  const [isStartupPending, setIsStartupPending] = useState(true);
  const [startupErrorMessage, setStartupErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const abortController = new AbortController();

    void getAppStartupSnapshot(
      defaultStartupQueryInput.albumsLimit,
      defaultStartupQueryInput.albumsOffset,
      { signal: abortController.signal },
    )
      .then((snapshot) => {
        if (cancelled) {
          return;
        }

        const nextSnapshot: AppStartupSnapshot = {
          queueState: (snapshot?.queueState ?? createEmptyQueueState()) as QueueState,
          playerState: (snapshot?.playerState ?? createEmptyPlayerState()) as PlayerState,
          scanStatus: (snapshot?.scanStatus ?? { running: false }) as ScanStatus,
          albumsPage: normalizePagedResult<LibraryAlbum>(
            snapshot?.albumsPage,
            defaultStartupQueryInput.albumsLimit,
          ),
          themeModePreference: parseThemeModePreference(snapshot?.themeModePreference ?? null),
        };

        setStartupSnapshot(nextSnapshot);
        queryClient.setQueryData(
          queryKeys.library.albums(defaultAlbumsQueryInput),
          nextSnapshot.albumsPage,
        );
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }

        setStartupSnapshot(emptyStartupSnapshot);
        setStartupErrorMessage(parseError(error));
      })
      .finally(() => {
        if (cancelled) {
          return;
        }

        setIsStartupPending(false);
      });

    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [queryClient]);

  const value = useMemo<AppStartupState>(
    () => ({
      startupSnapshot,
      isStartupPending,
      isStartupReady: !isStartupPending,
      startupErrorMessage,
    }),
    [isStartupPending, startupErrorMessage, startupSnapshot],
  );

  return (
    <AppStartupContext.Provider value={value}>
      {props.children}
    </AppStartupContext.Provider>
  );
}
