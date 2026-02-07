package scanner

import (
	"ben/internal/library"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"go.senan.xyz/taglib"
)

const EventProgress = "scanner:progress"

const metadataVersion = 2

var trackPrefixPattern = regexp.MustCompile(`^\s*(\d{1,2})[\s._-]+(.+)$`)

var leadingIntegerPattern = regexp.MustCompile(`\d+`)

var yearPattern = regexp.MustCompile(`\b(19|20)\d{2}\b`)

var supportedExtensions = map[string]struct{}{
	".aac":  {},
	".aif":  {},
	".aiff": {},
	".alac": {},
	".flac": {},
	".m4a":  {},
	".mp3":  {},
	".ogg":  {},
	".opus": {},
	".wav":  {},
	".wma":  {},
}

type Progress struct {
	Phase   string `json:"phase"`
	Message string `json:"message"`
	Percent int    `json:"percent"`
	Status  string `json:"status"`
	At      string `json:"at"`
}

type Status struct {
	Running       bool   `json:"running"`
	LastRunAt     string `json:"lastRunAt"`
	LastError     string `json:"lastError,omitempty"`
	LastFilesSeen int    `json:"lastFilesSeen"`
	LastIndexed   int    `json:"lastIndexed"`
	LastSkipped   int    `json:"lastSkipped"`
}

type Emitter func(eventName string, payload any)

type Service struct {
	mu            sync.Mutex
	running       bool
	lastRun       time.Time
	lastError     string
	lastFilesSeen int
	lastIndexed   int
	lastSkipped   int
	emit          Emitter
	db            *sql.DB
	roots         *library.WatchedRootRepository
}

type scanTotals struct {
	filesSeen int
	indexed   int
	skipped   int
}

func NewService(database *sql.DB, roots *library.WatchedRootRepository) *Service {
	return &Service{db: database, roots: roots}
}

func (s *Service) SetEmitter(emitter Emitter) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.emit = emitter
}

func (s *Service) TriggerFullScan() error {
	s.mu.Lock()
	if s.running {
		s.mu.Unlock()
		return errors.New("scan already in progress")
	}
	s.running = true
	s.lastError = ""
	s.mu.Unlock()

	go s.runFullScan()
	return nil
}

func (s *Service) GetStatus() Status {
	s.mu.Lock()
	defer s.mu.Unlock()

	status := Status{
		Running:       s.running,
		LastError:     s.lastError,
		LastFilesSeen: s.lastFilesSeen,
		LastIndexed:   s.lastIndexed,
		LastSkipped:   s.lastSkipped,
	}
	if !s.lastRun.IsZero() {
		status.LastRunAt = s.lastRun.UTC().Format(time.RFC3339)
	}

	return status
}

func (s *Service) runFullScan() {
	ctx := context.Background()
	totals, err := s.performScan(ctx)

	s.mu.Lock()
	s.running = false
	if err != nil {
		s.lastError = err.Error()
	} else {
		s.lastError = ""
		s.lastRun = time.Now().UTC()
		s.lastFilesSeen = totals.filesSeen
		s.lastIndexed = totals.indexed
		s.lastSkipped = totals.skipped
	}
	s.mu.Unlock()

	if err != nil {
		s.emitProgress(Progress{
			Phase:   "failed",
			Message: err.Error(),
			Percent: 100,
			Status:  "failed",
			At:      time.Now().UTC().Format(time.RFC3339),
		})
		return
	}

	s.emitProgress(Progress{
		Phase: "done",
		Message: fmt.Sprintf(
			"Scan complete: %d files seen, %d indexed, %d skipped",
			totals.filesSeen,
			totals.indexed,
			totals.skipped,
		),
		Percent: 100,
		Status:  "completed",
		At:      time.Now().UTC().Format(time.RFC3339),
	})
}

