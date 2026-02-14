import { CoverArt } from "../../shared/components/CoverArt";
import { LibraryAlbum } from "../types";

type AlbumsGridViewProps = {
  albums: LibraryAlbum[];
  onSelectAlbum: (album: LibraryAlbum) => void;
};

export function AlbumsGridView(props: AlbumsGridViewProps) {
  if (props.albums.length === 0) {
    return <p className="text-theme-400 text-sm">No albums found.</p>;
  }

  return (
    <section className="">
      <h1 className="text-theme-100 mb-4 text-xl font-semibold">Albums</h1>
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
            <p className="text-theme-100 line-clamp-1 text-base font-medium">
              {album.title}
            </p>
            <p className="text-theme-400 line-clamp-1 text-xs">
              {album.albumArtist}
            </p>
          </button>
        ))}
      </div>
    </section>
  );
}
