package player

import (
	"ben/internal/library"
	"ben/internal/queue"
	"context"
	"database/sql"
	"errors"
	"fmt"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"
)

const EventStateChanged = "player:state"

const (
	StatusIdle    = "idle"
	StatusPaused  = "paused"
	StatusPlaying = "playing"
)

const defaultVolume = 80

const tickerInterval = 500 * time.Millisecond

const resumeSeekAttempts = 8

const resumeSeekDelay = 75 * time.Millisecond

const mpvPositionProperty = "time-pos"

const mpvDurationProperty = "duration"

const mpvVolumeProperty = "volume"

const mpvPauseProperty = "pause"

type Emitter func(eventName string, payload any)

type State struct {
	Status       string                `json:"status"`
	PositionMS   int                   `json:"positionMs"`
	Volume       int                   `json:"volume"`
	CurrentTrack *library.TrackSummary `json:"currentTrack,omitempty"`
	CurrentIndex int                   `json:"currentIndex"`
	QueueLength  int                   `json:"queueLength"`
	DurationMS   *int                  `json:"durationMs,omitempty"`
	UpdatedAt    string                `json:"updatedAt"`
}

type Service struct {
	mu             sync.Mutex
	db             *sql.DB
	queue          *queue.Service
	status         string
	positionMS     int
	volume         int
	durationMS     *int
	updatedAt      time.Time
	emit           Emitter
	tickStop       chan struct{}
	hasCurrent     bool
	currentTrackID int64
	backend        playbackBackend
	backendErr     string
	skipQueueSync  int
	hasPreloaded   bool
	preloadedTrack int64
}

func NewService(database *sql.DB, queueService *queue.Service) *Service {
	service := &Service{
		db:     database,
		queue:  queueService,
		status: StatusIdle,
		volume: defaultVolume,
	}

	service.loadPlaybackStateSnapshot()

	backend, err := newPlaybackBackend()
	if err != nil {
		service.backendErr = err.Error()
	} else {
		service.backend = backend
		service.backend.SetOnEOF(service.onBackendEOF)
		service.backend.SetOnTrackStart(service.onBackendTrackStart)
		_ = service.backend.SetVolume(service.volume)
	}

	if queueService != nil {
		queueService.SetOnChange(service.onQueueChanged)
	}

	return service
}

func (s *Service) Close() error {
	s.mu.Lock()
	s.stopTickerLocked()
	backend := s.backend
	s.backend = nil
	s.mu.Unlock()

	if backend != nil {
		return backend.Close()
	}

	return nil
}

func (s *Service) SetEmitter(emitter Emitter) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.emit = emitter
}

func (s *Service) GetState() State {
	queueState := s.queue.GetState()
	return s.stateFromQueue(queueState)
}

func (s *Service) Play() (State, error) {
	backend, err := s.requireBackend()
	if err != nil {
		return s.GetState(), err
	}

	queueState := s.queue.GetState()
	if queueState.Total == 0 {
		return s.stateFromQueue(queueState), errors.New("queue is empty")
	}
	if queueState.CurrentTrack == nil {
		restore := s.beginQueueMutation()
		updatedQueueState, err := s.queue.SetCurrentIndex(0)
		restore()
		if err != nil {
			return s.GetState(), err
		}
		queueState = updatedQueueState
	}

	resumePositionMS := 0
	s.mu.Lock()
	trackAlreadyLoaded := s.hasCurrent && queueState.CurrentTrack != nil && s.currentTrackID == queueState.CurrentTrack.ID
	if !trackAlreadyLoaded && s.positionMS > 0 {
		resumePositionMS = s.positionMS
	}
	s.mu.Unlock()

	if err := s.loadTrack(backend, queueState.CurrentTrack, false); err != nil {
		return s.GetState(), err
	}
	s.syncPreloadedNext(backend, queueState)

	if err := backend.Play(); err != nil {
		return s.GetState(), fmt.Errorf("start playback: %w", err)
	}

	if duration := s.currentDuration(queueState.CurrentTrack); duration != nil && resumePositionMS > *duration {
		resumePositionMS = *duration
	}

	resumed := false
	if resumePositionMS > 0 {
		seekErr := s.applySeekWithRetry(backend, resumePositionMS)
		resumed = seekErr == nil
	}

	s.mu.Lock()
	s.status = StatusPlaying
	s.updatedAt = time.Now().UTC()
	s.ensureTickerLocked()
	s.mu.Unlock()

	if !resumed {
		s.refreshPlaybackPosition(backend)
	}
	state := s.stateFromQueue(queueState)
	s.emitState(state)
	return state, nil
}

