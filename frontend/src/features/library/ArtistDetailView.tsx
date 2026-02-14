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
    return <p className="text-theme-400 text-sm">Loading artist...</p>;
  }

  const artist = props.artistDetail;

  return (
    <section className="">
      <button
        type="button"
        onClick={props.onBack}
        className="text-theme-400 hover:text-theme-200 inline-flex w-fit items-center gap-2 rounded-md px-1 py-1 text-sm transition-colors"
      >
        <ArrowLeft size={14} />
        Back to artists
      </button>

      <div className="border-theme-800 bg-theme-950/15 rounded-xl border p-4">
        <p className="text-theme-400 text-xs tracking-wide uppercase">Artist</p>
        <h1 className="text-theme-100 text-2xl font-semibold">{artist.name}</h1>
        <p className="text-theme-400 text-sm">
          {artist.albumCount} albums - {artist.trackCount} tracks
        </p>
        <button
          type="button"
          onClick={() => void props.onPlayArtist(artist.name)}
          className="bg-theme-100 text-theme-900 hover:bg-theme-200 mt-3 inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium"
        >
          <Play size={16} />
          Play Artist Songs
        </button>
      </div>

      <section className="border-theme-800 bg-theme-950/15 rounded-xl border p-4">
        <h2 className="text-theme-100 mb-3 text-sm font-semibold">
          Most Liked Tracks
        </h2>
        {props.topTracks.length === 0 ? (
          <p className="text-theme-400 text-sm">
            No listening stats yet for this artist.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {props.topTracks.slice(0, 5).map((track, index) => (
              <li
                key={track.trackId}
                className="border-theme-800 bg-theme-950/15 flex items-center gap-3 rounded-md border px-3 py-2"
              >
                <p className="text-theme-500 w-6 text-xs">{index + 1}</p>
                <div className="min-w-0 flex-1">
                  <p className="text-theme-100 truncate text-sm">
                    {track.title}
                  </p>
                  <p className="text-theme-400 truncate text-xs">
                    {track.album}
                  </p>
                </div>
                <p className="text-theme-500 text-xs">
                  {props.formatPlayedTime(track.playedMs)}
                </p>
                <button
                  type="button"
                  onClick={() =>
                    void props.onPlayTopTrack(artist.name, track.trackId)
                  }
                  className="text-theme-500 hover:text-theme-200 rounded p-2 transition-colors"
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
        <h2 className="text-theme-100 text-sm font-semibold">Albums</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {artist.albums.map((album) => (
            <button
              key={`${album.albumArtist}-${album.title}`}
              type="button"
              onClick={() => props.onSelectAlbum(album)}
              className="border-theme-800 bg-theme-950/15 hover:border-theme-600 rounded-lg border p-3 text-left transition"
            >
              <CoverArt
                coverPath={album.coverPath}
                alt={`${album.title} cover`}
                className="mb-2 aspect-square w-full rounded-md"
              />
              <p className="text-theme-100 truncate text-sm font-medium">
                {album.title}
              </p>
              <p className="text-theme-400 truncate text-xs">
                {album.year ?? "Unknown year"}
              </p>
            </button>
          ))}
        </div>
      </section>
    </section>
  );
}
