struct MipCompositeUniforms {
  params: vec4<f32>,
}

@group(0) @binding(0)
var inputSampler: sampler;

@group(0) @binding(1)
var baseTexture: texture_2d<f32>;

@group(0) @binding(2)
var mip1Texture: texture_2d<f32>;

@group(0) @binding(3)
var mip2Texture: texture_2d<f32>;

@group(0) @binding(4)
var mip3Texture: texture_2d<f32>;

@group(0) @binding(5)
var mip4Texture: texture_2d<f32>;

@group(0) @binding(6)
var mip5Texture: texture_2d<f32>;

@group(0) @binding(7)
var<uniform> uniforms: MipCompositeUniforms;
