// Package forwarder implements source-routed packet forwarding and the echo service.
// FR-F1 through FR-F8.
package forwarder

import (
	"fmt"
	"log/slog"
	"sync"
	"sync/atomic"
	"time"

	"github.com/bharatroute/internal/config"
	"github.com/bharatroute/internal/proto"
	"github.com/bharatroute/internal/transport"
)

// NodeID alias.
type NodeID = config.NodeID

// Counters tracks per-node forwarding statistics.
type Counters struct {
	Forwarded  atomic.Int64
	Delivered  atomic.Int64
	DroppedBadRoute atomic.Int64
	DroppedTTL atomic.Int64
	DroppedUnknown atomic.Int64
}

// EchoResult is the result of a completed echo probe.
type EchoResult struct {
	Seq   uint32
	RTTMs float64
	Path  []NodeID
	Lost  bool
}

// Forwarder routes overlay packets according to the source-route in the header.
type Forwarder struct {
	mu      sync.RWMutex
	self    NodeID
	tr      transport.Transport
	peers           map[NodeID]struct{}
	done            chan struct{}
	disableReadLoop bool
	Counters        Counters

	// inflight echo probes: seq → sent ns
	echoMu       sync.Mutex
	echoInflight map[uint32]echoEntry
	echoSeq      uint32

	OnEcho func(EchoResult)
}

type echoEntry struct {
	sentNs int64
	path   []NodeID
}

// New creates a Forwarder for the given node.
func New(self NodeID, tr transport.Transport) *Forwarder {
	return &Forwarder{
		self:         self,
		tr:           tr,
		peers:        make(map[NodeID]struct{}),
		done:         make(chan struct{}),
		echoInflight: make(map[uint32]echoEntry),
	}
}

// DisableReadLoop prevents Start from launching internal readLoop on tr.Recv().
func (f *Forwarder) DisableReadLoop() {
	f.disableReadLoop = true
}

// HandleInbound processes an inbound transport packet directly.
func (f *Forwarder) HandleInbound(inb transport.Inbound) {
	f.handleInbound(inb)
}

// AddPeer registers a known peer (FR-F6: only forward from known peers).
func (f *Forwarder) AddPeer(id NodeID) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.peers[id] = struct{}{}
}

// Start begins reading from the transport.
func (f *Forwarder) Start() {
	if !f.disableReadLoop {
		go f.readLoop()
	}
	go f.echoTimeoutLoop()
}

// Stop shuts down the forwarder.
func (f *Forwarder) Stop() {
	close(f.done)
}

func (f *Forwarder) readLoop() {
	ch := f.tr.Recv()
	for {
		select {
		case <-f.done:
			return
		case inb, ok := <-ch:
			if !ok {
				return
			}
			f.handleInbound(inb)
		}
	}
}

func (f *Forwarder) handleInbound(inb transport.Inbound) {
	// FR-F6: drop from unknown peers.
	f.mu.RLock()
	_, known := f.peers[inb.From]
	f.mu.RUnlock()
	if !known {
		f.Counters.DroppedUnknown.Add(1)
		return
	}

	pkt, err := proto.Decode(inb.Data)
	if err != nil {
		return
	}

	// Only handle DATA, ECHO_REQ, ECHO_REP.
	switch pkt.Type {
	case proto.TypeData, proto.TypeEchoReq, proto.TypeEchoRep:
	default:
		return // prober/lsdb handle PING/PONG/LSA
	}

	// FR-F2: check path[hop_idx] == self.
	if NodeID(pkt.CurrentNode()) != f.self {
		f.Counters.DroppedBadRoute.Add(1)
		slog.Debug("bad route", "expected", f.self, "got", pkt.CurrentNode())
		return
	}

	// FR-F4: TTL check.
	if pkt.TTL == 0 {
		f.Counters.DroppedTTL.Add(1)
		return
	}

	// FR-F3: final hop?
	if pkt.NextHop() == proto.NoNode {
		f.deliver(pkt)
		return
	}

	// Forward to next hop.
	pkt.HopIdx++
	pkt.TTL--
	raw, _ := proto.Encode(pkt)
	if err := f.tr.Send(NodeID(pkt.CurrentNode()), raw); err != nil {
		slog.Debug("forward error", "err", err)
	}
	f.Counters.Forwarded.Add(1)
}

// deliver handles a packet that has reached its final destination.
func (f *Forwarder) deliver(pkt *proto.Packet) {
	f.Counters.Delivered.Add(1)
	switch pkt.Type {
	case proto.TypeEchoReq:
		// FR-F8: reply with ECHO_REP along the reversed path.
		rep := *pkt
		rep.Type = proto.TypeEchoRep
		rep.Flags |= proto.FlagReply
		rep.HopIdx = 0
		// Reverse path.
		for i, j := 0, int(pkt.PathLen)-1; i < j; i, j = i+1, j-1 {
			rep.Path[i], rep.Path[j] = rep.Path[j], rep.Path[i]
		}
		raw, _ := proto.Encode(&rep)
		next := NodeID(rep.Path[1])
		_ = f.tr.Send(next, raw)

	case proto.TypeEchoRep:
		// We got a reply to our own echo probe.
		now := time.Now().UnixNano()
		f.echoMu.Lock()
		entry, ok := f.echoInflight[pkt.Seq]
		if ok {
			delete(f.echoInflight, pkt.Seq)
		}
		f.echoMu.Unlock()
		if ok && f.OnEcho != nil {
			rttMs := float64(now-entry.sentNs) / 1e6
			f.OnEcho(EchoResult{Seq: pkt.Seq, RTTMs: rttMs, Path: entry.path})
		}

	case proto.TypeData:
		// Delivered to local service — not implemented in P0, just count it.
	}
}

// SendEcho sends an ECHO_REQ along path and records it as inflight.
func (f *Forwarder) SendEcho(path []NodeID) (uint32, error) {
	if len(path) < 2 || len(path) > proto.MaxPath {
		return 0, errBadPath
	}
	f.echoMu.Lock()
	f.echoSeq++
	seq := f.echoSeq
	tsNs := time.Now().UnixNano()
	f.echoInflight[seq] = echoEntry{sentNs: tsNs, path: path}
	f.echoMu.Unlock()

	pkt := &proto.Packet{
		Type:    proto.TypeEchoReq,
		TTL:     8,
		HopIdx:  0,
		PathLen: uint8(len(path)),
		Seq:     seq,
		TsNs:    tsNs,
	}
	for i, n := range path {
		pkt.Path[i] = uint16(n)
	}
	for i := len(path); i < proto.MaxPath; i++ {
		pkt.Path[i] = proto.NoNode
	}
	raw, err := proto.Encode(pkt)
	if err != nil {
		return 0, err
	}
	return seq, f.tr.Send(path[1], raw)
}

// echoTimeoutLoop marks inflight echo probes as lost after 2× probe timeout.
func (f *Forwarder) echoTimeoutLoop() {
	ticker := time.NewTicker(200 * time.Millisecond)
	defer ticker.Stop()
	for {
		select {
		case <-f.done:
			return
		case <-ticker.C:
			timeout := int64(2 * time.Second) // 2 s echo timeout
			now := time.Now().UnixNano()
			f.echoMu.Lock()
			for seq, e := range f.echoInflight {
				if now-e.sentNs > timeout {
					delete(f.echoInflight, seq)
					if f.OnEcho != nil {
						go f.OnEcho(EchoResult{Seq: seq, Lost: true, Path: e.path})
					}
				}
			}
			f.echoMu.Unlock()
		}
	}
}

var errBadPath = fmt.Errorf("forwarder: path length must be 2-4")
