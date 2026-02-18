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
    return (
      <p className="text-theme-600 dark:text-theme-400 text-sm">
        Loading album...
      </p>
    );
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
            className="text-accent-700 hover:text-accent-600 dark:text-accent-400 dark:hover:text-accent-200 inline-flex w-fit items-center gap-2 rounded-md py-1 text-sm transition-colors"
          >
            <ArrowLeft size={14} />
            Back to albums
          </button>
          <CoverArt
            coverPath={album.coverPath}
            alt={`${album.title} cover`}
            variant="detail"
            className="mt-4 aspect-square w-full rounded-2xl border border-black/7 dark:border-white/7"
            loading="eager"
          />
          <div className="mt-4 space-y-1">
            <h1 className="text-theme-900 dark:text-theme-100 text-xl font-bold lg:text-2xl">
              {album.title}
            </h1>
            <p className="text-theme-700 dark:text-theme-300">
              {album.albumArtist}
            </p>
            <p className="text-theme-600 dark:text-theme-500 text-xs">
              {releaseDateLabel} - {trackCountLabel}
            </p>

            <button
              type="button"
              onClick={() =>
                void props.onPlayAlbum(album.title, album.albumArtist)
              }
              className="bg-accent-700 text-accent-50 hover:bg-accent-600 dark:bg-accent-100 dark:text-accent-900 dark:hover:bg-accent-200 mt-2 inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors"
            >
              <Play size={16} />
              Play all tracks
            </button>

            <dl className="mt-2 grid grid-cols-2 gap-3 rounded-xl">
              <div>
                <dt className="text-theme-600 dark:text-theme-500 text-xs tracking-wide uppercase">
                  Length
                </dt>
                <dd className="text-theme-900 dark:text-theme-100 text-sm font-medium">
                  {props.formatDuration(totalDurationMS)}
                </dd>
              </div>
              <div>
                <dt className="text-theme-600 dark:text-theme-500 text-xs tracking-wide uppercase">
                  Discs
                </dt>
                <dd className="text-theme-900 dark:text-theme-100 text-sm font-medium">
                  {discCount}
                </dd>
              </div>
            </dl>
          </div>
        </aside>

        <section className="mt-8 w-3/5">
          {album.tracks.length === 0 ? (
            <p className="text-theme-600 dark:text-theme-500 text-sm">
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
                    className="group hover:bg-theme-200 dark:hover:bg-theme-800 flex w-full items-center rounded-2xl px-4 py-3 text-left transition-colors"
                    aria-label={`Play ${track.title}`}
                  >
                    <p className="text-theme-600 dark:text-theme-500 w-10 text-xs">
                      {track.discNo ? `${track.discNo}-` : ""}
                      {track.trackNo ?? "-"}
                    </p>
                    <div className="min-w-0">
                      <p className="text-theme-900 group-hover:text-theme-950 dark:text-theme-100 truncate font-medium dark:group-hover:text-white">
                        {track.title}
                      </p>
                      <p className="text-theme-600 dark:text-theme-500 truncate text-xs">
                        {track.artist}
                      </p>
                    </div>
                    <p className="text-theme-700 dark:text-theme-300 ml-auto pl-1 text-right text-xs">
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
