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
	shuffleOrder []int
	shuffleTrail []int
	lastShuffle  []int
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
	if s.shuffle != enabled {
		s.shuffle = enabled
		if enabled {
			s.resetShuffleSessionLocked()
		} else {
			s.shuffleOrder = nil
			s.shuffleTrail = nil
			s.lastShuffle = nil
		}
	}
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
	s.syncShuffleAfterQueueMutationLocked()
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
	s.syncShuffleAfterQueueMutationLocked()
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
	s.syncShuffleAfterQueueMutationLocked()

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
	s.syncShuffleAfterDirectJumpLocked(index)
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
	s.shuffleOrder = nil
	s.shuffleTrail = nil
	s.lastShuffle = nil
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

		s.ensureShuffleSessionLocked()
		if len(s.shuffleOrder) == 0 {
			if s.repeatMode != RepeatModeAll {
				return -1, false
			}
			s.refillShuffleOrderLocked()
			if len(s.shuffleOrder) == 0 {
				return -1, false
			}
		}

		nextIndex := s.shuffleOrder[0]
		s.shuffleOrder = s.shuffleOrder[1:]
		s.recordShuffleVisitLocked(nextIndex)
		return nextIndex, true
	}

	if s.currentIndex < total-1 {
		return s.currentIndex + 1, true
	}

	if s.repeatMode == RepeatModeAll {
		return 0, true
	}

	return -1, false
}

func (s *Service) Previous() (State, bool) {
	s.mu.Lock()
	if len(s.entries) == 0 {
		state := s.snapshotLocked()
		s.mu.Unlock()
		return state, false
	}

	if s.shuffle {
		s.ensureShuffleSessionLocked()
		if len(s.shuffleTrail) > 1 {
			current := s.shuffleTrail[len(s.shuffleTrail)-1]
			s.shuffleTrail = s.shuffleTrail[:len(s.shuffleTrail)-1]
			previous := s.shuffleTrail[len(s.shuffleTrail)-1]
			s.currentIndex = previous
			s.prependShuffleOrderLocked(current)
			s.touchLocked()
			state := s.snapshotLocked()
			s.mu.Unlock()

			s.afterMutation(state)
			return state, true
		}
	}

	if s.currentIndex == 0 {
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
			f.path,
			cover.cache_path
		FROM tracks t
		JOIN files f ON f.id = t.file_id
		LEFT JOIN covers cover ON cover.source_file_id = t.file_id
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
		var coverPath sql.NullString
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
			&coverPath,
		); scanErr != nil {
			return nil, fmt.Errorf("scan queue track row: %w", scanErr)
		}
		track.DiscNo = intPointer(discNo)
		track.TrackNo = intPointer(trackNo)
		track.DurationMS = intPointer(durationMS)
		track.CoverPath = stringPointer(coverPath)
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
			f.path,
			cover.cache_path
		FROM queue_entries qe
		JOIN tracks t ON t.id = qe.track_id
		JOIN files f ON f.id = t.file_id
		LEFT JOIN covers cover ON cover.source_file_id = t.file_id
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
		var coverPath sql.NullString
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
			&coverPath,
		); scanErr != nil {
			return
		}
		track.DiscNo = intPointer(discNo)
		track.TrackNo = intPointer(trackNo)
		track.DurationMS = intPointer(durationMS)
		track.CoverPath = stringPointer(coverPath)
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
	if s.shuffle {
		s.resetShuffleSessionLocked()
	}
	s.updatedAt = loadedAt
	s.mu.Unlock()
}

func (s *Service) syncShuffleAfterQueueMutationLocked() {
	if !s.shuffle {
		s.shuffleOrder = nil
		s.shuffleTrail = nil
		s.lastShuffle = nil
		return
	}

	s.lastShuffle = nil
	s.resetShuffleSessionLocked()
}

func (s *Service) syncShuffleAfterDirectJumpLocked(index int) {
	if !s.shuffle {
		return
	}

	s.ensureShuffleSessionLocked()
	if len(s.shuffleTrail) == 0 || s.shuffleTrail[len(s.shuffleTrail)-1] != index {
		s.recordShuffleVisitLocked(index)
	}
	s.removeFromShuffleOrderLocked(index)
}

func (s *Service) ensureShuffleSessionLocked() {
	if !s.shuffle {
		return
	}
	if len(s.entries) == 0 {
		s.shuffleOrder = nil
		s.shuffleTrail = nil
		s.lastShuffle = nil
		return
	}

	if len(s.shuffleTrail) == 0 {
		s.resetShuffleSessionLocked()
		return
	}

	last := s.shuffleTrail[len(s.shuffleTrail)-1]
	if last != s.currentIndex || last < 0 || last >= len(s.entries) {
		s.resetShuffleSessionLocked()
	}
}