func (s *Service) Pause() (State, error) {
	backend, err := s.requireBackend()
	if err != nil {
		return s.GetState(), err
	}

	if err := backend.Pause(); err != nil {
		return s.GetState(), fmt.Errorf("pause playback: %w", err)
	}

	s.mu.Lock()
	s.status = StatusPaused
	s.updatedAt = time.Now().UTC()
	s.stopTickerLocked()
	s.mu.Unlock()

	s.refreshPlaybackPosition(backend)
	state := s.GetState()
	s.emitState(state)
	return state, nil
}

func (s *Service) TogglePlayback() (State, error) {
	state := s.GetState()
	if state.Status == StatusPlaying {
		return s.Pause()
	}

	return s.Play()
}

func (s *Service) Next() (State, error) {
	backend, err := s.requireBackend()
	if err != nil {
		return s.GetState(), err
	}

	s.mu.Lock()
	wasPlaying := s.status == StatusPlaying
	wasPaused := s.status == StatusPaused
	s.mu.Unlock()

	restore := s.beginQueueMutation()
	queueState, moved := s.queue.Next()
	restore()
	if !moved {
		return s.transitionToIdle(queueState, backend, true), nil
	}

	if err := s.loadTrack(backend, queueState.CurrentTrack, true); err != nil {
		return s.GetState(), err
	}
	s.syncPreloadedNext(backend, queueState)

	if wasPlaying {
		if err := backend.Play(); err != nil {
			return s.GetState(), fmt.Errorf("start next track: %w", err)
		}
	} else {
		if err := backend.Pause(); err != nil {
			return s.GetState(), fmt.Errorf("prepare next track: %w", err)
		}
	}

	s.mu.Lock()
	if wasPlaying {
		s.status = StatusPlaying
		s.ensureTickerLocked()
	} else if wasPaused {
		s.status = StatusPaused
		s.stopTickerLocked()
	} else {
		s.status = StatusIdle
		s.stopTickerLocked()
	}
	s.updatedAt = time.Now().UTC()
	s.mu.Unlock()

	s.refreshPlaybackPosition(backend)
	state := s.stateFromQueue(queueState)
	s.emitState(state)
	return state, nil
}

func (s *Service) Previous() (State, error) {
	backend, err := s.requireBackend()
	if err != nil {
		return s.GetState(), err
	}

	s.mu.Lock()
	positionMS := s.positionMS
	wasPlaying := s.status == StatusPlaying
	wasPaused := s.status == StatusPaused
	s.mu.Unlock()

	if positionMS > 3000 {
		return s.Seek(0)
	}

	restore := s.beginQueueMutation()
	queueState, moved := s.queue.Previous()
	restore()
	if !moved {
		return s.Seek(0)
	}

	if err := s.loadTrack(backend, queueState.CurrentTrack, true); err != nil {
		return s.GetState(), err
	}
	s.syncPreloadedNext(backend, queueState)

	if wasPlaying {
		if err := backend.Play(); err != nil {
			return s.GetState(), fmt.Errorf("start previous track: %w", err)
		}
	} else {
		if err := backend.Pause(); err != nil {
			return s.GetState(), fmt.Errorf("prepare previous track: %w", err)
		}
	}

	s.mu.Lock()
	if wasPlaying {
		s.status = StatusPlaying
		s.ensureTickerLocked()
	} else if wasPaused {
		s.status = StatusPaused
		s.stopTickerLocked()
	} else {
		s.status = StatusIdle
		s.stopTickerLocked()
	}
	s.updatedAt = time.Now().UTC()
	s.mu.Unlock()

	s.refreshPlaybackPosition(backend)
	state := s.stateFromQueue(queueState)
	s.emitState(state)
	return state, nil
}

