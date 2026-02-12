package stats

import "testing"

func TestCompletionScore_AllCompletions(t *testing.T) {
	score := completionScore(12, 0, 0)
	if score != 100 {
		t.Fatalf("expected score 100, got %f", score)
	}
}

func TestCompletionScore_SkipsAndPartialsPushDown(t *testing.T) {
	score := completionScore(0, 2, 10)
	if score != 0 {
		t.Fatalf("expected score 0 with heavy skips, got %f", score)
	}
}

func TestDiscoveryScore_NoRepeatsIsPerfect(t *testing.T) {
	discovery := buildDiscovery(DashboardSummary{TracksPlayed: 9, TotalPlays: 9})
	if discovery.Score != 100 {
		t.Fatalf("expected discovery score 100, got %f", discovery.Score)
	}
}

func TestDiscoveryScore_AllRepeatsIsZero(t *testing.T) {
	discovery := buildDiscovery(DashboardSummary{TracksPlayed: 1, TotalPlays: 12})
	if discovery.Score != 0 {
		t.Fatalf("expected discovery score 0, got %f", discovery.Score)
	}
}
