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
} from "./backgroundShaderWGSL";

const sceneUniformFloatCount = 56;
const sceneUniformBufferSize =
  sceneUniformFloatCount * Float32Array.BYTES_PER_ELEMENT;
const blurUniformFloatCount = 4;
const blurUniformBufferSize =
  blurUniformFloatCount * Float32Array.BYTES_PER_ELEMENT;
const compositeUniformFloatCount = 4;
const compositeUniformBufferSize =
  compositeUniformFloatCount * Float32Array.BYTES_PER_ELEMENT;

const shaderMaxDpr = 1;
const shaderTargetFrameRate = 30;
const shaderTargetFrameIntervalMs = 1000 / shaderTargetFrameRate;

const baseColor: [number, number, number] = [0.03, 0.035, 0.045];

type RenderTarget = {
  texture: GPUTexture;
  view: GPUTextureView;
  width: number;
  height: number;
};

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
    if (!canvas) {
      return;
    }

    if (!webgpuAvailable) {
      return;
    }

    let animationFrameId = 0;
    let lastRenderAtMs = -shaderTargetFrameIntervalMs;
    let disposed = false;
    let resizeObserver: ResizeObserver | null = null;

    const renderState = {
      context: null as GPUCanvasContext | null,
      device: null as GPUDevice | null,
      renderTextureFormat: "" as GPUTextureFormat,
      scenePipeline: null as GPURenderPipeline | null,
      dualDownPipeline: null as GPURenderPipeline | null,
      dualUpPipeline: null as GPURenderPipeline | null,
      compositePipeline: null as GPURenderPipeline | null,
      sceneUniformBuffer: null as GPUBuffer | null,
      blurUniformBuffer: null as GPUBuffer | null,
      compositeUniformBuffer: null as GPUBuffer | null,
      sceneBindGroup: null as GPUBindGroup | null,
      sampler: null as GPUSampler | null,
      sceneUniformData: new Float32Array(sceneUniformFloatCount),
      blurUniformData: new Float32Array(blurUniformFloatCount),
      compositeUniformData: new Float32Array(compositeUniformFloatCount),
      sceneTarget: null as RenderTarget | null,
      blurTargets: [] as RenderTarget[],
      blurConfigKey: "",
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
      uniformData[9] = 0;
      uniformData[10] = 0;
      uniformData[11] = 0;

      uniformData[12] = 0;
      uniformData[13] = 0;
      uniformData[14] = 0;
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

    const destroyRenderTargets = () => {
      renderState.sceneTarget?.texture.destroy();
      renderState.sceneTarget = null;

      for (const target of renderState.blurTargets) {
        target.texture.destroy();
      }

      renderState.blurTargets = [];
      renderState.blurConfigKey = "";
    };

    const ensureRenderTargets = (width: number, height: number) => {
      const device = renderState.device;
      if (!device) {
        return;
      }

      const settingsValue = settingsRef.current;
      const configKey = buildBlurConfigKey(
        width,
        height,
        settingsValue.blurPasses,
        settingsValue.blurDownsample,
      );

      if (renderState.blurConfigKey === configKey && renderState.sceneTarget) {
        return;
      }

      destroyRenderTargets();

      renderState.sceneTarget = createRenderTarget(
        device,
        width,
        height,
        renderState.renderTextureFormat,
      );

      const blurDimensions = buildBlurDimensions(
        width,
        height,
        settingsValue.blurPasses,
        settingsValue.blurDownsample,
      );

      renderState.blurTargets = blurDimensions.map(
        ({ width: targetWidth, height: targetHeight }) =>
          createRenderTarget(
            device,
            targetWidth,
            targetHeight,
            renderState.renderTextureFormat,
          ),
      );

      renderState.blurConfigKey = configKey;
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
        dualDownPipeline,
        dualUpPipeline,
        compositePipeline,
        sceneBindGroup,
        sampler,
      } = renderState;

      if (
        !context ||
        !device ||
        !scenePipeline ||
        !dualDownPipeline ||
        !dualUpPipeline ||
        !compositePipeline ||
        !sceneBindGroup ||
        !sampler
      ) {
        animationFrameId = window.requestAnimationFrame(render);
        return;
      }

      resizeCanvas();
      writeSceneUniforms(time, canvas.width, canvas.height);
      writeCompositeUniforms(settingsRef.current.opacity);
      ensureRenderTargets(canvas.width, canvas.height);

      const sceneTarget = renderState.sceneTarget;
      if (!sceneTarget) {
        animationFrameId = window.requestAnimationFrame(render);
        return;
      }

      const encoder = device.createCommandEncoder();

      const scenePass = beginPass(encoder, sceneTarget.view);
      scenePass.setPipeline(scenePipeline);
      scenePass.setBindGroup(0, sceneBindGroup);
      scenePass.draw(3, 1, 0, 0);
      scenePass.end();

      const settingsValue = settingsRef.current;
      if (
        shouldApplyDualKawase(settingsValue, renderState.blurTargets.length)
      ) {
        let sourceTarget = sceneTarget;

        for (let i = 0; i < renderState.blurTargets.length; i += 1) {
          const target = renderState.blurTargets[i];
          const passOffset =
            settingsValue.blurRadius + settingsValue.blurRadiusStep * i;

          writeBlurUniforms(
            1 / Math.max(1, sourceTarget.width),
            1 / Math.max(1, sourceTarget.height),
            passOffset,
          );

          const bindGroup = device.createBindGroup({
            layout: dualDownPipeline.getBindGroupLayout(0),
            entries: [
              { binding: 0, resource: sampler },
              { binding: 1, resource: sourceTarget.view },
              {
                binding: 2,
                resource: {
                  buffer: renderState.blurUniformBuffer as GPUBuffer,
                },
              },
            ],
          });

          const downPass = beginPass(encoder, target.view);
          downPass.setPipeline(dualDownPipeline);
          downPass.setBindGroup(0, bindGroup);
          downPass.draw(3, 1, 0, 0);
          downPass.end();

          sourceTarget = target;
        }

        let upSourceTarget = sourceTarget;

        for (let i = renderState.blurTargets.length - 2; i >= 0; i -= 1) {
          const target = renderState.blurTargets[i];
          const passOffset =
            settingsValue.blurRadius + settingsValue.blurRadiusStep * i;

          writeBlurUniforms(
            1 / Math.max(1, upSourceTarget.width),
            1 / Math.max(1, upSourceTarget.height),
            passOffset,
          );

          const bindGroup = device.createBindGroup({
            layout: dualUpPipeline.getBindGroupLayout(0),
            entries: [
              { binding: 0, resource: sampler },
              { binding: 1, resource: upSourceTarget.view },
              {
                binding: 2,
                resource: {
                  buffer: renderState.blurUniformBuffer as GPUBuffer,
                },
              },
            ],
          });

          const upPass = beginPass(encoder, target.view);
          upPass.setPipeline(dualUpPipeline);
          upPass.setBindGroup(0, bindGroup);
          upPass.draw(3, 1, 0, 0);
          upPass.end();

          upSourceTarget = target;
        }

        writeBlurUniforms(
          1 / Math.max(1, upSourceTarget.width),
          1 / Math.max(1, upSourceTarget.height),
          settingsValue.blurRadius,
        );

        const finalUpBindGroup = device.createBindGroup({
          layout: dualUpPipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: sampler },
            { binding: 1, resource: upSourceTarget.view },
            {
              binding: 2,
              resource: { buffer: renderState.blurUniformBuffer as GPUBuffer },
            },
          ],
        });

        const finalUpPass = beginPass(encoder, sceneTarget.view);
        finalUpPass.setPipeline(dualUpPipeline);
        finalUpPass.setBindGroup(0, finalUpBindGroup);
        finalUpPass.draw(3, 1, 0, 0);
        finalUpPass.end();
      }

      const canvasTextureView = context.getCurrentTexture().createView();
      const compositeBindGroup = device.createBindGroup({
        layout: compositePipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: sampler },
          { binding: 1, resource: sceneTarget.view },
          {
            binding: 2,
            resource: {
              buffer: renderState.compositeUniformBuffer as GPUBuffer,
            },
          },
        ],
      });

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
      return compilationInfo.messages.some(
        (message) => message.type === "error",
      );
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

        const sceneModule = device.createShaderModule({
          code: backgroundSceneWGSL,
        });
        const dualDownModule = device.createShaderModule({
          code: dualKawaseDownWGSL,
        });
        const dualUpModule = device.createShaderModule({
          code: dualKawaseUpWGSL,
        });
        const compositeModule = device.createShaderModule({
          code: backgroundCompositeWGSL,
        });

        if (
          (await shaderHasErrors(sceneModule)) ||
          (await shaderHasErrors(dualDownModule)) ||
          (await shaderHasErrors(dualUpModule)) ||
          (await shaderHasErrors(compositeModule))
        ) {
          setIsUnsupported(true);
          return;
        }

        const scenePipeline = await device.createRenderPipelineAsync({
          layout: "auto",
          vertex: {
            module: sceneModule,
            entryPoint: "vsMain",
          },
          fragment: {
            module: sceneModule,
            entryPoint: "fsMain",
            targets: [{ format: canvasFormat }],
          },
          primitive: {
            topology: "triangle-list",
          },
        });

        const dualDownPipeline = await device.createRenderPipelineAsync({
          layout: "auto",
          vertex: {
            module: dualDownModule,
            entryPoint: "vsMain",
          },
          fragment: {
            module: dualDownModule,
            entryPoint: "fsMain",
            targets: [{ format: canvasFormat }],
          },
          primitive: {
            topology: "triangle-list",
          },
        });

        const dualUpPipeline = await device.createRenderPipelineAsync({
          layout: "auto",
          vertex: {
            module: dualUpModule,
            entryPoint: "vsMain",
          },
          fragment: {
            module: dualUpModule,
            entryPoint: "fsMain",
            targets: [{ format: canvasFormat }],
          },
          primitive: {
            topology: "triangle-list",
          },
        });

        const compositePipeline = await device.createRenderPipelineAsync({
          layout: "auto",
          vertex: {
            module: compositeModule,
            entryPoint: "vsMain",
          },
          fragment: {
            module: compositeModule,
            entryPoint: "fsMain",
            targets: [{ format: canvasFormat }],
          },
          primitive: {
            topology: "triangle-list",
          },
        });

        const sceneUniformBuffer = device.createBuffer({
          size: sceneUniformBufferSize,
          usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        const blurUniformBuffer = device.createBuffer({
          size: blurUniformBufferSize,
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
              resource: {
                buffer: sceneUniformBuffer,
              },
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
        renderState.compositePipeline = compositePipeline;
        renderState.sceneUniformBuffer = sceneUniformBuffer;
        renderState.blurUniformBuffer = blurUniformBuffer;
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

function buildFallbackStyle(
  colors: ShaderColorSet,
  opacity: number,
): CSSProperties {
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
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
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

function buildBlurConfigKey(
  width: number,
  height: number,
  passCount: number,
  downsample: number,
): string {
  return `${width}x${height}:${Math.max(0, Math.round(passCount))}:${Math.max(
    1.1,
    downsample,
  ).toFixed(3)}`;
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
