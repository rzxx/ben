package player

type playbackBackend interface {
	Load(path string) error
	PreloadNext(path string) error
	ClearPreloadedNext() error
	Play() error
	Pause() error
	Seek(positionMS int) error
	SetVolume(volume int) error
	PositionMS() (int, error)
	DurationMS() (*int, error)
	SetOnEOF(callback func())
	SetOnTrackStart(callback func(path string))
	Close() error
}
