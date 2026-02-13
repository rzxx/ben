import {
  BackgroundShaderSettings,
  ShaderColorSet,
} from "../store/backgroundShaderStore";
import {
  backgroundCompositeFragmentShaderGLSL,
  dualKawaseDownFragmentShaderGLSL,
  dualKawaseUpFragmentShaderGLSL,
  mipCompositeFragmentShaderGLSL,
  mipDownsampleFragmentShaderGLSL,
  passVertexGLSL,
  sceneFragmentGLSL,
  sceneVertexGLSL,
  temporalResolveFragmentShaderGLSL,
} from "./backgroundShaderGLSL";
import {
  runDualKawaseBlur,
  runMipPyramidBlur,
} from "./backgroundShaderBlurModules";
import { runTemporalResolve } from "./backgroundShaderTemporalModule";
import { BlurModule, RenderTarget, TargetConfig } from "./backgroundShaderRuntimeTypes";
import {
  areTargetConfigsEqual,
  buildBlurDimensions,
  buildMipDimensions,
  buildTargetConfig,
  clamp,
  createRenderTarget,
  shouldApplyDualKawase,
  shouldApplyMipBlur,
} from "./backgroundShaderRuntimeUtils";

const sceneUniformFloatCount = 56;
const sceneUniformBufferSize =
  sceneUniformFloatCount * Float32Array.BYTES_PER_ELEMENT;
const blurUniformFloatCount = 4;
const blurUniformBufferSize =
  blurUniformFloatCount * Float32Array.BYTES_PER_ELEMENT;
const mipCompositeUniformFloatCount = 4;
const mipCompositeUniformBufferSize =
  mipCompositeUniformFloatCount * Float32Array.BYTES_PER_ELEMENT;
const temporalUniformFloatCount = 4;
const temporalUniformBufferSize =
  temporalUniformFloatCount * Float32Array.BYTES_PER_ELEMENT;
const compositeUniformFloatCount = 4;
const compositeUniformBufferSize =
  compositeUniformFloatCount * Float32Array.BYTES_PER_ELEMENT;

const maxMipCompositeLevels = 5;
const baseColor: [number, number, number] = [0.03, 0.035, 0.045];

const uniformBindingPoints = {
  scene: 0,
  blur: 1,
  mipComposite: 2,
  temporal: 3,
  composite: 4,
} as const;

type SceneProgramInfo = {
  program: WebGLProgram;
};

type BlurProgramInfo = {
  program: WebGLProgram;
  inputTexture: WebGLUniformLocation | null;
};

type MipCompositeProgramInfo = {
  program: WebGLProgram;
  baseTexture: WebGLUniformLocation | null;
  mip1Texture: WebGLUniformLocation | null;
  mip2Texture: WebGLUniformLocation | null;
  mip3Texture: WebGLUniformLocation | null;
  mip4Texture: WebGLUniformLocation | null;
  mip5Texture: WebGLUniformLocation | null;
};

type TemporalProgramInfo = {
  program: WebGLProgram;
  currentTexture: WebGLUniformLocation | null;
  historyTexture: WebGLUniformLocation | null;
};

type CompositeProgramInfo = {
  program: WebGLProgram;
  inputTexture: WebGLUniformLocation | null;
};

export type BackgroundShaderRendererOptions = {
  canvas: HTMLCanvasElement;
  webgl2Available: boolean;
  getFromColors: () => ShaderColorSet;
  getToColors: () => ShaderColorSet;
  getTransitionStartedAtMs: () => number;
  getSettings: () => BackgroundShaderSettings;
  onUnsupportedChange: (isUnsupported: boolean) => void;
  onDiagnostics?: (message: string) => void;
};

export type BackgroundShaderRendererHandle = {
  dispose: () => void;
};

