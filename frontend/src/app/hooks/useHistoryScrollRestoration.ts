import { useEffect, useLayoutEffect, type RefObject } from "react";
import {
  getCurrentHistoryEntryScrollTop,
  useAppHistoryNavigation,
} from "../routing/appLocation";

export function useHistoryScrollRestoration(
  viewportRef: RefObject<HTMLDivElement | null>,
) {
  const { setCurrentScroll, currentEntryKey } = useAppHistoryNavigation();

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    let frameId = 0;
    const onScroll = () => {
      if (frameId !== 0) {
        return;
      }

      frameId = window.requestAnimationFrame(() => {
        frameId = 0;
        setCurrentScroll(viewport.scrollTop);
      });
    };

    viewport.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      viewport.removeEventListener("scroll", onScroll);
      if (frameId !== 0) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [setCurrentScroll, viewportRef]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    const scrollTop = getCurrentHistoryEntryScrollTop();
    viewport.scrollTop = scrollTop;

    const frameId = window.requestAnimationFrame(() => {
      viewport.scrollTop = scrollTop;
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [currentEntryKey, viewportRef]);
}
