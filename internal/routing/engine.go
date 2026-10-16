// Package routing implements the hop-limited shortest-path search, hysteresis,
// and the route table.  FR-R1 through FR-R9.
package routing

import (
	"log/slog"
	"sync"
	"time"

	"github.com/bharatroute/internal/config"
	"github.com/bharatroute/internal/linkstate"
)

// NodeID alias.
type NodeID = config.NodeID

// Graph alias.
type Graph = linkstate.Graph

// Candidate is one evaluated path with cost breakdown.
type Candidate struct {
	Path      []NodeID `json:"path"`
	CostMs    float64  `json:"cost_ms"`
	Breakdown struct {
		LatencyMs float64 `json:"latency_ms"`
		LossMs    float64 `json:"loss_ms"`
		RelayMs   float64 `json:"relay_ms"`
	} `json:"breakdown"`
}

// Route is the active route to a destination.
type Route struct {
	Dst    NodeID    `json:"dst"`
	Path   []NodeID  `json:"path"`
	CostMs float64   `json:"cost_ms"`
	Since  time.Time `json:"since"`
}

// RouteChangeEvent is emitted when the active route changes.
type RouteChangeEvent struct {
	Dst      NodeID
	OldPath  []NodeID
	NewPath  []NodeID
	OldCost  float64
	NewCost  float64
	Reason   string // "better_path" | "link_down" | "node_down" | "link_degraded"
}

// pendingSwitch tracks a candidate that hasn't yet met the confirmation threshold.
type pendingSwitch struct {
	path  []NodeID
	count int
}

// Engine manages routes for one source node.
type Engine struct {
	mu     sync.RWMutex
	self   NodeID
	params config.Params

	routes  map[NodeID]*Route
	pending map[NodeID]*pendingSwitch
	lastChg map[NodeID]time.Time

	OnChange func(RouteChangeEvent)
}

// New creates a routing Engine for the given source node.
func New(self NodeID, p config.Params) *Engine {
	return &Engine{
		self:    self,
		params:  p,
		routes:  make(map[NodeID]*Route),
		pending: make(map[NodeID]*pendingSwitch),
		lastChg: make(map[NodeID]time.Time),
	}
}

// Evaluate re-runs the path search for all destinations reachable in g.
// Returns a map of destinations to their sorted candidate lists.
func (e *Engine) Evaluate(g Graph) map[NodeID][]Candidate {
	e.mu.Lock()
	defer e.mu.Unlock()

	result := make(map[NodeID][]Candidate)
	for dst := range g {
		if dst == e.self {
			continue
		}
		cands := bestPaths(e.self, dst, g, e.params.MaxHops,
			e.params.LossPenaltyMsPerPct, e.params.RelayOverheadMs)
		if len(cands) == 0 {
			continue
		}
		result[dst] = cands
		e.applyHysteresis(dst, cands, g)
	}
	return result
}

// Routes returns a snapshot of all active routes.
func (e *Engine) Routes() []Route {
	e.mu.RLock()
	defer e.mu.RUnlock()
	out := make([]Route, 0, len(e.routes))
	for _, r := range e.routes {
		cp := *r
		out = append(out, cp)
	}
	return out
}

// RouteFor returns the active route to dst, if any.
func (e *Engine) RouteFor(dst NodeID) (Route, bool) {
	e.mu.RLock()
	defer e.mu.RUnlock()
	r, ok := e.routes[dst]
	if !ok {
		return Route{}, false
	}
	return *r, true
}

// applyHysteresis implements FR-R6.
// Must be called with e.mu held.
func (e *Engine) applyHysteresis(dst NodeID, cands []Candidate, g Graph) {
	best := cands[0]
	active := e.routes[dst]

	// No active route — install immediately.
	if active == nil {
		e.install(dst, best, "better_path")
		return
	}

	// If active route is invalid (any link down), switch immediately.
	if !e.routeValid(active, g) {
		reason := "link_down"
		e.install(dst, best, reason)
		return
	}

	activeCost := e.routeCost(active, g)
	if pathEqual(best.Path, active.Path) {
		e.pending[dst] = nil
		return
	}

	// Hysteresis: best must beat active by switch_margin_pct.
	threshold := activeCost * (1 - e.params.SwitchMarginPct/100)
	if best.CostMs < threshold {
		pd := e.pending[dst]
		if pd == nil || !pathEqual(pd.path, best.Path) {
			e.pending[dst] = &pendingSwitch{path: best.Path, count: 1}
		} else {
			pd.count++
		}
		if e.pending[dst].count >= e.params.SwitchConfirmations &&
			time.Since(e.lastChg[dst]) >= time.Duration(e.params.MinDwellMs)*time.Millisecond {
			e.install(dst, best, "better_path")
		}
	} else {
		e.pending[dst] = nil
	}
}

