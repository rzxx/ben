import { createContext, useContext } from "react";
import {
  LibraryAlbum,
  PagedResult,
  PlayerState,
  QueueState,
  ScanStatus,
  ThemeModePreference,
} from "../../features/types";

export type BootstrapState = {
  isBootstrapped: boolean;
  errorMessage: string | null;
  queueState: QueueState;
  playerState: PlayerState;
  scanStatus: ScanStatus;
  albumsPage: PagedResult<LibraryAlbum>;
  themeModePreference: ThemeModePreference;
};

export type BootstrapContextValue = {
  state: BootstrapState;
};

export const BootstrapContext = createContext<BootstrapContextValue | null>(null);

export function useBootstrap(): BootstrapContextValue {
  const contextValue = useContext(BootstrapContext);
  if (!contextValue) {
    throw new Error("useBootstrap must be used within BootstrapProvider");
  }

  return contextValue;
}
