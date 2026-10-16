// Package bench implements the benchmark runner (FR-B1 through FR-B7).
package bench

import (
	"context"
	"fmt"
	"math"
	"sort"
	"sync"
	"sync/atomic"
	"time"

	"github.com/bharatroute/internal/config"
)

// NodeID alias.
type NodeID = config.NodeID

// Stats holds per-mode statistics for a benchmark run.
type Stats struct {
	Sent     int     `json:"sent"`
	Received int     `json:"received"`
	LossPct  float64 `json:"loss_pct"`
	Min      float64 `json:"min"`
	Mean     float64 `json:"mean"`
	Median   float64 `json:"median"`
	P95      float64 `json:"p95"`
	P99      float64 `json:"p99"`
	Max      float64 `json:"max"`
	Jitter   float64 `json:"jitter"`
	Path     []NodeID `json:"path,omitempty"`
}

// Result is the completed result of a benchmark run.
type Result struct {
	ID                  string  `json:"id"`
	Status              string  `json:"status"` // running | done | cancelled | error
	Mode                string  `json:"mode"`
	Src                 string  `json:"src"`
	Dst                 string  `json:"dst"`
	Count               int     `json:"count"`
	Direct              Stats   `json:"direct"`
	Overlay             Stats   `json:"overlay"`
	OverlayWinRatePct   float64 `json:"overlay_win_rate_pct"`
	MedianImprovementMs float64 `json:"median_improvement_ms"`
	P95ImprovementMs    float64 `json:"p95_improvement_ms"`
}

// ProgressEvent is sent over the WebSocket while a run is active.
type ProgressEvent struct {
	ID            string  `json:"id"`
	Done          int     `json:"done"`
	Total         int     `json:"total"`
	LastRTTDirect float64 `json:"last_rtt_direct"`
	LastRTTOverlay float64 `json:"last_rtt_overlay"`
}

// RunRequest is the POST body to start a benchmark.
type RunRequest struct {
	Src          string   `json:"src"`
	Dst          string   `json:"dst"`
	Count        int      `json:"count"`
	IntervalMs   int      `json:"interval_ms"`
	PayloadBytes int      `json:"payload_bytes"`
	Modes        []string `json:"modes"`
}

// EchoFunc sends an echo probe on the given path and returns RTT in ms, or
// (0, error) on timeout. It is provided by the node so the bench package has
// no import cycle.
type EchoFunc func(ctx context.Context, path []NodeID) (float64, error)

// Runner manages benchmark runs.
type Runner struct {
	mu      sync.Mutex
	runs    map[string]*runState
	mode    string // "sim" | "live"
	OnProgress func(ProgressEvent)
	OnDone     func(Result)
}

type runState struct {
	result Result
	cancel context.CancelFunc
	done   atomic.Bool
}

// NewRunner creates a benchmark runner.
func NewRunner(mode string) *Runner {
	return &Runner{mode: mode, runs: make(map[string]*runState)}
}

// Start begins a benchmark run asynchronously and returns the run ID.
func (r *Runner) Start(req RunRequest, directFn, overlayFn EchoFunc, overlayPath []NodeID) (string, error) {
	if req.Count <= 0 {
		req.Count = 200
	}
	if req.IntervalMs <= 0 {
		req.IntervalMs = 100
	}
	id := fmt.Sprintf("bench_%s", time.Now().Format("20060102_150405"))
	ctx, cancel := context.WithCancel(context.Background())
	rs := &runState{
		result: Result{ID: id, Status: "running", Mode: r.mode, Src: req.Src, Dst: req.Dst, Count: req.Count},
		cancel: cancel,
	}
	r.mu.Lock()
	r.runs[id] = rs
	r.mu.Unlock()
	go r.run(ctx, rs, req, directFn, overlayFn, overlayPath)
	return id, nil
}

