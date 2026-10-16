// Package api implements the REST API and WebSocket hub (Section 8).
// FR-A1 through FR-A5.
package api

import (
	"context"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
)

// State is the full snapshot returned by GET /api/v1/state.
type State struct {
	Mode   string        `json:"mode"`
	Self   string        `json:"self"`
	Now    time.Time     `json:"now"`
	Nodes  []NodeInfo    `json:"nodes"`
	Links  []LinkInfo    `json:"links"`
	Routes []RouteInfo   `json:"routes"`
	Params interface{}   `json:"params"`
}

// NodeInfo is a node in the API response.
type NodeInfo struct {
	ID     uint16  `json:"id"`
	Name   string  `json:"name"`
	Label  string  `json:"label"`
	Region string  `json:"region"`
	Pos    Pos     `json:"pos"`
	State  string  `json:"state"`
	Role   string  `json:"role"`
}

// Pos is a normalized (0-1) position for the graph.
type Pos struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

// LinkInfo is a link in the API response.
type LinkInfo struct {
	A        uint16  `json:"a"`
	B        uint16  `json:"b"`
	RTTMs    float64 `json:"rtt_ms"`
	LossPct  float64 `json:"loss_pct"`
	JitterMs float64 `json:"jitter_ms"`
	State    string  `json:"state"`
	Kind     string  `json:"kind"` // "direct" | "overlay"
}

// RouteInfo is the active route plus direct cost for the API.
type RouteInfo struct {
	Dst           uint16      `json:"dst"`
	Active        *ActiveRoute `json:"active,omitempty"`
	Direct        *DirectRoute `json:"direct,omitempty"`
	ImprovementMs *float64    `json:"improvement_ms,omitempty"`
}

// ActiveRoute is the currently selected route.
type ActiveRoute struct {
	Path   []uint16  `json:"path"`
	CostMs float64   `json:"cost_ms"`
	Since  time.Time `json:"since"`
}

// DirectRoute is the direct (one-hop) route metrics.
type DirectRoute struct {
	Path   []uint16 `json:"path"`
	CostMs *float64 `json:"cost_ms"`
}

// WsEnvelope is the WebSocket message envelope.
type WsEnvelope struct {
	Type string      `json:"type"`
	TS   time.Time   `json:"ts"`
	Data interface{} `json:"data"`
}

// Hub manages WebSocket clients and broadcasts events.
type Hub struct {
	mu      sync.RWMutex
	clients map[*client]struct{}
}

type client struct {
	conn *websocket.Conn
	send chan WsEnvelope
	done chan struct{}
}

// NewHub creates a WebSocket hub.
func NewHub() *Hub {
	return &Hub{clients: make(map[*client]struct{})}
}

// Broadcast sends an event to all connected clients.
func (h *Hub) Broadcast(msg WsEnvelope) {
	h.mu.RLock()
	clients := make([]*client, 0, len(h.clients))
	for c := range h.clients {
		clients = append(clients, c)
	}
	h.mu.RUnlock()
	for _, c := range clients {
		select {
		case c.send <- msg:
		default:
			// client too slow — skip
		}
	}
}

// ServeWS upgrades an HTTP connection to WebSocket and starts pumping events.
func (h *Hub) ServeWS(w http.ResponseWriter, r *http.Request, initialSnapshot func() WsEnvelope) {
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		InsecureSkipVerify: true, // CORS handled by middleware
	})
	if err != nil {
		slog.Warn("ws accept error", "err", err)
		return
	}
	c := &client{conn: conn, send: make(chan WsEnvelope, 64), done: make(chan struct{})}
	h.mu.Lock()
	h.clients[c] = struct{}{}
	h.mu.Unlock()

	ctx := r.Context()

	// Send hello + snapshot immediately.
	_ = wsjson.Write(ctx, conn, WsEnvelope{Type: "hello", TS: time.Now(), Data: map[string]string{"status": "ok"}})
	_ = wsjson.Write(ctx, conn, initialSnapshot())

	// Write pump.
	go func() {
		defer func() {
			h.mu.Lock()
			delete(h.clients, c)
			h.mu.Unlock()
			conn.Close(websocket.StatusNormalClosure, "bye")
			close(c.done)
		}()
		for {
			select {
			case msg, ok := <-c.send:
				if !ok {
					return
				}
				if err := wsjson.Write(ctx, conn, msg); err != nil {
					return
				}
			case <-ctx.Done():
				return
			}
		}
	}()
}

