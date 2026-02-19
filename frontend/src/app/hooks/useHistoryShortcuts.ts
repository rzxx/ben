import { useEffect } from "react";

type HistoryShortcutsOptions = {
  back: () => void;
  forward: () => void;
};

export function useHistoryShortcuts(options: HistoryShortcutsOptions) {
  const { back, forward } = options;

  useEffect(() => {
    const onMouseUp = (event: MouseEvent) => {
      if (event.button === 3) {
        event.preventDefault();
        back();
        return;
      }

      if (event.button === 4) {
        event.preventDefault();
        forward();
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }

      if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
        return;
      }

      if (isEditableTarget(event.target)) {
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        back();
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        forward();
      }
    };

    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [back, forward]);
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.isContentEditable) {
    return true;
  }

  const tagName = target.tagName;
  return tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT";
}
