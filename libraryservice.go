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

func (s *LibraryService) ListArtists(search string, limit int, offset int) (library.ArtistsPage, error) {
	return s.browse.ListArtists(context.Background(), search, limit, offset)
}

func (s *LibraryService) ListAlbums(search string, artist string, limit int, offset int) (library.AlbumsPage, error) {
	return s.browse.ListAlbums(context.Background(), search, artist, limit, offset)
}

func (s *LibraryService) ListTracks(search string, artist string, album string, limit int, offset int) (library.TracksPage, error) {
	return s.browse.ListTracks(context.Background(), search, artist, album, limit, offset)
}

func (s *LibraryService) GetArtistDetail(name string, limit int, offset int) (library.ArtistDetail, error) {
	return s.browse.GetArtistDetail(context.Background(), name, limit, offset)
}

func (s *LibraryService) GetAlbumDetail(title string, albumArtist string, limit int, offset int) (library.AlbumDetail, error) {
	return s.browse.GetAlbumDetail(context.Background(), title, albumArtist, limit, offset)
}
