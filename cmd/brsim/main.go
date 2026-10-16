// brsim: runs all scenario nodes in one process using SimTransport.
// Usage: brsim --scenario scenarios/india.json --api 127.0.0.1:8080
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/bharatroute/internal/api"
	"github.com/bharatroute/internal/bench"
	"github.com/bharatroute/internal/config"
	"github.com/bharatroute/internal/forwarder"
	"github.com/bharatroute/internal/linkstate"
	"github.com/bharatroute/internal/prober"
	"github.com/bharatroute/internal/proto"
	"github.com/bharatroute/internal/routing"
	"github.com/bharatroute/internal/sim"
	"github.com/bharatroute/internal/store"
	"github.com/bharatroute/internal/transport"
)

const version = "0.1.0-sim"

func main() {
	scenarioPath := flag.String("scenario", "scenarios/india.json", "Path to scenario JSON file")
	apiAddr := flag.String("api", "127.0.0.1:8080", "API listen address")
	dataDir := flag.String("data", "./data", "Directory for CSV logs")
	resultsDir := flag.String("results", "./results", "Directory for benchmark results")
	flag.Parse()

	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelInfo})))

	scenario, err := sim.LoadScenario(*scenarioPath)
	if err != nil {
		slog.Error("load scenario", "err", err)
		os.Exit(1)
	}
	slog.Info("scenario loaded", "name", scenario.Name, "nodes", len(scenario.Nodes))

	_ = os.MkdirAll(*dataDir, 0755)
	_ = os.MkdirAll(*resultsDir, 0755)

	bus, err := sim.NewBus(scenario)
	if err != nil {
		slog.Error("create sim bus", "err", err)
		os.Exit(1)
	}

	params := config.DefaultParams()
	nodes := buildNodes(scenario, bus, params, *dataDir)

	// Register all peers and disable individual read loops so single demuxer handles packets.
	for _, ns := range nodes {
		ns.prb.DisableReadLoop()
		ns.fwd.DisableReadLoop()
		for _, peer := range nodes {
			if peer.id != ns.id {
				ns.prb.AddPeer(peer.id)
				ns.lsdb.AddPeer(peer.id)
				ns.fwd.AddPeer(peer.id)
			}
		}
	}

	// Start all nodes.
	for _, ns := range nodes {
		ns.start()
	}
	go bus.RunTimeline()

	// Gateway = first edge node.
	gateway := nodes[0]
	for _, ns := range nodes {
		if ns.role == "edge" {
			gateway = ns
			break
		}
	}

	hub := api.NewHub()
	srv := buildAPIServer(hub, gateway, nodes, scenario, bus, params, *dataDir, *resultsDir)

	// Broadcast route changes.
	for _, ns := range nodes {
		ns := ns
		ns.engine.OnChange = func(ev routing.RouteChangeEvent) {
			oldStr := pathStr(ev.OldPath)
			newStr := pathStr(ev.NewPath)
			hub.Broadcast(api.WsEnvelope{Type: "route_change", TS: time.Now(), Data: map[string]interface{}{
				"dst": ev.Dst, "old_path": ev.OldPath, "new_path": ev.NewPath,
				"old_cost": ev.OldCost, "new_cost": ev.NewCost, "reason": ev.Reason,
			}})
			hub.Broadcast(api.WsEnvelope{Type: "toast", TS: time.Now(), Data: map[string]string{
				"level":   "info",
				"message": fmt.Sprintf("%s → %s: %s", oldStr, newStr, ev.Reason),
			}})
			// Write to route CSV.
			_ = ns.routeW.Write(store.RouteEvent{
				TS: time.Now(), Dst: fmt.Sprintf("%d", ev.Dst),
				OldPath: oldStr, NewPath: newStr,
				OldCost: ev.OldCost, NewCost: ev.NewCost, Reason: ev.Reason,
			})
		}
	}

	// Live echo probe: 1 per second on the active path.
	go liveEchoProbe(gateway, nodes, scenario, hub)

	ctx, cancel := context.WithCancel(context.Background())
	srv.StartPeriodicSnapshot(ctx)

	httpSrv := &http.Server{Addr: *apiAddr, Handler: srv}
	go func() {
		slog.Info("API listening", "addr", *apiAddr, "mode", "sim")
		if err := httpSrv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("API server", "err", err)
		}
	}()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	<-sigCh
	slog.Info("shutting down")
	cancel()
	shutCtx, shutCancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer shutCancel()
	_ = httpSrv.Shutdown(shutCtx)
}

