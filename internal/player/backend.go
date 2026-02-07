package player

type playbackBackend interface {
	Load(path string) error
	Play() error
	Pause() error
	Stop() error
	Seek(positionMS int) error
	SetVolume(volume int) error
	PositionMS() (int, error)
	DurationMS() (*int, error)
	SetOnEOF(callback func())
	Close() error
}
