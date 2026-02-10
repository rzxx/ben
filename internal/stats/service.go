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

const EventPartial = "partial"

const heartbeatInterval = 30 * time.Second

const compactionCheckInterval = 6 * time.Hour

const rawEventRetentionDays = 30

const dayKeyLayout = "2006-01-02"

const maxDeltaMS = 30000

const defaultTopLimit = 5

const maxTopLimit = 25

const playedThresholdMS = 30000

const skipThresholdMS = 45000

const shortTrackBoundaryMS = 5 * 60 * 1000

const mediumTrackBoundaryMS = 20 * 60 * 1000

const shortTrackCompletePercent = 90

const mediumTrackCompletePercent = 85

const longTrackCompletePercent = 80

const antiSeekCapMS = 180000

const antiSeekPercent = 25

const completeTailPercent = 3

const completeTailMinMS = 8000

const completeTailMaxMS = 90000

type Overview struct {
	TotalPlayedMS int          `json:"totalPlayedMs"`
	TracksPlayed  int          `json:"tracksPlayed"`
	CompleteCount int          `json:"completeCount"`
	SkipCount     int          `json:"skipCount"`
	PartialCount  int          `json:"partialCount"`
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
	PartialCount  int     `json:"partialCount"`
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
	activePlayedMS  int
	pendingPlayedMS int
	lastObservedAt  time.Time

	lastCompactionAt  time.Time
	compactionRunning bool
}

type playEvent struct {
	trackID   int64
	eventType string
	position  int
	at        time.Time
}