func (s *Service) resetShuffleSessionLocked() {
	total := len(s.entries)
	if total == 0 {
		s.shuffleOrder = nil
		s.shuffleTrail = nil
		s.lastShuffle = nil
		return
	}

	if s.currentIndex < 0 || s.currentIndex >= total {
		s.currentIndex = 0
	}

	s.shuffleTrail = []int{s.currentIndex}
	s.refillShuffleOrderLocked()
}

func (s *Service) refillShuffleOrderLocked() {
	total := len(s.entries)
	if total <= 1 {
		s.shuffleOrder = nil
		s.lastShuffle = nil
		return
	}

	candidates := make([]int, 0, total-1)
	for index := range s.entries {
		if index == s.currentIndex {
			continue
		}
		candidates = append(candidates, index)
	}

	if len(candidates) == 0 {
		s.shuffleOrder = nil
		s.lastShuffle = nil
		return
	}

	order := s.buildShuffleOrderWithCycleDistanceLocked(candidates)
	s.shuffleOrder = order
	s.lastShuffle = append([]int(nil), order...)
}

func (s *Service) buildShuffleOrderWithCycleDistanceLocked(candidates []int) []int {
	if len(candidates) == 0 {
		return nil
	}

	previous := append([]int(nil), s.lastShuffle...)
	if !s.sameMembersLocked(previous, candidates) {
		previous = nil
	}

	attempts := s.shuffleCycleRetryCountLocked(len(candidates), len(previous) > 0)
	bestOrder := make([]int, len(candidates))
	copy(bestOrder, candidates)
	bestScore := int(^uint(0) >> 1)

	for attempt := 0; attempt < attempts; attempt++ {
		order := make([]int, len(candidates))
		copy(order, candidates)
		s.fisherYatesShuffleLocked(order)
		s.ruleBasedShuffleCorrectionsLocked(order)

		score, stats := s.shuffleCycleClosenessScoreLocked(previous, order)
		if score < bestScore {
			bestScore = score
			copy(bestOrder, order)
		}

		if s.shuffleCycleAcceptedLocked(previous, order, stats) {
			copy(bestOrder, order)
			break
		}
	}

	return bestOrder
}

func (s *Service) fisherYatesShuffleLocked(values []int) {
	if len(values) <= 1 {
		return
	}
	if s.rng == nil {
		s.rng = rand.New(rand.NewSource(time.Now().UnixNano()))
	}

	for i := len(values) - 1; i > 0; i-- {
		j := s.rng.Intn(i + 1)
		values[i], values[j] = values[j], values[i]
	}
}

func (s *Service) ruleBasedShuffleCorrectionsLocked(order []int) {
	if len(order) <= 1 {
		return
	}

	prefix := s.shufflePrefixLocked()
	s.breakAlbumTriplesLocked(order, prefix)

	attempts := len(order) * 30
	if attempts < 220 {
		attempts = 220
	}
	if attempts > 900 {
		attempts = 900
	}

	bestScore := s.shuffleOrderPenaltyLocked(prefix, order)
	for attempt := 0; attempt < attempts; attempt++ {
		i := s.rng.Intn(len(order))
		j := s.rng.Intn(len(order))
		if i == j {
			continue
		}

		order[i], order[j] = order[j], order[i]
		score := s.shuffleOrderPenaltyLocked(prefix, order)
		if score <= bestScore {
			bestScore = score
			continue
		}

		order[i], order[j] = order[j], order[i]
	}

	s.breakAlbumTriplesLocked(order, prefix)
}

type shuffleCycleStats struct {
	samePosition int
	nearPosition int
	samePairs    int
	headTail     int
	firstEqual   bool
	prefixEqual  bool
	suffixEqual  bool
}

func (s *Service) shuffleCycleRetryCountLocked(size int, hasPrevious bool) int {
	if !hasPrevious {
		return 1
	}

	attempts := size * 2
	if attempts < 8 {
		attempts = 8
	}
	if attempts > 14 {
		attempts = 14
	}

	return attempts
}

func (s *Service) shuffleCycleAcceptedLocked(previous []int, current []int, stats shuffleCycleStats) bool {
	if len(previous) == 0 || len(previous) != len(current) {
		return true
	}

	n := len(current)
	if n < 5 {
		return !stats.prefixEqual
	}

	maxSamePosition := maxInt(1, n/10)
	maxSamePairs := n / 12

	if stats.firstEqual {
		return false
	}
	if stats.prefixEqual || stats.suffixEqual {
		return false
	}
	if stats.samePosition > maxSamePosition {
		return false
	}
	if stats.samePairs > maxSamePairs {
		return false
	}

	return true
}

