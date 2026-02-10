package library

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
)

var ErrArtistNotFound = errors.New("artist not found")

var ErrAlbumNotFound = errors.New("album not found")

type PageInfo struct {
	Limit  int `json:"limit"`
	Offset int `json:"offset"`
	Total  int `json:"total"`
}

type ArtistSummary struct {
	Name       string `json:"name"`
	TrackCount int    `json:"trackCount"`
	AlbumCount int    `json:"albumCount"`
}

type AlbumSummary struct {
	Title       string  `json:"title"`
	AlbumArtist string  `json:"albumArtist"`
	Year        *int    `json:"year,omitempty"`
	TrackCount  int     `json:"trackCount"`
	CoverPath   *string `json:"coverPath,omitempty"`
}

type TrackSummary struct {
	ID          int64   `json:"id"`
	Title       string  `json:"title"`
	Artist      string  `json:"artist"`
	Album       string  `json:"album"`
	AlbumArtist string  `json:"albumArtist"`
	DiscNo      *int    `json:"discNo,omitempty"`
	TrackNo     *int    `json:"trackNo,omitempty"`
	DurationMS  *int    `json:"durationMs,omitempty"`
	Path        string  `json:"path"`
	CoverPath   *string `json:"coverPath,omitempty"`
}

type ArtistsPage struct {
	Items []ArtistSummary `json:"items"`
	Page  PageInfo        `json:"page"`
}

type AlbumsPage struct {
	Items []AlbumSummary `json:"items"`
	Page  PageInfo       `json:"page"`
}

type TracksPage struct {
	Items []TrackSummary `json:"items"`
	Page  PageInfo       `json:"page"`
}

type ArtistDetail struct {
	Name       string         `json:"name"`
	TrackCount int            `json:"trackCount"`
	AlbumCount int            `json:"albumCount"`
	Albums     []AlbumSummary `json:"albums"`
	Page       PageInfo       `json:"page"`
}

type AlbumDetail struct {
	Title       string         `json:"title"`
	AlbumArtist string         `json:"albumArtist"`
	Year        *int           `json:"year,omitempty"`
	TrackCount  int            `json:"trackCount"`
	CoverPath   *string        `json:"coverPath,omitempty"`
	Tracks      []TrackSummary `json:"tracks"`
	Page        PageInfo       `json:"page"`
}

type ArtistTopTrack struct {
	TrackID       int64   `json:"trackId"`
	Title         string  `json:"title"`
	Artist        string  `json:"artist"`
	Album         string  `json:"album"`
	AlbumArtist   string  `json:"albumArtist"`
	DiscNo        *int    `json:"discNo,omitempty"`
	TrackNo       *int    `json:"trackNo,omitempty"`
	DurationMS    *int    `json:"durationMs,omitempty"`
	Path          string  `json:"path"`
	CoverPath     *string `json:"coverPath,omitempty"`
	PlayedMS      int     `json:"playedMs"`
	CompleteCount int     `json:"completeCount"`
	SkipCount     int     `json:"skipCount"`
	PartialCount  int     `json:"partialCount"`
}

type BrowseRepository struct {
	db *sql.DB
}

const defaultBrowseLimit = 24

const defaultDetailLimit = 18

const maxBrowseLimit = 200

func NewBrowseRepository(database *sql.DB) *BrowseRepository {
	return &BrowseRepository{db: database}
}

