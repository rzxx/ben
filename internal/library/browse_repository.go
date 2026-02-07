package library

import (
	"context"
	"database/sql"
	"fmt"
)

type ArtistSummary struct {
	Name       string `json:"name"`
	TrackCount int    `json:"trackCount"`
}

type AlbumSummary struct {
	Title       string `json:"title"`
	AlbumArtist string `json:"albumArtist"`
	TrackCount  int    `json:"trackCount"`
}

type TrackSummary struct {
	ID     int64  `json:"id"`
	Title  string `json:"title"`
	Artist string `json:"artist"`
	Album  string `json:"album"`
	Path   string `json:"path"`
}

type BrowseRepository struct {
	db *sql.DB
}

func NewBrowseRepository(database *sql.DB) *BrowseRepository {
	return &BrowseRepository{db: database}
}

func (r *BrowseRepository) ListArtists(ctx context.Context, limit int) ([]ArtistSummary, error) {
	if limit <= 0 {
		limit = 100
	}

	rows, err := r.db.QueryContext(ctx, `
		SELECT
			COALESCE(NULLIF(TRIM(t.artist), ''), 'Unknown Artist') AS artist_name,
			COUNT(1) AS track_count
		FROM tracks t
		JOIN files f ON f.id = t.file_id
		WHERE f.file_exists = 1
		GROUP BY artist_name
		ORDER BY LOWER(artist_name)
		LIMIT ?
	`, limit)
	if err != nil {
		return nil, fmt.Errorf("list artists: %w", err)
	}
	defer rows.Close()

	artists := make([]ArtistSummary, 0)
	for rows.Next() {
		var artist ArtistSummary
		if scanErr := rows.Scan(&artist.Name, &artist.TrackCount); scanErr != nil {
			return nil, fmt.Errorf("scan artist row: %w", scanErr)
		}
		artists = append(artists, artist)
	}

	if rowsErr := rows.Err(); rowsErr != nil {
		return nil, fmt.Errorf("iterate artist rows: %w", rowsErr)
	}

	return artists, nil
}

func (r *BrowseRepository) ListAlbums(ctx context.Context, limit int) ([]AlbumSummary, error) {
	if limit <= 0 {
		limit = 100
	}

	rows, err := r.db.QueryContext(ctx, `
		SELECT
			COALESCE(NULLIF(TRIM(t.album), ''), 'Unknown Album') AS album_title,
			COALESCE(NULLIF(TRIM(t.album_artist), ''), 'Unknown Artist') AS album_artist_name,
			COUNT(1) AS track_count
		FROM tracks t
		JOIN files f ON f.id = t.file_id
		WHERE f.file_exists = 1
		GROUP BY album_title, album_artist_name
		ORDER BY LOWER(album_artist_name), LOWER(album_title)
		LIMIT ?
	`, limit)
	if err != nil {
		return nil, fmt.Errorf("list albums: %w", err)
	}
	defer rows.Close()

	albums := make([]AlbumSummary, 0)
	for rows.Next() {
		var album AlbumSummary
		if scanErr := rows.Scan(&album.Title, &album.AlbumArtist, &album.TrackCount); scanErr != nil {
			return nil, fmt.Errorf("scan album row: %w", scanErr)
		}
		albums = append(albums, album)
	}

	if rowsErr := rows.Err(); rowsErr != nil {
		return nil, fmt.Errorf("iterate album rows: %w", rowsErr)
	}

	return albums, nil
}

func (r *BrowseRepository) ListTracks(ctx context.Context, limit int) ([]TrackSummary, error) {
	if limit <= 0 {
		limit = 200
	}

	rows, err := r.db.QueryContext(ctx, `
		SELECT
			t.id,
			COALESCE(NULLIF(TRIM(t.title), ''), 'Unknown Title') AS track_title,
			COALESCE(NULLIF(TRIM(t.artist), ''), 'Unknown Artist') AS track_artist,
			COALESCE(NULLIF(TRIM(t.album), ''), 'Unknown Album') AS track_album,
			f.path
		FROM tracks t
		JOIN files f ON f.id = t.file_id
		WHERE f.file_exists = 1
		ORDER BY
			LOWER(track_artist),
			LOWER(track_album),
			COALESCE(t.disc_no, 0),
			COALESCE(t.track_no, 0),
			LOWER(track_title)
		LIMIT ?
	`, limit)
	if err != nil {
		return nil, fmt.Errorf("list tracks: %w", err)
	}
	defer rows.Close()

	tracks := make([]TrackSummary, 0)
	for rows.Next() {
		var track TrackSummary
		if scanErr := rows.Scan(&track.ID, &track.Title, &track.Artist, &track.Album, &track.Path); scanErr != nil {
			return nil, fmt.Errorf("scan track row: %w", scanErr)
		}
		tracks = append(tracks, track)
	}

	if rowsErr := rows.Err(); rowsErr != nil {
		return nil, fmt.Errorf("iterate track rows: %w", rowsErr)
	}

	return tracks, nil
}
