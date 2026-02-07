//go:build !libmpv

package player

import "errors"

func newPlaybackBackend() (playbackBackend, error) {
	return nil, errors.New("libmpv backend is not enabled; build with -tags libmpv")
}