func (r *BrowseRepository) ListArtists(ctx context.Context, search string, limit int, offset int) (ArtistsPage, error) {
	limit, offset = normalizePagination(limit, offset, defaultBrowseLimit)

	whereClauses := []string{"1 = 1"}
	args := make([]any, 0, 2)

	if pattern := makeSearchPattern(search); pattern != "" {
		whereClauses = append(whereClauses, "LOWER(a.name) LIKE ?")
		args = append(args, pattern)
	}

	whereSQL := strings.Join(whereClauses, " AND ")

	countQuery := fmt.Sprintf(`
		SELECT COUNT(1)
		FROM artists a
		WHERE %s
	`, whereSQL)

	var total int
	if err := r.db.QueryRowContext(ctx, countQuery, args...).Scan(&total); err != nil {
		return ArtistsPage{}, fmt.Errorf("count artists: %w", err)
	}

	listQuery := fmt.Sprintf(`
		SELECT
			a.name,
			COALESCE(track_totals.track_count, 0) AS track_count,
			COALESCE(album_totals.album_count, 0) AS album_count
		FROM artists a
		LEFT JOIN (
			SELECT
				COALESCE(NULLIF(TRIM(t.artist), ''), 'Unknown Artist') AS artist_name,
				COUNT(1) AS track_count
			FROM tracks t
			JOIN files f ON f.id = t.file_id
			WHERE f.file_exists = 1
			GROUP BY artist_name
		) track_totals ON LOWER(track_totals.artist_name) = LOWER(a.name)
		LEFT JOIN (
			SELECT
				COALESCE(NULLIF(TRIM(album_artist), ''), 'Unknown Artist') AS artist_name,
				COUNT(1) AS album_count
			FROM albums
			GROUP BY artist_name
		) album_totals ON LOWER(album_totals.artist_name) = LOWER(a.name)
		WHERE %s
		ORDER BY LOWER(COALESCE(NULLIF(TRIM(a.sort_name), ''), a.name)), LOWER(a.name)
		LIMIT ?
		OFFSET ?
	`, whereSQL)

	listArgs := append(cloneArgs(args), limit, offset)

	rows, err := r.db.QueryContext(ctx, listQuery, listArgs...)
	if err != nil {
		return ArtistsPage{}, fmt.Errorf("list artists: %w", err)
	}
	defer rows.Close()

	artists := make([]ArtistSummary, 0)
	for rows.Next() {
		var artist ArtistSummary
		if scanErr := rows.Scan(&artist.Name, &artist.TrackCount, &artist.AlbumCount); scanErr != nil {
			return ArtistsPage{}, fmt.Errorf("scan artist row: %w", scanErr)
		}
		artists = append(artists, artist)
	}

	if rowsErr := rows.Err(); rowsErr != nil {
		return ArtistsPage{}, fmt.Errorf("iterate artist rows: %w", rowsErr)
	}

	return ArtistsPage{
		Items: artists,
		Page: PageInfo{
			Limit:  limit,
			Offset: offset,
			Total:  total,
		},
	}, nil
}

func (r *BrowseRepository) ListAlbums(ctx context.Context, search string, artist string, limit int, offset int) (AlbumsPage, error) {
	limit, offset = normalizePagination(limit, offset, defaultBrowseLimit)

	whereClauses := []string{"1 = 1"}
	args := make([]any, 0, 8)

	if pattern := makeSearchPattern(search); pattern != "" {
		whereClauses = append(whereClauses, `(LOWER(COALESCE(NULLIF(TRIM(a.title), ''), 'Unknown Album')) LIKE ? OR LOWER(COALESCE(NULLIF(TRIM(a.album_artist), ''), 'Unknown Artist')) LIKE ?)`)
		args = append(args, pattern, pattern)
	}

	if artistFilter := strings.TrimSpace(artist); artistFilter != "" {
		whereClauses = append(whereClauses, "LOWER(COALESCE(NULLIF(TRIM(a.album_artist), ''), 'Unknown Artist')) = LOWER(?)")
		args = append(args, artistFilter)
	}

	whereSQL := strings.Join(whereClauses, " AND ")

	countQuery := fmt.Sprintf(`
		SELECT COUNT(1)
		FROM albums a
		WHERE %s
	`, whereSQL)

	var total int
	if err := r.db.QueryRowContext(ctx, countQuery, args...).Scan(&total); err != nil {
		return AlbumsPage{}, fmt.Errorf("count albums: %w", err)
	}

	listQuery := fmt.Sprintf(`
		SELECT
			COALESCE(NULLIF(TRIM(a.title), ''), 'Unknown Album') AS album_title,
			COALESCE(NULLIF(TRIM(a.album_artist), ''), 'Unknown Artist') AS album_artist_name,
			a.year,
			COALESCE(track_totals.track_count, 0) AS track_count,
			cover.cache_path
		FROM albums a
		LEFT JOIN (
			SELECT at.album_id, COUNT(1) AS track_count
			FROM album_tracks at
			JOIN tracks t ON t.id = at.track_id
			JOIN files f ON f.id = t.file_id
			WHERE f.file_exists = 1
			GROUP BY at.album_id
		) track_totals ON track_totals.album_id = a.id
		LEFT JOIN covers cover ON cover.id = a.cover_id
		WHERE %s
		ORDER BY LOWER(COALESCE(NULLIF(TRIM(a.album_artist), ''), 'Unknown Artist')), LOWER(COALESCE(NULLIF(TRIM(a.title), ''), 'Unknown Album'))
		LIMIT ?
		OFFSET ?
	`, whereSQL)

	listArgs := append(cloneArgs(args), limit, offset)

	rows, err := r.db.QueryContext(ctx, listQuery, listArgs...)
	if err != nil {
		return AlbumsPage{}, fmt.Errorf("list albums: %w", err)
	}
	defer rows.Close()

	albums := make([]AlbumSummary, 0)
	for rows.Next() {
		var album AlbumSummary
		var year sql.NullInt64
		var coverPath sql.NullString
		if scanErr := rows.Scan(&album.Title, &album.AlbumArtist, &year, &album.TrackCount, &coverPath); scanErr != nil {
			return AlbumsPage{}, fmt.Errorf("scan album row: %w", scanErr)
		}
		album.Year = intPointer(year)
		album.CoverPath = stringPointer(coverPath)
		albums = append(albums, album)
	}

	if rowsErr := rows.Err(); rowsErr != nil {
		return AlbumsPage{}, fmt.Errorf("iterate album rows: %w", rowsErr)
	}

	return AlbumsPage{
		Items: albums,
		Page: PageInfo{
			Limit:  limit,
			Offset: offset,
			Total:  total,
		},
	}, nil
}

