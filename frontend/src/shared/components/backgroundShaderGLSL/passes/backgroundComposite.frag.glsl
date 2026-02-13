void main() {
  float opacity = clamp(uniforms.params.x, 0.0, 1.0);
  vec3 baseColor = uniforms.params.yzw;
  vec3 color = texture(inputTexture, vUv).rgb;
  vec3 finalColor = mix(baseColor, color, opacity);
  fragColor = vec4(finalColor, 1.0);
}
