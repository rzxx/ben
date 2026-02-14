vec3 legacyFeedbackColorField(
  vec2 uv,
  float time,
  vec3 c0,
  vec3 c1,
  vec3 c2,
  vec3 c3,
  vec3 c4
) {
  float noiseScale = max(0.1, uniforms.paramsA.y);
  float flowSpeed = uniforms.paramsA.z;
  float warpStrength = uniforms.paramsA.w;
  float lumaAnchor = uniforms.paramsC.z;
  float lumaRemapStrength = saturate(uniforms.paramsC.w);

  float aspect = uniforms.resolution.x / max(uniforms.resolution.y, 1.0);
  vec2 centered = vec2((uv.x - 0.5) * aspect, uv.y - 0.5);
  vec2 base = centered + vec2(time * flowSpeed * 0.03, -time * flowSpeed * 0.02);

  vec2 eps = vec2(0.0032, 0.0032);
  float phi = scalarField(base, time, flowSpeed, noiseScale);
  float gradX = scalarField(base + vec2(eps.x, 0.0), time, flowSpeed, noiseScale) - phi;
  float gradY = scalarField(base + vec2(0.0, eps.y), time, flowSpeed, noiseScale) - phi;

  vec2 velocity = vec2(gradY, -gradX);
  float velocityMagnitude = length(velocity);
  velocity = velocity / max(0.0001, velocityMagnitude);
  velocity *= 0.09 + warpStrength * 0.19;

  vec2 q = base;
  float phaseAccum = phi;
  float ribbonAccum = 0.0;

  for (int i = 0; i < 3; i += 1) {
    float fi = float(i);
    float probe = scalarField(
      q + velocity * (0.7 + fi * 0.35),
      time + fi * 0.46,
      flowSpeed,
      noiseScale
    );
    float angle = probe * (1.0 + fi * 0.28) + time * 0.03;

    q += rotate2(velocity, angle) * (0.9 - fi * 0.2);
    q += vec2(
      sin(probe * 4.8 + time * 0.35),
      cos(probe * 4.1 - time * 0.31)
    ) * (0.024 - fi * 0.004);
    q += vec2(
      sin((q.y + fi) * 5.7 + time * 0.23),
      cos((q.x - fi) * 4.9 - time * 0.21)
    ) * 0.01;

    phaseAccum += probe * (0.74 - fi * 0.18);
    ribbonAccum += sin((q.x - q.y) * (10.0 + fi * 2.1) + probe * 3.7 + time * 0.52);
  }

  float detail = perlinNoise(q * 3.4 + vec2(time * 0.07, -time * 0.08));
  float interference = 0.5 + 0.5 * sin((q.x + q.y) * 14.0 + phaseAccum * 2.7 + time * 0.85);
  float ribbon = smoothstep(-0.15, 0.48, ribbonAccum / 3.0);
  float vortex = smoothstep(0.05, 0.4, velocityMagnitude * (1.5 + warpStrength * 0.8));

  float phase = fract(phaseAccum * 0.19 + detail * 0.28 + velocityMagnitude * 8.5 + 0.5);
  float shifted = fract(phase + 0.16 + ribbon * 0.22 - vortex * 0.08);
  float warped = fract(phase * 0.58 + interference * 0.34 + 0.62);

  vec3 paletteA = samplePalette(phase, c0, c1, c2, c3, c4);
  vec3 paletteB = samplePalette(shifted, c0, c1, c2, c3, c4);
  vec3 paletteC = samplePalette(warped, c0, c1, c2, c3, c4);

  vec3 color = mix(paletteA, paletteB, ribbon * 0.68);
  color = mix(color, paletteC, 0.24 + vortex * 0.26);

  float highlight = smoothstep(0.7, 0.98, interference) * (0.22 + ribbon * 0.52);
  color += (paletteB - paletteA) * highlight * 0.3;

  if (lumaRemapStrength > 0.0001) {
    float currentY = dot(color, vec3(0.2126, 0.7152, 0.0722));
    float targetY = mix(currentY, 0.18 + lumaAnchor * 0.64, lumaRemapStrength);
    color *= targetY / max(0.001, currentY);
  }

  return saturate3(color);
}
