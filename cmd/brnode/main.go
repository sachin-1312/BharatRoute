// brnode: live node daemon (P1).
// In sim mode brsim is used instead; this binary handles live UDP networking.
package main

import (
	"flag"
	"log/slog"
	"os"
)

func main() {
	configPath := flag.String("config", "config/node.yaml", "Path to node YAML config")
	flag.Parse()
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stderr, nil)))
	slog.Info("brnode starting (P1, not yet implemented)", "config", *configPath)
	// P1: UDPTransport, HMAC, SOCKS5 — implement in M10.
	os.Exit(0)
}