func (s *Service) Seek(positionMS int) (State, error) {
	if positionMS < 0 {
		positionMS = 0
	}

	queueState := s.queue.GetState()
	if queueState.CurrentTrack == nil {
		return s.stateFromQueue(queueState), nil
	}

	s.mu.Lock()
	status := s.status
	trackAlreadyLoaded := s.hasCurrent && s.currentTrackID == queueState.CurrentTrack.ID
	s.mu.Unlock()

	backend, err := s.requireBackend()
	if err != nil {
		return s.GetState(), err
	}

	if !trackAlreadyLoaded {
		if err := s.loadTrack(backend, queueState.CurrentTrack, false); err != nil {
			return s.GetState(), err
		}
		s.syncPreloadedNext(backend, queueState)
	}

	if duration := s.currentDuration(queueState.CurrentTrack); duration != nil && positionMS > *duration {
		positionMS = *duration
	}

	if status == StatusIdle {
		_ = s.applySeekWithRetry(backend, positionMS)

		s.mu.Lock()
		s.positionMS = positionMS
		s.updatedAt = time.Now().UTC()
		s.mu.Unlock()

		state := s.stateFromQueue(queueState)
		s.emitState(state)
		return state, nil
	}

	if err := s.applySeekWithRetry(backend, positionMS); err != nil {
		return s.GetState(), fmt.Errorf("seek playback: %w", err)
	}

	if status == StatusPlaying {
		s.refreshPlaybackPosition(backend)
	}
	state := s.stateFromQueue(queueState)
	s.emitState(state)
	return state, nil
}

func (s *Service) SetVolume(volume int) (State, error) {
	backend, err := s.requireBackend()
	if err != nil {
		return s.GetState(), err
	}

	volume = clampVolume(volume)

	if err := backend.SetVolume(volume); err != nil {
		return s.GetState(), fmt.Errorf("set volume: %w", err)
	}

	s.mu.Lock()
	s.volume = volume
	s.updatedAt = time.Now().UTC()
	s.mu.Unlock()

	state := s.GetState()
	s.emitState(state)
	return state, nil
}

func (s *Service) onQueueChanged(queueState queue.State) {
	if s.shouldSkipQueueSync() {
		return
	}

	if queueState.CurrentTrack == nil {
		s.transitionToIdle(queueState, nil, true)
		return
	}

	s.mu.Lock()
	previousStatus := s.status
	trackChanged := !s.hasCurrent || s.currentTrackID != queueState.CurrentTrack.ID
	if trackChanged {
		s.positionMS = 0
		s.durationMS = trackDuration(queueState.CurrentTrack)
	}
	s.setCurrentTrackLocked(queueState.CurrentTrack, false)
	s.updatedAt = time.Now().UTC()
	if previousStatus == StatusPlaying {
		s.ensureTickerLocked()
	}
	s.mu.Unlock()

	backend := s.tryBackend()
	if backend != nil && trackChanged {
		if err := s.loadTrack(backend, queueState.CurrentTrack, true); err == nil {
			if previousStatus == StatusPlaying {
				_ = backend.Play()
			} else {
				_ = backend.Pause()
			}
		}
	}

	if backend != nil {
		s.syncPreloadedNext(backend, queueState)
	}

	if backend != nil {
		s.refreshPlaybackPosition(backend)
	}

	s.emitState(s.stateFromQueue(queueState))
}

func (s *Service) onBackendEOF() {
	backend := s.tryBackend()
	if backend == nil {
		return
	}

	s.mu.Lock()
	if s.status != StatusPlaying {
		s.mu.Unlock()
		return
	}
	s.mu.Unlock()

	restore := s.beginQueueMutation()
	queueState, moved := s.queue.AdvanceAutoplay()
	restore()
	if !moved {
		s.transitionToIdle(queueState, backend, true)
		return
	}

	s.mu.Lock()
	useGaplessTransition := s.hasPreloaded && queueState.CurrentTrack != nil && s.preloadedTrack == queueState.CurrentTrack.ID
	s.mu.Unlock()

	if useGaplessTransition {
		s.mu.Lock()
		s.status = StatusPlaying
		s.positionMS = 0
		s.durationMS = trackDuration(queueState.CurrentTrack)
		s.setCurrentTrackLocked(queueState.CurrentTrack, false)
		s.hasPreloaded = false
		s.preloadedTrack = 0
		s.updatedAt = time.Now().UTC()
		s.ensureTickerLocked()
		s.mu.Unlock()

		s.emitState(s.stateFromQueue(queueState))
		return
	}

	if err := s.loadTrack(backend, queueState.CurrentTrack, true); err != nil {
		return
	}
	s.syncPreloadedNext(backend, queueState)

	if err := backend.Play(); err != nil {
		return
	}

	s.mu.Lock()
	s.status = StatusPlaying
	s.updatedAt = time.Now().UTC()
	s.ensureTickerLocked()
	s.mu.Unlock()

	s.refreshPlaybackPosition(backend)
	s.emitState(s.stateFromQueue(queueState))
}

