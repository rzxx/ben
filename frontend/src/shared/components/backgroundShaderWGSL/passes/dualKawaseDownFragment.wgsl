@fragment
fn fsMain(in: VsOut) -> @location(0) vec4<f32> {
  let texel = uniforms.params.xy;
  let offset = max(0.0, uniforms.params.z);
  let delta = texel * offset;

  var color = textureSample(inputTexture, inputSampler, in.uv) * 4.0;
  color += textureSample(inputTexture, inputSampler, in.uv + vec2<f32>(delta.x, delta.y));
  color += textureSample(inputTexture, inputSampler, in.uv + vec2<f32>(-delta.x, delta.y));
  color += textureSample(inputTexture, inputSampler, in.uv + vec2<f32>(delta.x, -delta.y));
  color += textureSample(inputTexture, inputSampler, in.uv + vec2<f32>(-delta.x, -delta.y));

  return color * 0.125;
}
