package stats

import (
	"context"
	"database/sql"
	"strings"
	"sync"
	"time"

	"ben/internal/player"
)

const EventHeartbeat = "heartbeat"

const EventComplete = "complete"

const EventSkip = "skip"

const heartbeatInterval = 10 * time.Second

const completionGraceMS = 2500

const completionThresholdPercent = 95

const maxDeltaMS = 30000

const defaultTopLimit = 5

const maxTopLimit = 25

type Overview struct {
	TotalPlayedMS int          `json:"totalPlayedMs"`
	TracksPlayed  int          `json:"tracksPlayed"`
	CompleteCount int          `json:"completeCount"`
	SkipCount     int          `json:"skipCount"`
	TopTracks     []TrackStat  `json:"topTracks"`
	TopArtists    []ArtistStat `json:"topArtists"`
}

type TrackStat struct {
	TrackID       int64   `json:"trackId"`
	Title         string  `json:"title"`
	Artist        string  `json:"artist"`
	Album         string  `json:"album"`
	CoverPath     *string `json:"coverPath,omitempty"`
	PlayedMS      int     `json:"playedMs"`
	CompleteCount int     `json:"completeCount"`
	SkipCount     int     `json:"skipCount"`
}

type ArtistStat struct {
	Name       string `json:"name"`
	PlayedMS   int    `json:"playedMs"`
	TrackCount int    `json:"trackCount"`
}

type Service struct {
	mu sync.Mutex
	db *sql.DB

	activeTrackID   int64
	activeDuration  int
	activePosition  int
	active          bool
	activePlayback  bool
	pendingPlayedMS int
	lastObservedAt  time.Time
}

type playEvent struct {
	trackID   int64
	eventType string
	position  int
	at        time.Time
}

func NewService(database *sql.DB) *Service {
	return &Service{db: database}
}

func (s *Service) HandlePlayerState(state player.State) {
	if s.db == nil {
		return
	}

	observedAt := parseStateTime(state.UpdatedAt)
	status := normalizeStatus(state.Status)
	trackID, durationMS := currentTrackInfo(state)
	positionMS := state.PositionMS
	if positionMS < 0 {
		positionMS = 0
	}

	events := make([]playEvent, 0, 4)

	s.mu.Lock()
	if s.active {
		if s.activePlayback {
			deltaMS := elapsedMS(s.lastObservedAt, observedAt)
			if deltaMS > 0 {
				s.pendingPlayedMS += deltaMS
				for s.pendingPlayedMS >= int(heartbeatInterval/time.Millisecond) {
					s.pendingPlayedMS -= int(heartbeatInterval / time.Millisecond)
					events = append(events, playEvent{
						trackID:   s.activeTrackID,
						eventType: EventHeartbeat,
						position:  int(heartbeatInterval / time.Millisecond),
						at:        observedAt,
					})
				}
			}
		}

		finalize := shouldFinalizeTrack(s.activeTrackID, trackID, status)
		if finalize {
			if s.pendingPlayedMS > 0 {
				events = append(events, playEvent{
					trackID:   s.activeTrackID,
					eventType: EventHeartbeat,
					position:  s.pendingPlayedMS,
					at:        observedAt,
				})
				s.pendingPlayedMS = 0
			}

			eventType := classifyTrackEnd(s.activePosition, s.activeDuration)
			if eventType != "" {
				events = append(events, playEvent{
					trackID:   s.activeTrackID,
					eventType: eventType,
					position:  s.activePosition,
					at:        observedAt,
				})
			}

			s.active = false
			s.activePlayback = false
			s.activeTrackID = 0
			s.activeDuration = 0
			s.activePosition = 0
			s.pendingPlayedMS = 0
		}
	}

	if status == player.StatusPlaying && trackID > 0 {
		if !s.active || s.activeTrackID != trackID {
			s.active = true
			s.activeTrackID = trackID
			s.pendingPlayedMS = 0
		}

		s.activeDuration = durationMS
		s.activePosition = positionMS
		s.activePlayback = true
	} else if s.active && trackID > 0 && s.activeTrackID == trackID {
		s.activeDuration = durationMS
		s.activePosition = positionMS
		s.activePlayback = false
	} else if !s.active {
		s.activePlayback = false
	}

	s.lastObservedAt = observedAt
	s.mu.Unlock()

	s.persistEvents(events)
}

