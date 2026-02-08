package queue

import (
	"ben/internal/library"
	"context"
	"database/sql"
	"errors"
	"fmt"
	"math/rand"
	"strings"
	"sync"
	"time"
)

const EventStateChanged = "queue:state"

const (
	RepeatModeOff = "off"
	RepeatModeAll = "all"
	RepeatModeOne = "one"
)

type nextMode string

const (
	nextModeManual   nextMode = "manual"
	nextModeAutoplay nextMode = "autoplay"
)

type Emitter func(eventName string, payload any)

type ChangeListener func(state State)

type State struct {
	Entries      []library.TrackSummary `json:"entries"`
	CurrentIndex int                    `json:"currentIndex"`
	CurrentTrack *library.TrackSummary  `json:"currentTrack,omitempty"`
	RepeatMode   string                 `json:"repeatMode"`
	Shuffle      bool                   `json:"shuffle"`
	Total        int                    `json:"total"`
	UpdatedAt    string                 `json:"updatedAt"`
}

type Service struct {
	mu           sync.Mutex
	db           *sql.DB
	entries      []library.TrackSummary
	currentIndex int
	repeatMode   string
	shuffle      bool
	updatedAt    time.Time
	emit         Emitter
	onChange     ChangeListener
	rng          *rand.Rand
}

func NewService(database *sql.DB) *Service {
	service := &Service{
		db:           database,
		currentIndex: -1,
		repeatMode:   RepeatModeOff,
		rng:          rand.New(rand.NewSource(time.Now().UnixNano())),
	}

	service.loadSnapshot()
	return service
}

func (s *Service) SetEmitter(emitter Emitter) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.emit = emitter
}

func (s *Service) SetOnChange(listener ChangeListener) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.onChange = listener
}

func (s *Service) GetState() State {
	s.mu.Lock()
	defer s.mu.Unlock()

	return s.snapshotLocked()
}

func (s *Service) CurrentTrack() *library.TrackSummary {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.currentIndex < 0 || s.currentIndex >= len(s.entries) {
		return nil
	}

	track := s.entries[s.currentIndex]
	return &track
}

func (s *Service) SetRepeatMode(mode string) (State, error) {
	normalized, err := normalizeRepeatMode(mode)
	if err != nil {
		return s.GetState(), err
	}

	s.mu.Lock()
	s.repeatMode = normalized
	s.touchLocked()
	state := s.snapshotLocked()
	s.mu.Unlock()

	s.afterMutation(state)
	return state, nil
}

func (s *Service) SetShuffle(enabled bool) State {
	s.mu.Lock()
	s.shuffle = enabled
	s.touchLocked()
	state := s.snapshotLocked()
	s.mu.Unlock()

	s.afterMutation(state)
	return state
}

func (s *Service) SetQueue(trackIDs []int64, startIndex int) (State, error) {
	tracks, err := s.lookupTracks(trackIDs)
	if err != nil {
		return State{}, err
	}

	s.mu.Lock()
	s.entries = tracks
	s.currentIndex = normalizeCurrentIndex(len(tracks), startIndex)
	s.touchLocked()
	state := s.snapshotLocked()
	s.mu.Unlock()

	s.afterMutation(state)
	return state, nil
}

func (s *Service) AppendTracks(trackIDs []int64) (State, error) {
	tracks, err := s.lookupTracks(trackIDs)
	if err != nil {
		return State{}, err
	}

	s.mu.Lock()
	s.entries = append(s.entries, tracks...)
	if s.currentIndex < 0 && len(s.entries) > 0 {
		s.currentIndex = 0
	}
	s.touchLocked()
	state := s.snapshotLocked()
	s.mu.Unlock()

	s.afterMutation(state)
	return state, nil
}

func (s *Service) RemoveTrack(index int) (State, error) {
	s.mu.Lock()
	if index < 0 || index >= len(s.entries) {
		state := s.snapshotLocked()
		s.mu.Unlock()
		return state, fmt.Errorf("queue index %d out of range", index)
	}

	s.entries = append(s.entries[:index], s.entries[index+1:]...)
	if len(s.entries) == 0 {
		s.currentIndex = -1
	} else if index < s.currentIndex {
		s.currentIndex--
	} else if s.currentIndex >= len(s.entries) {
		s.currentIndex = len(s.entries) - 1
	}

	s.touchLocked()
	state := s.snapshotLocked()
	s.mu.Unlock()

	s.afterMutation(state)
	return state, nil
}

