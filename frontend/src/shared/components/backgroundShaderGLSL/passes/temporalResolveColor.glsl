float saturateTemporal(float value) {
  return clamp(value, 0.0, 1.0);
}

vec3 saturate3Temporal(vec3 value) {
  return clamp(value, vec3(0.0), vec3(1.0));
}

vec3 srgbToLinear3(vec3 value) {
  vec3 low = value / 12.92;
  vec3 high = pow((value + vec3(0.055)) / vec3(1.055), vec3(2.4));
  vec3 useHigh = step(vec3(0.04045), value);
  return mix(low, high, useHigh);
}

vec3 linearToSrgb3(vec3 value) {
  vec3 low = value * 12.92;
  vec3 high = vec3(1.055) * pow(max(value, vec3(0.0)), vec3(1.0 / 2.4)) - vec3(0.055);
  vec3 useHigh = step(vec3(0.0031308), value);
  return mix(low, high, useHigh);
}
