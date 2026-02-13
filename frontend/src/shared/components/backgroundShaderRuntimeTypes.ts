export type RenderTarget = {
  texture: WebGLTexture;
  framebuffer: WebGLFramebuffer;
  width: number;
  height: number;
};

export type BlurModule = "none" | "dualKawase" | "mipPyramid";

export type TargetConfig = {
  width: number;
  height: number;
  blurMode: BlurModule;
  dualEnabled: boolean;
  mipEnabled: boolean;
  temporalEnabled: boolean;
  dualPasses: number;
  dualDownsample: number;
  mipLevels: number;
};
