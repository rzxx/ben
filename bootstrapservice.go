package main

import (
	"ben/internal/library"
	"ben/internal/player"
	"ben/internal/queue"
	"ben/internal/scanner"
	"context"
)

const (
	defaultBootstrapAlbumsLimit        = 200
	defaultThemeModePreferenceAtBootup = "system"
)

type StartupSnapshot struct {
	QueueState          queue.State        `json:"queueState"`
	PlayerState         player.State       `json:"playerState"`
	ScanStatus          scanner.Status     `json:"scanStatus"`
	AlbumsPage          library.AlbumsPage `json:"albumsPage"`
	ThemeModePreference string             `json:"themeModePreference"`
}

type BootstrapService struct {
	browseRepo *library.BrowseRepository
	queue      *queue.Service
	player     *player.Service
	scanner    *scanner.Service
}

func NewBootstrapService(
	browseRepo *library.BrowseRepository,
	queueService *queue.Service,
	playerService *player.Service,
	scannerService *scanner.Service,
) *BootstrapService {
	return &BootstrapService{
		browseRepo: browseRepo,
		queue:      queueService,
		player:     playerService,
		scanner:    scannerService,
	}
}

func (s *BootstrapService) GetInitialState(albumsLimit int, albumsOffset int) (StartupSnapshot, error) {
	if albumsLimit <= 0 {
		albumsLimit = defaultBootstrapAlbumsLimit
	}
	if albumsOffset < 0 {
		albumsOffset = 0
	}

	albumsPage, err := s.browseRepo.ListAlbums(
		context.Background(),
		"",
		"",
		albumsLimit,
		albumsOffset,
	)
	if err != nil {
		return StartupSnapshot{}, err
	}

	return StartupSnapshot{
		QueueState:          s.queue.GetState(),
		PlayerState:         s.player.GetState(),
		ScanStatus:          s.scanner.GetStatus(),
		AlbumsPage:          albumsPage,
		ThemeModePreference: defaultThemeModePreferenceAtBootup,
	}, nil
}
