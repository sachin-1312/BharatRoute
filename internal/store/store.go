// Package store provides ring buffers for time-series data and CSV writers.
// FR-P7, FR-D1, FR-D2, FR-D3.
package store

import (
	"encoding/csv"
	"fmt"
	"os"
	"sync"
	"time"
)

// ProbeSample is one row in the probe CSV (FR-D1).
type ProbeSample struct {
	TS       time.Time
	Node     string
	Peer     string
	Seq      uint32
	RTTMs    float64
	EWMAMs   float64
	LossPct  float64
	JitterMs float64
	State    string
	Mode     string // "sim" | "live"
}

// RouteEvent is one row in the route CSV (FR-D2).
type RouteEvent struct {
	TS       time.Time
	Dst      string
	OldPath  string
	NewPath  string
	OldCost  float64
	NewCost  float64
	Reason   string
}

// Ring is a fixed-capacity circular buffer of any type.
type Ring[T any] struct {
	mu   sync.RWMutex
	buf  []T
	head int
	size int
	cap  int
}

// NewRing creates a ring buffer with the given capacity.
func NewRing[T any](cap int) *Ring[T] {
	return &Ring[T]{buf: make([]T, cap), cap: cap}
}

// Push appends an element, overwriting the oldest if full.
func (r *Ring[T]) Push(v T) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.buf[r.head%r.cap] = v
	r.head++
	if r.size < r.cap {
		r.size++
	}
}

// Slice returns all elements in chronological order (oldest first).
func (r *Ring[T]) Slice() []T {
	r.mu.RLock()
	defer r.mu.RUnlock()
	if r.size == 0 {
		return nil
	}
	out := make([]T, r.size)
	start := (r.head - r.size + r.cap*1000) % r.cap
	for i := 0; i < r.size; i++ {
		out[i] = r.buf[(start+i)%r.cap]
	}
	return out
}

// Len returns the number of elements currently stored.
func (r *Ring[T]) Len() int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.size
}

// ProbeWriter appends probe samples to a date-partitioned CSV file.
type ProbeWriter struct {
	mu      sync.Mutex
	dataDir string
	mode    string
}

// NewProbeWriter creates a writer that appends to dataDir/probes-<node>-<date>.csv.
func NewProbeWriter(dataDir, mode string) *ProbeWriter {
	return &ProbeWriter{dataDir: dataDir, mode: mode}
}

// Write appends one sample.
func (w *ProbeWriter) Write(s ProbeSample) error {
	w.mu.Lock()
	defer w.mu.Unlock()
	date := s.TS.Format("20060102")
	path := fmt.Sprintf("%s/probes-%s-%s.csv", w.dataDir, s.Node, date)
	needHeader := !fileExists(path)
	f, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0644)
	if err != nil {
		return err
	}
	defer f.Close()
	cw := csv.NewWriter(f)
	if needHeader {
		_ = cw.Write([]string{"ts_iso", "node", "peer", "seq", "rtt_ms", "ewma_ms", "loss_pct", "jitter_ms", "state", "mode"})
	}
	err = cw.Write([]string{
		s.TS.UTC().Format(time.RFC3339Nano),
		s.Node, s.Peer,
		fmt.Sprintf("%d", s.Seq),
		fmt.Sprintf("%.3f", s.RTTMs),
		fmt.Sprintf("%.3f", s.EWMAMs),
		fmt.Sprintf("%.2f", s.LossPct),
		fmt.Sprintf("%.3f", s.JitterMs),
		s.State, s.Mode,
	})
	cw.Flush()
	return err
}

// RouteWriter appends route events to a date-partitioned CSV file.
type RouteWriter struct {
	mu      sync.Mutex
	dataDir string
}

// NewRouteWriter creates a writer for route events.
func NewRouteWriter(dataDir string) *RouteWriter {
	return &RouteWriter{dataDir: dataDir}
}

// Write appends one route event.
func (w *RouteWriter) Write(e RouteEvent) error {
	w.mu.Lock()
	defer w.mu.Unlock()
	date := e.TS.Format("20060102")
	path := fmt.Sprintf("%s/routes-%s.csv", w.dataDir, date)
	needHeader := !fileExists(path)
	f, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0644)
	if err != nil {
		return err
	}
	defer f.Close()
	cw := csv.NewWriter(f)
	if needHeader {
		_ = cw.Write([]string{"ts_iso", "dst", "old_path", "new_path", "old_cost", "new_cost", "reason"})
	}
	err = cw.Write([]string{
		e.TS.UTC().Format(time.RFC3339Nano),
		e.Dst, e.OldPath, e.NewPath,
		fmt.Sprintf("%.3f", e.OldCost),
		fmt.Sprintf("%.3f", e.NewCost),
		e.Reason,
	})
	cw.Flush()
	return err
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}
