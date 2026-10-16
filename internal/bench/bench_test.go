package bench

import (
	"math"
	"testing"
)

func TestPercentile(t *testing.T) {
	sorted := []float64{1, 2, 3, 4, 5, 6, 7, 8, 9, 10}
	if p := percentile(sorted, 50); p != 5 {
		t.Fatalf("p50: expected 5, got %.1f", p)
	}
	if p := percentile(sorted, 95); p != 10 {
		t.Fatalf("p95: expected 10, got %.1f", p)
	}
}

func TestWinRate(t *testing.T) {
	// overlay wins on 3/4 pairs; one is both-lost (excluded)
	direct := []float64{100, 80, math.Inf(1), 120}
	overlay := []float64{90, 85, math.Inf(1), 100}
	// pair 0: 90<100 overlay wins; pair 1: 85>80 overlay loses; pair 2: both inf, excluded; pair 3: 100<120 wins
	// wins=2, total=3 → 66.7%
	got := winRate(direct, overlay)
	if math.Abs(got-66.67) > 0.1 {
		t.Fatalf("win rate: expected 66.7, got %.2f", got)
	}
}

func TestComputeStats(t *testing.T) {
	rtts := []float64{10, 20, 30, math.Inf(1)} // 3 answered, 1 lost
	s := computeStats(rtts, 4)
	if s.Received != 3 {
		t.Fatalf("received: expected 3, got %d", s.Received)
	}
	if math.Abs(s.LossPct-25.0) > 0.1 {
		t.Fatalf("loss: expected 25.0, got %.2f", s.LossPct)
	}
	if s.Median != 20 {
		t.Fatalf("median: expected 20, got %.1f", s.Median)
	}
}