// Server is the HTTP server for the API.
type Server struct {
	hub      *Hub
	mux      *http.ServeMux
	mode     string
	version  string
	nodeID   string
	startedAt time.Time

	// Callbacks provided by the node/simulator.
	GetState      func() State
	GetMatrix     func() MatrixResponse
	GetCandidates func(dst string) (CandidatesResponse, error)
	GetHistory    func(a, b string, windowS int) []HistoryPoint
	GetPathHistory func(src, dst string, windowS int) []PathHistoryPoint
	PostSimEvent  func(ev SimEvent) error
	GetScenario   func() interface{}
	ResetSim      func() error
	GetParams     func() interface{}
	PutParams     func(raw json.RawMessage) error
	StartBench    func(raw json.RawMessage) (string, error)
	GetBenchRuns  func() interface{}
	GetBenchRun   func(id string) (interface{}, bool)
	CancelBench   func(id string) bool
	GetProbeCSV   func(from, to string) ([][]string, error)
	GetRouteCSV   func(from, to string) ([][]string, error)
	SimMode       bool
}

// MatrixResponse is returned by GET /api/v1/matrix.
type MatrixResponse struct {
	Nodes []string    `json:"nodes"`
	RTT   [][]float64 `json:"rtt"`
	Loss  [][]float64 `json:"loss"`
}

// CandidatesResponse is returned by GET /api/v1/routes/{dst}.
type CandidatesResponse struct {
	Dst        uint16      `json:"dst"`
	Active     interface{} `json:"active"`
	Candidates interface{} `json:"candidates"`
}

// HistoryPoint is one time-series point for a link.
type HistoryPoint struct {
	TS     time.Time `json:"ts"`
	RTTMs  float64   `json:"rtt_ms"`
	EWMAMs float64   `json:"ewma_ms"`
	LossPct float64  `json:"loss_pct"`
	State  string    `json:"state"`
}

// PathHistoryPoint is a direct-vs-overlay RTT data point.
type PathHistoryPoint struct {
	TS        time.Time `json:"ts"`
	DirectMs  *float64  `json:"direct_ms"`
	OverlayMs *float64  `json:"overlay_ms"`
}

// SimEvent is a POST /api/v1/sim/events request body.
type SimEvent struct {
	Type     string  `json:"type"`
	A        string  `json:"a,omitempty"`
	B        string  `json:"b,omitempty"`
	Node     string  `json:"node,omitempty"`
	RTTMs    float64 `json:"rtt_ms,omitempty"`
	JitterMs float64 `json:"jitter_ms,omitempty"`
	LossPct  float64 `json:"loss_pct,omitempty"`
}

// New creates a Server and registers all routes.
func New(mode, version, nodeID string, hub *Hub) *Server {
	s := &Server{
		hub:       hub,
		mux:       http.NewServeMux(),
		mode:      mode,
		version:   version,
		nodeID:    nodeID,
		startedAt: time.Now(),
	}
	s.registerRoutes()
	return s
}

func (s *Server) registerRoutes() {
	m := s.mux
	m.HandleFunc("GET /health", s.handleHealth)
	m.HandleFunc("GET /api/v1/health", s.handleHealth)
	m.HandleFunc("GET /api/v1/state", s.handleState)
	m.HandleFunc("GET /api/v1/nodes", s.handleNodes)
	m.HandleFunc("GET /api/v1/links", s.handleLinks)
	m.HandleFunc("GET /api/v1/matrix", s.handleMatrix)
	m.HandleFunc("GET /api/v1/routes", s.handleRoutes)
	m.HandleFunc("GET /api/v1/routes/{dst}", s.handleRouteDst)
	m.HandleFunc("GET /api/v1/history/links/{ab}", s.handleLinkHistory)
	m.HandleFunc("GET /api/v1/history/path", s.handlePathHistory)
	m.HandleFunc("POST /api/v1/benchmarks", s.handleBenchStart)
	m.HandleFunc("GET /api/v1/benchmarks", s.handleBenchList)
	m.HandleFunc("GET /api/v1/benchmarks/{id}", s.handleBenchGet)
	m.HandleFunc("DELETE /api/v1/benchmarks/{id}", s.handleBenchCancel)
	m.HandleFunc("GET /api/v1/params", s.handleParamsGet)
	m.HandleFunc("PUT /api/v1/params", s.handleParamsPut)
	m.HandleFunc("POST /api/v1/sim/events", s.handleSimEvent)
	m.HandleFunc("GET /api/v1/sim/scenario", s.handleSimScenario)
	m.HandleFunc("POST /api/v1/sim/reset", s.handleSimReset)
	m.HandleFunc("GET /api/v1/export/probes", s.handleExportProbes)
	m.HandleFunc("GET /api/v1/export/routes", s.handleExportRoutes)
	m.HandleFunc("GET /ws", s.handleWS)
	m.HandleFunc("GET /", s.handleStaticOrIndex)
}

