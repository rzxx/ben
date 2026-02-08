package platform

import "ben/internal/player"

type Service interface {
	Start() error
	Stop() error
	HandlePlayerState(state player.State)
}