func (r *BrowseRepository) ListTracks(ctx context.Context, search string, artist string, album string, limit int, offset int) (TracksPage, error) {
	limit, offset = normalizePagination(limit, offset, defaultBrowseLimit)

	whereClauses := []string{"f.file_exists = 1"}
	args := make([]any, 0, 10)

	if pattern := makeSearchPattern(search); pattern != "" {
		whereClauses = append(whereClauses, `(LOWER(COALESCE(NULLIF(TRIM(t.title), ''), 'Unknown Title')) LIKE ? OR LOWER(COALESCE(NULLIF(TRIM(t.artist), ''), 'Unknown Artist')) LIKE ? OR LOWER(COALESCE(NULLIF(TRIM(t.album), ''), 'Unknown Album')) LIKE ?)`)
		args = append(args, pattern, pattern, pattern)
	}

	if artistFilter := strings.TrimSpace(artist); artistFilter != "" {
		whereClauses = append(whereClauses, "LOWER(COALESCE(NULLIF(TRIM(t.artist), ''), 'Unknown Artist')) = LOWER(?)")
		args = append(args, artistFilter)
	}

	if albumFilter := strings.TrimSpace(album); albumFilter != "" {
		whereClauses = append(whereClauses, "LOWER(COALESCE(NULLIF(TRIM(t.album), ''), 'Unknown Album')) = LOWER(?)")
		args = append(args, albumFilter)
	}

	whereSQL := strings.Join(whereClauses, " AND ")

	countQuery := fmt.Sprintf(`
		SELECT COUNT(1)
		FROM tracks t
		JOIN files f ON f.id = t.file_id
		WHERE %s
	`, whereSQL)

	var total int
	if err := r.db.QueryRowContext(ctx, countQuery, args...).Scan(&total); err != nil {
		return TracksPage{}, fmt.Errorf("count tracks: %w", err)
	}

	listQuery := fmt.Sprintf(`
		SELECT
			t.id,
			COALESCE(NULLIF(TRIM(t.title), ''), 'Unknown Title') AS track_title,
			COALESCE(NULLIF(TRIM(t.artist), ''), 'Unknown Artist') AS track_artist,
			COALESCE(NULLIF(TRIM(t.album), ''), 'Unknown Album') AS track_album,
			COALESCE(NULLIF(TRIM(t.album_artist), ''), COALESCE(NULLIF(TRIM(t.artist), ''), 'Unknown Artist')) AS track_album_artist,
			t.disc_no,
			t.track_no,
			t.duration_ms,
			f.path,
			cover.cache_path
		FROM tracks t
		JOIN files f ON f.id = t.file_id
		LEFT JOIN covers cover ON cover.source_file_id = t.file_id
		WHERE %s
		ORDER BY
			LOWER(track_artist),
			LOWER(track_album),
			COALESCE(t.disc_no, 0),
			COALESCE(t.track_no, 0),
			LOWER(track_title)
		LIMIT ?
		OFFSET ?
	`, whereSQL)

	listArgs := append(cloneArgs(args), limit, offset)

	rows, err := r.db.QueryContext(ctx, listQuery, listArgs...)
	if err != nil {
		return TracksPage{}, fmt.Errorf("list tracks: %w", err)
	}
	defer rows.Close()

	tracks := make([]TrackSummary, 0)
	for rows.Next() {
		var track TrackSummary
		var discNo sql.NullInt64
		var trackNo sql.NullInt64
		var durationMS sql.NullInt64
		var coverPath sql.NullString
		if scanErr := rows.Scan(
			&track.ID,
			&track.Title,
			&track.Artist,
			&track.Album,
			&track.AlbumArtist,
			&discNo,
			&trackNo,
			&durationMS,
			&track.Path,
			&coverPath,
		); scanErr != nil {
			return TracksPage{}, fmt.Errorf("scan track row: %w", scanErr)
		}
		track.DiscNo = intPointer(discNo)
		track.TrackNo = intPointer(trackNo)
		track.DurationMS = intPointer(durationMS)
		track.CoverPath = stringPointer(coverPath)
		tracks = append(tracks, track)
	}

	if rowsErr := rows.Err(); rowsErr != nil {
		return TracksPage{}, fmt.Errorf("iterate track rows: %w", rowsErr)
	}

	return TracksPage{
		Items: tracks,
		Page: PageInfo{
			Limit:  limit,
			Offset: offset,
			Total:  total,
		},
	}, nil
}

