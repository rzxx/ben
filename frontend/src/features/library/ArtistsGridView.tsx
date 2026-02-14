import { LibraryArtist } from "../types";

type ArtistsGridViewProps = {
  artists: LibraryArtist[];
  onSelectArtist: (artistName: string) => void;
};

export function ArtistsGridView(props: ArtistsGridViewProps) {
  if (props.artists.length === 0) {
    return <p className="text-theme-400 text-sm">No artists found.</p>;
  }

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-theme-100 text-xl font-semibold">Artists</h1>
      <div className="grid grid-cols-2 gap-8 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
        {props.artists.map((artist) => (
          <button
            key={artist.name}
            type="button"
            onClick={() => props.onSelectArtist(artist.name)}
            className="bg-theme-950/15 rounded-lg border border-white/7 p-3 text-left transition hover:border-white/21"
          >
            <div className="bg-theme-800 text-theme-200 mb-3 flex h-20 w-20 items-center justify-center rounded-full text-2xl font-semibold">
              {artist.name.charAt(0).toUpperCase()}
            </div>
            <p className="text-theme-100 line-clamp-1 text-sm font-medium">
              {artist.name}
            </p>
            <p className="text-theme-400 line-clamp-1 text-xs">
              {artist.albumCount} albums - {artist.trackCount} tracks
            </p>
          </button>
        ))}
      </div>
    </section>
  );
}