func (s *Service) onBackendTrackStart(path string) {
	trimmedPath := strings.TrimSpace(path)
	if trimmedPath == "" {
		return
	}

	queueState := s.queue.GetState()
	if queueState.CurrentTrack == nil {
		return
	}

	if !sameTrackPath(queueState.CurrentTrack.Path, trimmedPath) {
		nextTrack, ok := s.queue.PeekAutoplayNext()
		if !ok || nextTrack == nil || !sameTrackPath(nextTrack.Path, trimmedPath) {
			return
		}

		restore := s.beginQueueMutation()
		advancedState, moved := s.queue.AdvanceAutoplay()
		restore()
		if !moved {
			return
		}
		queueState = advancedState
	}

	s.mu.Lock()
	s.setCurrentTrackLocked(queueState.CurrentTrack, false)
	s.positionMS = 0
	s.durationMS = trackDuration(queueState.CurrentTrack)
	s.updatedAt = time.Now().UTC()
	s.hasPreloaded = false
	s.preloadedTrack = 0
	s.mu.Unlock()

	backend := s.tryBackend()
	if backend != nil {
		s.syncPreloadedNext(backend, queueState)
		s.refreshPlaybackPosition(backend)
	}

	s.emitState(s.stateFromQueue(queueState))
}

func (s *Service) loadPlaybackStateSnapshot() {
	if s.db == nil || s.queue == nil {
		return
	}

	var (
		currentTrackID sql.NullInt64
		statusValue    sql.NullString
		positionMS     sql.NullInt64
		volume         sql.NullInt64
		updatedAt      sql.NullString
	)

	err := s.db.QueryRowContext(
		context.Background(),
		"SELECT current_track_id, status, position_ms, volume, updated_at FROM playback_state WHERE id = 1",
	).Scan(&currentTrackID, &statusValue, &positionMS, &volume, &updatedAt)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return
	}

	queueState := s.queue.GetState()
	loadedStatus := normalizePlayerStatus(statusValue.String)
	if loadedStatus == StatusPlaying {
		loadedStatus = StatusPaused
	}

	loadedPosition := 0
	if positionMS.Valid && positionMS.Int64 > 0 && queueState.CurrentTrack != nil && currentTrackID.Valid && currentTrackID.Int64 == queueState.CurrentTrack.ID {
		loadedPosition = int(positionMS.Int64)
	}

	loadedVolume := defaultVolume
	if volume.Valid {
		loadedVolume = clampVolume(int(volume.Int64))
	}

	loadedUpdatedAt := time.Now().UTC()
	if updatedAt.Valid {
		if parsed, parseErr := time.Parse(time.RFC3339Nano, updatedAt.String); parseErr == nil {
			loadedUpdatedAt = parsed.UTC()
		} else if parsed, parseErr := time.Parse(time.RFC3339, updatedAt.String); parseErr == nil {
			loadedUpdatedAt = parsed.UTC()
		}
	}

	loadedDuration := trackDuration(queueState.CurrentTrack)
	if loadedDuration != nil && loadedPosition > *loadedDuration {
		loadedPosition = *loadedDuration
	}

	if queueState.CurrentTrack == nil {
		loadedStatus = StatusIdle
		loadedPosition = 0
		loadedDuration = nil
	}

	s.mu.Lock()
	s.status = loadedStatus
	s.positionMS = loadedPosition
	s.volume = loadedVolume
	s.durationMS = loadedDuration
	s.updatedAt = loadedUpdatedAt
	s.mu.Unlock()
}

func (s *Service) requireBackend() (playbackBackend, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.backend != nil {
		return s.backend, nil
	}
	if s.backendErr != "" {
		return nil, errors.New(s.backendErr)
	}

	return nil, errors.New("playback backend is unavailable")
}

func (s *Service) tryBackend() playbackBackend {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.backend
}

func (s *Service) loadTrack(backend playbackBackend, track *library.TrackSummary, force bool) error {
	if track == nil {
		return errors.New("no track selected")
	}

	s.mu.Lock()
	alreadyCurrent := s.hasCurrent && s.currentTrackID == track.ID
	s.mu.Unlock()

	if alreadyCurrent && !force {
		return nil
	}

	if err := backend.Load(track.Path); err != nil {
		return fmt.Errorf("load track %q: %w", track.Path, err)
	}

	s.mu.Lock()
	s.setCurrentTrackLocked(track, false)
	s.positionMS = 0
	s.durationMS = trackDuration(track)
	s.hasPreloaded = false
	s.preloadedTrack = 0
	s.updatedAt = time.Now().UTC()
	s.mu.Unlock()

	return nil
}