func NewService(database *sql.DB) *Service {
	service := &Service{db: database}
	service.maybeCompact(time.Now().UTC())
	return service
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
				s.activePlayedMS += deltaMS
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

		pausedOrInterrupted := s.activePlayback && (status != player.StatusPlaying || trackID != s.activeTrackID)
		if pausedOrInterrupted && s.pendingPlayedMS > 0 {
			events = append(events, playEvent{
				trackID:   s.activeTrackID,
				eventType: EventHeartbeat,
				position:  s.pendingPlayedMS,
				at:        observedAt,
			})
			s.pendingPlayedMS = 0
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

			eventType := classifyTrackEnd(s.activePlayedMS, s.activePosition, s.activeDuration)
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
			s.activePlayedMS = 0
			s.pendingPlayedMS = 0
		}
	}

	if status == player.StatusPlaying && trackID > 0 {
		if !s.active || s.activeTrackID != trackID {
			s.active = true
			s.activeTrackID = trackID
			s.activePlayedMS = 0
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
	s.maybeCompact(time.Now().UTC())
}

func (s *Service) GetOverview(limit int) (Overview, error) {
	if s.db == nil {
		return Overview{}, nil
	}

	s.maybeCompact(time.Now().UTC())

	normalizedLimit := normalizeTopLimit(limit)
	ctx := context.Background()

	overview := Overview{}
	if err := s.db.QueryRowContext(ctx, `
		SELECT
			COALESCE(SUM(played_ms), 0) AS total_played_ms,
			COUNT(DISTINCT CASE WHEN played_ms > 0 THEN track_id END) AS tracks_played,
			COALESCE(SUM(complete_count), 0) AS complete_count,
			COALESCE(SUM(skip_count), 0) AS skip_count,
			COALESCE(SUM(partial_count), 0) AS partial_count
		FROM (
			SELECT
				track_id,
				CASE WHEN event_type = ? THEN COALESCE(position_ms, 0) ELSE 0 END AS played_ms,
				CASE WHEN event_type = ? THEN 1 ELSE 0 END AS complete_count,
				CASE WHEN event_type = ? THEN 1 ELSE 0 END AS skip_count,
				CASE WHEN event_type = ? THEN 1 ELSE 0 END AS partial_count
			FROM play_events
			UNION ALL
			SELECT
				track_id,
				played_ms,
				complete_count,
				skip_count,
				partial_count
			FROM play_stats_daily
		) AS metrics
	`, EventHeartbeat, EventComplete, EventSkip, EventPartial).Scan(
		&overview.TotalPlayedMS,
		&overview.TracksPlayed,
		&overview.CompleteCount,
		&overview.SkipCount,
		&overview.PartialCount,
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
		WITH track_metrics AS (
			SELECT
				track_id,
				COALESCE(SUM(played_ms), 0) AS played_ms,
				COALESCE(SUM(complete_count), 0) AS complete_count,
				COALESCE(SUM(skip_count), 0) AS skip_count,
				COALESCE(SUM(partial_count), 0) AS partial_count
			FROM (
				SELECT
					track_id,
					CASE WHEN event_type = ? THEN COALESCE(position_ms, 0) ELSE 0 END AS played_ms,
					CASE WHEN event_type = ? THEN 1 ELSE 0 END AS complete_count,
					CASE WHEN event_type = ? THEN 1 ELSE 0 END AS skip_count,
					CASE WHEN event_type = ? THEN 1 ELSE 0 END AS partial_count
				FROM play_events
				UNION ALL
				SELECT
					track_id,
					played_ms,
					complete_count,
					skip_count,
					partial_count
				FROM play_stats_daily
			) AS metrics
			GROUP BY track_id
		)
		SELECT
			t.id,
			COALESCE(NULLIF(TRIM(t.title), ''), 'Unknown Title') AS track_title,
			COALESCE(NULLIF(TRIM(t.artist), ''), 'Unknown Artist') AS track_artist,
			COALESCE(NULLIF(TRIM(t.album), ''), 'Unknown Album') AS track_album,
			cover.cache_path,
			tm.played_ms,
			tm.complete_count,
			tm.skip_count,
			tm.partial_count
		FROM track_metrics tm
		JOIN tracks t ON t.id = tm.track_id
		JOIN files f ON f.id = t.file_id
		LEFT JOIN covers cover ON cover.source_file_id = t.file_id
		WHERE
			f.file_exists = 1
			AND (
				tm.played_ms > 0
				OR tm.complete_count > 0
				OR tm.skip_count > 0
				OR tm.partial_count > 0
			)
		ORDER BY played_ms DESC, complete_count DESC, partial_count DESC, skip_count ASC, LOWER(track_title)
		LIMIT ?
	`,
		EventHeartbeat,
		EventComplete,
		EventSkip,
		EventPartial,
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
			&item.PartialCount,
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
		WITH track_metrics AS (
			SELECT
				track_id,
				COALESCE(SUM(played_ms), 0) AS played_ms,
				COALESCE(SUM(complete_count), 0) AS complete_count,
				COALESCE(SUM(skip_count), 0) AS skip_count,
				COALESCE(SUM(partial_count), 0) AS partial_count
			FROM (
				SELECT
					track_id,
					CASE WHEN event_type = ? THEN COALESCE(position_ms, 0) ELSE 0 END AS played_ms,
					CASE WHEN event_type = ? THEN 1 ELSE 0 END AS complete_count,
					CASE WHEN event_type = ? THEN 1 ELSE 0 END AS skip_count,
					CASE WHEN event_type = ? THEN 1 ELSE 0 END AS partial_count
				FROM play_events
				UNION ALL
				SELECT
					track_id,
					played_ms,
					complete_count,
					skip_count,
					partial_count
				FROM play_stats_daily
			) AS metrics
			GROUP BY track_id
		)
		SELECT
			COALESCE(NULLIF(TRIM(t.artist), ''), 'Unknown Artist') AS artist_name,
			COALESCE(SUM(tm.played_ms), 0) AS played_ms,
			COUNT(DISTINCT t.id) AS track_count
		FROM track_metrics tm
		JOIN tracks t ON t.id = tm.track_id
		JOIN files f ON f.id = t.file_id
		WHERE f.file_exists = 1
		GROUP BY artist_name
		HAVING COALESCE(SUM(tm.played_ms), 0) > 0
		ORDER BY played_ms DESC, LOWER(artist_name)
		LIMIT ?
	`, EventHeartbeat, EventComplete, EventSkip, EventPartial, limit)
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

func (s *Service) maybeCompact(reference time.Time) {
	if s.db == nil {
		return
	}

	now := reference.UTC()

	s.mu.Lock()
	if s.compactionRunning {
		s.mu.Unlock()
		return
	}
	if !s.lastCompactionAt.IsZero() && now.Sub(s.lastCompactionAt) < compactionCheckInterval {
		s.mu.Unlock()
		return
	}

	s.compactionRunning = true
	s.lastCompactionAt = now
	s.mu.Unlock()

	s.compactOldEvents(now)

	s.mu.Lock()
	s.compactionRunning = false
	s.mu.Unlock()
}

func (s *Service) compactOldEvents(reference time.Time) {
	if s.db == nil {
		return
	}

	cutoff := startOfUTCDay(reference).AddDate(0, 0, -rawEventRetentionDays)
	cutoffTimestamp := cutoff.Format(time.RFC3339)
	updatedAt := reference.UTC().Format(time.RFC3339)

	ctx := context.Background()
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return
	}

	defer func() {
		_ = tx.Rollback()
	}()

	if _, err := tx.ExecContext(ctx, `
		INSERT INTO play_stats_daily(
			day,
			track_id,
			played_ms,
			heartbeat_count,
			complete_count,
			skip_count,
			partial_count,
			updated_at
		)
		SELECT
			substr(ts, 1, 10) AS day,
			track_id,
			COALESCE(SUM(CASE WHEN event_type = ? THEN COALESCE(position_ms, 0) ELSE 0 END), 0) AS played_ms,
			COALESCE(SUM(CASE WHEN event_type = ? THEN 1 ELSE 0 END), 0) AS heartbeat_count,
			COALESCE(SUM(CASE WHEN event_type = ? THEN 1 ELSE 0 END), 0) AS complete_count,
			COALESCE(SUM(CASE WHEN event_type = ? THEN 1 ELSE 0 END), 0) AS skip_count,
			COALESCE(SUM(CASE WHEN event_type = ? THEN 1 ELSE 0 END), 0) AS partial_count,
			? AS updated_at
		FROM play_events
		WHERE ts < ?
		GROUP BY day, track_id
		ON CONFLICT(day, track_id) DO UPDATE SET
			played_ms = excluded.played_ms,
			heartbeat_count = excluded.heartbeat_count,
			complete_count = excluded.complete_count,
			skip_count = excluded.skip_count,
			partial_count = excluded.partial_count,
			updated_at = excluded.updated_at
	`,
		EventHeartbeat,
		EventHeartbeat,
		EventComplete,
		EventSkip,
		EventPartial,
		updatedAt,
		cutoffTimestamp,
	); err != nil {
		return
	}

	if _, err := tx.ExecContext(ctx, `DELETE FROM play_events WHERE ts < ?`, cutoffTimestamp); err != nil {
		return
	}

	_ = tx.Commit()
}

func startOfUTCDay(value time.Time) time.Time {
	utcValue := value.UTC()
	return time.Date(utcValue.Year(), utcValue.Month(), utcValue.Day(), 0, 0, 0, 0, time.UTC)
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

func classifyTrackEnd(effectivePlayedMS int, positionMS int, durationMS int) string {
	if effectivePlayedMS < 0 {
		effectivePlayedMS = 0
	}
	if positionMS < 0 {
		positionMS = 0
	}

	if effectivePlayedMS == 0 {
		if positionMS == 0 {
			return ""
		}
		effectivePlayedMS = positionMS
	}

	if effectivePlayedMS < playedThresholdMS {
		return EventSkip
	}

	if durationMS <= 0 {
		if effectivePlayedMS < skipThresholdMS {
			return EventSkip
		}
		return EventPartial
	}

	completeFloor := minimumListenForComplete(durationMS)
	completePercent := completePercentByDuration(durationMS)
	remainingAllowance := remainingWindowMS(durationMS)

	remaining := durationMS - effectivePlayedMS
	if remaining < 0 {
		remaining = 0
	}

	completeByPercent := (effectivePlayedMS * 100) >= (durationMS * completePercent)
	completeByTail := remaining <= remainingAllowance

	if effectivePlayedMS >= completeFloor && (completeByPercent || completeByTail) {
		return EventComplete
	}

	skipThreshold := minInt(skipThresholdMS, percentOf(durationMS, 20))
	if effectivePlayedMS < skipThreshold {
		return EventSkip
	}

	return EventPartial
}

func minimumListenForComplete(durationMS int) int {
	return minInt(antiSeekCapMS, percentOf(durationMS, antiSeekPercent))
}

func completePercentByDuration(durationMS int) int {
	switch {
	case durationMS <= shortTrackBoundaryMS:
		return shortTrackCompletePercent
	case durationMS <= mediumTrackBoundaryMS:
		return mediumTrackCompletePercent
	default:
		return longTrackCompletePercent
	}
}

func remainingWindowMS(durationMS int) int {
	return clampInt(percentOf(durationMS, completeTailPercent), completeTailMinMS, completeTailMaxMS)
}

func percentOf(value int, percent int) int {
	if value <= 0 || percent <= 0 {
		return 0
	}

	return (value * percent) / 100
}

func minInt(a int, b int) int {
	if a <= b {
		return a
	}

	return b
}

func clampInt(value int, minimum int, maximum int) int {
	if value < minimum {
		return minimum
	}
	if value > maximum {
		return maximum
	}

	return value
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
