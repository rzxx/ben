package main

import (
	"ben/internal/palette"
	"errors"
	"fmt"
	"os"
	"strings"
	"sync"
	"time"
)

const maxThemeCacheEntries = 96

type themeCacheEntry struct {
	palette           palette.ThemePalette
	sourceModUnixNano int64
	cachedAt          time.Time
}

type ThemeService struct {
	resolver  *CoverService
	extractor *palette.Extractor
	cacheMu   sync.RWMutex
	cache     map[string]themeCacheEntry
}

func NewThemeService(coverCacheDir string) *ThemeService {
	return &ThemeService{
		resolver:  NewCoverService(coverCacheDir),
		extractor: palette.NewExtractor(),
		cache:     make(map[string]themeCacheEntry),
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

	normalizedOptions := palette.NormalizeExtractOptions(options)
	sourceInfo, err := os.Stat(resolvedPath)
	if err != nil {
		return palette.ThemePalette{}, errors.New("cover not found")
	}
	sourceModUnixNano := sourceInfo.ModTime().UnixNano()

	cacheKey := buildThemeCacheKey(resolvedPath, normalizedOptions)
	if cachedPalette, ok := s.loadCachedPalette(cacheKey, sourceModUnixNano); ok {
		return cachedPalette, nil
	}

	themePalette, err := s.extractor.ExtractFromPath(resolvedPath, normalizedOptions)
	if err != nil {
		return palette.ThemePalette{}, fmt.Errorf("generate cover theme: %w", err)
	}

	s.storeCachedPalette(cacheKey, sourceModUnixNano, themePalette)

	return themePalette, nil
}

func buildThemeCacheKey(path string, options palette.ExtractOptions) string {
	return fmt.Sprintf(
		"%s|md:%d|q:%d|cc:%d|cand:%d|qb:%d|at:%d|iw:%t|ib:%t|minl:%0.4f|maxl:%0.4f|minc:%0.4f|tc:%0.4f|maxc:%0.4f|mind:%0.4f|w:%d",
		path,
		options.MaxDimension,
		options.Quality,
		options.ColorCount,
		options.CandidateCount,
		options.QuantizationBits,
		options.AlphaThreshold,
		options.IgnoreNearWhite,
		options.IgnoreNearBlack,
		options.MinLuma,
		options.MaxLuma,
		options.MinChroma,
		options.TargetChroma,
		options.MaxChroma,
		options.MinDelta,
		options.WorkerCount,
	)
}

func (s *ThemeService) loadCachedPalette(cacheKey string, sourceModUnixNano int64) (palette.ThemePalette, bool) {
	s.cacheMu.RLock()
	entry, ok := s.cache[cacheKey]
	s.cacheMu.RUnlock()
	if !ok || entry.sourceModUnixNano != sourceModUnixNano {
		return palette.ThemePalette{}, false
	}

	return entry.palette, true
}

func (s *ThemeService) storeCachedPalette(cacheKey string, sourceModUnixNano int64, themePalette palette.ThemePalette) {
	s.cacheMu.Lock()
	defer s.cacheMu.Unlock()

	s.cache[cacheKey] = themeCacheEntry{
		palette:           themePalette,
		sourceModUnixNano: sourceModUnixNano,
		cachedAt:          time.Now(),
	}

	if len(s.cache) <= maxThemeCacheEntries {
		return
	}

	oldestKey := ""
	oldestAt := time.Now()
	for key, entry := range s.cache {
		if oldestKey == "" || entry.cachedAt.Before(oldestAt) {
			oldestKey = key
			oldestAt = entry.cachedAt
		}
	}

	if oldestKey != "" {
		delete(s.cache, oldestKey)
	}
}
