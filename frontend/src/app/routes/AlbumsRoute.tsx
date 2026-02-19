import { useMemo } from "react";
import { useLocation } from "wouter";
import { AlbumsGridView } from "../../features/library/AlbumsGridView";
import { useLibrary } from "../providers/LibraryContext";
import { buildAlbumDetailPath } from "../utils/routePaths";

export function AlbumsRoute() {
  const [, navigate] = useLocation();
  const { state: libraryState } = useLibrary();

  const sortedAlbums = useMemo(
    () => [...libraryState.albumsPage.items].sort((a, b) => a.title.localeCompare(b.title)),
    [libraryState.albumsPage.items],
  );

  return (
    <AlbumsGridView
      albums={sortedAlbums}
      onSelectAlbum={(album) => {
        navigate(buildAlbumDetailPath(album.title, album.albumArtist));
      }}
    />
  );
}
