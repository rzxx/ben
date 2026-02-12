struct TemporalUniforms {
  params: vec4<f32>,
}

@group(0) @binding(0)
var inputSampler: sampler;

@group(0) @binding(1)
var currentTexture: texture_2d<f32>;

@group(0) @binding(2)
var historyTexture: texture_2d<f32>;

@group(0) @binding(3)
var<uniform> uniforms: TemporalUniforms;
