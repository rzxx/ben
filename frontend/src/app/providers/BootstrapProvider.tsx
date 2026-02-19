import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { GetInitialState as getAppBootstrap } from "../../../bindings/ben/bootstrapservice";
import {
  LibraryAlbum,
  PlayerState,
  QueueState,
  ScanStatus,
} from "../../features/types";
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
        setState((currentState) => ({
          ...currentState,
          queueState: (snapshot?.queueState ?? createEmptyQueueState()) as QueueState,
          playerState: (snapshot?.playerState ?? createEmptyPlayerState()) as PlayerState,
          scanStatus: (snapshot?.scanStatus ?? { running: false }) as ScanStatus,
          albumsPage: normalizePagedResult<LibraryAlbum>(snapshot?.albumsPage, browseLimit),
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
