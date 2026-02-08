//go:build windows

package platform

import (
	"ben/internal/platform/windows/smtc"
	"ben/internal/player"
	"log"
	"sync"
	"unsafe"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
	"github.com/zzl/go-win32api/v2/win32"
)

const (
	acceleratorMediaPlayPause = "MEDIA_PLAY_PAUSE"
	acceleratorMediaNextTrack = "MEDIA_NEXT_TRACK"
	acceleratorMediaPrevTrack = "MEDIA_PREV_TRACK"
	acceleratorMediaStop      = "MEDIA_STOP"
)

type windowsService struct {
	app          *application.App
	player       *player.Service
	smtc         *smtc.Service
	accelerators []string

	mu           sync.Mutex
	smtcStarted  bool
	smtcStarting bool
	hasLastState bool
	lastState    player.State
}

func NewService(app *application.App, playerService *player.Service) Service {
	return &windowsService{
		app:    app,
		player: playerService,
		smtc:   smtc.NewService(playerService),
	}
}

func (s *windowsService) Start() error {
	if s.app == nil || s.player == nil {
		return nil
	}

	if s.app.Window != nil {
		for _, window := range s.app.Window.GetAll() {
			s.watchWindow(window)
		}
		s.app.Window.OnCreate(func(window application.Window) {
			s.watchWindow(window)
		})
	}

	s.startSMTCIfNeeded()

	s.registerBinding(acceleratorMediaPlayPause, func() {
		if _, err := s.player.TogglePlayback(); err != nil {
			log.Printf("platform media key toggle failed: %v", err)
		}
	})

	s.registerBinding(acceleratorMediaNextTrack, func() {
		if _, err := s.player.Next(); err != nil {
			log.Printf("platform media key next failed: %v", err)
		}
	})

	s.registerBinding(acceleratorMediaPrevTrack, func() {
		if _, err := s.player.Previous(); err != nil {
			log.Printf("platform media key previous failed: %v", err)
		}
	})

	s.registerBinding(acceleratorMediaStop, func() {
		if _, err := s.player.Stop(); err != nil {
			log.Printf("platform media key stop failed: %v", err)
		}
	})

	return nil
}

func (s *windowsService) Stop() error {
	if s.app != nil {
		for _, accelerator := range s.accelerators {
			s.app.KeyBinding.Remove(accelerator)
		}
	}

	if s.smtc != nil {
		s.mu.Lock()
		s.smtcStarted = false
		s.smtcStarting = false
		s.mu.Unlock()
		return s.smtc.Close()
	}

	return nil
}

func (s *windowsService) HandlePlayerState(state player.State) {
	if s.smtc == nil {
		return
	}

	s.mu.Lock()
	s.lastState = state
	s.hasLastState = true
	started := s.smtcStarted
	s.mu.Unlock()

	if !started {
		s.startSMTCIfNeeded()
		return
	}

	s.smtc.UpdatePlayerState(state)
}

func (s *windowsService) startSMTCIfNeeded() bool {
	if s.smtc == nil {
		return false
	}

	s.mu.Lock()
	if s.smtcStarted {
		s.mu.Unlock()
		return true
	}
	if s.smtcStarting {
		s.mu.Unlock()
		return false
	}
	s.smtcStarting = true
	s.mu.Unlock()

	defer func() {
		s.mu.Lock()
		s.smtcStarting = false
		s.mu.Unlock()
	}()

	hwnd, ok := s.resolveWindowHandle()
	if !ok {
		return false
	}

	if err := s.smtc.Start(hwnd); err != nil {
		log.Printf("platform SMTC disabled: %v", err)
		return false
	}

	var pending player.State
	hasPending := false

	s.mu.Lock()
	s.smtcStarted = true
	if s.hasLastState {
		pending = s.lastState
		hasPending = true
	}
	s.mu.Unlock()

	if hasPending {
		s.smtc.UpdatePlayerState(pending)
	}

	return true
}

func (s *windowsService) watchWindow(window application.Window) {
	if window == nil {
		return
	}

	if s.startSMTCIfNeeded() {
		return
	}

	var cancel func()
	cancel = window.OnWindowEvent(events.Windows.WebViewNavigationCompleted, func(_ *application.WindowEvent) {
		if !s.startSMTCIfNeeded() {
			return
		}
		if cancel != nil {
			cancel()
			cancel = nil
		}
	})
}

func (s *windowsService) resolveWindowHandle() (win32.HWND, bool) {
	if s.app == nil || s.app.Window == nil {
		return 0, false
	}

	if window := s.app.Window.Current(); window != nil {
		if hwnd, ok := asHWND(window.NativeWindow()); ok {
			return hwnd, true
		}
	}

	for _, window := range s.app.Window.GetAll() {
		if hwnd, ok := asHWND(window.NativeWindow()); ok {
			return hwnd, true
		}
	}

	return 0, false
}

func asHWND(nativeWindow unsafe.Pointer) (win32.HWND, bool) {
	if nativeWindow == nil {
		return 0, false
	}

	hwnd := win32.HWND(uintptr(nativeWindow))
	if hwnd == 0 {
		return 0, false
	}

	return hwnd, true
}

func (s *windowsService) registerBinding(accelerator string, action func()) {
	s.accelerators = append(s.accelerators, accelerator)
	s.app.KeyBinding.Add(accelerator, func(_ application.Window) {
		action()
	})
}
