float saturate(float value) {
  return clamp(value, 0.0, 1.0);
}

vec3 saturate3(vec3 value) {
  return clamp(value, vec3(0.0), vec3(1.0));
}

float softsign(float value) {
  return value / (1.0 + abs(value));
}

vec2 rotate2(vec2 value, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return vec2(value.x * c - value.y * s, value.x * s + value.y * c);
}
