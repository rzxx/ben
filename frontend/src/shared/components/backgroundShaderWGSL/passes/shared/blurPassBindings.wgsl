struct BlurUniforms {
  params: vec4<f32>,
}

@group(0) @binding(0)
var inputSampler: sampler;

@group(0) @binding(1)
var inputTexture: texture_2d<f32>;

@group(0) @binding(2)
var<uniform> uniforms: BlurUniforms;
