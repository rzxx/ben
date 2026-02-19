import { useScanner } from "../providers/ScannerContext";
import { useTheme } from "../providers/ThemeContext";
import { usePlaybackErrorMessage } from "../state/playback/playbackSelectors";

export function useShellDomainErrorMessage(): string | null {
  const playbackErrorMessage = usePlaybackErrorMessage();
  const { state: scannerState } = useScanner();
  const { state: themeState } = useTheme();

  return playbackErrorMessage || scannerState.errorMessage || themeState.errorMessage;
}
