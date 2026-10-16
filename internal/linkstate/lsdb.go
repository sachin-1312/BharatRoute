// Package linkstate implements LSA flooding, the LSDB, and graph construction.
// FR-L1 through FR-L6.
package linkstate

import (
	"encoding/json"
	"log/slog"
	"sync"
	"time"

	"github.com/bharatroute/internal/config"
	"github.com/bharatroute/internal/proto"
	"github.com/bharatroute/internal/transport"
)

// NodeID alias.
type NodeID = config.NodeID

// LinkMetric is one link entry inside an LSA.
type LinkMetric struct {
	To       NodeID  `json:"to"`
	RTTMs    float64 `json:"rtt_ms"`
	LossPct  float64 `json:"loss_pct"`
	JitterMs float64 `json:"jitter_ms"`
	State    string  `json:"state"` // "up" | "down"
}

// LSA is a link-state advertisement (Section 6.2).
type LSA struct {
	Origin NodeID       `json:"origin"`
	Seq    uint64       `json:"seq"`
	TS     time.Time    `json:"ts"`
	Links  []LinkMetric `json:"links"`
}

// GraphLink is a bidirectional link in the routing graph.
type GraphLink struct {
	RTTMs   float64
	LossPct float64
}

// Graph is the routing graph: graph[a][b] = bidirectional link metrics.
type Graph map[NodeID]map[NodeID]GraphLink

// entry is a stored LSA with its receipt time.
type entry struct {
	lsa     LSA
	rcvdAt  time.Time
}

// LSDB holds the per-origin newest LSAs.
type LSDB struct {
	mu      sync.RWMutex
	self    NodeID
	tr      transport.Transport
	params  config.Params
	db      map[NodeID]entry // newest LSA per origin
	peers   map[NodeID]struct{}
	seq     uint64
	done    chan struct{}

	// OnChange is called whenever the graph may have changed.
	OnChange func()
}

// NewLSDB creates an LSDB for the given node.
func NewLSDB(self NodeID, tr transport.Transport, p config.Params) *LSDB {
	return &LSDB{
		self:   self,
		tr:     tr,
		params: p,
		db:     make(map[NodeID]entry),
		peers:  make(map[NodeID]struct{}),
		done:   make(chan struct{}),
	}
}

// AddPeer registers a known peer to send LSAs to.
func (db *LSDB) AddPeer(id NodeID) {
	db.mu.Lock()
	defer db.mu.Unlock()
	if db.peers == nil {
		db.peers = make(map[NodeID]struct{})
	}
	db.peers[id] = struct{}{}
}

// Start begins periodic LSA broadcasting and TTL expiry checking.
func (db *LSDB) Start() {
	go db.broadcastLoop()
	go db.expireLoop()
}

// Stop shuts down background goroutines.
func (db *LSDB) Stop() {
	close(db.done)
}

// Publish builds a new LSA from the given link metrics and floods it.
func (db *LSDB) Publish(links []LinkMetric) {
	db.mu.Lock()
	db.seq++
	lsa := LSA{Origin: db.self, Seq: db.seq, TS: time.Now(), Links: links}
	db.db[db.self] = entry{lsa: lsa, rcvdAt: time.Now()}
	db.mu.Unlock()
	db.flood(lsa, db.self)
}

// Ingest processes a received LSA packet from a peer.
func (db *LSDB) Ingest(from NodeID, raw []byte) {
	pkt, err := proto.Decode(raw)
	if err != nil || pkt.Type != proto.TypeLSA {
		return
	}
	var lsa LSA
	if err := json.Unmarshal(pkt.Payload, &lsa); err != nil {
		slog.Debug("lsa parse error", "from", from, "err", err)
		return
	}

	db.mu.Lock()
	cur, ok := db.db[lsa.Origin]
	if ok && lsa.Seq <= cur.lsa.Seq {
		db.mu.Unlock()
		return // duplicate or stale — discard (FR-L3)
	}
	db.db[lsa.Origin] = entry{lsa: lsa, rcvdAt: time.Now()}
	db.mu.Unlock()

	// Forward to all peers except the sender (flooding)
	db.flood(lsa, from)

	if db.OnChange != nil {
		db.OnChange()
	}
}

