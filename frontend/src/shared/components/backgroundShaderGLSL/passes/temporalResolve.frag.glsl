void main() {
  float historyWeight = clamp(uniforms.paramsA.x, 0.0, 0.98);
  float response = max(uniforms.paramsA.y, 0.001);
  float clampRange = max(uniforms.paramsA.z, 0.001);
  float enabled = uniforms.paramsA.w;
  float frameIndex = max(0.0, uniforms.paramsB.x);
  float renderScale = clamp(uniforms.paramsB.y, 0.2, 1.0);
  float darkStart = max(uniforms.paramsB.z, 0.0001);
  float darkEnd = clamp(uniforms.paramsB.w, 0.0, darkStart);
  float debandMinLsb = max(0.0, uniforms.paramsC.x);
  float debandMaxLsb = max(debandMinLsb, uniforms.paramsC.y);
  float debandTaPreserve = saturateTemporal(uniforms.paramsC.z);
  float debandClampBoost = max(0.0, uniforms.paramsC.w);

  vec3 currentSrgb = texture(currentTexture, vUv).rgb;
  if (enabled < 0.5) {
    fragColor = vec4(currentSrgb, 1.0);
    return;
  }

  vec3 currentLinearRaw = srgbToLinear3(currentSrgb);
  float currentLumaRaw = dot(currentLinearRaw, vec3(0.2126, 0.7152, 0.0722));
  float darkMask = 1.0 - smoothstep(darkEnd, darkStart, currentLumaRaw);
  float flatMask = saturateTemporal(1.0 - fwidth(currentLumaRaw) * 36.0);
  float debandMask = darkMask * flatMask;

  ivec2 noiseSize = textureSize(blueNoiseTexture, 0);
  int frame = int(floor(frameIndex + 0.5));
  ivec2 offset = ivec2((frame * 5) % noiseSize.x, (frame * 3) % noiseSize.y);
  ivec2 pixel = ivec2(gl_FragCoord.xy);
  ivec2 noiseCoord = ivec2(
    (pixel.x + offset.x) % noiseSize.x,
    (pixel.y + offset.y) % noiseSize.y
  );

  float blueNoise = texelFetch(blueNoiseTexture, noiseCoord, 0).r - 0.5;
  float renderScaleBoost = 1.0 + (1.0 - renderScale) * 0.55;
  float ditherAmplitude =
    mix(debandMinLsb / 255.0, debandMaxLsb / 255.0, darkMask) * renderScaleBoost;
  float dither = blueNoise * ditherAmplitude * debandMask;

  vec3 ditheredCurrentSrgb = saturate3Temporal(currentSrgb + vec3(dither));
  vec3 historySrgb = texture(historyTexture, vUv).rgb;
  vec3 current = srgbToLinear3(ditheredCurrentSrgb);
  vec3 history = srgbToLinear3(historySrgb);
  vec3 delta = abs(currentLinearRaw - history);
  float lumaDelta = dot(delta, vec3(0.2126, 0.7152, 0.0722));
  float chromaDelta = length(delta - vec3(lumaDelta));
  float reactive = saturateTemporal((lumaDelta * 1.25 + chromaDelta * 0.9) / response);

  float blendWeight = historyWeight * (1.0 - reactive);
  blendWeight *= 1.0 - debandTaPreserve * debandMask;

  float adaptiveClamp = clampRange * (0.35 + reactive * 0.65);
  adaptiveClamp += ditherAmplitude * debandMask * debandClampBoost;
  vec3 clampedHistory = clamp(
    history,
    current - vec3(adaptiveClamp),
    current + vec3(adaptiveClamp)
  );

  vec3 resolvedLinear = mix(current, clampedHistory, blendWeight);
  vec3 resolvedSrgb = saturate3Temporal(linearToSrgb3(resolvedLinear));
  fragColor = vec4(resolvedSrgb, 1.0);
}