func (s *Service) SetCurrentIndex(index int) (State, error) {
	s.mu.Lock()
	if len(s.entries) == 0 {
		state := s.snapshotLocked()
		s.mu.Unlock()
		return state, errors.New("queue is empty")
	}
	if index < 0 || index >= len(s.entries) {
		state := s.snapshotLocked()
		s.mu.Unlock()
		return state, fmt.Errorf("queue index %d out of range", index)
	}

	s.currentIndex = index
	s.touchLocked()
	state := s.snapshotLocked()
	s.mu.Unlock()

	s.afterMutation(state)
	return state, nil
}

func (s *Service) Clear() State {
	s.mu.Lock()
	s.entries = nil
	s.currentIndex = -1
	s.touchLocked()
	state := s.snapshotLocked()
	s.mu.Unlock()

	s.afterMutation(state)
	return state
}

func (s *Service) Next() (State, bool) {
	return s.advance(nextModeManual)
}

func (s *Service) AdvanceAutoplay() (State, bool) {
	return s.advance(nextModeAutoplay)
}

func (s *Service) advance(mode nextMode) (State, bool) {
	s.mu.Lock()
	nextIndex, ok := s.resolveNextIndexLocked(mode)
	if !ok {
		state := s.snapshotLocked()
		s.mu.Unlock()
		return state, false
	}

	s.currentIndex = nextIndex
	s.touchLocked()
	state := s.snapshotLocked()
	s.mu.Unlock()

	s.afterMutation(state)
	return state, true
}

func (s *Service) resolveNextIndexLocked(mode nextMode) (int, bool) {
	total := len(s.entries)
	if total == 0 {
		return -1, false
	}

	if s.currentIndex < 0 || s.currentIndex >= total {
		return 0, true
	}

	if mode == nextModeAutoplay && s.repeatMode == RepeatModeOne {
		return s.currentIndex, true
	}

	if s.shuffle {
		if total == 1 {
			if mode == nextModeAutoplay && s.repeatMode == RepeatModeOff {
				return -1, false
			}
			return 0, true
		}

		return s.randomIndexLocked(total, s.currentIndex), true
	}

	if s.currentIndex < total-1 {
		return s.currentIndex + 1, true
	}

	if s.repeatMode == RepeatModeAll {
		return 0, true
	}

	return -1, false
}

func (s *Service) randomIndexLocked(total int, exclude int) int {
	if s.rng == nil {
		s.rng = rand.New(rand.NewSource(time.Now().UnixNano()))
	}

	next := s.rng.Intn(total - 1)
	if next >= exclude {
		next++
	}

	return next
}

func (s *Service) Previous() (State, bool) {
	s.mu.Lock()
	if len(s.entries) == 0 || s.currentIndex == 0 {
		state := s.snapshotLocked()
		s.mu.Unlock()
		return state, false
	}

	if s.currentIndex < 0 {
		s.currentIndex = 0
	} else {
		s.currentIndex--
	}
	s.touchLocked()
	state := s.snapshotLocked()
	s.mu.Unlock()

	s.afterMutation(state)
	return state, true
}

