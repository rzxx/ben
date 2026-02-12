import { type ReactNode, useCallback, useState } from "react";
import { Window } from "@wailsio/runtime";
import { Copy, Minus, Square, X } from "lucide-react";

export function TitleBar() {
  const [isMaximised, setIsMaximised] = useState(false);

  const syncWindowState = useCallback(async () => {
    const maximised = await Window.IsMaximised();
    setIsMaximised(maximised);
  }, []);

  const onToggleMaximise = useCallback(async () => {
    const maximised = await Window.IsMaximised();
    if (maximised) {
      await Window.Restore();
      setIsMaximised(false);
      return;
    }

    await Window.Maximise();
    setIsMaximised(true);
  }, []);

  return (
    <header
      onMouseEnter={() => void syncWindowState()}
      className="wails-drag relative z-30 flex h-8 shrink-0 items-center justify-between border-b border-white/3 text-neutral-100"
    >
      <div className="pl-4 text-neutral-100">
        <p className="text-sm font-medium tracking-wide text-neutral-200">
          ben
        </p>
      </div>

      <div className="wails-no-drag flex h-full items-center gap-px">
        <ControlButton
          label="Minimise"
          onClick={() => {
            void Window.Minimise();
          }}
        >
          <Minus size={14} />
        </ControlButton>

        <ControlButton
          label={isMaximised ? "Restore" : "Maximise"}
          onClick={() => void onToggleMaximise()}
        >
          {isMaximised ? (
            <Copy size={12} />
          ) : (
            <Square size={12} strokeWidth={1.5} />
          )}
        </ControlButton>

        <ControlButton
          label="Close"
          danger
          onClick={() => {
            void Window.Close();
          }}
        >
          <X size={16} strokeWidth={2.5} />
        </ControlButton>
      </div>
    </header>
  );
}

type ControlButtonProps = {
  label: string;
  danger?: boolean;
  onClick: () => void;
  children: ReactNode;
};

function ControlButton(props: ControlButtonProps) {
  return (
    <button
      type="button"
      aria-label={props.label}
      title={props.label}
      onClick={props.onClick}
      className={`inline-flex h-full w-12 items-center justify-center transition-colors ${
        props.danger
          ? "text-neutral-400 hover:bg-red-600 hover:text-white"
          : "text-neutral-300 hover:bg-neutral-600 hover:text-neutral-100"
      }`}
    >
      {props.children}
    </button>
  );
}
