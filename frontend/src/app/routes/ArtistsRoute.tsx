import { useMemo } from "react";
import { useLocation } from "wouter";
import { ArtistsGridView } from "../../features/library/ArtistsGridView";
import { useLibrary } from "../providers/LibraryContext";
import { buildArtistDetailPath } from "../utils/routePaths";

export function ArtistsRoute() {
  const [, navigate] = useLocation();
  const { state: libraryState } = useLibrary();

  const sortedArtists = useMemo(
    () => [...libraryState.artistsPage.items].sort((a, b) => a.name.localeCompare(b.name)),
    [libraryState.artistsPage.items],
  );

  return (
    <ArtistsGridView
      artists={sortedArtists}
      onSelectArtist={(artistName) => {
        navigate(buildArtistDetailPath(artistName));
      }}
    />
  );
}
