//go:build libmpv

package player

import (
	"errors"
	"fmt"
	"math"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"

	mpv "github.com/gen2brain/go-mpv"
)

type mpvBackend struct {
	mu           sync.Mutex
	client       *mpv.Mpv
	onEOF        func()
	onTrackStart func(path string)
	closeOnce    sync.Once
	closed       chan struct{}
	stopLoop     chan struct{}
	closing      bool
	hasPreload   bool
	preloadPath  string
	eventLoopWG  sync.WaitGroup
}

func newPlaybackBackend() (playbackBackend, error) {
	client := mpv.New()
	if client == nil {
		return nil, errors.New("create libmpv instance")
	}

	setOptionString(client, "terminal", "no")
	setOptionString(client, "video", "no")
	setOptionString(client, "audio-display", "no")
	setOptionString(client, "keep-open", "no")
	setOptionString(client, "gapless-audio", "yes")
	setOptionString(client, "prefetch-playlist", "yes")

	if err := client.Initialize(); err != nil {
		client.TerminateDestroy()
		return nil, fmt.Errorf("initialize libmpv: %w", err)
	}

	backend := &mpvBackend{
		client:   client,
		closed:   make(chan struct{}),
		stopLoop: make(chan struct{}),
	}

	_ = client.RequestEvent(mpv.EventEnd, true)
	_ = client.RequestEvent(mpv.EventFileLoaded, true)
	_ = client.SetProperty(mpvVolumeProperty, mpv.FormatDouble, float64(defaultVolume))

	backend.eventLoopWG.Add(1)
	go backend.eventLoop()

	return backend, nil
}

func (b *mpvBackend) Load(path string) error {
	b.mu.Lock()
	defer b.mu.Unlock()
	client, err := b.requireClientLocked()
	if err != nil {
		return err
	}

	if err := client.SetPropertyString(mpvPauseProperty, "yes"); err != nil {
		return fmt.Errorf("set pause before load: %w", err)
	}

	if err := client.Command([]string{"loadfile", path, "replace"}); err != nil {
		return fmt.Errorf("load file %q: %w", path, err)
	}

	b.hasPreload = false
	b.preloadPath = ""

	return nil
}

func (b *mpvBackend) PreloadNext(path string) error {
	trimmedPath := strings.TrimSpace(path)
	if trimmedPath == "" {
		return b.ClearPreloadedNext()
	}

	b.mu.Lock()
	defer b.mu.Unlock()
	client, err := b.requireClientLocked()
	if err != nil {
		return err
	}

	if b.hasPreload && pathEqual(b.preloadPath, trimmedPath) {
		return nil
	}

	if b.hasPreload {
		if err := b.removeNextPlaylistEntryLocked(client); err != nil {
			return err
		}
		b.hasPreload = false
		b.preloadPath = ""
	}

	if err := client.Command([]string{"loadfile", trimmedPath, "append"}); err != nil {
		return fmt.Errorf("append preloaded file %q: %w", trimmedPath, err)
	}

	b.hasPreload = true
	b.preloadPath = trimmedPath
	return nil
}

func (b *mpvBackend) ClearPreloadedNext() error {
	b.mu.Lock()
	defer b.mu.Unlock()
	client, err := b.requireClientLocked()
	if err != nil {
		return err
	}

	if !b.hasPreload {
		return nil
	}

	if err := b.removeNextPlaylistEntryLocked(client); err != nil {
		return err
	}

	b.hasPreload = false
	b.preloadPath = ""
	return nil
}

func (b *mpvBackend) Play() error {
	b.mu.Lock()
	defer b.mu.Unlock()
	client, err := b.requireClientLocked()
	if err != nil {
		return err
	}

	if err := client.SetPropertyString(mpvPauseProperty, "no"); err != nil {
		return fmt.Errorf("resume playback: %w", err)
	}

	return nil
}

func (b *mpvBackend) Pause() error {
	b.mu.Lock()
	defer b.mu.Unlock()
	client, err := b.requireClientLocked()
	if err != nil {
		return err
	}

	if err := client.SetPropertyString(mpvPauseProperty, "yes"); err != nil {
		return fmt.Errorf("pause playback: %w", err)
	}

	return nil
}

func (b *mpvBackend) Seek(positionMS int) error {
	b.mu.Lock()
	defer b.mu.Unlock()
	client, err := b.requireClientLocked()
	if err != nil {
		return err
	}

	seconds := float64(positionMS) / 1000.0
	if err := client.SetProperty(mpvPositionProperty, mpv.FormatDouble, seconds); err != nil {
		return fmt.Errorf("seek playback: %w", err)
	}

	return nil
}

func (b *mpvBackend) SetVolume(volume int) error {
	b.mu.Lock()
	defer b.mu.Unlock()
	client, err := b.requireClientLocked()
	if err != nil {
		return err
	}

	if err := client.SetProperty(mpvVolumeProperty, mpv.FormatDouble, float64(volume)); err != nil {
		return fmt.Errorf("set volume: %w", err)
	}

	return nil
}

func (b *mpvBackend) PositionMS() (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	_, err := b.requireClientLocked()
	if err != nil {
		return 0, err
	}

	milliseconds, ok, err := b.readMillisecondsPropertyLocked(mpvPositionProperty)
	if err != nil {
		return 0, err
	}
	if !ok {
		return 0, nil
	}

	return milliseconds, nil
}

func (b *mpvBackend) DurationMS() (*int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	_, err := b.requireClientLocked()
	if err != nil {
		return nil, err
	}

	milliseconds, ok, err := b.readMillisecondsPropertyLocked(mpvDurationProperty)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, nil
	}

	value := milliseconds
	return &value, nil
}

