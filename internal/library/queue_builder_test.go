package library

import (
	"reflect"
	"testing"
)

func TestBuildArtistQueueFromTopTrack_IncludesFullContext(t *testing.T) {
	t.Parallel()

	statsOrder := []int64{50, 40, 30, 20, 10}
	albumOrder := []int64{1, 2, 3, 4, 5, 10, 20, 30, 40, 50, 60, 70}

	queueIDs, err := buildArtistQueueFromTopTrack(statsOrder, albumOrder, 30)
	if err != nil {
		t.Fatalf("build queue: %v", err)
	}

	expected := []int64{50, 40, 30, 20, 10, 1, 2, 3, 4, 5, 60, 70}
	if !reflect.DeepEqual(queueIDs, expected) {
		t.Fatalf("unexpected queue order: got %v, want %v", queueIDs, expected)
	}
}

func TestBuildArtistQueueFromTopTrack_DeduplicatesAndKeepsStatsFirst(t *testing.T) {
	t.Parallel()

	statsOrder := []int64{9, 8, 7}
	albumOrder := []int64{7, 6, 8, 5, 9, 4}

	queueIDs, err := buildArtistQueueFromTopTrack(statsOrder, albumOrder, 8)
	if err != nil {
		t.Fatalf("build queue: %v", err)
	}

	expected := []int64{9, 8, 7, 6, 5, 4}
	if !reflect.DeepEqual(queueIDs, expected) {
		t.Fatalf("unexpected queue order: got %v, want %v", queueIDs, expected)
	}
}

func TestBuildArtistQueueFromTopTrack_ReturnsErrorWhenTrackNotInStats(t *testing.T) {
	t.Parallel()

	_, err := buildArtistQueueFromTopTrack([]int64{3, 2, 1}, []int64{1, 2, 3, 4}, 4)
	if err == nil {
		t.Fatal("expected error when selected track is not in stats order")
	}
}
