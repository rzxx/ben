package stats

import "testing"

func TestClassifyTrackEndShortTrackComplete(t *testing.T) {
	durationMS := 4 * 60 * 1000
	playedMS := int(float64(durationMS) * 0.90)

	result := classifyTrackEnd(playedMS, playedMS, durationMS)
	if result != EventComplete {
		t.Fatalf("expected %q, got %q", EventComplete, result)
	}
}

func TestClassifyTrackEndMediumTrackComplete(t *testing.T) {
	durationMS := 12 * 60 * 1000
	playedMS := int(float64(durationMS) * 0.85)

	result := classifyTrackEnd(playedMS, playedMS, durationMS)
	if result != EventComplete {
		t.Fatalf("expected %q, got %q", EventComplete, result)
	}
}

func TestClassifyTrackEndLongTrackComplete(t *testing.T) {
	durationMS := 45 * 60 * 1000
	playedMS := int(float64(durationMS) * 0.80)

	result := classifyTrackEnd(playedMS, playedMS, durationMS)
	if result != EventComplete {
		t.Fatalf("expected %q, got %q", EventComplete, result)
	}
}

func TestClassifyTrackEndSkipEarlyExit(t *testing.T) {
	durationMS := 6 * 60 * 1000
	playedMS := 35 * 1000

	result := classifyTrackEnd(playedMS, playedMS, durationMS)
	if result != EventSkip {
		t.Fatalf("expected %q, got %q", EventSkip, result)
	}
}

func TestClassifyTrackEndPartialMiddleSession(t *testing.T) {
	durationMS := 8 * 60 * 1000
	playedMS := 3 * 60 * 1000

	result := classifyTrackEnd(playedMS, playedMS, durationMS)
	if result != EventPartial {
		t.Fatalf("expected %q, got %q", EventPartial, result)
	}
}

func TestClassifyTrackEndUnknownDuration(t *testing.T) {
	result := classifyTrackEnd(90*1000, 90*1000, 0)
	if result != EventPartial {
		t.Fatalf("expected %q, got %q", EventPartial, result)
	}
}

func TestClassifyTrackEndTailCompletionWindow(t *testing.T) {
	durationMS := 30 * 60 * 1000
	playedMS := durationMS - 50*1000

	result := classifyTrackEnd(playedMS, playedMS, durationMS)
	if result != EventComplete {
		t.Fatalf("expected %q, got %q", EventComplete, result)
	}
}
