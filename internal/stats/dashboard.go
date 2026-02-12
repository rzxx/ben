package stats

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

const DashboardRangeShort = "short"

const DashboardRangeMid = "mid"

const DashboardRangeLong = "long"

const dashboardShortDays = 30

const dashboardMidDays = 180

const dashboardBehaviorWindowDays = 30

const dashboardSessionGap = 20 * time.Minute

type Dashboard struct {
	Range              string             `json:"range"`
	WindowStart        *string            `json:"windowStart,omitempty"`
	GeneratedAt        string             `json:"generatedAt"`
	Summary            DashboardSummary   `json:"summary"`
	Quality            DashboardQuality   `json:"quality"`
	Discovery          DashboardDiscovery `json:"discovery"`
	Streak             ListeningStreak    `json:"streak"`
	Heatmap            []HeatmapDay       `json:"heatmap"`
	TopTracks          []TrackStat        `json:"topTracks"`
	TopArtists         []ArtistStat       `json:"topArtists"`
	TopAlbums          []AlbumStat        `json:"topAlbums"`
	TopGenres          []GenreStat        `json:"topGenres"`
	ReplayTracks       []ReplayTrackStat  `json:"replayTracks"`
	HourlyProfile      []HourStat         `json:"hourlyProfile"`
	WeekdayProfile     []WeekdayStat      `json:"weekdayProfile"`
	PeakHour           int                `json:"peakHour"`
	PeakWeekday        int                `json:"peakWeekday"`
	Session            SessionStats       `json:"session"`
	BehaviorWindowDays int                `json:"behaviorWindowDays"`
}

type DashboardSummary struct {
	TotalPlayedMS   int     `json:"totalPlayedMs"`
	TotalPlays      int     `json:"totalPlays"`
	TracksPlayed    int     `json:"tracksPlayed"`
	ArtistsPlayed   int     `json:"artistsPlayed"`
	AlbumsPlayed    int     `json:"albumsPlayed"`
	CompleteCount   int     `json:"completeCount"`
	SkipCount       int     `json:"skipCount"`
	PartialCount    int     `json:"partialCount"`
	CompletionRate  float64 `json:"completionRate"`
	SkipRate        float64 `json:"skipRate"`
	PartialRate     float64 `json:"partialRate"`
	CompletionScore float64 `json:"completionScore"`
}

type DashboardQuality struct {
	Score float64 `json:"score"`
}

type DashboardDiscovery struct {
	UniqueTracks   int     `json:"uniqueTracks"`
	ReplayPlays    int     `json:"replayPlays"`
	DiscoveryRatio float64 `json:"discoveryRatio"`
	ReplayRatio    float64 `json:"replayRatio"`
	Score          float64 `json:"score"`
}

type ListeningStreak struct {
	CurrentDays int     `json:"currentDays"`
	LongestDays int     `json:"longestDays"`
	LastActive  *string `json:"lastActive,omitempty"`
}

type HeatmapDay struct {
	Day       string `json:"day"`
	PlayedMS  int    `json:"playedMs"`
	PlayCount int    `json:"playCount"`
}

type AlbumStat struct {
	Title       string  `json:"title"`
	AlbumArtist string  `json:"albumArtist"`
	PlayedMS    int     `json:"playedMs"`
	PlayCount   int     `json:"playCount"`
	TrackCount  int     `json:"trackCount"`
	CoverPath   *string `json:"coverPath,omitempty"`
}

type GenreStat struct {
	Genre      string `json:"genre"`
	PlayedMS   int    `json:"playedMs"`
	PlayCount  int    `json:"playCount"`
	TrackCount int    `json:"trackCount"`
}

type ReplayTrackStat struct {
	TrackID     int64   `json:"trackId"`
	Title       string  `json:"title"`
	Artist      string  `json:"artist"`
	Album       string  `json:"album"`
	CoverPath   *string `json:"coverPath,omitempty"`
	PlayedMS    int     `json:"playedMs"`
	TotalPlays  int     `json:"totalPlays"`
	UniqueDays  int     `json:"uniqueDays"`
	PlaysPerDay float64 `json:"playsPerDay"`
}

type HourStat struct {
	Hour     int     `json:"hour"`
	PlayedMS int     `json:"playedMs"`
	Share    float64 `json:"share"`
}

type WeekdayStat struct {
	Weekday  int     `json:"weekday"`
	Label    string  `json:"label"`
	PlayedMS int     `json:"playedMs"`
	Share    float64 `json:"share"`
}

type SessionStats struct {
	SessionCount    int `json:"sessionCount"`
	TotalPlayedMS   int `json:"totalPlayedMs"`
	AveragePlayedMS int `json:"averagePlayedMs"`
	LongestPlayedMS int `json:"longestPlayedMs"`
}

