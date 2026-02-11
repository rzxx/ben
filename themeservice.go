package main

import (
	"ben/internal/palette"
	"errors"
	"fmt"
	"strings"
)

type ThemeService struct {
	resolver  *CoverService
	extractor *palette.Extractor
}

func NewThemeService(coverCacheDir string) *ThemeService {
	return &ThemeService{
		resolver:  NewCoverService(coverCacheDir),
		extractor: palette.NewExtractor(),
	}
}

func (s *ThemeService) DefaultOptions() palette.ExtractOptions {
	return palette.DefaultExtractOptions()
}

func (s *ThemeService) GenerateFromCover(coverPath string, options palette.ExtractOptions) (palette.ThemePalette, error) {
	trimmedPath := strings.TrimSpace(coverPath)
	if trimmedPath == "" {
		return palette.ThemePalette{}, errors.New("cover path is required")
	}

	resolvedPath, err := s.resolver.resolveCoverPath(trimmedPath)
	if err != nil {
		return palette.ThemePalette{}, errors.New("cover not found")
	}

	themePalette, err := s.extractor.ExtractFromPath(resolvedPath, options)
	if err != nil {
		return palette.ThemePalette{}, fmt.Errorf("generate cover theme: %w", err)
	}

	return themePalette, nil
}