// install sets the active route and fires OnChange.
// Must be called with e.mu held.
func (e *Engine) install(dst NodeID, c Candidate, reason string) {
	old := e.routes[dst]
	var oldPath []NodeID
	var oldCost float64
	if old != nil {
		oldPath = old.Path
		oldCost = old.CostMs
	}
	e.routes[dst] = &Route{Dst: dst, Path: c.Path, CostMs: c.CostMs, Since: time.Now()}
	e.lastChg[dst] = time.Now()
	e.pending[dst] = nil
	slog.Info("route change", "dst", dst, "path", c.Path, "cost_ms", c.CostMs, "reason", reason)
	if e.OnChange != nil {
		go e.OnChange(RouteChangeEvent{
			Dst: dst, OldPath: oldPath, NewPath: c.Path,
			OldCost: oldCost, NewCost: c.CostMs, Reason: reason,
		})
	}
}

// routeValid checks that every link on the path is present and up in g.
func (e *Engine) routeValid(r *Route, g Graph) bool {
	for i := 0; i < len(r.Path)-1; i++ {
		a, b := r.Path[i], r.Path[i+1]
		if _, ok := g[a][b]; !ok {
			return false
		}
	}
	return true
}

// routeCost recomputes the cost of an existing route using current graph metrics.
func (e *Engine) routeCost(r *Route, g Graph) float64 {
	cost := 0.0
	for i := 0; i < len(r.Path)-1; i++ {
		a, b := r.Path[i], r.Path[i+1]
		link, ok := g[a][b]
		if !ok {
			return 1e9 // invalid
		}
		cost += link.RTTMs + e.params.LossPenaltyMsPerPct*link.LossPct
		if i > 0 {
			cost += e.params.RelayOverheadMs // relay node
		}
	}
	return cost
}

// bestPaths runs a hop-limited DFS to enumerate all paths from src to dst
// (Section 7.3).  Returns candidates sorted by (cost, hops, node IDs).
func bestPaths(src, dst NodeID, g Graph, maxHops int, lossPenalty, relayOverhead float64) []Candidate {
	var cands []Candidate
	var dfs func(path []NodeID, cost, latency, loss, relay float64)
	dfs = func(path []NodeID, cost, latency, loss, relay float64) {
		node := path[len(path)-1]
		if node == dst {
			c := Candidate{Path: copyPath(path), CostMs: cost}
			c.Breakdown.LatencyMs = latency
			c.Breakdown.LossMs = loss
			c.Breakdown.RelayMs = relay
			cands = append(cands, c)
			return
		}
		if len(path)-1 == maxHops {
			return
		}
		for nbr, link := range g[node] {
			if inPath(nbr, path) {
				continue
			}
			linkCost := link.RTTMs + lossPenalty*link.LossPct
			ro := 0.0
			if nbr != dst {
				ro = relayOverhead
			}
			dfs(append(path, nbr), cost+linkCost+ro,
				latency+link.RTTMs, loss+lossPenalty*link.LossPct, relay+ro)
		}
	}
	dfs([]NodeID{src}, 0, 0, 0, 0)

	// Sort: cost ASC, hops ASC, then by node ID sequence.
	sortCandidates(cands)
	return cands
}

func copyPath(p []NodeID) []NodeID {
	c := make([]NodeID, len(p))
	copy(c, p)
	return c
}

func inPath(id NodeID, path []NodeID) bool {
	for _, n := range path {
		if n == id {
			return true
		}
	}
	return false
}

func pathEqual(a, b []NodeID) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

// sortCandidates sorts in place: cost ASC, hops ASC.
func sortCandidates(cands []Candidate) {
	for i := 1; i < len(cands); i++ {
		for j := i; j > 0; j-- {
			a, b := cands[j-1], cands[j]
			if a.CostMs > b.CostMs ||
				(a.CostMs == b.CostMs && len(a.Path) > len(b.Path)) {
				cands[j-1], cands[j] = cands[j], cands[j-1]
			} else {
				break
			}
		}
	}
}
