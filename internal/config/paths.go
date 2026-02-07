package config

import (
	"fmt"
	"os"
	"path/filepath"
)

type Paths struct {
	BaseDir       string
	DBPath        string
	CoverCacheDir string
}

func ResolvePaths(appSlug string) (Paths, error) {
	configDir, err := os.UserConfigDir()
	if err != nil {
		return Paths{}, fmt.Errorf("resolve user config dir: %w", err)
	}

	baseDir := filepath.Join(configDir, appSlug)
	coverCacheDir := filepath.Join(baseDir, "covers")
	dbPath := filepath.Join(baseDir, "library.db")

	if err := os.MkdirAll(baseDir, 0o755); err != nil {
		return Paths{}, fmt.Errorf("create app config dir: %w", err)
	}

	if err := os.MkdirAll(coverCacheDir, 0o755); err != nil {
		return Paths{}, fmt.Errorf("create cover cache dir: %w", err)
	}

	return Paths{
		BaseDir:       baseDir,
		DBPath:        dbPath,
		CoverCacheDir: coverCacheDir,
	}, nil
}