func (s *Service) performScan(ctx context.Context) (scanTotals, error) {
	s.emitProgress(Progress{
		Phase:   "start",
		Message: "Starting full scan",
		Percent: 5,
		Status:  "running",
		At:      time.Now().UTC().Format(time.RFC3339),
	})

	roots, err := s.roots.List(ctx)
	if err != nil {
		return scanTotals{}, fmt.Errorf("list watched roots: %w", err)
	}

	enabledRoots := make([]library.WatchedRoot, 0, len(roots))
	for _, root := range roots {
		if root.Enabled {
			enabledRoots = append(enabledRoots, root)
		}
	}

	if len(enabledRoots) == 0 {
		s.emitProgress(Progress{
			Phase:   "done",
			Message: "No enabled watched folders configured",
			Percent: 100,
			Status:  "completed",
			At:      time.Now().UTC().Format(time.RFC3339),
		})
		return scanTotals{}, nil
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return scanTotals{}, fmt.Errorf("begin scan tx: %w", err)
	}

	defer func() {
		if tx != nil {
			_ = tx.Rollback()
		}
	}()

	if err := markRootsAsMissing(ctx, tx, enabledRoots); err != nil {
		return scanTotals{}, err
	}

	totals := scanTotals{}
	for i, root := range enabledRoots {
		progress := 10 + ((i * 70) / len(enabledRoots))
		s.emitProgress(Progress{
			Phase:   "scan",
			Message: fmt.Sprintf("Scanning %s", root.Path),
			Percent: progress,
			Status:  "running",
			At:      time.Now().UTC().Format(time.RFC3339),
		})

		rootTotals, scanErr := scanRoot(ctx, tx, root)
		totals.filesSeen += rootTotals.filesSeen
		totals.indexed += rootTotals.indexed
		totals.skipped += rootTotals.skipped
		if scanErr != nil {
			return scanTotals{}, scanErr
		}
	}

	s.emitProgress(Progress{
		Phase:   "cleanup",
		Message: "Removing stale track entries",
		Percent: 90,
		Status:  "running",
		At:      time.Now().UTC().Format(time.RFC3339),
	})

	if err := cleanupMissingTracks(ctx, tx, enabledRoots); err != nil {
		return scanTotals{}, err
	}

	if err := tx.Commit(); err != nil {
		return scanTotals{}, fmt.Errorf("commit scan tx: %w", err)
	}
	tx = nil

	return totals, nil
}

func markRootsAsMissing(ctx context.Context, tx *sql.Tx, roots []library.WatchedRoot) error {
	for _, root := range roots {
		if _, err := tx.ExecContext(
			ctx,
			"UPDATE files SET file_exists = 0 WHERE root_id = ?",
			root.ID,
		); err != nil {
			return fmt.Errorf("mark files missing for root %d: %w", root.ID, err)
		}
	}

	return nil
}

func cleanupMissingTracks(ctx context.Context, tx *sql.Tx, roots []library.WatchedRoot) error {
	for _, root := range roots {
		if _, err := tx.ExecContext(
			ctx,
			"DELETE FROM tracks WHERE file_id IN (SELECT id FROM files WHERE root_id = ? AND file_exists = 0)",
			root.ID,
		); err != nil {
			return fmt.Errorf("cleanup missing tracks for root %d: %w", root.ID, err)
		}
	}

	return nil
}

func scanRoot(ctx context.Context, tx *sql.Tx, root library.WatchedRoot) (scanTotals, error) {
	rootTotals := scanTotals{}
	scannedAt := time.Now().UTC().Format(time.RFC3339)

	err := filepath.WalkDir(root.Path, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			rootTotals.skipped++
			return nil
		}

		if entry.IsDir() {
			return nil
		}

		extension := strings.ToLower(filepath.Ext(path))
		if _, ok := supportedExtensions[extension]; !ok {
			return nil
		}

		info, infoErr := entry.Info()
		if infoErr != nil {
			rootTotals.skipped++
			return nil
		}

		rootTotals.filesSeen++
		indexed, upsertErr := upsertFileAndTrack(ctx, tx, root.ID, root.Path, path, info, scannedAt)
		if upsertErr != nil {
			return upsertErr
		}
		if indexed {
			rootTotals.indexed++
		}

		return nil
	})
	if err != nil {
		return scanTotals{}, fmt.Errorf("walk root %s: %w", root.Path, err)
	}

	return rootTotals, nil
}

