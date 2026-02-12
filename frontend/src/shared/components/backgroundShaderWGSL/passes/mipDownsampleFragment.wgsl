@fragment
fn fsMain(in: VsOut) -> @location(0) vec4<f32> {
  let texel = uniforms.params.xy;
  let blurRadius = max(0.0, uniforms.params.z);
  let delta = texel * (0.75 + blurRadius * 0.35);

  var color = textureSample(inputTexture, inputSampler, in.uv) * 4.0;

  color += textureSample(inputTexture, inputSampler, in.uv + vec2<f32>(delta.x, 0.0)) * 2.0;
  color += textureSample(inputTexture, inputSampler, in.uv + vec2<f32>(-delta.x, 0.0)) * 2.0;
  color += textureSample(inputTexture, inputSampler, in.uv + vec2<f32>(0.0, delta.y)) * 2.0;
  color += textureSample(inputTexture, inputSampler, in.uv + vec2<f32>(0.0, -delta.y)) * 2.0;

  color += textureSample(inputTexture, inputSampler, in.uv + vec2<f32>(delta.x, delta.y));
  color += textureSample(inputTexture, inputSampler, in.uv + vec2<f32>(-delta.x, delta.y));
  color += textureSample(inputTexture, inputSampler, in.uv + vec2<f32>(delta.x, -delta.y));
  color += textureSample(inputTexture, inputSampler, in.uv + vec2<f32>(-delta.x, -delta.y));

  return color * (1.0 / 16.0);
}