// nodeState holds all per-node components.
type nodeState struct {
	mu      sync.RWMutex
	id      config.NodeID
	name    string
	label   string
	region  string
	role    string
	posX    float64
	posY    float64
	tr      transport.Transport
	prb     *prober.Prober
	lsdb    *linkstate.LSDB
	engine  *routing.Engine
	fwd     *forwarder.Forwarder
	probeW  *store.ProbeWriter
	routeW  *store.RouteWriter
	// ring buffers keyed by peer id
	rings       map[config.NodeID]*store.Ring[store.ProbeSample]
	echoRing    *store.Ring[echoEntry]
	ringsLock   sync.RWMutex
}

type echoEntry struct {
	TS        time.Time
	DirectMs  *float64
	OverlayMs *float64
	Path      []config.NodeID
}

func buildNodes(scenario *sim.Scenario, bus *sim.Bus, params config.Params, dataDir string) []*nodeState {
	nodes := make([]*nodeState, 0, len(scenario.Nodes))
	for _, nd := range scenario.Nodes {
		tr := bus.Transport(nd.ID)
		ns := &nodeState{
			id:       nd.ID,
			name:     nd.Name,
			label:    nd.Label,
			region:   nd.Region,
			role:     nd.Role,
			posX:     nd.Pos.X,
			posY:     nd.Pos.Y,
			tr:       tr,
			prb:      prober.New(nd.ID, tr, params),
			lsdb:     linkstate.NewLSDB(nd.ID, tr, params),
			engine:   routing.New(nd.ID, params),
			fwd:      forwarder.New(nd.ID, tr),
			probeW:   store.NewProbeWriter(dataDir, "sim"),
			routeW:   store.NewRouteWriter(dataDir),
			rings:    make(map[config.NodeID]*store.Ring[store.ProbeSample]),
			echoRing: store.NewRing[echoEntry](600),
		}
		nodes = append(nodes, ns)
	}
	return nodes
}

func (ns *nodeState) start() {
	// Wire prober → LSDB publish and link-change events.
	ns.prb.OnChange = func(from, to config.NodeID, state string) {
		metrics := ns.prb.Metrics()
		lsLinks := make([]linkstate.LinkMetric, 0, len(metrics))
		for _, m := range metrics {
			lsLinks = append(lsLinks, linkstate.LinkMetric{
				To: m.To, RTTMs: m.RTTMs, LossPct: m.LossPct,
				JitterMs: m.JitterMs, State: m.State,
			})
		}
		ns.lsdb.Publish(lsLinks)
	}
	ns.prb.OnSample = func(from, to config.NodeID, s prober.Sample) {
		sample := store.ProbeSample{
			TS: s.TS, Node: ns.name, Peer: fmt.Sprintf("%d", to),
			Seq: s.Seq, RTTMs: s.RTTMs, EWMAMs: s.EWMAMs,
			LossPct: s.LossPct, JitterMs: s.JitterMs, State: s.State, Mode: "sim",
		}
		ns.ringsLock.Lock()
		if ns.rings[to] == nil {
			ns.rings[to] = store.NewRing[store.ProbeSample](3600) // ~30 min at 500 ms
		}
		ns.rings[to].Push(sample)
		ns.ringsLock.Unlock()
		_ = ns.probeW.Write(sample)
	}

	// Wire LSDB → graph rebuild → routing.
	ns.lsdb.OnChange = func() {
		g := ns.lsdb.BuildGraph()
		ns.engine.Evaluate(g)
		// Publish updated metrics after graph change.
		metrics := ns.prb.Metrics()
		lsLinks := make([]linkstate.LinkMetric, 0, len(metrics))
		for _, m := range metrics {
			lsLinks = append(lsLinks, linkstate.LinkMetric{
				To: m.To, RTTMs: m.RTTMs, LossPct: m.LossPct,
				JitterMs: m.JitterMs, State: m.State,
			})
		}
		ns.lsdb.Publish(lsLinks)
	}

	ns.prb.Start()
	ns.lsdb.Start()
	ns.fwd.Start()

	// Demux incoming packets to prober, lsdb, or forwarder.
	go func() {
		for inb := range ns.tr.Recv() {
			if len(inb.Data) < 4 {
				continue
			}
			pktType := inb.Data[3]
			switch pktType {
			case proto.TypePing, proto.TypePong:
				ns.prb.HandleInbound(inb)
			case proto.TypeLSA:
				ns.lsdb.Ingest(inb.From, inb.Data)
			case proto.TypeData, proto.TypeEchoReq, proto.TypeEchoRep:
				ns.fwd.HandleInbound(inb)
			}
		}
	}()

	// Periodically re-evaluate routes even without LSA changes (FR-R7).
	go func() {
		ticker := time.NewTicker(time.Second)
		for range ticker.C {
			g := ns.lsdb.BuildGraph()
			ns.engine.Evaluate(g)
		}
	}()

	// Initial LSA publish.
	go func() {
		time.Sleep(100 * time.Millisecond)
		ns.lsdb.Publish(nil)
	}()
}

