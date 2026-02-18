export type CoverVariant = "original" | "player" | "grid" | "detail";

export function normalizeCoverVariant(variant?: string): CoverVariant {
  switch ((variant ?? "").trim().toLowerCase()) {
    case "player":
      return "player";
    case "grid":
      return "grid";
    case "detail":
      return "detail";
    default:
      return "original";
  }
}

export function coverPathToURL(
  coverPath?: string,
  variant: CoverVariant = "original",
): string | undefined {
  const trimmed = coverPath?.trim();
  if (!trimmed) {
    return undefined;
  }

  const normalizedVariant = normalizeCoverVariant(variant);
  const encodedPath = encodeURIComponent(trimmed);
  if (normalizedVariant === "original") {
    return `/covers?path=${encodedPath}`;
  }

  return `/covers?path=${encodedPath}&variant=${normalizedVariant}`;
}
