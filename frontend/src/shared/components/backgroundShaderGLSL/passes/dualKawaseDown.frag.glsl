void main() {
  vec2 texel = uniforms.params.xy;
  float offset = max(0.0, uniforms.params.z);
  vec2 delta = texel * offset;

  vec4 color = texture(inputTexture, vUv) * 4.0;
  color += texture(inputTexture, vUv + vec2(delta.x, delta.y));
  color += texture(inputTexture, vUv + vec2(-delta.x, delta.y));
  color += texture(inputTexture, vUv + vec2(delta.x, -delta.y));
  color += texture(inputTexture, vUv + vec2(-delta.x, -delta.y));

  fragColor = color * 0.125;
}
