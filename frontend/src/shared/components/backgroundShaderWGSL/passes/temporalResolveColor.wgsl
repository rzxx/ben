fn saturate(value: f32) -> f32 {
  return clamp(value, 0.0, 1.0);
}

fn saturate3(value: vec3<f32>) -> vec3<f32> {
  return clamp(value, vec3<f32>(0.0), vec3<f32>(1.0));
}

fn srgbToLinear3(value: vec3<f32>) -> vec3<f32> {
  let low = value / 12.92;
  let high = pow((value + vec3<f32>(0.055)) / vec3<f32>(1.055), vec3<f32>(2.4));
  let useHigh = step(vec3<f32>(0.04045), value);
  return mix(low, high, useHigh);
}

fn linearToSrgb3(value: vec3<f32>) -> vec3<f32> {
  let low = value * 12.92;
  let high = vec3<f32>(1.055) * pow(max(value, vec3<f32>(0.0)), vec3<f32>(1.0 / 2.4)) - vec3<f32>(0.055);
  let useHigh = step(vec3<f32>(0.0031308), value);
  return mix(low, high, useHigh);
}