// ---- API builder ----

func buildAPIServer(hub *api.Hub, gateway *nodeState, nodes []*nodeState,
	scenario *sim.Scenario, bus *sim.Bus, params config.Params,
	dataDir, resultsDir string) *api.Server {

	srv := api.New("sim", version, gateway.name, hub)
	srv.SimMode = true

	srv.GetState = func() api.State {
		return buildState(gateway, nodes, scenario, params)
	}
	srv.GetMatrix = func() api.MatrixResponse {
		return buildMatrix(nodes)
	}
	srv.GetCandidates = func(dst string) (api.CandidatesResponse, error) {
		return getCandidates(gateway, nodes, dst, params)
	}
	srv.GetHistory = func(a, b string, windowS int) []api.HistoryPoint {
		return getHistory(gateway, nodes, a, b, windowS)
	}
	srv.GetPathHistory = func(src, dst string, windowS int) []api.PathHistoryPoint {
		return getPathHistory(gateway, nodes, src, dst, windowS)
	}
	srv.GetParams = func() interface{} { return params }
	srv.PutParams = func(raw json.RawMessage) error {
		return json.Unmarshal(raw, &params)
	}
	srv.PostSimEvent = func(ev api.SimEvent) error {
		e := sim.EventDef{
			Type: ev.Type, A: ev.A, B: ev.B, Node: ev.Node,
			RTTMs: ev.RTTMs, JitterMs: ev.JitterMs, LossPct: ev.LossPct,
		}
		if err := bus.ApplyEvent(e); err != nil {
			return err
		}
		hub.Broadcast(api.WsEnvelope{Type: "sim_event", TS: time.Now(), Data: ev})
		return nil
	}
	srv.GetScenario = func() interface{} { return scenario }
	srv.ResetSim = func() error {
		return bus.ApplyEvent(sim.EventDef{Type: "reset"})
	}

	runner := bench.NewRunner("sim")
	runner.OnProgress = func(p bench.ProgressEvent) {
		hub.Broadcast(api.WsEnvelope{Type: "bench_progress", TS: time.Now(), Data: p})
	}
	runner.OnDone = func(r bench.Result) {
		hub.Broadcast(api.WsEnvelope{Type: "bench_done", TS: time.Now(), Data: r})
		if b, err := json.Marshal(r); err == nil {
			_ = os.WriteFile(fmt.Sprintf("%s/bench-%s.json", resultsDir, r.ID), b, 0644)
		}
	}
	srv.StartBench = func(raw json.RawMessage) (string, error) {
		var req bench.RunRequest
		if err := json.Unmarshal(raw, &req); err != nil {
			return "", err
		}
		srcNode := findNodeByName(nodes, req.Src)
		dstNode := findNodeByName(nodes, req.Dst)
		if srcNode == nil || dstNode == nil {
			return "", fmt.Errorf("unknown src or dst")
		}
		route, _ := srcNode.engine.RouteFor(dstNode.id)
		directFn := makeEchoFn(srcNode, []config.NodeID{srcNode.id, dstNode.id})
		overlayFn := makeEchoFn(srcNode, route.Path)
		return runner.Start(req, directFn, overlayFn, route.Path)
	}
	srv.GetBenchRuns = func() interface{} { return runner.List() }
	srv.GetBenchRun = func(id string) (interface{}, bool) {
		r, ok := runner.Get(id)
		return r, ok
	}
	srv.CancelBench = runner.Cancel
	srv.GetProbeCSV = func(from, to string) ([][]string, error) {
		return readCSVFiles(dataDir, "probes")
	}
	srv.GetRouteCSV = func(from, to string) ([][]string, error) {
		return readCSVFiles(dataDir, "routes")
	}
	return srv
}

// ---- State builders ----

