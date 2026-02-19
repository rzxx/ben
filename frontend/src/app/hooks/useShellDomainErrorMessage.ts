import { useScanner } from "../providers/ScannerContext";
import { useStats } from "../providers/StatsContext";
import { useTheme } from "../providers/ThemeContext";
import { usePlaybackErrorMessage } from "../state/playback/playbackSelectors";

export function useShellDomainErrorMessage(): string | null {
  const playbackErrorMessage = usePlaybackErrorMessage();
  const { state: scannerState } = useScanner();
  const { state: statsState } = useStats();
  const { state: themeState } = useTheme();

  return (
    playbackErrorMessage ||
    scannerState.errorMessage ||
    statsState.errorMessage ||
    themeState.errorMessage
  );
}