func upsertFileAndTrack(
	ctx context.Context,
	tx *sql.Tx,
	rootID int64,
	rootPath string,
	path string,
	info fs.FileInfo,
	scannedAt string,
) (bool, error) {
	cleanPath := filepath.Clean(path)

	var (
		fileID       int64
		currentSize  int64
		currentMTime int64
	)

	err := tx.QueryRowContext(
		ctx,
		"SELECT id, size, mtime_ns FROM files WHERE path = ?",
		cleanPath,
	).Scan(&fileID, &currentSize, &currentMTime)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return false, fmt.Errorf("get file row %s: %w", cleanPath, err)
	}

	newMTime := info.ModTime().UnixNano()
	newSize := info.Size()

	metadataNeedsUpdate := false
	if errors.Is(err, sql.ErrNoRows) {
		result, insertErr := tx.ExecContext(
			ctx,
			`INSERT INTO files(path, root_id, size, mtime_ns, file_exists, last_seen_at)
			 VALUES (?, ?, ?, ?, 1, ?)`,
			cleanPath,
			rootID,
			newSize,
			newMTime,
			scannedAt,
		)
		if insertErr != nil {
			return false, fmt.Errorf("insert file %s: %w", cleanPath, insertErr)
		}

		insertID, idErr := result.LastInsertId()
		if idErr != nil {
			return false, fmt.Errorf("read file id %s: %w", cleanPath, idErr)
		}
		fileID = insertID
		metadataNeedsUpdate = true
	} else {
		if _, updateErr := tx.ExecContext(
			ctx,
			`UPDATE files
			 SET root_id = ?, size = ?, mtime_ns = ?, file_exists = 1, last_seen_at = ?
			 WHERE id = ?`,
			rootID,
			newSize,
			newMTime,
			scannedAt,
			fileID,
		); updateErr != nil {
			return false, fmt.Errorf("update file %s: %w", cleanPath, updateErr)
		}

		metadataNeedsUpdate = currentSize != newSize || currentMTime != newMTime
	}

	if !metadataNeedsUpdate {
		var storedTags sql.NullString
		tagErr := tx.QueryRowContext(
			ctx,
			"SELECT tags_json FROM tracks WHERE file_id = ?",
			fileID,
		).Scan(&storedTags)
		if errors.Is(tagErr, sql.ErrNoRows) {
			metadataNeedsUpdate = true
		} else if tagErr != nil {
			return false, fmt.Errorf("check track metadata for file %s: %w", cleanPath, tagErr)
		} else {
			metadataNeedsUpdate = !strings.Contains(storedTags.String, `"metadata_version":2`)
		}
	}

	if !metadataNeedsUpdate {
		return false, nil
	}

	metadata, metaErr := deriveMetadata(rootPath, cleanPath)
	if metaErr != nil {
		return false, metaErr
	}

	tagsJSON, marshalErr := json.Marshal(metadata.tags)
	if marshalErr != nil {
		return false, fmt.Errorf("marshal tags for %s: %w", cleanPath, marshalErr)
	}

	if _, upsertErr := tx.ExecContext(
		ctx,
		`INSERT INTO tracks(
			file_id,
			title,
			artist,
			album_artist,
			album,
			disc_no,
			track_no,
			year,
			genre,
			duration_ms,
			codec,
			sample_rate,
			bit_depth,
			bitrate,
			tags_json,
			updated_at
		)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(file_id) DO UPDATE SET
			title = excluded.title,
			artist = excluded.artist,
			album_artist = excluded.album_artist,
			album = excluded.album,
			disc_no = excluded.disc_no,
			track_no = excluded.track_no,
			year = excluded.year,
			genre = excluded.genre,
			duration_ms = excluded.duration_ms,
			codec = excluded.codec,
			sample_rate = excluded.sample_rate,
			bit_depth = excluded.bit_depth,
			bitrate = excluded.bitrate,
			tags_json = excluded.tags_json,
			updated_at = excluded.updated_at`,
		fileID,
		metadata.title,
		metadata.artist,
		metadata.albumArtist,
		metadata.album,
		nullableInt(metadata.discNo),
		nullableInt(metadata.trackNo),
		nullableInt(metadata.year),
		nullableString(metadata.genre),
		nullableInt(metadata.durationMS),
		nullableString(metadata.codec),
		nullableInt(metadata.sampleRate),
		nullableInt(metadata.bitDepth),
		nullableInt(metadata.bitrate),
		string(tagsJSON),
		time.Now().UTC().Format(time.RFC3339),
	); upsertErr != nil {
		return false, fmt.Errorf("upsert track %s: %w", cleanPath, upsertErr)
	}

	return true, nil
}

