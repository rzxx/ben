package main

import (
	"ben/internal/library"
	"context"
)

type LibraryService struct {
	browse *library.BrowseRepository
}

func NewLibraryService(browse *library.BrowseRepository) *LibraryService {
	return &LibraryService{browse: browse}
}

func (s *LibraryService) ListArtists() ([]library.ArtistSummary, error) {
	return s.browse.ListArtists(context.Background(), 100)
}

func (s *LibraryService) ListAlbums() ([]library.AlbumSummary, error) {
	return s.browse.ListAlbums(context.Background(), 100)
}

func (s *LibraryService) ListTracks() ([]library.TrackSummary, error) {
	return s.browse.ListTracks(context.Background(), 300)
}
