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
    <section className="">
      <h1 className="mb-4 text-xl font-semibold text-neutral-100">Albums</h1>
      <div className="grid grid-cols-2 gap-8 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
        {props.albums.map((album) => (
          <button
            key={`${album.albumArtist}-${album.title}`}
            type="button"
            onClick={() => props.onSelectAlbum(album)}
            className="text-left"
          >
            <CoverArt
              coverPath={album.coverPath}
              alt={`${album.title} cover`}
              className="mb-2 aspect-square rounded-lg border border-white/7"
            />
            <p className="line-clamp-1 text-base font-medium text-neutral-100">
              {album.title}
            </p>
            <p className="line-clamp-1 text-xs text-neutral-400">
              {album.albumArtist}
            </p>
          </button>
        ))}
      </div>
    </section>
  );
}
