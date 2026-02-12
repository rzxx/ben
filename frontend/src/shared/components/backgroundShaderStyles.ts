import { CSSProperties } from "react";
import { ShaderColorSet } from "../store/backgroundShaderStore";
import { clamp } from "./backgroundShaderRuntimeUtils";

export function buildFallbackStyle(
  colors: ShaderColorSet,
  opacity: number,
): CSSProperties {
  const c0 = toCssColor(colors[0], 0.75);
  const c1 = toCssColor(colors[1], 0.7);
  const c2 = toCssColor(colors[2], 0.68);
  const c3 = toCssColor(colors[3], 0.85);
  const c4 = toCssColor(colors[4], 0.64);
  const safeOpacity = clamp(opacity, 0, 1);

  return {
    backgroundColor: "#07090d",
    backgroundImage: `radial-gradient(circle at 16% 20%, ${c0} 0%, transparent 48%), radial-gradient(circle at 84% 26%, ${c1} 0%, transparent 44%), radial-gradient(circle at 24% 88%, ${c2} 0%, transparent 40%), radial-gradient(circle at 58% 62%, ${c4} 0%, transparent 46%), linear-gradient(140deg, ${c3} 0%, #07090d 92%)`,
    opacity: safeOpacity,
  };
}

export function buildGrainStyle(
  settings: {
    grainStrength: number;
    grainScale: number;
  },
  grainTextureUrl: string,
): CSSProperties {
  const textureScale = clamp(settings.grainScale, 0.1, 8);
  const grainOpacity = clamp(settings.grainStrength * 4.4, 0, 0.38);
  const grainTileSize = Math.max(32, Math.round(256 / textureScale));

  return {
    opacity: grainOpacity,
    backgroundImage: grainTextureUrl ? `url(${grainTextureUrl})` : "none",
    backgroundRepeat: "repeat",
    backgroundSize: `${grainTileSize}px ${grainTileSize}px`,
    mixBlendMode: "soft-light",
  };
}

export function createNoiseTextureDataURL(size: number): string {
  if (typeof document === "undefined") {
    return "";
  }

  const safeSize = Math.max(16, Math.floor(size));
  const canvas = document.createElement("canvas");
  canvas.width = safeSize;
  canvas.height = safeSize;

  const context = canvas.getContext("2d");
  if (!context) {
    return "";
  }

  const imageData = context.createImageData(safeSize, safeSize);
  const values = imageData.data;

  for (let i = 0; i < values.length; i += 4) {
    const grain = 96 + Math.floor(Math.random() * 64);
    values[i] = grain;
    values[i + 1] = grain;
    values[i + 2] = grain;
    values[i + 3] = 255;
  }

  context.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}

function toCssColor(color: [number, number, number], alpha: number): string {
  const r = Math.round(clamp(color[0], 0, 1) * 255);
  const g = Math.round(clamp(color[1], 0, 1) * 255);
  const b = Math.round(clamp(color[2], 0, 1) * 255);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
