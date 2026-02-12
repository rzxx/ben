@vertex
fn vsMain(@builtin(vertex_index) vertexIndex: u32) -> @builtin(position) vec4<f32> {
  var positions = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(3.0, -1.0),
    vec2<f32>(-1.0, 3.0)
  );

  return vec4<f32>(positions[vertexIndex], 0.0, 1.0);
}

@fragment
fn fsMain(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  let uv = position.xy * uniforms.resolution.zw;
  let time = uniforms.paramsA.x;

  let c0 = interpolatedPaletteColor(0u);
  let c1 = interpolatedPaletteColor(1u);
  let c2 = interpolatedPaletteColor(2u);
  let c3 = interpolatedPaletteColor(3u);
  let c4 = interpolatedPaletteColor(4u);

  let useLegacy = uniforms.paramsC.x > 0.5;
  var color = stableLayeredColorField(uv, time, c0, c1, c2, c3, c4);
  if (useLegacy) {
    color = legacyFeedbackColorField(uv, time, c0, c1, c2, c3, c4);
  }
  return vec4<f32>(saturate3(color), 1.0);
}
