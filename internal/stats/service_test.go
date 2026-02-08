package stats

import (
	"ben/internal/db"
	"ben/internal/library"
	"ben/internal/player"
	"database/sql"
	"path/filepath"
	"testing"
	"time"
)

func TestClassifyTrackEndShortTrackComplete(t *testing.T) {
	durationMS := 4 * 60 * 1000
	playedMS := int(float64(durationMS) * 0.90)

	result := classifyTrackEnd(playedMS, playedMS, durationMS)
	if result != EventComplete {
		t.Fatalf("expected %q, got %q", EventComplete, result)
	}
}

func TestClassifyTrackEndMediumTrackComplete(t *testing.T) {
	durationMS := 12 * 60 * 1000
	playedMS := int(float64(durationMS) * 0.85)

	result := classifyTrackEnd(playedMS, playedMS, durationMS)
	if result != EventComplete {
		t.Fatalf("expected %q, got %q", EventComplete, result)
	}
}

func TestClassifyTrackEndLongTrackComplete(t *testing.T) {
	durationMS := 45 * 60 * 1000
	playedMS := int(float64(durationMS) * 0.80)

	result := classifyTrackEnd(playedMS, playedMS, durationMS)
	if result != EventComplete {
		t.Fatalf("expected %q, got %q", EventComplete, result)
	}
}

func TestClassifyTrackEndSkipEarlyExit(t *testing.T) {
	durationMS := 6 * 60 * 1000
	playedMS := 35 * 1000

	result := classifyTrackEnd(playedMS, playedMS, durationMS)
	if result != EventSkip {
		t.Fatalf("expected %q, got %q", EventSkip, result)
	}
}

func TestClassifyTrackEndPartialMiddleSession(t *testing.T) {
	durationMS := 8 * 60 * 1000
	playedMS := 3 * 60 * 1000

	result := classifyTrackEnd(playedMS, playedMS, durationMS)
	if result != EventPartial {
		t.Fatalf("expected %q, got %q", EventPartial, result)
	}
}

func TestClassifyTrackEndUnknownDuration(t *testing.T) {
	result := classifyTrackEnd(90*1000, 90*1000, 0)
	if result != EventPartial {
		t.Fatalf("expected %q, got %q", EventPartial, result)
	}
}

func TestClassifyTrackEndTailCompletionWindow(t *testing.T) {
	durationMS := 30 * 60 * 1000
	playedMS := durationMS - 50*1000

	result := classifyTrackEnd(playedMS, playedMS, durationMS)
	if result != EventComplete {
		t.Fatalf("expected %q, got %q", EventComplete, result)
	}
}

func TestHandlePlayerStateFlushesPendingOnPause(t *testing.T) {
	t.Parallel()

	service, database := newStatsServiceForTest(t)
	defer database.Close()

	trackID := insertTrackForStatsTest(t, database, "Paused Flush", "Testing Artist")
	durationMS := 4 * 60 * 1000
	startedAt := time.Date(2026, time.February, 8, 12, 0, 0, 0, time.UTC)

	track := &library.TrackSummary{ID: trackID, DurationMS: &durationMS}
	service.HandlePlayerState(player.State{
		Status:       player.StatusPlaying,
		PositionMS:   0,
		CurrentTrack: track,
		DurationMS:   &durationMS,
		UpdatedAt:    startedAt.Format(time.RFC3339),
	})

	service.HandlePlayerState(player.State{
		Status:       player.StatusPlaying,
		PositionMS:   12000,
		CurrentTrack: track,
		DurationMS:   &durationMS,
		UpdatedAt:    startedAt.Add(12 * time.Second).Format(time.RFC3339),
	})

	service.HandlePlayerState(player.State{
		Status:       player.StatusPaused,
		PositionMS:   12000,
		CurrentTrack: track,
		DurationMS:   &durationMS,
		UpdatedAt:    startedAt.Add(13 * time.Second).Format(time.RFC3339),
	})

	var heartbeatRows int
	var heartbeatMS int
	if err := database.QueryRow(
		`SELECT COUNT(1), COALESCE(SUM(position_ms), 0) FROM play_events WHERE track_id = ? AND event_type = ?`,
		trackID,
		EventHeartbeat,
	).Scan(&heartbeatRows, &heartbeatMS); err != nil {
		t.Fatalf("query heartbeat rows: %v", err)
	}

	if heartbeatRows != 1 {
		t.Fatalf("expected 1 heartbeat row after pause flush, got %d", heartbeatRows)
	}
	if heartbeatMS != 13000 {
		t.Fatalf("expected 13000 played ms flushed on pause, got %d", heartbeatMS)
	}
}

