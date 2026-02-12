@fragment
fn fsMain(in: VsOut) -> @location(0) vec4<f32> {
  let opacity = clamp(uniforms.params.x, 0.0, 1.0);
  let baseColor = uniforms.params.yzw;
  let color = textureSample(inputTexture, inputSampler, in.uv).rgb;
  let finalColor = mix(baseColor, color, opacity);
  return vec4<f32>(finalColor, 1.0);
}
