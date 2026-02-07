package player

import (
	"ben/internal/library"
	"ben/internal/queue"
	"errors"
	"sync"
	"time"
)

const EventStateChanged = "player:state"

const (
	StatusStopped = "stopped"
	StatusPaused  = "paused"
	StatusPlaying = "playing"
)

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
	updatedAt      time.Time
	emit           Emitter
	tickStop       chan struct{}
	hasCurrent     bool
	currentTrackID int64
}

func NewService(queueService *queue.Service) *Service {
	service := &Service{
		queue:  queueService,
		status: StatusStopped,
		volume: 80,
	}

	if queueService != nil {
		queueService.SetOnChange(service.onQueueChanged)
	}

	return service
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
	queueState := s.queue.GetState()
	if queueState.Total == 0 {
		return s.stateFromQueue(queueState), errors.New("queue is empty")
	}
	if queueState.CurrentTrack == nil {
		if _, err := s.queue.SetCurrentIndex(0); err != nil {
			return s.GetState(), err
		}
		queueState = s.queue.GetState()
	}

	s.mu.Lock()
	s.status = StatusPlaying
	s.setCurrentTrackLocked(queueState.CurrentTrack, false)
	if duration := trackDuration(queueState.CurrentTrack); duration != nil && s.positionMS > *duration {
		s.positionMS = *duration
	}
	s.updatedAt = time.Now().UTC()
	s.ensureTickerLocked()
	s.mu.Unlock()

	state := s.stateFromQueue(queueState)
	s.emitState(state)
	return state, nil
}

func (s *Service) Pause() (State, error) {
	s.mu.Lock()
	s.status = StatusPaused
	s.updatedAt = time.Now().UTC()
	s.stopTickerLocked()
	s.mu.Unlock()

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
	queueState, moved := s.queue.Next()
	if !moved {
		return s.Stop()
	}

	s.mu.Lock()
	s.positionMS = 0
	s.setCurrentTrackLocked(queueState.CurrentTrack, false)
	s.updatedAt = time.Now().UTC()
	if s.status == StatusPlaying {
		s.ensureTickerLocked()
	}
	s.mu.Unlock()

	state := s.stateFromQueue(queueState)
	s.emitState(state)
	return state, nil
}

func (s *Service) Previous() (State, error) {
	s.mu.Lock()
	positionMS := s.positionMS
	s.mu.Unlock()

	if positionMS > 3000 {
		return s.Seek(0)
	}

	queueState, moved := s.queue.Previous()
	if !moved {
		return s.Seek(0)
	}

	s.mu.Lock()
	s.positionMS = 0
	s.setCurrentTrackLocked(queueState.CurrentTrack, false)
	s.updatedAt = time.Now().UTC()
	if s.status == StatusPlaying {
		s.ensureTickerLocked()
	}
	s.mu.Unlock()

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
		return s.stateFromQueue(queueState), errors.New("no track selected")
	}

	if duration := trackDuration(queueState.CurrentTrack); duration != nil && positionMS > *duration {
		positionMS = *duration
	}

	s.mu.Lock()
	s.positionMS = positionMS
	s.setCurrentTrackLocked(queueState.CurrentTrack, false)
	s.updatedAt = time.Now().UTC()
	s.mu.Unlock()

	state := s.stateFromQueue(queueState)
	s.emitState(state)
	return state, nil
}

func (s *Service) SetVolume(volume int) (State, error) {
	if volume < 0 {
		volume = 0
	}
	if volume > 100 {
		volume = 100
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
	s.mu.Lock()
	if queueState.CurrentTrack == nil {
		s.status = StatusStopped
		s.positionMS = 0
		s.hasCurrent = false
		s.currentTrackID = 0
		s.stopTickerLocked()
	} else {
		s.setCurrentTrackLocked(queueState.CurrentTrack, true)
		if duration := trackDuration(queueState.CurrentTrack); duration != nil && s.positionMS > *duration {
			s.positionMS = *duration
		}
		if s.status == StatusPlaying {
			s.ensureTickerLocked()
		}
	}
	s.updatedAt = time.Now().UTC()
	s.mu.Unlock()

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
	ticker := time.NewTicker(time.Second)
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
	queueState := s.queue.GetState()
	if queueState.CurrentTrack == nil {
		_, _ = s.Stop()
		return
	}

	duration := trackDuration(queueState.CurrentTrack)

	s.mu.Lock()
	if s.status != StatusPlaying {
		s.mu.Unlock()
		return
	}

	s.positionMS += 1000
	s.updatedAt = time.Now().UTC()
	advance := duration != nil && s.positionMS >= *duration
	s.mu.Unlock()

	if !advance {
		s.emitState(s.stateFromQueue(queueState))
		return
	}

	queueState, moved := s.queue.Next()
	if !moved {
		_, _ = s.Stop()
		return
	}

	s.mu.Lock()
	s.positionMS = 0
	s.setCurrentTrackLocked(queueState.CurrentTrack, false)
	s.updatedAt = time.Now().UTC()
	s.mu.Unlock()

	s.emitState(s.stateFromQueue(queueState))
}

func (s *Service) stateFromQueue(queueState queue.State) State {
	s.mu.Lock()
	status := s.status
	positionMS := s.positionMS
	volume := s.volume
	updatedAt := s.updatedAt
	s.mu.Unlock()

	if queueState.CurrentTrack == nil {
		status = StatusStopped
		positionMS = 0
	}

	duration := trackDuration(queueState.CurrentTrack)
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

func trackDuration(track *library.TrackSummary) *int {
	if track == nil || track.DurationMS == nil {
		return nil
	}

	value := *track.DurationMS
	return &value
}
