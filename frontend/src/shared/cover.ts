export function coverPathToURL(coverPath?: string): string | undefined {
  const trimmed = coverPath?.trim();
  if (!trimmed) {
    return undefined;
  }

  return `/covers?path=${encodeURIComponent(trimmed)}`;
}
