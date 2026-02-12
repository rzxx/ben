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
    <section className="flex flex-col gap-5">
      <button
        type="button"
        onClick={props.onBack}
        className="inline-flex w-fit items-center gap-2 rounded-md px-1 py-1 text-sm text-neutral-400 transition-colors hover:text-neutral-200"
      >
        <ArrowLeft size={14} />
        Back to albums
      </button>

      <div className="grid gap-5 lg:grid-cols-[minmax(280px,420px)_minmax(0,1fr)] lg:gap-8">
        <aside className="rounded-2xl border border-neutral-800 bg-neutral-950/20 p-5 lg:sticky lg:top-4 lg:h-[calc(100dvh-9.25rem)] lg:self-start lg:p-6">
          <div className="flex h-full flex-col gap-6">
            <CoverArt
              coverPath={album.coverPath}
              alt={`${album.title} cover`}
              className="aspect-square w-full rounded-xl"
              loading="eager"
            />
            <div className="space-y-2">
              <p className="text-xs tracking-wide text-neutral-400 uppercase">
                Album
              </p>
              <h1 className="text-3xl leading-tight font-semibold text-neutral-100 lg:text-4xl">
                {album.title}
              </h1>
              <p className="text-lg text-neutral-200">{album.albumArtist}</p>
              <p className="text-sm text-neutral-400">
                {releaseDateLabel} - {trackCountLabel}
              </p>
            </div>

            <dl className="mt-auto grid grid-cols-2 gap-3 rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
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

        <section className="min-w-0 space-y-3">
          <div className="rounded-xl border border-neutral-800 bg-neutral-950/20 p-3">
            <button
              type="button"
              onClick={() =>
                void props.onPlayAlbum(album.title, album.albumArtist)
              }
              className="inline-flex items-center gap-2 rounded-md bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 transition-colors hover:bg-neutral-200"
            >
              <Play size={16} />
              Play all tracks
            </button>
          </div>

          {album.tracks.length === 0 ? (
            <p className="text-sm text-neutral-400">
              No tracks found in this album.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
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
                    className="group grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-950/15 px-4 py-3 text-left transition-colors hover:border-neutral-700 hover:bg-neutral-900/50"
                    aria-label={`Play ${track.title}`}
                  >
                    <p className="w-12 shrink-0 text-xs text-neutral-500">
                      {track.discNo ? `${track.discNo}-` : ""}
                      {track.trackNo ?? "-"}
                    </p>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-neutral-100 group-hover:text-white">
                        {track.title}
                      </p>
                      <p className="truncate text-xs text-neutral-400">
                        {track.artist}
                      </p>
                    </div>
                    <p className="w-14 shrink-0 text-right text-xs text-neutral-500">
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
