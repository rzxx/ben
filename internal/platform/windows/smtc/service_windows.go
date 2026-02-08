//go:build windows

package smtc

import (
	"ben/internal/player"
	"errors"
	"fmt"
	"log"
	"strings"
	"sync"
	"unsafe"

	"github.com/zzl/go-com/com"
	"github.com/zzl/go-win32api/v2/win32"
	"github.com/zzl/go-winrtapi/winrt"
)

const (
	smtcClassName           = "Windows.Media.SystemMediaTransportControls"
	timelineClassName       = "Windows.Media.SystemMediaTransportControlsTimelineProperties"
	appMediaID              = "Ben"
	timespanTickPerMS int64 = 10000
)

type Service struct {
	mu      sync.Mutex
	player  *player.Service
	updates chan player.State
	stop    chan struct{}
	done    chan struct{}
	running bool
}

type runtimeState struct {
	player       *player.Service
	controls     *winrt.ISystemMediaTransportControls
	controls2    *winrt.ISystemMediaTransportControls2
	updater      *winrt.ISystemMediaTransportControlsDisplayUpdater
	musicProps   *winrt.IMusicDisplayProperties
	musicProps2  *winrt.IMusicDisplayProperties2
	timeline     *winrt.ISystemMediaTransportControlsTimelineProperties
	buttonToken  winrt.EventRegistrationToken
	hookAttached bool
	lastTrackID  int64
	hasTrack     bool
}

func NewService(playerService *player.Service) *Service {
	return &Service{player: playerService}
}

func (s *Service) Start(hwnd win32.HWND) error {
	s.mu.Lock()
	if s.running {
		s.mu.Unlock()
		return nil
	}

	updates := make(chan player.State, 1)
	stopCh := make(chan struct{})
	doneCh := make(chan struct{})
	readyCh := make(chan error, 1)

	s.updates = updates
	s.stop = stopCh
	s.done = doneCh
	s.running = true
	s.mu.Unlock()

	go s.run(hwnd, updates, stopCh, doneCh, readyCh)

	if err := <-readyCh; err != nil {
		s.mu.Lock()
		s.running = false
		s.updates = nil
		s.stop = nil
		s.done = nil
		s.mu.Unlock()
		<-doneCh
		return err
	}

	return nil
}

func (s *Service) UpdatePlayerState(state player.State) {
	s.mu.Lock()
	running := s.running
	updates := s.updates
	s.mu.Unlock()

	if !running || updates == nil {
		return
	}

	select {
	case updates <- state:
	default:
		select {
		case <-updates:
		default:
		}
		select {
		case updates <- state:
		default:
		}
	}
}

func (s *Service) Close() error {
	s.mu.Lock()
	if !s.running {
		s.mu.Unlock()
		return nil
	}

	stopCh := s.stop
	doneCh := s.done
	s.running = false
	s.updates = nil
	s.stop = nil
	s.done = nil
	s.mu.Unlock()

	close(stopCh)
	<-doneCh
	return nil
}

func (s *Service) run(
	hwnd win32.HWND,
	updates <-chan player.State,
	stopCh <-chan struct{},
	doneCh chan<- struct{},
	readyCh chan<- error,
) {
	defer close(doneCh)

	init := winrt.InitializeMt()
	defer init.Uninitialize()

	runtimeState, err := newRuntimeState(s.player, hwnd)
	if err != nil {
		readyCh <- err
		return
	}
	defer runtimeState.shutdown()

	readyCh <- nil

	for {
		select {
		case <-stopCh:
			return
		case state := <-updates:
			runtimeState.apply(state)
		}
	}
}

