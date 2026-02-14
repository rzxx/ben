package queue

import (
	"ben/internal/db"
	"database/sql"
	"fmt"
	"math/rand"
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

func TestShuffleNoRepeatsPerCycleAndStopsWhenRepeatOff(t *testing.T) {
	t.Parallel()

	service, database := newQueueServiceForTest(t)
	defer database.Close()

	trackIDs := []int64{
		insertTrackForTest(t, database, "S1"),
		insertTrackForTest(t, database, "S2"),
		insertTrackForTest(t, database, "S3"),
		insertTrackForTest(t, database, "S4"),
		insertTrackForTest(t, database, "S5"),
	}

	if _, err := service.SetQueue(trackIDs, 0); err != nil {
		t.Fatalf("set queue: %v", err)
	}
	if _, err := service.SetRepeatMode(RepeatModeOff); err != nil {
		t.Fatalf("set repeat mode: %v", err)
	}

	service.rng = rand.New(rand.NewSource(11))
	service.SetShuffle(true)

	initial := service.GetState()
	if initial.CurrentTrack == nil {
		t.Fatalf("expected initial current track")
	}

	seen := map[int64]struct{}{initial.CurrentTrack.ID: {}}
	for i := 0; i < len(trackIDs)-1; i++ {
		state, moved := service.Next()
		if !moved {
			t.Fatalf("expected move at step %d", i)
		}
		if state.CurrentTrack == nil {
			t.Fatalf("expected current track at step %d", i)
		}
		if _, exists := seen[state.CurrentTrack.ID]; exists {
			t.Fatalf("track repeated before cycle ended: %d", state.CurrentTrack.ID)
		}
		seen[state.CurrentTrack.ID] = struct{}{}
	}

	if len(seen) != len(trackIDs) {
		t.Fatalf("expected to visit all tracks once, got %d of %d", len(seen), len(trackIDs))
	}

	_, moved := service.Next()
	if moved {
		t.Fatalf("expected shuffle with repeat off to stop at end of cycle")
	}
}

func TestShufflePreviousFollowsPlaybackTrail(t *testing.T) {
	t.Parallel()

	service, database := newQueueServiceForTest(t)
	defer database.Close()

	trackIDs := []int64{
		insertTrackForTest(t, database, "P1"),
		insertTrackForTest(t, database, "P2"),
		insertTrackForTest(t, database, "P3"),
		insertTrackForTest(t, database, "P4"),
	}

	if _, err := service.SetQueue(trackIDs, 0); err != nil {
		t.Fatalf("set queue: %v", err)
	}

	service.rng = rand.New(rand.NewSource(21))
	service.SetShuffle(true)

	first := service.GetState().CurrentTrack
	if first == nil {
		t.Fatalf("expected first track")
	}

	secondState, moved := service.Next()
	if !moved || secondState.CurrentTrack == nil {
		t.Fatalf("expected second shuffled track")
	}
	thirdState, moved := service.Next()
	if !moved || thirdState.CurrentTrack == nil {
		t.Fatalf("expected third shuffled track")
	}

	backState, moved := service.Previous()
	if !moved || backState.CurrentTrack == nil {
		t.Fatalf("expected previous to move")
	}
	if backState.CurrentTrack.ID != secondState.CurrentTrack.ID {
		t.Fatalf("expected previous to return second track")
	}

	backState, moved = service.Previous()
	if !moved || backState.CurrentTrack == nil {
		t.Fatalf("expected previous to move again")
	}
	if backState.CurrentTrack.ID != first.ID {
		t.Fatalf("expected previous to return first track")
	}
}

func TestShuffleCorrectionsReduceAlbumRunsAndArtistClumps(t *testing.T) {
	t.Parallel()

	service, database := newQueueServiceForTest(t)
	defer database.Close()

	tracks := []struct {
		title   string
		artist  string
		album   string
		trackNo int
	}{
		{"A1", "Artist A", "Alpha", 1},
		{"A2", "Artist A", "Alpha", 2},
		{"A3", "Artist A", "Alpha", 3},
		{"B1", "Artist B", "Beta", 1},
		{"B2", "Artist B", "Beta", 2},
		{"B3", "Artist B", "Beta", 3},
		{"C1", "Artist C", "Gamma", 1},
		{"C2", "Artist C", "Gamma", 2},
		{"C3", "Artist C", "Gamma", 3},
	}

	trackIDs := make([]int64, 0, len(tracks))
	metaByID := make(map[int64]struct {
		artist  string
		album   string
		trackNo int
	})

	for _, entry := range tracks {
		id := insertTrackWithMetadataForTest(t, database, entry.title, entry.artist, entry.album, 1, entry.trackNo)
		trackIDs = append(trackIDs, id)
		metaByID[id] = struct {
			artist  string
			album   string
			trackNo int
		}{artist: entry.artist, album: entry.album, trackNo: entry.trackNo}
	}

	if _, err := service.SetQueue(trackIDs, 0); err != nil {
		t.Fatalf("set queue: %v", err)
	}
	if _, err := service.SetRepeatMode(RepeatModeOff); err != nil {
		t.Fatalf("set repeat mode: %v", err)
	}

	service.rng = rand.New(rand.NewSource(77))
	service.SetShuffle(true)

	state := service.GetState()
	if state.CurrentTrack == nil {
		t.Fatalf("expected current track")
	}

	played := []int64{state.CurrentTrack.ID}
	for {
		nextState, moved := service.Next()
		if !moved {
			break
		}
		if nextState.CurrentTrack == nil {
			t.Fatalf("expected current track while advancing")
		}
		played = append(played, nextState.CurrentTrack.ID)
	}

	if len(played) != len(trackIDs) {
		t.Fatalf("expected full cycle traversal, got %d", len(played))
	}

	for i := 2; i < len(played); i++ {
		album0 := metaByID[played[i-2]].album
		album1 := metaByID[played[i-1]].album
		album2 := metaByID[played[i]].album
		if album0 == album1 && album1 == album2 {
			t.Fatalf("found three consecutive tracks from same album")
		}
	}

	for i := 1; i < len(played); i++ {
		left := metaByID[played[i-1]]
		right := metaByID[played[i]]
		if left.album == right.album && right.trackNo == left.trackNo+1 {
			t.Fatalf("found adjacent ascending album order fragment")
		}
	}

	for i := 1; i < len(played); i++ {
		leftArtist := metaByID[played[i-1]].artist
		rightArtist := metaByID[played[i]].artist
		if leftArtist == rightArtist {
			t.Fatalf("found adjacent same-artist tracks")
		}
	}
}

func TestShuffleNextCycleIsNotTooCloseToPreviousCycle(t *testing.T) {
	t.Parallel()

	service, database := newQueueServiceForTest(t)
	defer database.Close()

	trackIDs := make([]int64, 0, 12)
	for i := 0; i < 12; i++ {
		trackIDs = append(trackIDs, insertTrackWithMetadataForTest(
			t,
			database,
			fmt.Sprintf("Cycle-%02d", i+1),
			fmt.Sprintf("Artist-%d", (i%4)+1),
			fmt.Sprintf("Album-%d", (i%6)+1),
			1,
			i+1,
		))
	}

	if _, err := service.SetQueue(trackIDs, 0); err != nil {
		t.Fatalf("set queue: %v", err)
	}
	if _, err := service.SetRepeatMode(RepeatModeAll); err != nil {
		t.Fatalf("set repeat mode: %v", err)
	}

	service.rng = rand.New(rand.NewSource(101))
	service.SetShuffle(true)

	service.mu.Lock()
	firstCycle := append([]int(nil), service.lastShuffle...)
	service.mu.Unlock()
	if len(firstCycle) != len(trackIDs)-1 {
		t.Fatalf("expected first cycle length %d, got %d", len(trackIDs)-1, len(firstCycle))
	}

	for i := 0; i < len(trackIDs)-1; i++ {
		if _, moved := service.Next(); !moved {
			t.Fatalf("expected to advance through first cycle")
		}
	}

	if _, moved := service.Next(); !moved {
		t.Fatalf("expected repeat-all to create a second cycle")
	}

	service.mu.Lock()
	secondCycle := append([]int(nil), service.lastShuffle...)
	_, stats := service.shuffleCycleClosenessScoreLocked(firstCycle, secondCycle)
	accepted := service.shuffleCycleAcceptedLocked(firstCycle, secondCycle, stats)
	service.mu.Unlock()

	if !accepted {
		t.Fatalf("expected second shuffle cycle to pass cycle-distance guardrails")
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

func insertTrackWithMetadataForTest(t *testing.T, database *sql.DB, title string, artist string, album string, discNo int, trackNo int) int64 {
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
		`INSERT INTO tracks(file_id, title, artist, album, album_artist, disc_no, track_no, duration_ms, tags_json) VALUES (?, ?, ?, ?, ?, ?, ?, 180000, '{}')`,
		fileID,
		title,
		artist,
		album,
		artist,
		discNo,
		trackNo,
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
