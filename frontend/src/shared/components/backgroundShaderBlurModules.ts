import { BackgroundShaderSettings } from "../store/backgroundShaderStore";
import {
  CachedBindGroupKeyPart,
  RenderTarget,
} from "./backgroundShaderRuntimeTypes";
import { resolveMipViews } from "./backgroundShaderRuntimeUtils";

type BindGroupGetter = (
  keyParts: CachedBindGroupKeyPart[],
  factory: () => GPUBindGroup,
) => GPUBindGroup;

type RenderPassStarter = (
  encoder: GPUCommandEncoder,
  view: GPUTextureView,
) => GPURenderPassEncoder;

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

type DualKawaseBlurArgs = {
  encoder: GPUCommandEncoder;
  settings: BackgroundShaderSettings;
  sceneTarget: RenderTarget;
  blurTargets: RenderTarget[];
  sampler: GPUSampler;
  device: GPUDevice;
  downPipeline: GPURenderPipeline;
  upPipeline: GPURenderPipeline;
  blurUniformBuffer: GPUBuffer;
  writeBlurUniforms: BlurUniformWriter;
  beginPass: RenderPassStarter;
  getCachedBindGroup: BindGroupGetter;
};

export function runDualKawaseBlur(args: DualKawaseBlurArgs): void {
  let sourceTarget = args.sceneTarget;

  for (let i = 0; i < args.blurTargets.length; i += 1) {
    const target = args.blurTargets[i];
    const passOffset =
      args.settings.blurRadius + args.settings.blurRadiusStep * i;

    args.writeBlurUniforms(
      1 / Math.max(1, sourceTarget.width),
      1 / Math.max(1, sourceTarget.height),
      passOffset,
    );

    const bindGroup = args.getCachedBindGroup(
      [
        "dualDown",
        args.downPipeline,
        args.sampler,
        sourceTarget.view,
        args.blurUniformBuffer,
      ],
      () =>
        args.device.createBindGroup({
          layout: args.downPipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: args.sampler },
            { binding: 1, resource: sourceTarget.view },
            {
              binding: 2,
              resource: { buffer: args.blurUniformBuffer },
            },
          ],
        }),
    );

    const pass = args.beginPass(args.encoder, target.view);
    pass.setPipeline(args.downPipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3, 1, 0, 0);
    pass.end();

    sourceTarget = target;
  }

  let upSourceTarget = sourceTarget;
  for (let i = args.blurTargets.length - 2; i >= 0; i -= 1) {
    const target = args.blurTargets[i];
    const passOffset =
      args.settings.blurRadius + args.settings.blurRadiusStep * i;

    args.writeBlurUniforms(
      1 / Math.max(1, upSourceTarget.width),
      1 / Math.max(1, upSourceTarget.height),
      passOffset,
    );

    const bindGroup = args.getCachedBindGroup(
      [
        "dualUp",
        args.upPipeline,
        args.sampler,
        upSourceTarget.view,
        args.blurUniformBuffer,
      ],
      () =>
        args.device.createBindGroup({
          layout: args.upPipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: args.sampler },
            { binding: 1, resource: upSourceTarget.view },
            {
              binding: 2,
              resource: { buffer: args.blurUniformBuffer },
            },
          ],
        }),
    );

    const pass = args.beginPass(args.encoder, target.view);
    pass.setPipeline(args.upPipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3, 1, 0, 0);
    pass.end();

    upSourceTarget = target;
  }

  args.writeBlurUniforms(
    1 / Math.max(1, upSourceTarget.width),
    1 / Math.max(1, upSourceTarget.height),
    args.settings.blurRadius,
  );

  const finalBindGroup = args.getCachedBindGroup(
    [
      "dualUpFinal",
      args.upPipeline,
      args.sampler,
      upSourceTarget.view,
      args.blurUniformBuffer,
    ],
    () =>
      args.device.createBindGroup({
        layout: args.upPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: args.sampler },
          { binding: 1, resource: upSourceTarget.view },
          {
            binding: 2,
            resource: { buffer: args.blurUniformBuffer },
          },
        ],
      }),
  );

  const finalPass = args.beginPass(args.encoder, args.sceneTarget.view);
  finalPass.setPipeline(args.upPipeline);
  finalPass.setBindGroup(0, finalBindGroup);
  finalPass.draw(3, 1, 0, 0);
  finalPass.end();
}

type MipPyramidBlurArgs = {
  encoder: GPUCommandEncoder;
  settings: BackgroundShaderSettings;
  sceneTarget: RenderTarget;
  destinationTarget: RenderTarget;
  mipTargets: RenderTarget[];
  sampler: GPUSampler;
  device: GPUDevice;
  downPipeline: GPURenderPipeline;
  compositePipeline: GPURenderPipeline;
  blurUniformBuffer: GPUBuffer;
  mipCompositeUniformBuffer: GPUBuffer;
  maxMipCompositeLevels: number;
  writeBlurUniforms: BlurUniformWriter;
  writeMipCompositeUniforms: MipCompositeUniformWriter;
  beginPass: RenderPassStarter;
  getCachedBindGroup: BindGroupGetter;
};

export function runMipPyramidBlur(args: MipPyramidBlurArgs): void {
  let source = args.sceneTarget;
  for (const target of args.mipTargets) {
    args.writeBlurUniforms(
      1 / Math.max(1, source.width),
      1 / Math.max(1, source.height),
      args.settings.blurRadius,
    );

    const bindGroup = args.getCachedBindGroup(
      [
        "mipDown",
        args.downPipeline,
        args.sampler,
        source.view,
        args.blurUniformBuffer,
      ],
      () =>
        args.device.createBindGroup({
          layout: args.downPipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: args.sampler },
            { binding: 1, resource: source.view },
            {
              binding: 2,
              resource: { buffer: args.blurUniformBuffer },
            },
          ],
        }),
    );

    const pass = args.beginPass(args.encoder, target.view);
    pass.setPipeline(args.downPipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3, 1, 0, 0);
    pass.end();

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

  const mipViews = resolveMipViews(args.mipTargets, args.sceneTarget.view);
  const compositeBindGroup = args.getCachedBindGroup(
    [
      "mipComposite",
      args.compositePipeline,
      args.sampler,
      args.sceneTarget.view,
      mipViews[0],
      mipViews[1],
      mipViews[2],
      mipViews[3],
      mipViews[4],
      args.mipCompositeUniformBuffer,
    ],
    () =>
      args.device.createBindGroup({
        layout: args.compositePipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: args.sampler },
          { binding: 1, resource: args.sceneTarget.view },
          { binding: 2, resource: mipViews[0] },
          { binding: 3, resource: mipViews[1] },
          { binding: 4, resource: mipViews[2] },
          { binding: 5, resource: mipViews[3] },
          { binding: 6, resource: mipViews[4] },
          {
            binding: 7,
            resource: {
              buffer: args.mipCompositeUniformBuffer,
            },
          },
        ],
      }),
  );

  const pass = args.beginPass(args.encoder, args.destinationTarget.view);
  pass.setPipeline(args.compositePipeline);
  pass.setBindGroup(0, compositeBindGroup);
  pass.draw(3, 1, 0, 0);
  pass.end();
}
