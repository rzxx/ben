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