func (r *BrowseRepository) GetArtistDetail(ctx context.Context, name string, limit int, offset int) (ArtistDetail, error) {
	artistName := strings.TrimSpace(name)
	if artistName == "" {
		return ArtistDetail{}, errors.New("artist name is required")
	}

	var trackCount int
	var albumCount int
	if err := r.db.QueryRowContext(ctx, `
		SELECT
			COUNT(1),
			COALESCE((
				SELECT COUNT(DISTINCT at.album_id)
				FROM album_tracks at
				JOIN tracks t2 ON t2.id = at.track_id
				JOIN files f2 ON f2.id = t2.file_id
				WHERE f2.file_exists = 1
				  AND LOWER(COALESCE(NULLIF(TRIM(t2.artist), ''), 'Unknown Artist')) = LOWER(?)
			), 0)
		FROM tracks t
		JOIN files f ON f.id = t.file_id
		WHERE f.file_exists = 1
		  AND LOWER(COALESCE(NULLIF(TRIM(t.artist), ''), 'Unknown Artist')) = LOWER(?)
	`, artistName, artistName).Scan(&trackCount, &albumCount); err != nil {
		return ArtistDetail{}, fmt.Errorf("get artist totals for %q: %w", artistName, err)
	}

	if trackCount == 0 {
		return ArtistDetail{}, ErrArtistNotFound
	}

	limit, offset = normalizePagination(limit, offset, defaultDetailLimit)

	rows, err := r.db.QueryContext(ctx, `
		SELECT
			COALESCE(NULLIF(TRIM(a.title), ''), 'Unknown Album') AS album_title,
			COALESCE(NULLIF(TRIM(a.album_artist), ''), 'Unknown Artist') AS album_artist_name,
			a.year,
			COUNT(1) AS track_count,
			cover.cache_path
		FROM albums a
		JOIN album_tracks at ON at.album_id = a.id
		JOIN tracks t ON t.id = at.track_id
		JOIN files f ON f.id = t.file_id
		LEFT JOIN covers cover ON cover.id = a.cover_id
		WHERE f.file_exists = 1
		  AND LOWER(COALESCE(NULLIF(TRIM(t.artist), ''), 'Unknown Artist')) = LOWER(?)
		GROUP BY a.id, album_title, album_artist_name, a.year, cover.cache_path
		ORDER BY LOWER(COALESCE(NULLIF(TRIM(a.title), ''), 'Unknown Album'))
		LIMIT ?
		OFFSET ?
	`, artistName, limit, offset)
	if err != nil {
		return ArtistDetail{}, fmt.Errorf("list artist albums for %q: %w", artistName, err)
	}
	defer rows.Close()

	albums := make([]AlbumSummary, 0)
	for rows.Next() {
		var album AlbumSummary
		var year sql.NullInt64
		var coverPath sql.NullString
		if scanErr := rows.Scan(&album.Title, &album.AlbumArtist, &year, &album.TrackCount, &coverPath); scanErr != nil {
			return ArtistDetail{}, fmt.Errorf("scan artist album row for %q: %w", artistName, scanErr)
		}
		album.Year = intPointer(year)
		album.CoverPath = stringPointer(coverPath)
		albums = append(albums, album)
	}

	if rowsErr := rows.Err(); rowsErr != nil {
		return ArtistDetail{}, fmt.Errorf("iterate artist album rows for %q: %w", artistName, rowsErr)
	}

	return ArtistDetail{
		Name:       artistName,
		TrackCount: trackCount,
		AlbumCount: albumCount,
		Albums:     albums,
		Page: PageInfo{
			Limit:  limit,
			Offset: offset,
			Total:  albumCount,
		},
	}, nil
}

