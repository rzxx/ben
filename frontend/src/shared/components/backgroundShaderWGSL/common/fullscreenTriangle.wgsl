struct VsOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
}

@vertex
fn vsMain(@builtin(vertex_index) vertexIndex: u32) -> VsOut {
  var positions = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(3.0, -1.0),
    vec2<f32>(-1.0, 3.0)
  );

  let clip = positions[vertexIndex];
  var out: VsOut;
  out.position = vec4<f32>(clip, 0.0, 1.0);
  out.uv = vec2<f32>(clip.x * 0.5 + 0.5, 0.5 - clip.y * 0.5);
  return out;
}
