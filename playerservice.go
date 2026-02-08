package main

import "ben/internal/player"

type PlayerService struct {
	player *player.Service
}

func NewPlayerService(playerService *player.Service) *PlayerService {
	return &PlayerService{player: playerService}
}

func (s *PlayerService) GetState() player.State {
	return s.player.GetState()
}

func (s *PlayerService) Play() (player.State, error) {
	return s.player.Play()
}

func (s *PlayerService) Pause() (player.State, error) {
	return s.player.Pause()
}

func (s *PlayerService) TogglePlayback() (player.State, error) {
	return s.player.TogglePlayback()
}

func (s *PlayerService) Next() (player.State, error) {
	return s.player.Next()
}

func (s *PlayerService) Previous() (player.State, error) {
	return s.player.Previous()
}

func (s *PlayerService) Seek(positionMS int) (player.State, error) {
	return s.player.Seek(positionMS)
}

func (s *PlayerService) SetVolume(volume int) (player.State, error) {
	return s.player.SetVolume(volume)
}
