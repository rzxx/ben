import { ArrowLeft, Play } from "lucide-react";
import { CoverArt } from "../../shared/components/CoverArt";
import { AlbumDetail } from "../types";

type AlbumDetailViewProps = {
  albumDetail: AlbumDetail | null;
  onBack: () => void;
  onPlayAlbum: (albumTitle: string, albumArtist: string) => Promise<void>;
  onPlayTrackFromAlbum: (
    albumTitle: string,
    albumArtist: string,
    trackID: number,
  ) => Promise<void>;
  formatDuration: (durationMS?: number) => string;
};

export function AlbumDetailView(props: AlbumDetailViewProps) {
  if (!props.albumDetail) {
    return <p className="text-sm text-neutral-400">Loading album...</p>;
  }

  const album = props.albumDetail;
  const totalDurationMS = album.tracks.reduce(
    (total, track) => total + (track.durationMs ?? 0),
    0,
  );
  const discCount = Math.max(
    album.tracks.reduce(
      (maxDiscNo, track) => Math.max(maxDiscNo, track.discNo ?? 1),
      1,
    ),
    1,
  );
  const releaseDateLabel = album.year
    ? String(album.year)
    : "Unknown release date";
  const trackCountLabel = `${album.trackCount} ${album.trackCount === 1 ? "track" : "tracks"}`;

  return (
    <section className="">
      <div className="flex gap-6">
        <aside className="sticky top-4 h-fit w-2/5">
          <button
            type="button"
            onClick={props.onBack}
            className="inline-flex w-fit items-center gap-2 rounded-md py-1 text-sm text-neutral-400 transition-colors hover:text-neutral-200"
          >
            <ArrowLeft size={14} />
            Back to albums
          </button>
          <CoverArt
            coverPath={album.coverPath}
            alt={`${album.title} cover`}
            className="mt-4 aspect-square w-full rounded-2xl border border-white/7"
            loading="eager"
          />
          <div className="mt-4 space-y-2">
            <h1 className="text-2xl font-bold text-neutral-100 lg:text-4xl">
              {album.title}
            </h1>
            <p className="text-lg text-neutral-300">{album.albumArtist}</p>
            <p className="text-sm text-neutral-500">
              {releaseDateLabel} - {trackCountLabel}
            </p>

            <button
              type="button"
              onClick={() =>
                void props.onPlayAlbum(album.title, album.albumArtist)
              }
              className="mt-2 inline-flex items-center gap-2 rounded-md bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 transition-colors hover:bg-neutral-200"
            >
              <Play size={16} />
              Play all tracks
            </button>

            <dl className="mt-2 grid grid-cols-2 gap-3 rounded-xl">
              <div>
                <dt className="text-xs tracking-wide text-neutral-500 uppercase">
                  Length
                </dt>
                <dd className="text-sm font-medium text-neutral-100">
                  {props.formatDuration(totalDurationMS)}
                </dd>
              </div>
              <div>
                <dt className="text-xs tracking-wide text-neutral-500 uppercase">
                  Discs
                </dt>
                <dd className="text-sm font-medium text-neutral-100">
                  {discCount}
                </dd>
              </div>
            </dl>
          </div>
        </aside>

        <section className="mt-8 w-3/5">
          {album.tracks.length === 0 ? (
            <p className="text-sm text-neutral-500">
              No tracks found in this album.
            </p>
          ) : (
            <ul className="flex flex-col">
              {album.tracks.map((track) => (
                <li key={track.id}>
                  <button
                    type="button"
                    onClick={() =>
                      void props.onPlayTrackFromAlbum(
                        album.title,
                        album.albumArtist,
                        track.id,
                      )
                    }
                    className="group flex w-full items-center rounded-2xl px-4 py-3 text-left transition-colors hover:bg-neutral-800"
                    aria-label={`Play ${track.title}`}
                  >
                    <p className="w-10 text-xs text-neutral-500">
                      {track.discNo ? `${track.discNo}-` : ""}
                      {track.trackNo ?? "-"}
                    </p>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-neutral-100 group-hover:text-white">
                        {track.title}
                      </p>
                      <p className="truncate text-xs text-neutral-500">
                        {track.artist}
                      </p>
                    </div>
                    <p className="ml-auto pl-1 text-right text-xs text-neutral-300">
                      {props.formatDuration(track.durationMs)}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </section>
  );
}
