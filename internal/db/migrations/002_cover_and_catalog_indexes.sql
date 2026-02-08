CREATE UNIQUE INDEX IF NOT EXISTS idx_covers_source_file_id ON covers(source_file_id);
CREATE INDEX IF NOT EXISTS idx_covers_hash ON covers(hash);
CREATE INDEX IF NOT EXISTS idx_albums_title_artist ON albums(title, album_artist);
CREATE INDEX IF NOT EXISTS idx_album_tracks_track_id ON album_tracks(track_id);
CREATE INDEX IF NOT EXISTS idx_artists_sort_name ON artists(sort_name);