func (r *BrowseRepository) GetAlbumDetail(ctx context.Context, title string, albumArtist string, limit int, offset int) (AlbumDetail, error) {
	albumTitle := strings.TrimSpace(title)
	artistName := strings.TrimSpace(albumArtist)
	if albumTitle == "" {
		return AlbumDetail{}, errors.New("album title is required")
	}
	if artistName == "" {
		return AlbumDetail{}, errors.New("album artist is required")
	}

	var albumID int64
	var detail AlbumDetail
	var year sql.NullInt64
	var coverPath sql.NullString
	if err := r.db.QueryRowContext(ctx, `
		SELECT
			a.id,
			COALESCE(NULLIF(TRIM(a.title), ''), 'Unknown Album') AS album_title,
			COALESCE(NULLIF(TRIM(a.album_artist), ''), 'Unknown Artist') AS album_artist_name,
			a.year,
			COALESCE(track_totals.track_count, 0) AS track_count,
			cover.cache_path
		FROM albums a
		LEFT JOIN (
			SELECT at.album_id, COUNT(1) AS track_count
			FROM album_tracks at
			JOIN tracks t ON t.id = at.track_id
			JOIN files f ON f.id = t.file_id
			WHERE f.file_exists = 1
			GROUP BY at.album_id
		) track_totals ON track_totals.album_id = a.id
		LEFT JOIN covers cover ON cover.id = a.cover_id
		WHERE LOWER(COALESCE(NULLIF(TRIM(a.title), ''), 'Unknown Album')) = LOWER(?)
		  AND LOWER(COALESCE(NULLIF(TRIM(a.album_artist), ''), 'Unknown Artist')) = LOWER(?)
		LIMIT 1
	`, albumTitle, artistName).Scan(&albumID, &detail.Title, &detail.AlbumArtist, &year, &detail.TrackCount, &coverPath); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return AlbumDetail{}, ErrAlbumNotFound
		}
		return AlbumDetail{}, fmt.Errorf("get album detail for %q by %q: %w", albumTitle, artistName, err)
	}

	detail.Year = intPointer(year)
	detail.CoverPath = stringPointer(coverPath)

	limit, offset = normalizePagination(limit, offset, defaultDetailLimit)

	rows, err := r.db.QueryContext(ctx, `
		SELECT
			t.id,
			COALESCE(NULLIF(TRIM(t.title), ''), 'Unknown Title') AS track_title,
			COALESCE(NULLIF(TRIM(t.artist), ''), 'Unknown Artist') AS track_artist,
			COALESCE(NULLIF(TRIM(t.album), ''), 'Unknown Album') AS track_album,
			COALESCE(NULLIF(TRIM(t.album_artist), ''), COALESCE(NULLIF(TRIM(t.artist), ''), 'Unknown Artist')) AS track_album_artist,
			t.disc_no,
			t.track_no,
			t.duration_ms,
			f.path,
			cover.cache_path
		FROM album_tracks at
		JOIN tracks t ON t.id = at.track_id
		JOIN files f ON f.id = t.file_id
		LEFT JOIN covers cover ON cover.source_file_id = t.file_id
		WHERE at.album_id = ?
		  AND f.file_exists = 1
		ORDER BY
			COALESCE(at.disc_no, t.disc_no, 0),
			COALESCE(at.track_no, t.track_no, 0),
			LOWER(track_title)
		LIMIT ?
		OFFSET ?
	`, albumID, limit, offset)
	if err != nil {
		return AlbumDetail{}, fmt.Errorf("list album tracks for %q by %q: %w", albumTitle, artistName, err)
	}
	defer rows.Close()

	tracks := make([]TrackSummary, 0)
	for rows.Next() {
		var track TrackSummary
		var discNo sql.NullInt64
		var trackNo sql.NullInt64
		var durationMS sql.NullInt64
		var coverPath sql.NullString
		if scanErr := rows.Scan(
			&track.ID,
			&track.Title,
			&track.Artist,
			&track.Album,
			&track.AlbumArtist,
			&discNo,
			&trackNo,
			&durationMS,
			&track.Path,
			&coverPath,
		); scanErr != nil {
			return AlbumDetail{}, fmt.Errorf("scan album track row for %q by %q: %w", albumTitle, artistName, scanErr)
		}
		track.DiscNo = intPointer(discNo)
		track.TrackNo = intPointer(trackNo)
		track.DurationMS = intPointer(durationMS)
		track.CoverPath = stringPointer(coverPath)
		tracks = append(tracks, track)
	}

	if rowsErr := rows.Err(); rowsErr != nil {
		return AlbumDetail{}, fmt.Errorf("iterate album tracks for %q by %q: %w", albumTitle, artistName, rowsErr)
	}

	detail.Tracks = tracks
	detail.Page = PageInfo{
		Limit:  limit,
		Offset: offset,
		Total:  detail.TrackCount,
	}

	return detail, nil
}

func (r *BrowseRepository) GetAlbumQueueTrackIDs(ctx context.Context, title string, albumArtist string) ([]int64, error) {
	orderedIDs, err := r.listAlbumTrackIDs(ctx, title, albumArtist)
	if err != nil {
		return nil, err
	}

	return orderedIDs, nil
}

func (r *BrowseRepository) GetAlbumQueueTrackIDsFromTrack(ctx context.Context, title string, albumArtist string, trackID int64) ([]int64, error) {
	orderedIDs, err := r.listAlbumTrackIDs(ctx, title, albumArtist)
	if err != nil {
		return nil, err
	}

	if indexOfTrackID(orderedIDs, trackID) < 0 {
		return nil, fmt.Errorf("track %d not found in album %q by %q", trackID, strings.TrimSpace(title), strings.TrimSpace(albumArtist))
	}

	queueIDs := make([]int64, len(orderedIDs))
	copy(queueIDs, orderedIDs)
	return queueIDs, nil
}

