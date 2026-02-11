import { CoverArt } from "../../shared/components/CoverArt";
import { LibraryAlbum } from "../types";

type AlbumsGridViewProps = {
  albums: LibraryAlbum[];
  onSelectAlbum: (album: LibraryAlbum) => void;
};

export function AlbumsGridView(props: AlbumsGridViewProps) {
  if (props.albums.length === 0) {
    return <p className="text-sm text-neutral-400">No albums found.</p>;
  }

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-neutral-100">Albums</h1>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {props.albums.map((album) => (
          <button
            key={`${album.albumArtist}-${album.title}`}
            type="button"
            onClick={() => props.onSelectAlbum(album)}
            className="rounded-lg border border-neutral-800 bg-neutral-950/15 p-3 text-left transition hover:border-neutral-600"
          >
            <CoverArt
              coverPath={album.coverPath}
              alt={`${album.title} cover`}
              className="mb-2 aspect-square w-full rounded-md"
            />
            <p className="truncate text-sm font-medium text-neutral-100">
              {album.title}
            </p>
            <p className="truncate text-xs text-neutral-400">
              {album.albumArtist}
            </p>
          </button>
        ))}
      </div>
    </section>
  );
}