type extractedMetadata struct {
	title       string
	artist      string
	albumArtist string
	album       string
	year        *int
	genre       string
	durationMS  *int
	codec       string
	sampleRate  *int
	bitDepth    *int
	bitrate     *int
	discNo      *int
	trackNo     *int
	tags        map[string]any
}

func deriveMetadata(rootPath string, fullPath string) (extractedMetadata, error) {
	metadata, relativePath := deriveFallbackMetadata(rootPath, fullPath)

	tags, tagsErr := taglib.ReadTags(fullPath)
	if tagsErr != nil {
		metadata.tags["source"] = "filename_fallback"
		metadata.tags["metadata_version"] = metadataVersion
		metadata.tags["taglib_error"] = tagsErr.Error()
		return metadata, nil
	}

	applyTagValues(&metadata, tags)
	metadata.tags["source"] = "taglib_primary"
	metadata.tags["metadata_version"] = metadataVersion
	metadata.tags["taglib_tags"] = tags

	properties, propertiesErr := taglib.ReadProperties(fullPath)
	if propertiesErr != nil {
		metadata.tags["taglib_properties_error"] = propertiesErr.Error()
	} else {
		if properties.Length > 0 {
			durationMS := int(properties.Length.Milliseconds())
			if durationMS > 0 {
				metadata.durationMS = &durationMS
			}
		}
		if properties.SampleRate > 0 {
			sampleRate := int(properties.SampleRate)
			metadata.sampleRate = &sampleRate
		}
		if properties.Bitrate > 0 {
			bitrate := int(properties.Bitrate)
			metadata.bitrate = &bitrate
		}

		metadata.tags["taglib_properties"] = map[string]any{
			"length_ms":      properties.Length.Milliseconds(),
			"sample_rate_hz": properties.SampleRate,
			"bitrate_kbps":   properties.Bitrate,
			"channels":       properties.Channels,
			"image_count":    len(properties.Images),
		}
	}

	metadata.tags["relative_path"] = relativePath
	metadata.tags["extension"] = strings.ToLower(filepath.Ext(fullPath))

	if metadata.codec == "" {
		metadata.codec = codecFromPath(fullPath)
	}

	return metadata, nil
}

func deriveFallbackMetadata(rootPath string, fullPath string) (extractedMetadata, string) {
	relativePath := filepath.Base(fullPath)
	if rel, err := filepath.Rel(rootPath, fullPath); err == nil {
		relativePath = rel
	}

	relativePath = filepath.ToSlash(relativePath)
	parts := strings.Split(relativePath, "/")
	fileName := parts[len(parts)-1]
	baseName := strings.TrimSuffix(fileName, filepath.Ext(fileName))

	trackNo, title := parseTrackNumber(baseName)
	if title == "" {
		title = baseName
	}

	artist := "Unknown Artist"
	album := "Unknown Album"
	if len(parts) >= 2 && strings.TrimSpace(parts[0]) != "" {
		artist = strings.TrimSpace(parts[0])
	}
	if len(parts) >= 3 && strings.TrimSpace(parts[1]) != "" {
		album = strings.TrimSpace(parts[1])
	}

	return extractedMetadata{
		title:       strings.TrimSpace(title),
		artist:      strings.TrimSpace(artist),
		albumArtist: strings.TrimSpace(artist),
		album:       strings.TrimSpace(album),
		trackNo:     trackNo,
		codec:       codecFromPath(fullPath),
		tags: map[string]any{
			"source":           "filename_fallback",
			"metadata_version": metadataVersion,
			"relative_path":    relativePath,
			"extension":        strings.ToLower(filepath.Ext(fullPath)),
		},
	}, relativePath
}