func TestCompactOldEventsMovesExpiredRowsToDaily(t *testing.T) {
	t.Parallel()

	service, database := newStatsServiceForTest(t)
	defer database.Close()

	trackID := insertTrackForStatsTest(t, database, "Old Session", "Archive Artist")
	reference := time.Date(2026, time.February, 8, 12, 0, 0, 0, time.UTC)
	oldAt := time.Date(2025, time.December, 20, 14, 0, 0, 0, time.UTC)
	recentAt := reference.AddDate(0, 0, -5)

	insertPlayEventForStatsTest(t, database, trackID, EventHeartbeat, 30000, oldAt)
	insertPlayEventForStatsTest(t, database, trackID, EventComplete, 230000, oldAt.Add(10*time.Second))
	insertPlayEventForStatsTest(t, database, trackID, EventHeartbeat, 10000, recentAt)

	service.compactOldEvents(reference)

	var rawRows int
	if err := database.QueryRow(`SELECT COUNT(1) FROM play_events WHERE track_id = ?`, trackID).Scan(&rawRows); err != nil {
		t.Fatalf("count remaining raw rows: %v", err)
	}
	if rawRows != 1 {
		t.Fatalf("expected only recent raw row to remain, got %d", rawRows)
	}

	var (
		day            string
		playedMS       int
		heartbeatCount int
		completeCount  int
		skipCount      int
		partialCount   int
	)
	if err := database.QueryRow(
		`SELECT day, played_ms, heartbeat_count, complete_count, skip_count, partial_count FROM play_stats_daily WHERE track_id = ?`,
		trackID,
	).Scan(&day, &playedMS, &heartbeatCount, &completeCount, &skipCount, &partialCount); err != nil {
		t.Fatalf("read compacted daily row: %v", err)
	}

	if day != oldAt.Format(dayKeyLayout) {
		t.Fatalf("expected compacted day %q, got %q", oldAt.Format(dayKeyLayout), day)
	}
	if playedMS != 30000 || heartbeatCount != 1 || completeCount != 1 || skipCount != 0 || partialCount != 0 {
		t.Fatalf("unexpected compacted metrics: played=%d heartbeat=%d complete=%d skip=%d partial=%d", playedMS, heartbeatCount, completeCount, skipCount, partialCount)
	}

	service.compactOldEvents(reference)
	if err := database.QueryRow(
		`SELECT played_ms, heartbeat_count, complete_count, skip_count, partial_count FROM play_stats_daily WHERE day = ? AND track_id = ?`,
		oldAt.Format(dayKeyLayout),
		trackID,
	).Scan(&playedMS, &heartbeatCount, &completeCount, &skipCount, &partialCount); err != nil {
		t.Fatalf("read compacted daily row after rerun: %v", err)
	}
	if playedMS != 30000 || heartbeatCount != 1 || completeCount != 1 || skipCount != 0 || partialCount != 0 {
		t.Fatalf("compaction rerun should be idempotent, got played=%d heartbeat=%d complete=%d skip=%d partial=%d", playedMS, heartbeatCount, completeCount, skipCount, partialCount)
	}
}

