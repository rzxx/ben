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
	Title       string `json:"title"`
	AlbumArtist string `json:"albumArtist"`
	Year        *int   `json:"year,omitempty"`
	TrackCount  int    `json:"trackCount"`
}

type TrackSummary struct {
	ID          int64  `json:"id"`
	Title       string `json:"title"`
	Artist      string `json:"artist"`
	Album       string `json:"album"`
	AlbumArtist string `json:"albumArtist"`
	DiscNo      *int   `json:"discNo,omitempty"`
	TrackNo     *int   `json:"trackNo,omitempty"`
	DurationMS  *int   `json:"durationMs,omitempty"`
	Path        string `json:"path"`
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
	Tracks      []TrackSummary `json:"tracks"`
	Page        PageInfo       `json:"page"`
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

	whereClauses := []string{"f.file_exists = 1"}
	args := make([]any, 0, 4)

	if pattern := makeSearchPattern(search); pattern != "" {
		whereClauses = append(whereClauses, "LOWER(COALESCE(NULLIF(TRIM(t.artist), ''), 'Unknown Artist')) LIKE ?")
		args = append(args, pattern)
	}

	whereSQL := strings.Join(whereClauses, " AND ")

	countQuery := fmt.Sprintf(`
		SELECT COUNT(1)
		FROM (
			SELECT COALESCE(NULLIF(TRIM(t.artist), ''), 'Unknown Artist') AS artist_name
			FROM tracks t
			JOIN files f ON f.id = t.file_id
			WHERE %s
			GROUP BY artist_name
		) grouped_artists
	`, whereSQL)

	var total int
	if err := r.db.QueryRowContext(ctx, countQuery, args...).Scan(&total); err != nil {
		return ArtistsPage{}, fmt.Errorf("count artists: %w", err)
	}

	listQuery := fmt.Sprintf(`
		SELECT
			COALESCE(NULLIF(TRIM(t.artist), ''), 'Unknown Artist') AS artist_name,
			COUNT(1) AS track_count,
			COUNT(DISTINCT COALESCE(NULLIF(TRIM(t.album), ''), 'Unknown Album')) AS album_count
		FROM tracks t
		JOIN files f ON f.id = t.file_id
		WHERE %s
		GROUP BY artist_name
		ORDER BY LOWER(artist_name)
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

	whereClauses := []string{"f.file_exists = 1"}
	args := make([]any, 0, 8)

	if pattern := makeSearchPattern(search); pattern != "" {
		whereClauses = append(whereClauses, `(LOWER(COALESCE(NULLIF(TRIM(t.album), ''), 'Unknown Album')) LIKE ? OR LOWER(COALESCE(NULLIF(TRIM(t.album_artist), ''), COALESCE(NULLIF(TRIM(t.artist), ''), 'Unknown Artist'))) LIKE ?)`)
		args = append(args, pattern, pattern)
	}

	if artistFilter := strings.TrimSpace(artist); artistFilter != "" {
		whereClauses = append(whereClauses, "LOWER(COALESCE(NULLIF(TRIM(t.album_artist), ''), COALESCE(NULLIF(TRIM(t.artist), ''), 'Unknown Artist'))) = LOWER(?)")
		args = append(args, artistFilter)
	}

	whereSQL := strings.Join(whereClauses, " AND ")

	countQuery := fmt.Sprintf(`
		SELECT COUNT(1)
		FROM (
			SELECT
				COALESCE(NULLIF(TRIM(t.album), ''), 'Unknown Album') AS album_title,
				COALESCE(NULLIF(TRIM(t.album_artist), ''), COALESCE(NULLIF(TRIM(t.artist), ''), 'Unknown Artist')) AS album_artist_name
			FROM tracks t
			JOIN files f ON f.id = t.file_id
			WHERE %s
			GROUP BY album_title, album_artist_name
		) grouped_albums
	`, whereSQL)

	var total int
	if err := r.db.QueryRowContext(ctx, countQuery, args...).Scan(&total); err != nil {
		return AlbumsPage{}, fmt.Errorf("count albums: %w", err)
	}

	listQuery := fmt.Sprintf(`
		SELECT
			COALESCE(NULLIF(TRIM(t.album), ''), 'Unknown Album') AS album_title,
			COALESCE(NULLIF(TRIM(t.album_artist), ''), COALESCE(NULLIF(TRIM(t.artist), ''), 'Unknown Artist')) AS album_artist_name,
			MIN(NULLIF(t.year, 0)) AS first_year,
			COUNT(1) AS track_count
		FROM tracks t
		JOIN files f ON f.id = t.file_id
		WHERE %s
		GROUP BY album_title, album_artist_name
		ORDER BY LOWER(album_artist_name), LOWER(album_title)
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
		if scanErr := rows.Scan(&album.Title, &album.AlbumArtist, &year, &album.TrackCount); scanErr != nil {
			return AlbumsPage{}, fmt.Errorf("scan album row: %w", scanErr)
		}
		album.Year = intPointer(year)
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
			f.path
		FROM tracks t
		JOIN files f ON f.id = t.file_id
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
		); scanErr != nil {
			return TracksPage{}, fmt.Errorf("scan track row: %w", scanErr)
		}
		track.DiscNo = intPointer(discNo)
		track.TrackNo = intPointer(trackNo)
		track.DurationMS = intPointer(durationMS)
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
			COUNT(DISTINCT COALESCE(NULLIF(TRIM(t.album), ''), 'Unknown Album'))
		FROM tracks t
		JOIN files f ON f.id = t.file_id
		WHERE f.file_exists = 1
		  AND LOWER(COALESCE(NULLIF(TRIM(t.artist), ''), 'Unknown Artist')) = LOWER(?)
	`, artistName).Scan(&trackCount, &albumCount); err != nil {
		return ArtistDetail{}, fmt.Errorf("get artist totals for %q: %w", artistName, err)
	}

	if trackCount == 0 {
		return ArtistDetail{}, ErrArtistNotFound
	}

	limit, offset = normalizePagination(limit, offset, defaultDetailLimit)

	rows, err := r.db.QueryContext(ctx, `
		SELECT
			COALESCE(NULLIF(TRIM(t.album), ''), 'Unknown Album') AS album_title,
			COALESCE(NULLIF(TRIM(t.album_artist), ''), COALESCE(NULLIF(TRIM(t.artist), ''), 'Unknown Artist')) AS album_artist_name,
			MIN(NULLIF(t.year, 0)) AS first_year,
			COUNT(1) AS track_count
		FROM tracks t
		JOIN files f ON f.id = t.file_id
		WHERE f.file_exists = 1
		  AND LOWER(COALESCE(NULLIF(TRIM(t.artist), ''), 'Unknown Artist')) = LOWER(?)
		GROUP BY album_title, album_artist_name
		ORDER BY LOWER(album_title)
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
		if scanErr := rows.Scan(&album.Title, &album.AlbumArtist, &year, &album.TrackCount); scanErr != nil {
			return ArtistDetail{}, fmt.Errorf("scan artist album row for %q: %w", artistName, scanErr)
		}
		album.Year = intPointer(year)
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

	var detail AlbumDetail
	var year sql.NullInt64
	if err := r.db.QueryRowContext(ctx, `
		SELECT
			COALESCE(NULLIF(TRIM(t.album), ''), 'Unknown Album') AS album_title,
			COALESCE(NULLIF(TRIM(t.album_artist), ''), COALESCE(NULLIF(TRIM(t.artist), ''), 'Unknown Artist')) AS album_artist_name,
			MIN(NULLIF(t.year, 0)) AS first_year,
			COUNT(1) AS track_count
		FROM tracks t
		JOIN files f ON f.id = t.file_id
		WHERE f.file_exists = 1
		  AND LOWER(COALESCE(NULLIF(TRIM(t.album), ''), 'Unknown Album')) = LOWER(?)
		  AND LOWER(COALESCE(NULLIF(TRIM(t.album_artist), ''), COALESCE(NULLIF(TRIM(t.artist), ''), 'Unknown Artist'))) = LOWER(?)
		GROUP BY album_title, album_artist_name
	`, albumTitle, artistName).Scan(&detail.Title, &detail.AlbumArtist, &year, &detail.TrackCount); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return AlbumDetail{}, ErrAlbumNotFound
		}
		return AlbumDetail{}, fmt.Errorf("get album detail for %q by %q: %w", albumTitle, artistName, err)
	}

	detail.Year = intPointer(year)

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
			f.path
		FROM tracks t
		JOIN files f ON f.id = t.file_id
		WHERE f.file_exists = 1
		  AND LOWER(COALESCE(NULLIF(TRIM(t.album), ''), 'Unknown Album')) = LOWER(?)
		  AND LOWER(COALESCE(NULLIF(TRIM(t.album_artist), ''), COALESCE(NULLIF(TRIM(t.artist), ''), 'Unknown Artist'))) = LOWER(?)
		ORDER BY
			COALESCE(t.disc_no, 0),
			COALESCE(t.track_no, 0),
			LOWER(track_title)
		LIMIT ?
		OFFSET ?
	`, albumTitle, artistName, limit, offset)
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
		); scanErr != nil {
			return AlbumDetail{}, fmt.Errorf("scan album track row for %q by %q: %w", albumTitle, artistName, scanErr)
		}
		track.DiscNo = intPointer(discNo)
		track.TrackNo = intPointer(trackNo)
		track.DurationMS = intPointer(durationMS)
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
