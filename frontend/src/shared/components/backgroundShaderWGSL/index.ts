import backgroundCompositeBindingsWGSL from "./passes/backgroundCompositeBindings.wgsl?raw";
import backgroundCompositeFragmentWGSL from "./passes/backgroundCompositeFragment.wgsl?raw";
import dualKawaseDownFragmentWGSL from "./passes/dualKawaseDownFragment.wgsl?raw";
import dualKawaseUpFragmentWGSL from "./passes/dualKawaseUpFragment.wgsl?raw";
import mipCompositeBindingsWGSL from "./passes/mipCompositeBindings.wgsl?raw";
import mipCompositeFragmentWGSL from "./passes/mipCompositeFragment.wgsl?raw";
import mipDownsampleFragmentWGSL from "./passes/mipDownsampleFragment.wgsl?raw";
import blurPassBindingsWGSL from "./passes/shared/blurPassBindings.wgsl?raw";
import temporalResolveBindingsWGSL from "./passes/temporalResolveBindings.wgsl?raw";
import temporalResolveColorWGSL from "./passes/temporalResolveColor.wgsl?raw";
import temporalResolveFragmentWGSL from "./passes/temporalResolveFragment.wgsl?raw";
import { composeWGSL } from "./composeWGSL";
import colorSpaceWGSL from "./common/colorSpace.wgsl?raw";
import fullscreenTriangleWGSL from "./common/fullscreenTriangle.wgsl?raw";
import mathWGSL from "./common/math.wgsl?raw";
import noiseWGSL from "./common/noise.wgsl?raw";
import sceneEntryWGSL from "./scene/entry.wgsl?raw";
import sceneLegacyFeedbackWGSL from "./scene/legacyFeedback.wgsl?raw";
import scenePaletteWGSL from "./scene/palette.wgsl?raw";
import sceneScalarFieldWGSL from "./scene/scalarField.wgsl?raw";
import sceneStableLayeredWGSL from "./scene/stableLayered.wgsl?raw";
import sceneUniformsWGSL from "./scene/uniforms.wgsl?raw";

export const backgroundSceneWGSL = composeWGSL([
  sceneUniformsWGSL,
  mathWGSL,
  colorSpaceWGSL,
  noiseWGSL,
  scenePaletteWGSL,
  sceneScalarFieldWGSL,
  sceneLegacyFeedbackWGSL,
  sceneStableLayeredWGSL,
  sceneEntryWGSL,
]);

export const dualKawaseDownWGSL = composeWGSL([
  blurPassBindingsWGSL,
  fullscreenTriangleWGSL,
  dualKawaseDownFragmentWGSL,
]);

export const dualKawaseUpWGSL = composeWGSL([
  blurPassBindingsWGSL,
  fullscreenTriangleWGSL,
  dualKawaseUpFragmentWGSL,
]);

export const mipDownsampleWGSL = composeWGSL([
  blurPassBindingsWGSL,
  fullscreenTriangleWGSL,
  mipDownsampleFragmentWGSL,
]);

export const mipCompositeWGSL = composeWGSL([
  mipCompositeBindingsWGSL,
  fullscreenTriangleWGSL,
  mipCompositeFragmentWGSL,
]);

export const temporalResolveWGSL = composeWGSL([
  temporalResolveBindingsWGSL,
  temporalResolveColorWGSL,
  fullscreenTriangleWGSL,
  temporalResolveFragmentWGSL,
]);

export const backgroundCompositeWGSL = composeWGSL([
  backgroundCompositeBindingsWGSL,
  fullscreenTriangleWGSL,
  backgroundCompositeFragmentWGSL,
]);
