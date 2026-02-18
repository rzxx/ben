float interleavedGradientNoise(vec2 pixelCoord) {
  return fract(
    52.9829189 * fract(dot(pixelCoord, vec2(0.06711056, 0.00583715)))
  );
}

float phaseOffsetX(float phaseIndex) {
  if (phaseIndex < 0.5) {
    return 0.0;
  }
  if (phaseIndex < 1.5) {
    return 0.5;
  }
  if (phaseIndex < 2.5) {
    return 0.25;
  }
  return 0.75;
}

vec3 applySqrtSpaceDither(vec3 color, float dither) {
  vec3 sqrtSpace = sqrt(max(color, vec3(0.0)));
  sqrtSpace = clamp(sqrtSpace + vec3(dither), 0.0, 1.0);
  return sqrtSpace * sqrtSpace;
}

void main() {
  float opacity = clamp(uniforms.paramsA.x, 0.0, 1.0);
  vec3 baseColor = uniforms.paramsA.yzw;
  float ignStrengthLsb = max(uniforms.paramsB.x, 0.0);
  float ignPhase = mod(floor(uniforms.paramsB.y + 0.5), 4.0);
  float shiftedBlend = clamp(uniforms.paramsB.z, 0.0, 1.0);
  vec3 color = texture(inputTexture, vUv).rgb;
  vec3 finalColor = mix(baseColor, color, opacity);

  vec2 pixelCoord = floor(gl_FragCoord.xy);
  float stableIgn = interleavedGradientNoise(pixelCoord);
  float shiftedIgn = interleavedGradientNoise(
    pixelCoord + vec2(phaseOffsetX(ignPhase), 0.0)
  );
  float ign = mix(stableIgn, shiftedIgn, shiftedBlend);
  float ignScale = ignStrengthLsb / 255.0;
  float dither = ignScale * ign - (0.5 * ignScale);
  vec3 ditheredColor = applySqrtSpaceDither(finalColor, dither);
  fragColor = vec4(clamp(ditheredColor, 0.0, 1.0), 1.0);
}