func (r *BrowseRepository) GetArtistQueueTrackIDs(ctx context.Context, artist string) ([]int64, error) {
	artistName := strings.TrimSpace(artist)
	if artistName == "" {
		return nil, errors.New("artist name is required")
	}

	orderedIDs, err := r.listArtistTrackIDsByAlbumOrder(ctx, artistName)
	if err != nil {
		return nil, err
	}
	if len(orderedIDs) == 0 {
		return nil, ErrArtistNotFound
	}

	return orderedIDs, nil
}

func (r *BrowseRepository) GetArtistTopTracks(ctx context.Context, artist string, limit int) ([]ArtistTopTrack, error) {
	artistName := strings.TrimSpace(artist)
	if artistName == "" {
		return nil, errors.New("artist name is required")
	}

	normalizedLimit := limit
	if normalizedLimit <= 0 {
		normalizedLimit = 5
	}
	if normalizedLimit > maxBrowseLimit {
		normalizedLimit = maxBrowseLimit
	}

	rows, err := r.db.QueryContext(ctx, `
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
					CASE WHEN event_type = 'heartbeat' THEN COALESCE(position_ms, 0) ELSE 0 END AS played_ms,
					CASE WHEN event_type = 'complete' THEN 1 ELSE 0 END AS complete_count,
					CASE WHEN event_type = 'skip' THEN 1 ELSE 0 END AS skip_count,
					CASE WHEN event_type = 'partial' THEN 1 ELSE 0 END AS partial_count
				FROM play_events
				UNION ALL
				SELECT
					track_id,
					played_ms,
					complete_count,
					skip_count,
					partial_count
				FROM play_stats_daily
			) metrics
			GROUP BY track_id
		)
		SELECT
			t.id,
			COALESCE(NULLIF(TRIM(t.title), ''), 'Unknown Title') AS track_title,
			COALESCE(NULLIF(TRIM(t.artist), ''), 'Unknown Artist') AS track_artist,
			COALESCE(NULLIF(TRIM(t.album), ''), 'Unknown Album') AS track_album,
			COALESCE(NULLIF(TRIM(t.album_artist), ''), COALESCE(NULLIF(TRIM(t.artist), ''), 'Unknown Artist')) AS track_album_artist,
			t.disc_no,
			t.track_no,
			t.duration_ms,
			f.path,
			cover.cache_path,
			tm.played_ms,
			tm.complete_count,
			tm.skip_count,
			tm.partial_count
		FROM track_metrics tm
		JOIN tracks t ON t.id = tm.track_id
		JOIN files f ON f.id = t.file_id
		LEFT JOIN covers cover ON cover.source_file_id = t.file_id
		WHERE f.file_exists = 1
		  AND LOWER(COALESCE(NULLIF(TRIM(t.artist), ''), 'Unknown Artist')) = LOWER(?)
		  AND (
			tm.played_ms > 0
			OR tm.complete_count > 0
			OR tm.skip_count > 0
			OR tm.partial_count > 0
		  )
		ORDER BY tm.played_ms DESC, tm.complete_count DESC, tm.partial_count DESC, tm.skip_count ASC, LOWER(track_title)
		LIMIT ?
	`, artistName, normalizedLimit)
	if err != nil {
		return nil, fmt.Errorf("list top tracks for artist %q: %w", artistName, err)
	}
	defer rows.Close()

	topTracks := make([]ArtistTopTrack, 0, normalizedLimit)
	for rows.Next() {
		var item ArtistTopTrack
		var discNo sql.NullInt64
		var trackNo sql.NullInt64
		var durationMS sql.NullInt64
		var coverPath sql.NullString
		if scanErr := rows.Scan(
			&item.TrackID,
			&item.Title,
			&item.Artist,
			&item.Album,
			&item.AlbumArtist,
			&discNo,
			&trackNo,
			&durationMS,
			&item.Path,
			&coverPath,
			&item.PlayedMS,
			&item.CompleteCount,
			&item.SkipCount,
			&item.PartialCount,
		); scanErr != nil {
			return nil, fmt.Errorf("scan top track for artist %q: %w", artistName, scanErr)
		}

		item.DiscNo = intPointer(discNo)
		item.TrackNo = intPointer(trackNo)
		item.DurationMS = intPointer(durationMS)
		item.CoverPath = stringPointer(coverPath)
		topTracks = append(topTracks, item)
	}

	if rowsErr := rows.Err(); rowsErr != nil {
		return nil, fmt.Errorf("iterate top tracks for artist %q: %w", artistName, rowsErr)
	}

	return topTracks, nil
}

