// Package config loads and validates node and simulator configuration from YAML.
package config

import (
	"fmt"
	"os"
	"time"

	"gopkg.in/yaml.v3"
)

// NodeID is a uint16 node identifier (matches the wire format).
type NodeID uint16

// Params holds tunable routing and probing parameters with their defaults.
type Params struct {
	Alpha               float64 `yaml:"alpha"                 json:"alpha"`
	LossPenaltyMsPerPct float64 `yaml:"loss_penalty_ms_per_pct" json:"loss_penalty_ms_per_pct"`
	RelayOverheadMs     float64 `yaml:"relay_overhead_ms"      json:"relay_overhead_ms"`
	MaxHops             int     `yaml:"max_hops"               json:"max_hops"`
	SwitchMarginPct     float64 `yaml:"switch_margin_pct"      json:"switch_margin_pct"`
	SwitchConfirmations int     `yaml:"switch_confirmations"   json:"switch_confirmations"`
	MinDwellMs          int     `yaml:"min_dwell_ms"           json:"min_dwell_ms"`
	ProbeIntervalMs     int     `yaml:"probe_interval_ms"      json:"probe_interval_ms"`
	ProbeTimeoutMs      int     `yaml:"probe_timeout_ms"       json:"probe_timeout_ms"`
	LossWindow          int     `yaml:"loss_window"            json:"loss_window"`
	DownAfterMisses     int     `yaml:"down_after_misses"      json:"down_after_misses"`
	UpAfterHits         int     `yaml:"up_after_hits"          json:"up_after_hits"`
	LSAIntervalMs       int     `yaml:"lsa_interval_ms"        json:"lsa_interval_ms"`
	LSATTLMs            int     `yaml:"lsa_ttl_ms"             json:"lsa_ttl_ms"`
}

// DefaultParams returns the default parameter values from PRD Section 10.2.
func DefaultParams() Params {
	return Params{
		Alpha:               0.2,
		LossPenaltyMsPerPct: 20,
		RelayOverheadMs:     1,
		MaxHops:             3,
		SwitchMarginPct:     10,
		SwitchConfirmations: 3,
		MinDwellMs:          5000,
		ProbeIntervalMs:     500,
		ProbeTimeoutMs:      1000,
		LossWindow:          20,
		DownAfterMisses:     4,
		UpAfterHits:         2,
		LSAIntervalMs:       2000,
		LSATTLMs:            10000,
	}
}

// ProbeInterval returns ProbeIntervalMs as a duration.
func (p Params) ProbeInterval() time.Duration {
	return time.Duration(p.ProbeIntervalMs) * time.Millisecond
}

// ProbeTimeout returns ProbeTimeoutMs as a duration.
func (p Params) ProbeTimeout() time.Duration {
	return time.Duration(p.ProbeTimeoutMs) * time.Millisecond
}

// LSAInterval returns LSAIntervalMs as a duration.
func (p Params) LSAInterval() time.Duration {
	return time.Duration(p.LSAIntervalMs) * time.Millisecond
}

// LSATTL returns LSATTLMs as a duration.
func (p Params) LSATTL() time.Duration {
	return time.Duration(p.LSATTLMs) * time.Millisecond
}

// Peer is a known neighbour node.
type Peer struct {
	ID   NodeID `yaml:"id"`
	Name string `yaml:"name"`
	Addr string `yaml:"addr"` // host:port for UDP
}

// NodeConfig is the top-level config for a live brnode.
type NodeConfig struct {
	Node struct {
		ID    NodeID `yaml:"id"`
		Name  string `yaml:"name"`
		Label string `yaml:"label"`
		Role  string `yaml:"role"` // edge | relay | exit
	} `yaml:"node"`
	Mode   string `yaml:"mode"` // live | sim
	Listen struct {
		OverlayUDP string `yaml:"overlay_udp"`
		StreamTCP  string `yaml:"stream_tcp"`
		API        string `yaml:"api"`
	} `yaml:"listen"`
	Peers   []Peer `yaml:"peers"`
	Params  Params `yaml:"params"`
	Logging struct {
		DataDir    string `yaml:"data_dir"`
		ResultsDir string `yaml:"results_dir"`
	} `yaml:"logging"`
	CORSOrigins []string `yaml:"cors_origins"`
}

// LoadNodeConfig reads a YAML file and merges defaults.
func LoadNodeConfig(path string) (*NodeConfig, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read config: %w", err)
	}
	cfg := &NodeConfig{}
	cfg.Params = DefaultParams()
	if err := yaml.Unmarshal(b, cfg); err != nil {
		return nil, fmt.Errorf("parse config: %w", err)
	}
	if cfg.Listen.API == "" {
		cfg.Listen.API = "127.0.0.1:8080"
	}
	if cfg.Logging.DataDir == "" {
		cfg.Logging.DataDir = "./data"
	}
	if cfg.Logging.ResultsDir == "" {
		cfg.Logging.ResultsDir = "./results"
	}
	return cfg, nil
}

// Validate checks that required fields are present and params are in range.
func (c *NodeConfig) Validate() error {
	if c.Node.ID == 0 {
		return fmt.Errorf("node.id must be non-zero")
	}
	if c.Node.Name == "" {
		return fmt.Errorf("node.name is required")
	}
	return validateParams(c.Params)
}

func validateParams(p Params) error {
	if p.Alpha <= 0 || p.Alpha > 1 {
		return fmt.Errorf("alpha must be in (0,1]")
	}
	if p.MaxHops < 1 || p.MaxHops > 4 {
		return fmt.Errorf("max_hops must be 1–4")
	}
	return nil
}
