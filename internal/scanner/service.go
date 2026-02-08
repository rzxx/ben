package scanner

import (
	"ben/internal/library"
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
	"go.senan.xyz/taglib"
	_ "image/jpeg"
	_ "image/png"
)

const EventProgress = "scanner:progress"

const metadataVersion = 2

const watcherDebounceDelay = 1200 * time.Millisecond

type scanMode string

const (
	scanModeFull        scanMode = "full"
	scanModeIncremental scanMode = "incremental"
)

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
	LastMode      string `json:"lastMode,omitempty"`
	LastError     string `json:"lastError,omitempty"`
	LastFilesSeen int    `json:"lastFilesSeen"`
	LastIndexed   int    `json:"lastIndexed"`
	LastSkipped   int    `json:"lastSkipped"`
}

type Emitter func(eventName string, payload any)

type Service struct {
	mu            sync.Mutex
	running       bool
	pendingScan   bool
	lastRun       time.Time
	lastMode      string
	lastError     string
	lastFilesSeen int
	lastIndexed   int
	lastSkipped   int
	emit          Emitter
	db            *sql.DB
	roots         *library.WatchedRootRepository
	coverCacheDir string
	watcher       *fsnotify.Watcher
	watching      bool
	watchStop     chan struct{}
	rootsChanged  chan struct{}
	watchDebounce *time.Timer
	watchedDirs   map[string]struct{}
}

type scanTotals struct {
	filesSeen int
	indexed   int
	skipped   int
}

func NewService(database *sql.DB, roots *library.WatchedRootRepository, coverCacheDir string) *Service {
	return &Service{
		db:            database,
		roots:         roots,
		coverCacheDir: coverCacheDir,
		rootsChanged:  make(chan struct{}, 1),
		watchedDirs:   make(map[string]struct{}),
	}
}

func (s *Service) SetEmitter(emitter Emitter) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.emit = emitter
}

func (s *Service) StartWatching() error {
	s.mu.Lock()
	if s.watching {
		s.mu.Unlock()
		return nil
	}
	s.mu.Unlock()

	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		return fmt.Errorf("create fs watcher: %w", err)
	}

	stopCh := make(chan struct{})

	s.mu.Lock()
	if s.watching {
		s.mu.Unlock()
		watcher.Close()
		return nil
	}
	s.watcher = watcher
	s.watching = true
	s.watchStop = stopCh
	s.watchedDirs = make(map[string]struct{})
	s.mu.Unlock()

	go s.watchLoop(watcher, stopCh)
	s.NotifyWatchedRootsChanged()

	return nil
}

func (s *Service) StopWatching() error {
	s.mu.Lock()
	if !s.watching {
		s.mu.Unlock()
		return nil
	}

	watcher := s.watcher
	stopCh := s.watchStop
	debounce := s.watchDebounce

	s.watcher = nil
	s.watching = false
	s.watchStop = nil
	s.watchDebounce = nil
	s.watchedDirs = make(map[string]struct{})
	s.mu.Unlock()

	if debounce != nil {
		debounce.Stop()
	}
	if stopCh != nil {
		close(stopCh)
	}
	if watcher != nil {
		if err := watcher.Close(); err != nil {
			return fmt.Errorf("close fs watcher: %w", err)
		}
	}

	return nil
}

func (s *Service) NotifyWatchedRootsChanged() {
	s.mu.Lock()
	watching := s.watching
	ch := s.rootsChanged
	s.mu.Unlock()

	if !watching || ch == nil {
		return
	}

	select {
	case ch <- struct{}{}:
	default:
	}
}

func (s *Service) watchLoop(watcher *fsnotify.Watcher, stopCh <-chan struct{}) {
	for {
		select {
		case <-stopCh:
			return
		case <-s.rootsChanged:
			if err := s.refreshWatcherRoots(watcher); err != nil {
				s.emitProgress(Progress{
					Phase:   "watcher",
					Message: fmt.Sprintf("watcher refresh failed: %v", err),
					Percent: 0,
					Status:  "failed",
					At:      time.Now().UTC().Format(time.RFC3339),
				})
			}
		case event, ok := <-watcher.Events:
			if !ok {
				return
			}

			if s.handleWatcherEvent(watcher, event) {
				s.scheduleWatcherIncrementalScan()
			}
		case err, ok := <-watcher.Errors:
			if !ok {
				return
			}
			s.emitProgress(Progress{
				Phase:   "watcher",
				Message: fmt.Sprintf("watcher error: %v", err),
				Percent: 0,
				Status:  "failed",
				At:      time.Now().UTC().Format(time.RFC3339),
			})
		}
	}
}

