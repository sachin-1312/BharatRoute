// Scenario loader: parses scenarios/india.json and wires up the SimBus.
package sim

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/bharatroute/internal/transport"
)

// NodeDef is a node entry in the scenario file.
type NodeDef struct {
	ID     transport.NodeID `json:"id"`
	Name   string           `json:"name"`
	Label  string           `json:"label"`
	Region string           `json:"region"`
	Role   string           `json:"role"` // edge | relay | exit
	Pos    struct {
		X float64 `json:"x"`
		Y float64 `json:"y"`
	} `json:"pos"`
}

// LinkDef is a link entry in the scenario file.  a and b can be name strings
// or numeric IDs (represented as json.Number).
type LinkDef struct {
	A        json.RawMessage `json:"a"`
	B        json.RawMessage `json:"b"`
	RTTMs    float64         `json:"rtt_ms"`
	JitterMs float64         `json:"jitter_ms"`
	LossPct  float64         `json:"loss_pct"`
}

// EventDef is a timed event in the scenario timeline.
type EventDef struct {
	AtS     float64          `json:"at_s"`
	Type    string           `json:"type"` // set_link | restore_link | kill_node | revive_node | reset
	A       string           `json:"a,omitempty"`
	B       string           `json:"b,omitempty"`
	Node    string           `json:"node,omitempty"`
	RTTMs   float64          `json:"rtt_ms,omitempty"`
	JitterMs float64         `json:"jitter_ms,omitempty"`
	LossPct float64          `json:"loss_pct,omitempty"`
}

// Scenario is the top-level structure parsed from the JSON scenario file.
type Scenario struct {
	Name     string     `json:"name"`
	Seed     int64      `json:"seed"`
	Notes    string     `json:"notes"`
	Nodes    []NodeDef  `json:"nodes"`
	Links    []LinkDef  `json:"links"`
	Timeline []EventDef `json:"timeline"`

	// NameToID is built after parsing.
	NameToID map[string]transport.NodeID
}

// LoadScenario reads and parses a scenario JSON file.
func LoadScenario(path string) (*Scenario, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("load scenario: %w", err)
	}
	s := &Scenario{}
	if err := json.Unmarshal(b, s); err != nil {
		return nil, fmt.Errorf("parse scenario: %w", err)
	}
	s.NameToID = make(map[string]transport.NodeID, len(s.Nodes)*2)
	for _, n := range s.Nodes {
		s.NameToID[n.Name] = n.ID
		s.NameToID[fmt.Sprintf("%d", n.ID)] = n.ID
	}
	return s, nil
}

// ResolveLink returns the two NodeIDs referenced by a LinkDef.
func (s *Scenario) ResolveLink(l LinkDef) (transport.NodeID, transport.NodeID, error) {
	a, err := s.resolvePeer(l.A)
	if err != nil {
		return 0, 0, err
	}
	b, err := s.resolvePeer(l.B)
	if err != nil {
		return 0, 0, err
	}
	return a, b, nil
}

func (s *Scenario) resolvePeer(raw json.RawMessage) (transport.NodeID, error) {
	// Try string name first.
	var name string
	if err := json.Unmarshal(raw, &name); err == nil {
		if id, ok := s.NameToID[name]; ok {
			return id, nil
		}
		return 0, fmt.Errorf("unknown node name %q", name)
	}
	// Fall back to numeric ID.
	var id uint16
	if err := json.Unmarshal(raw, &id); err == nil {
		return transport.NodeID(id), nil
	}
	return 0, fmt.Errorf("cannot resolve peer %s", raw)
}
