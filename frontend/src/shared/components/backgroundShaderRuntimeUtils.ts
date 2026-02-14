import { BackgroundShaderSettings } from "../store/backgroundShaderStore";
import {
  BlurModule,
  RenderTarget,
  TargetConfig,
} from "./backgroundShaderRuntimeTypes";

export function createRenderTarget(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
): RenderTarget {
  const supportsColorBufferFloat = Boolean(
    gl.getExtension("EXT_color_buffer_float"),
  );
  const candidates = supportsColorBufferFloat
    ? [
        {
          internalFormat: gl.RGBA16F,
          format: gl.RGBA,
          type: gl.HALF_FLOAT,
        },
        {
          internalFormat: gl.RGBA8,
          format: gl.RGBA,
          type: gl.UNSIGNED_BYTE,
        },
      ]
    : [
        {
          internalFormat: gl.RGBA8,
          format: gl.RGBA,
          type: gl.UNSIGNED_BYTE,
        },
      ];

  for (const candidate of candidates) {
    const texture = gl.createTexture();
    const framebuffer = gl.createFramebuffer();

    if (!texture || !framebuffer) {
      if (texture) {
        gl.deleteTexture(texture);
      }
      if (framebuffer) {
        gl.deleteFramebuffer(framebuffer);
      }
      throw new Error("Failed to allocate WebGL render target resources.");
    }

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      candidate.internalFormat,
      width,
      height,
      0,
      candidate.format,
      candidate.type,
      null,
    );

    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      texture,
      0,
    );

    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status === gl.FRAMEBUFFER_COMPLETE) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, null);
      return {
        texture,
        framebuffer,
        width,
        height,
      };
    }

    gl.deleteFramebuffer(framebuffer);
    gl.deleteTexture(texture);
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, null);
  throw new Error(
    "Render target framebuffer is incomplete for all tested formats.",
  );
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
  fallbackTexture: WebGLTexture,
): [WebGLTexture, WebGLTexture, WebGLTexture, WebGLTexture, WebGLTexture] {
  const fallback =
    mipTargets.length > 0
      ? mipTargets[mipTargets.length - 1].texture
      : fallbackTexture;
  return [
    mipTargets[0]?.texture ?? fallback,
    mipTargets[1]?.texture ?? fallback,
    mipTargets[2]?.texture ?? fallback,
    mipTargets[3]?.texture ?? fallback,
    mipTargets[4]?.texture ?? fallback,
  ];
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
