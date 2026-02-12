import { BackgroundShaderSettings } from "../store/backgroundShaderStore";
import {
  CachedBindGroupKeyPart,
  RenderTarget,
} from "./backgroundShaderRuntimeTypes";
import { clamp } from "./backgroundShaderRuntimeUtils";

type BindGroupGetter = (
  keyParts: CachedBindGroupKeyPart[],
  factory: () => GPUBindGroup,
) => GPUBindGroup;

type RenderPassStarter = (
  encoder: GPUCommandEncoder,
  view: GPUTextureView,
) => GPURenderPassEncoder;

type TemporalUniformWriter = (
  settingsValue: BackgroundShaderSettings,
  enabled: boolean,
  historyBlendScale: number,
) => void;

export type TemporalState = {
  historyReadIndex: number;
  historyValid: boolean;
  historyFrameCount: number;
};

type TemporalResolveArgs = {
  encoder: GPUCommandEncoder;
  settings: BackgroundShaderSettings;
  outputTarget: RenderTarget;
  historyTargets: [RenderTarget | null, RenderTarget | null];
  temporalPipeline: GPURenderPipeline;
  sampler: GPUSampler;
  device: GPUDevice;
  temporalUniformBuffer: GPUBuffer;
  temporalState: TemporalState;
  writeTemporalUniforms: TemporalUniformWriter;
  beginPass: RenderPassStarter;
  getCachedBindGroup: BindGroupGetter;
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

  const historySourceView = args.temporalState.historyValid
    ? historyRead.view
    : args.outputTarget.view;
  const historyBlendScale = args.temporalState.historyValid
    ? clamp(args.temporalState.historyFrameCount / 10, 0, 1)
    : 0;

  args.writeTemporalUniforms(
    args.settings,
    args.temporalState.historyValid,
    historyBlendScale,
  );

  const temporalBindGroup = args.getCachedBindGroup(
    [
      "temporal",
      args.temporalPipeline,
      args.sampler,
      args.outputTarget.view,
      historySourceView,
      args.temporalUniformBuffer,
    ],
    () =>
      args.device.createBindGroup({
        layout: args.temporalPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: args.sampler },
          { binding: 1, resource: args.outputTarget.view },
          {
            binding: 2,
            resource: historySourceView,
          },
          {
            binding: 3,
            resource: {
              buffer: args.temporalUniformBuffer,
            },
          },
        ],
      }),
  );

  const temporalPass = args.beginPass(args.encoder, historyWrite.view);
  temporalPass.setPipeline(args.temporalPipeline);
  temporalPass.setBindGroup(0, temporalBindGroup);
  temporalPass.draw(3, 1, 0, 0);
  temporalPass.end();

  return {
    outputTarget: historyWrite,
    temporalState: {
      historyReadIndex: 1 - args.temporalState.historyReadIndex,
      historyValid: true,
      historyFrameCount: Math.min(
        args.temporalState.historyFrameCount + 1,
        120,
      ),
    },
  };
}
