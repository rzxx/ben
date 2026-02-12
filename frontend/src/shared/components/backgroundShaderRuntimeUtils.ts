import { BackgroundShaderSettings } from "../store/backgroundShaderStore";
import {
  BlurModule,
  RenderTarget,
  TargetConfig,
} from "./backgroundShaderRuntimeTypes";

export function createRenderTarget(
  device: GPUDevice,
  width: number,
  height: number,
  format: GPUTextureFormat,
): RenderTarget {
  const texture = device.createTexture({
    size: { width, height },
    format,
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  });

  return {
    texture,
    view: texture.createView(),
    width,
    height,
  };
}

export function buildBlurDimensions(
  width: number,
  height: number,
  passCount: number,
  downsample: number,
): Array<{ width: number; height: number }> {
  const safePassCount = Math.max(0, Math.round(passCount));
  const safeDownsample = Math.max(1.1, downsample);

  const dimensions: Array<{ width: number; height: number }> = [];
  let currentWidth = Math.max(1, width);
  let currentHeight = Math.max(1, height);

  for (let i = 0; i < safePassCount; i += 1) {
    const nextWidth = Math.max(1, Math.round(currentWidth / safeDownsample));
    const nextHeight = Math.max(1, Math.round(currentHeight / safeDownsample));

    if (nextWidth === currentWidth && nextHeight === currentHeight) {
      break;
    }

    dimensions.push({ width: nextWidth, height: nextHeight });
    currentWidth = nextWidth;
    currentHeight = nextHeight;

    if (currentWidth === 1 && currentHeight === 1) {
      break;
    }
  }

  return dimensions;
}

export function buildMipDimensions(
  width: number,
  height: number,
  levelCount: number,
): Array<{ width: number; height: number }> {
  const safeLevelCount = Math.max(0, Math.round(levelCount));
  const dimensions: Array<{ width: number; height: number }> = [];
  let currentWidth = Math.max(1, width);
  let currentHeight = Math.max(1, height);

  for (let i = 0; i < safeLevelCount; i += 1) {
    const nextWidth = Math.max(1, Math.round(currentWidth / 2));
    const nextHeight = Math.max(1, Math.round(currentHeight / 2));
    if (nextWidth === currentWidth && nextHeight === currentHeight) {
      break;
    }

    dimensions.push({ width: nextWidth, height: nextHeight });
    currentWidth = nextWidth;
    currentHeight = nextHeight;

    if (currentWidth === 1 && currentHeight === 1) {
      break;
    }
  }

  return dimensions;
}

export function buildTargetConfig(
  width: number,
  height: number,
  settings: BackgroundShaderSettings,
): TargetConfig {
  const blurMode = settings.blurMode as BlurModule;
  const dualEnabled = isDualKawaseRequested(settings);
  const mipEnabled = isMipBlurRequested(settings);

  return {
    width,
    height,
    blurMode,
    dualEnabled,
    mipEnabled,
    temporalEnabled: settings.temporalEnabled,
    dualPasses: dualEnabled ? Math.max(0, Math.round(settings.blurPasses)) : 0,
    dualDownsample: dualEnabled ? Math.max(1.1, settings.blurDownsample) : 0,
    mipLevels: mipEnabled ? Math.max(1, Math.round(settings.mipLevels)) : 0,
  };
}

export function areTargetConfigsEqual(
  left: TargetConfig | null,
  right: TargetConfig,
): boolean {
  if (!left) {
    return false;
  }

  return (
    left.width === right.width &&
    left.height === right.height &&
    left.blurMode === right.blurMode &&
    left.dualEnabled === right.dualEnabled &&
    left.mipEnabled === right.mipEnabled &&
    left.temporalEnabled === right.temporalEnabled &&
    left.dualPasses === right.dualPasses &&
    left.dualDownsample === right.dualDownsample &&
    left.mipLevels === right.mipLevels
  );
}

export function isDualKawaseRequested(
  settings: BackgroundShaderSettings,
): boolean {
  return (
    settings.blurMode === "dualKawase" &&
    settings.blurRadius > 0.001 &&
    settings.blurPasses > 0
  );
}

export function isMipBlurRequested(
  settings: BackgroundShaderSettings,
): boolean {
  return (
    settings.blurMode === "mipPyramid" &&
    settings.blurRadius > 0.001 &&
    settings.mipLevels > 0
  );
}

export function shouldApplyDualKawase(
  settings: BackgroundShaderSettings,
  blurTargetCount: number,
): boolean {
  return isDualKawaseRequested(settings) && blurTargetCount > 0;
}

export function shouldApplyMipBlur(
  settings: BackgroundShaderSettings,
  mipTargetCount: number,
): boolean {
  return isMipBlurRequested(settings) && mipTargetCount > 0;
}

export function resolveMipViews(
  mipTargets: RenderTarget[],
  fallbackView: GPUTextureView,
): [
  GPUTextureView,
  GPUTextureView,
  GPUTextureView,
  GPUTextureView,
  GPUTextureView,
] {
  const fallback =
    mipTargets.length > 0
      ? mipTargets[mipTargets.length - 1].view
      : fallbackView;
  return [
    mipTargets[0]?.view ?? fallback,
    mipTargets[1]?.view ?? fallback,
    mipTargets[2]?.view ?? fallback,
    mipTargets[3]?.view ?? fallback,
    mipTargets[4]?.view ?? fallback,
  ];
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
