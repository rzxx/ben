//go:build !windows

package platform

import (
	"ben/internal/player"

	"github.com/wailsapp/wails/v3/pkg/application"
)

type noopService struct{}

func NewService(_ *application.App, _ *player.Service) Service {
	return &noopService{}
}

func (s *noopService) Start() error {
	return nil
}

func (s *noopService) Stop() error {
	return nil
}

func (s *noopService) HandlePlayerState(_ player.State) {}
