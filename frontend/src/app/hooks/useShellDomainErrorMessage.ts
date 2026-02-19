import { useLibrary } from "../providers/LibraryContext";
import { usePlayback } from "../providers/PlaybackContext";
import { useScanner } from "../providers/ScannerContext";
import { useStats } from "../providers/StatsContext";
import { useTheme } from "../providers/ThemeContext";

export function useShellDomainErrorMessage(): string | null {
  const { state: libraryState } = useLibrary();
  const { state: playbackState } = usePlayback();
  const { state: scannerState } = useScanner();
  const { state: statsState } = useStats();
  const { state: themeState } = useTheme();

  return (
    playbackState.errorMessage ||
    libraryState.errorMessage ||
    scannerState.errorMessage ||
    statsState.errorMessage ||
    themeState.errorMessage
  );
}
