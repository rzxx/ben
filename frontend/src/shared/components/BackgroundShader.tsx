import { CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import {
  ShaderColorSet,
  useBackgroundShaderStore,
} from "../store/backgroundShaderStore";
import { backgroundShaderWGSL } from "./backgroundShaderWGSL";

const uniformFloatCount = 48;
const uniformBufferSize = uniformFloatCount * Float32Array.BYTES_PER_ELEMENT;

export function BackgroundShader() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const webgpuAvailable = typeof navigator !== "undefined" && "gpu" in navigator;
  const [isUnsupported, setIsUnsupported] = useState(!webgpuAvailable);

  const fromColors = useBackgroundShaderStore((state) => state.fromColors);
  const toColors = useBackgroundShaderStore((state) => state.toColors);
  const transitionStartedAtMs = useBackgroundShaderStore(
    (state) => state.transitionStartedAtMs,
  );
  const settings = useBackgroundShaderStore((state) => state.settings);

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
    let disposed = false;
    let resizeObserver: ResizeObserver | null = null;

    const renderState = {
      context: null as GPUCanvasContext | null,
      device: null as GPUDevice | null,
      pipeline: null as GPURenderPipeline | null,
      bindGroup: null as GPUBindGroup | null,
      uniformBuffer: null as GPUBuffer | null,
      uniformData: new Float32Array(uniformFloatCount),
    };

    const writeUniforms = (nowMs: number, width: number, height: number) => {
      const uniformData = renderState.uniformData;
      const settingsValue = settingsRef.current;

      const safeWidth = Math.max(1, width);
      const safeHeight = Math.max(1, height);
      const seconds = nowMs * 0.001;
      const durationMs = settingsValue.colorTransitionSeconds * 1000;
      const transitionMix =
        durationMs <= 0
          ? 1
          : clamp((nowMs - transitionStartedAtMsRef.current) / durationMs, 0, 1);

      uniformData[0] = safeWidth;
      uniformData[1] = safeHeight;
      uniformData[2] = 1 / safeWidth;
      uniformData[3] = 1 / safeHeight;

      uniformData[4] = seconds;
      uniformData[5] = settingsValue.opacity;
      uniformData[6] = settingsValue.noiseScale;
      uniformData[7] = settingsValue.flowSpeed;

      uniformData[8] = settingsValue.warpStrength;
      uniformData[9] = settingsValue.blurRadius;
      uniformData[10] = settingsValue.grainStrength;
      uniformData[11] = settingsValue.grainScale;

      uniformData[12] = settingsValue.grainSpeed;
      uniformData[13] = transitionMix;
      uniformData[14] = 0;
      uniformData[15] = 0;

      writeColorSet(uniformData, 16, fromColorsRef.current);
      writeColorSet(uniformData, 32, toColorsRef.current);

      renderState.device?.queue.writeBuffer(
        renderState.uniformBuffer as GPUBuffer,
        0,
        uniformData.buffer,
        uniformData.byteOffset,
        uniformData.byteLength,
      );
    };

    const resizeCanvas = () => {
      const dpr = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const height = Math.max(1, Math.round(canvas.clientHeight * dpr));

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
    };

    const render = (time: number) => {
      if (disposed) {
        return;
      }

      const { context, device, pipeline, bindGroup } = renderState;
      if (!context || !device || !pipeline || !bindGroup) {
        animationFrameId = window.requestAnimationFrame(render);
        return;
      }

      resizeCanvas();
      writeUniforms(time, canvas.width, canvas.height);

      const encoder = device.createCommandEncoder();
      const textureView = context.getCurrentTexture().createView();

      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: textureView,
            loadOp: "clear",
            storeOp: "store",
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
          },
        ],
      });

      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.draw(3, 1, 0, 0);
      pass.end();

      device.queue.submit([encoder.finish()]);
      animationFrameId = window.requestAnimationFrame(render);
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

        const format = navigator.gpu.getPreferredCanvasFormat();
        context.configure({
          device,
          format,
          alphaMode: "premultiplied",
        });

        const module = device.createShaderModule({
          code: backgroundShaderWGSL,
        });

        const compilationInfo = await module.getCompilationInfo();
        const shaderHasErrors = compilationInfo.messages.some(
          (message) => message.type === "error",
        );
        if (shaderHasErrors) {
          setIsUnsupported(true);
          return;
        }

        const pipeline = await device.createRenderPipelineAsync({
          layout: "auto",
          vertex: {
            module,
            entryPoint: "vsMain",
          },
          fragment: {
            module,
            entryPoint: "fsMain",
            targets: [{ format }],
          },
          primitive: {
            topology: "triangle-list",
          },
        });

        const uniformBuffer = device.createBuffer({
          size: uniformBufferSize,
          usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        const bindGroup = device.createBindGroup({
          layout: pipeline.getBindGroupLayout(0),
          entries: [
            {
              binding: 0,
              resource: {
                buffer: uniformBuffer,
              },
            },
          ],
        });

        renderState.context = context;
        renderState.device = device;
        renderState.pipeline = pipeline;
        renderState.bindGroup = bindGroup;
        renderState.uniformBuffer = uniformBuffer;

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
      renderState.uniformBuffer?.destroy();
      renderState.device?.destroy();
    };
  }, [webgpuAvailable]);

  const fallbackStyle = useMemo(
    () => buildFallbackStyle(toColors, settings.opacity),
    [settings.opacity, toColors],
  );

  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden="true">
      <div className="absolute inset-0" style={fallbackStyle} />
      <canvas
        ref={canvasRef}
        className={isUnsupported ? "hidden" : "absolute inset-0 h-full w-full"}
      />
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
  const safeOpacity = clamp(opacity, 0, 1);

  return {
    backgroundColor: "#07090d",
    backgroundImage: `radial-gradient(circle at 16% 20%, ${c0} 0%, transparent 48%), radial-gradient(circle at 84% 26%, ${c1} 0%, transparent 44%), radial-gradient(circle at 24% 88%, ${c2} 0%, transparent 40%), linear-gradient(140deg, ${c3} 0%, #07090d 92%)`,
    opacity: safeOpacity,
  };
}

function toCssColor(color: [number, number, number], alpha: number): string {
  const r = Math.round(clamp(color[0], 0, 1) * 255);
  const g = Math.round(clamp(color[1], 0, 1) * 255);
  const b = Math.round(clamp(color[2], 0, 1) * 255);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
