package scanner

import (
	"errors"
	"sync"
	"time"
)

const EventProgress = "scanner:progress"

type Progress struct {
	Phase   string `json:"phase"`
	Message string `json:"message"`
	Percent int    `json:"percent"`
	Status  string `json:"status"`
	At      string `json:"at"`
}

type Status struct {
	Running   bool   `json:"running"`
	LastRunAt string `json:"lastRunAt"`
	LastError string `json:"lastError,omitempty"`
}

type Emitter func(eventName string, payload any)

type Service struct {
	mu        sync.Mutex
	running   bool
	lastRun   time.Time
	lastError string
	emit      Emitter
}

func NewService() *Service {
	return &Service{}
}

func (s *Service) SetEmitter(emitter Emitter) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.emit = emitter
}

func (s *Service) TriggerFullScan() error {
	s.mu.Lock()
	if s.running {
		s.mu.Unlock()
		return errors.New("scan already in progress")
	}
	s.running = true
	s.lastError = ""
	s.mu.Unlock()

	go s.runSkeletonScan()
	return nil
}

func (s *Service) GetStatus() Status {
	s.mu.Lock()
	defer s.mu.Unlock()

	status := Status{
		Running:   s.running,
		LastError: s.lastError,
	}
	if !s.lastRun.IsZero() {
		status.LastRunAt = s.lastRun.UTC().Format(time.RFC3339)
	}

	return status
}

func (s *Service) runSkeletonScan() {
	steps := []Progress{
		{Phase: "start", Message: "Starting full scan", Percent: 5, Status: "running"},
		{Phase: "enumerate", Message: "Enumerating watched roots", Percent: 25, Status: "running"},
		{Phase: "diff", Message: "Reconciling existing library entries", Percent: 55, Status: "running"},
		{Phase: "parse", Message: "Preparing tag extraction pipeline", Percent: 80, Status: "running"},
		{Phase: "done", Message: "Skeleton scan completed", Percent: 100, Status: "completed"},
	}

	for _, step := range steps {
		step.At = time.Now().UTC().Format(time.RFC3339)
		s.emitProgress(step)
		time.Sleep(300 * time.Millisecond)
	}

	s.mu.Lock()
	s.running = false
	s.lastRun = time.Now().UTC()
	s.mu.Unlock()
}

func (s *Service) emitProgress(progress Progress) {
	s.mu.Lock()
	emitter := s.emit
	s.mu.Unlock()

	if emitter != nil {
		emitter(EventProgress, progress)
	}
}