func (s *Service) syncPreloadedNext(backend playbackBackend, queueState queue.State) {
	if backend == nil || queueState.CurrentTrack == nil {
		return
	}

	nextTrack, ok := s.queue.PeekAutoplayNext()
	if !ok || nextTrack == nil {
		_ = backend.ClearPreloadedNext()
		s.mu.Lock()
		s.hasPreloaded = false
		s.preloadedTrack = 0
		s.mu.Unlock()
		return
	}

	if err := backend.PreloadNext(nextTrack.Path); err != nil {
		s.mu.Lock()
		s.hasPreloaded = false
		s.preloadedTrack = 0
		s.mu.Unlock()
		return
	}

	s.mu.Lock()
	s.hasPreloaded = true
	s.preloadedTrack = nextTrack.ID
	s.mu.Unlock()
}

func (s *Service) refreshPlaybackPosition(backend playbackBackend) {
	positionMS, positionErr := backend.PositionMS()
	durationMS, durationErr := backend.DurationMS()

	s.mu.Lock()
	defer s.mu.Unlock()

	if positionErr == nil {
		s.positionMS = positionMS
	}
	if durationErr == nil {
		s.durationMS = durationMS
	}
	s.updatedAt = time.Now().UTC()
}

func (s *Service) applySeekWithRetry(backend playbackBackend, targetPositionMS int) error {
	if targetPositionMS < 0 {
		targetPositionMS = 0
	}

	var lastErr error
	for attempt := 0; attempt < resumeSeekAttempts; attempt++ {
		if err := backend.Seek(targetPositionMS); err != nil {
			lastErr = err
			time.Sleep(resumeSeekDelay)
			continue
		}

		s.mu.Lock()
		s.positionMS = targetPositionMS
		s.updatedAt = time.Now().UTC()
		s.mu.Unlock()
		return nil
	}

	if lastErr == nil {
		lastErr = errors.New("seek did not apply")
	}

	return lastErr
}

func (s *Service) transitionToIdle(queueState queue.State, backend playbackBackend, resetPosition bool) State {
	if backend == nil {
		backend = s.tryBackend()
	}

	if backend != nil {
		_ = backend.Pause()
		if resetPosition {
			_ = backend.Seek(0)
		}
		_ = backend.ClearPreloadedNext()
	}

	s.mu.Lock()
	s.status = StatusIdle
	if resetPosition {
		s.positionMS = 0
	}
	if queueState.CurrentTrack == nil {
		s.durationMS = nil
		s.hasCurrent = false
		s.currentTrackID = 0
		s.hasPreloaded = false
		s.preloadedTrack = 0
	} else {
		s.setCurrentTrackLocked(queueState.CurrentTrack, false)
		if resetPosition {
			s.durationMS = trackDuration(queueState.CurrentTrack)
		}
		s.hasPreloaded = false
		s.preloadedTrack = 0
	}
	s.updatedAt = time.Now().UTC()
	s.stopTickerLocked()
	s.mu.Unlock()

	state := s.stateFromQueue(queueState)
	s.emitState(state)
	return state
}

func (s *Service) currentDuration(track *library.TrackSummary) *int {
	s.mu.Lock()
	duration := s.durationMS
	s.mu.Unlock()

	if duration != nil {
		value := *duration
		return &value
	}

	return trackDuration(track)
}

func (s *Service) ensureTickerLocked() {
	if s.tickStop != nil {
		return
	}

	stop := make(chan struct{})
	s.tickStop = stop
	go s.runTicker(stop)
}

func (s *Service) stopTickerLocked() {
	if s.tickStop == nil {
		return
	}

	close(s.tickStop)
	s.tickStop = nil
}

func (s *Service) runTicker(stop <-chan struct{}) {
	ticker := time.NewTicker(tickerInterval)
	defer ticker.Stop()

	for {
		select {
		case <-stop:
			return
		case <-ticker.C:
			s.onTick()
		}
	}
}

func (s *Service) onTick() {
	backend := s.tryBackend()
	if backend == nil {
		return
	}

	queueState := s.queue.GetState()
	if queueState.CurrentTrack == nil {
		s.transitionToIdle(queueState, backend, true)
		return
	}

	s.mu.Lock()
	playing := s.status == StatusPlaying
	s.mu.Unlock()

	if !playing {
		return
	}

	s.refreshPlaybackPosition(backend)
	s.emitState(s.stateFromQueue(queueState))
}

