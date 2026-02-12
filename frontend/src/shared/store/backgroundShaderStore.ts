import { create } from "zustand";
import { ThemePalette } from "../../features/types";

export type ShaderColor = [number, number, number];
export type ShaderColorSet = [
  ShaderColor,
  ShaderColor,
  ShaderColor,
  ShaderColor,
  ShaderColor,
];

export type BackgroundShaderSettings = {
  opacity: number;
  renderScale: number;
  noiseScale: number;
  flowSpeed: number;
  warpStrength: number;
  blurRadius: number;
  blurRadiusStep: number;
  blurPasses: number;
  blurDownsample: number;
  grainStrength: number;
  grainScale: number;
  colorTransitionSeconds: number;
};

type BackgroundShaderState = {
  fromColors: ShaderColorSet;
  toColors: ShaderColorSet;
  transitionStartedAtMs: number;
  settings: BackgroundShaderSettings;
  setThemePalette: (palette: ThemePalette | null) => void;
  setSettings: (patch: Partial<BackgroundShaderSettings>) => void;
};

const fallbackColors: ShaderColorSet = [
  [0.2, 0.24, 0.3],
  [0.14, 0.17, 0.23],
  [0.1, 0.12, 0.18],
  [0.06, 0.08, 0.12],
  [0.03, 0.05, 0.08],
];

const defaultSettings: BackgroundShaderSettings = {
  opacity: 0.78,
  renderScale: 0.5,
  noiseScale: 1.3,
  flowSpeed: 0.62,
  warpStrength: 0.26,
  blurRadius: 1.2,
  blurRadiusStep: 0.75,
  blurPasses: 4,
  blurDownsample: 2,
  grainStrength: 0.028,
  grainScale: 1.8,
  colorTransitionSeconds: 1.9,
};

export const useBackgroundShaderStore = create<BackgroundShaderState>(
  (set) => ({
    fromColors: fallbackColors,
    toColors: fallbackColors,
    transitionStartedAtMs: nowMs(),
    settings: defaultSettings,
    setThemePalette: (palette) => {
      const nextColors = paletteToColorSet(palette);

      set((state) => {
        if (areColorSetsEqual(state.toColors, nextColors)) {
          return state;
        }

        const now = nowMs();
        const liveColors = getLiveColorSet(state, now);

        return {
          fromColors: liveColors,
          toColors: nextColors,
          transitionStartedAtMs: now,
        };
      });
    },
    setSettings: (patch) => {
      set((state) => ({
        settings: sanitizeSettings({ ...state.settings, ...patch }),
      }));
    },
  }),
);

function paletteToColorSet(palette: ThemePalette | null): ShaderColorSet {
  const colors = (palette?.gradient ?? [])
    .map((color) => [
      toUnitColor(color.r),
      toUnitColor(color.g),
      toUnitColor(color.b),
    ])
    .slice(0, 5) as ShaderColor[];

  if (colors.length === 0) {
    return fallbackColors;
  }

  const first = colors[0];
  const second = colors[1] ?? first;
  const third = colors[2] ?? second;
  const fourth = colors[3] ?? third;
  const fifth = colors[4] ?? fourth;

  return [first, second, third, fourth, fifth];
}

function getLiveColorSet(
  state: BackgroundShaderState,
  now: number,
): ShaderColorSet {
  const durationMs = state.settings.colorTransitionSeconds * 1000;
  if (durationMs <= 0) {
    return state.toColors;
  }

  const rawMix = (now - state.transitionStartedAtMs) / durationMs;
  const mixAmount = clamp(rawMix, 0, 1);

  if (mixAmount >= 1) {
    return state.toColors;
  }

  return [
    mixColor(state.fromColors[0], state.toColors[0], mixAmount),
    mixColor(state.fromColors[1], state.toColors[1], mixAmount),
    mixColor(state.fromColors[2], state.toColors[2], mixAmount),
    mixColor(state.fromColors[3], state.toColors[3], mixAmount),
    mixColor(state.fromColors[4], state.toColors[4], mixAmount),
  ];
}

function mixColor(a: ShaderColor, b: ShaderColor, t: number): ShaderColor {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

function sanitizeSettings(
  settings: BackgroundShaderSettings,
): BackgroundShaderSettings {
  return {
    opacity: clamp(settings.opacity, 0, 1),
    renderScale: clamp(settings.renderScale, 0.2, 1),
    noiseScale: clamp(settings.noiseScale, 0.1, 5),
    flowSpeed: clamp(settings.flowSpeed, 0, 5),
    warpStrength: clamp(settings.warpStrength, 0, 1.5),
    blurRadius: clamp(settings.blurRadius, 0, 8),
    blurRadiusStep: clamp(settings.blurRadiusStep, 0, 3),
    blurPasses: Math.round(clamp(settings.blurPasses, 0, 8)),
    blurDownsample: clamp(settings.blurDownsample, 1.1, 4),
    grainStrength: clamp(settings.grainStrength, 0, 0.25),
    grainScale: clamp(settings.grainScale, 0.1, 8),
    colorTransitionSeconds: clamp(settings.colorTransitionSeconds, 0, 16),
  };
}

function toUnitColor(value: number): number {
  return clamp(value / 255, 0, 1);
}

function areColorSetsEqual(a: ShaderColorSet, b: ShaderColorSet): boolean {
  for (let i = 0; i < 5; i += 1) {
    if (!areColorsEqual(a[i], b[i])) {
      return false;
    }
  }

  return true;
}

function areColorsEqual(a: ShaderColor, b: ShaderColor): boolean {
  const epsilon = 0.0005;
  return (
    Math.abs(a[0] - b[0]) <= epsilon &&
    Math.abs(a[1] - b[1]) <= epsilon &&
    Math.abs(a[2] - b[2]) <= epsilon
  );
}

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