func (s *Service) shuffleCycleClosenessScoreLocked(previous []int, current []int) (int, shuffleCycleStats) {
	stats := shuffleCycleStats{}
	if len(previous) == 0 || len(previous) != len(current) {
		return 0, stats
	}

	n := len(current)
	positionByTrack := make(map[int]int, n)
	for i, index := range previous {
		positionByTrack[index] = i
	}

	pairs := make(map[[2]int]struct{}, n)
	for i := 0; i < n-1; i++ {
		pairs[[2]int{previous[i], previous[i+1]}] = struct{}{}
	}

	for i, index := range current {
		previousPos, ok := positionByTrack[index]
		if !ok {
			continue
		}
		delta := previousPos - i
		if delta < 0 {
			delta = -delta
		}
		if delta == 0 {
			stats.samePosition++
		}
		if delta <= 2 {
			stats.nearPosition++
		}
	}

	for i := 0; i < n-1; i++ {
		if _, ok := pairs[[2]int{current[i], current[i+1]}]; ok {
			stats.samePairs++
		}
	}

	headCount := 2
	if n < headCount {
		headCount = n
	}
	tailCount := 2
	if n < tailCount {
		tailCount = n
	}

	for i := 0; i < headCount; i++ {
		if previous[i] == current[i] {
			stats.headTail++
		}
	}
	for i := 0; i < tailCount; i++ {
		if previous[n-1-i] == current[n-1-i] {
			stats.headTail++
		}
	}

	stats.firstEqual = previous[0] == current[0]
	if n >= 2 {
		stats.prefixEqual = previous[0] == current[0] && previous[1] == current[1]
		stats.suffixEqual = previous[n-1] == current[n-1] && previous[n-2] == current[n-2]
	} else {
		stats.prefixEqual = stats.firstEqual
		stats.suffixEqual = stats.firstEqual
	}

	score := 0
	score += stats.samePosition * 4
	score += stats.nearPosition * 2
	score += stats.samePairs * 5
	score += stats.headTail * 3
	if stats.firstEqual {
		score += 40
	}
	if stats.prefixEqual {
		score += 50
	}
	if stats.suffixEqual {
		score += 30
	}

	return score, stats
}

func (s *Service) sameMembersLocked(left []int, right []int) bool {
	if len(left) != len(right) {
		return false
	}

	counts := make(map[int]int, len(left))
	for _, index := range left {
		counts[index]++
	}

	for _, index := range right {
		count, ok := counts[index]
		if !ok || count == 0 {
			return false
		}
		counts[index] = count - 1
	}

	for _, count := range counts {
		if count != 0 {
			return false
		}
	}

	return true
}

func (s *Service) breakAlbumTriplesLocked(order []int, prefix []int) {
	if len(order) < 3 {
		return
	}

	for i := 0; i < len(order); i++ {
		if !s.createsAlbumTripleLocked(prefix, order, i) {
			continue
		}

		swapIndex := -1
		for j := i + 1; j < len(order); j++ {
			order[i], order[j] = order[j], order[i]
			if !s.createsAlbumTripleLocked(prefix, order, i) {
				swapIndex = j
				order[i], order[j] = order[j], order[i]
				break
			}
			order[i], order[j] = order[j], order[i]
		}

		if swapIndex >= 0 {
			order[i], order[swapIndex] = order[swapIndex], order[i]
		}
	}
}

func (s *Service) createsAlbumTripleLocked(prefix []int, order []int, index int) bool {
	if index < 0 || index >= len(order) {
		return false
	}

	current := order[index]
	firstPrevious, okFirst := s.sequenceValue(prefix, order, index-1)
	secondPrevious, okSecond := s.sequenceValue(prefix, order, index-2)
	if !okFirst || !okSecond {
		return false
	}

	return s.sameAlbumLocked(current, firstPrevious) && s.sameAlbumLocked(current, secondPrevious)
}

func (s *Service) shufflePrefixLocked() []int {
	if len(s.shuffleTrail) == 0 {
		if s.currentIndex >= 0 && s.currentIndex < len(s.entries) {
			return []int{s.currentIndex}
		}
		return nil
	}

	window := 4
	start := 0
	if len(s.shuffleTrail) > window {
		start = len(s.shuffleTrail) - window
	}

	prefix := make([]int, len(s.shuffleTrail[start:]))
	copy(prefix, s.shuffleTrail[start:])
	return prefix
}

