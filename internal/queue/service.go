package queue

import (
	"ben/internal/library"
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"
)

const EventStateChanged = "queue:state"

type Emitter func(eventName string, payload any)

type ChangeListener func(state State)

type State struct {
	Entries      []library.TrackSummary `json:"entries"`
	CurrentIndex int                    `json:"currentIndex"`
	CurrentTrack *library.TrackSummary  `json:"currentTrack,omitempty"`
	Total        int                    `json:"total"`
	UpdatedAt    string                 `json:"updatedAt"`
}

type Service struct {
	mu           sync.Mutex
	db           *sql.DB
	entries      []library.TrackSummary
	currentIndex int
	updatedAt    time.Time
	emit         Emitter
	onChange     ChangeListener
}

func NewService(database *sql.DB) *Service {
	return &Service{
		db:           database,
		currentIndex: -1,
	}
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
	s.mu.Lock()
	if len(s.entries) == 0 || s.currentIndex >= len(s.entries)-1 {
		state := s.snapshotLocked()
		s.mu.Unlock()
		return state, false
	}

	if s.currentIndex < 0 {
		s.currentIndex = 0
	} else {
		s.currentIndex++
	}
	s.touchLocked()
	state := s.snapshotLocked()
	s.mu.Unlock()

	s.afterMutation(state)
	return state, true
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
