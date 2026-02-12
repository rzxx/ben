fn srgbToLinear(value: vec3<f32>) -> vec3<f32> {
  let low = value / 12.92;
  let high = pow((value + vec3<f32>(0.055)) / vec3<f32>(1.055), vec3<f32>(2.4));
  let useHigh = step(vec3<f32>(0.04045), value);
  return mix(low, high, useHigh);
}

fn linearToSrgb(value: vec3<f32>) -> vec3<f32> {
  let low = value * 12.92;
  let high = vec3<f32>(1.055) * pow(max(value, vec3<f32>(0.0)), vec3<f32>(1.0 / 2.4)) - vec3<f32>(0.055);
  let useHigh = step(vec3<f32>(0.0031308), value);
  return mix(low, high, useHigh);
}

fn linearToOklab(value: vec3<f32>) -> vec3<f32> {
  let l = 0.4122214708 * value.r + 0.5363325363 * value.g + 0.0514459929 * value.b;
  let m = 0.2119034982 * value.r + 0.6806995451 * value.g + 0.1073969566 * value.b;
  let s = 0.0883024619 * value.r + 0.2817188376 * value.g + 0.6299787005 * value.b;

  let lRoot = pow(max(l, 0.0), 1.0 / 3.0);
  let mRoot = pow(max(m, 0.0), 1.0 / 3.0);
  let sRoot = pow(max(s, 0.0), 1.0 / 3.0);

  return vec3<f32>(
    0.2104542553 * lRoot + 0.7936177850 * mRoot - 0.0040720468 * sRoot,
    1.9779984951 * lRoot - 2.4285922050 * mRoot + 0.4505937099 * sRoot,
    0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.8086757660 * sRoot
  );
}

fn oklabToLinear(value: vec3<f32>) -> vec3<f32> {
  let lPrime = value.x + 0.3963377774 * value.y + 0.2158037573 * value.z;
  let mPrime = value.x - 0.1055613458 * value.y - 0.0638541728 * value.z;
  let sPrime = value.x - 0.0894841775 * value.y - 1.2914855480 * value.z;

  let l = lPrime * lPrime * lPrime;
  let m = mPrime * mPrime * mPrime;
  let s = sPrime * sPrime * sPrime;

  return vec3<f32>(
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
  );
}

fn srgbToOklab(value: vec3<f32>) -> vec3<f32> {
  return linearToOklab(srgbToLinear(value));
}

fn oklabToSrgb(value: vec3<f32>) -> vec3<f32> {
  return linearToSrgb(oklabToLinear(value));
}
