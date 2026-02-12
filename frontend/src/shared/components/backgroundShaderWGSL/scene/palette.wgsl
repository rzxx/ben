fn interpolatedPaletteColor(index: u32) -> vec3<f32> {
  let mixAmount = smoothstep(0.0, 1.0, saturate(uniforms.paramsB.x));
  let fromLab = srgbToOklab(uniforms.fromColors[index].xyz);
  let toLab = srgbToOklab(uniforms.toColors[index].xyz);
  return saturate3(oklabToSrgb(mix(fromLab, toLab, mixAmount)));
}

fn samplePalette(
  phase: f32,
  c0: vec3<f32>,
  c1: vec3<f32>,
  c2: vec3<f32>,
  c3: vec3<f32>,
  c4: vec3<f32>
) -> vec3<f32> {
  let x = clamp(phase, 0.0, 0.9999) * 4.0;
  let segment = u32(floor(x));
  let localT = fract(x);

  if (segment == 0u) {
    return mix(c0, c1, localT);
  }
  if (segment == 1u) {
    return mix(c1, c2, localT);
  }
  if (segment == 2u) {
    return mix(c2, c3, localT);
  }
  if (segment == 3u) {
    return mix(c3, c4, localT);
  }

  return c4;
}
