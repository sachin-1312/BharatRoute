// Package prober implements PING/PONG, EWMA, loss, jitter, and the link state machine.
// FR-P1 through FR-P7.
package prober

import (
	"log/slog"
	"sync"
	"time"

	"github.com/bharatroute/internal/config"
	"github.com/bharatroute/internal/proto"
	"github.com/bharatroute/internal/transport"
)

// NodeID alias.
type NodeID = config.NodeID

// LinkMetrics is the current measured state of one directed link.
type LinkMetrics struct {
	To       NodeID  `json:"to"`
	RTTMs    float64 `json:"rtt_ms"`
	EWMAMs   float64 `json:"ewma_ms"`
	LossPct  float64 `json:"loss_pct"`
	JitterMs float64 `json:"jitter_ms"`
	State    string  `json:"state"` // "up" | "down"
}

// Sample is a timestamped probe result stored in the ring buffer.
type Sample struct {
	TS      time.Time
	RTTMs   float64
	EWMAMs  float64
	LossPct float64
	JitterMs float64
	State   string
	Seq     uint32
	Lost    bool
}

// OnLinkChange is called when a link transitions up↔down.
type OnLinkChange func(from, to NodeID, state string)

// Prober manages probing to all known peers.
type Prober struct {
	mu     sync.Mutex
	self   NodeID
	tr     transport.Transport
	params config.Params

	peers           map[NodeID]*peerState
	inbox           <-chan transport.Inbound
	done            chan struct{}
	disableReadLoop bool

	OnChange OnLinkChange
	OnSample func(from, to NodeID, s Sample)
}

// DisableReadLoop prevents Start from launching internal readLoop on tr.Recv().
func (pr *Prober) DisableReadLoop() {
	pr.disableReadLoop = true
}

// HandleInbound processes an incoming PING or PONG packet directly.
func (pr *Prober) HandleInbound(inb transport.Inbound) {
	pkt, err := proto.Decode(inb.Data)
	if err != nil {
		return
	}
	if pkt.Type == proto.TypePong {
		pr.onPong(NodeID(inb.From), pkt)
	} else if pkt.Type == proto.TypePing {
		pong := proto.MakePong(pkt)
		raw, _ := proto.Encode(pong)
		_ = pr.tr.Send(NodeID(inb.From), raw)
	}
}

// peerState tracks per-peer probe state.
type peerState struct {
	seq       uint32
	ewma      float64
	ewmaSet   bool
	window    []windowEntry // sliding window for loss/jitter
	hits      int
	misses    int
	state     string // "up" | "down"
	inflight  map[uint32]int64 // seq → sent ts_ns
	prevRTT   float64
	jitterAcc float64
	jitterN   int
}

type windowEntry struct {
	answered bool
	rttMs    float64
}

// New creates a Prober for the given node.
func New(self NodeID, tr transport.Transport, p config.Params) *Prober {
	return &Prober{
		self:   self,
		tr:     tr,
		params: p,
		peers:  make(map[NodeID]*peerState),
		inbox:  tr.Recv(),
		done:   make(chan struct{}),
	}
}

// AddPeer registers a peer to probe.
func (pr *Prober) AddPeer(id NodeID) {
	pr.mu.Lock()
	defer pr.mu.Unlock()
	if _, ok := pr.peers[id]; !ok {
		pr.peers[id] = &peerState{
			state:    "up",
			inflight: make(map[uint32]int64),
		}
	}
}

// Metrics returns the current LinkMetrics for all peers.
func (pr *Prober) Metrics() []LinkMetrics {
	pr.mu.Lock()
	defer pr.mu.Unlock()
	out := make([]LinkMetrics, 0, len(pr.peers))
	for id, ps := range pr.peers {
		out = append(out, pr.snapshot(id, ps))
	}
	return out
}

// MetricsFor returns the current LinkMetrics for one peer.
func (pr *Prober) MetricsFor(id NodeID) (LinkMetrics, bool) {
	pr.mu.Lock()
	defer pr.mu.Unlock()
	ps, ok := pr.peers[id]
	if !ok {
		return LinkMetrics{}, false
	}
	return pr.snapshot(id, ps), true
}

func (pr *Prober) snapshot(id NodeID, ps *peerState) LinkMetrics {
	return LinkMetrics{
		To:       id,
		RTTMs:    ps.ewma, // ewma is our best estimate of RTT
		EWMAMs:   ps.ewma,
		LossPct:  pr.lossPct(ps),
		JitterMs: pr.jitterMs(ps),
		State:    ps.state,
	}
}

// Start begins probing goroutines.
func (pr *Prober) Start() {
	if !pr.disableReadLoop && pr.inbox != nil {
		go pr.readLoop()
	}
	go pr.probeLoop()
	go pr.timeoutLoop()
}

// Stop shuts down the prober.
func (pr *Prober) Stop() {
	close(pr.done)
}