export function createBackgroundShaderRenderer(
  options: BackgroundShaderRendererOptions,
): BackgroundShaderRendererHandle {
  const canvas = options.canvas;
  if (!options.webgl2Available) {
    options.onUnsupportedChange(true);
    return {
      dispose: () => {},
    };
  }

  let animationFrameId = 0;
  let lastRenderAtMs = 0;
  let disposed = false;
  let resizeObserver: ResizeObserver | null = null;
  let initializePromise: Promise<void> | null = null;
  let hasRenderLoopStarted = false;
  let lastDiagnosticMessage = "";

  let lastTemporalSceneVariant:
    | BackgroundShaderSettings["sceneVariant"]
    | null = null;
  let lastTemporalBlurMode: BackgroundShaderSettings["blurMode"] | null = null;
  let lastTemporalNoiseScale = Number.NaN;
  let lastTemporalFlowSpeed = Number.NaN;
  let lastTemporalWarpStrength = Number.NaN;
  let lastTemporalDetailAmount = Number.NaN;
  let lastTemporalDetailScale = Number.NaN;
  let lastTemporalDetailSpeed = Number.NaN;
  let lastTemporalColorDrift = Number.NaN;
  let lastTemporalLumaAnchor = Number.NaN;
  let lastTemporalBlurRadius = Number.NaN;
  let lastTemporalStrength = Number.NaN;
  let lastTemporalResponse = Number.NaN;
  let lastTemporalClamp = Number.NaN;
  let lastTemporalTransitionMs = Number.NaN;

  const renderState = {
    gl: null as WebGL2RenderingContext | null,
    vao: null as WebGLVertexArrayObject | null,
    sceneProgram: null as SceneProgramInfo | null,
    dualDownProgram: null as BlurProgramInfo | null,
    dualUpProgram: null as BlurProgramInfo | null,
    mipDownProgram: null as BlurProgramInfo | null,
    mipCompositeProgram: null as MipCompositeProgramInfo | null,
    temporalProgram: null as TemporalProgramInfo | null,
    compositeProgram: null as CompositeProgramInfo | null,
    sceneUniformBuffer: null as WebGLBuffer | null,
    blurUniformBuffer: null as WebGLBuffer | null,
    mipCompositeUniformBuffer: null as WebGLBuffer | null,
    temporalUniformBuffer: null as WebGLBuffer | null,
    compositeUniformBuffer: null as WebGLBuffer | null,
    sceneUniformData: new Float32Array(sceneUniformFloatCount),
    blurUniformData: new Float32Array(blurUniformFloatCount),
    mipCompositeUniformData: new Float32Array(mipCompositeUniformFloatCount),
    temporalUniformData: new Float32Array(temporalUniformFloatCount),
    compositeUniformData: new Float32Array(compositeUniformFloatCount),
    sceneTarget: null as RenderTarget | null,
    postTarget: null as RenderTarget | null,
    dualBlurTargets: [] as RenderTarget[],
    mipTargets: [] as RenderTarget[],
    historyTargets: [null, null] as [RenderTarget | null, RenderTarget | null],
    historyReadIndex: 0,
    historyValid: false,
    historyFrameCount: 0,
    targetConfig: null as TargetConfig | null,
    contextLost: false,
  };

  const reportDiagnostic = (message: string) => {
    const trimmed = message.trim();
    if (!trimmed || trimmed === lastDiagnosticMessage) {
      return;
    }
    lastDiagnosticMessage = trimmed;
    if (!disposed) {
      options.onDiagnostics?.(trimmed);
    }
  };

  const setUnsupported = (next: boolean) => {
    if (!disposed) {
      options.onUnsupportedChange(next);
    }
  };

  const writeSceneUniforms = (nowMs: number, width: number, height: number) => {
    const gl = renderState.gl;
    const sceneUniformBuffer = renderState.sceneUniformBuffer;
    if (!gl || !sceneUniformBuffer) {
      return;
    }

    const uniformData = renderState.sceneUniformData;
    const settingsValue = options.getSettings();

    const safeWidth = Math.max(1, width);
    const safeHeight = Math.max(1, height);
    const seconds = nowMs * 0.001;
    const durationMs = settingsValue.colorTransitionSeconds * 1000;
    const transitionMix =
      durationMs <= 0
        ? 1
        : clamp(
            (nowMs - options.getTransitionStartedAtMs()) / durationMs,
            0,
            1,
          );

    uniformData[0] = safeWidth;
    uniformData[1] = safeHeight;
    uniformData[2] = 1 / safeWidth;
    uniformData[3] = 1 / safeHeight;

    uniformData[4] = seconds;
    uniformData[5] = settingsValue.noiseScale;
    uniformData[6] = settingsValue.flowSpeed;
    uniformData[7] = settingsValue.warpStrength;

    uniformData[8] = transitionMix;
    uniformData[9] = settingsValue.detailAmount;
    uniformData[10] = settingsValue.detailScale;
    uniformData[11] = settingsValue.detailSpeed;

    uniformData[12] = settingsValue.sceneVariant === "legacyFeedback" ? 1 : 0;
    uniformData[13] = settingsValue.colorDrift;
    uniformData[14] = settingsValue.lumaAnchor;
    uniformData[15] = 0;

    writeColorSet(uniformData, 16, options.getFromColors());
    writeColorSet(uniformData, 36, options.getToColors());

    writeUniformBuffer(gl, sceneUniformBuffer, uniformData);
  };

  const writeBlurUniforms = (
    invWidth: number,
    invHeight: number,
    offset: number,
  ) => {
    const gl = renderState.gl;
    const blurUniformBuffer = renderState.blurUniformBuffer;
    if (!gl || !blurUniformBuffer) {
      return;
    }

    const uniformData = renderState.blurUniformData;
    uniformData[0] = invWidth;
    uniformData[1] = invHeight;
    uniformData[2] = Math.max(0, offset);
    uniformData[3] = 0;

    writeUniformBuffer(gl, blurUniformBuffer, uniformData);
  };

  const writeMipCompositeUniforms = (
    radius: number,
    curve: number,
    activeLevels: number,
  ) => {
    const gl = renderState.gl;
    const mipCompositeUniformBuffer = renderState.mipCompositeUniformBuffer;
    if (!gl || !mipCompositeUniformBuffer) {
      return;
    }

    const uniformData = renderState.mipCompositeUniformData;
    uniformData[0] = radius;
    uniformData[1] = curve;
    uniformData[2] = activeLevels;
    uniformData[3] = 0;

    writeUniformBuffer(gl, mipCompositeUniformBuffer, uniformData);
  };

  const writeTemporalUniforms = (
    settingsValue: BackgroundShaderSettings,
    enabled: boolean,
    historyBlendScale: number,
  ) => {
    const gl = renderState.gl;
    const temporalUniformBuffer = renderState.temporalUniformBuffer;
    if (!gl || !temporalUniformBuffer) {
      return;
    }

    const uniformData = renderState.temporalUniformData;
    uniformData[0] =
      settingsValue.temporalStrength * clamp(historyBlendScale, 0, 1);
    uniformData[1] = settingsValue.temporalResponse;
    uniformData[2] = settingsValue.temporalClamp;
    uniformData[3] = enabled ? 1 : 0;

    writeUniformBuffer(gl, temporalUniformBuffer, uniformData);
  };

  const writeCompositeUniforms = (opacity: number) => {
    const gl = renderState.gl;
    const compositeUniformBuffer = renderState.compositeUniformBuffer;
    if (!gl || !compositeUniformBuffer) {
      return;
    }

    const uniformData = renderState.compositeUniformData;
    uniformData[0] = clamp(opacity, 0, 1);
    uniformData[1] = baseColor[0];
    uniformData[2] = baseColor[1];
    uniformData[3] = baseColor[2];

    writeUniformBuffer(gl, compositeUniformBuffer, uniformData);
  };

  const temporalResetInputsChanged = (
    settingsValue: BackgroundShaderSettings,
    transitionStartedAtMsValue: number,
  ): boolean => {
    if (
      lastTemporalSceneVariant === settingsValue.sceneVariant &&
      lastTemporalBlurMode === settingsValue.blurMode &&
      lastTemporalNoiseScale === settingsValue.noiseScale &&
      lastTemporalFlowSpeed === settingsValue.flowSpeed &&
      lastTemporalWarpStrength === settingsValue.warpStrength &&
      lastTemporalDetailAmount === settingsValue.detailAmount &&
      lastTemporalDetailScale === settingsValue.detailScale &&
      lastTemporalDetailSpeed === settingsValue.detailSpeed &&
      lastTemporalColorDrift === settingsValue.colorDrift &&
      lastTemporalLumaAnchor === settingsValue.lumaAnchor &&
      lastTemporalBlurRadius === settingsValue.blurRadius &&
      lastTemporalStrength === settingsValue.temporalStrength &&
      lastTemporalResponse === settingsValue.temporalResponse &&
      lastTemporalClamp === settingsValue.temporalClamp &&
      lastTemporalTransitionMs === transitionStartedAtMsValue
    ) {
      return false;
    }

    lastTemporalSceneVariant = settingsValue.sceneVariant;
    lastTemporalBlurMode = settingsValue.blurMode;
    lastTemporalNoiseScale = settingsValue.noiseScale;
    lastTemporalFlowSpeed = settingsValue.flowSpeed;
    lastTemporalWarpStrength = settingsValue.warpStrength;
    lastTemporalDetailAmount = settingsValue.detailAmount;
    lastTemporalDetailScale = settingsValue.detailScale;
    lastTemporalDetailSpeed = settingsValue.detailSpeed;
    lastTemporalColorDrift = settingsValue.colorDrift;
    lastTemporalLumaAnchor = settingsValue.lumaAnchor;
    lastTemporalBlurRadius = settingsValue.blurRadius;
    lastTemporalStrength = settingsValue.temporalStrength;
    lastTemporalResponse = settingsValue.temporalResponse;
    lastTemporalClamp = settingsValue.temporalClamp;
    lastTemporalTransitionMs = transitionStartedAtMsValue;
    return true;
  };

  const destroyRenderTargets = () => {
    const gl = renderState.gl;
    if (!gl) {
      return;
    }

    destroyRenderTarget(gl, renderState.sceneTarget);
    renderState.sceneTarget = null;

    destroyRenderTarget(gl, renderState.postTarget);
    renderState.postTarget = null;

    for (const target of renderState.dualBlurTargets) {
      destroyRenderTarget(gl, target);
    }
    renderState.dualBlurTargets = [];

    for (const target of renderState.mipTargets) {
      destroyRenderTarget(gl, target);
    }
    renderState.mipTargets = [];

    destroyRenderTarget(gl, renderState.historyTargets[0]);
    destroyRenderTarget(gl, renderState.historyTargets[1]);
    renderState.historyTargets = [null, null];

    renderState.historyReadIndex = 0;
    renderState.historyValid = false;
    renderState.historyFrameCount = 0;
    renderState.targetConfig = null;
  };

  const resetGlState = () => {
    const gl = renderState.gl;
    if (!gl) {
      return;
    }

    destroyRenderTargets();

    gl.deleteBuffer(renderState.sceneUniformBuffer);
    gl.deleteBuffer(renderState.blurUniformBuffer);
    gl.deleteBuffer(renderState.mipCompositeUniformBuffer);
    gl.deleteBuffer(renderState.temporalUniformBuffer);
    gl.deleteBuffer(renderState.compositeUniformBuffer);

    gl.deleteProgram(renderState.sceneProgram?.program ?? null);
    gl.deleteProgram(renderState.dualDownProgram?.program ?? null);
    gl.deleteProgram(renderState.dualUpProgram?.program ?? null);
    gl.deleteProgram(renderState.mipDownProgram?.program ?? null);
    gl.deleteProgram(renderState.mipCompositeProgram?.program ?? null);
    gl.deleteProgram(renderState.temporalProgram?.program ?? null);
    gl.deleteProgram(renderState.compositeProgram?.program ?? null);

    gl.deleteVertexArray(renderState.vao);

    renderState.vao = null;
    renderState.sceneProgram = null;
    renderState.dualDownProgram = null;
    renderState.dualUpProgram = null;
    renderState.mipDownProgram = null;
    renderState.mipCompositeProgram = null;
    renderState.temporalProgram = null;
    renderState.compositeProgram = null;
    renderState.sceneUniformBuffer = null;
    renderState.blurUniformBuffer = null;
    renderState.mipCompositeUniformBuffer = null;
    renderState.temporalUniformBuffer = null;
    renderState.compositeUniformBuffer = null;
    renderState.gl = null;
  };

  const ensureRenderTargets = (width: number, height: number) => {
    const gl = renderState.gl;
    if (!gl) {
      return;
    }

    const settingsValue = options.getSettings();
    const nextConfig = buildTargetConfig(width, height, settingsValue);
    const needsDualTargets = nextConfig.dualEnabled;
    const needsMipTargets = nextConfig.mipEnabled;
    const needsTemporalHistory = nextConfig.temporalEnabled;
    const hasRequiredTargets =
      renderState.sceneTarget !== null &&
      (!needsMipTargets || renderState.postTarget !== null) &&
      (!needsTemporalHistory ||
        (renderState.historyTargets[0] !== null &&
          renderState.historyTargets[1] !== null));

    if (
      hasRequiredTargets &&
      areTargetConfigsEqual(renderState.targetConfig, nextConfig)
    ) {
      return;
    }

    destroyRenderTargets();

    renderState.sceneTarget = createRenderTarget(gl, width, height);

    renderState.postTarget = needsMipTargets
      ? createRenderTarget(gl, width, height)
      : null;

    if (needsDualTargets) {
      const dualDims = buildBlurDimensions(
        width,
        height,
        settingsValue.blurPasses,
        settingsValue.blurDownsample,
      );
      renderState.dualBlurTargets = dualDims.map(
        ({ width: targetWidth, height: targetHeight }) =>
          createRenderTarget(gl, targetWidth, targetHeight),
      );
    }

    if (needsMipTargets) {
      const mipDims = buildMipDimensions(
        width,
        height,
        Math.min(settingsValue.mipLevels, maxMipCompositeLevels),
      );
      renderState.mipTargets = mipDims.map(
        ({ width: targetWidth, height: targetHeight }) =>
          createRenderTarget(gl, targetWidth, targetHeight),
      );
    }

    renderState.historyTargets = needsTemporalHistory
      ? [
          createRenderTarget(gl, width, height),
          createRenderTarget(gl, width, height),
        ]
      : [null, null];
    renderState.historyReadIndex = 0;
    renderState.historyValid = false;
    renderState.historyFrameCount = 0;

    renderState.targetConfig = nextConfig;
  };

  const resizeCanvas = () => {
    const settingsValue = options.getSettings();
    const dpr = Math.min(
      window.devicePixelRatio || 1,
      clamp(settingsValue.maxRenderDpr, 0.75, 2),
    );
    const renderScale = clamp(settingsValue.renderScale, 0.2, 1);

    const width = Math.max(
      1,
      Math.round(canvas.clientWidth * dpr * renderScale),
    );
    const height = Math.max(
      1,
      Math.round(canvas.clientHeight * dpr * renderScale),
    );

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  };

  const render = (time: number) => {
    if (disposed) {
      hasRenderLoopStarted = false;
      return;
    }

    const settingsValue = options.getSettings();
    const frameIntervalMs = 1000 / clamp(settingsValue.targetFrameRate, 15, 60);

    if (time - lastRenderAtMs < frameIntervalMs) {
      animationFrameId = window.requestAnimationFrame(render);
      return;
    }

    lastRenderAtMs = time;

    const {
      gl,
      vao,
      sceneProgram,
      dualDownProgram,
      dualUpProgram,
      mipDownProgram,
      mipCompositeProgram,
      temporalProgram,
      compositeProgram,
      sceneUniformBuffer,
      blurUniformBuffer,
      mipCompositeUniformBuffer,
      temporalUniformBuffer,
      compositeUniformBuffer,
    } = renderState;

    if (
      !gl ||
      !vao ||
      !sceneProgram ||
      !dualDownProgram ||
      !dualUpProgram ||
      !mipDownProgram ||
      !mipCompositeProgram ||
      !temporalProgram ||
      !compositeProgram ||
      !sceneUniformBuffer ||
      !blurUniformBuffer ||
      !mipCompositeUniformBuffer ||
      !temporalUniformBuffer ||
      !compositeUniformBuffer
    ) {
      animationFrameId = window.requestAnimationFrame(render);
      return;
    }

    if (gl.isContextLost() || renderState.contextLost) {
      animationFrameId = window.requestAnimationFrame(render);
      return;
    }

    try {
      resizeCanvas();
      ensureRenderTargets(canvas.width, canvas.height);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      reportDiagnostic(`Failed to allocate render targets: ${message}`);
      setUnsupported(true);
      animationFrameId = window.requestAnimationFrame(render);
      return;
    }

    const sceneTarget = renderState.sceneTarget;
    const postTarget = renderState.postTarget;
    if (!sceneTarget) {
      animationFrameId = window.requestAnimationFrame(render);
      return;
    }

    writeSceneUniforms(time, canvas.width, canvas.height);
    writeCompositeUniforms(settingsValue.opacity);

    if (
      temporalResetInputsChanged(
        settingsValue,
        options.getTransitionStartedAtMs(),
      )
    ) {
      renderState.historyValid = false;
      renderState.historyFrameCount = 0;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, sceneTarget.framebuffer);
    gl.viewport(0, 0, sceneTarget.width, sceneTarget.height);
    gl.useProgram(sceneProgram.program);
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    let outputTarget = sceneTarget;
    const blurModule = settingsValue.blurMode as BlurModule;

    if (
      blurModule === "dualKawase" &&
      shouldApplyDualKawase(settingsValue, renderState.dualBlurTargets.length)
    ) {
      runDualKawaseBlur({
        gl,
        vao,
        settings: settingsValue,
        sceneTarget,
        blurTargets: renderState.dualBlurTargets,
        downProgram: dualDownProgram,
        upProgram: dualUpProgram,
        writeBlurUniforms,
      });
      outputTarget = sceneTarget;
    }

    if (
      blurModule === "mipPyramid" &&
      postTarget &&
      shouldApplyMipBlur(settingsValue, renderState.mipTargets.length)
    ) {
      runMipPyramidBlur({
        gl,
        vao,
        settings: settingsValue,
        sceneTarget,
        destinationTarget: postTarget,
        mipTargets: renderState.mipTargets,
        downProgram: mipDownProgram,
        compositeProgram: mipCompositeProgram,
        maxMipCompositeLevels,
        writeBlurUniforms,
        writeMipCompositeUniforms,
      });
      outputTarget = postTarget;
    }

    if (settingsValue.temporalEnabled) {
      const temporalResult = runTemporalResolve({
        gl,
        vao,
        settings: settingsValue,
        outputTarget,
        historyTargets: renderState.historyTargets,
        temporalProgram,
        temporalState: {
          historyReadIndex: renderState.historyReadIndex,
          historyValid: renderState.historyValid,
          historyFrameCount: renderState.historyFrameCount,
        },
        writeTemporalUniforms,
      });

      outputTarget = temporalResult.outputTarget;
      renderState.historyReadIndex = temporalResult.temporalState.historyReadIndex;
      renderState.historyValid = temporalResult.temporalState.historyValid;
      renderState.historyFrameCount = temporalResult.temporalState.historyFrameCount;
    } else {
      renderState.historyValid = false;
      renderState.historyFrameCount = 0;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(compositeProgram.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, outputTarget.texture);
    gl.uniform1i(compositeProgram.inputTexture, 0);
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    animationFrameId = window.requestAnimationFrame(render);
  };

  const initialize = async () => {
    try {
      const context = canvas.getContext("webgl2", {
        alpha: true,
        premultipliedAlpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: "high-performance",
      });

      if (!context || disposed) {
        setUnsupported(true);
        reportDiagnostic("WebGL2 context is unavailable.");
        return;
      }

      const gl = context;
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      gl.disable(gl.BLEND);

      if (!gl.getExtension("EXT_color_buffer_float")) {
        reportDiagnostic(
          "EXT_color_buffer_float is unavailable; using RGBA8 render targets may introduce gradient banding on some GPUs.",
        );
      }

      const vao = gl.createVertexArray();
      if (!vao) {
        throw new Error("Failed to create fullscreen vertex array object.");
      }

      const sceneProgram = createProgram(
        gl,
        sceneVertexGLSL,
        sceneFragmentGLSL,
        "scene",
      );
      const dualDownProgram = createProgram(
        gl,
        passVertexGLSL,
        dualKawaseDownFragmentShaderGLSL,
        "dualDown",
      );
      const dualUpProgram = createProgram(
        gl,
        passVertexGLSL,
        dualKawaseUpFragmentShaderGLSL,
        "dualUp",
      );
      const mipDownProgram = createProgram(
        gl,
        passVertexGLSL,
        mipDownsampleFragmentShaderGLSL,
        "mipDown",
      );
      const mipCompositeProgram = createProgram(
        gl,
        passVertexGLSL,
        mipCompositeFragmentShaderGLSL,
        "mipComposite",
      );
      const temporalProgram = createProgram(
        gl,
        passVertexGLSL,
        temporalResolveFragmentShaderGLSL,
        "temporal",
      );
      const compositeProgram = createProgram(
        gl,
        passVertexGLSL,
        backgroundCompositeFragmentShaderGLSL,
        "composite",
      );

      configureUniformBlock(gl, sceneProgram, "Uniforms", uniformBindingPoints.scene);
      configureUniformBlock(
        gl,
        dualDownProgram,
        "BlurUniforms",
        uniformBindingPoints.blur,
      );
      configureUniformBlock(
        gl,
        dualUpProgram,
        "BlurUniforms",
        uniformBindingPoints.blur,
      );
      configureUniformBlock(
        gl,
        mipDownProgram,
        "BlurUniforms",
        uniformBindingPoints.blur,
      );
      configureUniformBlock(
        gl,
        mipCompositeProgram,
        "MipCompositeUniforms",
        uniformBindingPoints.mipComposite,
      );
      configureUniformBlock(
        gl,
        temporalProgram,
        "TemporalUniforms",
        uniformBindingPoints.temporal,
      );
      configureUniformBlock(
        gl,
        compositeProgram,
        "CompositeUniforms",
        uniformBindingPoints.composite,
      );

      const sceneUniformBuffer = createUniformBuffer(
        gl,
        sceneUniformBufferSize,
        uniformBindingPoints.scene,
      );
      const blurUniformBuffer = createUniformBuffer(
        gl,
        blurUniformBufferSize,
        uniformBindingPoints.blur,
      );
      const mipCompositeUniformBuffer = createUniformBuffer(
        gl,
        mipCompositeUniformBufferSize,
        uniformBindingPoints.mipComposite,
      );
      const temporalUniformBuffer = createUniformBuffer(
        gl,
        temporalUniformBufferSize,
        uniformBindingPoints.temporal,
      );
      const compositeUniformBuffer = createUniformBuffer(
        gl,
        compositeUniformBufferSize,
        uniformBindingPoints.composite,
      );

      const initializedSceneProgram: SceneProgramInfo = { program: sceneProgram };
      const initializedDualDownProgram: BlurProgramInfo = {
        program: dualDownProgram,
        inputTexture: gl.getUniformLocation(dualDownProgram, "inputTexture"),
      };
      const initializedDualUpProgram: BlurProgramInfo = {
        program: dualUpProgram,
        inputTexture: gl.getUniformLocation(dualUpProgram, "inputTexture"),
      };
      const initializedMipDownProgram: BlurProgramInfo = {
        program: mipDownProgram,
        inputTexture: gl.getUniformLocation(mipDownProgram, "inputTexture"),
      };
      const initializedMipCompositeProgram: MipCompositeProgramInfo = {
        program: mipCompositeProgram,
        baseTexture: gl.getUniformLocation(mipCompositeProgram, "baseTexture"),
        mip1Texture: gl.getUniformLocation(mipCompositeProgram, "mip1Texture"),
        mip2Texture: gl.getUniformLocation(mipCompositeProgram, "mip2Texture"),
        mip3Texture: gl.getUniformLocation(mipCompositeProgram, "mip3Texture"),
        mip4Texture: gl.getUniformLocation(mipCompositeProgram, "mip4Texture"),
        mip5Texture: gl.getUniformLocation(mipCompositeProgram, "mip5Texture"),
      };
      const initializedTemporalProgram: TemporalProgramInfo = {
        program: temporalProgram,
        currentTexture: gl.getUniformLocation(temporalProgram, "currentTexture"),
        historyTexture: gl.getUniformLocation(temporalProgram, "historyTexture"),
      };
      const initializedCompositeProgram: CompositeProgramInfo = {
        program: compositeProgram,
        inputTexture: gl.getUniformLocation(compositeProgram, "inputTexture"),
      };

      resetGlState();

      renderState.gl = gl;
      renderState.vao = vao;
      renderState.sceneProgram = initializedSceneProgram;
      renderState.dualDownProgram = initializedDualDownProgram;
      renderState.dualUpProgram = initializedDualUpProgram;
      renderState.mipDownProgram = initializedMipDownProgram;
      renderState.mipCompositeProgram = initializedMipCompositeProgram;
      renderState.temporalProgram = initializedTemporalProgram;
      renderState.compositeProgram = initializedCompositeProgram;
      renderState.sceneUniformBuffer = sceneUniformBuffer;
      renderState.blurUniformBuffer = blurUniformBuffer;
      renderState.mipCompositeUniformBuffer = mipCompositeUniformBuffer;
      renderState.temporalUniformBuffer = temporalUniformBuffer;
      renderState.compositeUniformBuffer = compositeUniformBuffer;

      resizeObserver?.disconnect();
      resizeCanvas();
      resizeObserver = new ResizeObserver(() => {
        resizeCanvas();
      });
      resizeObserver.observe(canvas);

      setUnsupported(false);
      if (!hasRenderLoopStarted) {
        hasRenderLoopStarted = true;
        animationFrameId = window.requestAnimationFrame(render);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      reportDiagnostic(`Background shader initialization failed: ${message}`);
      setUnsupported(true);
    }
  };

  const startInitialize = () => {
    if (initializePromise) {
      return initializePromise;
    }

    initializePromise = initialize().finally(() => {
      initializePromise = null;
    });
    return initializePromise;
  };

  const handleContextLost = (event: Event) => {
    event.preventDefault();
    renderState.contextLost = true;
    reportDiagnostic("WebGL2 context lost.");
    setUnsupported(true);
    resetGlState();
  };

  const handleContextRestored = () => {
    renderState.contextLost = false;
    reportDiagnostic("WebGL2 context restored. Reinitializing shader renderer.");
    void startInitialize();
  };

  canvas.addEventListener("webglcontextlost", handleContextLost, false);
  canvas.addEventListener("webglcontextrestored", handleContextRestored, false);

  void startInitialize();

  return {
    dispose: () => {
      disposed = true;
      hasRenderLoopStarted = false;
      window.cancelAnimationFrame(animationFrameId);
      resizeObserver?.disconnect();
      canvas.removeEventListener("webglcontextlost", handleContextLost, false);
      canvas.removeEventListener(
        "webglcontextrestored",
        handleContextRestored,
        false,
      );
      resetGlState();
    },
  };
}

function writeColorSet(
  uniformData: Float32Array,
  offset: number,
  colorSet: ShaderColorSet,
) {
  for (let index = 0; index < colorSet.length; index += 1) {
    const colorOffset = offset + index * 4;
    uniformData[colorOffset] = colorSet[index][0];
    uniformData[colorOffset + 1] = colorSet[index][1];
    uniformData[colorOffset + 2] = colorSet[index][2];
    uniformData[colorOffset + 3] = 1;
  }
}

function writeUniformBuffer(
  gl: WebGL2RenderingContext,
  buffer: WebGLBuffer,
  data: Float32Array,
) {
  gl.bindBuffer(gl.UNIFORM_BUFFER, buffer);
  gl.bufferSubData(gl.UNIFORM_BUFFER, 0, data);
}

function destroyRenderTarget(
  gl: WebGL2RenderingContext,
  target: RenderTarget | null,
) {
  if (!target) {
    return;
  }

  gl.deleteFramebuffer(target.framebuffer);
  gl.deleteTexture(target.texture);
}

function createProgram(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string,
  label: string,
): WebGLProgram {
  const vertexShader = createShader(
    gl,
    gl.VERTEX_SHADER,
    vertexSource,
    `${label} vertex`,
  );
  const fragmentShader = createShader(
    gl,
    gl.FRAGMENT_SHADER,
    fragmentSource,
    `${label} fragment`,
  );

  const program = gl.createProgram();
  if (!program) {
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    throw new Error(`Failed to create ${label} WebGL program.`);
  }

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) || "Unknown link error";
    gl.deleteProgram(program);
    throw new Error(`${label} program link failed: ${log}`);
  }

  return program;
}

function createShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
  label: string,
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error(`Failed to create shader for ${label}.`);
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    const compileMessage = log?.trim()
      ? log
      : gl.isContextLost()
        ? "WebGL context lost during shader compilation"
        : "Unknown compile error";
    gl.deleteShader(shader);
    throw new Error(`${label} compilation failed: ${compileMessage}`);
  }

  return shader;
}

function configureUniformBlock(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  blockName: string,
  bindingPoint: number,
) {
  const blockIndex = gl.getUniformBlockIndex(program, blockName);
  if (blockIndex === gl.INVALID_INDEX) {
    throw new Error(`Program missing required uniform block: ${blockName}.`);
  }
  gl.uniformBlockBinding(program, blockIndex, bindingPoint);
}

function createUniformBuffer(
  gl: WebGL2RenderingContext,
  byteSize: number,
  bindingPoint: number,
): WebGLBuffer {
  const buffer = gl.createBuffer();
  if (!buffer) {
    throw new Error("Failed to create WebGL uniform buffer.");
  }

  gl.bindBuffer(gl.UNIFORM_BUFFER, buffer);
  gl.bufferData(gl.UNIFORM_BUFFER, byteSize, gl.DYNAMIC_DRAW);
  gl.bindBufferBase(gl.UNIFORM_BUFFER, bindingPoint, buffer);
  return buffer;
}