func TestGetOverviewCombinesDailyAndRawData(t *testing.T) {
	t.Parallel()

	service, database := newStatsServiceForTest(t)
	defer database.Close()

	oldTrackID := insertTrackForStatsTest(t, database, "Old Favorite", "Same Artist")
	recentTrackID := insertTrackForStatsTest(t, database, "New Favorite", "Same Artist")

	if _, err := database.Exec(
		`INSERT INTO play_stats_daily(day, track_id, played_ms, heartbeat_count, complete_count, skip_count, partial_count) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		"2025-12-10",
		oldTrackID,
		60000,
		2,
		1,
		0,
		0,
	); err != nil {
		t.Fatalf("insert daily rollup row: %v", err)
	}

	insertPlayEventForStatsTest(t, database, recentTrackID, EventHeartbeat, 30000, time.Date(2026, time.February, 1, 11, 0, 0, 0, time.UTC))
	insertPlayEventForStatsTest(t, database, recentTrackID, EventSkip, 12000, time.Date(2026, time.February, 1, 11, 0, 5, 0, time.UTC))

	overview, err := service.GetOverview(10)
	if err != nil {
		t.Fatalf("get overview: %v", err)
	}

	if overview.TotalPlayedMS != 90000 {
		t.Fatalf("expected total played ms 90000, got %d", overview.TotalPlayedMS)
	}
	if overview.TracksPlayed != 2 {
		t.Fatalf("expected 2 tracks played, got %d", overview.TracksPlayed)
	}
	if overview.CompleteCount != 1 {
		t.Fatalf("expected complete count 1, got %d", overview.CompleteCount)
	}
	if overview.SkipCount != 1 {
		t.Fatalf("expected skip count 1, got %d", overview.SkipCount)
	}

	if len(overview.TopTracks) != 2 {
		t.Fatalf("expected 2 top tracks, got %d", len(overview.TopTracks))
	}
	if len(overview.TopArtists) != 1 {
		t.Fatalf("expected 1 top artist, got %d", len(overview.TopArtists))
	}
	if overview.TopArtists[0].PlayedMS != 90000 {
		t.Fatalf("expected top artist played ms 90000, got %d", overview.TopArtists[0].PlayedMS)
	}
}

func newStatsServiceForTest(t *testing.T) (*Service, *sql.DB) {
	t.Helper()

	databasePath := filepath.Join(t.TempDir(), "library.db")
	database, err := db.Bootstrap(databasePath)
	if err != nil {
		t.Fatalf("bootstrap stats test database: %v", err)
	}

	return NewService(database), database
}

func insertTrackForStatsTest(t *testing.T, database *sql.DB, title string, artist string) int64 {
	t.Helper()

	path := filepath.Join("C:\\Music", title+".mp3")
	now := time.Now().UTC().Format(time.RFC3339)

	fileResult, err := database.Exec(
		`INSERT INTO files(path, size, mtime_ns, file_exists, last_seen_at) VALUES (?, 123, 1, 1, ?)`,
		path,
		now,
	)
	if err != nil {
		t.Fatalf("insert file row: %v", err)
	}

	fileID, err := fileResult.LastInsertId()
	if err != nil {
		t.Fatalf("read file id: %v", err)
	}

	trackResult, err := database.Exec(
		`INSERT INTO tracks(file_id, title, artist, album, album_artist, duration_ms, tags_json) VALUES (?, ?, ?, 'Album', ?, 240000, '{}')`,
		fileID,
		title,
		artist,
		artist,
	)
	if err != nil {
		t.Fatalf("insert track row: %v", err)
	}

	trackID, err := trackResult.LastInsertId()
	if err != nil {
		t.Fatalf("read track id: %v", err)
	}

	return trackID
}

func insertPlayEventForStatsTest(t *testing.T, database *sql.DB, trackID int64, eventType string, positionMS int, at time.Time) {
	t.Helper()

	if _, err := database.Exec(
		`INSERT INTO play_events(track_id, event_type, position_ms, ts) VALUES (?, ?, ?, ?)`,
		trackID,
		eventType,
		positionMS,
		at.UTC().Format(time.RFC3339),
	); err != nil {
		t.Fatalf("insert play event: %v", err)
	}
}