func (r *Runner) run(ctx context.Context, rs *runState, req RunRequest, directFn, overlayFn EchoFunc, overlayPath []NodeID) {
	defer rs.done.Store(true)
	interval := time.Duration(req.IntervalMs) * time.Millisecond
	warmup := 10 // discard first 10 per mode

	var directRTTs, overlayRTTs []float64
	var directPairs, overlayPairs []float64 // for win rate

	directSent, overlaySent := 0, 0
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	i := 0
	for {
		select {
		case <-ctx.Done():
			rs.result.Status = "cancelled"
			if r.OnDone != nil {
				r.OnDone(rs.result)
			}
			return
		case <-ticker.C:
			if i >= req.Count*2 {
				goto done
			}
			// Alternate direct/overlay (FR-B2)
			var rtt float64
			var err error
			if i%2 == 0 {
				directSent++
				rtt, err = directFn(ctx, nil)
				if i >= warmup*2 {
					if err != nil {
						directRTTs = append(directRTTs, math.Inf(1))
					} else {
						directRTTs = append(directRTTs, rtt)
					}
					directPairs = append(directPairs, rttOrInf(rtt, err))
				}
				if r.OnProgress != nil {
					r.OnProgress(ProgressEvent{ID: rs.result.ID, Done: i, Total: req.Count * 2, LastRTTDirect: rttOrZero(rtt, err)})
				}
			} else {
				overlaySent++
				rtt, err = overlayFn(ctx, overlayPath)
				if i >= warmup*2+1 {
					if err != nil {
						overlayRTTs = append(overlayRTTs, math.Inf(1))
					} else {
						overlayRTTs = append(overlayRTTs, rtt)
					}
					overlayPairs = append(overlayPairs, rttOrInf(rtt, err))
				}
				if r.OnProgress != nil {
					r.OnProgress(ProgressEvent{ID: rs.result.ID, Done: i, Total: req.Count * 2, LastRTTOverlay: rttOrZero(rtt, err)})
				}
			}
			i++
		}
	}
done:
	rs.result.Direct = computeStats(directRTTs, directSent)
	rs.result.Overlay = computeStats(overlayRTTs, overlaySent)
	rs.result.Overlay.Path = overlayPath
	rs.result.OverlayWinRatePct = winRate(directPairs, overlayPairs)
	rs.result.MedianImprovementMs = rs.result.Direct.Median - rs.result.Overlay.Median
	rs.result.P95ImprovementMs = rs.result.Direct.P95 - rs.result.Overlay.P95
	rs.result.Status = "done"
	if r.OnDone != nil {
		r.OnDone(rs.result)
	}
}

// Cancel cancels a running benchmark.
func (r *Runner) Cancel(id string) bool {
	r.mu.Lock()
	rs, ok := r.runs[id]
	r.mu.Unlock()
	if ok {
		rs.cancel()
	}
	return ok
}

// Get returns the result for a run ID.
func (r *Runner) Get(id string) (Result, bool) {
	r.mu.Lock()
	rs, ok := r.runs[id]
	r.mu.Unlock()
	if !ok {
		return Result{}, false
	}
	return rs.result, true
}

// List returns all run results.
func (r *Runner) List() []Result {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := make([]Result, 0, len(r.runs))
	for _, rs := range r.runs {
		out = append(out, rs.result)
	}
	return out
}

// computeStats computes statistics over a slice of RTTs (some may be +Inf = lost).
func computeStats(rtts []float64, sent int) Stats {
	var answered []float64
	for _, v := range rtts {
		if !math.IsInf(v, 1) {
			answered = append(answered, v)
		}
	}
	n := len(answered)
	if n == 0 {
		return Stats{Sent: sent, Received: 0, LossPct: 100}
	}
	sort.Float64s(answered)
	s := Stats{
		Sent:     sent,
		Received: n,
		LossPct:  float64(sent-n) * 100 / float64(sent),
		Min:      answered[0],
		Max:      answered[n-1],
		Median:   percentile(answered, 50),
		P95:      percentile(answered, 95),
		P99:      percentile(answered, 99),
	}
	sum := 0.0
	for _, v := range answered {
		sum += v
	}
	s.Mean = sum / float64(n)
	// Jitter = mean absolute difference between consecutive samples.
	if n > 1 {
		acc := 0.0
		for i := 1; i < n; i++ {
			d := answered[i] - answered[i-1]
			if d < 0 {
				d = -d
			}
			acc += d
		}
		s.Jitter = acc / float64(n-1)
	}
	return s
}

// percentile uses the nearest-rank method (Section 7.5).
func percentile(sorted []float64, pct float64) float64 {
	n := len(sorted)
	if n == 0 {
		return 0
	}
	idx := int(math.Ceil(pct/100*float64(n))) - 1
	if idx < 0 {
		idx = 0
	}
	if idx >= n {
		idx = n - 1
	}
	return sorted[idx]
}

// winRate computes the percentage of pairs where overlay wins (Section 7.5).
func winRate(direct, overlay []float64) float64 {
	wins := 0
	total := 0
	n := len(direct)
	if len(overlay) < n {
		n = len(overlay)
	}
	for i := 0; i < n; i++ {
		d, o := direct[i], overlay[i]
		if math.IsInf(d, 1) && math.IsInf(o, 1) {
			continue // both lost — exclude (Section 7.5)
		}
		total++
		if o < d {
			wins++
		}
	}
	if total == 0 {
		return 0
	}
	return float64(wins) * 100 / float64(total)
}

func rttOrInf(rtt float64, err error) float64 {
	if err != nil {
		return math.Inf(1)
	}
	return rtt
}

func rttOrZero(rtt float64, err error) float64 {
	if err != nil {
		return 0
	}
	return rtt
}

