//go:build libmpv

package player

import (
	"errors"
	"fmt"
	"math"
	"sync"

	mpv "github.com/gen2brain/go-mpv"
)

type mpvBackend struct {
	mu          sync.Mutex
	client      *mpv.Mpv
	onEOF       func()
	closeOnce   sync.Once
	closed      chan struct{}
	eventLoopWG sync.WaitGroup
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

	if err := client.Initialize(); err != nil {
		client.TerminateDestroy()
		return nil, fmt.Errorf("initialize libmpv: %w", err)
	}

	backend := &mpvBackend{
		client: client,
		closed: make(chan struct{}),
	}

	_ = client.RequestEvent(mpv.EventEnd, true)
	_ = client.SetProperty(mpvVolumeProperty, mpv.FormatDouble, float64(defaultVolume))

	backend.eventLoopWG.Add(1)
	go backend.eventLoop()

	return backend, nil
}

func (b *mpvBackend) Load(path string) error {
	b.mu.Lock()
	defer b.mu.Unlock()

	if err := b.client.SetPropertyString(mpvPauseProperty, "yes"); err != nil {
		return fmt.Errorf("set pause before load: %w", err)
	}

	if err := b.client.Command([]string{"loadfile", path, "replace"}); err != nil {
		return fmt.Errorf("load file %q: %w", path, err)
	}

	return nil
}

func (b *mpvBackend) Play() error {
	b.mu.Lock()
	defer b.mu.Unlock()

	if err := b.client.SetPropertyString(mpvPauseProperty, "no"); err != nil {
		return fmt.Errorf("resume playback: %w", err)
	}

	return nil
}

func (b *mpvBackend) Pause() error {
	b.mu.Lock()
	defer b.mu.Unlock()

	if err := b.client.SetPropertyString(mpvPauseProperty, "yes"); err != nil {
		return fmt.Errorf("pause playback: %w", err)
	}

	return nil
}

func (b *mpvBackend) Stop() error {
	b.mu.Lock()
	defer b.mu.Unlock()

	if err := b.client.Command([]string{"stop"}); err != nil {
		return fmt.Errorf("stop playback: %w", err)
	}

	return nil
}

func (b *mpvBackend) Seek(positionMS int) error {
	b.mu.Lock()
	defer b.mu.Unlock()

	seconds := float64(positionMS) / 1000.0
	if err := b.client.SetProperty(mpvPositionProperty, mpv.FormatDouble, seconds); err != nil {
		return fmt.Errorf("seek playback: %w", err)
	}

	return nil
}

func (b *mpvBackend) SetVolume(volume int) error {
	b.mu.Lock()
	defer b.mu.Unlock()

	if err := b.client.SetProperty(mpvVolumeProperty, mpv.FormatDouble, float64(volume)); err != nil {
		return fmt.Errorf("set volume: %w", err)
	}

	return nil
}

func (b *mpvBackend) PositionMS() (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()

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
	b.onEOF = callback
}

func (b *mpvBackend) Close() error {
	b.closeOnce.Do(func() {
		b.mu.Lock()
		client := b.client
		b.mu.Unlock()

		if client != nil {
			client.Wakeup()
			client.TerminateDestroy()
		}

		b.eventLoopWG.Wait()
		close(b.closed)
	})

	<-b.closed
	return nil
}

func (b *mpvBackend) eventLoop() {
	defer b.eventLoopWG.Done()

	for {
		event := b.client.WaitEvent(0.5)
		if event == nil {
			continue
		}

		switch event.EventID {
		case mpv.EventShutdown:
			return
		case mpv.EventEnd:
			end := event.EndFile()
			if end.Reason != mpv.EndFileEOF {
				continue
			}

			b.mu.Lock()
			onEOF := b.onEOF
			b.mu.Unlock()
			if onEOF != nil {
				onEOF()
			}
		}
	}
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

func setOptionString(client *mpv.Mpv, name string, value string) {
	_ = client.SetOptionString(name, value)
}
