out vec2 vUv;

void main() {
  vec2 clip;
  if (gl_VertexID == 0) {
    clip = vec2(-1.0, -1.0);
  } else if (gl_VertexID == 1) {
    clip = vec2(3.0, -1.0);
  } else {
    clip = vec2(-1.0, 3.0);
  }

  gl_Position = vec4(clip, 0.0, 1.0);
  vUv = vec2(clip.x * 0.5 + 0.5, clip.y * 0.5 + 0.5);
}
