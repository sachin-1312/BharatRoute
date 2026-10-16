// Package sim implements the SimTransport and scenario loader.
// SimTransport delivers packets between in-process nodes with configurable
// delay, jitter, and loss (PRD Section 12.1).
package sim

import (
	"math"
	"math/rand"
	"sync"
	"time"

	"github.com/bharatroute/internal/transport"
)

// LinkModel describes one directed link in the simulator.
type LinkModel struct {
	BaseRTTMs  float64 // round-trip; one-way delay = BaseRTTMs/2
	JitterMs   float64 // std-dev of one-way delay
	LossPct    float64 // Bernoulli loss probability (0–100)
	Down       bool    // if true, all packets are dropped
}

// SimTransport is an in-process transport that routes packets between a set
// of registered nodes, applying per-link delay and loss models.
type SimTransport struct {
	mu      sync.RWMutex
	self    transport.NodeID
	rng     *rand.Rand
	links   map[transport.NodeID]*LinkModel // keyed by peer ID
	peers   map[transport.NodeID]*SimTransport
	ch      chan transport.Inbound
	closed  bool
}

// NewSimTransport creates a transport for the node with the given ID.
// rng is a shared random source (supply one per SimBus for determinism).
func NewSimTransport(id transport.NodeID, rng *rand.Rand) *SimTransport {
	return &SimTransport{
		self:  id,
		rng:   rng,
		links: make(map[transport.NodeID]*LinkModel),
		peers: make(map[transport.NodeID]*SimTransport),
		ch:    make(chan transport.Inbound, 512),
	}
}

// Register adds a peer transport so this node can reach it.
func (t *SimTransport) Register(peer *SimTransport) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.peers[peer.self] = peer
}

// SetLink configures the link model from this node to the given peer.
// Call SetLink on both sides to set bidirectional models.
func (t *SimTransport) SetLink(to transport.NodeID, m LinkModel) {
	t.mu.Lock()
	defer t.mu.Unlock()
	cp := m
	t.links[to] = &cp
}

// Send delivers pkt to the node to, applying one-way delay and loss.
func (t *SimTransport) Send(to transport.NodeID, pkt []byte) error {
	t.mu.RLock()
	peer := t.peers[to]
	model := t.links[to]
	t.mu.RUnlock()

	if peer == nil {
		return nil // unknown peer — silent drop (not configured in scenario)
	}

	// If no model, deliver instantly with no loss.
	if model == nil {
		deliverCopy(peer, t.self, pkt)
		return nil
	}

	if model.Down {
		return nil // link is down — drop
	}

	// Bernoulli loss
	t.mu.Lock()
	lost := t.rng.Float64()*100 < model.LossPct
	// One-way delay = base_rtt/2 + N(0, jitter/2), clamped >= 0.5 ms
	delay := model.BaseRTTMs/2 + t.rng.NormFloat64()*(model.JitterMs/2)
	t.mu.Unlock()

	if lost {
		return nil
	}
	if delay < 0.5 {
		delay = 0.5
	}

	// Schedule delivery using time.AfterFunc (no goroutine per packet).
	buf := make([]byte, len(pkt))
	copy(buf, pkt)
	from := t.self
	time.AfterFunc(time.Duration(delay*float64(time.Millisecond)), func() {
		deliverCopy(peer, from, buf)
	})
	return nil
}

func deliverCopy(peer *SimTransport, from transport.NodeID, pkt []byte) {
	peer.mu.RLock()
	closed := peer.closed
	peer.mu.RUnlock()
	if closed {
		return
	}
	select {
	case peer.ch <- transport.Inbound{From: from, Data: pkt}:
	default:
		// channel full — drop (overload protection)
	}
}

// Recv returns the channel that emits packets delivered to this node.
func (t *SimTransport) Recv() <-chan transport.Inbound {
	return t.ch
}

// Close shuts down this transport.
func (t *SimTransport) Close() error {
	t.mu.Lock()
	defer t.mu.Unlock()
	if !t.closed {
		t.closed = true
		close(t.ch)
	}
	return nil
}

// LinkState returns the current LinkModel for the link to peer, or nil.
func (t *SimTransport) LinkState(to transport.NodeID) *LinkModel {
	t.mu.RLock()
	defer t.mu.RUnlock()
	if m, ok := t.links[to]; ok {
		cp := *m
		return &cp
	}
	return nil
}

// oneWayDelay returns the expected one-way delay for the link to peer (ms).
// Used for test assertions.
func (t *SimTransport) oneWayDelay(to transport.NodeID) float64 {
	t.mu.RLock()
	defer t.mu.RUnlock()
	if m, ok := t.links[to]; ok {
		return m.BaseRTTMs / 2
	}
	return 0
}

// Unused but satisfies linting — math is used for clamping.
var _ = math.MaxFloat64