func (s *Service) shuffleOrderPenaltyLocked(prefix []int, order []int) int {
	if len(order) == 0 {
		return 0
	}

	artistWindow := 2
	artistNearPenalty := []int{0, 12, 7}
	totalPenalty := 0
	combinedLength := len(prefix) + len(order)

	for absolute := len(prefix); absolute < combinedLength; absolute++ {
		current := s.sequenceAt(prefix, order, absolute)

		for distance := 1; distance <= artistWindow; distance++ {
			previousAbsolute := absolute - distance
			if previousAbsolute < 0 {
				break
			}
			previous := s.sequenceAt(prefix, order, previousAbsolute)
			if s.sameArtistLocked(current, previous) {
				totalPenalty += artistNearPenalty[distance]
			}
		}

		if absolute-1 >= 0 {
			previous := s.sequenceAt(prefix, order, absolute-1)
			if s.sameAlbumLocked(current, previous) {
				totalPenalty += 14
			}
			if s.isAlbumAscendingPairLocked(previous, current) {
				totalPenalty += 34
			}
			if current == previous+1 {
				totalPenalty += 8
			}
		}

		if absolute-2 >= 0 {
			previous := s.sequenceAt(prefix, order, absolute-1)
			beforePrevious := s.sequenceAt(prefix, order, absolute-2)
			if s.sameAlbumLocked(current, previous) && s.sameAlbumLocked(current, beforePrevious) {
				totalPenalty += 40
			}
		}
	}

	return totalPenalty
}

func (s *Service) sequenceAt(prefix []int, order []int, absolute int) int {
	if absolute < len(prefix) {
		return prefix[absolute]
	}

	return order[absolute-len(prefix)]
}

func (s *Service) sequenceValue(prefix []int, order []int, relative int) (int, bool) {
	if relative >= 0 {
		return order[relative], true
	}

	prefixIndex := len(prefix) + relative
	if prefixIndex < 0 || prefixIndex >= len(prefix) {
		return 0, false
	}

	return prefix[prefixIndex], true
}

func (s *Service) sameArtistLocked(left int, right int) bool {
	if !s.validIndexLocked(left) || !s.validIndexLocked(right) {
		return false
	}

	leftArtist := strings.ToLower(strings.TrimSpace(s.entries[left].Artist))
	rightArtist := strings.ToLower(strings.TrimSpace(s.entries[right].Artist))
	if leftArtist == "" || rightArtist == "" {
		return false
	}

	return leftArtist == rightArtist
}

func (s *Service) sameAlbumLocked(left int, right int) bool {
	if !s.validIndexLocked(left) || !s.validIndexLocked(right) {
		return false
	}

	leftAlbum := strings.ToLower(strings.TrimSpace(s.entries[left].Album))
	rightAlbum := strings.ToLower(strings.TrimSpace(s.entries[right].Album))
	if leftAlbum == "" || rightAlbum == "" {
		return false
	}

	return leftAlbum == rightAlbum
}

func (s *Service) isAlbumAscendingPairLocked(left int, right int) bool {
	if !s.sameAlbumLocked(left, right) {
		return false
	}

	leftTrack, leftOK := s.trackOrderKeyLocked(left)
	rightTrack, rightOK := s.trackOrderKeyLocked(right)
	if !leftOK || !rightOK {
		return false
	}

	return rightTrack == leftTrack+1
}

func (s *Service) trackOrderKeyLocked(index int) (int, bool) {
	if !s.validIndexLocked(index) {
		return 0, false
	}

	track := s.entries[index]
	if track.TrackNo == nil {
		return 0, false
	}

	disc := 1
	if track.DiscNo != nil && *track.DiscNo > 0 {
		disc = *track.DiscNo
	}

	if *track.TrackNo <= 0 {
		return 0, false
	}

	return disc*1000 + *track.TrackNo, true
}

func (s *Service) validIndexLocked(index int) bool {
	return index >= 0 && index < len(s.entries)
}

func (s *Service) prependShuffleOrderLocked(index int) {
	if !s.validIndexLocked(index) || index == s.currentIndex {
		return
	}

	s.removeFromShuffleOrderLocked(index)
	s.shuffleOrder = append([]int{index}, s.shuffleOrder...)
}

func (s *Service) removeFromShuffleOrderLocked(index int) {
	for i, value := range s.shuffleOrder {
		if value != index {
			continue
		}
		s.shuffleOrder = append(s.shuffleOrder[:i], s.shuffleOrder[i+1:]...)
		return
	}
}

func (s *Service) recordShuffleVisitLocked(index int) {
	if !s.validIndexLocked(index) {
		return
	}
	if len(s.shuffleTrail) > 0 && s.shuffleTrail[len(s.shuffleTrail)-1] == index {
		return
	}

	s.shuffleTrail = append(s.shuffleTrail, index)
	if len(s.shuffleTrail) > len(s.entries)*2 {
		s.shuffleTrail = s.shuffleTrail[len(s.shuffleTrail)-len(s.entries)*2:]
	}
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

func maxInt(left int, right int) int {
	if left > right {
		return left
	}

	return right
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

func stringPointer(value sql.NullString) *string {
	if !value.Valid {
		return nil
	}

	trimmed := strings.TrimSpace(value.String)
	if trimmed == "" {
		return nil
	}

	return &trimmed
}
