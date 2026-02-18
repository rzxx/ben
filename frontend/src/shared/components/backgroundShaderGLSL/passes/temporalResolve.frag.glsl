void main() {
  float historyWeight = clamp(uniforms.paramsA.x, 0.0, 0.98);
  float response = max(uniforms.paramsA.y, 0.001);
  float clampRange = max(uniforms.paramsA.z, 0.001);
  float enabled = uniforms.paramsA.w;

  vec3 currentSrgb = texture(currentTexture, vUv).rgb;
  if (enabled < 0.5) {
    fragColor = vec4(currentSrgb, 1.0);
    return;
  }

  vec3 historySrgb = texture(historyTexture, vUv).rgb;
  vec3 current = srgbToLinear3(currentSrgb);
  vec3 history = srgbToLinear3(historySrgb);
  vec3 delta = abs(current - history);
  float lumaDelta = dot(delta, vec3(0.2126, 0.7152, 0.0722));
  float chromaDelta = length(delta - vec3(lumaDelta));
  float reactive = saturateTemporal((lumaDelta * 1.25 + chromaDelta * 0.9) / response);

  float blendWeight = historyWeight * (1.0 - reactive);

  float adaptiveClamp = clampRange * (0.35 + reactive * 0.65);
  vec3 clampedHistory = clamp(
    history,
    current - vec3(adaptiveClamp),
    current + vec3(adaptiveClamp)
  );

  vec3 resolvedLinear = mix(current, clampedHistory, blendWeight);
  vec3 resolvedSrgb = saturate3Temporal(linearToSrgb3(resolvedLinear));
  fragColor = vec4(resolvedSrgb, 1.0);
}
