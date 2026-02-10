import { LibraryArtist } from "../types";

type ArtistsGridViewProps = {
  artists: LibraryArtist[];
  onSelectArtist: (artistName: string) => void;
};

export function ArtistsGridView(props: ArtistsGridViewProps) {
  if (props.artists.length === 0) {
    return <p className="text-sm text-zinc-400">No artists found.</p>;
  }

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-zinc-100">Artists</h1>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {props.artists.map((artist) => (
          <button
            key={artist.name}
            type="button"
            onClick={() => props.onSelectArtist(artist.name)}
            className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-3 text-left transition hover:border-zinc-600"
          >
            <div className="mb-3 flex h-20 w-20 items-center justify-center rounded-full bg-zinc-800 text-2xl font-semibold text-zinc-200">
              {artist.name.charAt(0).toUpperCase()}
            </div>
            <p className="truncate text-sm font-medium text-zinc-100">
              {artist.name}
            </p>
            <p className="truncate text-xs text-zinc-400">
              {artist.albumCount} albums - {artist.trackCount} tracks
            </p>
          </button>
        ))}
      </div>
    </section>
  );
}
