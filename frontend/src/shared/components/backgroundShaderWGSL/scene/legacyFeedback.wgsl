fn legacyFeedbackColorField(
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

  let aspect = uniforms.resolution.x / max(uniforms.resolution.y, 1.0);
  let centered = vec2<f32>((uv.x - 0.5) * aspect, uv.y - 0.5);
  let base = centered + vec2<f32>(time * flowSpeed * 0.03, -time * flowSpeed * 0.02);

  let eps = vec2<f32>(0.0032, 0.0032);
  let phi = scalarField(base, time, flowSpeed, noiseScale);
  let gradX = scalarField(base + vec2<f32>(eps.x, 0.0), time, flowSpeed, noiseScale) - phi;
  let gradY = scalarField(base + vec2<f32>(0.0, eps.y), time, flowSpeed, noiseScale) - phi;

  var velocity = vec2<f32>(gradY, -gradX);
  let velocityMagnitude = length(velocity);
  velocity = velocity / max(0.0001, velocityMagnitude);
  velocity *= 0.09 + warpStrength * 0.19;

  var q = base;
  var phaseAccum = phi;
  var ribbonAccum = 0.0;

  for (var i = 0; i < 3; i = i + 1) {
    let fi = f32(i);
    let probe = scalarField(
      q + velocity * (0.7 + fi * 0.35),
      time + fi * 0.46,
      flowSpeed,
      noiseScale
    );
    let angle = probe * (1.0 + fi * 0.28) + time * 0.03;

    q += rotate2(velocity, angle) * (0.9 - fi * 0.2);
    q += vec2<f32>(
      sin(probe * 4.8 + time * 0.35),
      cos(probe * 4.1 - time * 0.31)
    ) * (0.024 - fi * 0.004);
    q += vec2<f32>(
      sin((q.y + fi) * 5.7 + time * 0.23),
      cos((q.x - fi) * 4.9 - time * 0.21)
    ) * 0.01;

    phaseAccum += probe * (0.74 - fi * 0.18);
    ribbonAccum += sin((q.x - q.y) * (10.0 + fi * 2.1) + probe * 3.7 + time * 0.52);
  }

  let detail = perlinNoise(q * 3.4 + vec2<f32>(time * 0.07, -time * 0.08));
  let interference = 0.5 + 0.5 * sin((q.x + q.y) * 14.0 + phaseAccum * 2.7 + time * 0.85);
  let ribbon = smoothstep(-0.15, 0.48, ribbonAccum / 3.0);
  let vortex = smoothstep(0.05, 0.4, velocityMagnitude * (1.5 + warpStrength * 0.8));

  let phase = fract(phaseAccum * 0.19 + detail * 0.28 + velocityMagnitude * 8.5 + 0.5);
  let shifted = fract(phase + 0.16 + ribbon * 0.22 - vortex * 0.08);
  let warped = fract(phase * 0.58 + interference * 0.34 + 0.62);

  let paletteA = samplePalette(phase, c0, c1, c2, c3, c4);
  let paletteB = samplePalette(shifted, c0, c1, c2, c3, c4);
  let paletteC = samplePalette(warped, c0, c1, c2, c3, c4);

  var color = mix(paletteA, paletteB, ribbon * 0.68);
  color = mix(color, paletteC, 0.24 + vortex * 0.26);

  let highlight = smoothstep(0.7, 0.98, interference) * (0.22 + ribbon * 0.52);
  color += (paletteB - paletteA) * highlight * 0.3;

  return saturate3(color);
}
