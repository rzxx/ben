package main

import (
	"ben/internal/coverart"
	"database/sql"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"go.senan.xyz/taglib"
)

type CoverService struct {
	db            *sql.DB
	coverCacheDir string
}

type coverSourceReference struct {
	sourceKind string
	sourcePath string
	mimeType   string
}

const (
	coverSourceKindEmbedded = "embedded"
	coverSourceKindFile     = "file"
)

func NewCoverService(database *sql.DB, coverCacheDir string) *CoverService {
	return &CoverService{db: database, coverCacheDir: strings.TrimSpace(coverCacheDir)}
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
	variant := coverart.NormalizeVariant(req.URL.Query().Get("variant"))

	resolvedPath, err := s.resolveCoverPath(coverPath, variant != coverart.VariantOriginal)
	if err != nil {
		http.Error(rw, "cover not found", http.StatusNotFound)
		return
	}

	rw.Header().Set("Cache-Control", "public, max-age=31536000, immutable")

	if variant == coverart.VariantOriginal {
		if served, _ := s.serveOriginalCover(rw, req, resolvedPath); served {
			return
		}

		if _, statErr := os.Stat(resolvedPath); statErr != nil {
			http.Error(rw, "cover not found", http.StatusNotFound)
			return
		}

		http.ServeFile(rw, req, resolvedPath)
		return
	}

	pathToServe := resolvedPath
	if variant != coverart.VariantOriginal {
		variantPath, ok := coverart.VariantPathFromCachePath(resolvedPath, variant)
		if ok {
			if info, statErr := os.Stat(variantPath); statErr == nil && !info.IsDir() {
				pathToServe = variantPath
			}
		}
	}

	http.ServeFile(rw, req, pathToServe)
}

func (s *CoverService) serveOriginalCover(rw http.ResponseWriter, req *http.Request, resolvedCachePath string) (bool, error) {
	reference, err := s.resolveCoverSource(req, resolvedCachePath)
	if err != nil || reference == nil {
		return false, err
	}

	sourceKind := strings.ToLower(strings.TrimSpace(reference.sourceKind))
	sourcePath := strings.TrimSpace(reference.sourcePath)
	if sourcePath == "" {
		return false, nil
	}

	switch sourceKind {
	case coverSourceKindFile, "sidecar":
		info, statErr := os.Stat(sourcePath)
		if statErr != nil || info.IsDir() {
			return false, nil
		}

		http.ServeFile(rw, req, sourcePath)
		return true, nil
	case coverSourceKindEmbedded:
		imageData, readErr := taglib.ReadImage(sourcePath)
		if readErr != nil || len(imageData) == 0 {
			return false, nil
		}

		mimeType := strings.TrimSpace(reference.mimeType)
		if mimeType == "" {
			mimeType = http.DetectContentType(imageData)
		}
		if mimeType != "" {
			rw.Header().Set("Content-Type", mimeType)
		}

		if req.Method == http.MethodHead {
			return true, nil
		}

		if _, writeErr := rw.Write(imageData); writeErr != nil {
			return true, writeErr
		}

		return true, nil
	default:
		return false, nil
	}
}

func (s *CoverService) resolveCoverSource(req *http.Request, resolvedCachePath string) (*coverSourceReference, error) {
	if s.db == nil {
		return nil, nil
	}

	coverHash := coverart.HashFromCachePath(resolvedCachePath)
	if coverHash == "" {
		return nil, nil
	}

	var sourceKind sql.NullString
	var sourcePath sql.NullString
	var mimeType sql.NullString
	err := s.db.QueryRowContext(
		req.Context(),
		"SELECT source_kind, source_path, mime FROM covers WHERE LOWER(hash) = LOWER(?) LIMIT 1",
		coverHash,
	).Scan(&sourceKind, &sourcePath, &mimeType)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}

		return nil, err
	}

	reference := &coverSourceReference{
		sourceKind: strings.ToLower(strings.TrimSpace(sourceKind.String)),
		sourcePath: strings.TrimSpace(sourcePath.String),
		mimeType:   strings.TrimSpace(mimeType.String),
	}
	if reference.sourceKind == "" || reference.sourcePath == "" {
		return nil, nil
	}

	return reference, nil
}

func (s *CoverService) resolveCoverPath(requestedPath string, requireFile bool) (string, error) {
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

	if !requireFile {
		if info, err := os.Stat(resolvedPath); err == nil {
			if info.IsDir() {
				return "", errors.New("requested path is a directory")
			}
		} else if !errors.Is(err, os.ErrNotExist) {
			return "", err
		}

		return resolvedPath, nil
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
