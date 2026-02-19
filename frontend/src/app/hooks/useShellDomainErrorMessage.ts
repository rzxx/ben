import { useTheme } from "../providers/ThemeContext";
import { usePlaybackErrorMessage } from "../state/playback/playbackSelectors";
import { useScannerErrorMessage } from "../state/scanner/scannerSelectors";

export function useShellDomainErrorMessage(): string | null {
  const playbackErrorMessage = usePlaybackErrorMessage();
  const scannerErrorMessage = useScannerErrorMessage();
  const { state: themeState } = useTheme();

  return playbackErrorMessage || scannerErrorMessage || themeState.errorMessage;
}
