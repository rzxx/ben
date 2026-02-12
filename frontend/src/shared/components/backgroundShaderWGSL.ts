export const backgroundShaderWGSL = /* wgsl */ `
struct Uniforms {
  resolution: vec4<f32>,
  paramsA: vec4<f32>,
  paramsB: vec4<f32>,
  paramsC: vec4<f32>,
  fromColors: array<vec4<f32>, 4>,
  toColors: array<vec4<f32>, 4>,
}

@group(0) @binding(0)
var<uniform> uniforms: Uniforms;

fn saturate(value: f32) -> f32 {
  return clamp(value, 0.0, 1.0);
}

fn saturate3(value: vec3<f32>) -> vec3<f32> {
  return clamp(value, vec3<f32>(0.0), vec3<f32>(1.0));
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

fn fbm(point: vec2<f32>) -> f32 {
  var p = point;
  var value = 0.0;
  var amplitude = 0.5;

  for (var i = 0; i < 5; i = i + 1) {
    value += amplitude * perlinNoise(p);
    p = p * 2.03 + vec2<f32>(17.17, 9.73);
    amplitude *= 0.5;
  }

  return value;
}

fn interpolatedPaletteColor(index: u32) -> vec3<f32> {
  let mixAmount = smoothstep(0.0, 1.0, saturate(uniforms.paramsC.y));
  let fromLab = srgbToOklab(uniforms.fromColors[index].xyz);
  let toLab = srgbToOklab(uniforms.toColors[index].xyz);
  return saturate3(oklabToSrgb(mix(fromLab, toLab, mixAmount)));
}

fn gradientField(uv: vec2<f32>, time: f32) -> vec3<f32> {
  let noiseScale = max(0.1, uniforms.paramsA.z);
  let flowSpeed = uniforms.paramsA.w;
  let warpStrength = uniforms.paramsB.x;

  let aspect = uniforms.resolution.x / max(uniforms.resolution.y, 1.0);
  var p = vec2<f32>((uv.x - 0.5) * aspect + 0.5, uv.y);
  p = p * noiseScale + vec2<f32>(time * flowSpeed * 0.07, -time * flowSpeed * 0.05);

  let warp = vec2<f32>(fbm(p + vec2<f32>(2.3, 1.7)), fbm(p + vec2<f32>(-3.2, 4.1))) - vec2<f32>(0.5);
  let q = p + warp * warpStrength * 3.0;

  let n0 = fbm(q + vec2<f32>(0.0, time * flowSpeed * 0.05));
  let n1 = fbm(q * 1.35 - vec2<f32>(time * flowSpeed * 0.06, -1.9));
  let n2 = fbm(q * 1.9 + vec2<f32>(2.1, -time * flowSpeed * 0.05));
  let n3 = fbm(q * 2.45 + vec2<f32>(-2.8, 3.6));

  var weights = max(vec4<f32>(n0, n1, n2, n3), vec4<f32>(0.0001));
  let sum = weights.x + weights.y + weights.z + weights.w;
  weights = weights / sum;

  let c0 = interpolatedPaletteColor(0u);
  let c1 = interpolatedPaletteColor(1u);
  let c2 = interpolatedPaletteColor(2u);
  let c3 = interpolatedPaletteColor(3u);

  return c0 * weights.x + c1 * weights.y + c2 * weights.z + c3 * weights.w;
}

fn blurredGradientField(uv: vec2<f32>, time: f32) -> vec3<f32> {
  let blurRadius = max(0.0, uniforms.paramsB.y);
  let invResolution = uniforms.resolution.zw;

  if (blurRadius <= 0.001) {
    return gradientField(uv, time);
  }

  let offset = invResolution * blurRadius * 2.0;
  var accum = gradientField(uv, time) * 0.24;

  accum += gradientField(uv + vec2<f32>(offset.x, 0.0), time) * 0.12;
  accum += gradientField(uv + vec2<f32>(-offset.x, 0.0), time) * 0.12;
  accum += gradientField(uv + vec2<f32>(0.0, offset.y), time) * 0.12;
  accum += gradientField(uv + vec2<f32>(0.0, -offset.y), time) * 0.12;

  accum += gradientField(uv + vec2<f32>(offset.x, offset.y), time) * 0.07;
  accum += gradientField(uv + vec2<f32>(-offset.x, offset.y), time) * 0.07;
  accum += gradientField(uv + vec2<f32>(offset.x, -offset.y), time) * 0.07;
  accum += gradientField(uv + vec2<f32>(-offset.x, -offset.y), time) * 0.07;

  return accum;
}

fn grainValue(uv: vec2<f32>, time: f32) -> f32 {
  let grainScale = max(0.1, uniforms.paramsB.w);
  let grainSpeed = uniforms.paramsC.x;
  let p = uv * uniforms.resolution.xy / 320.0 * grainScale * 18.0 + vec2<f32>(time * grainSpeed * 0.31, -time * grainSpeed * 0.27);
  return perlinNoise(p * 3.1) - 0.5;
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

  var color = blurredGradientField(uv, time);
  let grain = grainValue(uv, time) * uniforms.paramsB.z;
  color += vec3<f32>(grain);
  color = saturate3(color);

  let baseColor = vec3<f32>(0.03, 0.035, 0.045);
  let finalColor = mix(baseColor, color, opacity);

  return vec4<f32>(finalColor, 1.0);
}
`;
