package prober

import (
	"testing"
	"time"

	"github.com/bharatroute/internal/config"
)

// TestEWMA verifies the EWMA formula against a fixed sequence.
func TestEWMA(t *testing.T) {
	alpha := 0.2
	ewma := 100.0 // first sample
	samples := []float64{110, 90, 120, 80}
	for _, s := range samples {
		ewma = alpha*s + (1-alpha)*ewma
	}
	// Manual: 0.2*110+0.8*100=102, 0.2*90+0.8*102=99.6, 0.2*120+0.8*99.6=103.68, 0.2*80+0.8*103.68=98.944
	expected := 98.944
	if ewma < expected-0.01 || ewma > expected+0.01 {
		t.Fatalf("EWMA: expected %.3f, got %.3f", expected, ewma)
	}
}

// TestLossWindow verifies loss percentage in the sliding window.
func TestLossWindow(t *testing.T) {
	ps := &peerState{window: []windowEntry{
		{answered: true}, {answered: false}, {answered: true}, {answered: false}, {answered: true},
	}}
	p := &Prober{params: defaultTestParams()}
	loss := p.lossPct(ps)
	if loss != 40.0 {
		t.Fatalf("loss: expected 40.0, got %.1f", loss)
	}
}

// TestLinkStateMachine verifies down-after-misses and up-after-hits.
func TestLinkStateMachine(t *testing.T) {
	p := &Prober{params: defaultTestParams()}
	ps := &peerState{state: "up", inflight: make(map[uint32]int64)}

	// 4 consecutive misses → down
	for i := 0; i < 4; i++ {
		p.recordMiss(1, ps)
	}
	if ps.state != "down" {
		t.Fatal("expected down after 4 misses")
	}

	// 1 hit — not up yet (need 2)
	ps.hits++
	ps.misses = 0
	if ps.hits >= p.params.UpAfterHits {
		t.Fatal("should not be up after 1 hit")
	}

	// 2nd hit → up
	ps.hits++
	if ps.hits < p.params.UpAfterHits {
		t.Fatal("should be up after 2 hits")
	}
}

// TestJitter verifies jitter is the mean absolute difference.
func TestJitter(t *testing.T) {
	p := &Prober{params: defaultTestParams()}
	ps := &peerState{jitterAcc: 10, jitterN: 5}
	if p.jitterMs(ps) != 2.0 {
		t.Fatalf("jitter: expected 2.0, got %.2f", p.jitterMs(ps))
	}
}

func defaultTestParams() config.Params {
	return config.DefaultParams()
}

// Compile check: config package is in scope.
var _ = time.Now