func (s *Service) lookupTracks(trackIDs []int64) ([]library.TrackSummary, error) {
	if len(trackIDs) == 0 {
		return []library.TrackSummary{}, nil
	}

	uniqueTrackIDs := uniqueIDs(trackIDs)
	placeholders := make([]string, len(uniqueTrackIDs))
	args := make([]any, len(uniqueTrackIDs))
	for i, id := range uniqueTrackIDs {
		placeholders[i] = "?"
		args[i] = id
	}

	query := fmt.Sprintf(`
		SELECT
			t.id,
			COALESCE(NULLIF(TRIM(t.title), ''), 'Unknown Title') AS track_title,
			COALESCE(NULLIF(TRIM(t.artist), ''), 'Unknown Artist') AS track_artist,
			COALESCE(NULLIF(TRIM(t.album), ''), 'Unknown Album') AS track_album,
			COALESCE(NULLIF(TRIM(t.album_artist), ''), COALESCE(NULLIF(TRIM(t.artist), ''), 'Unknown Artist')) AS track_album_artist,
			t.disc_no,
			t.track_no,
			t.duration_ms,
			f.path
		FROM tracks t
		JOIN files f ON f.id = t.file_id
		WHERE f.file_exists = 1
		  AND t.id IN (%s)
	`, strings.Join(placeholders, ","))

	rows, err := s.db.QueryContext(context.Background(), query, args...)
	if err != nil {
		return nil, fmt.Errorf("query tracks for queue: %w", err)
	}
	defer rows.Close()

	trackByID := make(map[int64]library.TrackSummary, len(uniqueTrackIDs))
	for rows.Next() {
		var track library.TrackSummary
		var discNo sql.NullInt64
		var trackNo sql.NullInt64
		var durationMS sql.NullInt64
		if scanErr := rows.Scan(
			&track.ID,
			&track.Title,
			&track.Artist,
			&track.Album,
			&track.AlbumArtist,
			&discNo,
			&trackNo,
			&durationMS,
			&track.Path,
		); scanErr != nil {
			return nil, fmt.Errorf("scan queue track row: %w", scanErr)
		}
		track.DiscNo = intPointer(discNo)
		track.TrackNo = intPointer(trackNo)
		track.DurationMS = intPointer(durationMS)
		trackByID[track.ID] = track
	}

	if rowsErr := rows.Err(); rowsErr != nil {
		return nil, fmt.Errorf("iterate queue tracks: %w", rowsErr)
	}

	ordered := make([]library.TrackSummary, 0, len(trackIDs))
	for _, trackID := range trackIDs {
		track, ok := trackByID[trackID]
		if !ok {
			continue
		}
		ordered = append(ordered, track)
	}

	if len(ordered) == 0 {
		return nil, errors.New("no playable tracks were found")
	}

	return ordered, nil
}

func (s *Service) afterMutation(state State) {
	s.persistSnapshot(state)
	s.emitState(state)
	s.notifyChange(state)
}

func (s *Service) emitState(state State) {
	s.mu.Lock()
	emitter := s.emit
	s.mu.Unlock()

	if emitter != nil {
		emitter(EventStateChanged, state)
	}
}

func (s *Service) notifyChange(state State) {
	s.mu.Lock()
	listener := s.onChange
	s.mu.Unlock()

	if listener != nil {
		listener(state)
	}
}

func (s *Service) snapshotLocked() State {
	entries := make([]library.TrackSummary, len(s.entries))
	copy(entries, s.entries)

	state := State{
		Entries:      entries,
		CurrentIndex: s.currentIndex,
		RepeatMode:   s.repeatMode,
		Shuffle:      s.shuffle,
		Total:        len(entries),
	}

	if s.currentIndex >= 0 && s.currentIndex < len(entries) {
		track := entries[s.currentIndex]
		state.CurrentTrack = &track
	}

	if !s.updatedAt.IsZero() {
		state.UpdatedAt = s.updatedAt.UTC().Format(time.RFC3339)
	}

	return state
}

func (s *Service) touchLocked() {
	s.updatedAt = time.Now().UTC()
}

func (s *Service) loadSnapshot() {
	if s.db == nil {
		return
	}

	ctx := context.Background()

	var (
		currentTrackID sql.NullInt64
		repeatMode     sql.NullString
		shuffleInt     sql.NullInt64
		updatedAt      sql.NullString
	)

	err := s.db.QueryRowContext(
		ctx,
		"SELECT current_track_id, repeat_mode, shuffle, updated_at FROM playback_state WHERE id = 1",
	).Scan(&currentTrackID, &repeatMode, &shuffleInt, &updatedAt)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return
	}

	rows, err := s.db.QueryContext(ctx, `
		SELECT
			t.id,
			COALESCE(NULLIF(TRIM(t.title), ''), 'Unknown Title') AS track_title,
			COALESCE(NULLIF(TRIM(t.artist), ''), 'Unknown Artist') AS track_artist,
			COALESCE(NULLIF(TRIM(t.album), ''), 'Unknown Album') AS track_album,
			COALESCE(NULLIF(TRIM(t.album_artist), ''), COALESCE(NULLIF(TRIM(t.artist), ''), 'Unknown Artist')) AS track_album_artist,
			t.disc_no,
			t.track_no,
			t.duration_ms,
			f.path
		FROM queue_entries qe
		JOIN tracks t ON t.id = qe.track_id
		JOIN files f ON f.id = t.file_id
		WHERE f.file_exists = 1
		ORDER BY qe.position ASC, qe.id ASC
	`)
	if err != nil {
		return
	}
	defer rows.Close()

	entries := make([]library.TrackSummary, 0)
	for rows.Next() {
		var track library.TrackSummary
		var discNo sql.NullInt64
		var trackNo sql.NullInt64
		var durationMS sql.NullInt64
		if scanErr := rows.Scan(
			&track.ID,
			&track.Title,
			&track.Artist,
			&track.Album,
			&track.AlbumArtist,
			&discNo,
			&trackNo,
			&durationMS,
			&track.Path,
		); scanErr != nil {
			return
		}
		track.DiscNo = intPointer(discNo)
		track.TrackNo = intPointer(trackNo)
		track.DurationMS = intPointer(durationMS)
		entries = append(entries, track)
	}
	if rowsErr := rows.Err(); rowsErr != nil {
		return
	}

	newRepeatMode := RepeatModeOff
	if repeatMode.Valid {
		if normalized, normalizeErr := normalizeRepeatMode(repeatMode.String); normalizeErr == nil {
			newRepeatMode = normalized
		}
	}

	currentIndex := -1
	if len(entries) > 0 {
		currentIndex = 0
		if currentTrackID.Valid {
			for index, track := range entries {
				if track.ID == currentTrackID.Int64 {
					currentIndex = index
					break
				}
			}
		}
	}

	loadedAt := time.Now().UTC()
	if updatedAt.Valid {
		if parsed, parseErr := time.Parse(time.RFC3339Nano, updatedAt.String); parseErr == nil {
			loadedAt = parsed.UTC()
		}
	}

	s.mu.Lock()
	s.entries = entries
	s.currentIndex = currentIndex
	s.repeatMode = newRepeatMode
	s.shuffle = shuffleInt.Valid && shuffleInt.Int64 == 1
	s.updatedAt = loadedAt
	s.mu.Unlock()
}