func (s *Service) refreshWatcherRoots(watcher *fsnotify.Watcher) error {
	roots, err := s.roots.List(context.Background())
	if err != nil {
		return fmt.Errorf("list watched roots for watcher: %w", err)
	}

	desired := make(map[string]struct{})
	for _, root := range roots {
		if !root.Enabled {
			continue
		}

		rootPath := filepath.Clean(root.Path)
		dirs, collectErr := collectWatchDirs(rootPath)
		if collectErr != nil {
			continue
		}
		for _, dir := range dirs {
			desired[dir] = struct{}{}
		}
	}

	s.mu.Lock()
	if !s.watching || s.watcher != watcher {
		s.mu.Unlock()
		return nil
	}
	current := copyStringSet(s.watchedDirs)
	s.mu.Unlock()

	for dir := range current {
		if _, ok := desired[dir]; ok {
			continue
		}
		_ = watcher.Remove(dir)
	}

	for dir := range desired {
		if _, ok := current[dir]; ok {
			continue
		}
		if err := watcher.Add(dir); err != nil {
			return fmt.Errorf("watch directory %s: %w", dir, err)
		}
	}

	s.mu.Lock()
	if s.watching && s.watcher == watcher {
		s.watchedDirs = desired
	}
	s.mu.Unlock()

	return nil
}

func collectWatchDirs(rootPath string) ([]string, error) {
	info, err := os.Stat(rootPath)
	if err != nil {
		return nil, err
	}
	if !info.IsDir() {
		return nil, fmt.Errorf("watch root %s is not a directory", rootPath)
	}

	dirs := make([]string, 0, 64)
	walkErr := filepath.WalkDir(rootPath, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return nil
		}
		if !entry.IsDir() {
			return nil
		}

		dirs = append(dirs, filepath.Clean(path))
		return nil
	})
	if walkErr != nil {
		return nil, walkErr
	}

	return dirs, nil
}

func copyStringSet(input map[string]struct{}) map[string]struct{} {
	output := make(map[string]struct{}, len(input))
	for value := range input {
		output[value] = struct{}{}
	}

	return output
}

func (s *Service) handleWatcherEvent(watcher *fsnotify.Watcher, event fsnotify.Event) bool {
	if event.Op&fsnotify.Create != 0 {
		if info, err := os.Stat(event.Name); err == nil && info.IsDir() {
			if err := s.addWatchDirTree(watcher, filepath.Clean(event.Name)); err != nil {
				s.emitProgress(Progress{
					Phase:   "watcher",
					Message: fmt.Sprintf("watch new directory failed: %v", err),
					Percent: 0,
					Status:  "failed",
					At:      time.Now().UTC().Format(time.RFC3339),
				})
			}
		}
	}

	return shouldTriggerIncremental(event.Name, event.Op)
}

func (s *Service) addWatchDirTree(watcher *fsnotify.Watcher, rootPath string) error {
	dirs, err := collectWatchDirs(rootPath)
	if err != nil {
		return err
	}

	for _, dir := range dirs {
		if err := s.addWatchDir(watcher, dir); err != nil {
			return err
		}
	}

	return nil
}

func (s *Service) addWatchDir(watcher *fsnotify.Watcher, dir string) error {
	cleanDir := filepath.Clean(dir)

	s.mu.Lock()
	if !s.watching || s.watcher != watcher {
		s.mu.Unlock()
		return nil
	}
	_, exists := s.watchedDirs[cleanDir]
	s.mu.Unlock()

	if exists {
		return nil
	}

	if err := watcher.Add(cleanDir); err != nil {
		return fmt.Errorf("watch directory %s: %w", cleanDir, err)
	}

	s.mu.Lock()
	if s.watching && s.watcher == watcher {
		s.watchedDirs[cleanDir] = struct{}{}
	}
	s.mu.Unlock()

	return nil
}

