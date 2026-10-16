// Package proto defines the overlay packet wire format (Section 6.1) and
// encode/decode helpers.
//
// Packet layout (32-byte header, big-endian):
//
//	 0-1  magic    0xB7AE
//	   2  version  1
//	   3  type     1=DATA 2=PING 3=PONG 4=LSA 5=ECHO_REQ 6=ECHO_REP
//	   4  flags    bit0=HMAC bit1=reply
//	   5  ttl
//	   6  hop_idx
//	   7  path_len (2-4)
//	8-11  flow_id  (uint32)
//
// 12-15  seq      (uint32)
// 16-23  ts_ns    (int64, monotonic ns)
// 24-31  path[4]  (4×uint16, unused entries=0xFFFF)
// 32+    payload  (up to 1200 bytes)
package proto

import (
	"encoding/binary"
	"errors"
)

const (
	Magic   = uint16(0xB7AE)
	Version = uint8(1)
	HdrLen  = 32
	MaxPath = 4
	MaxPay  = 1200
	NoNode  = uint16(0xFFFF)

	TypeData    = uint8(1)
	TypePing    = uint8(2)
	TypePong    = uint8(3)
	TypeLSA     = uint8(4)
	TypeEchoReq = uint8(5)
	TypeEchoRep = uint8(6)

	FlagHMAC  = uint8(0x01)
	FlagReply = uint8(0x02)
)

// Packet is a decoded overlay packet.
type Packet struct {
	Type    uint8
	Flags   uint8
	TTL     uint8
	HopIdx  uint8
	PathLen uint8
	FlowID  uint32
	Seq     uint32
	TsNs    int64
	Path    [MaxPath]uint16 // NodeIDs; unused = 0xFFFF
	Payload []byte
}

// Encode serialises p into a new byte slice.
func Encode(p *Packet) ([]byte, error) {
	if p.PathLen < 2 || p.PathLen > MaxPath {
		return nil, errors.New("proto: path_len must be 2–4")
	}
	if len(p.Payload) > MaxPay {
		return nil, errors.New("proto: payload too large")
	}
	buf := make([]byte, HdrLen+len(p.Payload))
	binary.BigEndian.PutUint16(buf[0:], Magic)
	buf[2] = Version
	buf[3] = p.Type
	buf[4] = p.Flags
	buf[5] = p.TTL
	buf[6] = p.HopIdx
	buf[7] = p.PathLen
	binary.BigEndian.PutUint32(buf[8:], p.FlowID)
	binary.BigEndian.PutUint32(buf[12:], p.Seq)
	binary.BigEndian.PutUint64(buf[16:], uint64(p.TsNs))
	for i := 0; i < MaxPath; i++ {
		id := p.Path[i]
		if i >= int(p.PathLen) {
			id = NoNode
		}
		binary.BigEndian.PutUint16(buf[24+i*2:], id)
	}
	copy(buf[HdrLen:], p.Payload)
	return buf, nil
}

// Decode parses a raw datagram into a Packet.  Returns an error for invalid
// magic, version mismatch, or truncated data.
func Decode(raw []byte) (*Packet, error) {
	if len(raw) < HdrLen {
		return nil, errors.New("proto: datagram too short")
	}
	if binary.BigEndian.Uint16(raw[0:]) != Magic {
		return nil, errors.New("proto: bad magic")
	}
	if raw[2] != Version {
		return nil, errors.New("proto: unsupported version")
	}
	p := &Packet{}
	p.Type = raw[3]
	p.Flags = raw[4]
	p.TTL = raw[5]
	p.HopIdx = raw[6]
	p.PathLen = raw[7]
	p.FlowID = binary.BigEndian.Uint32(raw[8:])
	p.Seq = binary.BigEndian.Uint32(raw[12:])
	p.TsNs = int64(binary.BigEndian.Uint64(raw[16:]))
	for i := 0; i < MaxPath; i++ {
		p.Path[i] = binary.BigEndian.Uint16(raw[24+i*2:])
	}
	pay := raw[HdrLen:]
	if len(pay) > MaxPay {
		return nil, errors.New("proto: payload exceeds max")
	}
	p.Payload = make([]byte, len(pay))
	copy(p.Payload, pay)
	return p, nil
}

// NextHop returns the NodeID that should receive the packet next, or NoNode
// if the packet is at the final destination.
func (p *Packet) NextHop() uint16 {
	next := int(p.HopIdx) + 1
	if next >= int(p.PathLen) {
		return NoNode
	}
	return p.Path[next]
}

// CurrentNode returns the NodeID that should currently hold the packet.
func (p *Packet) CurrentNode() uint16 {
	return p.Path[p.HopIdx]
}

// MakePing builds a PING packet from src to dst with the given seq and timestamp.
func MakePing(src, dst uint16, seq uint32, tsNs int64) (*Packet, error) {
	return &Packet{
		Type:    TypePing,
		TTL:     8,
		HopIdx:  0,
		PathLen: 2,
		Seq:     seq,
		TsNs:    tsNs,
		Path:    [MaxPath]uint16{src, dst, NoNode, NoNode},
	}, nil
}

// MakePong builds a PONG reply by reversing a PING packet.
func MakePong(ping *Packet) *Packet {
	pong := *ping
	pong.Type = TypePong
	pong.Flags |= FlagReply
	pong.HopIdx = 0
	pong.Path[0] = ping.Path[1]
	pong.Path[1] = ping.Path[0]
	return &pong
}
