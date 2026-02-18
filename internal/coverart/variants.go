package coverart

import (
	"fmt"
	"path/filepath"
	"strings"
)

const VariantOriginal = "original"

const VariantPlayer = "player"

const VariantGrid = "grid"

const VariantDetail = "detail"

const ThumbnailExtension = ".avif"

type ThumbnailSpec struct {
	Variant string
	Size    int
}

var defaultThumbnailSpecs = []ThumbnailSpec{
	{Variant: VariantPlayer, Size: 96},
	{Variant: VariantGrid, Size: 320},
	{Variant: VariantDetail, Size: 768},
}

func DefaultThumbnailSpecs() []ThumbnailSpec {
	specs := make([]ThumbnailSpec, len(defaultThumbnailSpecs))
	copy(specs, defaultThumbnailSpecs)
	return specs
}

func NormalizeVariant(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "", VariantOriginal:
		return VariantOriginal
	case VariantPlayer:
		return VariantPlayer
	case VariantGrid:
		return VariantGrid
	case VariantDetail:
		return VariantDetail
	default:
		return VariantOriginal
	}
}

func VariantPathFromCachePath(cachePath string, variant string) (string, bool) {
	resolvedVariant := NormalizeVariant(variant)
	if resolvedVariant == VariantOriginal {
		return cachePath, true
	}

	hash := HashFromCachePath(cachePath)
	if hash == "" {
		return "", false
	}

	return VariantPathForHash(filepath.Dir(cachePath), hash, resolvedVariant), true
}

func VariantPathForHash(cacheDir string, coverHash string, variant string) string {
	return filepath.Join(cacheDir, fmt.Sprintf("%s__%s%s", strings.ToLower(strings.TrimSpace(coverHash)), NormalizeVariant(variant), ThumbnailExtension))
}

func HashFromCachePath(cachePath string) string {
	return HashFromCacheFilename(filepath.Base(cachePath))
}

func HashFromCacheFilename(filename string) string {
	name := strings.TrimSpace(filename)
	if name == "" {
		return ""
	}

	base := strings.TrimSuffix(name, filepath.Ext(name))
	if base == "" {
		return ""
	}

	hashPart := base
	if separator := strings.Index(hashPart, "__"); separator >= 0 {
		hashPart = hashPart[:separator]
	}

	if !isValidHash(hashPart) {
		return ""
	}

	return strings.ToLower(hashPart)
}

func isValidHash(value string) bool {
	if len(value) != 64 {
		return false
	}

	for _, char := range value {
		if (char < '0' || char > '9') && (char < 'a' || char > 'f') && (char < 'A' || char > 'F') {
			return false
		}
	}

	return true
}
