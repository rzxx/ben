vec3 srgbToLinear(vec3 value) {
  vec3 low = value / 12.92;
  vec3 high = pow((value + vec3(0.055)) / vec3(1.055), vec3(2.4));
  vec3 useHigh = step(vec3(0.04045), value);
  return mix(low, high, useHigh);
}

vec3 linearToSrgb(vec3 value) {
  vec3 low = value * 12.92;
  vec3 high = vec3(1.055) * pow(max(value, vec3(0.0)), vec3(1.0 / 2.4)) - vec3(0.055);
  vec3 useHigh = step(vec3(0.0031308), value);
  return mix(low, high, useHigh);
}

vec3 linearToOklab(vec3 value) {
  float l = 0.4122214708 * value.r + 0.5363325363 * value.g + 0.0514459929 * value.b;
  float m = 0.2119034982 * value.r + 0.6806995451 * value.g + 0.1073969566 * value.b;
  float s = 0.0883024619 * value.r + 0.2817188376 * value.g + 0.6299787005 * value.b;

  float lRoot = pow(max(l, 0.0), 1.0 / 3.0);
  float mRoot = pow(max(m, 0.0), 1.0 / 3.0);
  float sRoot = pow(max(s, 0.0), 1.0 / 3.0);

  return vec3(
    0.2104542553 * lRoot + 0.7936177850 * mRoot - 0.0040720468 * sRoot,
    1.9779984951 * lRoot - 2.4285922050 * mRoot + 0.4505937099 * sRoot,
    0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.8086757660 * sRoot
  );
}

vec3 oklabToLinear(vec3 value) {
  float lPrime = value.x + 0.3963377774 * value.y + 0.2158037573 * value.z;
  float mPrime = value.x - 0.1055613458 * value.y - 0.0638541728 * value.z;
  float sPrime = value.x - 0.0894841775 * value.y - 1.2914855480 * value.z;

  float l = lPrime * lPrime * lPrime;
  float m = mPrime * mPrime * mPrime;
  float s = sPrime * sPrime * sPrime;

  return vec3(
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
  );
}

vec3 srgbToOklab(vec3 value) {
  return linearToOklab(srgbToLinear(value));
}

vec3 oklabToSrgb(vec3 value) {
  return linearToSrgb(oklabToLinear(value));
}