func buildState(gateway *nodeState, nodes []*nodeState, scenario *sim.Scenario, params config.Params) api.State {
	apiNodes := make([]api.NodeInfo, 0, len(nodes))
	for _, ns := range nodes {
		apiNodes = append(apiNodes, api.NodeInfo{
			ID: uint16(ns.id), Name: ns.name, Label: ns.label,
			Region: ns.region, Role: ns.role, State: "up",
			Pos: api.Pos{X: ns.posX, Y: ns.posY},
		})
	}
	// Links from gateway's LSDB graph.
	g := gateway.lsdb.BuildGraph()
	apiLinks := make([]api.LinkInfo, 0)
	seen := make(map[[2]config.NodeID]bool)
	for a, nbrs := range g {
		for b, gl := range nbrs {
			key := [2]config.NodeID{a, b}
			if a > b {
				key = [2]config.NodeID{b, a}
			}
			if seen[key] {
				continue
			}
			seen[key] = true
			apiLinks = append(apiLinks, api.LinkInfo{
				A: uint16(a), B: uint16(b),
				RTTMs: gl.RTTMs, LossPct: gl.LossPct, State: "up", Kind: "overlay",
			})
		}
	}
	// Routes
	routes := gateway.engine.Routes()
	apiRoutes := make([]api.RouteInfo, 0, len(routes))
	for _, r := range routes {
		path := make([]uint16, len(r.Path))
		for i, n := range r.Path {
			path[i] = uint16(n)
		}
		ri := api.RouteInfo{
			Dst:    uint16(r.Dst),
			Active: &api.ActiveRoute{Path: path, CostMs: r.CostMs, Since: r.Since},
		}
		// Direct cost
		if dl, ok := g[gateway.id][r.Dst]; ok {
			dc := dl.RTTMs + params.LossPenaltyMsPerPct*dl.LossPct
			dcPtr := dc
			dpath := []uint16{uint16(gateway.id), uint16(r.Dst)}
			ri.Direct = &api.DirectRoute{Path: dpath, CostMs: &dcPtr}
			imp := dc - r.CostMs
			ri.ImprovementMs = &imp
		}
		apiRoutes = append(apiRoutes, ri)
	}
	return api.State{
		Mode: "sim", Self: gateway.name, Now: time.Now(),
		Nodes: apiNodes, Links: apiLinks, Routes: apiRoutes, Params: params,
	}
}

func buildMatrix(nodes []*nodeState) api.MatrixResponse {
	n := len(nodes)
	names := make([]string, n)
	for i, ns := range nodes {
		names[i] = ns.name
	}
	rtt := make([][]float64, n)
	loss := make([][]float64, n)
	for i := range rtt {
		rtt[i] = make([]float64, n)
		loss[i] = make([]float64, n)
	}
	for i, a := range nodes {
		metrics := a.prb.Metrics()
		for _, m := range metrics {
			for j, b := range nodes {
				if b.id == m.To {
					rtt[i][j] = m.RTTMs
					loss[i][j] = m.LossPct
				}
			}
		}
	}
	return api.MatrixResponse{Nodes: names, RTT: rtt, Loss: loss}
}

func getCandidates(gateway *nodeState, nodes []*nodeState, dst string, params config.Params) (api.CandidatesResponse, error) {
	dstNode := findNodeByName(nodes, dst)
	if dstNode == nil {
		// Try by ID.
		for _, ns := range nodes {
			if fmt.Sprintf("%d", ns.id) == dst {
				dstNode = ns
				break
			}
		}
	}
	if dstNode == nil {
		return api.CandidatesResponse{}, fmt.Errorf("unknown dst %q", dst)
	}
	g := gateway.lsdb.BuildGraph()
	allCands := gateway.engine.Evaluate(g)
	cands := allCands[dstNode.id]
	route, _ := gateway.engine.RouteFor(dstNode.id)
	return api.CandidatesResponse{
		Dst:        uint16(dstNode.id),
		Active:     route,
		Candidates: cands,
	}, nil
}

func getHistory(gateway *nodeState, nodes []*nodeState, a, b string, windowS int) []api.HistoryPoint {
	aNode := findNodeByName(nodes, a)
	bNode := findNodeByName(nodes, b)
	if aNode == nil || bNode == nil {
		return nil
	}
	since := time.Now().Add(-time.Duration(windowS) * time.Second)
	aNode.ringsLock.RLock()
	ring := aNode.rings[bNode.id]
	aNode.ringsLock.RUnlock()
	if ring == nil {
		return nil
	}
	var out []api.HistoryPoint
	for _, s := range ring.Slice() {
		if s.TS.Before(since) {
			continue
		}
		out = append(out, api.HistoryPoint{
			TS: s.TS, RTTMs: s.RTTMs, EWMAMs: s.EWMAMs, LossPct: s.LossPct, State: s.State,
		})
	}
	return out
}

