import { BackgroundShaderSettings } from "../store/backgroundShaderStore";
import { RenderTarget } from "./backgroundShaderRuntimeTypes";
import { clamp } from "./backgroundShaderRuntimeUtils";

type TemporalUniformWriter = (
  settingsValue: BackgroundShaderSettings,
  enabled: boolean,
  historyBlendScale: number,
) => void;

type TemporalProgram = {
  program: WebGLProgram;
  currentTexture: WebGLUniformLocation | null;
  historyTexture: WebGLUniformLocation | null;
};

export type TemporalState = {
  historyReadIndex: number;
  historyValid: boolean;
  historyFrameCount: number;
};

type TemporalResolveArgs = {
  gl: WebGL2RenderingContext;
  vao: WebGLVertexArrayObject;
  settings: BackgroundShaderSettings;
  outputTarget: RenderTarget;
  historyTargets: [RenderTarget | null, RenderTarget | null];
  temporalProgram: TemporalProgram;
  temporalState: TemporalState;
  writeTemporalUniforms: TemporalUniformWriter;
};

export function runTemporalResolve(args: TemporalResolveArgs): {
  outputTarget: RenderTarget;
  temporalState: TemporalState;
} {
  const historyRead = args.historyTargets[args.temporalState.historyReadIndex];
  const historyWrite =
    args.historyTargets[1 - args.temporalState.historyReadIndex];
  if (!historyRead || !historyWrite) {
    return {
      outputTarget: args.outputTarget,
      temporalState: {
        historyReadIndex: args.temporalState.historyReadIndex,
        historyValid: false,
        historyFrameCount: 0,
      },
    };
  }

  const historySourceTexture = args.temporalState.historyValid
    ? historyRead.texture
    : args.outputTarget.texture;
  const historyBlendScale = args.temporalState.historyValid
    ? clamp(args.temporalState.historyFrameCount / 10, 0, 1)
    : 0;

  args.writeTemporalUniforms(
    args.settings,
    args.temporalState.historyValid,
    historyBlendScale,
  );

  const { gl } = args;
  gl.bindFramebuffer(gl.FRAMEBUFFER, historyWrite.framebuffer);
  gl.viewport(0, 0, historyWrite.width, historyWrite.height);
  gl.useProgram(args.temporalProgram.program);

  bindTexture(gl, 0, args.outputTarget.texture);
  bindTexture(gl, 1, historySourceTexture);
  gl.uniform1i(args.temporalProgram.currentTexture, 0);
  gl.uniform1i(args.temporalProgram.historyTexture, 1);

  gl.bindVertexArray(args.vao);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  return {
    outputTarget: historyWrite,
    temporalState: {
      historyReadIndex: 1 - args.temporalState.historyReadIndex,
      historyValid: true,
      historyFrameCount: Math.min(args.temporalState.historyFrameCount + 1, 120),
    },
  };
}

function bindTexture(
  gl: WebGL2RenderingContext,
  unit: number,
  texture: WebGLTexture,
) {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, texture);
}