func applyTagValues(metadata *extractedMetadata, tags map[string][]string) {
	if value := firstTagValue(tags, taglib.Title, "TITLE"); value != "" {
		metadata.title = value
	}
	if value := firstTagValue(tags, taglib.Artist, "ARTIST"); value != "" {
		metadata.artist = value
	}
	if value := firstTagValue(tags, taglib.AlbumArtist, "ALBUMARTIST"); value != "" {
		metadata.albumArtist = value
	}
	if value := firstTagValue(tags, taglib.Album, "ALBUM"); value != "" {
		metadata.album = value
	}
	if value := firstTagValue(tags, taglib.Genre, "GENRE"); value != "" {
		metadata.genre = value
	}

	if trackNo := parseNumericTag(firstTagValue(tags, taglib.TrackNumber, "TRACKNUMBER", "TRCK")); trackNo != nil {
		metadata.trackNo = trackNo
	}
	if discNo := parseNumericTag(firstTagValue(tags, taglib.DiscNumber, "DISCNUMBER", "TPOS")); discNo != nil {
		metadata.discNo = discNo
	}
	if year := parseYearTag(firstTagValue(tags, taglib.Date, "DATE", "YEAR", "ORIGINALDATE", "RELEASEDATE")); year != nil {
		metadata.year = year
	}
	if bitDepth := parseNumericTag(firstTagValue(tags, "BITS_PER_SAMPLE", "BITDEPTH", "BIT_DEPTH")); bitDepth != nil {
		metadata.bitDepth = bitDepth
	}
	if codec := firstTagValue(tags, taglib.FileType, "FILETYPE"); codec != "" {
		metadata.codec = normalizeCodec(codec)
	}

	if metadata.albumArtist == "" {
		metadata.albumArtist = metadata.artist
	}
}

func parseTrackNumber(baseName string) (*int, string) {
	match := trackPrefixPattern.FindStringSubmatch(baseName)
	if len(match) != 3 {
		trimmed := strings.TrimSpace(baseName)
		return nil, trimmed
	}

	number := 0
	for _, ch := range match[1] {
		number = (number * 10) + int(ch-'0')
	}
	if number <= 0 {
		trimmed := strings.TrimSpace(baseName)
		return nil, trimmed
	}

	trimmedTitle := strings.TrimSpace(match[2])
	return &number, trimmedTitle
}

func firstTagValue(tags map[string][]string, keys ...string) string {
	for _, key := range keys {
		values, ok := tags[key]
		if !ok {
			continue
		}
		for _, value := range values {
			trimmed := strings.TrimSpace(value)
			if trimmed != "" {
				return trimmed
			}
		}
	}

	return ""
}

func parseNumericTag(value string) *int {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil
	}

	match := leadingIntegerPattern.FindString(trimmed)
	if match == "" {
		return nil
	}

	parsed, err := strconv.Atoi(match)
	if err != nil || parsed <= 0 {
		return nil
	}

	return &parsed
}

func parseYearTag(value string) *int {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil
	}

	match := yearPattern.FindString(trimmed)
	if match == "" {
		if fallback := parseNumericTag(trimmed); fallback != nil {
			if *fallback >= 1000 && *fallback <= 3000 {
				return fallback
			}
		}
		return nil
	}

	parsed, err := strconv.Atoi(match)
	if err != nil {
		return nil
	}

	return &parsed
}

func codecFromPath(path string) string {
	extension := strings.TrimPrefix(strings.ToLower(filepath.Ext(path)), ".")
	if extension == "" {
		return ""
	}

	return extension
}

func normalizeCodec(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return ""
	}

	return strings.ToLower(trimmed)
}

func nullableInt(value *int) any {
	if value == nil {
		return nil
	}

	return *value
}

func nullableString(value string) any {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil
	}

	return trimmed
}

func (s *Service) emitProgress(progress Progress) {
	s.mu.Lock()
	emitter := s.emit
	s.mu.Unlock()

	if emitter != nil {
		emitter(EventProgress, progress)
	}
}
