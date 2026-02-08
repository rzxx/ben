package player

import (
	"ben/internal/library"
	"ben/internal/queue"
	"errors"
	"fmt"
	"sync"
	"time"
)

const EventStateChanged = "player:state"

const (
	StatusStopped = "stopped"
	StatusPaused  = "paused"
	StatusPlaying = "playing"
)

const defaultVolume = 80

const tickerInterval = 500 * time.Millisecond

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
}

func NewService(queueService *queue.Service) *Service {
	service := &Service{
		queue:  queueService,
		status: StatusStopped,
		volume: defaultVolume,
	}

	backend, err := newPlaybackBackend()
	if err != nil {
		service.backendErr = err.Error()
	} else {
		service.backend = backend
		service.backend.SetOnEOF(service.onBackendEOF)
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

	if err := s.loadTrack(backend, queueState.CurrentTrack, false); err != nil {
		return s.GetState(), err
	}

	if err := backend.Play(); err != nil {
		return s.GetState(), fmt.Errorf("start playback: %w", err)
	}

	s.mu.Lock()
	s.status = StatusPlaying
	s.updatedAt = time.Now().UTC()
	s.ensureTickerLocked()
	s.mu.Unlock()

	s.refreshPlaybackPosition(backend)
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

func (s *Service) Stop() (State, error) {
	backend, err := s.requireBackend()
	if err != nil {
		return s.GetState(), err
	}

	if err := backend.Stop(); err != nil {
		return s.GetState(), fmt.Errorf("stop playback: %w", err)
	}

	s.mu.Lock()
	s.status = StatusStopped
	s.positionMS = 0
	s.updatedAt = time.Now().UTC()
	s.stopTickerLocked()
	s.mu.Unlock()

	state := s.GetState()
	s.emitState(state)
	return state, nil
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
		return s.Stop()
	}

	if err := s.loadTrack(backend, queueState.CurrentTrack, true); err != nil {
		return s.GetState(), err
	}

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
		s.status = StatusStopped
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
		s.status = StatusStopped
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
	backend, err := s.requireBackend()
	if err != nil {
		return s.GetState(), err
	}

	if positionMS < 0 {
		positionMS = 0
	}

	queueState := s.queue.GetState()
	if queueState.CurrentTrack == nil {
		return s.stateFromQueue(queueState), errors.New("no track selected")
	}

	if duration := s.currentDuration(queueState.CurrentTrack); duration != nil && positionMS > *duration {
		positionMS = *duration
	}

	if err := backend.Seek(positionMS); err != nil {
		return s.GetState(), fmt.Errorf("seek playback: %w", err)
	}

	s.mu.Lock()
	s.positionMS = positionMS
	s.updatedAt = time.Now().UTC()
	s.mu.Unlock()

	s.refreshPlaybackPosition(backend)
	state := s.stateFromQueue(queueState)
	s.emitState(state)
	return state, nil
}

func (s *Service) SetVolume(volume int) (State, error) {
	backend, err := s.requireBackend()
	if err != nil {
		return s.GetState(), err
	}

	if volume < 0 {
		volume = 0
	}
	if volume > 100 {
		volume = 100
	}

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
		if backend := s.tryBackend(); backend != nil {
			_ = backend.Stop()
		}

		s.mu.Lock()
		s.status = StatusStopped
		s.positionMS = 0
		s.durationMS = nil
		s.hasCurrent = false
		s.currentTrackID = 0
		s.updatedAt = time.Now().UTC()
		s.stopTickerLocked()
		s.mu.Unlock()

		s.emitState(s.stateFromQueue(queueState))
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
		_, _ = s.Stop()
		return
	}

	if err := s.loadTrack(backend, queueState.CurrentTrack, true); err != nil {
		return
	}

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
	s.updatedAt = time.Now().UTC()
	s.mu.Unlock()

	return nil
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
		_, _ = s.Stop()
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
		status = StatusStopped
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
	s.mu.Lock()
	emitter := s.emit
	s.mu.Unlock()

	if emitter != nil {
		emitter(EventStateChanged, state)
	}
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

func trackDuration(track *library.TrackSummary) *int {
	if track == nil || track.DurationMS == nil {
		return nil
	}

	value := *track.DurationMS
	return &value
}
