fn saturate(value: f32) -> f32 {
  return clamp(value, 0.0, 1.0);
}

fn levelWeight(level: f32, strength: f32, curve: f32) -> f32 {
  return strength * pow(level + 0.25, -curve);
}

@fragment
fn fsMain(in: VsOut) -> @location(0) vec4<f32> {
  let radius = max(0.0, uniforms.params.x);
  let curve = max(0.2, uniforms.params.y);
  let activeLevels = clamp(uniforms.params.z, 0.0, 5.0);
  let strength = saturate(radius / 8.0);

  let base = textureSample(baseTexture, inputSampler, in.uv).rgb;
  var color = base * mix(1.0, 0.42, strength);
  var weight = mix(1.0, 0.42, strength);

  if (activeLevels >= 1.0) {
    let w = levelWeight(1.0, strength, curve);
    color += textureSample(mip1Texture, inputSampler, in.uv).rgb * w;
    weight += w;
  }

  if (activeLevels >= 2.0) {
    let w = levelWeight(2.0, strength, curve);
    color += textureSample(mip2Texture, inputSampler, in.uv).rgb * w;
    weight += w;
  }

  if (activeLevels >= 3.0) {
    let w = levelWeight(3.0, strength, curve);
    color += textureSample(mip3Texture, inputSampler, in.uv).rgb * w;
    weight += w;
  }

  if (activeLevels >= 4.0) {
    let w = levelWeight(4.0, strength, curve);
    color += textureSample(mip4Texture, inputSampler, in.uv).rgb * w;
    weight += w;
  }

  if (activeLevels >= 5.0) {
    let w = levelWeight(5.0, strength, curve);
    color += textureSample(mip5Texture, inputSampler, in.uv).rgb * w;
    weight += w;
  }

  return vec4<f32>(color / max(0.0001, weight), 1.0);
}
