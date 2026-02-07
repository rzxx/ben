# Ben Project Plan

## Vision
Ben is a fast, modern desktop music player built with Wails v3 (Go backend + React/TypeScript frontend).

Primary goals:
- Great local library support (including complex FLAC/tag cases)
- Beautiful, simple UX for browsing and playback
- Reliable offline library cache via SQLite
- Native-feeling desktop integration on Windows (media controls, metadata)

## Product Scope (v1)
- Library manager:
  - User-configured watched folders
  - Full and incremental scanning
  - Tag-driven organization (artist, album, disc, track)
  - Cover art extraction and caching
- Playback:
  - Gapless-like smooth transitions where possible
  - Standard transport controls (play/pause/next/prev/seek)
  - Queue management (manual queue + autoplay behavior)
- Desktop integration:
  - Global media key shortcuts
  - Windows media transport metadata and controls (SMTC)
- Insights:
  - Track playback time/events for simple listening stats

## Recommended Technology Choices
- UI shell + IPC: Wails v3
- Audio playback: `libmpv` via Go binding (`github.com/gen2brain/go-mpv`)
- Tag parsing (primary): `TagLib` via Go binding (`go.senan.xyz/taglib`)
- Tag parsing (fallback): FFmpeg/libav metadata path for edge cases (`github.com/asticode/go-astiav`)
- File watching: `github.com/fsnotify/fsnotify`
- SQLite driver: `modernc.org/sqlite` (pure Go)
- Artwork processing: Go stdlib image decode + cached resized files

Why this stack:
- `libmpv` provides modern in-process playback with broad codec/container support through FFmpeg.
- `TagLib` gives stronger cross-format metadata coverage than lightweight Go-only tag parsers.
- Pure-Go SQLite driver reduces CGO/toolchain complexity for core DB operations.
- Wails keeps React frontend productive while backend handles filesystem/audio/native integration.

## High-Level Architecture
- Frontend (React):
  - Presentation and interaction layer only
  - Subscribes to backend events for playback and scan progress
  - Never scans filesystem or parses tags directly
- Backend (Go):
  - Owns scanner, library index, playback engine, queue engine, stats, and platform integration
  - Exposes service methods to frontend via Wails bindings
  - Emits typed events for realtime updates
- Persistence (SQLite + disk cache):
  - SQLite is source of truth for library browsing and playback state
  - Cover art thumbnails stored on disk, indexed in DB

## Proposed Project Structure
```txt
cmd/ben/main.go
internal/app/
internal/config/
internal/db/
internal/db/migrations/
internal/library/
internal/scanner/
internal/player/
internal/queue/
internal/stats/
internal/platform/windows/smtc/
internal/events/
frontend/src/app/
frontend/src/features/library/
frontend/src/features/player/
frontend/src/features/queue/
frontend/src/features/settings/
frontend/src/shared/
```

## Backend Component Responsibilities
- `LibraryService`
  - Query artists/albums/tracks
  - Search and browse endpoints
  - Resolve cover URLs/paths
- `ScannerService`
  - Full scan + incremental scan
  - File change detection and reconciliation
  - Tag extraction pipeline with error reporting
- `PlayerService`
  - Wrap `libmpv` instance control
  - Transport commands + progress reporting
  - Emit playback state changes
- `QueueService`
  - In-memory active queue state with persistence snapshots
  - Repeat/shuffle behavior
  - Next-track resolution logic
- `StatsService`
  - Heartbeat-based played-time accumulation
  - Skip/complete event tracking
- `WindowsPlatformService`
  - Register media-related shortcuts
  - Bridge playback state/metadata to SMTC