func (s *Service) persistSnapshot(state State) {
	if s.db == nil {
		return
	}

	ctx := context.Background()
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return
	}

	defer func() {
		_ = tx.Rollback()
	}()

	if _, err := tx.ExecContext(ctx, "DELETE FROM queue_entries"); err != nil {
		return
	}

	for position, track := range state.Entries {
		if _, err := tx.ExecContext(
			ctx,
			"INSERT INTO queue_entries(position, track_id, source) VALUES (?, ?, ?)",
			position,
			track.ID,
			"queue",
		); err != nil {
			return
		}
	}

	var currentTrackID any
	if state.CurrentTrack != nil {
		currentTrackID = state.CurrentTrack.ID
	}

	updatedAt := state.UpdatedAt
	if strings.TrimSpace(updatedAt) == "" {
		updatedAt = time.Now().UTC().Format(time.RFC3339)
	}

	if _, err := tx.ExecContext(ctx, `
		INSERT INTO playback_state(id, current_track_id, position_ms, status, repeat_mode, shuffle, updated_at)
		VALUES (
			1,
			?,
			COALESCE((SELECT position_ms FROM playback_state WHERE id = 1), 0),
			COALESCE((SELECT status FROM playback_state WHERE id = 1), 'stopped'),
			?,
			?,
			?
		)
		ON CONFLICT(id) DO UPDATE SET
			current_track_id = excluded.current_track_id,
			repeat_mode = excluded.repeat_mode,
			shuffle = excluded.shuffle,
			updated_at = excluded.updated_at
	`,
		currentTrackID,
		state.RepeatMode,
		boolToInt(state.Shuffle),
		updatedAt,
	); err != nil {
		return
	}

	if err := tx.Commit(); err != nil {
		return
	}
}

func normalizeRepeatMode(mode string) (string, error) {
	switch strings.ToLower(strings.TrimSpace(mode)) {
	case "", RepeatModeOff:
		return RepeatModeOff, nil
	case RepeatModeAll:
		return RepeatModeAll, nil
	case RepeatModeOne:
		return RepeatModeOne, nil
	default:
		return "", fmt.Errorf("invalid repeat mode %q", mode)
	}
}

func boolToInt(value bool) int {
	if value {
		return 1
	}

	return 0
}

func normalizeCurrentIndex(total int, startIndex int) int {
	if total == 0 {
		return -1
	}
	if startIndex < 0 || startIndex >= total {
		return 0
	}

	return startIndex
}

func uniqueIDs(ids []int64) []int64 {
	unique := make([]int64, 0, len(ids))
	seen := make(map[int64]struct{}, len(ids))
	for _, id := range ids {
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		unique = append(unique, id)
	}

	return unique
}

func intPointer(value sql.NullInt64) *int {
	if !value.Valid {
		return nil
	}

	intValue := int(value.Int64)
	return &intValue
}
