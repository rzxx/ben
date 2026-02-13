import { BackgroundShaderSettings } from "../store/backgroundShaderStore";
import { RenderTarget } from "./backgroundShaderRuntimeTypes";
import { resolveMipViews } from "./backgroundShaderRuntimeUtils";

type BlurUniformWriter = (
  invWidth: number,
  invHeight: number,
  offset: number,
) => void;

type MipCompositeUniformWriter = (
  radius: number,
  curve: number,
  activeLevels: number,
) => void;

type BlurPassProgram = {
  program: WebGLProgram;
  inputTexture: WebGLUniformLocation | null;
};

type MipCompositeProgram = {
  program: WebGLProgram;
  baseTexture: WebGLUniformLocation | null;
  mip1Texture: WebGLUniformLocation | null;
  mip2Texture: WebGLUniformLocation | null;
  mip3Texture: WebGLUniformLocation | null;
  mip4Texture: WebGLUniformLocation | null;
  mip5Texture: WebGLUniformLocation | null;
};

type DrawTarget = {
  framebuffer: WebGLFramebuffer | null;
  width: number;
  height: number;
};

type DualKawaseBlurArgs = {
  gl: WebGL2RenderingContext;
  vao: WebGLVertexArrayObject;
  settings: BackgroundShaderSettings;
  sceneTarget: RenderTarget;
  blurTargets: RenderTarget[];
  downProgram: BlurPassProgram;
  upProgram: BlurPassProgram;
  writeBlurUniforms: BlurUniformWriter;
};

export function runDualKawaseBlur(args: DualKawaseBlurArgs): void {
  const { gl } = args;
  let sourceTarget = args.sceneTarget;

  for (let i = 0; i < args.blurTargets.length; i += 1) {
    const target = args.blurTargets[i];
    const passOffset = args.settings.blurRadius + args.settings.blurRadiusStep * i;

    args.writeBlurUniforms(
      1 / Math.max(1, sourceTarget.width),
      1 / Math.max(1, sourceTarget.height),
      passOffset,
    );

    drawBlurPass(gl, args.vao, args.downProgram, sourceTarget.texture, target);
    sourceTarget = target;
  }

  let upSourceTarget = sourceTarget;
  for (let i = args.blurTargets.length - 2; i >= 0; i -= 1) {
    const target = args.blurTargets[i];
    const passOffset = args.settings.blurRadius + args.settings.blurRadiusStep * i;

    args.writeBlurUniforms(
      1 / Math.max(1, upSourceTarget.width),
      1 / Math.max(1, upSourceTarget.height),
      passOffset,
    );

    drawBlurPass(gl, args.vao, args.upProgram, upSourceTarget.texture, target);
    upSourceTarget = target;
  }

  args.writeBlurUniforms(
    1 / Math.max(1, upSourceTarget.width),
    1 / Math.max(1, upSourceTarget.height),
    args.settings.blurRadius,
  );

  drawBlurPass(
    gl,
    args.vao,
    args.upProgram,
    upSourceTarget.texture,
    args.sceneTarget,
  );
}

type MipPyramidBlurArgs = {
  gl: WebGL2RenderingContext;
  vao: WebGLVertexArrayObject;
  settings: BackgroundShaderSettings;
  sceneTarget: RenderTarget;
  destinationTarget: RenderTarget;
  mipTargets: RenderTarget[];
  downProgram: BlurPassProgram;
  compositeProgram: MipCompositeProgram;
  maxMipCompositeLevels: number;
  writeBlurUniforms: BlurUniformWriter;
  writeMipCompositeUniforms: MipCompositeUniformWriter;
};

export function runMipPyramidBlur(args: MipPyramidBlurArgs): void {
  const { gl } = args;

  let source = args.sceneTarget;
  for (const target of args.mipTargets) {
    args.writeBlurUniforms(
      1 / Math.max(1, source.width),
      1 / Math.max(1, source.height),
      args.settings.blurRadius,
    );

    drawBlurPass(gl, args.vao, args.downProgram, source.texture, target);
    source = target;
  }

  const activeMipLevels = Math.min(
    args.settings.mipLevels,
    args.mipTargets.length,
    args.maxMipCompositeLevels,
  );
  args.writeMipCompositeUniforms(
    args.settings.blurRadius,
    args.settings.mipCurve,
    activeMipLevels,
  );

  const mipTextures = resolveMipViews(args.mipTargets, args.sceneTarget.texture);

  gl.bindFramebuffer(gl.FRAMEBUFFER, args.destinationTarget.framebuffer);
  gl.viewport(0, 0, args.destinationTarget.width, args.destinationTarget.height);
  gl.useProgram(args.compositeProgram.program);

  bindTexture(gl, 0, args.sceneTarget.texture);
  bindTexture(gl, 1, mipTextures[0]);
  bindTexture(gl, 2, mipTextures[1]);
  bindTexture(gl, 3, mipTextures[2]);
  bindTexture(gl, 4, mipTextures[3]);
  bindTexture(gl, 5, mipTextures[4]);

  gl.uniform1i(args.compositeProgram.baseTexture, 0);
  gl.uniform1i(args.compositeProgram.mip1Texture, 1);
  gl.uniform1i(args.compositeProgram.mip2Texture, 2);
  gl.uniform1i(args.compositeProgram.mip3Texture, 3);
  gl.uniform1i(args.compositeProgram.mip4Texture, 4);
  gl.uniform1i(args.compositeProgram.mip5Texture, 5);

  gl.bindVertexArray(args.vao);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

function drawBlurPass(
  gl: WebGL2RenderingContext,
  vao: WebGLVertexArrayObject,
  programInfo: BlurPassProgram,
  sourceTexture: WebGLTexture,
  target: DrawTarget,
): void {
  gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
  gl.viewport(0, 0, target.width, target.height);
  gl.useProgram(programInfo.program);

  bindTexture(gl, 0, sourceTexture);
  gl.uniform1i(programInfo.inputTexture, 0);

  gl.bindVertexArray(vao);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

function bindTexture(
  gl: WebGL2RenderingContext,
  unit: number,
  texture: WebGLTexture,
) {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, texture);
}
