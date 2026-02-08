CREATE TABLE IF NOT EXISTS play_stats_daily (
    day TEXT NOT NULL,
    track_id INTEGER NOT NULL,
    played_ms INTEGER NOT NULL DEFAULT 0,
    heartbeat_count INTEGER NOT NULL DEFAULT 0,
    complete_count INTEGER NOT NULL DEFAULT 0,
    skip_count INTEGER NOT NULL DEFAULT 0,
    partial_count INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    PRIMARY KEY(day, track_id),
    FOREIGN KEY(track_id) REFERENCES tracks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_play_events_ts ON play_events(ts);
CREATE INDEX IF NOT EXISTS idx_play_events_track_id_ts ON play_events(track_id, ts);
CREATE INDEX IF NOT EXISTS idx_play_stats_daily_track_day ON play_stats_daily(track_id, day);
