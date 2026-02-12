fn saturate(value: f32) -> f32 {
  return clamp(value, 0.0, 1.0);
}

fn saturate3(value: vec3<f32>) -> vec3<f32> {
  return clamp(value, vec3<f32>(0.0), vec3<f32>(1.0));
}

fn softsign(value: f32) -> f32 {
  return value / (1.0 + abs(value));
}

fn rotate2(value: vec2<f32>, angle: f32) -> vec2<f32> {
  let c = cos(angle);
  let s = sin(angle);
  return vec2<f32>(value.x * c - value.y * s, value.x * s + value.y * c);
}
