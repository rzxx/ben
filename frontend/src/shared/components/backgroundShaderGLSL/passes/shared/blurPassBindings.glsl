layout(std140) uniform BlurUniforms {
  vec4 params;
} uniforms;

uniform sampler2D inputTexture;

in vec2 vUv;
out vec4 fragColor;
