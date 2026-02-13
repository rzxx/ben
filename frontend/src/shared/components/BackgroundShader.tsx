import { useEffect, useMemo, useRef, useState } from "react";
import { useBackgroundShaderStore } from "../store/backgroundShaderStore";
import {
  buildFallbackStyle,
  buildGrainStyle,
  createNoiseTextureDataURL,
} from "./backgroundShaderStyles";
import { createBackgroundShaderRenderer } from "./backgroundShaderRenderer";

export function BackgroundShader() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const webgl2Available =
    typeof window !== "undefined" &&
    typeof WebGL2RenderingContext !== "undefined";

  const [isUnsupported, setIsUnsupported] = useState(!webgl2Available);
  const [diagnosticMessage, setDiagnosticMessage] = useState<string | null>(
    null,
  );

  const fromColors = useBackgroundShaderStore((state) => state.fromColors);
  const toColors = useBackgroundShaderStore((state) => state.toColors);
  const transitionStartedAtMs = useBackgroundShaderStore(
    (state) => state.transitionStartedAtMs,
  );
  const settings = useBackgroundShaderStore((state) => state.settings);
  const grainTextureUrl = useMemo(() => createNoiseTextureDataURL(256), []);

  const fromColorsRef = useRef(fromColors);
  const toColorsRef = useRef(toColors);
  const transitionStartedAtMsRef = useRef(transitionStartedAtMs);
  const settingsRef = useRef(settings);

  useEffect(() => {
    fromColorsRef.current = fromColors;
  }, [fromColors]);

  useEffect(() => {
    toColorsRef.current = toColors;
  }, [toColors]);

  useEffect(() => {
    transitionStartedAtMsRef.current = transitionStartedAtMs;
  }, [transitionStartedAtMs]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !webgl2Available) {
      return;
    }

    const renderer = createBackgroundShaderRenderer({
      canvas,
      webgl2Available,
      getFromColors: () => fromColorsRef.current,
      getToColors: () => toColorsRef.current,
      getTransitionStartedAtMs: () => transitionStartedAtMsRef.current,
      getSettings: () => settingsRef.current,
      onUnsupportedChange: setIsUnsupported,
      onDiagnostics: (message) => {
        setDiagnosticMessage(message);
        console.error(`[BackgroundShader] ${message}`);
      },
    });

    return () => {
      renderer.dispose();
    };
  }, [webgl2Available]);

  const fallbackStyle = useMemo(
    () => buildFallbackStyle(toColors, settings.opacity),
    [settings.opacity, toColors],
  );
  const grainStyle = useMemo(
    () => buildGrainStyle(settings, grainTextureUrl),
    [grainTextureUrl, settings],
  );

  return (
    <div
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
      aria-hidden="true"
      data-shader-diagnostic={diagnosticMessage ?? undefined}
    >
      <div className="absolute inset-0" style={fallbackStyle} />
      <canvas
        ref={canvasRef}
        className={isUnsupported ? "hidden" : "absolute inset-0 h-full w-full"}
      />
      {import.meta.env.DEV && diagnosticMessage ? (
        <div className="absolute right-2 bottom-2 max-w-[24rem] rounded border border-red-900/70 bg-red-950/75 px-2 py-1 text-[10px] leading-snug text-red-100">
          {diagnosticMessage}
        </div>
      ) : null}
      <div className="absolute inset-0" style={grainStyle} />
    </div>
  );
}
