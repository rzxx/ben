float saturateMip(float value) {
  return clamp(value, 0.0, 1.0);
}

float levelWeight(float level, float strength, float curve) {
  return strength * pow(level + 0.25, -curve);
}

void main() {
  float radius = max(0.0, uniforms.params.x);
  float curve = max(0.2, uniforms.params.y);
  float activeLevels = clamp(uniforms.params.z, 0.0, 5.0);
  float strength = saturateMip(radius / 8.0);

  vec3 base = texture(baseTexture, vUv).rgb;
  vec3 color = base * mix(1.0, 0.42, strength);
  float weight = mix(1.0, 0.42, strength);

  if (activeLevels >= 1.0) {
    float w = levelWeight(1.0, strength, curve);
    color += texture(mip1Texture, vUv).rgb * w;
    weight += w;
  }

  if (activeLevels >= 2.0) {
    float w = levelWeight(2.0, strength, curve);
    color += texture(mip2Texture, vUv).rgb * w;
    weight += w;
  }

  if (activeLevels >= 3.0) {
    float w = levelWeight(3.0, strength, curve);
    color += texture(mip3Texture, vUv).rgb * w;
    weight += w;
  }

  if (activeLevels >= 4.0) {
    float w = levelWeight(4.0, strength, curve);
    color += texture(mip4Texture, vUv).rgb * w;
    weight += w;
  }

  if (activeLevels >= 5.0) {
    float w = levelWeight(5.0, strength, curve);
    color += texture(mip5Texture, vUv).rgb * w;
    weight += w;
  }

  fragColor = vec4(color / max(0.0001, weight), 1.0);
}
