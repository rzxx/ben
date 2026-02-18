layout(std140) uniform TemporalUniforms {
  vec4 paramsA;
  vec4 paramsB;
  vec4 paramsC;
} uniforms;

uniform sampler2D currentTexture;
uniform sampler2D historyTexture;
uniform sampler2D blueNoiseTexture;

in vec2 vUv;
out vec4 fragColor;
