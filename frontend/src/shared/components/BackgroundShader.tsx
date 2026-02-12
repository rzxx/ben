import { CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import {
  BackgroundShaderSettings,
  ShaderColorSet,
  useBackgroundShaderStore,
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

const sceneUniformFloatCount = 56;
const sceneUniformBufferSize =
  sceneUniformFloatCount * Float32Array.BYTES_PER_ELEMENT;
const blurUniformFloatCount = 4;
const blurUniformBufferSize = blurUniformFloatCount * Float32Array.BYTES_PER_ELEMENT;
const mipCompositeUniformFloatCount = 4;
const mipCompositeUniformBufferSize =
  mipCompositeUniformFloatCount * Float32Array.BYTES_PER_ELEMENT;
const temporalUniformFloatCount = 4;
const temporalUniformBufferSize =
  temporalUniformFloatCount * Float32Array.BYTES_PER_ELEMENT;
const compositeUniformFloatCount = 4;
const compositeUniformBufferSize =
  compositeUniformFloatCount * Float32Array.BYTES_PER_ELEMENT;

const shaderMaxDpr = 1;
const shaderTargetFrameRate = 30;
const shaderTargetFrameIntervalMs = 1000 / shaderTargetFrameRate;
const maxMipCompositeLevels = 5;

const baseColor: [number, number, number] = [0.03, 0.035, 0.045];

type RenderTarget = {
  texture: GPUTexture;
  view: GPUTextureView;
  width: number;
  height: number;
};

type BlurModule = "none" | "dualKawase" | "mipPyramid";

type CachedBindGroupKeyPart = string | number | object;

export function BackgroundShader() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const webgpuAvailable =
    typeof navigator !== "undefined" && "gpu" in navigator;
  const [isUnsupported, setIsUnsupported] = useState(!webgpuAvailable);

  const fromColors = useBackgroundShaderStore((state) => state.fromColors);
  const toColors = useBackgroundShaderStore((state) => state.toColors);
  const transitionStartedAtMs = useBackgroundShaderStore(
    (state) => state.transitionStartedAtMs,
  );
  const settings = useBackgroundShaderStore((state) => state.settings);
  const grainTextureUrl = useMemo(() => createNoiseTextureDataURL(256), []);

  const fromColorsRef = useRef(fromColors);
  const toColorsRef = useRef(toColors);
  const transitionStartedAtMsRef = useRef(transitionStartedAtMs);
  const settingsRef = useRef(settings);

  useEffect(() => {
    fromColorsRef.current = fromColors;
  }, [fromColors]);

  useEffect(() => {
    toColorsRef.current = toColors;
  }, [toColors]);

  useEffect(() => {
    transitionStartedAtMsRef.current = transitionStartedAtMs;
  }, [transitionStartedAtMs]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !webgpuAvailable) {
      return;
    }

    let animationFrameId = 0;
    let lastRenderAtMs = -shaderTargetFrameIntervalMs;
    let disposed = false;
    let resizeObserver: ResizeObserver | null = null;
    let lastTemporalResetToken = "";

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
      targetConfigKey: "",
      bindGroupCache: new Map<string, GPUBindGroup>(),
      bindGroupResourceIDs: new WeakMap<object, number>(),
      bindGroupResourceIDCounter: 0,
    };

    const writeSceneUniforms = (
      nowMs: number,
      width: number,
      height: number,
    ) => {
      const uniformData = renderState.sceneUniformData;
      const settingsValue = settingsRef.current;

      const safeWidth = Math.max(1, width);
      const safeHeight = Math.max(1, height);
      const seconds = nowMs * 0.001;
      const durationMs = settingsValue.colorTransitionSeconds * 1000;
      const transitionMix =
        durationMs <= 0
          ? 1
          : clamp(
              (nowMs - transitionStartedAtMsRef.current) / durationMs,
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

      writeColorSet(uniformData, 16, fromColorsRef.current);
      writeColorSet(uniformData, 36, toColorsRef.current);

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
      uniformData[0] = settingsValue.temporalStrength * clamp(historyBlendScale, 0, 1);
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
      renderState.targetConfigKey = "";
      clearBindGroupCache();
    };

    const ensureRenderTargets = (width: number, height: number) => {
      const device = renderState.device;
      if (!device) {
        return;
      }

      const settingsValue = settingsRef.current;
      const blurModule = settingsValue.blurMode as BlurModule;
      const needsDualTargets = blurModule === "dualKawase";
      const needsMipTargets = blurModule === "mipPyramid";
      const needsTemporalHistory = settingsValue.temporalEnabled;
      const configKey = buildTargetConfigKey(width, height, settingsValue);
      const hasRequiredTargets =
        renderState.sceneTarget !== null &&
        (!needsMipTargets || renderState.postTarget !== null) &&
        (!needsTemporalHistory ||
          (renderState.historyTargets[0] !== null &&
            renderState.historyTargets[1] !== null));

      if (
        renderState.targetConfigKey === configKey &&
        hasRequiredTargets
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
        ? createRenderTarget(device, width, height, renderState.renderTextureFormat)
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
            createRenderTarget(device, width, height, renderState.renderTextureFormat),
            createRenderTarget(device, width, height, renderState.renderTextureFormat),
          ]
        : [null, null];
      renderState.historyReadIndex = 0;
      renderState.historyValid = false;
      renderState.historyFrameCount = 0;

      renderState.targetConfigKey = configKey;
    };

    const resizeCanvas = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, shaderMaxDpr);
      const renderScale = clamp(settingsRef.current.renderScale, 0.2, 1);

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

    const runDualKawaseBlur = (
      encoder: GPUCommandEncoder,
      settingsValue: BackgroundShaderSettings,
      sceneTarget: RenderTarget,
    ) => {
      const device = renderState.device;
      const sampler = renderState.sampler;
      const dualDownPipeline = renderState.dualDownPipeline;
      const dualUpPipeline = renderState.dualUpPipeline;

      if (!device || !sampler || !dualDownPipeline || !dualUpPipeline) {
        return;
      }

      let sourceTarget = sceneTarget;

      for (let i = 0; i < renderState.dualBlurTargets.length; i += 1) {
        const target = renderState.dualBlurTargets[i];
        const passOffset = settingsValue.blurRadius + settingsValue.blurRadiusStep * i;

        writeBlurUniforms(
          1 / Math.max(1, sourceTarget.width),
          1 / Math.max(1, sourceTarget.height),
          passOffset,
        );

        const bindGroup = getCachedBindGroup(
          [
            "dualDown",
            dualDownPipeline,
            sampler,
            sourceTarget.view,
            renderState.blurUniformBuffer as GPUBuffer,
          ],
          () =>
            device.createBindGroup({
              layout: dualDownPipeline.getBindGroupLayout(0),
              entries: [
                { binding: 0, resource: sampler },
                { binding: 1, resource: sourceTarget.view },
                {
                  binding: 2,
                  resource: { buffer: renderState.blurUniformBuffer as GPUBuffer },
                },
              ],
            }),
        );

        const pass = beginPass(encoder, target.view);
        pass.setPipeline(dualDownPipeline);
        pass.setBindGroup(0, bindGroup);
        pass.draw(3, 1, 0, 0);
        pass.end();

        sourceTarget = target;
      }

      let upSourceTarget = sourceTarget;
      for (let i = renderState.dualBlurTargets.length - 2; i >= 0; i -= 1) {
        const target = renderState.dualBlurTargets[i];
        const passOffset = settingsValue.blurRadius + settingsValue.blurRadiusStep * i;

        writeBlurUniforms(
          1 / Math.max(1, upSourceTarget.width),
          1 / Math.max(1, upSourceTarget.height),
          passOffset,
        );

        const bindGroup = getCachedBindGroup(
          [
            "dualUp",
            dualUpPipeline,
            sampler,
            upSourceTarget.view,
            renderState.blurUniformBuffer as GPUBuffer,
          ],
          () =>
            device.createBindGroup({
              layout: dualUpPipeline.getBindGroupLayout(0),
              entries: [
                { binding: 0, resource: sampler },
                { binding: 1, resource: upSourceTarget.view },
                {
                  binding: 2,
                  resource: { buffer: renderState.blurUniformBuffer as GPUBuffer },
                },
              ],
            }),
        );

        const pass = beginPass(encoder, target.view);
        pass.setPipeline(dualUpPipeline);
        pass.setBindGroup(0, bindGroup);
        pass.draw(3, 1, 0, 0);
        pass.end();

        upSourceTarget = target;
      }

      writeBlurUniforms(
        1 / Math.max(1, upSourceTarget.width),
        1 / Math.max(1, upSourceTarget.height),
        settingsValue.blurRadius,
      );

      const finalBindGroup = getCachedBindGroup(
        [
          "dualUpFinal",
          dualUpPipeline,
          sampler,
          upSourceTarget.view,
          renderState.blurUniformBuffer as GPUBuffer,
        ],
        () =>
          device.createBindGroup({
            layout: dualUpPipeline.getBindGroupLayout(0),
            entries: [
              { binding: 0, resource: sampler },
              { binding: 1, resource: upSourceTarget.view },
              {
                binding: 2,
                resource: { buffer: renderState.blurUniformBuffer as GPUBuffer },
              },
            ],
          }),
      );

      const finalPass = beginPass(encoder, sceneTarget.view);
      finalPass.setPipeline(dualUpPipeline);
      finalPass.setBindGroup(0, finalBindGroup);
      finalPass.draw(3, 1, 0, 0);
      finalPass.end();
    };

    const runMipPyramidBlur = (
      encoder: GPUCommandEncoder,
      settingsValue: BackgroundShaderSettings,
      sceneTarget: RenderTarget,
      destinationTarget: RenderTarget,
    ) => {
      const device = renderState.device;
      const sampler = renderState.sampler;
      const mipDownPipeline = renderState.mipDownPipeline;
      const mipCompositePipeline = renderState.mipCompositePipeline;

      if (!device || !sampler || !mipDownPipeline || !mipCompositePipeline) {
        return;
      }

      let source = sceneTarget;
      for (const target of renderState.mipTargets) {
        writeBlurUniforms(
          1 / Math.max(1, source.width),
          1 / Math.max(1, source.height),
          settingsValue.blurRadius,
        );

        const bindGroup = getCachedBindGroup(
          [
            "mipDown",
            mipDownPipeline,
            sampler,
            source.view,
            renderState.blurUniformBuffer as GPUBuffer,
          ],
          () =>
            device.createBindGroup({
              layout: mipDownPipeline.getBindGroupLayout(0),
              entries: [
                { binding: 0, resource: sampler },
                { binding: 1, resource: source.view },
                {
                  binding: 2,
                  resource: { buffer: renderState.blurUniformBuffer as GPUBuffer },
                },
              ],
            }),
        );

        const pass = beginPass(encoder, target.view);
        pass.setPipeline(mipDownPipeline);
        pass.setBindGroup(0, bindGroup);
        pass.draw(3, 1, 0, 0);
        pass.end();

        source = target;
      }

      const activeMipLevels = Math.min(
        settingsValue.mipLevels,
        renderState.mipTargets.length,
        maxMipCompositeLevels,
      );
      writeMipCompositeUniforms(
        settingsValue.blurRadius,
        settingsValue.mipCurve,
        activeMipLevels,
      );

      const mipViews = resolveMipViews(renderState.mipTargets, sceneTarget.view);
      const compositeBindGroup = getCachedBindGroup(
        [
          "mipComposite",
          mipCompositePipeline,
          sampler,
          sceneTarget.view,
          mipViews[0],
          mipViews[1],
          mipViews[2],
          mipViews[3],
          mipViews[4],
          renderState.mipCompositeUniformBuffer as GPUBuffer,
        ],
        () =>
          device.createBindGroup({
            layout: mipCompositePipeline.getBindGroupLayout(0),
            entries: [
              { binding: 0, resource: sampler },
              { binding: 1, resource: sceneTarget.view },
              { binding: 2, resource: mipViews[0] },
              { binding: 3, resource: mipViews[1] },
              { binding: 4, resource: mipViews[2] },
              { binding: 5, resource: mipViews[3] },
              { binding: 6, resource: mipViews[4] },
              {
                binding: 7,
                resource: {
                  buffer: renderState.mipCompositeUniformBuffer as GPUBuffer,
                },
              },
            ],
          }),
      );

      const pass = beginPass(encoder, destinationTarget.view);
      pass.setPipeline(mipCompositePipeline);
      pass.setBindGroup(0, compositeBindGroup);
      pass.draw(3, 1, 0, 0);
      pass.end();
    };

    const render = (time: number) => {
      if (disposed) {
        return;
      }

      if (time - lastRenderAtMs < shaderTargetFrameIntervalMs) {
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

      const settingsValue = settingsRef.current;
      const sceneTarget = renderState.sceneTarget;
      const postTarget = renderState.postTarget;
      const historyRead = renderState.historyTargets[renderState.historyReadIndex];
      const historyWrite = renderState.historyTargets[1 - renderState.historyReadIndex];
      if (!sceneTarget) {
        animationFrameId = window.requestAnimationFrame(render);
        return;
      }

      writeSceneUniforms(time, canvas.width, canvas.height);
      writeCompositeUniforms(settingsValue.opacity);

      const temporalResetToken = buildTemporalResetToken(
        settingsValue,
        transitionStartedAtMsRef.current,
      );
      if (temporalResetToken !== lastTemporalResetToken) {
        renderState.historyValid = false;
        renderState.historyFrameCount = 0;
        lastTemporalResetToken = temporalResetToken;
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
        runDualKawaseBlur(encoder, settingsValue, sceneTarget);
        outputTarget = sceneTarget;
      }

      if (
        blurModule === "mipPyramid" &&
        postTarget &&
        shouldApplyMipBlur(settingsValue, renderState.mipTargets.length)
      ) {
        runMipPyramidBlur(encoder, settingsValue, sceneTarget, postTarget);
        outputTarget = postTarget;
      }

      if (
        settingsValue.temporalEnabled &&
        renderState.temporalPipeline &&
        historyRead &&
        historyWrite
      ) {
        const temporalPipeline = renderState.temporalPipeline;
        const historySourceView = renderState.historyValid
          ? historyRead.view
          : outputTarget.view;
        const historyBlendScale = renderState.historyValid
          ? clamp(renderState.historyFrameCount / 10, 0, 1)
          : 0;

        writeTemporalUniforms(
          settingsValue,
          renderState.historyValid,
          historyBlendScale,
        );

        const temporalBindGroup = getCachedBindGroup(
          [
            "temporal",
            temporalPipeline,
            sampler,
            outputTarget.view,
            historySourceView,
            renderState.temporalUniformBuffer as GPUBuffer,
          ],
          () =>
            device.createBindGroup({
              layout: temporalPipeline.getBindGroupLayout(0),
              entries: [
                { binding: 0, resource: sampler },
                { binding: 1, resource: outputTarget.view },
                {
                  binding: 2,
                  resource: historySourceView,
                },
                {
                  binding: 3,
                  resource: {
                    buffer: renderState.temporalUniformBuffer as GPUBuffer,
                  },
                },
              ],
            }),
        );

        const temporalPass = beginPass(encoder, historyWrite.view);
        temporalPass.setPipeline(temporalPipeline);
        temporalPass.setBindGroup(0, temporalBindGroup);
        temporalPass.draw(3, 1, 0, 0);
        temporalPass.end();

        outputTarget = historyWrite;
        renderState.historyReadIndex = 1 - renderState.historyReadIndex;
        renderState.historyValid = true;
        renderState.historyFrameCount = Math.min(renderState.historyFrameCount + 1, 120);
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
                resource: { buffer: renderState.compositeUniformBuffer as GPUBuffer },
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

    const shaderHasErrors = async (module: GPUShaderModule) => {
      const compilationInfo = await module.getCompilationInfo();
      return compilationInfo.messages.some((message) => message.type === "error");
    };

    const initialize = async () => {
      try {
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter || disposed) {
          setIsUnsupported(true);
          return;
        }

        const device = await adapter.requestDevice();
        if (disposed) {
          return;
        }

        const context = canvas.getContext("webgpu");
        if (!context) {
          setIsUnsupported(true);
          return;
        }

        const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
        context.configure({
          device,
          format: canvasFormat,
          alphaMode: "premultiplied",
        });

        const sceneModule = device.createShaderModule({ code: backgroundSceneWGSL });
        const dualDownModule = device.createShaderModule({ code: dualKawaseDownWGSL });
        const dualUpModule = device.createShaderModule({ code: dualKawaseUpWGSL });
        const mipDownModule = device.createShaderModule({ code: mipDownsampleWGSL });
        const mipCompositeModule = device.createShaderModule({
          code: mipCompositeWGSL,
        });
        const temporalModule = device.createShaderModule({ code: temporalResolveWGSL });
        const compositeModule = device.createShaderModule({ code: backgroundCompositeWGSL });

        if (
          (await shaderHasErrors(sceneModule)) ||
          (await shaderHasErrors(dualDownModule)) ||
          (await shaderHasErrors(dualUpModule)) ||
          (await shaderHasErrors(mipDownModule)) ||
          (await shaderHasErrors(mipCompositeModule)) ||
          (await shaderHasErrors(temporalModule)) ||
          (await shaderHasErrors(compositeModule))
        ) {
          setIsUnsupported(true);
          return;
        }

        const scenePipeline = await device.createRenderPipelineAsync({
          layout: "auto",
          vertex: { module: sceneModule, entryPoint: "vsMain" },
          fragment: {
            module: sceneModule,
            entryPoint: "fsMain",
            targets: [{ format: canvasFormat }],
          },
          primitive: { topology: "triangle-list" },
        });

        const dualDownPipeline = await device.createRenderPipelineAsync({
          layout: "auto",
          vertex: { module: dualDownModule, entryPoint: "vsMain" },
          fragment: {
            module: dualDownModule,
            entryPoint: "fsMain",
            targets: [{ format: canvasFormat }],
          },
          primitive: { topology: "triangle-list" },
        });

        const dualUpPipeline = await device.createRenderPipelineAsync({
          layout: "auto",
          vertex: { module: dualUpModule, entryPoint: "vsMain" },
          fragment: {
            module: dualUpModule,
            entryPoint: "fsMain",
            targets: [{ format: canvasFormat }],
          },
          primitive: { topology: "triangle-list" },
        });

        const mipDownPipeline = await device.createRenderPipelineAsync({
          layout: "auto",
          vertex: { module: mipDownModule, entryPoint: "vsMain" },
          fragment: {
            module: mipDownModule,
            entryPoint: "fsMain",
            targets: [{ format: canvasFormat }],
          },
          primitive: { topology: "triangle-list" },
        });

        const mipCompositePipeline = await device.createRenderPipelineAsync({
          layout: "auto",
          vertex: { module: mipCompositeModule, entryPoint: "vsMain" },
          fragment: {
            module: mipCompositeModule,
            entryPoint: "fsMain",
            targets: [{ format: canvasFormat }],
          },
          primitive: { topology: "triangle-list" },
        });

        const temporalPipeline = await device.createRenderPipelineAsync({
          layout: "auto",
          vertex: { module: temporalModule, entryPoint: "vsMain" },
          fragment: {
            module: temporalModule,
            entryPoint: "fsMain",
            targets: [{ format: canvasFormat }],
          },
          primitive: { topology: "triangle-list" },
        });

        const compositePipeline = await device.createRenderPipelineAsync({
          layout: "auto",
          vertex: { module: compositeModule, entryPoint: "vsMain" },
          fragment: {
            module: compositeModule,
            entryPoint: "fsMain",
            targets: [{ format: canvasFormat }],
          },
          primitive: { topology: "triangle-list" },
        });

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

        resizeCanvas();
        resizeObserver = new ResizeObserver(() => {
          resizeCanvas();
        });
        resizeObserver.observe(canvas);

        setIsUnsupported(false);
        animationFrameId = window.requestAnimationFrame(render);
      } catch {
        setIsUnsupported(true);
      }
    };

    void initialize();

    return () => {
      disposed = true;
      window.cancelAnimationFrame(animationFrameId);
      resizeObserver?.disconnect();

      destroyRenderTargets();

      renderState.sceneUniformBuffer?.destroy();
      renderState.blurUniformBuffer?.destroy();
      renderState.mipCompositeUniformBuffer?.destroy();
      renderState.temporalUniformBuffer?.destroy();
      renderState.compositeUniformBuffer?.destroy();
      renderState.device?.destroy();
    };
  }, [webgpuAvailable]);

  const fallbackStyle = useMemo(
    () => buildFallbackStyle(toColors, settings.opacity),
    [settings.opacity, toColors],
  );
  const grainStyle = useMemo(
    () => buildGrainStyle(settings, grainTextureUrl),
    [grainTextureUrl, settings],
  );

  return (
    <div
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
      aria-hidden="true"
    >
      <div className="absolute inset-0" style={fallbackStyle} />
      <canvas
        ref={canvasRef}
        className={isUnsupported ? "hidden" : "absolute inset-0 h-full w-full"}
      />
      <div className="absolute inset-0" style={grainStyle} />
    </div>
  );
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

function buildFallbackStyle(colors: ShaderColorSet, opacity: number): CSSProperties {
  const c0 = toCssColor(colors[0], 0.75);
  const c1 = toCssColor(colors[1], 0.7);
  const c2 = toCssColor(colors[2], 0.68);
  const c3 = toCssColor(colors[3], 0.85);
  const c4 = toCssColor(colors[4], 0.64);
  const safeOpacity = clamp(opacity, 0, 1);

  return {
    backgroundColor: "#07090d",
    backgroundImage: `radial-gradient(circle at 16% 20%, ${c0} 0%, transparent 48%), radial-gradient(circle at 84% 26%, ${c1} 0%, transparent 44%), radial-gradient(circle at 24% 88%, ${c2} 0%, transparent 40%), radial-gradient(circle at 58% 62%, ${c4} 0%, transparent 46%), linear-gradient(140deg, ${c3} 0%, #07090d 92%)`,
    opacity: safeOpacity,
  };
}

function buildGrainStyle(
  settings: {
    grainStrength: number;
    grainScale: number;
  },
  grainTextureUrl: string,
): CSSProperties {
  const textureScale = clamp(settings.grainScale, 0.1, 8);
  const grainOpacity = clamp(settings.grainStrength * 4.4, 0, 0.38);
  const grainTileSize = Math.max(32, Math.round(256 / textureScale));

  return {
    opacity: grainOpacity,
    backgroundImage: grainTextureUrl ? `url(${grainTextureUrl})` : "none",
    backgroundRepeat: "repeat",
    backgroundSize: `${grainTileSize}px ${grainTileSize}px`,
    mixBlendMode: "soft-light",
  };
}

function createNoiseTextureDataURL(size: number): string {
  if (typeof document === "undefined") {
    return "";
  }

  const safeSize = Math.max(16, Math.floor(size));
  const canvas = document.createElement("canvas");
  canvas.width = safeSize;
  canvas.height = safeSize;

  const context = canvas.getContext("2d");
  if (!context) {
    return "";
  }

  const imageData = context.createImageData(safeSize, safeSize);
  const values = imageData.data;

  for (let i = 0; i < values.length; i += 4) {
    const grain = 96 + Math.floor(Math.random() * 64);
    values[i] = grain;
    values[i + 1] = grain;
    values[i + 2] = grain;
    values[i + 3] = 255;
  }

  context.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}

function toCssColor(color: [number, number, number], alpha: number): string {
  const r = Math.round(clamp(color[0], 0, 1) * 255);
  const g = Math.round(clamp(color[1], 0, 1) * 255);
  const b = Math.round(clamp(color[2], 0, 1) * 255);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function createRenderTarget(
  device: GPUDevice,
  width: number,
  height: number,
  format: GPUTextureFormat,
): RenderTarget {
  const texture = device.createTexture({
    size: { width, height },
    format,
    usage:
      GPUTextureUsage.RENDER_ATTACHMENT |
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_SRC |
      GPUTextureUsage.COPY_DST,
  });

  return {
    texture,
    view: texture.createView(),
    width,
    height,
  };
}

function buildBlurDimensions(
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

function buildMipDimensions(
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

function buildTargetConfigKey(
  width: number,
  height: number,
  settings: BackgroundShaderSettings,
): string {
  const blurMode = settings.blurMode as BlurModule;
  const parts = [
    `${width}x${height}`,
    `mode:${blurMode}`,
    `temporal:${settings.temporalEnabled ? 1 : 0}`,
  ];

  if (blurMode === "dualKawase") {
    parts.push(`dual:${Math.max(0, Math.round(settings.blurPasses))}`);
    parts.push(`dualDown:${Math.max(1.1, settings.blurDownsample).toFixed(3)}`);
  }

  if (blurMode === "mipPyramid") {
    parts.push(`mip:${Math.max(1, Math.round(settings.mipLevels))}`);
  }

  return parts.join("|");
}

function buildTemporalResetToken(
  settings: BackgroundShaderSettings,
  transitionStartedAtMs: number,
): string {
  return [
    settings.sceneVariant,
    settings.blurMode,
    settings.noiseScale.toFixed(3),
    settings.flowSpeed.toFixed(3),
    settings.warpStrength.toFixed(3),
    settings.detailAmount.toFixed(3),
    settings.detailScale.toFixed(3),
    settings.detailSpeed.toFixed(3),
    settings.colorDrift.toFixed(3),
    settings.lumaAnchor.toFixed(3),
    settings.blurRadius.toFixed(3),
    settings.temporalStrength.toFixed(3),
    settings.temporalResponse.toFixed(3),
    settings.temporalClamp.toFixed(3),
    `${Math.round(transitionStartedAtMs)}`,
  ].join("|");
}

function shouldApplyDualKawase(
  settings: BackgroundShaderSettings,
  blurTargetCount: number,
): boolean {
  return (
    settings.blurRadius > 0.001 &&
    settings.blurPasses > 0 &&
    blurTargetCount > 0
  );
}

function shouldApplyMipBlur(
  settings: BackgroundShaderSettings,
  mipTargetCount: number,
): boolean {
  return settings.blurRadius > 0.001 && settings.mipLevels > 0 && mipTargetCount > 0;
}

function resolveMipViews(
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
    mipTargets.length > 0 ? mipTargets[mipTargets.length - 1].view : fallbackView;
  return [
    mipTargets[0]?.view ?? fallback,
    mipTargets[1]?.view ?? fallback,
    mipTargets[2]?.view ?? fallback,
    mipTargets[3]?.view ?? fallback,
    mipTargets[4]?.view ?? fallback,
  ];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