// probeLoop sends a PING to every peer at probe_interval_ms.
func (pr *Prober) probeLoop() {
	ticker := time.NewTicker(pr.params.ProbeInterval())
	defer ticker.Stop()
	for {
		select {
		case <-pr.done:
			return
		case <-ticker.C:
			pr.mu.Lock()
			for id, ps := range pr.peers {
				ps.seq++
				seq := ps.seq
				tsNs := time.Now().UnixNano()
				ps.inflight[seq] = tsNs
				pr.mu.Unlock()

				pkt, _ := proto.MakePing(uint16(pr.self), uint16(id), seq, tsNs)
				raw, _ := proto.Encode(pkt)
				if err := pr.tr.Send(id, raw); err != nil {
					slog.Debug("ping send error", "peer", id, "err", err)
				}

				pr.mu.Lock()
			}
			pr.mu.Unlock()
		}
	}
}

// readLoop processes incoming PONG packets.
func (pr *Prober) readLoop() {
	for {
		select {
		case <-pr.done:
			return
		case inb, ok := <-pr.inbox:
			if !ok {
				return
			}
			pkt, err := proto.Decode(inb.Data)
			if err != nil {
				continue
			}
			if pkt.Type == proto.TypePong {
				pr.onPong(NodeID(inb.From), pkt)
			} else if pkt.Type == proto.TypePing {
				// Reply with PONG
				pong := proto.MakePong(pkt)
				raw, _ := proto.Encode(pong)
				_ = pr.tr.Send(NodeID(inb.From), raw)
			}
			// Other packet types are handled by the forwarder.
		}
	}
}

// timeoutLoop checks for timed-out probes every 100 ms.
func (pr *Prober) timeoutLoop() {
	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()
	for {
		select {
		case <-pr.done:
			return
		case <-ticker.C:
			now := time.Now().UnixNano()
			timeout := pr.params.ProbeTimeout().Nanoseconds()
			type stateChange struct {
				to    NodeID
				state string
			}
			var changes []stateChange

			pr.mu.Lock()
			for id, ps := range pr.peers {
				for seq, sentNs := range ps.inflight {
					if now-sentNs > timeout {
						delete(ps.inflight, seq)
						if changed, newState := pr.recordMiss(id, ps); changed {
							changes = append(changes, stateChange{to: id, state: newState})
						}
					}
				}
			}
			pr.mu.Unlock()

			if pr.OnChange != nil {
				for _, ch := range changes {
					pr.OnChange(pr.self, ch.to, ch.state)
				}
			}
		}
	}
}

func (pr *Prober) onPong(from NodeID, pkt *proto.Packet) {
	now := time.Now().UnixNano()
	rttMs := float64(now-pkt.TsNs) / 1e6

	pr.mu.Lock()
	ps, ok := pr.peers[from]
	if !ok {
		pr.mu.Unlock()
		return
	}
	delete(ps.inflight, pkt.Seq)

	// EWMA smoothing (FR-P3)
	if !ps.ewmaSet {
		ps.ewma = rttMs
		ps.ewmaSet = true
	} else {
		ps.ewma = pr.params.Alpha*rttMs + (1-pr.params.Alpha)*ps.ewma
	}

	// Jitter = mean |rtt[i] - rtt[i-1]| (FR-P5)
	if ps.prevRTT > 0 {
		diff := rttMs - ps.prevRTT
		if diff < 0 {
			diff = -diff
		}
		ps.jitterAcc += diff
		ps.jitterN++
	}
	ps.prevRTT = rttMs

	// Sliding window
	ps.window = append(ps.window, windowEntry{answered: true, rttMs: rttMs})
	if len(ps.window) > pr.params.LossWindow {
		ps.window = ps.window[len(ps.window)-pr.params.LossWindow:]
	}

	// Link state machine (FR-P6)
	oldState := ps.state
	ps.hits++
	ps.misses = 0
	if ps.state == "down" && ps.hits >= pr.params.UpAfterHits {
		ps.state = "up"
	}

	snap := pr.snapshot(from, ps)
	pr.mu.Unlock()

	if pr.OnSample != nil {
		pr.OnSample(pr.self, from, Sample{
			TS: time.Now(), RTTMs: rttMs, EWMAMs: snap.EWMAMs,
			LossPct: snap.LossPct, JitterMs: snap.JitterMs,
			State: snap.State, Seq: pkt.Seq, Lost: false,
		})
	}
	if oldState != snap.State && pr.OnChange != nil {
		pr.OnChange(pr.self, from, snap.State)
	}
}

func (pr *Prober) recordMiss(id NodeID, ps *peerState) (bool, string) {
	ps.window = append(ps.window, windowEntry{answered: false})
	if len(ps.window) > pr.params.LossWindow {
		ps.window = ps.window[len(ps.window)-pr.params.LossWindow:]
	}
	oldState := ps.state
	ps.misses++
	ps.hits = 0
	if ps.misses >= pr.params.DownAfterMisses {
		ps.state = "down"
	}
	return oldState != ps.state, ps.state
}

func (pr *Prober) lossPct(ps *peerState) float64 {
	if len(ps.window) == 0 {
		return 0
	}
	lost := 0
	for _, e := range ps.window {
		if !e.answered {
			lost++
		}
	}
	return float64(lost) * 100 / float64(len(ps.window))
}

func (pr *Prober) jitterMs(ps *peerState) float64 {
	if ps.jitterN == 0 {
		return 0
	}
	return ps.jitterAcc / float64(ps.jitterN)
}

