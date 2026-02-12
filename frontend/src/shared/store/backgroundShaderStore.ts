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

export type ShaderSceneVariant = "stableLayered" | "legacyFeedback";
export type ShaderBlurMode = "mipPyramid" | "dualKawase" | "none";

export type BackgroundShaderSettings = {
  sceneVariant: ShaderSceneVariant;
  blurMode: ShaderBlurMode;
  opacity: number;
  renderScale: number;
  noiseScale: number;
  flowSpeed: number;
  warpStrength: number;
  detailAmount: number;
  detailScale: number;
  detailSpeed: number;
  colorDrift: number;
  lumaAnchor: number;
  blurRadius: number;
  blurRadiusStep: number;
  blurPasses: number;
  blurDownsample: number;
  mipLevels: number;
  mipCurve: number;
  temporalEnabled: boolean;
  temporalStrength: number;
  temporalResponse: number;
  temporalClamp: number;
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
  sceneVariant: "stableLayered",
  blurMode: "mipPyramid",
  opacity: 0.78,
  renderScale: 0.5,
  noiseScale: 1.1,
  flowSpeed: 0.48,
  warpStrength: 0.22,
  detailAmount: 0.2,
  detailScale: 1,
  detailSpeed: 0.58,
  colorDrift: 0.2,
  lumaAnchor: 0.45,
  blurRadius: 1.2,
  blurRadiusStep: 0.75,
  blurPasses: 4,
  blurDownsample: 2,
  mipLevels: 4,
  mipCurve: 1.2,
  temporalEnabled: true,
  temporalStrength: 0.78,
  temporalResponse: 0.2,
  temporalClamp: 0.16,
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
    mixColorInOklab(state.fromColors[0], state.toColors[0], mixAmount),
    mixColorInOklab(state.fromColors[1], state.toColors[1], mixAmount),
    mixColorInOklab(state.fromColors[2], state.toColors[2], mixAmount),
    mixColorInOklab(state.fromColors[3], state.toColors[3], mixAmount),
    mixColorInOklab(state.fromColors[4], state.toColors[4], mixAmount),
  ];
}

function mixColorInOklab(a: ShaderColor, b: ShaderColor, t: number): ShaderColor {
  const from = srgbToOklab(a);
  const to = srgbToOklab(b);
  const mixAmount = clamp(t, 0, 1);
  const mixed = oklabToSrgb([
    from[0] + (to[0] - from[0]) * mixAmount,
    from[1] + (to[1] - from[1]) * mixAmount,
    from[2] + (to[2] - from[2]) * mixAmount,
  ]);

  return [
    clamp(mixed[0], 0, 1),
    clamp(mixed[1], 0, 1),
    clamp(mixed[2], 0, 1),
  ];
}

function srgbToOklab(color: ShaderColor): [number, number, number] {
  const linearR = srgbToLinear(color[0]);
  const linearG = srgbToLinear(color[1]);
  const linearB = srgbToLinear(color[2]);

  const l =
    0.4122214708 * linearR + 0.5363325363 * linearG + 0.0514459929 * linearB;
  const m =
    0.2119034982 * linearR + 0.6806995451 * linearG + 0.1073969566 * linearB;
  const s =
    0.0883024619 * linearR + 0.2817188376 * linearG + 0.6299787005 * linearB;

  const lRoot = Math.cbrt(Math.max(0, l));
  const mRoot = Math.cbrt(Math.max(0, m));
  const sRoot = Math.cbrt(Math.max(0, s));

  return [
    0.2104542553 * lRoot + 0.793617785 * mRoot - 0.0040720468 * sRoot,
    1.9779984951 * lRoot - 2.428592205 * mRoot + 0.4505937099 * sRoot,
    0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.808675766 * sRoot,
  ];
}

function oklabToSrgb(color: [number, number, number]): [number, number, number] {
  const lPrime = color[0] + 0.3963377774 * color[1] + 0.2158037573 * color[2];
  const mPrime = color[0] - 0.1055613458 * color[1] - 0.0638541728 * color[2];
  const sPrime = color[0] - 0.0894841775 * color[1] - 1.291485548 * color[2];

  const l = lPrime * lPrime * lPrime;
  const m = mPrime * mPrime * mPrime;
  const s = sPrime * sPrime * sPrime;

  const linearR = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const linearG = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const linearB = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

  return [
    linearToSrgb(linearR),
    linearToSrgb(linearG),
    linearToSrgb(linearB),
  ];
}

function srgbToLinear(value: number): number {
  const safe = clamp(value, 0, 1);
  if (safe <= 0.04045) {
    return safe / 12.92;
  }
  return Math.pow((safe + 0.055) / 1.055, 2.4);
}

function linearToSrgb(value: number): number {
  const safe = Math.max(0, value);
  if (safe <= 0.0031308) {
    return safe * 12.92;
  }
  return 1.055 * Math.pow(safe, 1 / 2.4) - 0.055;
}

function sanitizeSettings(
  settings: BackgroundShaderSettings,
): BackgroundShaderSettings {
  return {
    sceneVariant:
      settings.sceneVariant === "legacyFeedback"
        ? "legacyFeedback"
        : "stableLayered",
    blurMode:
      settings.blurMode === "dualKawase"
        ? "dualKawase"
        : settings.blurMode === "none"
          ? "none"
          : "mipPyramid",
    opacity: clamp(settings.opacity, 0, 1),
    renderScale: clamp(settings.renderScale, 0.2, 1),
    noiseScale: clamp(settings.noiseScale, 0.1, 5),
    flowSpeed: clamp(settings.flowSpeed, 0, 5),
    warpStrength: clamp(settings.warpStrength, 0, 1.5),
    detailAmount: clamp(settings.detailAmount, 0, 1),
    detailScale: clamp(settings.detailScale, 0.2, 4),
    detailSpeed: clamp(settings.detailSpeed, 0, 4),
    colorDrift: clamp(settings.colorDrift, 0, 1),
    lumaAnchor: clamp(settings.lumaAnchor, 0, 1),
    blurRadius: clamp(settings.blurRadius, 0, 8),
    blurRadiusStep: clamp(settings.blurRadiusStep, 0, 3),
    blurPasses: Math.round(clamp(settings.blurPasses, 0, 8)),
    blurDownsample: clamp(settings.blurDownsample, 1.1, 4),
    mipLevels: Math.round(clamp(settings.mipLevels, 1, 5)),
    mipCurve: clamp(settings.mipCurve, 0.2, 3),
    temporalEnabled: Boolean(settings.temporalEnabled),
    temporalStrength: clamp(settings.temporalStrength, 0, 0.98),
    temporalResponse: clamp(settings.temporalResponse, 0.01, 1.5),
    temporalClamp: clamp(settings.temporalClamp, 0.01, 1),
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
