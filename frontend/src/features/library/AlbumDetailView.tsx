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
    return <p className="text-sm text-zinc-400">Loading album...</p>;
  }

  const album = props.albumDetail;

  return (
    <section className="flex flex-col gap-4">
      <button
        type="button"
        onClick={props.onBack}
        className="inline-flex w-fit items-center gap-2 rounded-md px-1 py-1 text-sm text-zinc-400 transition-colors hover:text-zinc-200"
      >
        <ArrowLeft size={14} />
        Back to albums
      </button>

      <div className="flex flex-col gap-4 rounded-xl border border-zinc-800 bg-zinc-900/70 p-4 sm:flex-row sm:items-end">
        <CoverArt
          coverPath={album.coverPath}
          alt={`${album.title} cover`}
          className="h-36 w-36 rounded-lg"
          loading="eager"
        />
        <div className="min-w-0 flex-1">
          <p className="text-xs tracking-wide text-zinc-400 uppercase">Album</p>
          <h1 className="truncate text-2xl font-semibold text-zinc-100">
            {album.title}
          </h1>
          <p className="truncate text-sm text-zinc-300">{album.albumArtist}</p>
          <p className="text-xs text-zinc-500">{album.trackCount} tracks</p>
        </div>
        <button
          type="button"
          onClick={() => void props.onPlayAlbum(album.title, album.albumArtist)}
          className="inline-flex items-center gap-2 rounded-md bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-200"
        >
          <Play size={16} />
          Play Album
        </button>
      </div>

      <ul className="flex flex-col gap-2">
        {album.tracks.map((track) => (
          <li
            key={track.id}
            className="flex items-center gap-3 rounded-md border border-zinc-800 bg-zinc-900/70 px-3 py-2"
          >
            <p className="w-14 shrink-0 text-xs text-zinc-500">
              {track.discNo ? `${track.discNo}-` : ""}
              {track.trackNo ?? "-"}
            </p>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-zinc-100">{track.title}</p>
              <p className="truncate text-xs text-zinc-400">{track.artist}</p>
            </div>
            <p className="w-14 shrink-0 text-right text-xs text-zinc-500">
              {props.formatDuration(track.durationMs)}
            </p>
            <button
              type="button"
              onClick={() =>
                void props.onPlayTrackFromAlbum(
                  album.title,
                  album.albumArtist,
                  track.id,
                )
              }
              className="rounded p-2 text-zinc-500 transition-colors hover:text-zinc-200"
              aria-label={`Play ${track.title}`}
            >
              <Play size={14} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
