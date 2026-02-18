import { create } from "zustand";
import { ThemePalette } from "../../features/types";
import {
  resolveBackgroundShaderPresetSettings,
  type BackgroundShaderPresetId,
} from "./backgroundShaderPresets";

export type ShaderColor = [number, number, number];
export type ShaderThemeMode = "light" | "dark";
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
  maxRenderDpr: number;
  targetFrameRate: number;
  noiseScale: number;
  flowSpeed: number;
  warpStrength: number;
  detailAmount: number;
  detailScale: number;
  detailSpeed: number;
  colorDrift: number;
  lumaAnchor: number;
  lumaRemapStrength: number;
  lightThemeTintLightness: number;
  lightThemeTintMinChroma: number;
  lightThemeTintMaxChroma: number;
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
  ignStrength: number;
  grainStrength: number;
  grainScale: number;
  colorTransitionSeconds: number;
};

type BackgroundShaderState = {
  themeMode: ShaderThemeMode;
  sourceColors: ShaderColorSet;
  fromColors: ShaderColorSet;
  toColors: ShaderColorSet;
  baseColor: ShaderColor;
  transitionStartedAtMs: number;
  activePresetId: BackgroundShaderPresetId;
  customSettings: BackgroundShaderSettings;
  settings: BackgroundShaderSettings;
  setThemePalette: (palette: ThemePalette | null) => void;
  setThemeMode: (mode: ShaderThemeMode) => void;
  setPreset: (presetId: BackgroundShaderPresetId) => void;
  setSettings: (patch: Partial<BackgroundShaderSettings>) => void;
};

type HueVectorResult = {
  hue: [number, number];
  hasVivid: boolean;
};

const fallbackColors: ShaderColorSet = [
  [0.2, 0.24, 0.3],
  [0.14, 0.17, 0.23],
  [0.1, 0.12, 0.18],
  [0.06, 0.08, 0.12],
  [0.03, 0.05, 0.08],
];

const darkBaseColor: ShaderColor = [10 / 255, 10 / 255, 10 / 255];
const lightBaseColor: ShaderColor = [245 / 255, 245 / 255, 245 / 255];

const defaultSettings: BackgroundShaderSettings = {
  sceneVariant: "stableLayered",
  blurMode: "mipPyramid",
  opacity: 0.15,
  renderScale: 0.2,
  maxRenderDpr: 0.75,
  targetFrameRate: 30,
  noiseScale: 1.1,
  flowSpeed: 0.48,
  warpStrength: 0.22,
  detailAmount: 0.2,
  detailScale: 1,
  detailSpeed: 0.58,
  colorDrift: 0.2,
  lumaAnchor: 0.5,
  lumaRemapStrength: 0.1,
  lightThemeTintLightness: 0.72,
  lightThemeTintMinChroma: 0.18,
  lightThemeTintMaxChroma: 0.35,
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
  ignStrength: 1,
  grainStrength: 0.028,
  grainScale: 1.8,
  colorTransitionSeconds: 1.9,
};

