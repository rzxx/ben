export const backgroundShaderWGSL = /* wgsl */ `
struct Uniforms {
  resolution: vec4<f32>,
  paramsA: vec4<f32>,
  paramsB: vec4<f32>,
  paramsC: vec4<f32>,
  fromColors: array<vec4<f32>, 5>,
  toColors: array<vec4<f32>, 5>,
}

@group(0) @binding(0)
var<uniform> uniforms: Uniforms;

fn saturate(value: f32) -> f32 {
  return clamp(value, 0.0, 1.0);
}

fn saturate3(value: vec3<f32>) -> vec3<f32> {
  return clamp(value, vec3<f32>(0.0), vec3<f32>(1.0));
}

fn rotate2(value: vec2<f32>, angle: f32) -> vec2<f32> {
  let c = cos(angle);
  let s = sin(angle);
  return vec2<f32>(value.x * c - value.y * s, value.x * s + value.y * c);
}

fn srgbToLinear(value: vec3<f32>) -> vec3<f32> {
  let low = value / 12.92;
  let high = pow((value + vec3<f32>(0.055)) / vec3<f32>(1.055), vec3<f32>(2.4));
  let useHigh = step(vec3<f32>(0.04045), value);
  return mix(low, high, useHigh);
}

fn linearToSrgb(value: vec3<f32>) -> vec3<f32> {
  let low = value * 12.92;
  let high = vec3<f32>(1.055) * pow(max(value, vec3<f32>(0.0)), vec3<f32>(1.0 / 2.4)) - vec3<f32>(0.055);
  let useHigh = step(vec3<f32>(0.0031308), value);
  return mix(low, high, useHigh);
}

fn linearToOklab(value: vec3<f32>) -> vec3<f32> {
  let l = 0.4122214708 * value.r + 0.5363325363 * value.g + 0.0514459929 * value.b;
  let m = 0.2119034982 * value.r + 0.6806995451 * value.g + 0.1073969566 * value.b;
  let s = 0.0883024619 * value.r + 0.2817188376 * value.g + 0.6299787005 * value.b;

  let lRoot = pow(max(l, 0.0), 1.0 / 3.0);
  let mRoot = pow(max(m, 0.0), 1.0 / 3.0);
  let sRoot = pow(max(s, 0.0), 1.0 / 3.0);

  return vec3<f32>(
    0.2104542553 * lRoot + 0.7936177850 * mRoot - 0.0040720468 * sRoot,
    1.9779984951 * lRoot - 2.4285922050 * mRoot + 0.4505937099 * sRoot,
    0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.8086757660 * sRoot
  );
}

fn oklabToLinear(value: vec3<f32>) -> vec3<f32> {
  let lPrime = value.x + 0.3963377774 * value.y + 0.2158037573 * value.z;
  let mPrime = value.x - 0.1055613458 * value.y - 0.0638541728 * value.z;
  let sPrime = value.x - 0.0894841775 * value.y - 1.2914855480 * value.z;

  let l = lPrime * lPrime * lPrime;
  let m = mPrime * mPrime * mPrime;
  let s = sPrime * sPrime * sPrime;

  return vec3<f32>(
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
  );
}

fn srgbToOklab(value: vec3<f32>) -> vec3<f32> {
  return linearToOklab(srgbToLinear(value));
}

fn oklabToSrgb(value: vec3<f32>) -> vec3<f32> {
  return linearToSrgb(oklabToLinear(value));
}

fn hash21(value: vec2<f32>) -> f32 {
  let dotValue = dot(value, vec2<f32>(127.1, 311.7));
  return fract(sin(dotValue) * 43758.5453123);
}

fn randomGradient(cell: vec2<f32>) -> vec2<f32> {
  let angle = 6.28318530718 * hash21(cell);
  return vec2<f32>(cos(angle), sin(angle));
}

fn perlinNoise(point: vec2<f32>) -> f32 {
  let cell = floor(point);
  let local = fract(point);

  let g00 = randomGradient(cell + vec2<f32>(0.0, 0.0));
  let g10 = randomGradient(cell + vec2<f32>(1.0, 0.0));
  let g01 = randomGradient(cell + vec2<f32>(0.0, 1.0));
  let g11 = randomGradient(cell + vec2<f32>(1.0, 1.0));

  let d00 = dot(g00, local - vec2<f32>(0.0, 0.0));
  let d10 = dot(g10, local - vec2<f32>(1.0, 0.0));
  let d01 = dot(g01, local - vec2<f32>(0.0, 1.0));
  let d11 = dot(g11, local - vec2<f32>(1.0, 1.0));

  let fade = local * local * (vec2<f32>(3.0) - vec2<f32>(2.0) * local);
  let ix0 = mix(d00, d10, fade.x);
  let ix1 = mix(d01, d11, fade.x);

  return 0.5 + 0.5 * mix(ix0, ix1, fade.y);
}

fn interpolatedPaletteColor(index: u32) -> vec3<f32> {
  let mixAmount = smoothstep(0.0, 1.0, saturate(uniforms.paramsC.x));
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

fn scalarField(point: vec2<f32>, time: f32, flowSpeed: f32, noiseScale: f32) -> f32 {
  var q = point * noiseScale;
  let t = time * (0.24 + flowSpeed * 0.42);
  var feedback = 0.0;

  for (var i = 0; i < 2; i = i + 1) {
    let fi = f32(i);
    let sinTerm = sin(q.y * (3.2 + fi * 1.1) + t + feedback * 1.6);
    let cosTerm = cos(q.x * (2.8 + fi * 1.2) - t * 1.1 - feedback * 1.2);

    q += vec2<f32>(sinTerm, cosTerm) * (0.25 - fi * 0.06);
    feedback += sin((q.x + q.y) * (2.35 + fi) + t * (0.72 + fi * 0.18));
  }

  let n = perlinNoise(q * 1.8 + vec2<f32>(t * 0.9, -t * 0.75)) * 2.0 - 1.0;
  let wave = sin(q.x * 4.4 - q.y * 3.7 + t * 1.35);
  return feedback * 0.48 + n * 0.43 + wave * 0.24;
}

fn colorField(
  uv: vec2<f32>,
  time: f32,
  c0: vec3<f32>,
  c1: vec3<f32>,
  c2: vec3<f32>,
  c3: vec3<f32>,
  c4: vec3<f32>
) -> vec3<f32> {
  let noiseScale = max(0.1, uniforms.paramsA.z);
  let flowSpeed = uniforms.paramsA.w;
  let warpStrength = uniforms.paramsB.x;

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
      noiseScale,
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

fn blurredGradientField(
  uv: vec2<f32>,
  time: f32,
  c0: vec3<f32>,
  c1: vec3<f32>,
  c2: vec3<f32>,
  c3: vec3<f32>,
  c4: vec3<f32>
) -> vec3<f32> {
  let blurRadius = max(0.0, uniforms.paramsB.y);
  let invResolution = uniforms.resolution.zw;

  if (blurRadius <= 0.001) {
    return colorField(uv, time, c0, c1, c2, c3, c4);
  }

  let offset = invResolution * blurRadius * 2.0;
  var accum = colorField(uv, time, c0, c1, c2, c3, c4) * 0.5;

  accum += colorField(uv + vec2<f32>(offset.x, 0.0), time, c0, c1, c2, c3, c4) * 0.125;
  accum += colorField(uv + vec2<f32>(-offset.x, 0.0), time, c0, c1, c2, c3, c4) * 0.125;
  accum += colorField(uv + vec2<f32>(0.0, offset.y), time, c0, c1, c2, c3, c4) * 0.125;
  accum += colorField(uv + vec2<f32>(0.0, -offset.y), time, c0, c1, c2, c3, c4) * 0.125;

  return accum;
}

@vertex
fn vsMain(@builtin(vertex_index) vertexIndex: u32) -> @builtin(position) vec4<f32> {
  var positions = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(3.0, -1.0),
    vec2<f32>(-1.0, 3.0)
  );

  return vec4<f32>(positions[vertexIndex], 0.0, 1.0);
}

@fragment
fn fsMain(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  let uv = position.xy * uniforms.resolution.zw;
  let time = uniforms.paramsA.x;
  let opacity = saturate(uniforms.paramsA.y);

  let c0 = interpolatedPaletteColor(0u);
  let c1 = interpolatedPaletteColor(1u);
  let c2 = interpolatedPaletteColor(2u);
  let c3 = interpolatedPaletteColor(3u);
  let c4 = interpolatedPaletteColor(4u);

  var color = blurredGradientField(uv, time, c0, c1, c2, c3, c4);
  color = saturate3(color);

  let baseColor = vec3<f32>(0.03, 0.035, 0.045);
  let finalColor = mix(baseColor, color, opacity);

  return vec4<f32>(finalColor, 1.0);
}
`;