func shouldTriggerIncremental(path string, op fsnotify.Op) bool {
	if op&(fsnotify.Remove|fsnotify.Rename) != 0 {
		return true
	}

	if op&(fsnotify.Create|fsnotify.Write) == 0 {
		return false
	}

	info, err := os.Stat(path)
	if err == nil && info.IsDir() {
		return true
	}

	extension := strings.ToLower(filepath.Ext(path))
	_, supported := supportedExtensions[extension]
	return supported
}

func (s *Service) scheduleWatcherIncrementalScan() {
	s.mu.Lock()
	if !s.watching {
		s.mu.Unlock()
		return
	}

	if s.watchDebounce != nil {
		s.watchDebounce.Reset(watcherDebounceDelay)
		s.mu.Unlock()
		return
	}

	s.watchDebounce = time.AfterFunc(watcherDebounceDelay, func() {
		s.queueIncrementalScan()
	})
	s.mu.Unlock()
}

func (s *Service) queueIncrementalScan() {
	s.mu.Lock()
	s.watchDebounce = nil
	if s.running {
		s.pendingScan = true
		s.mu.Unlock()
		return
	}

	s.startScanLocked(scanModeIncremental)
	s.mu.Unlock()
}

func (s *Service) TriggerFullScan() error {
	return s.triggerScan(scanModeFull)
}

func (s *Service) TriggerIncrementalScan() error {
	return s.triggerScan(scanModeIncremental)
}

func (s *Service) triggerScan(mode scanMode) error {
	s.mu.Lock()
	if s.running {
		s.mu.Unlock()
		return errors.New("scan already in progress")
	}
	s.startScanLocked(mode)
	s.mu.Unlock()

	return nil
}

func (s *Service) startScanLocked(mode scanMode) {
	s.running = true
	s.lastError = ""
	go s.runScan(mode)
}

