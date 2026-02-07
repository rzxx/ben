package main

import (
	"ben/internal/library"
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"strings"
)

type SettingsService struct {
	roots *library.WatchedRootRepository
}

func NewSettingsService(roots *library.WatchedRootRepository) *SettingsService {
	return &SettingsService{roots: roots}
}

func (s *SettingsService) ListWatchedRoots() ([]library.WatchedRoot, error) {
	return s.roots.List(context.Background())
}

func (s *SettingsService) AddWatchedRoot(path string) (library.WatchedRoot, error) {
	cleaned, err := normalizePath(path)
	if err != nil {
		return library.WatchedRoot{}, err
	}

	return s.roots.Add(context.Background(), cleaned)
}

func (s *SettingsService) RemoveWatchedRoot(id int64) error {
	err := s.roots.Delete(context.Background(), id)
	if errors.Is(err, library.ErrWatchedRootNotFound) {
		return fmt.Errorf("watched root %d does not exist", id)
	}
	return err
}

func (s *SettingsService) SetWatchedRootEnabled(id int64, enabled bool) error {
	err := s.roots.SetEnabled(context.Background(), id, enabled)
	if errors.Is(err, library.ErrWatchedRootNotFound) {
		return fmt.Errorf("watched root %d does not exist", id)
	}
	return err
}

func normalizePath(path string) (string, error) {
	trimmed := strings.TrimSpace(path)
	if trimmed == "" {
		return "", errors.New("path is required")
	}

	absPath, err := filepath.Abs(trimmed)
	if err != nil {
		return "", fmt.Errorf("resolve absolute path: %w", err)
	}

	return filepath.Clean(absPath), nil
}
