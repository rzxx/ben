export function buildAlbumDetailPath(
  albumTitle: string,
  albumArtist: string,
): string {
  return `/albums/${encodePathSegment(albumArtist)}/${encodePathSegment(albumTitle)}`;
}

export function buildArtistDetailPath(artistName: string): string {
  return `/artists/${encodePathSegment(artistName)}`;
}

export function decodePathSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function encodePathSegment(value: string): string {
  return encodeURIComponent(value.trim());
}
