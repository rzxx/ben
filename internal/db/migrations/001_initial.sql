CREATE TABLE IF NOT EXISTS watched_roots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT NOT NULL UNIQUE,
    enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT NOT NULL UNIQUE,
    root_id INTEGER,
    size INTEGER NOT NULL DEFAULT 0,
    mtime_ns INTEGER NOT NULL DEFAULT 0,
    hash_quick TEXT,
    file_exists INTEGER NOT NULL DEFAULT 1 CHECK (file_exists IN (0, 1)),
    last_seen_at TEXT,
    FOREIGN KEY(root_id) REFERENCES watched_roots(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS tracks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_id INTEGER NOT NULL UNIQUE,
    title TEXT,
    artist TEXT,
    album_artist TEXT,
    album TEXT,
    disc_no INTEGER,
    track_no INTEGER,
    year INTEGER,
    genre TEXT,
    duration_ms INTEGER,
    codec TEXT,
    sample_rate INTEGER,
    bit_depth INTEGER,
    bitrate INTEGER,
    tags_json TEXT,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY(file_id) REFERENCES files(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS artists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    sort_name TEXT
);

CREATE TABLE IF NOT EXISTS covers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_file_id INTEGER,
    mime TEXT,
    width INTEGER,
    height INTEGER,
    cache_path TEXT,
    hash TEXT,
    FOREIGN KEY(source_file_id) REFERENCES files(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS albums (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    album_artist TEXT,
    year INTEGER,
    cover_id INTEGER,
    sort_key TEXT,
    FOREIGN KEY(cover_id) REFERENCES covers(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS album_tracks (
    album_id INTEGER NOT NULL,
    track_id INTEGER NOT NULL,
    disc_no INTEGER,
    track_no INTEGER,
    PRIMARY KEY(album_id, track_id),
    FOREIGN KEY(album_id) REFERENCES albums(id) ON DELETE CASCADE,
    FOREIGN KEY(track_id) REFERENCES tracks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS queue_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    position INTEGER NOT NULL,
    track_id INTEGER NOT NULL,
    source TEXT,
    added_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY(track_id) REFERENCES tracks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS playback_state (
    id INTEGER PRIMARY KEY,
    current_track_id INTEGER,
    position_ms INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'stopped',
    repeat_mode TEXT NOT NULL DEFAULT 'off',
    shuffle INTEGER NOT NULL DEFAULT 0 CHECK (shuffle IN (0, 1)),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY(current_track_id) REFERENCES tracks(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS play_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    track_id INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    position_ms INTEGER,
    ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY(track_id) REFERENCES tracks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_files_root_id ON files(root_id);
CREATE INDEX IF NOT EXISTS idx_files_path ON files(path);
CREATE INDEX IF NOT EXISTS idx_tracks_file_id ON tracks(file_id);
CREATE INDEX IF NOT EXISTS idx_tracks_album_artist ON tracks(album_artist);
CREATE INDEX IF NOT EXISTS idx_tracks_album ON tracks(album);
CREATE INDEX IF NOT EXISTS idx_tracks_artist ON tracks(artist);
CREATE INDEX IF NOT EXISTS idx_albums_sort_key ON albums(sort_key);
CREATE INDEX IF NOT EXISTS idx_queue_entries_position ON queue_entries(position);
