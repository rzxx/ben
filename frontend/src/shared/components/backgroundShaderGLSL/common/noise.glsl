const float noiseHashWrap = 289.0;

float hash21(vec2 value) {
  vec2 wrappedValue = mod(value, noiseHashWrap);
  float dotValue = dot(wrappedValue, vec2(127.1, 311.7));
  return fract(sin(dotValue) * 43758.5453123);
}

vec2 randomGradient(vec2 cell) {
  float angle = 6.28318530718 * hash21(cell);
  return vec2(cos(angle), sin(angle));
}

float perlinNoise(vec2 point) {
  vec2 cell = floor(point);
  vec2 local = fract(point);
  vec2 wrappedCell = mod(cell, noiseHashWrap);

  vec2 g00 = randomGradient(wrappedCell + vec2(0.0, 0.0));
  vec2 g10 = randomGradient(wrappedCell + vec2(1.0, 0.0));
  vec2 g01 = randomGradient(wrappedCell + vec2(0.0, 1.0));
  vec2 g11 = randomGradient(wrappedCell + vec2(1.0, 1.0));

  float d00 = dot(g00, local - vec2(0.0, 0.0));
  float d10 = dot(g10, local - vec2(1.0, 0.0));
  float d01 = dot(g01, local - vec2(0.0, 1.0));
  float d11 = dot(g11, local - vec2(1.0, 1.0));

  vec2 fade = local * local * (vec2(3.0) - vec2(2.0) * local);
  float ix0 = mix(d00, d10, fade.x);
  float ix1 = mix(d01, d11, fade.x);

  return 0.5 + 0.5 * mix(ix0, ix1, fade.y);
}
