float scalarField(vec2 point, float time, float flowSpeed, float noiseScale) {
  vec2 q = point * noiseScale;
  float t = time * (0.24 + flowSpeed * 0.42);
  float feedback = 0.0;

  for (int i = 0; i < 2; i += 1) {
    float fi = float(i);
    float sinTerm = sin(q.y * (3.2 + fi * 1.1) + t + feedback * 1.6);
    float cosTerm = cos(q.x * (2.8 + fi * 1.2) - t * 1.1 - feedback * 1.2);

    q += vec2(sinTerm, cosTerm) * (0.25 - fi * 0.06);
    feedback += sin((q.x + q.y) * (2.35 + fi) + t * (0.72 + fi * 0.18));
  }

  float n = perlinNoise(q * 1.8 + vec2(t * 0.9, -t * 0.75)) * 2.0 - 1.0;
  float wave = sin(q.x * 4.4 - q.y * 3.7 + t * 1.35);
  return feedback * 0.48 + n * 0.43 + wave * 0.24;
}