func (r *BrowseRepository) GetArtistQueueTrackIDsFromTopTrack(ctx context.Context, artist string, trackID int64) ([]int64, error) {
	artistName := strings.TrimSpace(artist)
	if artistName == "" {
		return nil, errors.New("artist name is required")
	}
	if trackID <= 0 {
		return nil, errors.New("track id is required")
	}

	statsOrderedTrackIDs, err := r.listArtistTrackIDsByStatsOrder(ctx, artistName)
	if err != nil {
		return nil, err
	}
	if len(statsOrderedTrackIDs) == 0 {
		return nil, fmt.Errorf("artist %q has no top tracks yet", artistName)
	}

	albumOrderedTrackIDs, err := r.listArtistTrackIDsByAlbumOrder(ctx, artistName)
	if err != nil {
		return nil, err
	}
	if len(albumOrderedTrackIDs) == 0 {
		return nil, ErrArtistNotFound
	}

	queueIDs, buildErr := buildArtistQueueFromTopTrack(statsOrderedTrackIDs, albumOrderedTrackIDs, trackID)
	if buildErr != nil {
		return nil, buildErr
	}

	return queueIDs, nil
}

func (r *BrowseRepository) listAlbumTrackIDs(ctx context.Context, title string, albumArtist string) ([]int64, error) {
	albumTitle := strings.TrimSpace(title)
	artistName := strings.TrimSpace(albumArtist)
	if albumTitle == "" {
		return nil, errors.New("album title is required")
	}
	if artistName == "" {
		return nil, errors.New("album artist is required")
	}

	var albumID int64
	err := r.db.QueryRowContext(ctx, `
		SELECT a.id
		FROM albums a
		WHERE LOWER(COALESCE(NULLIF(TRIM(a.title), ''), 'Unknown Album')) = LOWER(?)
		  AND LOWER(COALESCE(NULLIF(TRIM(a.album_artist), ''), 'Unknown Artist')) = LOWER(?)
		LIMIT 1
	`, albumTitle, artistName).Scan(&albumID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrAlbumNotFound
		}
		return nil, fmt.Errorf("resolve album id for %q by %q: %w", albumTitle, artistName, err)
	}

	rows, err := r.db.QueryContext(ctx, `
		SELECT t.id
		FROM album_tracks at
		JOIN tracks t ON t.id = at.track_id
		JOIN files f ON f.id = t.file_id
		WHERE at.album_id = ?
		  AND f.file_exists = 1
		ORDER BY
			COALESCE(at.disc_no, t.disc_no, 0),
			COALESCE(at.track_no, t.track_no, 0),
			LOWER(COALESCE(NULLIF(TRIM(t.title), ''), 'Unknown Title')),
			t.id
	`, albumID)
	if err != nil {
		return nil, fmt.Errorf("list album track ids for %q by %q: %w", albumTitle, artistName, err)
	}
	defer rows.Close()

	trackIDs := make([]int64, 0)
	for rows.Next() {
		var trackID int64
		if scanErr := rows.Scan(&trackID); scanErr != nil {
			return nil, fmt.Errorf("scan album track id for %q by %q: %w", albumTitle, artistName, scanErr)
		}
		trackIDs = append(trackIDs, trackID)
	}
	if rowsErr := rows.Err(); rowsErr != nil {
		return nil, fmt.Errorf("iterate album track ids for %q by %q: %w", albumTitle, artistName, rowsErr)
	}

	if len(trackIDs) == 0 {
		return nil, ErrAlbumNotFound
	}

	return trackIDs, nil
}