func newRuntimeState(playerService *player.Service, hwnd win32.HWND) (*runtimeState, error) {
	if hwnd == 0 {
		return nil, errors.New("smtc requires a valid window handle")
	}

	hs := winrt.NewHStr(smtcClassName)
	defer hs.Dispose()

	var interop *win32.ISystemMediaTransportControlsInterop
	hr := win32.RoGetActivationFactory(hs.Ptr, &win32.IID_ISystemMediaTransportControlsInterop, unsafe.Pointer(&interop))
	if win32.FAILED(hr) {
		return nil, fmt.Errorf("smtc interop activation factory: %s", win32.HRESULT_ToString(hr))
	}
	if interop == nil {
		return nil, errors.New("smtc interop activation factory returned nil")
	}
	com.AddToScope(interop)

	var controls *winrt.ISystemMediaTransportControls
	controlsHR := interop.GetForWindow(hwnd, &winrt.IID_ISystemMediaTransportControls, unsafe.Pointer(&controls))
	if win32.FAILED(controlsHR) {
		return nil, fmt.Errorf("smtc GetForWindow: %s", win32.HRESULT_ToString(controlsHR))
	}
	if controls == nil {
		return nil, errors.New("smtc unavailable for current window")
	}
	com.AddToScope(controls)

	state := &runtimeState{
		player:   playerService,
		controls: controls,
	}

	state.controls.Put_IsEnabled(true)
	state.controls.Put_IsPlayEnabled(true)
	state.controls.Put_IsPauseEnabled(true)
	state.controls.Put_IsStopEnabled(true)
	state.controls.Put_IsNextEnabled(true)
	state.controls.Put_IsPreviousEnabled(true)

	state.updater = state.controls.Get_DisplayUpdater()
	if state.updater != nil {
		state.updater.Put_Type(winrt.MediaPlaybackType_Music)
		state.updater.Put_AppMediaId(appMediaID)
		state.musicProps = state.updater.Get_MusicProperties()
		if state.musicProps != nil {
			var musicProps2 *winrt.IMusicDisplayProperties2
			queryHR := state.musicProps.QueryInterface(&winrt.IID_IMusicDisplayProperties2, unsafe.Pointer(&musicProps2))
			if !win32.FAILED(queryHR) && musicProps2 != nil {
				com.AddToScope(musicProps2)
				state.musicProps2 = musicProps2
			}
		}
		state.updater.Update()
	}

	var controls2 *winrt.ISystemMediaTransportControls2
	queryHR := state.controls.QueryInterface(&winrt.IID_ISystemMediaTransportControls2, unsafe.Pointer(&controls2))
	if !win32.FAILED(queryHR) && controls2 != nil {
		com.AddToScope(controls2)
		state.controls2 = controls2
		state.timeline = newTimelineProperties()
	}

	state.buttonToken = state.controls.Add_ButtonPressed(state.onButtonPressed)
	state.hookAttached = true

	return state, nil
}

func (s *runtimeState) shutdown() {
	if s.controls == nil {
		return
	}

	if s.hookAttached {
		s.controls.Remove_ButtonPressed(s.buttonToken)
	}

	s.controls.Put_IsEnabled(false)
}

func (s *runtimeState) apply(state player.State) {
	if s.controls == nil {
		return
	}

	s.controls.Put_PlaybackStatus(mapPlaybackStatus(state.Status))

	hasQueue := state.QueueLength > 0
	hasTrack := state.CurrentTrack != nil

	s.controls.Put_IsPlayEnabled(hasQueue)
	s.controls.Put_IsPauseEnabled(hasTrack)
	s.controls.Put_IsStopEnabled(hasTrack)
	s.controls.Put_IsNextEnabled(hasQueue)
	s.controls.Put_IsPreviousEnabled(hasTrack)

	if !hasTrack {
		s.applyEmptyTrack()
		s.applyTimeline(0, 0)
		return
	}

	track := state.CurrentTrack
	if trackChanged(s, track.ID) {
		s.applyMetadata(state)
		s.hasTrack = true
		s.lastTrackID = track.ID
	}

	durationMS := optionalIntValue(state.DurationMS)
	positionMS := clampMS(state.PositionMS, 0, durationMS)
	s.applyTimeline(positionMS, durationMS)
}

func (s *runtimeState) applyEmptyTrack() {
	if !s.hasTrack {
		return
	}

	s.hasTrack = false
	s.lastTrackID = 0

	if s.updater == nil {
		return
	}

	s.updater.ClearAll()
	s.updater.Put_Type(winrt.MediaPlaybackType_Music)
	s.updater.Put_AppMediaId(appMediaID)
	s.updater.Update()
}