// ServeHTTP implements http.Handler with CORS middleware.
func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	if origin != "" {
		w.Header().Set("Access-Control-Allow-Origin", origin)
	} else {
		w.Header().Set("Access-Control-Allow-Origin", "*")
	}
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	s.mux.ServeHTTP(w, r)
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	jsonOK(w, map[string]interface{}{
		"status":   "ok",
		"version":  s.version,
		"mode":     s.mode,
		"node_id":  s.nodeID,
		"uptime_s": time.Since(s.startedAt).Seconds(),
	})
}

func (s *Server) handleState(w http.ResponseWriter, r *http.Request) {
	if s.GetState == nil {
		jsonErr(w, "not_ready", "state not available", 503)
		return
	}
	jsonOK(w, s.GetState())
}

func (s *Server) handleNodes(w http.ResponseWriter, r *http.Request) {
	if s.GetState == nil {
		jsonErr(w, "not_ready", "state not available", 503)
		return
	}
	jsonOK(w, s.GetState().Nodes)
}

func (s *Server) handleLinks(w http.ResponseWriter, r *http.Request) {
	if s.GetState == nil {
		jsonErr(w, "not_ready", "state not available", 503)
		return
	}
	jsonOK(w, s.GetState().Links)
}

func (s *Server) handleMatrix(w http.ResponseWriter, r *http.Request) {
	if s.GetMatrix == nil {
		jsonErr(w, "not_ready", "matrix not available", 503)
		return
	}
	jsonOK(w, s.GetMatrix())
}

func (s *Server) handleRoutes(w http.ResponseWriter, r *http.Request) {
	if s.GetState == nil {
		jsonErr(w, "not_ready", "state not available", 503)
		return
	}
	jsonOK(w, s.GetState().Routes)
}

func (s *Server) handleRouteDst(w http.ResponseWriter, r *http.Request) {
	dst := r.PathValue("dst")
	if s.GetCandidates == nil {
		jsonErr(w, "not_ready", "candidates not available", 503)
		return
	}
	resp, err := s.GetCandidates(dst)
	if err != nil {
		jsonErr(w, "not_found", err.Error(), 404)
		return
	}
	jsonOK(w, resp)
}

func (s *Server) handleLinkHistory(w http.ResponseWriter, r *http.Request) {
	ab := r.PathValue("ab")
	parts := strings.SplitN(ab, "-", 2)
	if len(parts) != 2 {
		jsonErr(w, "invalid_param", "use /history/links/A-B", 400)
		return
	}
	window := 300
	if v := r.URL.Query().Get("window_s"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			window = n
		}
	}
	if s.GetHistory == nil {
		jsonOK(w, []interface{}{})
		return
	}
	jsonOK(w, s.GetHistory(parts[0], parts[1], window))
}

func (s *Server) handlePathHistory(w http.ResponseWriter, r *http.Request) {
	src := r.URL.Query().Get("src")
	dst := r.URL.Query().Get("dst")
	window := 300
	if v := r.URL.Query().Get("window_s"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			window = n
		}
	}
	if s.GetPathHistory == nil {
		jsonOK(w, []interface{}{})
		return
	}
	jsonOK(w, s.GetPathHistory(src, dst, window))
}

func (s *Server) handleBenchStart(w http.ResponseWriter, r *http.Request) {
	var raw json.RawMessage
	if err := json.NewDecoder(r.Body).Decode(&raw); err != nil {
		jsonErr(w, "invalid_body", err.Error(), 400)
		return
	}
	if s.StartBench == nil {
		jsonErr(w, "not_ready", "benchmark not available", 503)
		return
	}
	id, err := s.StartBench(raw)
	if err != nil {
		jsonErr(w, "bench_error", err.Error(), 400)
		return
	}
	w.WriteHeader(http.StatusAccepted)
	jsonOK(w, map[string]string{"id": id, "run_id": id, "status": "running"})
}

func (s *Server) handleBenchList(w http.ResponseWriter, r *http.Request) {
	if s.GetBenchRuns == nil {
		jsonOK(w, []interface{}{})
		return
	}
	jsonOK(w, s.GetBenchRuns())
}

func (s *Server) handleBenchGet(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if s.GetBenchRun == nil {
		jsonErr(w, "not_found", "no such run", 404)
		return
	}
	res, ok := s.GetBenchRun(id)
	if !ok {
		jsonErr(w, "not_found", "no such run", 404)
		return
	}
	jsonOK(w, res)
}

func (s *Server) handleBenchCancel(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if s.CancelBench != nil {
		s.CancelBench(id)
	}
	jsonOK(w, map[string]string{"status": "cancelled"})
}

func (s *Server) handleParamsGet(w http.ResponseWriter, r *http.Request) {
	if s.GetParams == nil {
		jsonErr(w, "not_ready", "params not available", 503)
		return
	}
	jsonOK(w, s.GetParams())
}

