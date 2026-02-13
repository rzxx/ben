out vec4 fragColor;

void main() {
  vec2 uv = vec2(
    gl_FragCoord.x * uniforms.resolution.z,
    1.0 - gl_FragCoord.y * uniforms.resolution.w
  );
  float time = mod(uniforms.paramsA.x, 4096.0);

  vec3 c0 = interpolatedPaletteColor(0);
  vec3 c1 = interpolatedPaletteColor(1);
  vec3 c2 = interpolatedPaletteColor(2);
  vec3 c3 = interpolatedPaletteColor(3);
  vec3 c4 = interpolatedPaletteColor(4);

  bool useLegacy = uniforms.paramsC.x > 0.5;
  vec3 color = stableLayeredColorField(uv, time, c0, c1, c2, c3, c4);
  if (useLegacy) {
    color = legacyFeedbackColorField(uv, time, c0, c1, c2, c3, c4);
  }

  fragColor = vec4(saturate3(color), 1.0);
}
