package scanner

import (
	"ben/internal/coverart"
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
	"image/draw"
	"image/jpeg"
	"io/fs"
	"math"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
	"go.senan.xyz/taglib"
	_ "image/png"
)

const EventProgress = "scanner:progress"

const metadataVersion = 2

const watcherDebounceDelay = 1200 * time.Millisecond

type scanMode string

const (
	scanModeFull        scanMode = "full"
	scanModeRepair      scanMode = "repair"
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

var supportedArtworkExtensions = map[string]struct{}{
	".jpg":  {},
	".jpeg": {},
	".png":  {},
}

var multiDiscFolderPattern = regexp.MustCompile(`^(cd|disc|disk)[\s._-]*\d+$`)

func isSupportedAudioExtension(extension string) bool {
	_, ok := supportedExtensions[strings.ToLower(strings.TrimSpace(extension))]
	return ok
}

func isSupportedArtworkExtension(extension string) bool {
	_, ok := supportedArtworkExtensions[strings.ToLower(strings.TrimSpace(extension))]
	return ok
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
	currentMode   scanMode
	pendingMode   scanMode
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
	dirtyPaths    map[string]struct{}
}

type scanTotals struct {
	filesSeen      int
	indexed        int
	skipped        int
	libraryChanged bool
}

func NewService(database *sql.DB, roots *library.WatchedRootRepository, coverCacheDir string) *Service {
	return &Service{
		db:            database,
		roots:         roots,
		coverCacheDir: coverCacheDir,
		rootsChanged:  make(chan struct{}, 1),
		watchedDirs:   make(map[string]struct{}),
		dirtyPaths:    make(map[string]struct{}),
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
	s.dirtyPaths = make(map[string]struct{})
	s.mu.Unlock()

	go s.watchLoop(watcher, stopCh)
	s.NotifyWatchedRootsChanged()
	if err := s.markEnabledRootsDirty(context.Background()); err == nil {
		s.scheduleWatcherIncrementalScan()
	}

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
	s.dirtyPaths = make(map[string]struct{})
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
				s.queueRecoveryScan(scanModeFull, "watcher", "watch root refresh failed")
				continue
			}

			if err := s.markEnabledRootsDirty(context.Background()); err != nil {
				s.emitProgress(Progress{
					Phase:   "watcher",
					Message: fmt.Sprintf("watch root sync failed: %v", err),
					Percent: 0,
					Status:  "failed",
					At:      time.Now().UTC().Format(time.RFC3339),
				})
				s.queueRecoveryScan(scanModeFull, "watcher", "watch root sync failed")
			}

			s.scheduleWatcherIncrementalScan()
		case event, ok := <-watcher.Events:
			if !ok {
				return
			}

			if s.handleWatcherEvent(watcher, event) {
				s.markDirtyPath(event.Name)
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
			s.queueRecoveryScan(scanModeFull, "watcher", "watcher reported an internal error")
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

func (s *Service) markEnabledRootsDirty(ctx context.Context) error {
	roots, err := s.roots.List(ctx)
	if err != nil {
		return fmt.Errorf("list watched roots for dirty queue: %w", err)
	}

	for _, root := range roots {
		if !root.Enabled {
			continue
		}
		s.markDirtyPath(root.Path)
	}

	return nil
}

func (s *Service) markDirtyPath(path string) {
	cleanPath := filepath.Clean(strings.TrimSpace(path))
	if cleanPath == "" || cleanPath == "." {
		return
	}

	s.mu.Lock()
	s.dirtyPaths[cleanPath] = struct{}{}
	s.mu.Unlock()
}

func (s *Service) consumeDirtyPaths() []string {
	s.mu.Lock()
	if len(s.dirtyPaths) == 0 {
		s.mu.Unlock()
		return nil
	}

	paths := make([]string, 0, len(s.dirtyPaths))
	for path := range s.dirtyPaths {
		paths = append(paths, path)
	}
	s.dirtyPaths = make(map[string]struct{})
	s.mu.Unlock()

	return compactDirtyPaths(paths)
}

func compactDirtyPaths(paths []string) []string {
	if len(paths) == 0 {
		return nil
	}

	normalized := make([]string, 0, len(paths))
	seen := make(map[string]struct{}, len(paths))
	for _, rawPath := range paths {
		cleanPath := filepath.Clean(strings.TrimSpace(rawPath))
		if cleanPath == "" || cleanPath == "." {
			continue
		}

		key := pathCompareKey(cleanPath)
		if _, exists := seen[key]; exists {
			continue
		}
		seen[key] = struct{}{}
		normalized = append(normalized, cleanPath)
	}

	sort.Slice(normalized, func(i int, j int) bool {
		if len(normalized[i]) == len(normalized[j]) {
			return pathCompareKey(normalized[i]) < pathCompareKey(normalized[j])
		}
		return len(normalized[i]) < len(normalized[j])
	})

	compacted := make([]string, 0, len(normalized))
	for _, candidate := range normalized {
		covered := false
		for _, parent := range compacted {
			if isSameOrNestedPath(candidate, parent) {
				covered = true
				break
			}
		}
		if covered {
			continue
		}

		compacted = append(compacted, candidate)
	}

	return compacted
}

func pathCompareKey(path string) string {
	if runtime.GOOS == "windows" {
		return strings.ToLower(path)
	}

	return path
}

func isSameOrNestedPath(path string, parent string) bool {
	pathKey := pathCompareKey(filepath.Clean(path))
	parentKey := pathCompareKey(filepath.Clean(parent))
	if pathKey == parentKey {
		return true
	}

	prefix := parentKey + string(filepath.Separator)
	return strings.HasPrefix(pathKey, prefix)
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
				s.queueRecoveryScan(scanModeFull, "watcher", "watching new directory failed")
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
	if isSupportedAudioExtension(extension) {
		return true
	}

	return isSupportedArtworkExtension(extension)
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
	s.queueScanLocked(scanModeIncremental)
	s.mu.Unlock()
}

func (s *Service) queueRecoveryScan(mode scanMode, phase string, reason string) {
	trimmedReason := strings.TrimSpace(reason)
	if trimmedReason == "" {
		trimmedReason = "library verification requested"
	}

	queued := false

	s.mu.Lock()
	if s.shouldQueueRecoveryLocked(mode) {
		s.queueScanLocked(mode)
		queued = true
	}
	s.mu.Unlock()

	if !queued {
		return
	}

	s.emitProgress(Progress{
		Phase:   phase,
		Message: fmt.Sprintf("%s; scheduling %s scan", trimmedReason, strings.ToLower(scanModeLabel(mode))),
		Percent: 0,
		Status:  "running",
		At:      time.Now().UTC().Format(time.RFC3339),
	})
}

func (s *Service) shouldQueueRecoveryLocked(mode scanMode) bool {
	if mode == scanModeFull {
		if s.pendingMode == scanModeFull {
			return false
		}
		if s.running && (s.currentMode == scanModeFull || s.currentMode == scanModeRepair) {
			return false
		}
	}

	return true
}

func (s *Service) queueScanLocked(mode scanMode) {
	if s.running {
		s.pendingMode = pickPendingMode(s.pendingMode, mode)
		return
	}

	s.startScanLocked(mode)
}

func pickPendingMode(current scanMode, next scanMode) scanMode {
	if current == scanModeFull || next == scanModeFull {
		return scanModeFull
	}

	if current == scanModeIncremental {
		return current
	}

	return next
}

func (s *Service) TriggerFullScan() error {
	return s.triggerScan(scanModeFull)
}

func (s *Service) TriggerScan() error {
	return s.triggerScan(scanModeRepair)
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
	s.currentMode = mode
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
	s.currentMode = ""
	nextMode := s.pendingMode
	s.pendingMode = ""
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
	if nextMode != "" {
		s.startScanLocked(nextMode)
	}
	s.mu.Unlock()

	if err != nil {
		if mode == scanModeIncremental {
			s.queueRecoveryScan(scanModeFull, "repair", "incremental scan failed")
		}

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
	if mode == scanModeRepair {
		return "Repair"
	}

	return "Full"
}

func (s *Service) performScan(ctx context.Context, mode scanMode) (scanTotals, error) {
	startMessage := "Starting full scan"
	if mode == scanModeIncremental {
		startMessage = "Starting incremental scan"
	} else if mode == scanModeRepair {
		startMessage = "Starting repair scan"
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

	if isFullTraversalMode(mode) {
		if err := markRootsAsMissing(ctx, tx, enabledRoots); err != nil {
			return scanTotals{}, err
		}
	}

	if err := prepareIncrementalSeenTable(ctx, tx); err != nil {
		return scanTotals{}, err
	}

	totals := scanTotals{}
	if isFullTraversalMode(mode) {
		totals.libraryChanged = true
	}

	if mode == scanModeIncremental {
		dirtyPaths := s.consumeDirtyPaths()
		if len(dirtyPaths) > 0 {
			s.emitProgress(Progress{
				Phase:   "scan",
				Message: fmt.Sprintf("Applying %d filesystem change(s)", len(dirtyPaths)),
				Percent: 14,
				Status:  "running",
				At:      time.Now().UTC().Format(time.RFC3339),
			})

			incrementalTotals, scanErr := scanDirtyPathsIncremental(ctx, tx, enabledRoots, dirtyPaths, s.coverCacheDir)
			if scanErr != nil {
				return scanTotals{}, scanErr
			}

			totals = incrementalTotals
		} else {
			s.emitProgress(Progress{
				Phase:   "scan",
				Message: "No queued filesystem events, running full incremental verification",
				Percent: 12,
				Status:  "running",
				At:      time.Now().UTC().Format(time.RFC3339),
			})

			for i, root := range enabledRoots {
				progress := 14 + ((i * 66) / len(enabledRoots))
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
				totals.libraryChanged = totals.libraryChanged || rootTotals.libraryChanged
				if scanErr != nil {
					return scanTotals{}, scanErr
				}

				filesReconciled, err := reconcileMissingFilesIncremental(ctx, tx, root.ID)
				if err != nil {
					return scanTotals{}, err
				}
				totals.libraryChanged = totals.libraryChanged || filesReconciled

				tracksCleaned, err := cleanupMissingTracks(ctx, tx, []library.WatchedRoot{root})
				if err != nil {
					return scanTotals{}, err
				}
				totals.libraryChanged = totals.libraryChanged || tracksCleaned
			}
		}
	} else {
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
			totals.libraryChanged = totals.libraryChanged || rootTotals.libraryChanged
			if scanErr != nil {
				return scanTotals{}, scanErr
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

	if isFullTraversalMode(mode) {
		tracksCleaned, err := cleanupMissingTracks(ctx, tx, enabledRoots)
		if err != nil {
			return scanTotals{}, err
		}
		totals.libraryChanged = totals.libraryChanged || tracksCleaned
	}

	coversCleaned, err := cleanupMissingCovers(ctx, tx)
	if err != nil {
		return scanTotals{}, err
	}
	totals.libraryChanged = totals.libraryChanged || coversCleaned

	if totals.libraryChanged || isFullTraversalMode(mode) {
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
	} else {
		s.emitProgress(Progress{
			Phase:   "derive",
			Message: "No library changes detected, skipping derived catalog refresh",
			Percent: 96,
			Status:  "running",
			At:      time.Now().UTC().Format(time.RFC3339),
		})
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

func isFullTraversalMode(mode scanMode) bool {
	return mode == scanModeFull || mode == scanModeRepair
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

func reconcileMissingFilesIncremental(ctx context.Context, tx *sql.Tx, rootID int64) (bool, error) {
	result, err := tx.ExecContext(
		ctx,
		`UPDATE files
		 SET file_exists = 0
		 WHERE root_id = ?
		   AND file_exists = 1
		   AND path NOT IN (SELECT path FROM scan_seen_paths)`,
		rootID,
	)
	if err != nil {
		return false, fmt.Errorf("reconcile missing files for root %d: %w", rootID, err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return false, fmt.Errorf("read reconciled missing file count for root %d: %w", rootID, err)
	}

	return rowsAffected > 0, nil
}

func reconcileMissingFilesIncrementalByPrefix(ctx context.Context, tx *sql.Tx, rootID int64, prefix string) (bool, error) {
	cleanPrefix := filepath.Clean(prefix)
	pattern := likePrefixPattern(cleanPrefix)

	result, err := tx.ExecContext(
		ctx,
		`UPDATE files
		 SET file_exists = 0
		 WHERE root_id = ?
		   AND file_exists = 1
		   AND (path = ? OR path LIKE ? ESCAPE '\\')
		   AND path NOT IN (SELECT path FROM scan_seen_paths)`,
		rootID,
		cleanPrefix,
		pattern,
	)
	if err != nil {
		return false, fmt.Errorf("reconcile missing files for root %d prefix %s: %w", rootID, cleanPrefix, err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return false, fmt.Errorf("read reconciled missing file count for root %d prefix %s: %w", rootID, cleanPrefix, err)
	}

	return rowsAffected > 0, nil
}

func markPathMissingIncremental(ctx context.Context, tx *sql.Tx, rootID int64, path string) (bool, error) {
	cleanPath := filepath.Clean(path)
	pattern := likePrefixPattern(cleanPath)

	result, err := tx.ExecContext(
		ctx,
		`UPDATE files
		 SET file_exists = 0
		 WHERE root_id = ?
		   AND file_exists = 1
		   AND (path = ? OR path LIKE ? ESCAPE '\\')`,
		rootID,
		cleanPath,
		pattern,
	)
	if err != nil {
		return false, fmt.Errorf("mark path missing for root %d path %s: %w", rootID, cleanPath, err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return false, fmt.Errorf("read missing file update count for root %d path %s: %w", rootID, cleanPath, err)
	}

	return rowsAffected > 0, nil
}

func likePrefixPattern(path string) string {
	escaped := escapeLikePattern(filepath.Clean(path))
	separator := escapeLikePattern(string(filepath.Separator))
	return escaped + separator + "%"
}

func escapeLikePattern(input string) string {
	replacer := strings.NewReplacer(
		`\`, `\\`,
		`%`, `\%`,
		`_`, `\_`,
	)

	return replacer.Replace(input)
}

func findOwningRoot(path string, roots []library.WatchedRoot) (library.WatchedRoot, bool) {
	for _, root := range roots {
		if isSameOrNestedPath(path, root.Path) {
			return root, true
		}
	}

	return library.WatchedRoot{}, false
}

func sortRootsByDepth(roots []library.WatchedRoot) []library.WatchedRoot {
	sortedRoots := make([]library.WatchedRoot, len(roots))
	copy(sortedRoots, roots)

	sort.Slice(sortedRoots, func(i int, j int) bool {
		leftPath := filepath.Clean(sortedRoots[i].Path)
		rightPath := filepath.Clean(sortedRoots[j].Path)
		if len(leftPath) == len(rightPath) {
			return pathCompareKey(leftPath) < pathCompareKey(rightPath)
		}
		return len(leftPath) > len(rightPath)
	})

	return sortedRoots
}

func scanDirtyPathsIncremental(
	ctx context.Context,
	tx *sql.Tx,
	enabledRoots []library.WatchedRoot,
	dirtyPaths []string,
	coverCacheDir string,
) (scanTotals, error) {
	rootListByDepth := sortRootsByDepth(enabledRoots)
	affectedRootIDs := make(map[int64]struct{})
	coverRefreshTargets := make(map[string]coverRefreshTarget)
	totals := scanTotals{}
	scannedAt := time.Now().UTC().Format(time.RFC3339)

	markCoverRefresh := func(root library.WatchedRoot, directoryPath string) {
		cleanDirectory := filepath.Clean(strings.TrimSpace(directoryPath))
		if cleanDirectory == "" || cleanDirectory == "." {
			return
		}

		key := strconv.FormatInt(root.ID, 10) + "|" + pathCompareKey(cleanDirectory)
		coverRefreshTargets[key] = coverRefreshTarget{rootID: root.ID, directoryPath: cleanDirectory}
	}

	for _, dirtyPath := range dirtyPaths {
		cleanPath := filepath.Clean(dirtyPath)
		root, hasRoot := findOwningRoot(cleanPath, rootListByDepth)
		if !hasRoot {
			continue
		}

		info, statErr := os.Stat(cleanPath)
		if statErr == nil {
			if info.IsDir() {
				dirTotals, err := scanIncrementalDirectory(ctx, tx, root, cleanPath, coverCacheDir)
				if err != nil {
					return scanTotals{}, err
				}
				totals.filesSeen += dirTotals.filesSeen
				totals.indexed += dirTotals.indexed
				totals.skipped += dirTotals.skipped
				totals.libraryChanged = totals.libraryChanged || dirTotals.libraryChanged
				if dirTotals.libraryChanged {
					affectedRootIDs[root.ID] = struct{}{}
				}
				continue
			}

			extension := strings.ToLower(filepath.Ext(cleanPath))
			if isSupportedArtworkExtension(extension) {
				markCoverRefresh(root, filepath.Dir(cleanPath))
				continue
			}
			if !isSupportedAudioExtension(extension) {
				continue
			}

			totals.filesSeen++
			indexed, upsertErr := upsertFileAndTrack(ctx, tx, root.ID, root.Path, cleanPath, info, scannedAt, scanModeIncremental, coverCacheDir)
			if upsertErr != nil {
				return scanTotals{}, upsertErr
			}
			if indexed {
				totals.indexed++
				totals.libraryChanged = true
				affectedRootIDs[root.ID] = struct{}{}
			}
			continue
		}

		if !errors.Is(statErr, os.ErrNotExist) {
			totals.skipped++
			continue
		}

		extension := strings.ToLower(filepath.Ext(cleanPath))
		if isSupportedArtworkExtension(extension) {
			markCoverRefresh(root, filepath.Dir(cleanPath))
			continue
		}

		changed, err := markPathMissingIncremental(ctx, tx, root.ID, cleanPath)
		if err != nil {
			return scanTotals{}, err
		}
		if changed {
			totals.libraryChanged = true
			affectedRootIDs[root.ID] = struct{}{}
		}
	}

	if len(coverRefreshTargets) > 0 {
		refreshed, changed, err := refreshCoverArtForDirectories(ctx, tx, coverRefreshTargets, coverCacheDir)
		if err != nil {
			return scanTotals{}, err
		}
		totals.indexed += refreshed
		totals.libraryChanged = totals.libraryChanged || changed
	}

	if len(affectedRootIDs) == 0 {
		return totals, nil
	}

	affectedRoots := make([]library.WatchedRoot, 0, len(affectedRootIDs))
	for _, root := range enabledRoots {
		if _, ok := affectedRootIDs[root.ID]; !ok {
			continue
		}
		affectedRoots = append(affectedRoots, root)
	}

	tracksCleaned, err := cleanupMissingTracks(ctx, tx, affectedRoots)
	if err != nil {
		return scanTotals{}, err
	}
	totals.libraryChanged = totals.libraryChanged || tracksCleaned

	return totals, nil
}

type coverRefreshTarget struct {
	rootID        int64
	directoryPath string
}

func refreshCoverArtForDirectories(
	ctx context.Context,
	tx *sql.Tx,
	targets map[string]coverRefreshTarget,
	coverCacheDir string,
) (int, bool, error) {
	if strings.TrimSpace(coverCacheDir) == "" || len(targets) == 0 {
		return 0, false, nil
	}

	orderedTargets := make([]coverRefreshTarget, 0, len(targets))
	for _, target := range targets {
		orderedTargets = append(orderedTargets, target)
	}

	sort.Slice(orderedTargets, func(i int, j int) bool {
		if orderedTargets[i].rootID == orderedTargets[j].rootID {
			if len(orderedTargets[i].directoryPath) == len(orderedTargets[j].directoryPath) {
				return pathCompareKey(orderedTargets[i].directoryPath) < pathCompareKey(orderedTargets[j].directoryPath)
			}
			return len(orderedTargets[i].directoryPath) < len(orderedTargets[j].directoryPath)
		}

		return orderedTargets[i].rootID < orderedTargets[j].rootID
	})

	processedFileIDs := make(map[int64]struct{})
	changed := false
	refreshed := 0

	for _, target := range orderedTargets {
		pattern := likePrefixPattern(target.directoryPath)
		rows, err := tx.QueryContext(
			ctx,
			`SELECT id, path
			 FROM files
			 WHERE root_id = ?
			   AND file_exists = 1
			   AND (path = ? OR path LIKE ? ESCAPE '\\')`,
			target.rootID,
			target.directoryPath,
			pattern,
		)
		if err != nil {
			return 0, false, fmt.Errorf("query tracks for cover refresh in %s: %w", target.directoryPath, err)
		}

		for rows.Next() {
			var fileID int64
			var path string
			if scanErr := rows.Scan(&fileID, &path); scanErr != nil {
				rows.Close()
				return 0, false, fmt.Errorf("scan cover refresh row in %s: %w", target.directoryPath, scanErr)
			}

			if _, alreadyProcessed := processedFileIDs[fileID]; alreadyProcessed {
				continue
			}
			processedFileIDs[fileID] = struct{}{}

			coverChanged, coverErr := syncCoverForFile(ctx, tx, fileID, filepath.Clean(path), coverCacheDir, true)
			if coverErr != nil {
				rows.Close()
				return 0, false, coverErr
			}

			if coverChanged {
				changed = true
				refreshed++
			}
		}

		if rowsErr := rows.Err(); rowsErr != nil {
			rows.Close()
			return 0, false, fmt.Errorf("iterate cover refresh rows in %s: %w", target.directoryPath, rowsErr)
		}

		rows.Close()
	}

	return refreshed, changed, nil
}

func scanIncrementalDirectory(
	ctx context.Context,
	tx *sql.Tx,
	root library.WatchedRoot,
	directoryPath string,
	coverCacheDir string,
) (scanTotals, error) {
	if err := clearIncrementalSeenTable(ctx, tx); err != nil {
		return scanTotals{}, err
	}

	totals := scanTotals{}
	scannedAt := time.Now().UTC().Format(time.RFC3339)

	err := filepath.WalkDir(directoryPath, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			totals.skipped++
			return nil
		}

		if entry.IsDir() {
			return nil
		}

		extension := strings.ToLower(filepath.Ext(path))
		if !isSupportedAudioExtension(extension) {
			return nil
		}

		info, infoErr := entry.Info()
		if infoErr != nil {
			totals.skipped++
			return nil
		}

		cleanPath := filepath.Clean(path)
		totals.filesSeen++
		indexed, upsertErr := upsertFileAndTrack(ctx, tx, root.ID, root.Path, cleanPath, info, scannedAt, scanModeIncremental, coverCacheDir)
		if upsertErr != nil {
			return upsertErr
		}
		if indexed {
			totals.indexed++
			totals.libraryChanged = true
		}

		if seenErr := markPathSeenIncremental(ctx, tx, cleanPath); seenErr != nil {
			return seenErr
		}

		return nil
	})
	if err != nil {
		return scanTotals{}, fmt.Errorf("walk incremental directory %s: %w", directoryPath, err)
	}

	missingReconciled, err := reconcileMissingFilesIncrementalByPrefix(ctx, tx, root.ID, directoryPath)
	if err != nil {
		return scanTotals{}, err
	}
	totals.libraryChanged = totals.libraryChanged || missingReconciled

	return totals, nil
}

func cleanupMissingTracks(ctx context.Context, tx *sql.Tx, roots []library.WatchedRoot) (bool, error) {
	changed := false

	for _, root := range roots {
		result, err := tx.ExecContext(
			ctx,
			"DELETE FROM tracks WHERE file_id IN (SELECT id FROM files WHERE root_id = ? AND file_exists = 0)",
			root.ID,
		)
		if err != nil {
			return false, fmt.Errorf("cleanup missing tracks for root %d: %w", root.ID, err)
		}

		rowsAffected, rowsErr := result.RowsAffected()
		if rowsErr != nil {
			return false, fmt.Errorf("read missing track cleanup count for root %d: %w", root.ID, rowsErr)
		}
		if rowsAffected > 0 {
			changed = true
		}
	}

	return changed, nil
}

func cleanupMissingCovers(ctx context.Context, tx *sql.Tx) (bool, error) {
	result, err := tx.ExecContext(
		ctx,
		`DELETE FROM covers
		 WHERE source_file_id IS NULL
		    OR source_file_id IN (SELECT id FROM files WHERE file_exists = 0)
		    OR source_file_id NOT IN (SELECT id FROM files)`,
	)
	if err != nil {
		return false, fmt.Errorf("cleanup missing covers: %w", err)
	}

	rowsAffected, rowsErr := result.RowsAffected()
	if rowsErr != nil {
		return false, fmt.Errorf("read missing cover cleanup count: %w", rowsErr)
	}

	return rowsAffected > 0, nil
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
	referencedHashes := make(map[string]struct{})
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
		if coverHash := coverart.HashFromCachePath(resolvedPath); coverHash != "" {
			referencedHashes[coverHash] = struct{}{}
		}
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

		candidateHash := coverart.HashFromCachePath(resolvedCandidate)
		if candidateHash != "" {
			if _, keep := referencedHashes[candidateHash]; keep {
				continue
			}
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

type coverCandidate struct {
	imageData   []byte
	mimeType    string
	format      string
	width       int
	height      int
	source      string
	sourcePath  string
	confidence  int
	minDimScore int
}

func syncCoverForFile(ctx context.Context, tx *sql.Tx, fileID int64, fullPath string, coverCacheDir string, force bool) (bool, error) {
	if strings.TrimSpace(coverCacheDir) == "" {
		return false, nil
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
			return false, fmt.Errorf("get cover row for file %d: %w", fileID, err)
		}
	}

	if existingFound && !force {
		existingCachePath := strings.TrimSpace(existingPath.String)
		if existingCachePath != "" {
			if _, statErr := os.Stat(existingCachePath); statErr == nil {
				_ = ensureCoverThumbnailsFromCachePath(existingCachePath)
				return false, nil
			}
		}
	}

	embeddedCandidate := readEmbeddedCoverCandidate(fullPath)
	sidecarCandidates := readSidecarCoverCandidates(fullPath)
	selectedCandidate := selectCoverCandidate(embeddedCandidate, sidecarCandidates)

	if selectedCandidate == nil {
		if existingFound {
			if _, deleteErr := tx.ExecContext(ctx, "DELETE FROM covers WHERE id = ?", existingID); deleteErr != nil {
				return false, fmt.Errorf("delete cover row for file %d: %w", fileID, deleteErr)
			}
			return true, nil
		}

		return false, nil
	}

	hashBytes := sha256.Sum256(selectedCandidate.imageData)
	hash := hex.EncodeToString(hashBytes[:])

	mimeType := strings.TrimSpace(selectedCandidate.mimeType)
	if mimeType == "" {
		mimeType = mimeTypeFromImageFormat(selectedCandidate.format)
	}

	extension := extensionForCover(mimeType, selectedCandidate.format)
	if extension == "" {
		extension = ".img"
	}

	cachePath := filepath.Join(coverCacheDir, hash+extension)
	if existingFound && existingHash.Valid && strings.EqualFold(strings.TrimSpace(existingHash.String), hash) && strings.TrimSpace(existingPath.String) != "" {
		cachePath = strings.TrimSpace(existingPath.String)
	}

	if err := os.MkdirAll(coverCacheDir, 0o755); err != nil {
		return false, fmt.Errorf("create cover cache dir: %w", err)
	}

	if statErr := ensureCoverFile(cachePath, selectedCandidate.imageData); statErr != nil {
		return false, nil
	}

	if thumbErr := ensureCoverThumbnails(cachePath, hash, selectedCandidate.imageData); thumbErr != nil {
		return false, nil
	}

	coverChanged := !existingFound
	if existingFound {
		previousHash := strings.TrimSpace(existingHash.String)
		previousPath := strings.TrimSpace(existingPath.String)
		if !strings.EqualFold(previousHash, hash) || previousPath != cachePath {
			coverChanged = true
		}

		if _, updateErr := tx.ExecContext(
			ctx,
			"UPDATE covers SET mime = ?, width = ?, height = ?, cache_path = ?, hash = ? WHERE id = ?",
			nullableString(mimeType),
			nullablePositiveInt(selectedCandidate.width),
			nullablePositiveInt(selectedCandidate.height),
			cachePath,
			hash,
			existingID,
		); updateErr != nil {
			return false, fmt.Errorf("update cover row for file %d: %w", fileID, updateErr)
		}

		return coverChanged, nil
	}

	if _, insertErr := tx.ExecContext(
		ctx,
		"INSERT INTO covers(source_file_id, mime, width, height, cache_path, hash) VALUES (?, ?, ?, ?, ?, ?)",
		fileID,
		nullableString(mimeType),
		nullablePositiveInt(selectedCandidate.width),
		nullablePositiveInt(selectedCandidate.height),
		cachePath,
		hash,
	); insertErr != nil {
		return false, fmt.Errorf("insert cover row for file %d: %w", fileID, insertErr)
	}

	return true, nil
}

func readEmbeddedCoverCandidate(fullPath string) *coverCandidate {
	properties, propertiesErr := taglib.ReadProperties(fullPath)
	if propertiesErr != nil || len(properties.Images) == 0 {
		return nil
	}

	imageData, imageErr := taglib.ReadImage(fullPath)
	if imageErr != nil || len(imageData) == 0 {
		return nil
	}

	format, width, height := decodeCoverImage(imageData)
	if width <= 0 || height <= 0 {
		return nil
	}

	mimeType := strings.TrimSpace(properties.Images[0].MIMEType)
	if mimeType == "" {
		mimeType = mimeTypeFromImageFormat(format)
	}

	return &coverCandidate{
		imageData:   imageData,
		mimeType:    mimeType,
		format:      format,
		width:       width,
		height:      height,
		source:      "embedded",
		confidence:  100,
		minDimScore: coverMinDimension(width, height),
	}
}

func readSidecarCoverCandidates(fullPath string) []coverCandidate {
	trackDirectory := filepath.Clean(filepath.Dir(fullPath))
	if trackDirectory == "" || trackDirectory == "." {
		return nil
	}

	candidateDirs := []string{trackDirectory}
	if shouldSearchParentForSidecar(trackDirectory) {
		parentDirectory := filepath.Clean(filepath.Dir(trackDirectory))
		if parentDirectory != "" && parentDirectory != "." && parentDirectory != trackDirectory {
			candidateDirs = append(candidateDirs, parentDirectory)
		}
	}

	seenDirectories := make(map[string]struct{}, len(candidateDirs))
	candidates := make([]coverCandidate, 0, 4)

	for _, directory := range candidateDirs {
		directoryKey := pathCompareKey(directory)
		if _, alreadySeen := seenDirectories[directoryKey]; alreadySeen {
			continue
		}
		seenDirectories[directoryKey] = struct{}{}

		entries, err := os.ReadDir(directory)
		if err != nil {
			continue
		}

		for _, entry := range entries {
			if entry.IsDir() {
				continue
			}

			filename := entry.Name()
			extension := strings.ToLower(filepath.Ext(filename))
			if !isSupportedArtworkExtension(extension) {
				continue
			}

			confidence := sidecarNameConfidence(filename)
			if confidence <= 0 {
				continue
			}

			info, infoErr := entry.Info()
			if infoErr != nil || info.Size() <= 0 || info.Size() > 32<<20 {
				continue
			}

			sidecarPath := filepath.Join(directory, filename)
			imageData, readErr := os.ReadFile(sidecarPath)
			if readErr != nil || len(imageData) == 0 {
				continue
			}

			format, width, height := decodeCoverImage(imageData)
			if width <= 0 || height <= 0 {
				continue
			}

			mimeType := mimeTypeFromImageFormat(format)
			if mimeType == "" {
				mimeType = mimeTypeFromExtension(extension)
			}

			candidates = append(candidates, coverCandidate{
				imageData:   imageData,
				mimeType:    mimeType,
				format:      format,
				width:       width,
				height:      height,
				source:      "sidecar",
				sourcePath:  sidecarPath,
				confidence:  confidence,
				minDimScore: coverMinDimension(width, height),
			})
		}
	}

	return candidates
}

func shouldSearchParentForSidecar(directoryPath string) bool {
	baseName := strings.ToLower(strings.TrimSpace(filepath.Base(directoryPath)))
	if baseName == "" || baseName == "." {
		return false
	}

	return multiDiscFolderPattern.MatchString(baseName)
}

func sidecarNameConfidence(filename string) int {
	baseName := strings.TrimSpace(strings.TrimSuffix(filename, filepath.Ext(filename)))
	if baseName == "" {
		return 0
	}

	tokens := tokenizeFilenameBase(baseName)
	if len(tokens) == 0 {
		return 0
	}

	disallowed := map[string]struct{}{
		"back":    {},
		"disc":    {},
		"booklet": {},
		"tray":    {},
		"inside":  {},
		"spine":   {},
		"sticker": {},
	}
	for _, token := range tokens {
		if _, blocked := disallowed[token]; blocked {
			return 0
		}
	}

	joined := strings.Join(tokens, "")
	switch joined {
	case "cover":
		return 100
	case "folder":
		return 98
	case "front":
		return 96
	case "albumart", "albumcover":
		return 92
	case "artwork":
		return 90
	}

	if len(tokens) == 1 {
		switch tokens[0] {
		case "cover":
			return 100
		case "folder":
			return 98
		case "front":
			return 96
		case "album", "art":
			return 80
		}
	}

	primary := tokens[0]
	if primary == "cover" || primary == "folder" || primary == "front" {
		return 92
	}

	if containsToken(tokens, "cover") && containsToken(tokens, "front") {
		return 90
	}

	if containsToken(tokens, "album") && containsToken(tokens, "art") {
		return 88
	}

	if containsToken(tokens, "artwork") {
		return 85
	}

	return 0
}

func tokenizeFilenameBase(baseName string) []string {
	normalized := strings.ToLower(strings.TrimSpace(baseName))
	if normalized == "" {
		return nil
	}

	tokens := strings.FieldsFunc(normalized, func(char rune) bool {
		isLower := char >= 'a' && char <= 'z'
		isDigit := char >= '0' && char <= '9'
		return !isLower && !isDigit
	})

	filtered := make([]string, 0, len(tokens))
	for _, token := range tokens {
		if token == "" {
			continue
		}
		filtered = append(filtered, token)
	}

	return filtered
}

func containsToken(tokens []string, target string) bool {
	for _, token := range tokens {
		if token == target {
			return true
		}
	}

	return false
}

func selectCoverCandidate(embedded *coverCandidate, sidecars []coverCandidate) *coverCandidate {
	bestSidecar := bestSidecarCandidate(sidecars)
	if embedded == nil {
		if bestSidecar == nil || bestSidecar.confidence < 88 {
			return nil
		}
		return bestSidecar
	}
	if bestSidecar == nil {
		return embedded
	}

	if shouldPreferSidecarOverEmbedded(*bestSidecar, *embedded) {
		return bestSidecar
	}

	return embedded
}

func bestSidecarCandidate(candidates []coverCandidate) *coverCandidate {
	if len(candidates) == 0 {
		return nil
	}

	best := candidates[0]
	for _, candidate := range candidates[1:] {
		if compareSidecarCandidates(candidate, best) {
			best = candidate
		}
	}

	copyCandidate := best
	return &copyCandidate
}

func compareSidecarCandidates(left coverCandidate, right coverCandidate) bool {
	if left.confidence != right.confidence {
		return left.confidence > right.confidence
	}

	if left.minDimScore != right.minDimScore {
		return left.minDimScore > right.minDimScore
	}

	leftAspectDistance := coverAspectDistanceFromSquare(left.width, left.height)
	rightAspectDistance := coverAspectDistanceFromSquare(right.width, right.height)
	if leftAspectDistance != rightAspectDistance {
		return leftAspectDistance < rightAspectDistance
	}

	leftArea := left.width * left.height
	rightArea := right.width * right.height
	if leftArea != rightArea {
		return leftArea > rightArea
	}

	return pathCompareKey(left.sourcePath) < pathCompareKey(right.sourcePath)
}

func shouldPreferSidecarOverEmbedded(sidecar coverCandidate, embedded coverCandidate) bool {
	if sidecar.confidence < 88 {
		return false
	}

	sidecarMin := coverMinDimension(sidecar.width, sidecar.height)
	embeddedMin := coverMinDimension(embedded.width, embedded.height)
	if sidecarMin <= 0 {
		return false
	}
	if embeddedMin <= 0 {
		return true
	}

	sidecarAspectDistance := coverAspectDistanceFromSquare(sidecar.width, sidecar.height)
	embeddedAspectDistance := coverAspectDistanceFromSquare(embedded.width, embedded.height)
	if sidecarAspectDistance > 0.25 {
		return false
	}

	if embeddedMin < 450 && sidecarMin >= 550 {
		return true
	}

	if sidecarMin >= embeddedMin+220 && sidecarAspectDistance <= embeddedAspectDistance+0.04 {
		return true
	}

	if float64(sidecarMin) >= float64(embeddedMin)*1.35 && sidecarAspectDistance <= 0.16 {
		return true
	}

	if embeddedAspectDistance > 0.18 && sidecarAspectDistance <= 0.08 && sidecarMin >= embeddedMin {
		return true
	}

	return false
}

func coverMinDimension(width int, height int) int {
	if width <= 0 || height <= 0 {
		return 0
	}
	if width < height {
		return width
	}
	return height
}

func coverAspectDistanceFromSquare(width int, height int) float64 {
	if width <= 0 || height <= 0 {
		return math.MaxFloat64
	}

	ratio := float64(width) / float64(height)
	if ratio < 1 {
		ratio = 1 / ratio
	}

	return math.Abs(ratio - 1)
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

func ensureCoverThumbnailsFromCachePath(cachePath string) error {
	coverHash := coverart.HashFromCachePath(cachePath)
	if coverHash == "" {
		return errors.New("invalid cover cache hash")
	}

	cacheDirectory := filepath.Dir(cachePath)
	hasMissingThumbnail := false
	for _, spec := range coverart.DefaultThumbnailSpecs() {
		thumbnailPath := coverart.VariantPathForHash(cacheDirectory, coverHash, spec.Variant)
		if _, err := os.Stat(thumbnailPath); err == nil {
			continue
		}
		hasMissingThumbnail = true
		break
	}
	if !hasMissingThumbnail {
		return nil
	}

	imageData, err := os.ReadFile(cachePath)
	if err != nil {
		return err
	}

	return ensureCoverThumbnails(cachePath, coverHash, imageData)
}

func ensureCoverThumbnails(cachePath string, coverHash string, imageData []byte) error {
	if strings.TrimSpace(cachePath) == "" || strings.TrimSpace(coverHash) == "" || len(imageData) == 0 {
		return nil
	}

	specs := coverart.DefaultThumbnailSpecs()
	missingSpecs := make([]coverart.ThumbnailSpec, 0, len(specs))
	cacheDirectory := filepath.Dir(cachePath)

	for _, spec := range specs {
		thumbPath := coverart.VariantPathForHash(cacheDirectory, coverHash, spec.Variant)
		if _, err := os.Stat(thumbPath); err == nil {
			continue
		}
		missingSpecs = append(missingSpecs, spec)
	}

	if len(missingSpecs) == 0 {
		return nil
	}

	decoded, _, err := image.Decode(bytes.NewReader(imageData))
	if err != nil {
		return err
	}

	source := toNRGBAImage(decoded)
	for _, spec := range missingSpecs {
		thumbPath := coverart.VariantPathForHash(cacheDirectory, coverHash, spec.Variant)
		if err := writeCoverThumbnail(thumbPath, source, spec.Size); err != nil {
			return err
		}
	}

	return nil
}

func writeCoverThumbnail(path string, source *image.NRGBA, size int) error {
	if source == nil || size <= 0 {
		return errors.New("invalid cover thumbnail input")
	}

	thumbnail := resizeCoverToSquare(source, size)
	if thumbnail == nil {
		return errors.New("failed to resize cover thumbnail")
	}

	buffer := bytes.Buffer{}
	if err := jpeg.Encode(&buffer, thumbnail, &jpeg.Options{Quality: 88}); err != nil {
		return err
	}

	if err := os.WriteFile(path, buffer.Bytes(), 0o644); err != nil {
		return err
	}

	return nil
}

func toNRGBAImage(source image.Image) *image.NRGBA {
	bounds := source.Bounds()
	result := image.NewNRGBA(image.Rect(0, 0, bounds.Dx(), bounds.Dy()))
	draw.Draw(result, result.Bounds(), source, bounds.Min, draw.Src)
	return result
}

func resizeCoverToSquare(source *image.NRGBA, size int) *image.NRGBA {
	if source == nil || size <= 0 {
		return nil
	}

	sourceWidth := source.Bounds().Dx()
	sourceHeight := source.Bounds().Dy()
	if sourceWidth <= 0 || sourceHeight <= 0 {
		return nil
	}

	cropSize := sourceWidth
	if sourceHeight < cropSize {
		cropSize = sourceHeight
	}

	cropOffsetX := (sourceWidth - cropSize) / 2
	cropOffsetY := (sourceHeight - cropSize) / 2

	result := image.NewNRGBA(image.Rect(0, 0, size, size))
	scale := float64(cropSize) / float64(size)

	for y := 0; y < size; y++ {
		sampleY := (float64(y)+0.5)*scale - 0.5 + float64(cropOffsetY)
		for x := 0; x < size; x++ {
			sampleX := (float64(x)+0.5)*scale - 0.5 + float64(cropOffsetX)
			red, green, blue, alpha := bilinearSampleNRGBA(source, sampleX, sampleY)
			offset := y*result.Stride + x*4
			result.Pix[offset] = red
			result.Pix[offset+1] = green
			result.Pix[offset+2] = blue
			result.Pix[offset+3] = alpha
		}
	}

	return result
}

func bilinearSampleNRGBA(source *image.NRGBA, x float64, y float64) (uint8, uint8, uint8, uint8) {
	width := source.Bounds().Dx()
	height := source.Bounds().Dy()
	if width <= 0 || height <= 0 {
		return 0, 0, 0, 0
	}

	x = clampFloat(x, 0, float64(width-1))
	y = clampFloat(y, 0, float64(height-1))

	x0 := int(math.Floor(x))
	y0 := int(math.Floor(y))
	x1 := x0 + 1
	y1 := y0 + 1
	if x1 >= width {
		x1 = width - 1
	}
	if y1 >= height {
		y1 = height - 1
	}

	tx := x - float64(x0)
	ty := y - float64(y0)

	offset00 := y0*source.Stride + x0*4
	offset10 := y0*source.Stride + x1*4
	offset01 := y1*source.Stride + x0*4
	offset11 := y1*source.Stride + x1*4

	weight00 := (1 - tx) * (1 - ty)
	weight10 := tx * (1 - ty)
	weight01 := (1 - tx) * ty
	weight11 := tx * ty

	red := weight00*float64(source.Pix[offset00]) + weight10*float64(source.Pix[offset10]) + weight01*float64(source.Pix[offset01]) + weight11*float64(source.Pix[offset11])
	green := weight00*float64(source.Pix[offset00+1]) + weight10*float64(source.Pix[offset10+1]) + weight01*float64(source.Pix[offset01+1]) + weight11*float64(source.Pix[offset11+1])
	blue := weight00*float64(source.Pix[offset00+2]) + weight10*float64(source.Pix[offset10+2]) + weight01*float64(source.Pix[offset01+2]) + weight11*float64(source.Pix[offset11+2])
	alpha := weight00*float64(source.Pix[offset00+3]) + weight10*float64(source.Pix[offset10+3]) + weight01*float64(source.Pix[offset01+3]) + weight11*float64(source.Pix[offset11+3])

	return uint8(math.Round(red)), uint8(math.Round(green)), uint8(math.Round(blue)), uint8(math.Round(alpha))
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

func mimeTypeFromExtension(extension string) string {
	switch strings.ToLower(strings.TrimSpace(extension)) {
	case ".jpg", ".jpeg", ".jpe":
		return "image/jpeg"
	case ".png":
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

func clampFloat(value float64, minimum float64, maximum float64) float64 {
	if value < minimum {
		return minimum
	}
	if value > maximum {
		return maximum
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
		if !isSupportedAudioExtension(extension) {
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
			rootTotals.libraryChanged = true
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
		fileNeedsRefresh := metadataNeedsUpdate || rootChanged || currentExists == 0 || isFullTraversalMode(mode)

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
		if mode == scanModeRepair {
			metadataNeedsUpdate = true
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
		coverChanged, err := syncCoverForFile(ctx, tx, fileID, cleanPath, coverCacheDir, false)
		if err != nil {
			return false, err
		}

		return coverChanged, nil
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

	if _, err := syncCoverForFile(ctx, tx, fileID, cleanPath, coverCacheDir, true); err != nil {
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
