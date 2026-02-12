export type RenderTarget = {
  texture: GPUTexture;
  view: GPUTextureView;
  width: number;
  height: number;
};

export type BlurModule = "none" | "dualKawase" | "mipPyramid";

export type CachedBindGroupKeyPart = string | number | object;

export type TargetConfig = {
  width: number;
  height: number;
  blurMode: BlurModule;
  temporalEnabled: boolean;
  dualPasses: number;
  dualDownsample: number;
  mipLevels: number;
};