type dashboardQueryer interface {
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

const unknownArtistLabel = "Unknown Artist"

const unknownAlbumLabel = "Unknown Album"

const unknownGenreLabel = "Unknown Genre"

func normalizedLabelExpr(expression string, fallback string) string {
	return fmt.Sprintf("COALESCE(NULLIF(TRIM(%s), ''), '%s')", expression, fallback)
}

func normalizedKeyExpr(expression string, fallback string) string {
	return fmt.Sprintf("LOWER(%s)", normalizedLabelExpr(expression, fallback))
}

func artistLabelExpr(trackAlias string) string {
	return normalizedLabelExpr(trackAlias+".artist", unknownArtistLabel)
}

func artistKeyExpr(trackAlias string) string {
	return normalizedKeyExpr(trackAlias+".artist", unknownArtistLabel)
}

func albumTitleLabelExpr(trackAlias string) string {
	return normalizedLabelExpr(trackAlias+".album", unknownAlbumLabel)
}

func albumTitleKeyExpr(trackAlias string) string {
	return normalizedKeyExpr(trackAlias+".album", unknownAlbumLabel)
}

func albumArtistLabelExpr(trackAlias string) string {
	return fmt.Sprintf("COALESCE(NULLIF(TRIM(%s.album_artist), ''), %s)", trackAlias, artistLabelExpr(trackAlias))
}

func albumArtistKeyExpr(trackAlias string) string {
	return fmt.Sprintf("LOWER(%s)", albumArtistLabelExpr(trackAlias))
}

func genreLabelExpr(trackAlias string) string {
	return normalizedLabelExpr(trackAlias+".genre", unknownGenreLabel)
}

func genreKeyExpr(trackAlias string) string {
	return normalizedKeyExpr(trackAlias+".genre", unknownGenreLabel)
}

func (s *Service) GetDashboard(rangeKey string, limit int) (Dashboard, error) {
	if s.db == nil {
		return Dashboard{}, nil
	}

	s.maybeCompact(time.Now().UTC())

	now := time.Now().UTC()
	rangeName, rangeStart := normalizeDashboardRange(rangeKey, now)
	normalizedLimit := normalizeTopLimit(limit)

	dashboard := Dashboard{
		Range:              rangeName,
		GeneratedAt:        now.Format(time.RFC3339),
		Heatmap:            make([]HeatmapDay, 0, dashboardShortDays),
		TopTracks:          make([]TrackStat, 0, normalizedLimit),
		TopArtists:         make([]ArtistStat, 0, normalizedLimit),
		TopAlbums:          make([]AlbumStat, 0, normalizedLimit),
		TopGenres:          make([]GenreStat, 0, normalizedLimit),
		ReplayTracks:       make([]ReplayTrackStat, 0, normalizedLimit),
		HourlyProfile:      make([]HourStat, 0, 24),
		WeekdayProfile:     make([]WeekdayStat, 0, 7),
		PeakHour:           -1,
		PeakWeekday:        -1,
		BehaviorWindowDays: dashboardBehaviorWindowDays,
	}
	if rangeStart != nil {
		windowStart := rangeStart.Format(dayKeyLayout)
		dashboard.WindowStart = &windowStart
	}

	ctx := context.Background()
	tx, err := s.db.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
	if err != nil {
		return Dashboard{}, err
	}
	defer func() {
		_ = tx.Rollback()
	}()

	summary, err := s.readDashboardSummary(ctx, tx, rangeStart)
	if err != nil {
		return Dashboard{}, err
	}
	dashboard.Summary = summary
	dashboard.Quality = DashboardQuality{Score: summary.CompletionScore}
	dashboard.Discovery = buildDiscovery(summary)

	tracks, err := s.readDashboardTopTracks(ctx, tx, rangeStart, normalizedLimit)
	if err != nil {
		return Dashboard{}, err
	}
	dashboard.TopTracks = tracks

	artists, err := s.readDashboardTopArtists(ctx, tx, rangeStart, normalizedLimit)
	if err != nil {
		return Dashboard{}, err
	}
	dashboard.TopArtists = artists

	albums, err := s.readDashboardTopAlbums(ctx, tx, rangeStart, normalizedLimit)
	if err != nil {
		return Dashboard{}, err
	}
	dashboard.TopAlbums = albums

	genres, err := s.readDashboardTopGenres(ctx, tx, rangeStart, normalizedLimit)
	if err != nil {
		return Dashboard{}, err
	}
	dashboard.TopGenres = genres

	replays, err := s.readDashboardReplayTracks(ctx, tx, rangeStart, normalizedLimit)
	if err != nil {
		return Dashboard{}, err
	}
	dashboard.ReplayTracks = replays

	streak, err := s.readListeningStreak(ctx, tx)
	if err != nil {
		return Dashboard{}, err
	}
	dashboard.Streak = streak

	heatmap, err := s.readHeatmap(ctx, tx, now)
	if err != nil {
		return Dashboard{}, err
	}
	dashboard.Heatmap = heatmap

	hourly, peakHour, err := s.readHourlyProfile(ctx, tx, now)
	if err != nil {
		return Dashboard{}, err
	}
	dashboard.HourlyProfile = hourly
	dashboard.PeakHour = peakHour

	weekday, peakWeekday, err := s.readWeekdayProfile(ctx, tx, now)
	if err != nil {
		return Dashboard{}, err
	}
	dashboard.WeekdayProfile = weekday
	dashboard.PeakWeekday = peakWeekday

	sessionStats, err := s.readSessionStats(ctx, tx, now)
	if err != nil {
		return Dashboard{}, err
	}
	dashboard.Session = sessionStats

	if commitErr := tx.Commit(); commitErr != nil {
		return Dashboard{}, commitErr
	}

	return dashboard, nil
}

func (s *Service) readDashboardSummary(ctx context.Context, queryer dashboardQueryer, rangeStart *time.Time) (DashboardSummary, error) {
	args := trackMetricsArgs(rangeStart)
	artistKey := artistKeyExpr("t")
	albumTitleKey := albumTitleKeyExpr("t")
	albumArtistKey := albumArtistKeyExpr("t")

	query := trackMetricsCTE() + fmt.Sprintf(`
		, normalized_tracks AS (
			SELECT
				t.id AS track_id,
				tm.played_ms,
				tm.complete_count,
				tm.skip_count,
				tm.partial_count,
				%s AS artist_key,
				%s AS album_title_key,
				%s AS album_artist_key
			FROM track_metrics tm
			JOIN tracks t ON t.id = tm.track_id
			JOIN files f ON f.id = t.file_id
			WHERE
				f.file_exists = 1
				AND (
					tm.played_ms > 0
					OR tm.complete_count > 0
					OR tm.skip_count > 0
					OR tm.partial_count > 0
				)
		)
		SELECT
			COALESCE(SUM(nt.played_ms), 0) AS total_played_ms,
			COALESCE(SUM(nt.complete_count + nt.skip_count + nt.partial_count), 0) AS total_plays,
			COUNT(DISTINCT CASE WHEN (nt.complete_count + nt.skip_count + nt.partial_count) > 0 THEN nt.track_id END) AS tracks_played,
			COUNT(DISTINCT CASE WHEN (nt.complete_count + nt.skip_count + nt.partial_count) > 0 THEN nt.artist_key END) AS artists_played,
			COUNT(DISTINCT CASE WHEN (nt.complete_count + nt.skip_count + nt.partial_count) > 0 THEN nt.album_title_key || '|' || nt.album_artist_key END) AS albums_played,
			COALESCE(SUM(nt.complete_count), 0) AS complete_count,
			COALESCE(SUM(nt.skip_count), 0) AS skip_count,
			COALESCE(SUM(nt.partial_count), 0) AS partial_count
		FROM normalized_tracks nt
	`, artistKey, albumTitleKey, albumArtistKey)

	summary := DashboardSummary{}
	if err := queryer.QueryRowContext(ctx, query, args...).Scan(
		&summary.TotalPlayedMS,
		&summary.TotalPlays,
		&summary.TracksPlayed,
		&summary.ArtistsPlayed,
		&summary.AlbumsPlayed,
		&summary.CompleteCount,
		&summary.SkipCount,
		&summary.PartialCount,
	); err != nil {
		return DashboardSummary{}, err
	}

	totalPlays := float64(summary.TotalPlays)
	if totalPlays > 0 {
		summary.CompletionRate = float64(summary.CompleteCount) * 100 / totalPlays
		summary.SkipRate = float64(summary.SkipCount) * 100 / totalPlays
		summary.PartialRate = float64(summary.PartialCount) * 100 / totalPlays
	}

	summary.CompletionScore = completionScore(summary.CompleteCount, summary.PartialCount, summary.SkipCount)
	return summary, nil
}

func (s *Service) readDashboardTopTracks(ctx context.Context, queryer dashboardQueryer, rangeStart *time.Time, limit int) ([]TrackStat, error) {
	args := append(trackMetricsArgs(rangeStart), limit)

	query := trackMetricsCTE() + `
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
		ORDER BY tm.played_ms DESC, tm.complete_count DESC, tm.partial_count DESC, tm.skip_count ASC, LOWER(track_title)
		LIMIT ?
	`

	rows, err := queryer.QueryContext(ctx, query, args...)
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

func (s *Service) readDashboardTopArtists(ctx context.Context, queryer dashboardQueryer, rangeStart *time.Time, limit int) ([]ArtistStat, error) {
	args := append(trackMetricsArgs(rangeStart), limit)
	artistLabel := artistLabelExpr("t")
	artistKey := artistKeyExpr("t")

	query := trackMetricsCTE() + fmt.Sprintf(`
		, normalized_tracks AS (
			SELECT
				t.id AS track_id,
				tm.played_ms,
				tm.complete_count,
				tm.skip_count,
				tm.partial_count,
				%s AS artist_label,
				%s AS artist_key
			FROM track_metrics tm
			JOIN tracks t ON t.id = tm.track_id
			JOIN files f ON f.id = t.file_id
			WHERE f.file_exists = 1
		)
		SELECT
			MIN(nt.artist_label) AS artist_name,
			COALESCE(SUM(nt.played_ms), 0) AS played_ms,
			COUNT(DISTINCT CASE WHEN (nt.complete_count + nt.skip_count + nt.partial_count) > 0 THEN nt.track_id END) AS track_count
		FROM normalized_tracks nt
		GROUP BY nt.artist_key
		HAVING COALESCE(SUM(nt.played_ms), 0) > 0 OR COALESCE(SUM(nt.complete_count + nt.skip_count + nt.partial_count), 0) > 0
		ORDER BY played_ms DESC, LOWER(artist_name)
		LIMIT ?
	`, artistLabel, artistKey)

	rows, err := queryer.QueryContext(ctx, query, args...)
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

func (s *Service) readDashboardTopAlbums(ctx context.Context, queryer dashboardQueryer, rangeStart *time.Time, limit int) ([]AlbumStat, error) {
	args := append(trackMetricsArgs(rangeStart), limit)
	albumTitleLabel := albumTitleLabelExpr("t")
	albumTitleKey := albumTitleKeyExpr("t")
	albumArtistLabel := albumArtistLabelExpr("t")
	albumArtistKey := albumArtistKeyExpr("t")

	query := trackMetricsCTE() + fmt.Sprintf(`
		, normalized_tracks AS (
			SELECT
				t.id AS track_id,
				tm.played_ms,
				tm.complete_count,
				tm.skip_count,
				tm.partial_count,
				%s AS album_title_label,
				%s AS album_title_key,
				%s AS album_artist_label,
				%s AS album_artist_key,
				cover.cache_path AS cover_path
			FROM track_metrics tm
			JOIN tracks t ON t.id = tm.track_id
			JOIN files f ON f.id = t.file_id
			LEFT JOIN album_tracks at ON at.track_id = t.id
			LEFT JOIN albums a ON a.id = at.album_id
			LEFT JOIN covers cover ON cover.id = a.cover_id
			WHERE f.file_exists = 1
		)
		SELECT
			MIN(nt.album_title_label) AS album_title,
			MIN(nt.album_artist_label) AS album_artist_name,
			MIN(nt.cover_path) AS cover_path,
			COALESCE(SUM(nt.played_ms), 0) AS played_ms,
			COALESCE(SUM(nt.complete_count + nt.skip_count + nt.partial_count), 0) AS play_count,
			COUNT(DISTINCT nt.track_id) AS track_count
		FROM normalized_tracks nt
		GROUP BY nt.album_title_key, nt.album_artist_key
		HAVING COALESCE(SUM(nt.played_ms), 0) > 0 OR COALESCE(SUM(nt.complete_count + nt.skip_count + nt.partial_count), 0) > 0
		ORDER BY
			played_ms DESC,
			play_count DESC,
			LOWER(album_title),
			LOWER(album_artist_name)
		LIMIT ?
	`, albumTitleLabel, albumTitleKey, albumArtistLabel, albumArtistKey)

	rows, err := queryer.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	albums := make([]AlbumStat, 0, limit)
	for rows.Next() {
		var item AlbumStat
		var coverPath sql.NullString
		if scanErr := rows.Scan(
			&item.Title,
			&item.AlbumArtist,
			&coverPath,
			&item.PlayedMS,
			&item.PlayCount,
			&item.TrackCount,
		); scanErr != nil {
			return nil, scanErr
		}
		item.CoverPath = nullableStringPointer(coverPath)
		albums = append(albums, item)
	}

	if rowsErr := rows.Err(); rowsErr != nil {
		return nil, rowsErr
	}

	return albums, nil
}

func (s *Service) readDashboardTopGenres(ctx context.Context, queryer dashboardQueryer, rangeStart *time.Time, limit int) ([]GenreStat, error) {
	args := append(trackMetricsArgs(rangeStart), limit)
	genreLabel := genreLabelExpr("t")
	genreKey := genreKeyExpr("t")

	query := trackMetricsCTE() + fmt.Sprintf(`
		, normalized_tracks AS (
			SELECT
				t.id AS track_id,
				tm.played_ms,
				tm.complete_count,
				tm.skip_count,
				tm.partial_count,
				%s AS genre_label,
				%s AS genre_key
			FROM track_metrics tm
			JOIN tracks t ON t.id = tm.track_id
			JOIN files f ON f.id = t.file_id
			WHERE f.file_exists = 1
		)
		SELECT
			MIN(nt.genre_label) AS genre_name,
			COALESCE(SUM(nt.played_ms), 0) AS played_ms,
			COALESCE(SUM(nt.complete_count + nt.skip_count + nt.partial_count), 0) AS play_count,
			COUNT(DISTINCT nt.track_id) AS track_count
		FROM normalized_tracks nt
		GROUP BY nt.genre_key
		HAVING COALESCE(SUM(nt.played_ms), 0) > 0 OR COALESCE(SUM(nt.complete_count + nt.skip_count + nt.partial_count), 0) > 0
		ORDER BY played_ms DESC, play_count DESC, LOWER(genre_name)
		LIMIT ?
	`, genreLabel, genreKey)

	rows, err := queryer.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	genres := make([]GenreStat, 0, limit)
	for rows.Next() {
		var item GenreStat
		if scanErr := rows.Scan(&item.Genre, &item.PlayedMS, &item.PlayCount, &item.TrackCount); scanErr != nil {
			return nil, scanErr
		}
		genres = append(genres, item)
	}

	if rowsErr := rows.Err(); rowsErr != nil {
		return nil, rowsErr
	}

	return genres, nil
}

func (s *Service) readDashboardReplayTracks(ctx context.Context, queryer dashboardQueryer, rangeStart *time.Time, limit int) ([]ReplayTrackStat, error) {
	args := append(dayTrackMetricsArgs(rangeStart), limit)

	query := dayTrackMetricsCTE() + `
		, replay_metrics AS (
			SELECT
				track_id,
				COALESCE(SUM(played_ms), 0) AS played_ms,
				COALESCE(SUM(play_count), 0) AS total_plays,
				COUNT(DISTINCT CASE WHEN play_count > 0 THEN day END) AS unique_days
			FROM merged_day_track_metrics
			GROUP BY track_id
			HAVING COALESCE(SUM(play_count), 0) > 1
		)
		SELECT
			t.id,
			COALESCE(NULLIF(TRIM(t.title), ''), 'Unknown Title') AS track_title,
			COALESCE(NULLIF(TRIM(t.artist), ''), 'Unknown Artist') AS track_artist,
			COALESCE(NULLIF(TRIM(t.album), ''), 'Unknown Album') AS track_album,
			cover.cache_path,
			rm.played_ms,
			rm.total_plays,
			rm.unique_days,
			CASE WHEN rm.unique_days <= 0 THEN 0 ELSE CAST(rm.total_plays AS REAL) / CAST(rm.unique_days AS REAL) END AS plays_per_day
		FROM replay_metrics rm
		JOIN tracks t ON t.id = rm.track_id
		JOIN files f ON f.id = t.file_id
		LEFT JOIN covers cover ON cover.source_file_id = t.file_id
		WHERE f.file_exists = 1
		ORDER BY plays_per_day DESC, rm.total_plays DESC, rm.played_ms DESC, LOWER(track_title)
		LIMIT ?
	`

	rows, err := queryer.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	tracks := make([]ReplayTrackStat, 0, limit)
	for rows.Next() {
		var item ReplayTrackStat
		var coverPath sql.NullString
		if scanErr := rows.Scan(
			&item.TrackID,
			&item.Title,
			&item.Artist,
			&item.Album,
			&coverPath,
			&item.PlayedMS,
			&item.TotalPlays,
			&item.UniqueDays,
			&item.PlaysPerDay,
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

func (s *Service) readListeningStreak(ctx context.Context, queryer dashboardQueryer) (ListeningStreak, error) {
	query := dayMetricsCTE() + `
		SELECT day, played_ms, (complete_count + skip_count + partial_count) AS play_count
		FROM merged_day_metrics
		WHERE played_ms > 0 OR (complete_count + skip_count + partial_count) > 0
		ORDER BY day ASC
	`

	rows, err := queryer.QueryContext(ctx, query, dayMetricsArgs(nil)...)
	if err != nil {
		return ListeningStreak{}, err
	}
	defer rows.Close()

	activeDays := make(map[string]struct{})
	orderedDays := make([]time.Time, 0)
	var lastActive *string

	for rows.Next() {
		var day string
		var playedMS int
		var playCount int
		if scanErr := rows.Scan(&day, &playedMS, &playCount); scanErr != nil {
			return ListeningStreak{}, scanErr
		}
		if playedMS <= 0 && playCount <= 0 {
			continue
		}

		parsedDay, parseErr := time.Parse(dayKeyLayout, day)
		if parseErr != nil {
			continue
		}

		activeDays[day] = struct{}{}
		orderedDays = append(orderedDays, parsedDay.UTC())
		dayCopy := day
		lastActive = &dayCopy
	}

	if rowsErr := rows.Err(); rowsErr != nil {
		return ListeningStreak{}, rowsErr
	}

	longestStreak := 0
	currentRun := 0
	var previousDay time.Time
	for _, day := range orderedDays {
		if previousDay.IsZero() || day.Sub(previousDay) == 24*time.Hour {
			currentRun++
		} else {
			currentRun = 1
		}
		if currentRun > longestStreak {
			longestStreak = currentRun
		}
		previousDay = day
	}

	today := startOfUTCDay(time.Now().UTC())
	currentStreak := 0
	for {
		dayKey := today.Format(dayKeyLayout)
		if _, ok := activeDays[dayKey]; !ok {
			break
		}
		currentStreak++
		today = today.AddDate(0, 0, -1)
	}

	return ListeningStreak{
		CurrentDays: currentStreak,
		LongestDays: longestStreak,
		LastActive:  lastActive,
	}, nil
}

func (s *Service) readHeatmap(ctx context.Context, queryer dashboardQueryer, reference time.Time) ([]HeatmapDay, error) {
	start := startOfUTCDay(reference).AddDate(0, 0, -(dashboardShortDays - 1))
	args := append(dayMetricsArgs(&start), start.Format(dayKeyLayout))

	query := dayMetricsCTE() + `
		SELECT
			day,
			played_ms,
			(complete_count + skip_count + partial_count) AS play_count
		FROM merged_day_metrics
		WHERE day >= ?
		ORDER BY day ASC
	`

	rows, err := queryer.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	totalsByDay := make(map[string]HeatmapDay)
	for rows.Next() {
		var day string
		var playedMS int
		var playCount int
		if scanErr := rows.Scan(&day, &playedMS, &playCount); scanErr != nil {
			return nil, scanErr
		}
		totalsByDay[day] = HeatmapDay{Day: day, PlayedMS: playedMS, PlayCount: playCount}
	}

	if rowsErr := rows.Err(); rowsErr != nil {
		return nil, rowsErr
	}

	result := make([]HeatmapDay, 0, dashboardShortDays)
	for i := 0; i < dashboardShortDays; i++ {
		day := start.AddDate(0, 0, i).Format(dayKeyLayout)
		if entry, ok := totalsByDay[day]; ok {
			result = append(result, entry)
			continue
		}

		result = append(result, HeatmapDay{Day: day, PlayedMS: 0, PlayCount: 0})
	}

	return result, nil
}

func (s *Service) readHourlyProfile(ctx context.Context, queryer dashboardQueryer, reference time.Time) ([]HourStat, int, error) {
	since := reference.UTC().AddDate(0, 0, -dashboardBehaviorWindowDays).Format(time.RFC3339)

	rows, err := queryer.QueryContext(ctx, `
		SELECT
			CAST(strftime('%H', ts) AS INTEGER) AS hour,
			COALESCE(SUM(COALESCE(position_ms, 0)), 0) AS played_ms
		FROM play_events
		WHERE event_type = ? AND ts >= ?
		GROUP BY hour
	`, EventHeartbeat, since)
	if err != nil {
		return nil, -1, err
	}
	defer rows.Close()

	hourBuckets := make([]int, 24)
	totalPlayed := 0
	for rows.Next() {
		var hour int
		var playedMS int
		if scanErr := rows.Scan(&hour, &playedMS); scanErr != nil {
			return nil, -1, scanErr
		}
		if hour < 0 || hour >= len(hourBuckets) {
			continue
		}
		hourBuckets[hour] = playedMS
		totalPlayed += playedMS
	}

	if rowsErr := rows.Err(); rowsErr != nil {
		return nil, -1, rowsErr
	}

	peakHour := -1
	peakPlayed := -1
	profile := make([]HourStat, 0, 24)
	for hour, playedMS := range hourBuckets {
		share := 0.0
		if totalPlayed > 0 {
			share = float64(playedMS) * 100 / float64(totalPlayed)
		}
		profile = append(profile, HourStat{Hour: hour, PlayedMS: playedMS, Share: share})

		if playedMS > peakPlayed {
			peakPlayed = playedMS
			peakHour = hour
		}
	}

	if peakPlayed <= 0 {
		peakHour = -1
	}

	return profile, peakHour, nil
}

func (s *Service) readWeekdayProfile(ctx context.Context, queryer dashboardQueryer, reference time.Time) ([]WeekdayStat, int, error) {
	since := reference.UTC().AddDate(0, 0, -dashboardBehaviorWindowDays).Format(time.RFC3339)

	rows, err := queryer.QueryContext(ctx, `
		SELECT
			CAST(strftime('%w', ts) AS INTEGER) AS weekday,
			COALESCE(SUM(COALESCE(position_ms, 0)), 0) AS played_ms
		FROM play_events
		WHERE event_type = ? AND ts >= ?
		GROUP BY weekday
	`, EventHeartbeat, since)
	if err != nil {
		return nil, -1, err
	}
	defer rows.Close()

	weekdayBuckets := make([]int, 7)
	totalPlayed := 0
	for rows.Next() {
		var weekday int
		var playedMS int
		if scanErr := rows.Scan(&weekday, &playedMS); scanErr != nil {
			return nil, -1, scanErr
		}
		if weekday < 0 || weekday >= len(weekdayBuckets) {
			continue
		}
		weekdayBuckets[weekday] = playedMS
		totalPlayed += playedMS
	}

	if rowsErr := rows.Err(); rowsErr != nil {
		return nil, -1, rowsErr
	}

	weekdayLabels := []string{"Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"}
	peakWeekday := -1
	peakPlayed := -1
	profile := make([]WeekdayStat, 0, 7)
	for weekday, playedMS := range weekdayBuckets {
		share := 0.0
		if totalPlayed > 0 {
			share = float64(playedMS) * 100 / float64(totalPlayed)
		}
		label := ""
		if weekday >= 0 && weekday < len(weekdayLabels) {
			label = weekdayLabels[weekday]
		}
		profile = append(profile, WeekdayStat{
			Weekday:  weekday,
			Label:    label,
			PlayedMS: playedMS,
			Share:    share,
		})

		if playedMS > peakPlayed {
			peakPlayed = playedMS
			peakWeekday = weekday
		}
	}

	if peakPlayed <= 0 {
		peakWeekday = -1
	}

	return profile, peakWeekday, nil
}

func (s *Service) readSessionStats(ctx context.Context, queryer dashboardQueryer, reference time.Time) (SessionStats, error) {
	since := reference.UTC().AddDate(0, 0, -dashboardBehaviorWindowDays).Format(time.RFC3339)

	rows, err := queryer.QueryContext(ctx, `
		SELECT ts, COALESCE(position_ms, 0)
		FROM play_events
		WHERE event_type = ? AND ts >= ?
		ORDER BY ts ASC
	`, EventHeartbeat, since)
	if err != nil {
		return SessionStats{}, err
	}
	defer rows.Close()

	sessionDurations := make([]int, 0)
	currentSessionMS := 0
	var previousAt time.Time

	flushSession := func() {
		if currentSessionMS <= 0 {
			return
		}
		sessionDurations = append(sessionDurations, currentSessionMS)
		currentSessionMS = 0
	}

	for rows.Next() {
		var ts string
		var playedMS int
		if scanErr := rows.Scan(&ts, &playedMS); scanErr != nil {
			return SessionStats{}, scanErr
		}

		at, ok := parseTimestamp(ts)
		if !ok {
			continue
		}

		if playedMS < 0 {
			playedMS = 0
		}

		if !previousAt.IsZero() && at.Sub(previousAt) > dashboardSessionGap {
			flushSession()
		}

		currentSessionMS += playedMS
		previousAt = at
	}

	if rowsErr := rows.Err(); rowsErr != nil {
		return SessionStats{}, rowsErr
	}

	flushSession()

	stats := SessionStats{SessionCount: len(sessionDurations)}
	if len(sessionDurations) == 0 {
		return stats, nil
	}

	longest := 0
	total := 0
	for _, duration := range sessionDurations {
		total += duration
		if duration > longest {
			longest = duration
		}
	}

	stats.TotalPlayedMS = total
	stats.LongestPlayedMS = longest
	stats.AveragePlayedMS = total / len(sessionDurations)

	return stats, nil
}

func normalizeDashboardRange(value string, reference time.Time) (string, *time.Time) {
	now := startOfUTCDay(reference.UTC())
	switch value {
	case DashboardRangeMid:
		start := now.AddDate(0, 0, -(dashboardMidDays - 1))
		return DashboardRangeMid, &start
	case DashboardRangeLong:
		return DashboardRangeLong, nil
	default:
		start := now.AddDate(0, 0, -(dashboardShortDays - 1))
		return DashboardRangeShort, &start
	}
}

func trackMetricsArgs(rangeStart *time.Time) []any {
	args := []any{EventHeartbeat, EventComplete, EventSkip, EventPartial}
	return append(args, rangeArgs(rangeStart)...)
}

func dayMetricsArgs(rangeStart *time.Time) []any {
	args := []any{EventHeartbeat, EventComplete, EventSkip, EventPartial}
	return append(args, rangeArgs(rangeStart)...)
}

func dayTrackMetricsArgs(rangeStart *time.Time) []any {
	args := []any{EventHeartbeat, EventComplete, EventSkip, EventPartial}
	return append(args, rangeArgs(rangeStart)...)
}

func rangeArgs(rangeStart *time.Time) []any {
	startTS := ""
	startDay := ""
	if rangeStart != nil {
		utcStart := rangeStart.UTC()
		startTS = utcStart.Format(time.RFC3339)
		startDay = utcStart.Format(dayKeyLayout)
	}

	return []any{startTS, startTS, startDay, startDay}
}

func trackMetricsCTE() string {
	return `
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
					COALESCE(SUM(CASE WHEN event_type = ? THEN COALESCE(position_ms, 0) ELSE 0 END), 0) AS played_ms,
					COALESCE(SUM(CASE WHEN event_type = ? THEN 1 ELSE 0 END), 0) AS complete_count,
					COALESCE(SUM(CASE WHEN event_type = ? THEN 1 ELSE 0 END), 0) AS skip_count,
					COALESCE(SUM(CASE WHEN event_type = ? THEN 1 ELSE 0 END), 0) AS partial_count
				FROM play_events
				WHERE (? = '' OR ts >= ?)
				GROUP BY track_id
				UNION ALL
				SELECT
					track_id,
					COALESCE(SUM(played_ms), 0) AS played_ms,
					COALESCE(SUM(complete_count), 0) AS complete_count,
					COALESCE(SUM(skip_count), 0) AS skip_count,
					COALESCE(SUM(partial_count), 0) AS partial_count
				FROM play_stats_daily
				WHERE (? = '' OR day >= ?)
				GROUP BY track_id
			) AS metrics
			GROUP BY track_id
		)
	`
}

func dayMetricsCTE() string {
	return `
		WITH day_metrics AS (
			SELECT
				substr(ts, 1, 10) AS day,
				COALESCE(SUM(CASE WHEN event_type = ? THEN COALESCE(position_ms, 0) ELSE 0 END), 0) AS played_ms,
				COALESCE(SUM(CASE WHEN event_type = ? THEN 1 ELSE 0 END), 0) AS complete_count,
				COALESCE(SUM(CASE WHEN event_type = ? THEN 1 ELSE 0 END), 0) AS skip_count,
				COALESCE(SUM(CASE WHEN event_type = ? THEN 1 ELSE 0 END), 0) AS partial_count
			FROM play_events
			WHERE (? = '' OR ts >= ?)
			GROUP BY day
			UNION ALL
			SELECT
				day,
				COALESCE(SUM(played_ms), 0) AS played_ms,
				COALESCE(SUM(complete_count), 0) AS complete_count,
				COALESCE(SUM(skip_count), 0) AS skip_count,
				COALESCE(SUM(partial_count), 0) AS partial_count
			FROM play_stats_daily
			WHERE (? = '' OR day >= ?)
			GROUP BY day
		),
		merged_day_metrics AS (
			SELECT
				day,
				COALESCE(SUM(played_ms), 0) AS played_ms,
				COALESCE(SUM(complete_count), 0) AS complete_count,
				COALESCE(SUM(skip_count), 0) AS skip_count,
				COALESCE(SUM(partial_count), 0) AS partial_count
			FROM day_metrics
			GROUP BY day
		)
	`
}

func dayTrackMetricsCTE() string {
	return `
		WITH day_track_metrics AS (
			SELECT
				substr(ts, 1, 10) AS day,
				track_id,
				COALESCE(SUM(CASE WHEN event_type = ? THEN COALESCE(position_ms, 0) ELSE 0 END), 0) AS played_ms,
				(
					COALESCE(SUM(CASE WHEN event_type = ? THEN 1 ELSE 0 END), 0)
					+ COALESCE(SUM(CASE WHEN event_type = ? THEN 1 ELSE 0 END), 0)
					+ COALESCE(SUM(CASE WHEN event_type = ? THEN 1 ELSE 0 END), 0)
				) AS play_count
			FROM play_events
			WHERE (? = '' OR ts >= ?)
			GROUP BY day, track_id
			UNION ALL
			SELECT
				day,
				track_id,
				COALESCE(SUM(played_ms), 0) AS played_ms,
				COALESCE(SUM(complete_count + skip_count + partial_count), 0) AS play_count
			FROM play_stats_daily
			WHERE (? = '' OR day >= ?)
			GROUP BY day, track_id
		),
		merged_day_track_metrics AS (
			SELECT
				day,
				track_id,
				COALESCE(SUM(played_ms), 0) AS played_ms,
				COALESCE(SUM(play_count), 0) AS play_count
			FROM day_track_metrics
			GROUP BY day, track_id
		)
	`
}

func completionScore(complete int, partial int, skip int) float64 {
	total := complete + partial + skip
	if total <= 0 {
		return 0
	}

	totalF := float64(total)
	base := (float64(complete) + float64(partial)*0.35) * 100 / totalF
	skipPenalty := float64(skip) * 20 / totalF
	return clampFloat(base-skipPenalty, 0, 100)
}

func buildDiscovery(summary DashboardSummary) DashboardDiscovery {
	result := DashboardDiscovery{}
	result.UniqueTracks = summary.TracksPlayed

	if summary.TotalPlays <= 0 {
		return result
	}

	replayPlays := summary.TotalPlays - summary.TracksPlayed
	if replayPlays < 0 {
		replayPlays = 0
	}
	result.ReplayPlays = replayPlays

	result.DiscoveryRatio = float64(summary.TracksPlayed) * 100 / float64(summary.TotalPlays)
	result.ReplayRatio = float64(replayPlays) * 100 / float64(summary.TotalPlays)

	if summary.TotalPlays == 1 {
		result.Score = 100
		return result
	}

	numerator := float64(summary.TracksPlayed - 1)
	denominator := float64(summary.TotalPlays - 1)
	result.Score = clampFloat((numerator/denominator)*100, 0, 100)
	return result
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

func parseTimestamp(value string) (time.Time, bool) {
	if value == "" {
		return time.Time{}, false
	}
	if parsed, err := time.Parse(time.RFC3339Nano, value); err == nil {
		return parsed.UTC(), true
	}
	if parsed, err := time.Parse(time.RFC3339, value); err == nil {
		return parsed.UTC(), true
	}
	return time.Time{}, false
}
