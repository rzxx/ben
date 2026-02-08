package queue

import (
	"ben/internal/db"
	"database/sql"
	"path/filepath"
	"testing"
	"time"
)

func TestAdvanceAutoplayRepeatModes(t *testing.T) {
	t.Parallel()

	service, database := newQueueServiceForTest(t)
	defer database.Close()

	first := insertTrackForTest(t, database, "Track One")
	second := insertTrackForTest(t, database, "Track Two")

	if _, err := service.SetQueue([]int64{first, second}, 1); err != nil {
		t.Fatalf("set queue: %v", err)
	}

	if _, err := service.SetRepeatMode(RepeatModeOne); err != nil {
		t.Fatalf("set repeat mode one: %v", err)
	}

	state, moved := service.AdvanceAutoplay()
	if !moved {
		t.Fatalf("expected autoplay to move with repeat one")
	}
	if state.CurrentTrack == nil || state.CurrentTrack.ID != second {
		t.Fatalf("expected repeat one to keep current track")
	}

	if _, err := service.SetRepeatMode(RepeatModeOff); err != nil {
		t.Fatalf("set repeat mode off: %v", err)
	}

	state, moved = service.AdvanceAutoplay()
	if moved {
		t.Fatalf("expected autoplay to stop at queue end with repeat off")
	}
	if state.CurrentTrack == nil || state.CurrentTrack.ID != second {
		t.Fatalf("expected queue index to remain on last track")
	}

	if _, err := service.SetRepeatMode(RepeatModeAll); err != nil {
		t.Fatalf("set repeat mode all: %v", err)
	}

	state, moved = service.AdvanceAutoplay()
	if !moved {
		t.Fatalf("expected autoplay to wrap with repeat all")
	}
	if state.CurrentTrack == nil || state.CurrentTrack.ID != first {
		t.Fatalf("expected repeat all to wrap to first track")
	}
}

func TestQueueSnapshotRestoredOnStartup(t *testing.T) {
	t.Parallel()

	service, database := newQueueServiceForTest(t)
	defer database.Close()

	first := insertTrackForTest(t, database, "Track A")
	second := insertTrackForTest(t, database, "Track B")

	if _, err := service.SetQueue([]int64{first, second}, 1); err != nil {
		t.Fatalf("set queue: %v", err)
	}
	if _, err := service.SetRepeatMode(RepeatModeAll); err != nil {
		t.Fatalf("set repeat mode: %v", err)
	}
	service.SetShuffle(true)

	reloaded := NewService(database)
	state := reloaded.GetState()

	if state.Total != 2 {
		t.Fatalf("expected 2 queue entries, got %d", state.Total)
	}
	if state.CurrentTrack == nil || state.CurrentTrack.ID != second {
		t.Fatalf("expected current track to be restored")
	}
	if state.RepeatMode != RepeatModeAll {
		t.Fatalf("expected repeat mode %q, got %q", RepeatModeAll, state.RepeatMode)
	}
	if !state.Shuffle {
		t.Fatalf("expected shuffle to be restored")
	}
}

func newQueueServiceForTest(t *testing.T) (*Service, *sql.DB) {
	t.Helper()

	databasePath := filepath.Join(t.TempDir(), "library.db")
	database, err := db.Bootstrap(databasePath)
	if err != nil {
		t.Fatalf("bootstrap test database: %v", err)
	}

	return NewService(database), database
}

func insertTrackForTest(t *testing.T, database *sql.DB, title string) int64 {
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
		`INSERT INTO tracks(file_id, title, artist, album, album_artist, duration_ms, tags_json) VALUES (?, ?, 'Artist', 'Album', 'Artist', 180000, '{}')`,
		fileID,
		title,
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
