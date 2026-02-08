package main

import (
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

type CoverService struct {
	coverCacheDir string
}

func NewCoverService(coverCacheDir string) *CoverService {
	return &CoverService{coverCacheDir: strings.TrimSpace(coverCacheDir)}
}

func (s *CoverService) ServeHTTP(rw http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodGet && req.Method != http.MethodHead {
		rw.Header().Set("Allow", "GET, HEAD")
		http.Error(rw, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	coverPath := strings.TrimSpace(req.URL.Query().Get("path"))
	if coverPath == "" {
		http.Error(rw, "missing cover path", http.StatusBadRequest)
		return
	}

	resolvedPath, err := s.resolveCoverPath(coverPath)
	if err != nil {
		http.Error(rw, "cover not found", http.StatusNotFound)
		return
	}

	rw.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	http.ServeFile(rw, req, resolvedPath)
}

func (s *CoverService) resolveCoverPath(requestedPath string) (string, error) {
	cacheDir := strings.TrimSpace(s.coverCacheDir)
	if cacheDir == "" {
		return "", errors.New("cover cache dir is not configured")
	}

	cacheDirAbs, err := filepath.Abs(filepath.Clean(cacheDir))
	if err != nil {
		return "", err
	}

	cleanRequested := filepath.Clean(requestedPath)
	if !filepath.IsAbs(cleanRequested) {
		cleanRequested = filepath.Join(cacheDirAbs, cleanRequested)
	}

	resolvedPath, err := filepath.Abs(cleanRequested)
	if err != nil {
		return "", err
	}

	relativeToCache, err := filepath.Rel(cacheDirAbs, resolvedPath)
	if err != nil {
		return "", err
	}

	if relativeToCache == ".." || strings.HasPrefix(relativeToCache, ".."+string(os.PathSeparator)) || filepath.IsAbs(relativeToCache) {
		return "", errors.New("requested path is outside cover cache dir")
	}

	info, err := os.Stat(resolvedPath)
	if err != nil {
		return "", err
	}

	if info.IsDir() {
		return "", errors.New("requested path is a directory")
	}

	return resolvedPath, nil
}
