package proto

import (
	"math/rand"
	"testing"
)

func TestRoundTrip(t *testing.T) {
	pkt := &Packet{
		Type:    TypeEchoReq,
		Flags:   0,
		TTL:     8,
		HopIdx:  0,
		PathLen: 3,
		FlowID:  42,
		Seq:     1234,
		TsNs:    9876543210,
		Path:    [MaxPath]uint16{1, 3, 6, NoNode},
		Payload: []byte("hello"),
	}
	raw, err := Encode(pkt)
	if err != nil {
		t.Fatal(err)
	}
	got, err := Decode(raw)
	if err != nil {
		t.Fatal(err)
	}
	if got.Type != pkt.Type || got.Seq != pkt.Seq || got.TsNs != pkt.TsNs {
		t.Fatalf("round-trip mismatch: %+v", got)
	}
	if string(got.Payload) != "hello" {
		t.Fatalf("payload mismatch: %q", got.Payload)
	}
}

func TestNextHop(t *testing.T) {
	pkt := &Packet{HopIdx: 0, PathLen: 3, Path: [MaxPath]uint16{1, 3, 6, NoNode}}
	if pkt.NextHop() != 3 {
		t.Fatalf("expected 3, got %d", pkt.NextHop())
	}
	pkt.HopIdx = 2
	if pkt.NextHop() != NoNode {
		t.Fatalf("expected NoNode at final hop")
	}
}

func TestBadMagic(t *testing.T) {
	raw := make([]byte, HdrLen)
	_, err := Decode(raw)
	if err == nil {
		t.Fatal("expected error on bad magic")
	}
}

func TestMaxPayload(t *testing.T) {
	pkt := &Packet{Type: TypeData, TTL: 8, PathLen: 2, Path: [MaxPath]uint16{1, 2, NoNode, NoNode}, Payload: make([]byte, MaxPay)}
	rand.Read(pkt.Payload)
	raw, err := Encode(pkt)
	if err != nil {
		t.Fatal(err)
	}
	got, err := Decode(raw)
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Payload) != MaxPay {
		t.Fatalf("payload length: %d", len(got.Payload))
	}
}

func TestPingPong(t *testing.T) {
	ping, _ := MakePing(1, 6, 7, 1000)
	pong := MakePong(ping)
	if pong.Path[0] != 6 || pong.Path[1] != 1 {
		t.Fatalf("pong path wrong: %v", pong.Path)
	}
}