func getPathHistory(gateway *nodeState, nodes []*nodeState, src, dst string, windowS int) []api.PathHistoryPoint {
	srcNode := findNodeByName(nodes, src)
	if srcNode == nil {
		srcNode = gateway
	}
	since := time.Now().Add(-time.Duration(windowS) * time.Second)
	var out []api.PathHistoryPoint
	for _, e := range srcNode.echoRing.Slice() {
		if e.TS.Before(since) {
			continue
		}
		out = append(out, api.PathHistoryPoint{
			TS: e.TS, DirectMs: e.DirectMs, OverlayMs: e.OverlayMs,
		})
	}
	return out
}

// ---- Echo helpers ----

func makeEchoFn(src *nodeState, path []config.NodeID) bench.EchoFunc {
	return func(ctx context.Context, _ []config.NodeID) (float64, error) {
		if len(path) < 2 {
			return 0, fmt.Errorf("no path")
		}
		ch := make(chan float64, 1)
		var once sync.Once
		prev := src.fwd.OnEcho
		src.fwd.OnEcho = func(r forwarder.EchoResult) {
			if prev != nil {
				prev(r)
			}
			if r.Lost {
				once.Do(func() { ch <- -1 })
			} else {
				once.Do(func() { ch <- r.RTTMs })
			}
		}
		_, err := src.fwd.SendEcho(path)
		if err != nil {
			return 0, err
		}
		select {
		case rtt := <-ch:
			if rtt < 0 {
				return 0, fmt.Errorf("lost")
			}
			return rtt, nil
		case <-ctx.Done():
			return 0, ctx.Err()
		case <-time.After(2 * time.Second):
			return 0, fmt.Errorf("timeout")
		}
	}
}

// ---- Live probe goroutine ----

func liveEchoProbe(gateway *nodeState, nodes []*nodeState, scenario *sim.Scenario, hub *api.Hub) {
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()

	// Find first exit node.
	var exitID config.NodeID
	for _, nd := range scenario.Nodes {
		if nd.Role == "exit" {
			exitID = nd.ID
			break
		}
	}
	if exitID == 0 {
		return
	}

	// Wire echo results back into echoRing and broadcast.
	gateway.fwd.OnEcho = func(r forwarder.EchoResult) {
		// Determine if this was direct (2-hop) or overlay (3+ hop)
		isOverlay := len(r.Path) > 2
		var dm, om *float64
		if !r.Lost {
			v := r.RTTMs
			if isOverlay {
				om = &v
			} else {
				dm = &v
			}
		}
		e := echoEntry{TS: time.Now(), DirectMs: dm, OverlayMs: om, Path: r.Path}
		gateway.echoRing.Push(e)
		hub.Broadcast(api.WsEnvelope{Type: "probe_sample", TS: time.Now(), Data: map[string]interface{}{
			"dst": exitID, "mode": func() string {
				if isOverlay {
					return "overlay"
				}
				return "direct"
			}(), "rtt_ms": r.RTTMs, "path": r.Path, "lost": r.Lost,
		}})
	}

	for range ticker.C {
		route, ok := gateway.engine.RouteFor(exitID)
		g := gateway.lsdb.BuildGraph()
		// Direct probe
		if _, hasDir := g[gateway.id][exitID]; hasDir {
			directPath := []config.NodeID{gateway.id, exitID}
			_, _ = gateway.fwd.SendEcho(directPath)
		}
		// Overlay probe
		if ok && len(route.Path) >= 2 {
			_, _ = gateway.fwd.SendEcho(route.Path)
		}
	}
}

// ---- CSV helpers ----

func readCSVFiles(dir, prefix string) ([][]string, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	var out [][]string
	for _, e := range entries {
		if strings.HasPrefix(e.Name(), prefix) && strings.HasSuffix(e.Name(), ".csv") {
			b, err := os.ReadFile(dir + "/" + e.Name())
			if err != nil {
				continue
			}
			for _, line := range strings.Split(string(b), "\n") {
				if line != "" {
					out = append(out, strings.Split(line, ","))
				}
			}
		}
	}
	return out, nil
}

// ---- Util ----

func findNodeByName(nodes []*nodeState, name string) *nodeState {
	for _, ns := range nodes {
		if ns.name == name {
			return ns
		}
	}
	return nil
}

func pathStr(path []config.NodeID) string {
	parts := make([]string, len(path))
	for i, n := range path {
		parts[i] = fmt.Sprintf("%d", n)
	}
	return strings.Join(parts, "→")
}
