// Package transport defines the Transport interface and the Inbound type.
// Concrete implementations: SimTransport (internal/sim) and UDPTransport (internal/transport/udp.go).
package transport

import "github.com/bharatroute/internal/config"

// Inbound is a packet received from the network.
type Inbound struct {
	From NodeID
	Data []byte
}

// NodeID alias for convenience.
type NodeID = config.NodeID

// Transport is the single interface that both sim and live nodes use to
// send and receive raw byte packets.  All implementations must be safe for
// concurrent use.
type Transport interface {
	// Send delivers pkt to the node identified by to.
	Send(to NodeID, pkt []byte) error
	// Recv returns a channel that emits every packet delivered to this node.
	Recv() <-chan Inbound
	// Close shuts down the transport gracefully.
	Close() error
}
