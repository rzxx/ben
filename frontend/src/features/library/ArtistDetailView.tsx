import { ArrowLeft, Play } from "lucide-react";
import { CoverArt } from "../../shared/components/CoverArt";
import { ArtistDetail, ArtistTopTrack, LibraryAlbum } from "../types";

type ArtistDetailViewProps = {
  artistDetail: ArtistDetail | null;
  topTracks: ArtistTopTrack[];
  onBack: () => void;
  onPlayArtist: (artistName: string) => Promise<void>;
  onPlayTopTrack: (artistName: string, trackID: number) => Promise<void>;
  onSelectAlbum: (album: LibraryAlbum) => void;
  formatPlayedTime: (durationMS: number) => string;
};

export function ArtistDetailView(props: ArtistDetailViewProps) {
  if (!props.artistDetail) {
    return <p className="text-sm text-zinc-400">Loading artist...</p>;
  }

  const artist = props.artistDetail;

  return (
    <section className="flex flex-col gap-4">
      <button
        type="button"
        onClick={props.onBack}
        className="inline-flex w-fit items-center gap-2 rounded-md px-1 py-1 text-sm text-zinc-400 transition-colors hover:text-zinc-200"
      >
        <ArrowLeft size={14} />
        Back to artists
      </button>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
        <p className="text-xs tracking-wide text-zinc-400 uppercase">Artist</p>
        <h1 className="text-2xl font-semibold text-zinc-100">{artist.name}</h1>
        <p className="text-sm text-zinc-400">
          {artist.albumCount} albums - {artist.trackCount} tracks
        </p>
        <button
          type="button"
          onClick={() => void props.onPlayArtist(artist.name)}
          className="mt-3 inline-flex items-center gap-2 rounded-md bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-200"
        >
          <Play size={16} />
          Play Artist Songs
        </button>
      </div>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
        <h2 className="mb-3 text-sm font-semibold text-zinc-100">
          Most Liked Tracks
        </h2>
        {props.topTracks.length === 0 ? (
          <p className="text-sm text-zinc-400">
            No listening stats yet for this artist.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {props.topTracks.slice(0, 5).map((track, index) => (
              <li
                key={track.trackId}
                className="flex items-center gap-3 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2"
              >
                <p className="w-6 text-xs text-zinc-500">{index + 1}</p>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-zinc-100">
                    {track.title}
                  </p>
                  <p className="truncate text-xs text-zinc-400">
                    {track.album}
                  </p>
                </div>
                <p className="text-xs text-zinc-500">
                  {props.formatPlayedTime(track.playedMs)}
                </p>
                <button
                  type="button"
                  onClick={() =>
                    void props.onPlayTopTrack(artist.name, track.trackId)
                  }
                  className="rounded p-2 text-zinc-500 transition-colors hover:text-zinc-200"
                  aria-label={`Play ${track.title}`}
                >
                  <Play size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-zinc-100">Albums</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {artist.albums.map((album) => (
            <button
              key={`${album.albumArtist}-${album.title}`}
              type="button"
              onClick={() => props.onSelectAlbum(album)}
              className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-3 text-left transition hover:border-zinc-600"
            >
              <CoverArt
                coverPath={album.coverPath}
                alt={`${album.title} cover`}
                className="mb-2 aspect-square w-full rounded-md"
              />
              <p className="truncate text-sm font-medium text-zinc-100">
                {album.title}
              </p>
              <p className="truncate text-xs text-zinc-400">
                {album.year ?? "Unknown year"}
              </p>
            </button>
          ))}
        </div>
      </section>
    </section>
  );
}
