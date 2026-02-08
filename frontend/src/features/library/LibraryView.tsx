import { FormEvent } from "react";
import {
  AlbumDetail,
  ArtistDetail,
  LibraryAlbum,
  LibraryArtist,
  LibraryTrack,
  PagedResult,
  SelectedAlbum,
} from "../types";

type LibraryViewProps = {
  libraryQueryInput: string;
  onLibraryQueryInputChange: (value: string) => void;
  onSubmitLibrarySearch: (event: FormEvent<HTMLFormElement>) => void;
  artistsPage: PagedResult<LibraryArtist>;
  albumsPage: PagedResult<LibraryAlbum>;
  tracksPage: PagedResult<LibraryTrack>;
  selectedArtist: string | null;
  selectedAlbum: SelectedAlbum | null;
  artistDetail: ArtistDetail | null;
  albumDetail: AlbumDetail | null;
  artistCanGoBack: boolean;
  artistCanGoNext: boolean;
  albumCanGoBack: boolean;
  albumCanGoNext: boolean;
  trackCanGoBack: boolean;
  trackCanGoNext: boolean;
  visibleTrackIDs: number[];
  onSelectArtist: (name: string) => void;
  onSelectAlbum: (title: string, albumArtist: string) => void;
  onArtistPrev: () => void;
  onArtistNext: () => void;
  onAlbumPrev: () => void;
  onAlbumNext: () => void;
  onTrackPrev: () => void;
  onTrackNext: () => void;
  onSetQueue: (trackIDs: number[], autoplay: boolean) => Promise<void>;
  onAppendTrack: (trackID: number) => Promise<void>;
  onPlayTrackNow: (trackID: number) => Promise<void>;
};

export function LibraryView(props: LibraryViewProps) {
  return (
    <>
      <section className="panel">
        <h2>Library Browser</h2>
        <p>Paginated browse API wired from the Go backend.</p>

        <form className="search-form" onSubmit={props.onSubmitLibrarySearch}>
          <input
            value={props.libraryQueryInput}
            onChange={(event) => props.onLibraryQueryInputChange(event.target.value)}
            placeholder="Search title, artist, or album"
            autoComplete="off"
          />
          <button type="submit">Search</button>
        </form>

        <div className="stat-list">
          <div>
            <span>Artists Matched</span>
            <strong>{props.artistsPage.page.total}</strong>
          </div>
          <div>
            <span>Albums Matched</span>
            <strong>{props.albumsPage.page.total}</strong>
          </div>
          <div>
            <span>Tracks Matched</span>
            <strong>{props.tracksPage.page.total}</strong>
          </div>
        </div>

        <div className="action-row">
          <button
            onClick={() => void props.onSetQueue(props.visibleTrackIDs, false)}
            disabled={!props.visibleTrackIDs.length}
          >
            Replace Queue
          </button>
          <button
            onClick={() => void props.onSetQueue(props.visibleTrackIDs, true)}
            disabled={!props.visibleTrackIDs.length}
          >
            Play Visible Tracks
          </button>
        </div>

        <div className="library-groups">
          <div className="library-group">
            <h3>Artists</h3>
            <ul className="entity-list">
              {props.artistsPage.items.map((artist) => (
                <li key={artist.name}>
                  <button
                    className={`entity-button ${props.selectedArtist === artist.name ? "selected" : ""}`}
                    onClick={() => props.onSelectArtist(artist.name)}
                  >
                    <strong>{artist.name}</strong>
                    <span>
                      {artist.albumCount} albums - {artist.trackCount} tracks
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="pager">
              <button disabled={!props.artistCanGoBack} onClick={props.onArtistPrev}>
                Prev
              </button>
              <button disabled={!props.artistCanGoNext} onClick={props.onArtistNext}>
                Next
              </button>
            </div>
          </div>

          <div className="library-group">
            <h3>Albums</h3>
            <ul className="entity-list">
              {props.albumsPage.items.map((album) => (
                <li key={`${album.albumArtist}-${album.title}`}>
                  <button
                    className={`entity-button ${
                      props.selectedAlbum?.title === album.title &&
                      props.selectedAlbum?.albumArtist === album.albumArtist
                        ? "selected"
                        : ""
                    }`}
                    onClick={() => props.onSelectAlbum(album.title, album.albumArtist)}
                  >
                    <strong>{album.title}</strong>
                    <span>
                      {album.albumArtist}
                      {album.year ? ` (${album.year})` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="pager">
              <button disabled={!props.albumCanGoBack} onClick={props.onAlbumPrev}>
                Prev
              </button>
              <button disabled={!props.albumCanGoNext} onClick={props.onAlbumNext}>
                Next
              </button>
            </div>
          </div>

          <div className="library-group">
            <h3>Tracks</h3>
            <ul className="entity-list">
              {props.tracksPage.items.map((track) => (
                <li key={track.id}>
                  <div className="entity-row">
                    <strong>{track.title}</strong>
                    <span>
                      {track.artist} - {track.album}
                    </span>
                    <div className="inline-actions">
                      <button onClick={() => void props.onAppendTrack(track.id)}>Queue</button>
                      <button onClick={() => void props.onPlayTrackNow(track.id)}>Play</button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <div className="pager">
              <button disabled={!props.trackCanGoBack} onClick={props.onTrackPrev}>
                Prev
              </button>
              <button disabled={!props.trackCanGoNext} onClick={props.onTrackNext}>
                Next
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="panel">
        <h2>Artist Detail</h2>
        {props.artistDetail ? (
          <>
            <p className="summary-row">
              <strong>{props.artistDetail.name}</strong> - {props.artistDetail.albumCount} albums - {props.artistDetail.trackCount} tracks
            </p>
            <ul className="entity-list">
              {props.artistDetail.albums.map((album) => (
                <li key={`${album.albumArtist}-${album.title}`}>
                  <div className="entity-row">
                    <strong>{album.title}</strong>
                    <span>
                      {album.albumArtist}
                      {album.year ? ` (${album.year})` : ""} - {album.trackCount} tracks
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p>Select an artist to load album details.</p>
        )}
      </section>

      <section className="panel">
        <h2>Album Detail</h2>
        {props.albumDetail ? (
          <>
            <p className="summary-row">
              <strong>{props.albumDetail.title}</strong> - {props.albumDetail.albumArtist}
              {props.albumDetail.year ? ` (${props.albumDetail.year})` : ""} - {props.albumDetail.trackCount} tracks
            </p>
            <ul className="entity-list">
              {props.albumDetail.tracks.map((track) => (
                <li key={track.id}>
                  <div className="entity-row">
                    <strong>
                      {track.discNo ? `${track.discNo}-` : ""}
                      {track.trackNo ? `${track.trackNo}. ` : ""}
                      {track.title}
                    </strong>
                    <span>{track.artist}</span>
                    <div className="inline-actions">
                      <button onClick={() => void props.onAppendTrack(track.id)}>Queue</button>
                      <button onClick={() => void props.onPlayTrackNow(track.id)}>Play</button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p>Select an album to load full track order.</p>
        )}
      </section>
    </>
  );
}
