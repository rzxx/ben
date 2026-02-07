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
	roots    *library.WatchedRootRepository
	notifier watchedRootsNotifier
}

type watchedRootsNotifier interface {
	NotifyWatchedRootsChanged()
}

func NewSettingsService(roots *library.WatchedRootRepository, notifier watchedRootsNotifier) *SettingsService {
	return &SettingsService{roots: roots, notifier: notifier}
}

func (s *SettingsService) ListWatchedRoots() ([]library.WatchedRoot, error) {
	return s.roots.List(context.Background())
}

func (s *SettingsService) AddWatchedRoot(path string) (library.WatchedRoot, error) {
	cleaned, err := normalizePath(path)
	if err != nil {
		return library.WatchedRoot{}, err
	}

	root, err := s.roots.Add(context.Background(), cleaned)
	if err != nil {
		return library.WatchedRoot{}, err
	}

	s.notifyRootsChanged()
	return root, nil
}

func (s *SettingsService) RemoveWatchedRoot(id int64) error {
	err := s.roots.Delete(context.Background(), id)
	if errors.Is(err, library.ErrWatchedRootNotFound) {
		return fmt.Errorf("watched root %d does not exist", id)
	}
	if err == nil {
		s.notifyRootsChanged()
	}
	return err
}

func (s *SettingsService) SetWatchedRootEnabled(id int64, enabled bool) error {
	err := s.roots.SetEnabled(context.Background(), id, enabled)
	if errors.Is(err, library.ErrWatchedRootNotFound) {
		return fmt.Errorf("watched root %d does not exist", id)
	}
	if err == nil {
		s.notifyRootsChanged()
	}
	return err
}

func (s *SettingsService) notifyRootsChanged() {
	if s.notifier == nil {
		return
	}

	s.notifier.NotifyWatchedRootsChanged()
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
