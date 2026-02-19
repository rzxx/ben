import { createContext } from "react";
import type {
  LibraryAlbum,
  PagedResult,
  PlayerState,
  QueueState,
  ScanStatus,
  ThemeModePreference,
} from "../../features/types";

export type AppStartupSnapshot = {
  queueState: QueueState;
  playerState: PlayerState;
  scanStatus: ScanStatus;
  albumsPage: PagedResult<LibraryAlbum>;
  themeModePreference: ThemeModePreference;
};

export type AppStartupState = {
  startupSnapshot: AppStartupSnapshot;
  isStartupPending: boolean;
  isStartupReady: boolean;
  startupErrorMessage: string | null;
};

export const AppStartupContext = createContext<AppStartupState | null>(null);
