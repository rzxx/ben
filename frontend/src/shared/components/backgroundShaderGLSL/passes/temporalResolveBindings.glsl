layout(std140) uniform TemporalUniforms {
  vec4 paramsA;
} uniforms;

uniform sampler2D currentTexture;
uniform sampler2D historyTexture;

in vec2 vUv;
out vec4 fragColor;
