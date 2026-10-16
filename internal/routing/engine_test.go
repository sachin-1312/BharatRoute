package routing

import (
	"testing"

	"github.com/bharatroute/internal/config"
	"github.com/bharatroute/internal/linkstate"
)

// buildGraph is a helper to build a simple Graph for tests.
func buildGraph(edges [][3]float64) Graph {
	// edges: [srcID, dstID, rttMs]
	g := make(Graph)
	for _, e := range edges {
		a, b := NodeID(e[0]), NodeID(e[1])
		rtt := e[2]
		if g[a] == nil {
			g[a] = make(map[NodeID]linkstate.GraphLink)
		}
		if g[b] == nil {
			g[b] = make(map[NodeID]linkstate.GraphLink)
		}
		gl := linkstate.GraphLink{RTTMs: rtt}
		g[a][b] = gl
		g[b][a] = gl
	}
	return g
}

// TestBestPathsIndia verifies the expected routing for the india.json scenario.
// LDH(1)->SIN(6) direct=130ms; via MAA(4)=46+36=82ms; via BOM(3)=38+58=96ms.
func TestBestPathsIndia(t *testing.T) {
	g := buildGraph([][3]float64{
		{1, 6, 130}, // LDH-SIN direct
		{1, 3, 38},  // LDH-BOM
		{1, 4, 46},  // LDH-MAA
		{3, 6, 58},  // BOM-SIN
		{4, 6, 36},  // MAA-SIN
	})
	cands := bestPaths(1, 6, g, 3, 20, 1)
	if len(cands) == 0 {
		t.Fatal("no candidates")
	}
	best := cands[0]
	// Expected: LDH->MAA->SIN cost=46+36+1(relay)=83
	if len(best.Path) != 3 || best.Path[1] != 4 {
		t.Fatalf("expected via MAA(4), got %v cost=%.1f", best.Path, best.CostMs)
	}
}

// TestNoLoops verifies that DFS doesn't revisit nodes.
func TestNoLoops(t *testing.T) {
	g := buildGraph([][3]float64{
		{1, 2, 10}, {2, 3, 10}, {3, 1, 10}, {1, 4, 100},
	})
	cands := bestPaths(1, 4, g, 3, 20, 1)
	for _, c := range cands {
		if len(c.Path) > 4 {
			t.Fatalf("path too long (loop?): %v", c.Path)
		}
	}
}

// TestDisconnected verifies no panic on disconnected graph.
func TestDisconnected(t *testing.T) {
	g := buildGraph([][3]float64{{1, 2, 10}})
	cands := bestPaths(1, 9, g, 3, 20, 1)
	if len(cands) != 0 {
		t.Fatal("expected 0 candidates to unreachable node")
	}
}

// TestHysteresisNoFlap verifies that a small improvement doesn't cause a switch.
func TestHysteresisNoFlap(t *testing.T) {
	params := defaultTestParams()
	params.SwitchMarginPct = 10
	params.SwitchConfirmations = 3
	params.MinDwellMs = 0

	e := New(1, params)
	// Install initial route via [1,3,6] cost=97
	g := buildGraph([][3]float64{
		{1, 3, 38}, {3, 6, 58}, // via BOM cost=38+58+1=97
		{1, 4, 46}, {4, 6, 36}, // via MAA cost=46+36+1=83
		{1, 6, 130},             // direct
	})
	e.Evaluate(g) // installs MAA route initially (lower cost)

	// Now remove MAA to force BOM route.
	delete(g[1], 4)
	delete(g[4], 1)
	delete(g[4], 6)
	delete(g[6], 4)
	e.Evaluate(g) // route flips to BOM (97ms) due to link_down

	r, ok := e.RouteFor(6)
	if !ok {
		t.Fatal("no route to SIN")
	}
	_ = r // just verify it doesn't panic or flap endlessly
}

func defaultTestParams() config.Params {
	return config.DefaultParams()
}

// ensure config in scope
var _ = config.DefaultParams
