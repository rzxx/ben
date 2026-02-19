import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  LibraryAlbum,
  PlayerState,
  QueueState,
  ScanStatus,
} from "../../features/types";
import { getAppBootstrap } from "../services/gateway/bootstrapGateway";
import {
  bootstrapAlbumsOffset,
  browseLimit,
  createEmptyAlbumsPage,
  createEmptyPlayerState,
  createEmptyQueueState,
  parseError,
  parseThemeModePreference,
  normalizePagedResult,
} from "../utils/appUtils";
import { appQueryClient } from "../query/client";
import { queryKeys } from "../query/keys";
import { BootstrapContext, BootstrapState } from "./BootstrapContext";

type BootstrapProviderProps = {
  children: ReactNode;
};

export function BootstrapProvider(props: BootstrapProviderProps) {
  const initializedRef = useRef(false);

  const [state, setState] = useState<BootstrapState>({
    isBootstrapped: false,
    errorMessage: null,
    queueState: createEmptyQueueState(),
    playerState: createEmptyPlayerState(),
    scanStatus: { running: false },
    albumsPage: createEmptyAlbumsPage(),
    themeModePreference: "system",
  });

  useEffect(() => {
    if (initializedRef.current) {
      return;
    }

    initializedRef.current = true;

    const initialize = async () => {
      try {
        const snapshot = await getAppBootstrap(browseLimit, bootstrapAlbumsOffset);
        const albumsPage = normalizePagedResult<LibraryAlbum>(snapshot?.albumsPage, browseLimit);

        appQueryClient.setQueryData(
          queryKeys.library.albums({
            search: "",
            artist: "",
            limit: browseLimit,
            offset: bootstrapAlbumsOffset,
          }),
          albumsPage,
        );

        setState((currentState) => ({
          ...currentState,
          queueState: (snapshot?.queueState ?? createEmptyQueueState()) as QueueState,
          playerState: (snapshot?.playerState ?? createEmptyPlayerState()) as PlayerState,
          scanStatus: (snapshot?.scanStatus ?? { running: false }) as ScanStatus,
          albumsPage,
          themeModePreference: parseThemeModePreference(snapshot?.themeModePreference ?? null),
          errorMessage: null,
        }));
      } catch (error) {
        setState((currentState) => ({
          ...currentState,
          errorMessage: parseError(error),
        }));
      } finally {
        setState((currentState) => ({
          ...currentState,
          isBootstrapped: true,
        }));
      }
    };

    void initialize();
  }, []);

  const value = useMemo(
    () => ({
      state,
    }),
    [state],
  );

  return (
    <BootstrapContext.Provider value={value}>
      {props.children}
    </BootstrapContext.Provider>
  );
}