func (r *BrowseRepository) listArtistTrackIDsByAlbumOrder(ctx context.Context, artistName string) ([]int64, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT
			t.id
		FROM tracks t
		JOIN files f ON f.id = t.file_id
		LEFT JOIN album_tracks at ON at.track_id = t.id
		LEFT JOIN albums a ON a.id = at.album_id
		WHERE f.file_exists = 1
		  AND LOWER(COALESCE(NULLIF(TRIM(t.artist), ''), 'Unknown Artist')) = LOWER(?)
		ORDER BY
			CASE WHEN a.year IS NULL THEN 1 ELSE 0 END,
			a.year DESC,
			LOWER(COALESCE(NULLIF(TRIM(a.title), ''), COALESCE(NULLIF(TRIM(t.album), ''), 'Unknown Album'))),
			COALESCE(at.disc_no, t.disc_no, 0),
			COALESCE(at.track_no, t.track_no, 0),
			LOWER(COALESCE(NULLIF(TRIM(t.title), ''), 'Unknown Title')),
			t.id
	`, artistName)
	if err != nil {
		return nil, fmt.Errorf("list artist tracks for %q: %w", artistName, err)
	}
	defer rows.Close()

	trackIDs := make([]int64, 0)
	for rows.Next() {
		var trackID int64
		if scanErr := rows.Scan(&trackID); scanErr != nil {
			return nil, fmt.Errorf("scan artist track id for %q: %w", artistName, scanErr)
		}
		trackIDs = append(trackIDs, trackID)
	}
	if rowsErr := rows.Err(); rowsErr != nil {
		return nil, fmt.Errorf("iterate artist track ids for %q: %w", artistName, rowsErr)
	}

	return trackIDs, nil
}

func (r *BrowseRepository) listArtistTrackIDsByStatsOrder(ctx context.Context, artistName string) ([]int64, error) {
	rows, err := r.db.QueryContext(ctx, `
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
					CASE WHEN event_type = 'heartbeat' THEN COALESCE(position_ms, 0) ELSE 0 END AS played_ms,
					CASE WHEN event_type = 'complete' THEN 1 ELSE 0 END AS complete_count,
					CASE WHEN event_type = 'skip' THEN 1 ELSE 0 END AS skip_count,
					CASE WHEN event_type = 'partial' THEN 1 ELSE 0 END AS partial_count
				FROM play_events
				UNION ALL
				SELECT
					track_id,
					played_ms,
					complete_count,
					skip_count,
					partial_count
				FROM play_stats_daily
			) metrics
			GROUP BY track_id
		)
		SELECT t.id
		FROM track_metrics tm
		JOIN tracks t ON t.id = tm.track_id
		JOIN files f ON f.id = t.file_id
		WHERE f.file_exists = 1
		  AND LOWER(COALESCE(NULLIF(TRIM(t.artist), ''), 'Unknown Artist')) = LOWER(?)
		  AND (
			tm.played_ms > 0
			OR tm.complete_count > 0
			OR tm.skip_count > 0
			OR tm.partial_count > 0
		  )
		ORDER BY tm.played_ms DESC, tm.complete_count DESC, tm.partial_count DESC, tm.skip_count ASC, LOWER(COALESCE(NULLIF(TRIM(t.title), ''), 'Unknown Title'))
	`, artistName)
	if err != nil {
		return nil, fmt.Errorf("list artist stats tracks for %q: %w", artistName, err)
	}
	defer rows.Close()

	trackIDs := make([]int64, 0)
	for rows.Next() {
		var trackID int64
		if scanErr := rows.Scan(&trackID); scanErr != nil {
			return nil, fmt.Errorf("scan artist stats track id for %q: %w", artistName, scanErr)
		}
		trackIDs = append(trackIDs, trackID)
	}
	if rowsErr := rows.Err(); rowsErr != nil {
		return nil, fmt.Errorf("iterate artist stats track ids for %q: %w", artistName, rowsErr)
	}

	return trackIDs, nil
}

func buildArtistQueueFromTopTrack(statsOrderedTrackIDs []int64, albumOrderedTrackIDs []int64, startTrackID int64) ([]int64, error) {
	if len(statsOrderedTrackIDs) == 0 {
		return nil, errors.New("no stats-ranked tracks available")
	}

	if indexOfTrackID(statsOrderedTrackIDs, startTrackID) < 0 {
		return nil, fmt.Errorf("track %d is not in artist top tracks", startTrackID)
	}

	queueIDs := make([]int64, 0, len(statsOrderedTrackIDs)+len(albumOrderedTrackIDs))
	seenIDs := make(map[int64]struct{}, len(statsOrderedTrackIDs)+len(albumOrderedTrackIDs))

	for _, trackID := range statsOrderedTrackIDs {
		if _, alreadySeen := seenIDs[trackID]; alreadySeen {
			continue
		}
		queueIDs = append(queueIDs, trackID)
		seenIDs[trackID] = struct{}{}
	}

	for _, trackID := range albumOrderedTrackIDs {
		if _, alreadySeen := seenIDs[trackID]; alreadySeen {
			continue
		}
		queueIDs = append(queueIDs, trackID)
		seenIDs[trackID] = struct{}{}
	}

	if len(queueIDs) == 0 {
		return nil, errors.New("no playable tracks available for queue")
	}

	return queueIDs, nil
}

func indexOfTrackID(trackIDs []int64, targetTrackID int64) int {
	for index, trackID := range trackIDs {
		if trackID == targetTrackID {
			return index
		}
	}

	return -1
}

func normalizePagination(limit int, offset int, defaultLimit int) (int, int) {
	if limit <= 0 {
		limit = defaultLimit
	}
	if limit > maxBrowseLimit {
		limit = maxBrowseLimit
	}
	if offset < 0 {
		offset = 0
	}

	return limit, offset
}

func makeSearchPattern(search string) string {
	trimmed := strings.TrimSpace(search)
	if trimmed == "" {
		return ""
	}

	return "%" + strings.ToLower(trimmed) + "%"
}

func cloneArgs(args []any) []any {
	copyArgs := make([]any, len(args))
	copy(copyArgs, args)
	return copyArgs
}

func intPointer(value sql.NullInt64) *int {
	if !value.Valid {
		return nil
	}

	intValue := int(value.Int64)
	return &intValue
}

func stringPointer(value sql.NullString) *string {
	if !value.Valid {
		return nil
	}

	trimmed := strings.TrimSpace(value.String)
	if trimmed == "" {
		return nil
	}

	return &trimmed
}
