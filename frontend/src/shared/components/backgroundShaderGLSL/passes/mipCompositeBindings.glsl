layout(std140) uniform MipCompositeUniforms {
  vec4 params;
} uniforms;

uniform sampler2D baseTexture;
uniform sampler2D mip1Texture;
uniform sampler2D mip2Texture;
uniform sampler2D mip3Texture;
uniform sampler2D mip4Texture;
uniform sampler2D mip5Texture;

in vec2 vUv;
out vec4 fragColor;
