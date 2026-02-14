vec3 stableLayeredColorField(
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
  float detailAmount = uniforms.paramsB.y;
  float detailScale = uniforms.paramsB.z;
  float detailSpeed = uniforms.paramsB.w;
  float colorDrift = uniforms.paramsC.y;
  float lumaAnchor = uniforms.paramsC.z;
  float lumaRemapStrength = saturate(uniforms.paramsC.w);

  float aspect = uniforms.resolution.x / max(uniforms.resolution.y, 1.0);
  vec2 centered = vec2((uv.x - 0.5) * aspect, uv.y - 0.5);

  float slowTime = time * (0.06 + flowSpeed * 0.14);
  vec2 basePoint = centered * (0.86 + noiseScale * 0.2);
  basePoint += vec2(sin(slowTime * 0.7), cos(slowTime * 0.58)) * 0.14;

  float baseN0 = perlinNoise(basePoint + vec2(slowTime * 0.28, -slowTime * 0.22));
  float baseN1 = perlinNoise(basePoint * 1.62 - vec2(slowTime * 0.18, slowTime * 0.14));
  float baseWave = sin(basePoint.x * 1.9 - basePoint.y * 1.3 + slowTime * 1.2);
  float baseField = softsign(((baseN0 * 2.0 - 1.0) * 0.65 + (baseN1 * 2.0 - 1.0) * 0.28 + baseWave * 0.2) * 1.3);

  vec2 eps = vec2(0.0028, 0.0028);
  float gx = perlinNoise(basePoint + vec2(eps.x, 0.0)) - baseN0;
  float gy = perlinNoise(basePoint + vec2(0.0, eps.y)) - baseN0;
  vec2 flow = vec2(gy, -gx);
  flow = normalize(flow + vec2(0.0001, 0.0));
  flow *= 0.028 + warpStrength * 0.08;

  vec2 detailPoint = centered + flow * (0.65 + baseField * 0.45);
  detailPoint *= max(0.2, detailScale) * (1.6 + noiseScale * 0.35);

  float detailTime = time * (0.18 + detailSpeed * 0.54);
  float detailN = perlinNoise(detailPoint * 2.6 + vec2(detailTime * 0.74, -detailTime * 0.63)) * 2.0 - 1.0;
  float ribbonPhase = (detailPoint.x - detailPoint.y) * 5.9 + detailN * 1.4 + detailTime * 2.2;
  float sheenPhase = (detailPoint.x + detailPoint.y) * 8.4 + detailN * 1.8 + detailTime * 3.2;
  float ribbon = 0.5 + 0.5 * sin(ribbonPhase);
  float fwSheen = max(0.001, fwidth(sheenPhase));
  float fwRibbon = max(0.001, fwidth(ribbonPhase));
  float detailBandLimit = 1.0 / (1.0 + fwRibbon * 6.0);
  float sheen = smoothstep(0.55 - fwSheen * 1.7, 0.55 + fwSheen * 1.7, abs(sin(sheenPhase)));
  float detailDrive = detailAmount * detailBandLimit;

  float basePhase = 0.5 + 0.5 * sin(baseField * (1.85 + colorDrift * 1.1) + slowTime * (0.7 + colorDrift * 0.8));
  float blendPhase = 0.5 + 0.5 * sin(baseField * 1.12 + slowTime * 0.38 + 1.9);
  float detailPhase = clamp(basePhase + detailN * 0.08 * detailBandLimit + (ribbon - 0.5) * 0.06 * detailBandLimit, 0.0, 0.9999);

  vec3 basePaletteA = samplePalette(basePhase, c0, c1, c2, c3, c4);
  vec3 basePaletteB = samplePalette(blendPhase, c0, c1, c2, c3, c4);
  vec3 detailPalette = samplePalette(detailPhase, c0, c1, c2, c3, c4);

  vec3 color = mix(basePaletteA, basePaletteB, 0.32 + baseField * 0.1);
  color = mix(color, detailPalette, detailDrive * 0.24 + ribbon * detailDrive * 0.08);
  color += (detailPalette - basePaletteA) * (sheen * (0.04 + detailDrive * 0.18));

  if (lumaRemapStrength > 0.0001) {
    float currentY = dot(color, vec3(0.2126, 0.7152, 0.0722));
    float targetY = mix(currentY, 0.18 + lumaAnchor * 0.64, lumaRemapStrength);
    color *= targetY / max(0.001, currentY);
  }

  float vignette = 1.0 - smoothstep(0.42, 1.08, length(centered)) * 0.24;
  color *= vignette;

  return saturate3(color);
}
