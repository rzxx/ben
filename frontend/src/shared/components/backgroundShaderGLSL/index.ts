import { composeGLSL } from "./composeGLSL";
import colorSpaceGLSL from "./common/colorSpace.glsl?raw";
import fullscreenTriangleVertexGLSL from "./common/fullscreenTriangle.vert.glsl?raw";
import mathGLSL from "./common/math.glsl?raw";
import noiseGLSL from "./common/noise.glsl?raw";
import backgroundCompositeBindingsGLSL from "./passes/backgroundCompositeBindings.glsl?raw";
import backgroundCompositeFragmentGLSL from "./passes/backgroundComposite.frag.glsl?raw";
import dualKawaseDownFragmentGLSL from "./passes/dualKawaseDown.frag.glsl?raw";
import dualKawaseUpFragmentGLSL from "./passes/dualKawaseUp.frag.glsl?raw";
import mipCompositeBindingsGLSL from "./passes/mipCompositeBindings.glsl?raw";
import mipCompositeFragmentGLSL from "./passes/mipComposite.frag.glsl?raw";
import mipDownsampleFragmentGLSL from "./passes/mipDownsample.frag.glsl?raw";
import blurPassBindingsGLSL from "./passes/shared/blurPassBindings.glsl?raw";
import temporalResolveBindingsGLSL from "./passes/temporalResolveBindings.glsl?raw";
import temporalResolveColorGLSL from "./passes/temporalResolveColor.glsl?raw";
import temporalResolveFragmentGLSL from "./passes/temporalResolve.frag.glsl?raw";
import sceneEntryFragmentGLSL from "./scene/entry.frag.glsl?raw";
import sceneEntryVertexGLSL from "./scene/entry.vert.glsl?raw";
import sceneLegacyFeedbackGLSL from "./scene/legacyFeedback.glsl?raw";
import scenePaletteGLSL from "./scene/palette.glsl?raw";
import sceneScalarFieldGLSL from "./scene/scalarField.glsl?raw";
import sceneStableLayeredGLSL from "./scene/stableLayered.glsl?raw";
import sceneUniformsGLSL from "./scene/uniforms.glsl?raw";

const vertexPrelude = `#version 300 es
precision highp float;
precision highp int;`;

const fragmentPrelude = `#version 300 es
precision highp float;
precision highp int;`;

export const passVertexGLSL = composeGLSL([
  vertexPrelude,
  fullscreenTriangleVertexGLSL,
]);

export const sceneVertexGLSL = composeGLSL([vertexPrelude, sceneEntryVertexGLSL]);

export const sceneFragmentGLSL = composeGLSL([
  fragmentPrelude,
  sceneUniformsGLSL,
  mathGLSL,
  colorSpaceGLSL,
  noiseGLSL,
  scenePaletteGLSL,
  sceneScalarFieldGLSL,
  sceneLegacyFeedbackGLSL,
  sceneStableLayeredGLSL,
  sceneEntryFragmentGLSL,
]);

export const dualKawaseDownFragmentShaderGLSL = composeGLSL([
  fragmentPrelude,
  blurPassBindingsGLSL,
  dualKawaseDownFragmentGLSL,
]);

export const dualKawaseUpFragmentShaderGLSL = composeGLSL([
  fragmentPrelude,
  blurPassBindingsGLSL,
  dualKawaseUpFragmentGLSL,
]);

export const mipDownsampleFragmentShaderGLSL = composeGLSL([
  fragmentPrelude,
  blurPassBindingsGLSL,
  mipDownsampleFragmentGLSL,
]);

export const mipCompositeFragmentShaderGLSL = composeGLSL([
  fragmentPrelude,
  mipCompositeBindingsGLSL,
  mipCompositeFragmentGLSL,
]);

export const temporalResolveFragmentShaderGLSL = composeGLSL([
  fragmentPrelude,
  temporalResolveBindingsGLSL,
  temporalResolveColorGLSL,
  temporalResolveFragmentGLSL,
]);

export const backgroundCompositeFragmentShaderGLSL = composeGLSL([
  fragmentPrelude,
  backgroundCompositeBindingsGLSL,
  backgroundCompositeFragmentGLSL,
]);