func (s *Server) handleParamsPut(w http.ResponseWriter, r *http.Request) {
	var raw json.RawMessage
	if err := json.NewDecoder(r.Body).Decode(&raw); err != nil {
		jsonErr(w, "invalid_body", err.Error(), 400)
		return
	}
	if s.PutParams == nil {
		jsonErr(w, "not_ready", "params not available", 503)
		return
	}
	if err := s.PutParams(raw); err != nil {
		jsonErr(w, "invalid_param", err.Error(), 400)
		return
	}
	jsonOK(w, map[string]string{"status": "ok"})
}

func (s *Server) handleSimEvent(w http.ResponseWriter, r *http.Request) {
	if !s.SimMode {
		jsonErr(w, "not_sim", "sim events only available in sim mode", 404)
		return
	}
	var ev SimEvent
	if err := json.NewDecoder(r.Body).Decode(&ev); err != nil {
		jsonErr(w, "invalid_body", err.Error(), 400)
		return
	}
	if s.PostSimEvent == nil {
		jsonErr(w, "not_ready", "sim not available", 503)
		return
	}
	if err := s.PostSimEvent(ev); err != nil {
		jsonErr(w, "sim_error", err.Error(), 400)
		return
	}
	jsonOK(w, map[string]string{"status": "ok"})
}

func (s *Server) handleSimScenario(w http.ResponseWriter, r *http.Request) {
	if s.GetScenario == nil {
		jsonOK(w, nil)
		return
	}
	jsonOK(w, s.GetScenario())
}

func (s *Server) handleSimReset(w http.ResponseWriter, r *http.Request) {
	if s.ResetSim == nil {
		jsonErr(w, "not_ready", "sim not available", 503)
		return
	}
	if err := s.ResetSim(); err != nil {
		jsonErr(w, "reset_error", err.Error(), 500)
		return
	}
	jsonOK(w, map[string]string{"status": "ok"})
}

func (s *Server) handleExportProbes(w http.ResponseWriter, r *http.Request) {
	from := r.URL.Query().Get("from")
	to := r.URL.Query().Get("to")
	if s.GetProbeCSV == nil {
		http.Error(w, "not available", 503)
		return
	}
	rows, err := s.GetProbeCSV(from, to)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	w.Header().Set("Content-Type", "text/csv")
	w.Header().Set("Content-Disposition", "attachment; filename=probes.csv")
	cw := csv.NewWriter(w)
	_ = cw.WriteAll(rows)
}

func (s *Server) handleExportRoutes(w http.ResponseWriter, r *http.Request) {
	from := r.URL.Query().Get("from")
	to := r.URL.Query().Get("to")
	if s.GetRouteCSV == nil {
		http.Error(w, "not available", 503)
		return
	}
	rows, err := s.GetRouteCSV(from, to)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	w.Header().Set("Content-Type", "text/csv")
	w.Header().Set("Content-Disposition", "attachment; filename=routes.csv")
	cw := csv.NewWriter(w)
	_ = cw.WriteAll(rows)
}

func (s *Server) handleWS(w http.ResponseWriter, r *http.Request) {
	snapshot := func() WsEnvelope {
		if s.GetState != nil {
			return WsEnvelope{Type: "snapshot", TS: time.Now(), Data: s.GetState()}
		}
		return WsEnvelope{Type: "snapshot", TS: time.Now(), Data: nil}
	}
	s.hub.ServeWS(w, r, snapshot)
}

// StartPeriodicSnapshot sends a snapshot every 5 s to all clients.
func (s *Server) StartPeriodicSnapshot(ctx context.Context) {
	ticker := time.NewTicker(5 * time.Second)
	go func() {
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				if s.GetState != nil {
					s.hub.Broadcast(WsEnvelope{Type: "snapshot", TS: time.Now(), Data: s.GetState()})
				}
			}
		}
	}()
}

// handleStaticOrIndex serves built frontend files if present.
func (s *Server) handleStaticOrIndex(w http.ResponseWriter, r *http.Request) {
	candidates := []string{"web/dist", "./dist", "../web/dist"}
	var distDir string
	for _, dir := range candidates {
		if fi, err := os.Stat(filepath.Join(dir, "index.html")); err == nil && !fi.IsDir() {
			distDir = dir
			break
		}
	}

	if distDir == "" {
		http.NotFound(w, r)
		return
	}

	cleanPath := path.Clean(r.URL.Path)
	target := filepath.Join(distDir, filepath.FromSlash(cleanPath))
	if fi, err := os.Stat(target); err == nil && !fi.IsDir() {
		http.ServeFile(w, r, target)
		return
	}

	// SPA fallback
	http.ServeFile(w, r, filepath.Join(distDir, "index.html"))
}

// helpers

func jsonOK(w http.ResponseWriter, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}

func jsonErr(w http.ResponseWriter, code, msg string, status int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"error": map[string]string{"code": code, "message": msg},
	})
}

// Unused import guard.
var _ = fmt.Sprintf
var _ = slog.Info
var _ = os.Stderr