// flood sends an LSA to all known peers except skip.
func (db *LSDB) flood(lsa LSA, skip NodeID) {
	pay, err := json.Marshal(lsa)
	if err != nil {
		return
	}
	pkt := &proto.Packet{
		Type:    proto.TypeLSA,
		TTL:     8,
		PathLen: 2,
		Path:    [proto.MaxPath]uint16{uint16(db.self), uint16(lsa.Origin), proto.NoNode, proto.NoNode},
		Payload: pay,
	}
	raw, _ := proto.Encode(pkt)
	db.mu.RLock()
	peers := make([]NodeID, 0, len(db.peers))
	for id := range db.peers {
		if id != db.self && id != skip {
			peers = append(peers, id)
		}
	}
	db.mu.RUnlock()
	for _, p := range peers {
		_ = db.tr.Send(p, raw)
	}
}

// broadcastLoop sends our LSA periodically (FR-L1).
func (db *LSDB) broadcastLoop() {
	ticker := time.NewTicker(db.params.LSAInterval())
	defer ticker.Stop()
	for {
		select {
		case <-db.done:
			return
		case <-ticker.C:
			db.mu.RLock()
			cur, ok := db.db[db.self]
			db.mu.RUnlock()
			if ok {
				db.flood(cur.lsa, db.self)
			}
		}
	}
}

// expireLoop removes stale LSAs (FR-L4).
func (db *LSDB) expireLoop() {
	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()
	ttl := db.params.LSATTL()
	for {
		select {
		case <-db.done:
			return
		case <-ticker.C:
			now := time.Now()
			db.mu.Lock()
			changed := false
			for id, e := range db.db {
				if id == db.self {
					continue
				}
				if now.Sub(e.rcvdAt) > ttl {
					delete(db.db, id)
					changed = true
					slog.Info("lsdb: LSA expired", "origin", id)
				}
			}
			db.mu.Unlock()
			if changed && db.OnChange != nil {
				db.OnChange()
			}
		}
	}
}

// BuildGraph constructs the routing graph from fresh LSAs (Section 7.2).
func (db *LSDB) BuildGraph() Graph {
	db.mu.RLock()
	defer db.mu.RUnlock()

	// Collect per-direction reports.
	type dirKey struct{ a, b NodeID }
	reported := make(map[dirKey]LinkMetric)
	for _, e := range db.db {
		for _, l := range e.lsa.Links {
			reported[dirKey{e.lsa.Origin, l.To}] = l
		}
	}

	g := make(Graph)
	seen := make(map[dirKey]bool)
	for key, fwd := range reported {
		if seen[key] || seen[dirKey{key.b, key.a}] {
			continue
		}
		seen[key] = true
		rev, hasRev := reported[dirKey{key.b, key.a}]

		// If either direction says down, link is unusable (FR-L5).
		if fwd.State == "down" || (hasRev && rev.State == "down") {
			continue
		}

		// Average RTT of available directions (FR-L6).
		rttMs := fwd.RTTMs
		lossPct := fwd.LossPct
		if hasRev {
			rttMs = (fwd.RTTMs + rev.RTTMs) / 2
			if rev.LossPct > lossPct {
				lossPct = rev.LossPct
			}
		}

		a, b := key.a, key.b
		if g[a] == nil {
			g[a] = make(map[NodeID]GraphLink)
		}
		if g[b] == nil {
			g[b] = make(map[NodeID]GraphLink)
		}
		gl := GraphLink{RTTMs: rttMs, LossPct: lossPct}
		g[a][b] = gl
		g[b][a] = gl
	}
	return g
}

// AllLSAs returns a snapshot of all stored LSAs.
func (db *LSDB) AllLSAs() []LSA {
	db.mu.RLock()
	defer db.mu.RUnlock()
	out := make([]LSA, 0, len(db.db))
	for _, e := range db.db {
		out = append(out, e.lsa)
	}
	return out
}
