fn stableLayeredColorField(
  uv: vec2<f32>,
  time: f32,
  c0: vec3<f32>,
  c1: vec3<f32>,
  c2: vec3<f32>,
  c3: vec3<f32>,
  c4: vec3<f32>
) -> vec3<f32> {
  let noiseScale = max(0.1, uniforms.paramsA.y);
  let flowSpeed = uniforms.paramsA.z;
  let warpStrength = uniforms.paramsA.w;
  let detailAmount = uniforms.paramsB.y;
  let detailScale = uniforms.paramsB.z;
  let detailSpeed = uniforms.paramsB.w;
  let colorDrift = uniforms.paramsC.y;
  let lumaAnchor = uniforms.paramsC.z;

  let aspect = uniforms.resolution.x / max(uniforms.resolution.y, 1.0);
  let centered = vec2<f32>((uv.x - 0.5) * aspect, uv.y - 0.5);

  let slowTime = time * (0.06 + flowSpeed * 0.14);
  var basePoint = centered * (0.86 + noiseScale * 0.2);
  basePoint += vec2<f32>(sin(slowTime * 0.7), cos(slowTime * 0.58)) * 0.14;

  let baseN0 = perlinNoise(basePoint + vec2<f32>(slowTime * 0.28, -slowTime * 0.22));
  let baseN1 = perlinNoise(basePoint * 1.62 - vec2<f32>(slowTime * 0.18, slowTime * 0.14));
  let baseWave = sin(basePoint.x * 1.9 - basePoint.y * 1.3 + slowTime * 1.2);
  let baseField = softsign(((baseN0 * 2.0 - 1.0) * 0.65 + (baseN1 * 2.0 - 1.0) * 0.28 + baseWave * 0.2) * 1.3);

  let eps = vec2<f32>(0.0028, 0.0028);
  let gx = perlinNoise(basePoint + vec2<f32>(eps.x, 0.0)) - baseN0;
  let gy = perlinNoise(basePoint + vec2<f32>(0.0, eps.y)) - baseN0;
  var flow = vec2<f32>(gy, -gx);
  flow = normalize(flow + vec2<f32>(0.0001, 0.0));
  flow *= 0.028 + warpStrength * 0.08;

  var detailPoint = centered + flow * (0.65 + baseField * 0.45);
  detailPoint *= max(0.2, detailScale) * (1.6 + noiseScale * 0.35);

  let detailTime = time * (0.18 + detailSpeed * 0.54);
  let detailN = perlinNoise(detailPoint * 2.6 + vec2<f32>(detailTime * 0.74, -detailTime * 0.63)) * 2.0 - 1.0;
  let ribbonPhase = (detailPoint.x - detailPoint.y) * 5.9 + detailN * 1.4 + detailTime * 2.2;
  let sheenPhase = (detailPoint.x + detailPoint.y) * 8.4 + detailN * 1.8 + detailTime * 3.2;
  let ribbon = 0.5 + 0.5 * sin(ribbonPhase);
  let fwSheen = max(0.001, fwidth(sheenPhase));
  let fwRibbon = max(0.001, fwidth(ribbonPhase));
  let detailBandLimit = 1.0 / (1.0 + fwRibbon * 6.0);
  let sheen = smoothstep(0.55 - fwSheen * 1.7, 0.55 + fwSheen * 1.7, abs(sin(sheenPhase)));
  let detailDrive = detailAmount * detailBandLimit;

  let basePhase = 0.5 + 0.5 * sin(baseField * (1.85 + colorDrift * 1.1) + slowTime * (0.7 + colorDrift * 0.8));
  let blendPhase = 0.5 + 0.5 * sin(baseField * 1.12 + slowTime * 0.38 + 1.9);
  let detailPhase = clamp(basePhase + detailN * 0.08 * detailBandLimit + (ribbon - 0.5) * 0.06 * detailBandLimit, 0.0, 0.9999);

  let basePaletteA = samplePalette(basePhase, c0, c1, c2, c3, c4);
  let basePaletteB = samplePalette(blendPhase, c0, c1, c2, c3, c4);
  let detailPalette = samplePalette(detailPhase, c0, c1, c2, c3, c4);

  var color = mix(basePaletteA, basePaletteB, 0.32 + baseField * 0.1);
  color = mix(color, detailPalette, detailDrive * 0.24 + ribbon * detailDrive * 0.08);
  color += (detailPalette - basePaletteA) * (sheen * (0.04 + detailDrive * 0.18));

  let currentY = dot(color, vec3<f32>(0.2126, 0.7152, 0.0722));
  let targetY = mix(currentY, 0.18 + lumaAnchor * 0.64, 0.48);
  color *= targetY / max(0.001, currentY);

  let vignette = 1.0 - smoothstep(0.42, 1.08, length(centered)) * 0.24;
  color *= vignette;

  return saturate3(color);
}