## Data Model (SQLite v1)
Core tables:
- `watched_roots(id, path, enabled, created_at)`
- `files(id, path, root_id, size, mtime_ns, hash_quick, exists, last_seen_at)`
- `tracks(id, file_id, title, artist, album_artist, album, disc_no, track_no, year, genre, duration_ms, codec, sample_rate, bit_depth, bitrate, tags_json, updated_at)`
- `artists(id, name, sort_name)`
- `albums(id, title, album_artist, year, cover_id, sort_key)`
- `album_tracks(album_id, track_id, disc_no, track_no)`
- `covers(id, source_file_id, mime, width, height, cache_path, hash)`
- `queue_entries(id, position, track_id, source, added_at)`
- `playback_state(id, current_track_id, position_ms, status, repeat_mode, shuffle, updated_at)`
- `play_events(id, track_id, event_type, position_ms, ts)`

Notes:
- Keep raw extracted tags in `tags_json` for troubleshooting and future schema upgrades.
- Use indexes on `files.path`, `tracks.file_id`, album/artist sort keys, and queue position.

## Core Flows
1. Startup:
   - Run migrations
   - Load settings and prior playback state
   - Start filesystem watchers
2. Library scan:
   - Enumerate watched roots
   - Upsert files by path and basic stat fingerprint
   - Parse tags only for new/changed files
   - Mark missing files and cleanup derived entities
3. Playback:
   - Resolve current track from queue
   - Start playback through player service
   - Emit playback state/progress events to frontend
4. Stats tracking:
   - While playing, write heartbeat events at fixed interval
   - On track end, record completion event
5. Windows integration:
   - Push current metadata/artwork/play state to SMTC
   - React to media keys and dispatch to queue/player

## Frontend Plan
- Core state domains:
  - `library`: artists, albums, tracks, filters, search
  - `player`: current track, status, progress, volume
  - `queue`: upcoming tracks and queue operations
  - `settings`: watched folders, scan preferences, playback options
- Main screens:
  - Home, Artists, Albums, Album Detail, Queue, Settings
- Player UI:
  - Persistent bottom bar with transport controls and progress
  - Queue panel inspired by Spotify behavior
- Performance:
  - Virtualized long lists
  - Lazy image loading for cover grids

## Concurrency and Reliability Guidelines
- Single owner goroutine for active playback + queue mutable state
- Use `context.Context` for cancellable scan tasks
- Wails service methods stay thin and delegate to domain services
- Prefer event-driven frontend sync over polling
- Recover gracefully if one track fails to decode/play

## Milestones
1. Foundation
   - Rename module from template (`changeme`)
   - Add config management + app data directories
   - Add DB migrations runner and baseline schema
2. Library v1
   - Watched folders CRUD
   - Full scan + incremental rescan
   - Library browse APIs (artist/album/track)
3. Player v1
   - `libmpv` integration
   - Basic transport and seek
   - Queue behavior (append, play next, clear)
4. UI v1
   - Core browsing views + player bar + queue panel
   - Playback and scan progress event wiring
5. Windows integration v1
   - Global media shortcuts
   - SMTC metadata/state integration
6. Stats v1
   - Played-time accumulation
   - Top tracks/artists view
7. Hardening
   - Large-library performance tuning
   - Error handling and recovery paths
   - Packaging/installer validation on Windows

## Testing Strategy
- Unit tests:
  - Queue logic, repeat/shuffle decisions, scanner diffing
- Integration tests:
  - Scanner -> DB pipeline using fixture libraries
  - Player service command/state transitions (mock where needed)
- Manual QA scenarios:
  - Library with mixed codecs/tags
  - File add/remove/rename while app is running
  - Long playback sessions + resume after restart

## Risks and Mitigations
- Risk: `libmpv` runtime packaging complexity
  - Mitigation: lock packaging strategy early and validate on clean Windows VM
- Risk: malformed/inconsistent tags across files
  - Mitigation: use TagLib as primary parser, FFmpeg metadata fallback, and keep raw tags in DB
- Risk: watcher overload on very large libraries
  - Mitigation: debounce watch events and run periodic reconciliation scans
- Risk: Windows SMTC integration edge cases
  - Mitigation: isolate SMTC in platform package with clear feature flag

## Immediate Next Steps
1. Create foundational folders and package boundaries under `internal/`.
2. Implement DB bootstrap + first migration set.
3. Build watched-roots settings API and basic scanner skeleton.
4. Replace template frontend with initial shell layout and event wiring.