func (s *Service) GetOverview(limit int) (Overview, error) {
	if s.db == nil {
		return Overview{}, nil
	}

	normalizedLimit := normalizeTopLimit(limit)
	ctx := context.Background()

	overview := Overview{}
	if err := s.db.QueryRowContext(ctx, `
		SELECT
			COALESCE(SUM(CASE WHEN event_type = ? THEN COALESCE(position_ms, 0) ELSE 0 END), 0) AS total_played_ms,
			COUNT(DISTINCT CASE WHEN event_type = ? AND COALESCE(position_ms, 0) > 0 THEN track_id END) AS tracks_played,
			COALESCE(SUM(CASE WHEN event_type = ? THEN 1 ELSE 0 END), 0) AS complete_count,
			COALESCE(SUM(CASE WHEN event_type = ? THEN 1 ELSE 0 END), 0) AS skip_count
		FROM play_events
	`, EventHeartbeat, EventHeartbeat, EventComplete, EventSkip).Scan(
		&overview.TotalPlayedMS,
		&overview.TracksPlayed,
		&overview.CompleteCount,
		&overview.SkipCount,
	); err != nil {
		return Overview{}, err
	}

	tracks, err := s.readTopTracks(ctx, normalizedLimit)
	if err != nil {
		return Overview{}, err
	}
	overview.TopTracks = tracks

	artists, err := s.readTopArtists(ctx, normalizedLimit)
	if err != nil {
		return Overview{}, err
	}
	overview.TopArtists = artists

	return overview, nil
}

func (s *Service) readTopTracks(ctx context.Context, limit int) ([]TrackStat, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT
			t.id,
			COALESCE(NULLIF(TRIM(t.title), ''), 'Unknown Title') AS track_title,
			COALESCE(NULLIF(TRIM(t.artist), ''), 'Unknown Artist') AS track_artist,
			COALESCE(NULLIF(TRIM(t.album), ''), 'Unknown Album') AS track_album,
			cover.cache_path,
			COALESCE(SUM(CASE WHEN pe.event_type = ? THEN COALESCE(pe.position_ms, 0) ELSE 0 END), 0) AS played_ms,
			COALESCE(SUM(CASE WHEN pe.event_type = ? THEN 1 ELSE 0 END), 0) AS complete_count,
			COALESCE(SUM(CASE WHEN pe.event_type = ? THEN 1 ELSE 0 END), 0) AS skip_count
		FROM play_events pe
		JOIN tracks t ON t.id = pe.track_id
		JOIN files f ON f.id = t.file_id
		LEFT JOIN covers cover ON cover.source_file_id = t.file_id
		WHERE f.file_exists = 1
		GROUP BY t.id, track_title, track_artist, track_album, cover.cache_path
		HAVING
			COALESCE(SUM(CASE WHEN pe.event_type = ? THEN COALESCE(pe.position_ms, 0) ELSE 0 END), 0) > 0
			OR COALESCE(SUM(CASE WHEN pe.event_type = ? THEN 1 ELSE 0 END), 0) > 0
			OR COALESCE(SUM(CASE WHEN pe.event_type = ? THEN 1 ELSE 0 END), 0) > 0
		ORDER BY played_ms DESC, complete_count DESC, skip_count ASC, LOWER(track_title)
		LIMIT ?
	`,
		EventHeartbeat,
		EventComplete,
		EventSkip,
		EventHeartbeat,
		EventComplete,
		EventSkip,
		limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	tracks := make([]TrackStat, 0, limit)
	for rows.Next() {
		var item TrackStat
		var coverPath sql.NullString
		if scanErr := rows.Scan(
			&item.TrackID,
			&item.Title,
			&item.Artist,
			&item.Album,
			&coverPath,
			&item.PlayedMS,
			&item.CompleteCount,
			&item.SkipCount,
		); scanErr != nil {
			return nil, scanErr
		}

		item.CoverPath = nullableStringPointer(coverPath)
		tracks = append(tracks, item)
	}

	if rowsErr := rows.Err(); rowsErr != nil {
		return nil, rowsErr
	}

	return tracks, nil
}

func (s *Service) readTopArtists(ctx context.Context, limit int) ([]ArtistStat, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT
			COALESCE(NULLIF(TRIM(t.artist), ''), 'Unknown Artist') AS artist_name,
			COALESCE(SUM(CASE WHEN pe.event_type = ? THEN COALESCE(pe.position_ms, 0) ELSE 0 END), 0) AS played_ms,
			COUNT(DISTINCT t.id) AS track_count
		FROM play_events pe
		JOIN tracks t ON t.id = pe.track_id
		JOIN files f ON f.id = t.file_id
		WHERE f.file_exists = 1
		GROUP BY artist_name
		HAVING COALESCE(SUM(CASE WHEN pe.event_type = ? THEN COALESCE(pe.position_ms, 0) ELSE 0 END), 0) > 0
		ORDER BY played_ms DESC, LOWER(artist_name)
		LIMIT ?
	`, EventHeartbeat, EventHeartbeat, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	artists := make([]ArtistStat, 0, limit)
	for rows.Next() {
		var item ArtistStat
		if scanErr := rows.Scan(&item.Name, &item.PlayedMS, &item.TrackCount); scanErr != nil {
			return nil, scanErr
		}
		artists = append(artists, item)
	}

	if rowsErr := rows.Err(); rowsErr != nil {
		return nil, rowsErr
	}

	return artists, nil
}

