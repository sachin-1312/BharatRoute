// SimBus manages all SimTransports for a scenario and implements event injection.
package sim

import (
	"fmt"
	"log/slog"
	"math/rand"
	"sync"
	"time"

	"github.com/bharatroute/internal/transport"
)

// Bus holds all transports and the original link models (for reset).
type Bus struct {
	mu       sync.RWMutex
	rng      *rand.Rand
	transports map[transport.NodeID]*SimTransport
	scenario   *Scenario
	baseline   map[[2]transport.NodeID]LinkModel // original link params
}

// NewBus creates a Bus from a scenario, wiring all links.
func NewBus(s *Scenario) (*Bus, error) {
	rng := rand.New(rand.NewSource(s.Seed))
	b := &Bus{
		rng:        rng,
		scenario:   s,
		transports: make(map[transport.NodeID]*SimTransport),
		baseline:   make(map[[2]transport.NodeID]LinkModel),
	}
	// Create a transport for each node with an independent RNG to guarantee thread safety.
	for _, n := range s.Nodes {
		nodeRng := rand.New(rand.NewSource(s.Seed + int64(n.ID)*10007))
		b.transports[n.ID] = NewSimTransport(n.ID, nodeRng)
	}
	// Register peers and set link models.
	for _, l := range s.Links {
		aID, bID, err := s.ResolveLink(l)
		if err != nil {
			return nil, fmt.Errorf("bus: %w", err)
		}
		ta := b.transports[aID]
		tb := b.transports[bID]
		if ta == nil || tb == nil {
			return nil, fmt.Errorf("bus: missing transport for link %v-%v", aID, bID)
		}
		ta.Register(tb)
		tb.Register(ta)
		model := LinkModel{BaseRTTMs: l.RTTMs, JitterMs: l.JitterMs, LossPct: l.LossPct}
		ta.SetLink(bID, model)
		tb.SetLink(aID, model)
		b.baseline[[2]transport.NodeID{aID, bID}] = model
		b.baseline[[2]transport.NodeID{bID, aID}] = model
	}
	return b, nil
}

// Transport returns the SimTransport for the given node ID.
func (b *Bus) Transport(id transport.NodeID) *SimTransport {
	b.mu.RLock()
	defer b.mu.RUnlock()
	return b.transports[id]
}

// ApplyEvent applies a simulator event (from POST /api/v1/sim/events or timeline).
func (b *Bus) ApplyEvent(ev EventDef) error {
	b.mu.Lock()
	defer b.mu.Unlock()
	switch ev.Type {
	case "set_link", "link_impair":
		aID, bID, err := b.resolveAB(ev.A, ev.B)
		if err != nil {
			return err
		}
		model := LinkModel{BaseRTTMs: ev.RTTMs, JitterMs: ev.JitterMs, LossPct: ev.LossPct}
		b.transports[aID].SetLink(bID, model)
		b.transports[bID].SetLink(aID, model)
		slog.Info("sim event", "type", ev.Type, "a", ev.A, "b", ev.B, "rtt_ms", ev.RTTMs)
	case "restore_link", "link_up":
		aID, bID, err := b.resolveAB(ev.A, ev.B)
		if err != nil {
			return err
		}
		if m, ok := b.baseline[[2]transport.NodeID{aID, bID}]; ok {
			b.transports[aID].SetLink(bID, m)
			b.transports[bID].SetLink(aID, m)
		}
		slog.Info("sim event", "type", ev.Type, "a", ev.A, "b", ev.B)
	case "link_down":
		aID, bID, err := b.resolveAB(ev.A, ev.B)
		if err != nil {
			return err
		}
		if m := b.transports[aID].links[bID]; m != nil {
			m.Down = true
		}
		if m := b.transports[bID].links[aID]; m != nil {
			m.Down = true
		}
		slog.Info("sim event", "type", ev.Type, "a", ev.A, "b", ev.B)
	case "kill_node", "node_down":
		nID, err := b.resolveName(ev.Node)
		if err != nil {
			return err
		}
		// Mark all links from this node as down.
		for _, tr := range b.transports {
			if tr.self == nID {
				continue
			}
			if m := tr.links[nID]; m != nil {
				m.Down = true
			}
			if t2 := b.transports[nID]; t2 != nil {
				if m := t2.links[tr.self]; m != nil {
					m.Down = true
				}
			}
		}
		slog.Info("sim event", "type", ev.Type, "node", ev.Node)
	case "revive_node", "node_up":
		nID, err := b.resolveName(ev.Node)
		if err != nil {
			return err
		}
		for _, tr := range b.transports {
			if tr.self == nID {
				continue
			}
			if m := tr.links[nID]; m != nil {
				m.Down = false
			}
			if t2 := b.transports[nID]; t2 != nil {
				if m := t2.links[tr.self]; m != nil {
					m.Down = false
				}
			}
		}
		slog.Info("sim event", "type", ev.Type, "node", ev.Node)
	case "reset":
		for key, model := range b.baseline {
			cp := model
			if ta := b.transports[key[0]]; ta != nil {
				ta.links[key[1]] = &cp
			}
		}
		slog.Info("sim event", "type", "reset")
	default:
		return fmt.Errorf("unknown event type %q", ev.Type)
	}
	return nil
}

// RunTimeline fires events from s.Timeline with blocking sleeps. Call in a goroutine.
func (b *Bus) RunTimeline() {
	start := time.Now()
	for _, ev := range b.scenario.Timeline {
		target := start.Add(time.Duration(ev.AtS * float64(time.Second)))
		time.Sleep(time.Until(target))
		if err := b.ApplyEvent(ev); err != nil {
			slog.Warn("timeline event error", "err", err)
		}
	}
}

func (b *Bus) resolveAB(a, bName string) (transport.NodeID, transport.NodeID, error) {
	aID, err := b.resolveName(a)
	if err != nil {
		return 0, 0, err
	}
	bID, err := b.resolveName(bName)
	if err != nil {
		return 0, 0, err
	}
	return aID, bID, nil
}

func (b *Bus) resolveName(name string) (transport.NodeID, error) {
	if id, ok := b.scenario.NameToID[name]; ok {
		return id, nil
	}
	return 0, fmt.Errorf("unknown node %q", name)
}

// NodeDefs returns the node definitions from the scenario.
func (b *Bus) NodeDefs() []NodeDef { return b.scenario.Nodes }

// Scenario returns the loaded scenario.
func (b *Bus) Scenario() *Scenario { return b.scenario }
