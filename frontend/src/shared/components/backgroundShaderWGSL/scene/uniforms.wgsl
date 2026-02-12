struct Uniforms {
  resolution: vec4<f32>,
  paramsA: vec4<f32>,
  paramsB: vec4<f32>,
  paramsC: vec4<f32>,
  fromColors: array<vec4<f32>, 5>,
  toColors: array<vec4<f32>, 5>,
}

@group(0) @binding(0)
var<uniform> uniforms: Uniforms;