export const useBackgroundShaderStore = create<BackgroundShaderState>(
  (set) => ({
    themeMode: "dark",
    sourceColors: fallbackColors,
    fromColors: fallbackColors,
    toColors: fallbackColors,
    baseColor: darkBaseColor,
    transitionStartedAtMs: nowMs(),
    activePresetId: "stableLayered",
    customSettings: defaultSettings,
    settings: defaultSettings,
    setThemePalette: (palette) => {
      const sourceColors = paletteToColorSet(palette);

      set((state) => {
        const nextColors = mapColorSetForThemeMode(
          sourceColors,
          state.themeMode,
          state.settings,
        );
        if (
          areColorSetsEqual(state.sourceColors, sourceColors) &&
          areColorSetsEqual(state.toColors, nextColors)
        ) {
          return state;
        }

        const now = nowMs();
        const liveColors = getLiveColorSet(state, now);

        return {
          sourceColors,
          fromColors: liveColors,
          toColors: nextColors,
          transitionStartedAtMs: now,
        };
      });
    },
    setThemeMode: (mode) => {
      const nextBaseColor = mode === "light" ? lightBaseColor : darkBaseColor;
      set((state) => {
        const nextSettings =
          state.activePresetId === "custom"
            ? state.customSettings
            : sanitizeSettings(
                resolveBackgroundShaderPresetSettings(
                  state.activePresetId,
                  mode,
                  defaultSettings,
                  state.customSettings,
                ),
              );
        const modeUnchanged = state.themeMode === mode;
        const baseColorUnchanged = areColorsEqual(
          state.baseColor,
          nextBaseColor,
        );
        const nextColors = mapColorSetForThemeMode(
          state.sourceColors,
          mode,
          nextSettings,
        );
        const settingsUnchanged = areSettingsEqual(
          state.settings,
          nextSettings,
        );
        const paletteUnchanged = areColorSetsEqual(state.toColors, nextColors);
        if (
          modeUnchanged &&
          baseColorUnchanged &&
          settingsUnchanged &&
          paletteUnchanged
        ) {
          return state;
        }

        if (paletteUnchanged) {
          return {
            themeMode: mode,
            baseColor: nextBaseColor,
            settings: nextSettings,
          };
        }

        const now = nowMs();
        const liveColors = getLiveColorSet(state, now);

        return {
          themeMode: mode,
          baseColor: nextBaseColor,
          settings: nextSettings,
          fromColors: liveColors,
          toColors: nextColors,
          transitionStartedAtMs: now,
        };
      });
    },
    setPreset: (presetId) => {
      set((state) => {
        const resolvedSettings = sanitizeSettings(
          resolveBackgroundShaderPresetSettings(
            presetId,
            state.themeMode,
            defaultSettings,
            state.customSettings,
          ),
        );
        const nextColors = mapColorSetForThemeMode(
          state.sourceColors,
          state.themeMode,
          resolvedSettings,
        );
        const presetUnchanged = state.activePresetId === presetId;
        const settingsUnchanged = areSettingsEqual(
          state.settings,
          resolvedSettings,
        );
        const colorsUnchanged = areColorSetsEqual(state.toColors, nextColors);

        if (presetUnchanged && settingsUnchanged && colorsUnchanged) {
          return state;
        }

        if (colorsUnchanged) {
          return {
            activePresetId: presetId,
            settings: resolvedSettings,
          };
        }

        const now = nowMs();
        const liveColors = getLiveColorSet(state, now);

        return {
          activePresetId: presetId,
          settings: resolvedSettings,
          fromColors: liveColors,
          toColors: nextColors,
          transitionStartedAtMs: now,
        };
      });
    },
    setSettings: (patch) => {
      set((state) => {
        const nextSettings = sanitizeSettings({ ...state.settings, ...patch });
        const nextColors = mapColorSetForThemeMode(
          state.sourceColors,
          state.themeMode,
          nextSettings,
        );

        const settingsUnchanged = areSettingsEqual(
          state.settings,
          nextSettings,
        );
        const customSettingsUnchanged = areSettingsEqual(
          state.customSettings,
          nextSettings,
        );
        const presetUnchanged = state.activePresetId === "custom";
        const colorsUnchanged = areColorSetsEqual(state.toColors, nextColors);
        if (
          settingsUnchanged &&
          customSettingsUnchanged &&
          presetUnchanged &&
          colorsUnchanged
        ) {
          return state;
        }

        if (colorsUnchanged) {
          return {
            settings: nextSettings,
            customSettings: nextSettings,
            activePresetId: "custom",
          };
        }

        const now = nowMs();
        const liveColors = getLiveColorSet(state, now);
        return {
          settings: nextSettings,
          customSettings: nextSettings,
          activePresetId: "custom",
          fromColors: liveColors,
          toColors: nextColors,
          transitionStartedAtMs: now,
        };
      });
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

function mixColorInOklab(
  a: ShaderColor,
  b: ShaderColor,
  t: number,
): ShaderColor {
  const from = srgbToOklab(a);
  const to = srgbToOklab(b);
  const mixAmount = clamp(t, 0, 1);
  const mixed = oklabToSrgb([
    from[0] + (to[0] - from[0]) * mixAmount,
    from[1] + (to[1] - from[1]) * mixAmount,
    from[2] + (to[2] - from[2]) * mixAmount,
  ]);

  return [clamp(mixed[0], 0, 1), clamp(mixed[1], 0, 1), clamp(mixed[2], 0, 1)];
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

function oklabToSrgb(
  color: [number, number, number],
): [number, number, number] {
  const lPrime = color[0] + 0.3963377774 * color[1] + 0.2158037573 * color[2];
  const mPrime = color[0] - 0.1055613458 * color[1] - 0.0638541728 * color[2];
  const sPrime = color[0] - 0.0894841775 * color[1] - 1.291485548 * color[2];

  const l = lPrime * lPrime * lPrime;
  const m = mPrime * mPrime * mPrime;
  const s = sPrime * sPrime * sPrime;

  const linearR = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const linearG = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const linearB = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

  return [linearToSrgb(linearR), linearToSrgb(linearG), linearToSrgb(linearB)];
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
  const lightThemeTintMinChroma = clamp(
    settings.lightThemeTintMinChroma,
    0,
    0.25,
  );
  const lightThemeTintMaxChroma = clamp(
    settings.lightThemeTintMaxChroma,
    lightThemeTintMinChroma,
    0.35,
  );
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
    maxRenderDpr: clamp(settings.maxRenderDpr, 0.75, 2),
    targetFrameRate: Math.round(clamp(settings.targetFrameRate, 15, 60)),
    noiseScale: clamp(settings.noiseScale, 0.1, 5),
    flowSpeed: clamp(settings.flowSpeed, 0, 5),
    warpStrength: clamp(settings.warpStrength, 0, 1.5),
    detailAmount: clamp(settings.detailAmount, 0, 1),
    detailScale: clamp(settings.detailScale, 0.2, 4),
    detailSpeed: clamp(settings.detailSpeed, 0, 4),
    colorDrift: clamp(settings.colorDrift, 0, 1),
    lumaAnchor: clamp(settings.lumaAnchor, 0, 1),
    lumaRemapStrength: clamp(settings.lumaRemapStrength, 0, 1),
    lightThemeTintLightness: clamp(
      settings.lightThemeTintLightness,
      0.72,
      0.96,
    ),
    lightThemeTintMinChroma,
    lightThemeTintMaxChroma,
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
    ignStrength: clamp(settings.ignStrength, 0, 4),
    grainStrength: clamp(settings.grainStrength, 0, 0.25),
    grainScale: clamp(settings.grainScale, 0.1, 8),
    colorTransitionSeconds: clamp(settings.colorTransitionSeconds, 0, 16),
  };
}

function toUnitColor(value: number): number {
  return clamp(value / 255, 0, 1);
}

function mapColorSetForThemeMode(
  colors: ShaderColorSet,
  mode: ShaderThemeMode,
  settings: BackgroundShaderSettings,
): ShaderColorSet {
  if (mode !== "light") {
    return colors;
  }

  const fallbackHue = dominantVividHueVector(colors);

  return [
    normalizeColorForLightTheme(colors[0], settings, fallbackHue),
    normalizeColorForLightTheme(colors[1], settings, fallbackHue),
    normalizeColorForLightTheme(colors[2], settings, fallbackHue),
    normalizeColorForLightTheme(colors[3], settings, fallbackHue),
    normalizeColorForLightTheme(colors[4], settings, fallbackHue),
  ];
}

function normalizeColorForLightTheme(
  color: ShaderColor,
  settings: BackgroundShaderSettings,
  fallbackHue: HueVectorResult,
): ShaderColor {
  const lab = srgbToOklab(color);
  const sourceChroma = Math.sqrt(lab[1] * lab[1] + lab[2] * lab[2]);
  const neutralThreshold = 0.02;

  const minChroma =
    !fallbackHue.hasVivid && sourceChroma <= neutralThreshold
      ? 0
      : settings.lightThemeTintMinChroma;
  const targetChroma = clamp(
    sourceChroma * 0.9,
    minChroma,
    settings.lightThemeTintMaxChroma,
  );

  const hasStableHue = sourceChroma > neutralThreshold;
  const hueA = hasStableHue ? lab[1] / sourceChroma : fallbackHue.hue[0];
  const hueB = hasStableHue ? lab[2] / sourceChroma : fallbackHue.hue[1];

  return fitOklabColorToSrgb(
    settings.lightThemeTintLightness,
    hueA * targetChroma,
    hueB * targetChroma,
  );
}

function dominantVividHueVector(colors: ShaderColorSet): HueVectorResult {
  const vividThreshold = 0.02;
  let bestA = 1;
  let bestB = 0;
  let bestScore = -1;

  for (let i = 0; i < colors.length; i += 1) {
    const lab = srgbToOklab(colors[i]);
    const chroma = Math.sqrt(lab[1] * lab[1] + lab[2] * lab[2]);
    if (chroma <= vividThreshold) {
      continue;
    }

    if (chroma > bestScore) {
      bestScore = chroma;
      bestA = lab[1] / chroma;
      bestB = lab[2] / chroma;
    }
  }

  return {
    hue: [bestA, bestB],
    hasVivid: bestScore > 0,
  };
}

function areSettingsEqual(
  a: BackgroundShaderSettings,
  b: BackgroundShaderSettings,
): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function fitOklabColorToSrgb(
  lightness: number,
  a: number,
  b: number,
): ShaderColor {
  const initial = oklabToSrgb([lightness, a, b]);
  if (isInSrgbGamut(initial)) {
    return [
      clamp(initial[0], 0, 1),
      clamp(initial[1], 0, 1),
      clamp(initial[2], 0, 1),
    ];
  }

  let low = 0;
  let high = 1;
  let best = [lightness, 0, 0] as [number, number, number];

  for (let i = 0; i < 14; i += 1) {
    const scale = (low + high) * 0.5;
    const candidateLab: [number, number, number] = [
      lightness,
      a * scale,
      b * scale,
    ];
    const candidateRgb = oklabToSrgb(candidateLab);
    if (isInSrgbGamut(candidateRgb)) {
      low = scale;
      best = candidateRgb;
      continue;
    }
    high = scale;
  }

  return [clamp(best[0], 0, 1), clamp(best[1], 0, 1), clamp(best[2], 0, 1)];
}

function isInSrgbGamut(color: [number, number, number]): boolean {
  return (
    color[0] >= 0 &&
    color[0] <= 1 &&
    color[1] >= 0 &&
    color[1] <= 1 &&
    color[2] >= 0 &&
    color[2] <= 1
  );
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
