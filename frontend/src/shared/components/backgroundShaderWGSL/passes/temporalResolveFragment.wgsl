@fragment
fn fsMain(in: VsOut) -> @location(0) vec4<f32> {
  let historyWeight = clamp(uniforms.params.x, 0.0, 0.98);
  let response = max(uniforms.params.y, 0.001);
  let clampRange = max(uniforms.params.z, 0.001);
  let enabled = uniforms.params.w;

  let currentSrgb = textureSample(currentTexture, inputSampler, in.uv).rgb;
  if (enabled < 0.5) {
    return vec4<f32>(currentSrgb, 1.0);
  }

  let historySrgb = textureSample(historyTexture, inputSampler, in.uv).rgb;
  let current = srgbToLinear3(currentSrgb);
  let history = srgbToLinear3(historySrgb);
  let delta = abs(current - history);
  let lumaDelta = dot(delta, vec3<f32>(0.2126, 0.7152, 0.0722));
  let chromaDelta = length(delta - vec3<f32>(lumaDelta));
  let reactive = saturate((lumaDelta * 1.25 + chromaDelta * 0.9) / response);

  let blendWeight = historyWeight * (1.0 - reactive);
  let adaptiveClamp = clampRange * (0.35 + reactive * 0.65);
  let clampedHistory = clamp(
    history,
    current - vec3<f32>(adaptiveClamp),
    current + vec3<f32>(adaptiveClamp)
  );

  let resolvedLinear = mix(current, clampedHistory, blendWeight);
  let resolvedSrgb = saturate3(linearToSrgb3(resolvedLinear));
  return vec4<f32>(resolvedSrgb, 1.0);
}
