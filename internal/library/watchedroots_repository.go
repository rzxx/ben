package library

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
)

var ErrWatchedRootNotFound = errors.New("watched root not found")

type WatchedRoot struct {
	ID        int64  `json:"id"`
	Path      string `json:"path"`
	Enabled   bool   `json:"enabled"`
	CreatedAt string `json:"createdAt"`
}

type WatchedRootRepository struct {
	db *sql.DB
}

func NewWatchedRootRepository(database *sql.DB) *WatchedRootRepository {
	return &WatchedRootRepository{db: database}
}

func (r *WatchedRootRepository) List(ctx context.Context) ([]WatchedRoot, error) {
	rows, err := r.db.QueryContext(
		ctx,
		"SELECT id, path, enabled, created_at FROM watched_roots ORDER BY path COLLATE NOCASE",
	)
	if err != nil {
		return nil, fmt.Errorf("list watched roots: %w", err)
	}
	defer rows.Close()

	roots := make([]WatchedRoot, 0)
	for rows.Next() {
		var root WatchedRoot
		var enabledInt int
		if err := rows.Scan(&root.ID, &root.Path, &enabledInt, &root.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan watched root row: %w", err)
		}
		root.Enabled = enabledInt == 1
		roots = append(roots, root)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate watched root rows: %w", err)
	}

	return roots, nil
}

func (r *WatchedRootRepository) Add(ctx context.Context, path string) (WatchedRoot, error) {
	if strings.TrimSpace(path) == "" {
		return WatchedRoot{}, errors.New("path is required")
	}

	result, err := r.db.ExecContext(
		ctx,
		"INSERT INTO watched_roots(path, enabled) VALUES (?, 1)",
		path,
	)
	if err != nil {
		return WatchedRoot{}, fmt.Errorf("insert watched root: %w", err)
	}

	id, err := result.LastInsertId()
	if err != nil {
		return WatchedRoot{}, fmt.Errorf("read watched root id: %w", err)
	}

	return r.GetByID(ctx, id)
}

func (r *WatchedRootRepository) GetByID(ctx context.Context, id int64) (WatchedRoot, error) {
	var root WatchedRoot
	var enabledInt int
	err := r.db.QueryRowContext(
		ctx,
		"SELECT id, path, enabled, created_at FROM watched_roots WHERE id = ?",
		id,
	).Scan(&root.ID, &root.Path, &enabledInt, &root.CreatedAt)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return WatchedRoot{}, ErrWatchedRootNotFound
		}
		return WatchedRoot{}, fmt.Errorf("get watched root %d: %w", id, err)
	}

	root.Enabled = enabledInt == 1
	return root, nil
}

func (r *WatchedRootRepository) SetEnabled(ctx context.Context, id int64, enabled bool) error {
	enabledInt := 0
	if enabled {
		enabledInt = 1
	}

	result, err := r.db.ExecContext(
		ctx,
		"UPDATE watched_roots SET enabled = ? WHERE id = ?",
		enabledInt,
		id,
	)
	if err != nil {
		return fmt.Errorf("update watched root %d: %w", id, err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("read updated watched root count: %w", err)
	}
	if rowsAffected == 0 {
		return ErrWatchedRootNotFound
	}

	return nil
}

func (r *WatchedRootRepository) Delete(ctx context.Context, id int64) error {
	result, err := r.db.ExecContext(ctx, "DELETE FROM watched_roots WHERE id = ?", id)
	if err != nil {
		return fmt.Errorf("delete watched root %d: %w", id, err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("read deleted watched root count: %w", err)
	}
	if rowsAffected == 0 {
		return ErrWatchedRootNotFound
	}

	return nil
}