func (s *Service) setCurrentTrackLocked(track *library.TrackSummary, resetPositionIfChanged bool) {
	if track == nil {
		s.hasCurrent = false
		s.currentTrackID = 0
		return
	}

	if resetPositionIfChanged && (!s.hasCurrent || s.currentTrackID != track.ID) {
		s.positionMS = 0
	}

	s.hasCurrent = true
	s.currentTrackID = track.ID
}

func (s *Service) stateFromQueue(queueState queue.State) State {
	s.mu.Lock()
	status := s.status
	positionMS := s.positionMS
	volume := s.volume
	duration := s.durationMS
	updatedAt := s.updatedAt
	s.mu.Unlock()

	if queueState.CurrentTrack == nil {
		status = StatusIdle
		positionMS = 0
		duration = nil
	}

	if duration == nil {
		duration = trackDuration(queueState.CurrentTrack)
	}

	if duration != nil && positionMS > *duration {
		positionMS = *duration
	}

	state := State{
		Status:       status,
		PositionMS:   positionMS,
		Volume:       volume,
		CurrentIndex: queueState.CurrentIndex,
		QueueLength:  queueState.Total,
		DurationMS:   duration,
	}

	if queueState.CurrentTrack != nil {
		track := *queueState.CurrentTrack
		state.CurrentTrack = &track
	}

	if !updatedAt.IsZero() {
		state.UpdatedAt = updatedAt.UTC().Format(time.RFC3339)
	}

	return state
}

func (s *Service) emitState(state State) {
	s.persistPlaybackState(state)

	s.mu.Lock()
	emitter := s.emit
	s.mu.Unlock()

	if emitter != nil {
		emitter(EventStateChanged, state)
	}
}

func (s *Service) persistPlaybackState(state State) {
	if s.db == nil {
		return
	}

	updatedAt := strings.TrimSpace(state.UpdatedAt)
	if updatedAt == "" {
		updatedAt = time.Now().UTC().Format(time.RFC3339)
	}

	_, _ = s.db.ExecContext(
		context.Background(),
		`INSERT INTO playback_state(id, current_track_id, position_ms, status, repeat_mode, shuffle, volume, updated_at)
		 VALUES (
		 	1,
		 	COALESCE((SELECT current_track_id FROM playback_state WHERE id = 1), NULL),
		 	?,
		 	?,
		 	COALESCE((SELECT repeat_mode FROM playback_state WHERE id = 1), 'off'),
		 	COALESCE((SELECT shuffle FROM playback_state WHERE id = 1), 0),
		 	?,
		 	?
		 )
		 ON CONFLICT(id) DO UPDATE SET
		 	position_ms = excluded.position_ms,
		 	status = excluded.status,
		 	volume = excluded.volume,
		 	updated_at = excluded.updated_at`,
		state.PositionMS,
		state.Status,
		clampVolume(state.Volume),
		updatedAt,
	)
}

func (s *Service) beginQueueMutation() func() {
	s.mu.Lock()
	s.skipQueueSync++
	s.mu.Unlock()

	return func() {
		s.mu.Lock()
		if s.skipQueueSync > 0 {
			s.skipQueueSync--
		}
		s.mu.Unlock()
	}
}

func (s *Service) shouldSkipQueueSync() bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	return s.skipQueueSync > 0
}

func clampVolume(volume int) int {
	if volume < 0 {
		return 0
	}
	if volume > 100 {
		return 100
	}

	return volume
}

func trackDuration(track *library.TrackSummary) *int {
	if track == nil || track.DurationMS == nil {
		return nil
	}

	value := *track.DurationMS
	return &value
}

func normalizePlayerStatus(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case StatusPlaying:
		return StatusPlaying
	case StatusPaused:
		return StatusPaused
	case StatusIdle, "stopped":
		return StatusIdle
	default:
		return StatusIdle
	}
}

func sameTrackPath(left string, right string) bool {
	leftPath := filepath.Clean(strings.TrimSpace(left))
	rightPath := filepath.Clean(strings.TrimSpace(right))
	if leftPath == "." || rightPath == "." {
		return false
	}

	if runtime.GOOS == "windows" {
		return strings.EqualFold(leftPath, rightPath)
	}

	return leftPath == rightPath
}
