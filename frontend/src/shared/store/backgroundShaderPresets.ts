import type {
  BackgroundShaderSettings,
  ShaderThemeMode,
} from "./backgroundShaderStore";

export type BuiltInBackgroundShaderPresetId =
  | "stableLayered"
  | "legacyFeedback"
  | "legacyFeedback_detail";

export type BackgroundShaderPresetId =
  | BuiltInBackgroundShaderPresetId
  | "custom";

type BackgroundShaderPresetDefinition = {
  id: BuiltInBackgroundShaderPresetId;
  label: string;
  description: string;
  common?: Partial<BackgroundShaderSettings>;
  dark?: Partial<BackgroundShaderSettings>;
  light?: Partial<BackgroundShaderSettings>;
};

const builtInPresets: readonly BackgroundShaderPresetDefinition[] = [
  {
    id: "stableLayered",
    label: "Stable Layered",
    description: "Uses the stable layered scene module.",
    common: {
      sceneVariant: "stableLayered",
      lumaAnchor: 0,
    },
    light: {
      lumaRemapStrength: 0,
    },
    dark: {},
  },
  {
    id: "legacyFeedback",
    label: "Legacy Feedback",
    description: "Uses the legacy feedback scene module.",
    common: {
      sceneVariant: "legacyFeedback",
      flowSpeed: 0.1,
      warpStrength: 0.1,
      mipCurve: 0.2,
      blurRadius: 4,
      mipLevels: 3,
    },
    dark: {
      opacity: 0.2,
    },
    light: {
      opacity: 0.15,
    },
  },
  {
    id: "legacyFeedback_detail",
    label: "Legacy Feedback (Detail)",
    description:
      "Uses the legacy feedback scene module with less blurred look.",
    common: {
      sceneVariant: "legacyFeedback",
      flowSpeed: 0.1,
      warpStrength: 0.1,
      mipLevels: 2,
      mipCurve: 1,
      blurRadius: 1.5,
    },
    dark: {
      opacity: 0.2,
    },
    light: {
      opacity: 0.15,
    },
  },
];

export const backgroundShaderPresetOptions: readonly {
  id: BackgroundShaderPresetId;
  label: string;
  description: string;
}[] = [
  ...builtInPresets,
  {
    id: "custom",
    label: "Custom",
    description: "Shows all shader parameters for manual tuning.",
  },
];

export function isBackgroundShaderPresetId(
  value: string,
): value is BackgroundShaderPresetId {
  return (
    value === "stableLayered" ||
    value === "legacyFeedback" ||
    value === "legacyFeedback_detail" ||
    value === "custom"
  );
}

export function resolveBackgroundShaderPresetSettings(
  presetId: BackgroundShaderPresetId,
  themeMode: ShaderThemeMode,
  defaults: BackgroundShaderSettings,
  customSettings: BackgroundShaderSettings,
): BackgroundShaderSettings {
  if (presetId === "custom") {
    return customSettings;
  }

  const preset = builtInPresets.find((entry) => entry.id === presetId);
  if (!preset) {
    return defaults;
  }

  const modeSettings = themeMode === "light" ? preset.light : preset.dark;
  return {
    ...defaults,
    ...preset.common,
    ...modeSettings,
  };
}
