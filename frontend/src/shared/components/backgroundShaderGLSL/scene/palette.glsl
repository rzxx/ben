vec3 interpolatedPaletteColor(int index) {
  float mixAmount = smoothstep(0.0, 1.0, saturate(uniforms.paramsB.x));
  vec3 fromLab = srgbToOklab(uniforms.fromColors[index].xyz);
  vec3 toLab = srgbToOklab(uniforms.toColors[index].xyz);
  return saturate3(oklabToSrgb(mix(fromLab, toLab, mixAmount)));
}

vec3 samplePalette(
  float phase,
  vec3 c0,
  vec3 c1,
  vec3 c2,
  vec3 c3,
  vec3 c4
) {
  float x = clamp(phase, 0.0, 0.9999) * 4.0;
  int segment = int(floor(x));
  float localT = fract(x);

  if (segment == 0) {
    return mix(c0, c1, localT);
  }
  if (segment == 1) {
    return mix(c1, c2, localT);
  }
  if (segment == 2) {
    return mix(c2, c3, localT);
  }
  if (segment == 3) {
    return mix(c3, c4, localT);
  }

  return c4;
}
