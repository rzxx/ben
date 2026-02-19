import { useEffect, type RefObject } from "react";

type HistorySwipeNavigationOptions = {
  viewportRef: RefObject<HTMLDivElement | null>;
  back: () => void;
  forward: () => void;
};

const touchDistanceThresholdPX = 84;
const touchMaxDurationMS = 750;
const touchDominanceRatio = 1.35;

const wheelDistanceThreshold = 160;
const wheelResetIdleMS = 220;
const wheelDominanceRatio = 1.2;

const navigationCooldownMS = 420;

export function useHistorySwipeNavigation(options: HistorySwipeNavigationOptions) {
  const { viewportRef, back, forward } = options;

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    let lastNavigationAt = 0;

    let touchStartX = 0;
    let touchStartY = 0;
    let touchCurrentX = 0;
    let touchCurrentY = 0;
    let touchStartAt = 0;
    let trackingTouch = false;

    let wheelAccumulator = 0;
    let wheelDirection: -1 | 0 | 1 = 0;
    let lastWheelAt = 0;
    let wheelNeedsReset = false;

    const triggerNavigation = (direction: -1 | 1): boolean => {
      const now = performance.now();
      if (now - lastNavigationAt < navigationCooldownMS) {
        return false;
      }

      lastNavigationAt = now;
      if (direction < 0) {
        back();
      } else {
        forward();
      }

      return true;
    };

    const resetWheelAccumulator = () => {
      wheelAccumulator = 0;
      wheelDirection = 0;
      lastWheelAt = 0;
    };

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) {
        trackingTouch = false;
        return;
      }

      const touch = event.touches[0];
      trackingTouch = true;
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
      touchCurrentX = touch.clientX;
      touchCurrentY = touch.clientY;
      touchStartAt = performance.now();
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!trackingTouch || event.touches.length !== 1) {
        return;
      }

      const touch = event.touches[0];
      touchCurrentX = touch.clientX;
      touchCurrentY = touch.clientY;
    };

    const onTouchEnd = (event: TouchEvent) => {
      if (!trackingTouch) {
        return;
      }

      trackingTouch = false;

      const elapsedMS = performance.now() - touchStartAt;
      if (elapsedMS > touchMaxDurationMS) {
        return;
      }

      const deltaX = touchCurrentX - touchStartX;
      const deltaY = touchCurrentY - touchStartY;
      if (Math.abs(deltaX) < touchDistanceThresholdPX) {
        return;
      }

      if (Math.abs(deltaX) < Math.abs(deltaY) * touchDominanceRatio) {
        return;
      }

      const didNavigate = triggerNavigation(deltaX > 0 ? -1 : 1);
      if (didNavigate) {
        event.preventDefault();
      }
    };

    const onTouchCancel = () => {
      trackingTouch = false;
    };

    const onWheel = (event: WheelEvent) => {
      const now = performance.now();
      const hasHorizontalIntent =
        Math.abs(event.deltaX) >= 6 &&
        Math.abs(event.deltaX) >= Math.abs(event.deltaY) * wheelDominanceRatio;

      if (wheelNeedsReset) {
        if (now - lastWheelAt > wheelResetIdleMS) {
          wheelNeedsReset = false;
          resetWheelAccumulator();
        } else {
          if (hasHorizontalIntent) {
            lastWheelAt = now;
          }
          return;
        }
      }

      if (Math.abs(event.deltaX) < 6) {
        if (now - lastWheelAt > wheelResetIdleMS) {
          resetWheelAccumulator();
        }
        return;
      }

      if (Math.abs(event.deltaX) < Math.abs(event.deltaY) * wheelDominanceRatio) {
        if (now - lastWheelAt > wheelResetIdleMS) {
          resetWheelAccumulator();
        }
        return;
      }

      const direction: -1 | 1 = event.deltaX < 0 ? -1 : 1;
      if (
        wheelDirection !== 0 &&
        (direction !== wheelDirection || now - lastWheelAt > wheelResetIdleMS)
      ) {
        resetWheelAccumulator();
      }

      wheelDirection = direction;
      lastWheelAt = now;
      wheelAccumulator += event.deltaX;

      if (Math.abs(wheelAccumulator) < wheelDistanceThreshold) {
        return;
      }

      const didNavigate = triggerNavigation(wheelAccumulator < 0 ? -1 : 1);
      resetWheelAccumulator();

      if (didNavigate) {
        wheelNeedsReset = true;
        lastWheelAt = now;
        event.preventDefault();
      }
    };

    viewport.addEventListener("touchstart", onTouchStart, { passive: true });
    viewport.addEventListener("touchmove", onTouchMove, { passive: true });
    viewport.addEventListener("touchend", onTouchEnd, { passive: false });
    viewport.addEventListener("touchcancel", onTouchCancel, { passive: true });
    viewport.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      viewport.removeEventListener("touchstart", onTouchStart);
      viewport.removeEventListener("touchmove", onTouchMove);
      viewport.removeEventListener("touchend", onTouchEnd);
      viewport.removeEventListener("touchcancel", onTouchCancel);
      viewport.removeEventListener("wheel", onWheel);
    };
  }, [back, forward, viewportRef]);
}