func (s *Service) persistEvents(events []playEvent) {
	if len(events) == 0 || s.db == nil {
		return
	}

	ctx := context.Background()
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return
	}

	defer func() {
		_ = tx.Rollback()
	}()

	for _, event := range events {
		if event.trackID <= 0 {
			continue
		}

		at := event.at.UTC().Format(time.RFC3339)
		if _, execErr := tx.ExecContext(
			ctx,
			"INSERT INTO play_events(track_id, event_type, position_ms, ts) VALUES (?, ?, ?, ?)",
			event.trackID,
			event.eventType,
			event.position,
			at,
		); execErr != nil {
			return
		}
	}

	_ = tx.Commit()
}

func shouldFinalizeTrack(activeTrackID int64, currentTrackID int64, status string) bool {
	if activeTrackID <= 0 {
		return false
	}

	if currentTrackID > 0 && currentTrackID != activeTrackID {
		return true
	}

	if status == player.StatusIdle && currentTrackID == 0 {
		return true
	}

	return false
}

func classifyTrackEnd(positionMS int, durationMS int) string {
	if positionMS <= 0 {
		return ""
	}

	if durationMS > 0 {
		if positionMS >= durationMS-completionGraceMS {
			return EventComplete
		}

		if (positionMS * 100) >= (durationMS * completionThresholdPercent) {
			return EventComplete
		}
	}

	return EventSkip
}

func elapsedMS(start time.Time, end time.Time) int {
	if start.IsZero() || end.IsZero() || !end.After(start) {
		return 0
	}

	deltaMS := int(end.Sub(start) / time.Millisecond)
	if deltaMS <= 0 {
		return 0
	}
	if deltaMS > maxDeltaMS {
		return maxDeltaMS
	}

	return deltaMS
}

func parseStateTime(value string) time.Time {
	trimmed := strings.TrimSpace(value)
	if trimmed != "" {
		if parsed, err := time.Parse(time.RFC3339Nano, trimmed); err == nil {
			return parsed.UTC()
		}
		if parsed, err := time.Parse(time.RFC3339, trimmed); err == nil {
			return parsed.UTC()
		}
	}

	return time.Now().UTC()
}

func currentTrackInfo(state player.State) (int64, int) {
	if state.CurrentTrack == nil {
		return 0, 0
	}

	durationMS := 0
	if state.DurationMS != nil && *state.DurationMS > 0 {
		durationMS = *state.DurationMS
	} else if state.CurrentTrack.DurationMS != nil && *state.CurrentTrack.DurationMS > 0 {
		durationMS = *state.CurrentTrack.DurationMS
	}

	return state.CurrentTrack.ID, durationMS
}

func normalizeStatus(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case player.StatusPlaying:
		return player.StatusPlaying
	case player.StatusPaused:
		return player.StatusPaused
	default:
		return player.StatusIdle
	}
}

func normalizeTopLimit(value int) int {
	if value <= 0 {
		return defaultTopLimit
	}
	if value > maxTopLimit {
		return maxTopLimit
	}

	return value
}

func nullableStringPointer(value sql.NullString) *string {
	if !value.Valid {
		return nil
	}

	trimmed := strings.TrimSpace(value.String)
	if trimmed == "" {
		return nil
	}

	return &trimmed
}
