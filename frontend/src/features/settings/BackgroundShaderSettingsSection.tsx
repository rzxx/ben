import { useMemo } from "react";
import {
  backgroundShaderPresetOptions,
  isBackgroundShaderPresetId,
} from "../../shared/store/backgroundShaderPresets";
import { useBackgroundShaderStore } from "../../shared/store/backgroundShaderStore";

export function BackgroundShaderSettingsSection() {
  const shaderSettings = useBackgroundShaderStore((state) => state.settings);
  const activePresetId = useBackgroundShaderStore(
    (state) => state.activePresetId,
  );
  const setShaderSettings = useBackgroundShaderStore(
    (state) => state.setSettings,
  );
  const setShaderPreset = useBackgroundShaderStore((state) => state.setPreset);

  const selectedPreset = useMemo(
    () =>
      backgroundShaderPresetOptions.find(
        (preset) => preset.id === activePresetId,
      ) ?? backgroundShaderPresetOptions[0],
    [activePresetId],
  );

  return (
    <section className="border-theme-300 bg-theme-50/80 dark:border-theme-800 dark:bg-theme-900/70 rounded-xl border p-4">
      <h2 className="text-theme-900 dark:text-theme-100 text-sm font-semibold">
        Background Shader
      </h2>
      <p className="text-theme-600 dark:text-theme-400 mt-1 text-sm">
        Gradient background controls
      </p>

      <div className="text-theme-700 dark:text-theme-300 mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <SelectSetting
          label="Preset"
          value={activePresetId}
          options={backgroundShaderPresetOptions.map((preset) => ({
            value: preset.id,
            label: preset.label,
          }))}
          onChange={(next) => {
            if (!isBackgroundShaderPresetId(next)) {
              return;
            }
            setShaderPreset(next);
          }}
        />
      </div>

      <p className="text-theme-600 dark:text-theme-400 mt-2 text-xs">
        {selectedPreset.description}
      </p>

      {activePresetId === "custom" ? (
        <div className="text-theme-700 dark:text-theme-300 mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <SelectSetting
            label="Scene Module"
            value={shaderSettings.sceneVariant}
            options={[
              { value: "stableLayered", label: "Stable Layered" },
              { value: "legacyFeedback", label: "Legacy Feedback" },
            ]}
            onChange={(next) => {
              if (!isSceneVariant(next)) {
                return;
              }
              setShaderSettings({ sceneVariant: next });
            }}
          />
          <SelectSetting
            label="Blur Module"
            value={shaderSettings.blurMode}
            options={[
              { value: "mipPyramid", label: "Mip Pyramid" },
              { value: "dualKawase", label: "Dual Kawase" },
              { value: "none", label: "None" },
            ]}
            onChange={(next) => {
              if (!isBlurMode(next)) {
                return;
              }
              setShaderSettings({ blurMode: next });
            }}
          />
          <ToggleSetting
            label="Temporal Accumulation"
            checked={shaderSettings.temporalEnabled}
            onChange={(checked) =>
              setShaderSettings({ temporalEnabled: checked })
            }
          />
          <NumericSetting
            label="Effect Opacity"
            value={shaderSettings.opacity}
            min={0}
            max={1}
            step={0.01}
            onChange={(next) => setShaderSettings({ opacity: next })}
          />
          <NumericSetting
            label="Transition (sec)"
            value={shaderSettings.colorTransitionSeconds}
            min={0}
            max={16}
            step={0.1}
            onChange={(next) =>
              setShaderSettings({ colorTransitionSeconds: next })
            }
          />
          <NumericSetting
            label="Render Scale"
            value={shaderSettings.renderScale}
            min={0.2}
            max={1}
            step={0.01}
            onChange={(next) => setShaderSettings({ renderScale: next })}
          />
          <NumericSetting
            label="Max Render DPR"
            value={shaderSettings.maxRenderDpr}
            min={0.75}
            max={2}
            step={0.05}
            onChange={(next) => setShaderSettings({ maxRenderDpr: next })}
          />
          <NumericSetting
            label="Target FPS"
            value={shaderSettings.targetFrameRate}
            min={15}
            max={60}
            step={1}
            onChange={(next) => setShaderSettings({ targetFrameRate: next })}
          />
          <NumericSetting
            label="Noise Scale"
            value={shaderSettings.noiseScale}
            min={0.1}
            max={5}
            step={0.01}
            onChange={(next) => setShaderSettings({ noiseScale: next })}
          />
          <NumericSetting
            label="Flow Speed"
            value={shaderSettings.flowSpeed}
            min={0}
            max={5}
            step={0.01}
            onChange={(next) => setShaderSettings({ flowSpeed: next })}
          />
          <NumericSetting
            label="Warp Strength"
            value={shaderSettings.warpStrength}
            min={0}
            max={1.5}
            step={0.01}
            onChange={(next) => setShaderSettings({ warpStrength: next })}
          />
          <NumericSetting
            label="Detail Amount"
            value={shaderSettings.detailAmount}
            min={0}
            max={1}
            step={0.01}
            onChange={(next) => setShaderSettings({ detailAmount: next })}
          />
          <NumericSetting
            label="Detail Scale"
            value={shaderSettings.detailScale}
            min={0.2}
            max={4}
            step={0.01}
            onChange={(next) => setShaderSettings({ detailScale: next })}
          />
          <NumericSetting
            label="Detail Speed"
            value={shaderSettings.detailSpeed}
            min={0}
            max={4}
            step={0.01}
            onChange={(next) => setShaderSettings({ detailSpeed: next })}
          />
          <NumericSetting
            label="Color Drift"
            value={shaderSettings.colorDrift}
            min={0}
            max={1}
            step={0.01}
            onChange={(next) => setShaderSettings({ colorDrift: next })}
          />
          <NumericSetting
            label="Luma Anchor"
            value={shaderSettings.lumaAnchor}
            min={0}
            max={1}
            step={0.01}
            onChange={(next) => setShaderSettings({ lumaAnchor: next })}
          />
          <NumericSetting
            label="Luma Remap Strength"
            value={shaderSettings.lumaRemapStrength}
            min={0}
            max={1}
            step={0.01}
            onChange={(next) => setShaderSettings({ lumaRemapStrength: next })}
          />
          <NumericSetting
            label="Light Tint Lightness"
            value={shaderSettings.lightThemeTintLightness}
            min={0.72}
            max={0.96}
            step={0.005}
            onChange={(next) =>
              setShaderSettings({ lightThemeTintLightness: next })
            }
          />
          <NumericSetting
            label="Light Tint Min Chroma"
            value={shaderSettings.lightThemeTintMinChroma}
            min={0}
            max={0.25}
            step={0.005}
            onChange={(next) =>
              setShaderSettings({ lightThemeTintMinChroma: next })
            }
          />
          <NumericSetting
            label="Light Tint Max Chroma"
            value={shaderSettings.lightThemeTintMaxChroma}
            min={0}
            max={0.35}
            step={0.005}
            onChange={(next) =>
              setShaderSettings({ lightThemeTintMaxChroma: next })
            }
          />
          <NumericSetting
            label="Blur Radius"
            value={shaderSettings.blurRadius}
            min={0}
            max={8}
            step={0.05}
            onChange={(next) => setShaderSettings({ blurRadius: next })}
          />
          {shaderSettings.blurMode === "mipPyramid" ? (
            <>
              <NumericSetting
                label="Mip Levels"
                value={shaderSettings.mipLevels}
                min={1}
                max={5}
                step={1}
                onChange={(next) => setShaderSettings({ mipLevels: next })}
              />
              <NumericSetting
                label="Mip Curve"
                value={shaderSettings.mipCurve}
                min={0.2}
                max={3}
                step={0.05}
                onChange={(next) => setShaderSettings({ mipCurve: next })}
              />
            </>
          ) : null}
          {shaderSettings.blurMode === "dualKawase" ? (
            <>
              <NumericSetting
                label="Blur Radius Step"
                value={shaderSettings.blurRadiusStep}
                min={0}
                max={3}
                step={0.05}
                onChange={(next) => setShaderSettings({ blurRadiusStep: next })}
              />
              <NumericSetting
                label="Blur Passes"
                value={shaderSettings.blurPasses}
                min={0}
                max={8}
                step={1}
                onChange={(next) => setShaderSettings({ blurPasses: next })}
              />
              <NumericSetting
                label="Blur Downsample"
                value={shaderSettings.blurDownsample}
                min={1.1}
                max={4}
                step={0.1}
                onChange={(next) => setShaderSettings({ blurDownsample: next })}
              />
            </>
          ) : null}
          {shaderSettings.temporalEnabled ? (
            <>
              <NumericSetting
                label="Temporal Strength"
                value={shaderSettings.temporalStrength}
                min={0}
                max={0.98}
                step={0.01}
                onChange={(next) =>
                  setShaderSettings({ temporalStrength: next })
                }
              />
              <NumericSetting
                label="Temporal Response"
                value={shaderSettings.temporalResponse}
                min={0.01}
                max={1.5}
                step={0.01}
                onChange={(next) =>
                  setShaderSettings({ temporalResponse: next })
                }
              />
              <NumericSetting
                label="Temporal Clamp"
                value={shaderSettings.temporalClamp}
                min={0.01}
                max={1}
                step={0.01}
                onChange={(next) => setShaderSettings({ temporalClamp: next })}
              />
              <NumericSetting
                label="Deband Dark Start"
                value={shaderSettings.debandDarkStart}
                min={0.06}
                max={0.6}
                step={0.01}
                onChange={(next) =>
                  setShaderSettings({ debandDarkStart: next })
                }
              />
              <NumericSetting
                label="Deband Dark End"
                value={shaderSettings.debandDarkEnd}
                min={0}
                max={0.6}
                step={0.01}
                onChange={(next) => setShaderSettings({ debandDarkEnd: next })}
              />
              <NumericSetting
                label="Deband Min LSB"
                value={shaderSettings.debandMinLsb}
                min={0}
                max={3}
                step={0.01}
                onChange={(next) => setShaderSettings({ debandMinLsb: next })}
              />
              <NumericSetting
                label="Deband Max LSB"
                value={shaderSettings.debandMaxLsb}
                min={0}
                max={4}
                step={0.01}
                onChange={(next) => setShaderSettings({ debandMaxLsb: next })}
              />
              <NumericSetting
                label="Deband TA Preserve"
                value={shaderSettings.debandTaPreserve}
                min={0}
                max={1}
                step={0.01}
                onChange={(next) =>
                  setShaderSettings({ debandTaPreserve: next })
                }
              />
              <NumericSetting
                label="Deband Clamp Boost"
                value={shaderSettings.debandClampBoost}
                min={0}
                max={4}
                step={0.05}
                onChange={(next) =>
                  setShaderSettings({ debandClampBoost: next })
                }
              />
            </>
          ) : null}
          <NumericSetting
            label="Grain Strength"
            value={shaderSettings.grainStrength}
            min={0}
            max={0.25}
            step={0.001}
            onChange={(next) => setShaderSettings({ grainStrength: next })}
          />
          <NumericSetting
            label="Grain Scale"
            value={shaderSettings.grainScale}
            min={0.1}
            max={8}
            step={0.01}
            onChange={(next) => setShaderSettings({ grainScale: next })}
          />
        </div>
      ) : (
        <p className="text-theme-600 dark:text-theme-400 mt-3 text-sm">
          Switch to Custom to edit individual shader parameters.
        </p>
      )}
    </section>
  );
}

type NumericSettingProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (next: number) => void;
};

type SelectOption = {
  value: string;
  label: string;
};

type SelectSettingProps = {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (next: string) => void;
};

type ToggleSettingProps = {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
};

function SelectSetting(props: SelectSettingProps) {
  return (
    <label className="border-theme-300 bg-theme-100 dark:border-theme-800 dark:bg-theme-900 rounded-md border px-2 py-2">
      <p className="text-theme-600 dark:text-theme-500 text-xs tracking-wide uppercase">
        {props.label}
      </p>
      <select
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        className="border-theme-300 bg-theme-50 text-theme-800 focus:border-theme-500 dark:border-theme-700 dark:bg-theme-950 dark:text-theme-200 dark:focus:border-theme-500 mt-1 w-full rounded border px-2 py-1 text-sm outline-none"
      >
        {props.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ToggleSetting(props: ToggleSettingProps) {
  return (
    <label className="border-theme-300 bg-theme-100 text-theme-800 dark:border-theme-800 dark:bg-theme-900 dark:text-theme-200 flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
      <span className="text-theme-600 dark:text-theme-400 text-xs tracking-wide uppercase">
        {props.label}
      </span>
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(event) => props.onChange(event.target.checked)}
      />
    </label>
  );
}

function NumericSetting(props: NumericSettingProps) {
  return (
    <label className="border-theme-300 bg-theme-100 dark:border-theme-800 dark:bg-theme-900 rounded-md border px-2 py-2">
      <p className="text-theme-600 dark:text-theme-500 text-xs tracking-wide uppercase">
        {props.label}
      </p>
      <input
        type="number"
        value={props.value}
        min={props.min}
        max={props.max}
        step={props.step}
        onChange={(event) => {
          const parsed = Number(event.target.value);
          if (!Number.isFinite(parsed)) {
            return;
          }
          props.onChange(parsed);
        }}
        className="border-theme-300 bg-theme-50 text-theme-800 focus:border-theme-500 dark:border-theme-700 dark:bg-theme-950 dark:text-theme-200 dark:focus:border-theme-500 mt-1 w-full rounded border px-2 py-1 text-sm outline-none"
      />
    </label>
  );
}

function isSceneVariant(
  value: string,
): value is "stableLayered" | "legacyFeedback" {
  return value === "stableLayered" || value === "legacyFeedback";
}

function isBlurMode(
  value: string,
): value is "mipPyramid" | "dualKawase" | "none" {
  return value === "mipPyramid" || value === "dualKawase" || value === "none";
}
