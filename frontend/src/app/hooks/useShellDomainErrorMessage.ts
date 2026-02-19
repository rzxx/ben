import { useLibrary } from "../providers/LibraryContext";
import { useScanner } from "../providers/ScannerContext";
import { useStats } from "../providers/StatsContext";
import { useTheme } from "../providers/ThemeContext";
import { usePlaybackErrorMessage } from "../state/playback/playbackSelectors";

export function useShellDomainErrorMessage(): string | null {
  const { state: libraryState } = useLibrary();
  const playbackErrorMessage = usePlaybackErrorMessage();
  const { state: scannerState } = useScanner();
  const { state: statsState } = useStats();
  const { state: themeState } = useTheme();

  return (
    playbackErrorMessage ||
    libraryState.errorMessage ||
    scannerState.errorMessage ||
    statsState.errorMessage ||
    themeState.errorMessage
  );
}
