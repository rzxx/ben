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
	"strings"
	"sync"
	"time"
)

const EventProgress = "scanner:progress"

var trackPrefixPattern = regexp.MustCompile(`^\s*(\d{1,2})[\s._-]+(.+)$`)

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
		var hasTrack int
		if existsErr := tx.QueryRowContext(
			ctx,
			"SELECT COUNT(1) FROM tracks WHERE file_id = ?",
			fileID,
		).Scan(&hasTrack); existsErr != nil {
			return false, fmt.Errorf("check track for file %s: %w", cleanPath, existsErr)
		}
		metadataNeedsUpdate = hasTrack == 0
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
			file_id, title, artist, album_artist, album, disc_no, track_no, tags_json, updated_at
		)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(file_id) DO UPDATE SET
			title = excluded.title,
			artist = excluded.artist,
			album_artist = excluded.album_artist,
			album = excluded.album,
			disc_no = excluded.disc_no,
			track_no = excluded.track_no,
			tags_json = excluded.tags_json,
			updated_at = excluded.updated_at`,
		fileID,
		metadata.title,
		metadata.artist,
		metadata.albumArtist,
		metadata.album,
		metadata.discNo,
		metadata.trackNo,
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
	discNo      *int
	trackNo     *int
	tags        map[string]string
}

func deriveMetadata(rootPath string, fullPath string) (extractedMetadata, error) {
	relativePath, err := filepath.Rel(rootPath, fullPath)
	if err != nil {
		return extractedMetadata{}, fmt.Errorf("resolve relative path for %s: %w", fullPath, err)
	}

	parts := strings.Split(filepath.ToSlash(relativePath), "/")
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
		title:       title,
		artist:      artist,
		albumArtist: artist,
		album:       album,
		discNo:      nil,
		trackNo:     trackNo,
		tags: map[string]string{
			"source":        "filename_fallback",
			"relative_path": filepath.ToSlash(relativePath),
			"extension":     strings.ToLower(filepath.Ext(fullPath)),
		},
	}, nil
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

func (s *Service) emitProgress(progress Progress) {
	s.mu.Lock()
	emitter := s.emit
	s.mu.Unlock()

	if emitter != nil {
		emitter(EventProgress, progress)
	}
}