func (b *mpvBackend) SetOnEOF(callback func()) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.closing {
		return
	}
	b.onEOF = callback
}

func (b *mpvBackend) SetOnTrackStart(callback func(path string)) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.closing {
		return
	}
	b.onTrackStart = callback
}

func (b *mpvBackend) Close() error {
	b.closeOnce.Do(func() {
		b.mu.Lock()
		b.closing = true
		client := b.client
		stopLoop := b.stopLoop
		b.mu.Unlock()

		if stopLoop != nil {
			close(stopLoop)
		}

		if client != nil {
			client.Wakeup()
		}

		b.eventLoopWG.Wait()

		if client != nil {
			client.TerminateDestroy()
		}

		b.mu.Lock()
		b.client = nil
		b.onEOF = nil
		b.onTrackStart = nil
		b.hasPreload = false
		b.preloadPath = ""
		b.mu.Unlock()

		close(b.closed)
	})

	<-b.closed
	return nil
}

func (b *mpvBackend) eventLoop() {
	defer b.eventLoopWG.Done()

	for {
		select {
		case <-b.stopLoop:
			return
		default:
		}

		b.mu.Lock()
		client := b.client
		b.mu.Unlock()
		if client == nil {
			return
		}

		event := client.WaitEvent(0.5)

		select {
		case <-b.stopLoop:
			return
		default:
		}

		if event == nil {
			continue
		}

		switch event.EventID {
		case mpv.EventShutdown:
			return
		case mpv.EventFileLoaded:
			b.handleFileLoadedEvent()
		case mpv.EventEnd:
			end := event.EndFile()
			if end.Reason != mpv.EndFileEOF {
				continue
			}

			b.mu.Lock()
			onEOF := b.onEOF
			closing := b.closing
			b.mu.Unlock()
			if !closing && onEOF != nil {
				onEOF()
			}
		}
	}
}

func (b *mpvBackend) handleFileLoadedEvent() {
	b.mu.Lock()
	client := b.client
	if client == nil || b.closing {
		b.mu.Unlock()
		return
	}

	path := strings.TrimSpace(client.GetPropertyString("path"))
	if b.hasPreload && path != "" && pathEqual(path, b.preloadPath) {
		b.hasPreload = false
		b.preloadPath = ""
		b.prunePlayedEntriesLocked(client)
	}

	callback := b.onTrackStart
	b.mu.Unlock()

	if callback != nil && path != "" {
		callback(path)
	}
}

func (b *mpvBackend) requireClientLocked() (*mpv.Mpv, error) {
	if b.closing || b.client == nil {
		return nil, errors.New("libmpv backend is closed")
	}

	return b.client, nil
}

func (b *mpvBackend) readMillisecondsPropertyLocked(property string) (int, bool, error) {
	value, err := b.client.GetProperty(property, mpv.FormatDouble)
	if err != nil {
		if errors.Is(err, mpv.ErrPropertyUnavailable) || errors.Is(err, mpv.ErrPropertyNotFound) {
			return 0, false, nil
		}
		return 0, false, fmt.Errorf("read %s: %w", property, err)
	}

	seconds, ok := asFloat64(value)
	if !ok {
		return 0, false, nil
	}

	if math.IsNaN(seconds) || seconds < 0 {
		return 0, false, nil
	}

	return int(math.Round(seconds * 1000)), true, nil
}

func (b *mpvBackend) removeNextPlaylistEntryLocked(client *mpv.Mpv) error {
	playlistPos, ok, err := readIntPropertyLocked(client, "playlist-pos")
	if err != nil {
		return err
	}
	if !ok {
		return nil
	}

	removeIndex := playlistPos + 1
	if err := client.Command([]string{"playlist-remove", strconv.FormatInt(removeIndex, 10)}); err != nil {
		return fmt.Errorf("remove preloaded entry: %w", err)
	}

	return nil
}

func (b *mpvBackend) prunePlayedEntriesLocked(client *mpv.Mpv) {
	playlistPos, ok, err := readIntPropertyLocked(client, "playlist-pos")
	if err != nil || !ok {
		return
	}

	for playlistPos > 0 {
		if err := client.Command([]string{"playlist-remove", "0"}); err != nil {
			return
		}
		playlistPos--
	}
}

func readIntPropertyLocked(client *mpv.Mpv, property string) (int64, bool, error) {
	value, err := client.GetProperty(property, mpv.FormatInt64)
	if err != nil {
		if errors.Is(err, mpv.ErrPropertyUnavailable) || errors.Is(err, mpv.ErrPropertyNotFound) {
			return 0, false, nil
		}
		return 0, false, fmt.Errorf("read %s: %w", property, err)
	}

	switch cast := value.(type) {
	case int64:
		return cast, true, nil
	case int:
		return int64(cast), true, nil
	case float64:
		return int64(math.Round(cast)), true, nil
	case string:
		trimmed := strings.TrimSpace(cast)
		if trimmed == "" {
			return 0, false, nil
		}
		parsed, parseErr := strconv.ParseInt(trimmed, 10, 64)
		if parseErr != nil {
			return 0, false, nil
		}
		return parsed, true, nil
	default:
		return 0, false, nil
	}
}

func asFloat64(value any) (float64, bool) {
	switch cast := value.(type) {
	case float64:
		return cast, true
	case float32:
		return float64(cast), true
	case int:
		return float64(cast), true
	case int64:
		return float64(cast), true
	default:
		return 0, false
	}
}

func pathEqual(left string, right string) bool {
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

func setOptionString(client *mpv.Mpv, name string, value string) {
	_ = client.SetOptionString(name, value)
}
