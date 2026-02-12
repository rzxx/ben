import {
  BackgroundShaderSettings,
  ShaderColorSet,
} from "../store/backgroundShaderStore";
import {
  backgroundCompositeWGSL,
  backgroundSceneWGSL,
  dualKawaseDownWGSL,
  dualKawaseUpWGSL,
  mipCompositeWGSL,
  mipDownsampleWGSL,
  temporalResolveWGSL,
} from "./backgroundShaderWGSL";
import {
  runDualKawaseBlur,
  runMipPyramidBlur,
} from "./backgroundShaderBlurModules";
import { runTemporalResolve } from "./backgroundShaderTemporalModule";
import {
  BlurModule,
  CachedBindGroupKeyPart,
  RenderTarget,
  TargetConfig,
} from "./backgroundShaderRuntimeTypes";
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

export type BackgroundShaderRendererOptions = {
  canvas: HTMLCanvasElement;
  webgpuAvailable: boolean;
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
  if (!options.webgpuAvailable) {
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
    context: null as GPUCanvasContext | null,
    device: null as GPUDevice | null,
    renderTextureFormat: "" as GPUTextureFormat,
    scenePipeline: null as GPURenderPipeline | null,
    dualDownPipeline: null as GPURenderPipeline | null,
    dualUpPipeline: null as GPURenderPipeline | null,
    mipDownPipeline: null as GPURenderPipeline | null,
    mipCompositePipeline: null as GPURenderPipeline | null,
    temporalPipeline: null as GPURenderPipeline | null,
    compositePipeline: null as GPURenderPipeline | null,
    sceneUniformBuffer: null as GPUBuffer | null,
    blurUniformBuffer: null as GPUBuffer | null,
    mipCompositeUniformBuffer: null as GPUBuffer | null,
    temporalUniformBuffer: null as GPUBuffer | null,
    compositeUniformBuffer: null as GPUBuffer | null,
    sceneBindGroup: null as GPUBindGroup | null,
    sampler: null as GPUSampler | null,
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
    bindGroupCache: new Map<string, GPUBindGroup>(),
    bindGroupResourceIDs: new WeakMap<object, number>(),
    bindGroupResourceIDCounter: 0,
    uncapturedErrorListener: null as
      | ((event: GPUUncapturedErrorEvent) => void)
      | null,
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

    renderState.device?.queue.writeBuffer(
      renderState.sceneUniformBuffer as GPUBuffer,
      0,
      uniformData.buffer,
      uniformData.byteOffset,
      uniformData.byteLength,
    );
  };

  const writeBlurUniforms = (
    invWidth: number,
    invHeight: number,
    offset: number,
  ) => {
    const uniformData = renderState.blurUniformData;
    uniformData[0] = invWidth;
    uniformData[1] = invHeight;
    uniformData[2] = Math.max(0, offset);
    uniformData[3] = 0;

    renderState.device?.queue.writeBuffer(
      renderState.blurUniformBuffer as GPUBuffer,
      0,
      uniformData.buffer,
      uniformData.byteOffset,
      uniformData.byteLength,
    );
  };

  const writeMipCompositeUniforms = (
    radius: number,
    curve: number,
    activeLevels: number,
  ) => {
    const uniformData = renderState.mipCompositeUniformData;
    uniformData[0] = radius;
    uniformData[1] = curve;
    uniformData[2] = activeLevels;
    uniformData[3] = 0;

    renderState.device?.queue.writeBuffer(
      renderState.mipCompositeUniformBuffer as GPUBuffer,
      0,
      uniformData.buffer,
      uniformData.byteOffset,
      uniformData.byteLength,
    );
  };

  const writeTemporalUniforms = (
    settingsValue: BackgroundShaderSettings,
    enabled: boolean,
    historyBlendScale: number,
  ) => {
    const uniformData = renderState.temporalUniformData;
    uniformData[0] =
      settingsValue.temporalStrength * clamp(historyBlendScale, 0, 1);
    uniformData[1] = settingsValue.temporalResponse;
    uniformData[2] = settingsValue.temporalClamp;
    uniformData[3] = enabled ? 1 : 0;

    renderState.device?.queue.writeBuffer(
      renderState.temporalUniformBuffer as GPUBuffer,
      0,
      uniformData.buffer,
      uniformData.byteOffset,
      uniformData.byteLength,
    );
  };

  const writeCompositeUniforms = (opacity: number) => {
    const uniformData = renderState.compositeUniformData;
    uniformData[0] = clamp(opacity, 0, 1);
    uniformData[1] = baseColor[0];
    uniformData[2] = baseColor[1];
    uniformData[3] = baseColor[2];

    renderState.device?.queue.writeBuffer(
      renderState.compositeUniformBuffer as GPUBuffer,
      0,
      uniformData.buffer,
      uniformData.byteOffset,
      uniformData.byteLength,
    );
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

  const clearBindGroupCache = () => {
    renderState.bindGroupCache.clear();
    renderState.bindGroupResourceIDs = new WeakMap<object, number>();
    renderState.bindGroupResourceIDCounter = 0;
  };

  const getBindGroupResourceID = (value: object): number => {
    const existing = renderState.bindGroupResourceIDs.get(value);
    if (existing !== undefined) {
      return existing;
    }

    renderState.bindGroupResourceIDCounter += 1;
    const nextID = renderState.bindGroupResourceIDCounter;
    renderState.bindGroupResourceIDs.set(value, nextID);
    return nextID;
  };

  const buildCachedBindGroupKey = (
    keyParts: CachedBindGroupKeyPart[],
  ): string =>
    keyParts
      .map((part) => {
        if (typeof part === "string" || typeof part === "number") {
          return String(part);
        }
        return `o${getBindGroupResourceID(part)}`;
      })
      .join("|");

  const getCachedBindGroup = (
    keyParts: CachedBindGroupKeyPart[],
    factory: () => GPUBindGroup,
  ): GPUBindGroup => {
    const cacheKey = buildCachedBindGroupKey(keyParts);
    const cached = renderState.bindGroupCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const created = factory();
    renderState.bindGroupCache.set(cacheKey, created);
    return created;
  };

  const destroyRenderTargets = () => {
    renderState.sceneTarget?.texture.destroy();
    renderState.sceneTarget = null;

    renderState.postTarget?.texture.destroy();
    renderState.postTarget = null;

    for (const target of renderState.dualBlurTargets) {
      target.texture.destroy();
    }
    renderState.dualBlurTargets = [];

    for (const target of renderState.mipTargets) {
      target.texture.destroy();
    }
    renderState.mipTargets = [];

    renderState.historyTargets[0]?.texture.destroy();
    renderState.historyTargets[1]?.texture.destroy();
    renderState.historyTargets = [null, null];

    renderState.historyReadIndex = 0;
    renderState.historyValid = false;
    renderState.historyFrameCount = 0;
    renderState.targetConfig = null;
    clearBindGroupCache();
  };

  const resetGpuState = (destroyDevice: boolean) => {
    destroyRenderTargets();

    renderState.sceneUniformBuffer?.destroy();
    renderState.blurUniformBuffer?.destroy();
    renderState.mipCompositeUniformBuffer?.destroy();
    renderState.temporalUniformBuffer?.destroy();
    renderState.compositeUniformBuffer?.destroy();

    if (renderState.device && renderState.uncapturedErrorListener) {
      renderState.device.removeEventListener(
        "uncapturederror",
        renderState.uncapturedErrorListener,
      );
      renderState.uncapturedErrorListener = null;
    }

    if (destroyDevice) {
      renderState.device?.destroy();
    }

    renderState.context = null;
    renderState.device = null;
    renderState.renderTextureFormat = "" as GPUTextureFormat;
    renderState.scenePipeline = null;
    renderState.dualDownPipeline = null;
    renderState.dualUpPipeline = null;
    renderState.mipDownPipeline = null;
    renderState.mipCompositePipeline = null;
    renderState.temporalPipeline = null;
    renderState.compositePipeline = null;
    renderState.sceneUniformBuffer = null;
    renderState.blurUniformBuffer = null;
    renderState.mipCompositeUniformBuffer = null;
    renderState.temporalUniformBuffer = null;
    renderState.compositeUniformBuffer = null;
    renderState.sceneBindGroup = null;
    renderState.sampler = null;
    clearBindGroupCache();
  };

  const ensureRenderTargets = (width: number, height: number) => {
    const device = renderState.device;
    if (!device) {
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

    renderState.sceneTarget = createRenderTarget(
      device,
      width,
      height,
      renderState.renderTextureFormat,
    );

    renderState.postTarget = needsMipTargets
      ? createRenderTarget(
          device,
          width,
          height,
          renderState.renderTextureFormat,
        )
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
          createRenderTarget(
            device,
            targetWidth,
            targetHeight,
            renderState.renderTextureFormat,
          ),
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
          createRenderTarget(
            device,
            targetWidth,
            targetHeight,
            renderState.renderTextureFormat,
          ),
      );
    }

    renderState.historyTargets = needsTemporalHistory
      ? [
          createRenderTarget(
            device,
            width,
            height,
            renderState.renderTextureFormat,
          ),
          createRenderTarget(
            device,
            width,
            height,
            renderState.renderTextureFormat,
          ),
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

  const beginPass = (encoder: GPUCommandEncoder, view: GPUTextureView) =>
    encoder.beginRenderPass({
      colorAttachments: [
        {
          view,
          loadOp: "clear",
          storeOp: "store",
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        },
      ],
    });

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
      context,
      device,
      scenePipeline,
      sceneBindGroup,
      compositePipeline,
      sampler,
    } = renderState;

    if (
      !context ||
      !device ||
      !scenePipeline ||
      !sceneBindGroup ||
      !compositePipeline ||
      !sampler
    ) {
      animationFrameId = window.requestAnimationFrame(render);
      return;
    }

    resizeCanvas();
    ensureRenderTargets(canvas.width, canvas.height);

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

    const encoder = device.createCommandEncoder();

    const scenePass = beginPass(encoder, sceneTarget.view);
    scenePass.setPipeline(scenePipeline);
    scenePass.setBindGroup(0, sceneBindGroup);
    scenePass.draw(3, 1, 0, 0);
    scenePass.end();

    let outputTarget = sceneTarget;
    const blurModule = settingsValue.blurMode as BlurModule;

    if (
      blurModule === "dualKawase" &&
      shouldApplyDualKawase(settingsValue, renderState.dualBlurTargets.length)
    ) {
      const dualDownPipeline = renderState.dualDownPipeline;
      const dualUpPipeline = renderState.dualUpPipeline;
      const blurUniformBuffer = renderState.blurUniformBuffer;
      if (dualDownPipeline && dualUpPipeline && blurUniformBuffer) {
        runDualKawaseBlur({
          encoder,
          settings: settingsValue,
          sceneTarget,
          blurTargets: renderState.dualBlurTargets,
          sampler,
          device,
          downPipeline: dualDownPipeline,
          upPipeline: dualUpPipeline,
          blurUniformBuffer,
          writeBlurUniforms,
          beginPass,
          getCachedBindGroup,
        });
      }
      outputTarget = sceneTarget;
    }

    if (
      blurModule === "mipPyramid" &&
      postTarget &&
      shouldApplyMipBlur(settingsValue, renderState.mipTargets.length)
    ) {
      const mipDownPipeline = renderState.mipDownPipeline;
      const mipCompositePipeline = renderState.mipCompositePipeline;
      const blurUniformBuffer = renderState.blurUniformBuffer;
      const mipCompositeUniformBuffer = renderState.mipCompositeUniformBuffer;
      if (
        mipDownPipeline &&
        mipCompositePipeline &&
        blurUniformBuffer &&
        mipCompositeUniformBuffer
      ) {
        runMipPyramidBlur({
          encoder,
          settings: settingsValue,
          sceneTarget,
          destinationTarget: postTarget,
          mipTargets: renderState.mipTargets,
          sampler,
          device,
          downPipeline: mipDownPipeline,
          compositePipeline: mipCompositePipeline,
          blurUniformBuffer,
          mipCompositeUniformBuffer,
          maxMipCompositeLevels,
          writeBlurUniforms,
          writeMipCompositeUniforms,
          beginPass,
          getCachedBindGroup,
        });
      }
      outputTarget = postTarget;
    }

    if (
      settingsValue.temporalEnabled &&
      renderState.temporalPipeline &&
      renderState.temporalUniformBuffer
    ) {
      const temporalResult = runTemporalResolve({
        encoder,
        settings: settingsValue,
        outputTarget,
        historyTargets: renderState.historyTargets,
        temporalPipeline: renderState.temporalPipeline,
        sampler,
        device,
        temporalUniformBuffer: renderState.temporalUniformBuffer,
        temporalState: {
          historyReadIndex: renderState.historyReadIndex,
          historyValid: renderState.historyValid,
          historyFrameCount: renderState.historyFrameCount,
        },
        writeTemporalUniforms,
        beginPass,
        getCachedBindGroup,
      });

      outputTarget = temporalResult.outputTarget;
      renderState.historyReadIndex =
        temporalResult.temporalState.historyReadIndex;
      renderState.historyValid = temporalResult.temporalState.historyValid;
      renderState.historyFrameCount =
        temporalResult.temporalState.historyFrameCount;
    } else {
      renderState.historyValid = false;
      renderState.historyFrameCount = 0;
    }

    const canvasTextureView = context.getCurrentTexture().createView();
    const compositeBindGroup = getCachedBindGroup(
      [
        "composite",
        compositePipeline,
        sampler,
        outputTarget.view,
        renderState.compositeUniformBuffer as GPUBuffer,
      ],
      () =>
        device.createBindGroup({
          layout: compositePipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: sampler },
            { binding: 1, resource: outputTarget.view },
            {
              binding: 2,
              resource: {
                buffer: renderState.compositeUniformBuffer as GPUBuffer,
              },
            },
          ],
        }),
    );

    const compositePass = beginPass(encoder, canvasTextureView);
    compositePass.setPipeline(compositePipeline);
    compositePass.setBindGroup(0, compositeBindGroup);
    compositePass.draw(3, 1, 0, 0);
    compositePass.end();

    device.queue.submit([encoder.finish()]);
    animationFrameId = window.requestAnimationFrame(render);
  };

  const collectShaderErrors = async (
    label: string,
    module: GPUShaderModule,
  ): Promise<string[]> => {
    const compilationInfo = await module.getCompilationInfo();
    return compilationInfo.messages
      .filter((message) => message.type === "error")
      .map((message) => `${label}: ${message.message}`);
  };

  const initialize = async () => {
    let pendingDevice: GPUDevice | null = null;
    let pendingUncapturedErrorListener:
      | ((event: GPUUncapturedErrorEvent) => void)
      | null = null;

    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter || disposed) {
        setUnsupported(true);
        reportDiagnostic("WebGPU adapter is unavailable.");
        return;
      }

      const device = await adapter.requestDevice();
      pendingDevice = device;
      if (disposed) {
        device.destroy();
        return;
      }

      const uncapturedErrorListener = (event: GPUUncapturedErrorEvent) => {
        const message = event.error?.message ?? "Unknown GPU error";
        reportDiagnostic(`WebGPU uncaptured error: ${message}`);
      };
      device.addEventListener("uncapturederror", uncapturedErrorListener);
      pendingUncapturedErrorListener = uncapturedErrorListener;

      device.lost
        .then((lostInfo) => {
          if (disposed) {
            return;
          }

          reportDiagnostic(
            `WebGPU device lost (${lostInfo.reason}): ${lostInfo.message || "unknown reason"}`,
          );
          resetGpuState(false);
          void startInitialize();
        })
        .catch((error) => {
          if (disposed) {
            return;
          }
          const message =
            error instanceof Error ? error.message : String(error);
          reportDiagnostic(`WebGPU device loss handler failed: ${message}`);
          setUnsupported(true);
        });

      const context = canvas.getContext("webgpu");
      if (!context) {
        device.removeEventListener("uncapturederror", uncapturedErrorListener);
        device.destroy();
        pendingDevice = null;
        pendingUncapturedErrorListener = null;
        setUnsupported(true);
        reportDiagnostic("Failed to create WebGPU canvas context.");
        return;
      }

      const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
      context.configure({
        device,
        format: canvasFormat,
        alphaMode: "premultiplied",
      });

      const sceneModule = device.createShaderModule({
        code: backgroundSceneWGSL,
      });
      const dualDownModule = device.createShaderModule({
        code: dualKawaseDownWGSL,
      });
      const dualUpModule = device.createShaderModule({
        code: dualKawaseUpWGSL,
      });
      const mipDownModule = device.createShaderModule({
        code: mipDownsampleWGSL,
      });
      const mipCompositeModule = device.createShaderModule({
        code: mipCompositeWGSL,
      });
      const temporalModule = device.createShaderModule({
        code: temporalResolveWGSL,
      });
      const compositeModule = device.createShaderModule({
        code: backgroundCompositeWGSL,
      });

      const shaderErrors = (
        await Promise.all([
          collectShaderErrors("scene", sceneModule),
          collectShaderErrors("dualDown", dualDownModule),
          collectShaderErrors("dualUp", dualUpModule),
          collectShaderErrors("mipDown", mipDownModule),
          collectShaderErrors("mipComposite", mipCompositeModule),
          collectShaderErrors("temporal", temporalModule),
          collectShaderErrors("composite", compositeModule),
        ])
      ).flat();

      if (shaderErrors.length > 0) {
        const preview = shaderErrors.slice(0, 4).join(" | ");
        reportDiagnostic(`Shader compilation failed: ${preview}`);
        device.removeEventListener("uncapturederror", uncapturedErrorListener);
        device.destroy();
        pendingDevice = null;
        pendingUncapturedErrorListener = null;
        setUnsupported(true);
        return;
      }

      const [
        scenePipeline,
        dualDownPipeline,
        dualUpPipeline,
        mipDownPipeline,
        mipCompositePipeline,
        temporalPipeline,
        compositePipeline,
      ] = await Promise.all([
        device.createRenderPipelineAsync({
          layout: "auto",
          vertex: { module: sceneModule, entryPoint: "vsMain" },
          fragment: {
            module: sceneModule,
            entryPoint: "fsMain",
            targets: [{ format: canvasFormat }],
          },
          primitive: { topology: "triangle-list" },
        }),
        device.createRenderPipelineAsync({
          layout: "auto",
          vertex: { module: dualDownModule, entryPoint: "vsMain" },
          fragment: {
            module: dualDownModule,
            entryPoint: "fsMain",
            targets: [{ format: canvasFormat }],
          },
          primitive: { topology: "triangle-list" },
        }),
        device.createRenderPipelineAsync({
          layout: "auto",
          vertex: { module: dualUpModule, entryPoint: "vsMain" },
          fragment: {
            module: dualUpModule,
            entryPoint: "fsMain",
            targets: [{ format: canvasFormat }],
          },
          primitive: { topology: "triangle-list" },
        }),
        device.createRenderPipelineAsync({
          layout: "auto",
          vertex: { module: mipDownModule, entryPoint: "vsMain" },
          fragment: {
            module: mipDownModule,
            entryPoint: "fsMain",
            targets: [{ format: canvasFormat }],
          },
          primitive: { topology: "triangle-list" },
        }),
        device.createRenderPipelineAsync({
          layout: "auto",
          vertex: { module: mipCompositeModule, entryPoint: "vsMain" },
          fragment: {
            module: mipCompositeModule,
            entryPoint: "fsMain",
            targets: [{ format: canvasFormat }],
          },
          primitive: { topology: "triangle-list" },
        }),
        device.createRenderPipelineAsync({
          layout: "auto",
          vertex: { module: temporalModule, entryPoint: "vsMain" },
          fragment: {
            module: temporalModule,
            entryPoint: "fsMain",
            targets: [{ format: canvasFormat }],
          },
          primitive: { topology: "triangle-list" },
        }),
        device.createRenderPipelineAsync({
          layout: "auto",
          vertex: { module: compositeModule, entryPoint: "vsMain" },
          fragment: {
            module: compositeModule,
            entryPoint: "fsMain",
            targets: [{ format: canvasFormat }],
          },
          primitive: { topology: "triangle-list" },
        }),
      ]);

      const sceneUniformBuffer = device.createBuffer({
        size: sceneUniformBufferSize,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      const blurUniformBuffer = device.createBuffer({
        size: blurUniformBufferSize,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      const mipCompositeUniformBuffer = device.createBuffer({
        size: mipCompositeUniformBufferSize,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      const temporalUniformBuffer = device.createBuffer({
        size: temporalUniformBufferSize,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      const compositeUniformBuffer = device.createBuffer({
        size: compositeUniformBufferSize,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });

      const sceneBindGroup = device.createBindGroup({
        layout: scenePipeline.getBindGroupLayout(0),
        entries: [
          {
            binding: 0,
            resource: { buffer: sceneUniformBuffer },
          },
        ],
      });

      const sampler = device.createSampler({
        magFilter: "linear",
        minFilter: "linear",
        mipmapFilter: "linear",
        addressModeU: "clamp-to-edge",
        addressModeV: "clamp-to-edge",
      });

      resetGpuState(false);

      renderState.context = context;
      renderState.device = device;
      renderState.renderTextureFormat = canvasFormat;
      renderState.scenePipeline = scenePipeline;
      renderState.dualDownPipeline = dualDownPipeline;
      renderState.dualUpPipeline = dualUpPipeline;
      renderState.mipDownPipeline = mipDownPipeline;
      renderState.mipCompositePipeline = mipCompositePipeline;
      renderState.temporalPipeline = temporalPipeline;
      renderState.compositePipeline = compositePipeline;
      renderState.sceneUniformBuffer = sceneUniformBuffer;
      renderState.blurUniformBuffer = blurUniformBuffer;
      renderState.mipCompositeUniformBuffer = mipCompositeUniformBuffer;
      renderState.temporalUniformBuffer = temporalUniformBuffer;
      renderState.compositeUniformBuffer = compositeUniformBuffer;
      renderState.sceneBindGroup = sceneBindGroup;
      renderState.sampler = sampler;
      renderState.uncapturedErrorListener = uncapturedErrorListener;
      pendingDevice = null;
      pendingUncapturedErrorListener = null;

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
      if (pendingDevice) {
        if (pendingUncapturedErrorListener) {
          pendingDevice.removeEventListener(
            "uncapturederror",
            pendingUncapturedErrorListener,
          );
        }
        pendingDevice.destroy();
      }
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

  void startInitialize();

  return {
    dispose: () => {
      disposed = true;
      hasRenderLoopStarted = false;
      window.cancelAnimationFrame(animationFrameId);
      resizeObserver?.disconnect();
      resetGpuState(true);
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
