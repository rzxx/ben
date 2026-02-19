import { usePlaybackErrorMessage } from "../state/playback/playbackSelectors";
import { useScannerErrorMessage } from "../state/scanner/scannerSelectors";
import { useThemeErrorMessage } from "../state/theme/themeSelectors";

export function useShellDomainErrorMessage(): string | null {
  const playbackErrorMessage = usePlaybackErrorMessage();
  const scannerErrorMessage = useScannerErrorMessage();
  const themeErrorMessage = useThemeErrorMessage();

  return playbackErrorMessage || scannerErrorMessage || themeErrorMessage;
}