func (s *Service) GetStatus() Status {
	s.mu.Lock()
	defer s.mu.Unlock()

	status := Status{
		Running:       s.running,
		LastMode:      s.lastMode,
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

func (s *Service) runScan(mode scanMode) {
	ctx := context.Background()
	totals, err := s.performScan(ctx, mode)

	s.mu.Lock()
	s.running = false
	shouldRunPending := s.pendingScan
	s.pendingScan = false
	if err != nil {
		s.lastError = err.Error()
	} else {
		s.lastError = ""
		s.lastRun = time.Now().UTC()
		s.lastMode = string(mode)
		s.lastFilesSeen = totals.filesSeen
		s.lastIndexed = totals.indexed
		s.lastSkipped = totals.skipped
	}
	if shouldRunPending {
		s.startScanLocked(scanModeIncremental)
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
		Phase: string(mode),
		Message: fmt.Sprintf(
			"%s scan complete: %d files seen, %d indexed, %d skipped",
			scanModeLabel(mode),
			totals.filesSeen,
			totals.indexed,
			totals.skipped,
		),
		Percent: 100,
		Status:  "completed",
		At:      time.Now().UTC().Format(time.RFC3339),
	})
}

func scanModeLabel(mode scanMode) string {
	if mode == scanModeIncremental {
		return "Incremental"
	}

	return "Full"
}

func (s *Service) performScan(ctx context.Context, mode scanMode) (scanTotals, error) {
	startMessage := "Starting full scan"
	if mode == scanModeIncremental {
		startMessage = "Starting incremental scan"
	}

	s.emitProgress(Progress{
		Phase:   "start",
		Message: startMessage,
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

	if mode == scanModeFull {
		if err := markRootsAsMissing(ctx, tx, enabledRoots); err != nil {
			return scanTotals{}, err
		}
	} else {
		if err := prepareIncrementalSeenTable(ctx, tx); err != nil {
			return scanTotals{}, err
		}
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

		rootTotals, scanErr := scanRoot(ctx, tx, root, mode, s.coverCacheDir)
		totals.filesSeen += rootTotals.filesSeen
		totals.indexed += rootTotals.indexed
		totals.skipped += rootTotals.skipped
		if scanErr != nil {
			return scanTotals{}, scanErr
		}

		if mode == scanModeIncremental {
			if err := reconcileMissingFilesIncremental(ctx, tx, root.ID); err != nil {
				return scanTotals{}, err
			}

			if err := cleanupMissingTracks(ctx, tx, []library.WatchedRoot{root}); err != nil {
				return scanTotals{}, err
			}
		}
	}

	s.emitProgress(Progress{
		Phase:   "cleanup",
		Message: "Removing stale track entries",
		Percent: 90,
		Status:  "running",
		At:      time.Now().UTC().Format(time.RFC3339),
	})

	if mode == scanModeFull {
		if err := cleanupMissingTracks(ctx, tx, enabledRoots); err != nil {
			return scanTotals{}, err
		}
	}

	if err := cleanupMissingCovers(ctx, tx); err != nil {
		return scanTotals{}, err
	}

	s.emitProgress(Progress{
		Phase:   "derive",
		Message: "Refreshing artists, albums, and album track mappings",
		Percent: 96,
		Status:  "running",
		At:      time.Now().UTC().Format(time.RFC3339),
	})

	if err := rebuildDerivedLibrary(ctx, tx); err != nil {
		return scanTotals{}, err
	}

	if err := tx.Commit(); err != nil {
		return scanTotals{}, fmt.Errorf("commit scan tx: %w", err)
	}
	tx = nil

	if cleanupErr := cleanupOrphanedCoverFiles(ctx, s.db, s.coverCacheDir); cleanupErr != nil {
		s.emitProgress(Progress{
			Phase:   "cleanup",
			Message: fmt.Sprintf("cover cache cleanup warning: %v", cleanupErr),
			Percent: 97,
			Status:  "running",
			At:      time.Now().UTC().Format(time.RFC3339),
		})
	}

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

func prepareIncrementalSeenTable(ctx context.Context, tx *sql.Tx) error {
	if _, err := tx.ExecContext(
		ctx,
		"CREATE TEMP TABLE IF NOT EXISTS scan_seen_paths(path TEXT PRIMARY KEY)",
	); err != nil {
		return fmt.Errorf("create incremental seen table: %w", err)
	}

	return nil
}

func clearIncrementalSeenTable(ctx context.Context, tx *sql.Tx) error {
	if _, err := tx.ExecContext(ctx, "DELETE FROM scan_seen_paths"); err != nil {
		return fmt.Errorf("clear incremental seen table: %w", err)
	}

	return nil
}

func markPathSeenIncremental(ctx context.Context, tx *sql.Tx, path string) error {
	if _, err := tx.ExecContext(
		ctx,
		"INSERT OR REPLACE INTO scan_seen_paths(path) VALUES (?)",
		path,
	); err != nil {
		return fmt.Errorf("mark incremental path seen %s: %w", path, err)
	}

	return nil
}

func reconcileMissingFilesIncremental(ctx context.Context, tx *sql.Tx, rootID int64) error {
	if _, err := tx.ExecContext(
		ctx,
		`UPDATE files
		 SET file_exists = 0
		 WHERE root_id = ?
		   AND file_exists = 1
		   AND path NOT IN (SELECT path FROM scan_seen_paths)`,
		rootID,
	); err != nil {
		return fmt.Errorf("reconcile missing files for root %d: %w", rootID, err)
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

func cleanupMissingCovers(ctx context.Context, tx *sql.Tx) error {
	if _, err := tx.ExecContext(
		ctx,
		`DELETE FROM covers
		 WHERE source_file_id IS NULL
		    OR source_file_id IN (SELECT id FROM files WHERE file_exists = 0)
		    OR source_file_id NOT IN (SELECT id FROM files)`,
	); err != nil {
		return fmt.Errorf("cleanup missing covers: %w", err)
	}

	return nil
}

func cleanupOrphanedCoverFiles(ctx context.Context, database *sql.DB, coverCacheDir string) error {
	if database == nil {
		return nil
	}

	trimmedDir := strings.TrimSpace(coverCacheDir)
	if trimmedDir == "" {
		return nil
	}

	cacheDir, err := filepath.Abs(filepath.Clean(trimmedDir))
	if err != nil {
		return fmt.Errorf("resolve cover cache dir: %w", err)
	}

	dirEntries, err := os.ReadDir(cacheDir)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return fmt.Errorf("read cover cache dir: %w", err)
	}

	rows, err := database.QueryContext(
		ctx,
		"SELECT cache_path FROM covers WHERE cache_path IS NOT NULL AND TRIM(cache_path) <> ''",
	)
	if err != nil {
		return fmt.Errorf("query referenced covers: %w", err)
	}
	defer rows.Close()

	referenced := make(map[string]struct{})
	for rows.Next() {
		var cachePath sql.NullString
		if scanErr := rows.Scan(&cachePath); scanErr != nil {
			return fmt.Errorf("scan referenced cover path: %w", scanErr)
		}

		if !cachePath.Valid {
			continue
		}

		resolvedPath, resolveErr := filepath.Abs(filepath.Clean(strings.TrimSpace(cachePath.String)))
		if resolveErr != nil {
			continue
		}

		referenced[resolvedPath] = struct{}{}
	}

	if rowsErr := rows.Err(); rowsErr != nil {
		return fmt.Errorf("iterate referenced cover paths: %w", rowsErr)
	}

	for _, entry := range dirEntries {
		if entry.IsDir() {
			continue
		}

		candidatePath := filepath.Join(cacheDir, entry.Name())
		resolvedCandidate, resolveErr := filepath.Abs(filepath.Clean(candidatePath))
		if resolveErr != nil {
			continue
		}

		if _, keep := referenced[resolvedCandidate]; keep {
			continue
		}

		if removeErr := os.Remove(resolvedCandidate); removeErr != nil && !errors.Is(removeErr, os.ErrNotExist) {
			return fmt.Errorf("remove orphaned cover %s: %w", resolvedCandidate, removeErr)
		}
	}

	return nil
}

func rebuildDerivedLibrary(ctx context.Context, tx *sql.Tx) error {
	if _, err := tx.ExecContext(ctx, "DELETE FROM album_tracks"); err != nil {
		return fmt.Errorf("clear album_tracks: %w", err)
	}

	if _, err := tx.ExecContext(ctx, "DELETE FROM albums"); err != nil {
		return fmt.Errorf("clear albums: %w", err)
	}

	if _, err := tx.ExecContext(ctx, "DELETE FROM artists"); err != nil {
		return fmt.Errorf("clear artists: %w", err)
	}

	if _, err := tx.ExecContext(ctx, `
		INSERT INTO artists(name, sort_name)
		SELECT artist_name, LOWER(artist_name)
		FROM (
			SELECT DISTINCT COALESCE(NULLIF(TRIM(t.artist), ''), 'Unknown Artist') AS artist_name
			FROM tracks t
			JOIN files f ON f.id = t.file_id
			WHERE f.file_exists = 1
		) artist_rows
		ORDER BY LOWER(artist_name)
	`); err != nil {
		return fmt.Errorf("rebuild artists: %w", err)
	}

	if _, err := tx.ExecContext(ctx, `
		WITH track_rows AS (
			SELECT
				t.id AS track_id,
				t.file_id AS file_id,
				COALESCE(NULLIF(TRIM(t.album), ''), 'Unknown Album') AS album_title,
				COALESCE(NULLIF(TRIM(t.album_artist), ''), COALESCE(NULLIF(TRIM(t.artist), ''), 'Unknown Artist')) AS album_artist_name,
				t.year AS year,
				t.disc_no AS disc_no,
				t.track_no AS track_no
			FROM tracks t
			JOIN files f ON f.id = t.file_id
			WHERE f.file_exists = 1
		)
		INSERT INTO albums(title, album_artist, year, cover_id, sort_key)
		SELECT
			tr.album_title,
			tr.album_artist_name,
			MIN(NULLIF(tr.year, 0)) AS first_year,
			(
				SELECT c.id
				FROM track_rows tr2
				JOIN covers c ON c.source_file_id = tr2.file_id
				WHERE tr2.album_title = tr.album_title
				  AND tr2.album_artist_name = tr.album_artist_name
				ORDER BY COALESCE(tr2.disc_no, 0), COALESCE(tr2.track_no, 0), tr2.track_id
				LIMIT 1
			) AS cover_id,
			LOWER(tr.album_artist_name || ' ' || tr.album_title) AS sort_key
		FROM track_rows tr
		GROUP BY tr.album_title, tr.album_artist_name
		ORDER BY LOWER(tr.album_artist_name), LOWER(tr.album_title)
	`); err != nil {
		return fmt.Errorf("rebuild albums: %w", err)
	}

	if _, err := tx.ExecContext(ctx, `
		WITH track_rows AS (
			SELECT
				t.id AS track_id,
				COALESCE(NULLIF(TRIM(t.album), ''), 'Unknown Album') AS album_title,
				COALESCE(NULLIF(TRIM(t.album_artist), ''), COALESCE(NULLIF(TRIM(t.artist), ''), 'Unknown Artist')) AS album_artist_name,
				t.disc_no AS disc_no,
				t.track_no AS track_no
			FROM tracks t
			JOIN files f ON f.id = t.file_id
			WHERE f.file_exists = 1
		)
		INSERT INTO album_tracks(album_id, track_id, disc_no, track_no)
		SELECT
			a.id,
			tr.track_id,
			tr.disc_no,
			tr.track_no
		FROM track_rows tr
		JOIN albums a
		  ON a.title = tr.album_title
		 AND a.album_artist = tr.album_artist_name
		ORDER BY a.id, COALESCE(tr.disc_no, 0), COALESCE(tr.track_no, 0), tr.track_id
	`); err != nil {
		return fmt.Errorf("rebuild album_tracks: %w", err)
	}

	return nil
}

func syncCoverForFile(ctx context.Context, tx *sql.Tx, fileID int64, fullPath string, coverCacheDir string, force bool) error {
	if strings.TrimSpace(coverCacheDir) == "" {
		return nil
	}

	var (
		existingID   int64
		existingHash sql.NullString
		existingPath sql.NullString
	)

	existingFound := true
	err := tx.QueryRowContext(
		ctx,
		"SELECT id, hash, cache_path FROM covers WHERE source_file_id = ?",
		fileID,
	).Scan(&existingID, &existingHash, &existingPath)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			existingFound = false
		} else {
			return fmt.Errorf("get cover row for file %d: %w", fileID, err)
		}
	}

	if existingFound && !force {
		return nil
	}

	properties, propertiesErr := taglib.ReadProperties(fullPath)
	if propertiesErr != nil || len(properties.Images) == 0 {
		if existingFound {
			if _, deleteErr := tx.ExecContext(ctx, "DELETE FROM covers WHERE id = ?", existingID); deleteErr != nil {
				return fmt.Errorf("delete cover row for file %d: %w", fileID, deleteErr)
			}
		}
		return nil
	}

	imageData, imageErr := taglib.ReadImage(fullPath)
	if imageErr != nil || len(imageData) == 0 {
		if existingFound {
			if _, deleteErr := tx.ExecContext(ctx, "DELETE FROM covers WHERE id = ?", existingID); deleteErr != nil {
				return fmt.Errorf("delete cover row for file %d: %w", fileID, deleteErr)
			}
		}
		return nil
	}

	hashBytes := sha256.Sum256(imageData)
	hash := hex.EncodeToString(hashBytes[:])

	format, width, height := decodeCoverImage(imageData)
	mimeType := strings.TrimSpace(properties.Images[0].MIMEType)
	if mimeType == "" {
		mimeType = mimeTypeFromImageFormat(format)
	}

	extension := extensionForCover(mimeType, format)
	if extension == "" {
		extension = ".img"
	}

	cachePath := filepath.Join(coverCacheDir, hash+extension)
	if existingFound && existingHash.Valid && existingHash.String == hash && strings.TrimSpace(existingPath.String) != "" {
		cachePath = strings.TrimSpace(existingPath.String)
	}

	if err := os.MkdirAll(coverCacheDir, 0o755); err != nil {
		return fmt.Errorf("create cover cache dir: %w", err)
	}

	if statErr := ensureCoverFile(cachePath, imageData); statErr != nil {
		return nil
	}

	if existingFound {
		if _, updateErr := tx.ExecContext(
			ctx,
			"UPDATE covers SET mime = ?, width = ?, height = ?, cache_path = ?, hash = ? WHERE id = ?",
			nullableString(mimeType),
			nullablePositiveInt(width),
			nullablePositiveInt(height),
			cachePath,
			hash,
			existingID,
		); updateErr != nil {
			return fmt.Errorf("update cover row for file %d: %w", fileID, updateErr)
		}

		return nil
	}

	if _, insertErr := tx.ExecContext(
		ctx,
		"INSERT INTO covers(source_file_id, mime, width, height, cache_path, hash) VALUES (?, ?, ?, ?, ?, ?)",
		fileID,
		nullableString(mimeType),
		nullablePositiveInt(width),
		nullablePositiveInt(height),
		cachePath,
		hash,
	); insertErr != nil {
		return fmt.Errorf("insert cover row for file %d: %w", fileID, insertErr)
	}

	return nil
}

func decodeCoverImage(imageData []byte) (string, int, int) {
	config, format, err := image.DecodeConfig(bytes.NewReader(imageData))
	if err != nil {
		return "", 0, 0
	}

	return strings.ToLower(strings.TrimSpace(format)), config.Width, config.Height
}

func ensureCoverFile(path string, contents []byte) error {
	if _, err := os.Stat(path); err == nil {
		return nil
	}

	if err := os.WriteFile(path, contents, 0o644); err != nil {
		return err
	}

	return nil
}

func mimeTypeFromImageFormat(format string) string {
	switch strings.ToLower(strings.TrimSpace(format)) {
	case "jpeg", "jpg":
		return "image/jpeg"
	case "png":
		return "image/png"
	default:
		return ""
	}
}

func extensionForCover(mimeType string, format string) string {
	normalizedMime := strings.ToLower(strings.TrimSpace(mimeType))
	switch normalizedMime {
	case "image/jpeg", "image/jpg":
		return ".jpg"
	case "image/png":
		return ".png"
	}

	switch strings.ToLower(strings.TrimSpace(format)) {
	case "jpeg", "jpg":
		return ".jpg"
	case "png":
		return ".png"
	default:
		return ""
	}
}

func nullablePositiveInt(value int) any {
	if value <= 0 {
		return nil
	}

	return value
}

func scanRoot(ctx context.Context, tx *sql.Tx, root library.WatchedRoot, mode scanMode, coverCacheDir string) (scanTotals, error) {
	rootTotals := scanTotals{}
	scannedAt := time.Now().UTC().Format(time.RFC3339)

	if mode == scanModeIncremental {
		if err := clearIncrementalSeenTable(ctx, tx); err != nil {
			return scanTotals{}, err
		}
	}

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
		indexed, upsertErr := upsertFileAndTrack(ctx, tx, root.ID, root.Path, path, info, scannedAt, mode, coverCacheDir)
		if upsertErr != nil {
			return upsertErr
		}

		if mode == scanModeIncremental {
			if seenErr := markPathSeenIncremental(ctx, tx, filepath.Clean(path)); seenErr != nil {
				return seenErr
			}
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
	mode scanMode,
	coverCacheDir string,
) (bool, error) {
	cleanPath := filepath.Clean(path)

	var (
		fileID        int64
		currentRoot   sql.NullInt64
		currentSize   int64
		currentMTime  int64
		currentExists int
	)

	err := tx.QueryRowContext(
		ctx,
		"SELECT id, root_id, size, mtime_ns, file_exists FROM files WHERE path = ?",
		cleanPath,
	).Scan(&fileID, &currentRoot, &currentSize, &currentMTime, &currentExists)
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
		metadataNeedsUpdate = currentSize != newSize || currentMTime != newMTime

		rootChanged := !currentRoot.Valid || currentRoot.Int64 != rootID
		fileNeedsRefresh := metadataNeedsUpdate || rootChanged || currentExists == 0 || mode == scanModeFull

		if fileNeedsRefresh {
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
		}
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
		if err := syncCoverForFile(ctx, tx, fileID, cleanPath, coverCacheDir, false); err != nil {
			return false, err
		}

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

	if err := syncCoverForFile(ctx, tx, fileID, cleanPath, coverCacheDir, true); err != nil {
		return false, err
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