func (s *runtimeState) applyMetadata(state player.State) {
	if state.CurrentTrack == nil || s.updater == nil {
		return
	}

	track := state.CurrentTrack

	s.updater.Put_Type(winrt.MediaPlaybackType_Music)
	s.updater.Put_AppMediaId(appMediaID)

	if s.musicProps != nil {
		title := normalizeLabel(track.Title, "Unknown Title")
		artist := normalizeLabel(track.Artist, "Unknown Artist")
		albumArtist := normalizeLabel(track.AlbumArtist, artist)

		s.musicProps.Put_Title(title)
		s.musicProps.Put_Artist(artist)
		s.musicProps.Put_AlbumArtist(albumArtist)
	}

	if s.musicProps2 != nil {
		s.musicProps2.Put_AlbumTitle(normalizeLabel(track.Album, "Unknown Album"))
		if track.TrackNo != nil && *track.TrackNo > 0 {
			s.musicProps2.Put_TrackNumber(uint32(*track.TrackNo))
		} else {
			s.musicProps2.Put_TrackNumber(0)
		}
	}

	s.updater.Update()
}

func (s *runtimeState) applyTimeline(positionMS int, durationMS int) {
	if s.controls2 == nil || s.timeline == nil {
		return
	}

	s.timeline.Put_StartTime(millisecondsToTimeSpan(0))
	s.timeline.Put_MinSeekTime(millisecondsToTimeSpan(0))
	s.timeline.Put_Position(millisecondsToTimeSpan(positionMS))
	s.timeline.Put_EndTime(millisecondsToTimeSpan(durationMS))
	s.timeline.Put_MaxSeekTime(millisecondsToTimeSpan(durationMS))

	s.controls2.UpdateTimelineProperties(s.timeline)
}

func (s *runtimeState) onButtonPressed(
	_ *winrt.ISystemMediaTransportControls,
	args *winrt.ISystemMediaTransportControlsButtonPressedEventArgs,
) com.Error {
	if s.player == nil || args == nil {
		return com.OK
	}

	switch args.Get_Button() {
	case winrt.SystemMediaTransportControlsButton_Play:
		go s.runAction("play", s.player.Play)
	case winrt.SystemMediaTransportControlsButton_Pause:
		go s.runAction("pause", s.player.Pause)
	case winrt.SystemMediaTransportControlsButton_Stop:
		go s.runAction("stop", s.player.Stop)
	case winrt.SystemMediaTransportControlsButton_Next:
		go s.runAction("next", s.player.Next)
	case winrt.SystemMediaTransportControlsButton_Previous:
		go s.runAction("previous", s.player.Previous)
	}

	return com.OK
}

func (s *runtimeState) runAction(name string, action func() (player.State, error)) {
	if _, err := action(); err != nil {
		log.Printf("smtc %s action failed: %v", name, err)
	}
}

func newTimelineProperties() *winrt.ISystemMediaTransportControlsTimelineProperties {
	hs := winrt.NewHStr(timelineClassName)
	defer hs.Dispose()

	var inspect *win32.IInspectable
	hr := win32.RoActivateInstance(hs.Ptr, &inspect)
	if win32.FAILED(hr) || inspect == nil {
		return nil
	}

	timeline := (*winrt.ISystemMediaTransportControlsTimelineProperties)(unsafe.Pointer(inspect))
	com.AddToScope(timeline)
	return timeline
}

func mapPlaybackStatus(status string) winrt.MediaPlaybackStatus {
	switch strings.ToLower(strings.TrimSpace(status)) {
	case player.StatusPlaying:
		return winrt.MediaPlaybackStatus_Playing
	case player.StatusPaused:
		return winrt.MediaPlaybackStatus_Paused
	default:
		return winrt.MediaPlaybackStatus_Stopped
	}
}

func millisecondsToTimeSpan(milliseconds int) winrt.TimeSpan {
	if milliseconds < 0 {
		milliseconds = 0
	}

	return winrt.TimeSpan{Duration: int64(milliseconds) * timespanTickPerMS}
}

func normalizeLabel(value string, fallback string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return fallback
	}

	return trimmed
}

func optionalIntValue(value *int) int {
	if value == nil {
		return 0
	}
	if *value < 0 {
		return 0
	}

	return *value
}

func clampMS(value int, min int, max int) int {
	if value < min {
		return min
	}
	if max > 0 && value > max {
		return max
	}

	return value
}

func trackChanged(state *runtimeState, trackID int64) bool {
	if !state.hasTrack {
		return true
	}

	return state.lastTrackID != trackID
}
