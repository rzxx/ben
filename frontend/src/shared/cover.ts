export type CoverVariant = "original" | "player" | "grid" | "detail";

const warmedCoverSources = new Set<string>();

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

export function warmCoverURL(source?: string): void {
  if (!source || typeof window === "undefined" || typeof Image === "undefined") {
    return;
  }

  if (warmedCoverSources.has(source)) {
    return;
  }

  warmedCoverSources.add(source);

  const preloader = new Image();
  preloader.src = source;
  if (typeof preloader.decode === "function") {
    void preloader.decode().catch(() => undefined);
  }
}

export function warmCoverPath(coverPath?: string, variant: CoverVariant = "original"): void {
  warmCoverURL(coverPathToURL(coverPath, variant));
}
