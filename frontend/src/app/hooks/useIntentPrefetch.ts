import { useCallback, useEffect, useRef } from "react";

const defaultIntentDelayMS = 180;

export function useIntentPrefetch<T>(
  prefetch: (input: T) => void,
  delayMS = defaultIntentDelayMS,
) {
  const timeoutIdRef = useRef<number | null>(null);

  const cancel = useCallback(() => {
    if (timeoutIdRef.current === null) {
      return;
    }

    window.clearTimeout(timeoutIdRef.current);
    timeoutIdRef.current = null;
  }, []);

  const schedule = useCallback(
    (input: T) => {
      cancel();
      timeoutIdRef.current = window.setTimeout(() => {
        timeoutIdRef.current = null;
        prefetch(input);
      }, delayMS);
    },
    [cancel, delayMS, prefetch],
  );

  useEffect(() => cancel, [cancel]);

  return {
    schedule,
    cancel,
  };
}
