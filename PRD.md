# BharatRoute: Product Requirements Document (Prototype)

| | |
|---|---|
| **Project** | BharatRoute, a latency-aware overlay network for traffic leaving India |
| **Document type** | PRD for a working hackathon prototype |
| **Version** | 1.0 |
| **Audience** | The builder (you), or an AI coding agent given this file as its spec |
| **Prototype goal** | A demo that runs on one Windows laptop in simulation mode and, with the same code, on 3 to 6 cloud VMs in live mode |

> **How to use this file with an AI coding agent:** give it this whole document, then tell it to build milestone by milestone (Section 16). Section 18 is the frontend spec and follows the attached `DESIGN-zapier.md`.

---

## 1. Overview

### 1.1 Problem
Traffic leaving India often takes long domestic detours before it reaches a submarine cable landing station (mostly Mumbai and Chennai). Users far from the coast (Punjab, Delhi, the Northeast) feel this most. Weak local peering can also make India-to-India traffic leave the country and come back (tromboning). We cannot change BGP or ISP agreements, so the fix has to work on top of the existing internet.

### 1.2 Solution
A small **overlay network** of relay nodes:

1. Nodes probe each other continuously and measure latency and loss per link.
2. Nodes share those measurements (link-state), so every node holds the full latency map.
3. A routing engine picks the cheapest path with at most two relays.
4. A forwarder sends traffic along that path and reroutes automatically when a link degrades or fails.
5. A live dashboard shows the graph, the chosen path, and direct versus overlay latency.

### 1.3 One-line pitch
Software can't shorten a cable. It can choose a better road.

### 1.4 Goals
- **G1.** Show, with a working system, that an overlay path can beat the default path on measured latency.
- **G2.** Demonstrate automatic failover when a link degrades or a node dies.
- **G3.** Make the demo reliable and visual: a judge should understand it within 30 seconds of looking at the dashboard.
- **G4.** Produce real numbers (direct vs overlay median, p95, win rate, failover time) that fill the `[__]` placeholders on the Results slide.

### 1.5 Non-goals (explicitly out of scope)
- Changing BGP, ISP routing, or any real network infrastructure.
- Production-grade security, multi-tenant use, billing, or user accounts.
- Beating the speed of light. Gains come from avoiding congested or roundabout paths only.
- Supporting more than 8 nodes.
- Acting as an open proxy or carrying anyone else's traffic.

### 1.6 Success metrics

| ID | Metric | Target (prototype) |
|---|---|---|
| M1 | Route convergence after a link change (sim mode) | <= 3 s |
| M2 | Failover after a link or node goes down | <= 3 s with default settings |
| M3 | Forwarding overhead per relay hop (localhost) | <= 2 ms added RTT |
| M4 | Dashboard update latency from event to screen | <= 1 s |
| M5 | Demo scenario success rate (sim mode, scripted) | 100 percent over 10 runs |
| M6 | Live mode: percentage of benchmark rounds where overlay wins | Report honestly, whatever it is |

---

## 2. Users and use cases

### 2.1 Personas
- **Hackathon judge:** non-technical or semi-technical. Wants to see a clear before/after in under a minute.
- **Builder/presenter (you):** runs the demo, triggers events, exports numbers for slides.
- **Curious engineer:** reads the code and the benchmark method and asks whether the claim is honest.

### 2.2 Primary use cases
- **UC1. Watch routing in action.** Open the dashboard, see nodes, links, RTTs, and the active path highlighted.
- **UC2. Trigger a problem and watch the fix.** Degrade a link (add latency or loss) or kill a node, and watch the route change.
- **UC3. Prove it with numbers.** Run a benchmark that sends interleaved direct and overlay probes, then see median, p95, loss, and win rate.
- **UC4. Use it with a real app (P1).** Point a browser or `curl` at a local SOCKS5 port and have the traffic exit through a remote node.
- **UC5. Export data.** Download the probe log and benchmark results as CSV for slides and analysis.

---

## 3. Scope and priorities

| Priority | Feature |
|---|---|
| **P0 (must ship)** | Node daemon with prober, link-state exchange, routing engine, UDP forwarder, control API, WebSocket events |
| **P0** | Simulation mode (virtual links, India scenario, event injection) |
| **P0** | Dashboard: overview graph, latency chart, latency matrix, current route with cost breakdown |
| **P0** | Benchmark runner (direct vs overlay, interleaved) and results page |
| **P0** | CSV logging of probes and benchmarks |
| **P1 (should ship)** | Live mode on real VMs with a peer config file |
| **P1** | SOCKS5 entry point with TCP stream relay |
| **P1** | Packet HMAC authentication |
| **P1** | Hysteresis tuning UI (settings page) |
| **P2 (stretch)** | Latency prediction by time of day (simple regression) |
| **P2** | Multipath (split traffic over two routes) |
| **P2** | QUIC encapsulation comparison |

---

## 4. System architecture

### 4.1 Component diagram

```mermaid
flowchart LR
  subgraph Client machine
    UI[Dashboard (React)]
    SOCKS[SOCKS5 proxy P1]
    N0[brnode: edge node LDH]
  end
  UI <-- REST + WebSocket --> N0
  SOCKS --> N0
  N0 <-- UDP overlay --> N1[brnode: BOM]
  N0 <-- UDP overlay --> N2[brnode: MAA]
  N1 <-- UDP overlay --> N3[brnode: SIN]
  N2 <-- UDP overlay --> N3
  N0 <-. direct UDP .-> N3
  N3 --> ECHO[Echo service]
```

### 4.2 Design decisions

1. **One binary, two modes.** The node daemon (`brnode`) runs the same code in simulation and live mode. Only the `Transport` implementation differs:
   - `UDPTransport`: real UDP sockets (live mode).
   - `SimTransport`: in-process virtual links with configurable delay, jitter, and loss (sim mode).
2. **Fully decentralized control.** There is no central controller. Every node floods link-state to every peer (full mesh, N <= 8). The dashboard talks to a single node (the "gateway node", usually the edge node on your laptop), which already knows the whole graph.
3. **Source routing.** The sender puts the full path in the packet header. Relays just forward to the next hop. This makes loops impossible and keeps relays stateless.
4. **Hop limit.** At most 3 links per path (source, up to 2 relays, destination).
5. **Honest overhead.** Every relay hop adds a fixed processing penalty (default 1 ms) in the cost function, so the router doesn't pick a relay unless it really helps.
6. **Interleaved measurement.** The benchmark alternates direct and overlay probes so both see the same network conditions.

### 4.3 Technology stack

| Layer | Choice | Why |
|---|---|---|
| Node daemon | **Go 1.22+** | Great networking, goroutines, single static binary, easy Windows and Linux cross-compile |
| WebSocket | `github.com/coder/websocket` | Small, well maintained |
| HTTP router | Go standard library `net/http` (1.22 patterns) | No framework needed |
| Stream multiplexing (P1) | `github.com/hashicorp/yamux` | Multiplex TCP streams for SOCKS5 relay |
| SOCKS5 (P1) | `github.com/things-go/go-socks5` or a minimal custom server | Fast to wire up |
| Config | YAML (`gopkg.in/yaml.v3`) and JSON scenarios | Human-editable |
| Logging | `log/slog` JSON logs plus CSV writers | Structured and exportable |
| Frontend | **React 18 + Vite + TypeScript + Tailwind CSS** | Fast to build, matches the design tokens easily |
| Charts | Recharts | Simple line and bar charts |
| Graph | Custom SVG (no graph library) | Full control over the look |
| State | Zustand plus a WebSocket hook | Small and predictable |
| Fonts | `@fontsource/inter` (weights 400, 500, 600, 700) | Matches the design file |
| Tests | Go `testing` plus `testify`; Vitest for the frontend | Standard |

### 4.4 Deployment topologies

**A. Simulation (default, works offline on Windows):** one process `brsim` runs 7 nodes in memory, plus the HTTP API on `:8080`, plus the dashboard on `:5173`.

**B. Live (P1):** one `brnode` per VM (Mumbai, Chennai or Hyderabad, Singapore, optional Frankfurt), plus one `brnode` on your laptop as the edge node, all configured with the same peer list and shared secret.

---

## 5. Functional requirements

Requirement IDs are used in tests and the milestone plan. "Shall" means required for the stated priority.

### 5.1 Transport abstraction (P0)

- **FR-T1.** The system shall define a `Transport` interface: `Send(to NodeID, pkt []byte) error`, `Recv() <-chan Inbound`, `Close()`.
- **FR-T2.** `UDPTransport` shall use one UDP socket per node and a peer table mapping `NodeID` to `host:port`.
- **FR-T3.** `SimTransport` shall deliver packets between in-process nodes after a delay drawn from the link model (Section 12), dropping packets with the configured loss probability, independently per direction.
- **FR-T4.** A link marked `down` in the sim shall drop 100 percent of packets in both directions.

### 5.2 Prober (P0)

- **FR-P1.** Each node shall send a PING to every peer every `probe_interval_ms` (default 500 ms), with a per-peer sequence number and a send timestamp.
- **FR-P2.** On PONG receipt, the node shall compute `rtt_ms = now - echoed_timestamp`.
- **FR-P3.** Latency shall be smoothed with an EWMA: `ewma = alpha * sample + (1 - alpha) * ewma`, default `alpha = 0.2`. The first sample initializes the EWMA.
- **FR-P4.** Loss shall be the fraction of unanswered probes in a sliding window of the last `loss_window` probes (default 20). A probe counts as lost if no PONG arrives within `probe_timeout_ms` (default 1000).
- **FR-P5.** Jitter shall be the mean absolute difference between consecutive RTT samples over the window.
- **FR-P6.** A link shall be marked `down` after `down_after_misses` consecutive missed probes (default 4) and `up` again after `up_after_hits` consecutive answered probes (default 2).
- **FR-P7.** Per-link history (timestamp, rtt, loss, state) shall be kept in an in-memory ring buffer covering at least the last 30 minutes and appended to a CSV file (Section 5.9).

### 5.3 Link-state exchange (P0)

- **FR-L1.** Each node shall broadcast a link-state advertisement (LSA) to all peers every `lsa_interval_ms` (default 2000 ms), and immediately when any local link changes state or when its RTT changes by more than 15 percent or loss changes by more than 2 percentage points.
- **FR-L2.** An LSA shall contain: `origin` node ID, monotonically increasing `seq`, `timestamp`, and a list of links `{to, rtt_ms, loss_pct, jitter_ms, state}`.
- **FR-L3.** Nodes shall keep the newest LSA per origin and discard LSAs with a lower or equal `seq`.
- **FR-L4.** An LSA older than `lsa_ttl_ms` (default 10000 ms) shall be treated as expired, and the origin's links dropped from the graph (the node is considered unreachable).
- **FR-L5.** The graph used for routing shall be built from the freshest LSAs. A link is usable only if both directions report it `up` (or the only available report says `up`).
- **FR-L6.** Link metrics for routing shall use the average of the two directions' reported RTT (symmetry assumption, documented in the UI).

### 5.4 Routing engine (P0)

- **FR-R1.** For each destination, the engine shall find the lowest-cost path from the local node using at most `max_hops` links (default 3).
- **FR-R2.** Link cost = `rtt_ewma_ms + loss_penalty_ms_per_pct * loss_pct`. Default `loss_penalty_ms_per_pct = 20`.
- **FR-R3.** Path cost = sum of link costs + `relay_overhead_ms` (default 1 ms) for every intermediate node.
- **FR-R4.** The direct path (one link) is always a candidate. If the direct link is `down`, it has infinite cost.
- **FR-R5.** The engine shall use hop-limited search (Bellman-Ford with a hop cap, or exhaustive enumeration since N <= 8). Ties break by fewer hops, then by lower node ID.
- **FR-R6.** **Hysteresis:** the active route for a destination changes only if the best candidate's cost is lower than the active route's cost by at least `switch_margin_pct` (default 10 percent) for `switch_confirmations` consecutive evaluations (default 3), and at least `min_dwell_ms` (default 5000) has passed since the last change. If the active route becomes invalid (a link is down), the engine switches immediately, ignoring hysteresis.
- **FR-R7.** The engine shall re-evaluate routes whenever the graph changes and at least once per second.
- **FR-R8.** Each route change shall emit a `route_change` event containing old path, new path, old cost, new cost, and a reason (`better_path`, `link_down`, `node_down`, `link_degraded`).
- **FR-R9.** The engine shall expose, for every destination, the full list of evaluated candidate paths with cost breakdowns (latency part, loss part, relay overhead part) so the UI can explain the decision.

### 5.5 UDP forwarder (P0)

- **FR-F1.** The forwarder shall use the packet format in Section 6.1.
- **FR-F2.** On receiving a DATA or ECHO packet, a node shall check `path[hop_idx + 1] == self`. If not, drop and count `bad_route`.
- **FR-F3.** If the node is the last hop, it shall deliver to the local service (echo or UDP-forward exit). Otherwise it shall increment `hop_idx`, decrement `ttl`, and send to the next node.
- **FR-F4.** Packets with `ttl == 0` shall be dropped and counted.
- **FR-F5.** Replies shall travel the reversed path.
- **FR-F6.** The forwarder shall only forward packets received from known peers.
- **FR-F7.** The forwarder shall keep per-flow counters: packets, bytes, drops, and measured RTT where available.
- **FR-F8.** Built-in **Echo service**: on the last hop, ECHO_REQ packets are returned as ECHO_REP along the reversed path. This is the target for benchmarks and the dashboard's live probe.
- **FR-F9.** **UDP-forward flow (P1):** `brnode flow add --listen 127.0.0.1:9000 --dst SIN --target 1.2.3.4:53` creates a local UDP listener whose datagrams are carried over the overlay to the exit node, which sends them to `target` and returns replies.

### 5.6 SOCKS5 entry point and TCP relay (P1)

- **FR-S1.** The edge node shall optionally run a SOCKS5 server bound to `127.0.0.1:1080` supporting `CONNECT`.
- **FR-S2.** TCP needs reliability, so the P1 data plane for TCP uses **yamux-multiplexed TCP connections between neighbouring nodes**, not raw UDP. On `CONNECT host:port`, the edge node picks the current best path to the configured exit node, opens a stream hop by hop, and the exit node dials the target and splices bytes.
- **FR-S3.** The path for a TCP flow shall be fixed at connection start and shall not change mid-connection (new connections use the new route).
- **FR-S4.** The exit node shall only dial targets if `exit_enabled: true` in its config, and shall support an optional allowlist of target host patterns.
- **FR-S5.** Metrics for streams shall include bytes up and down, setup time, and the path used.

> **Note on the presentation:** slide 4 says "traffic is wrapped in UDP". In this prototype, UDP encapsulation carries datagram traffic and probes. TCP via SOCKS5 uses stream relaying over TCP between nodes. Either reword the "Forward" step to "Traffic is relayed along the chosen path", or keep it as is and only demo the UDP echo path.

### 5.7 Control API and events (P0)

- **FR-A1.** Each node shall expose an HTTP API on `api_listen` (default `127.0.0.1:8080`) with the endpoints in Section 8.
- **FR-A2.** The node shall expose a WebSocket at `/ws` pushing real-time events (Section 8.2).
- **FR-A3.** CORS shall allow `http://localhost:5173` by default (configurable).
- **FR-A4.** API responses shall use JSON with `snake_case` keys.
- **FR-A5.** In live mode, the API shall bind to localhost only unless `api_listen` is changed on purpose, and mutating endpoints require a bearer token if `api_token` is set.

### 5.8 Benchmark runner (P0)

- **FR-B1.** `POST /api/v1/benchmarks` starts a run with: `src`, `dst`, `count` (default 200), `interval_ms` (default 100), `payload_bytes` (default 64), `modes` (default `["direct","overlay"]`).
- **FR-B2.** The runner shall alternate packets between modes (`direct`, `overlay`, `direct`, `overlay`, ...), with each probe carrying a unique sequence number, so both modes experience the same time window.
- **FR-B3.** For each mode the result shall include: sent, received, loss percent, min, mean, median, p95, p99, max RTT, jitter, and the path used (for overlay, the path at the time of each probe, plus the most common path).
- **FR-B4.** The result shall also include `overlay_win_rate_pct`: the percentage of probe pairs (adjacent direct and overlay) where overlay RTT was lower, counting lost probes as infinite RTT. Also `median_improvement_ms` and `p95_improvement_ms`.
- **FR-B5.** Benchmarks shall stream progress via WebSocket and be stored for the session and written to `results/bench-<id>.json` and `.csv`.
- **FR-B6.** The runner shall be cancellable.
- **FR-B7.** Failover test mode (`type: "failover"`): runs continuous overlay probes, triggers an event (in sim mode, via the simulator; in live mode, by the user taking down a path manually), and measures time from the event to the first successful probe on a new path. Result: `failover_time_ms` and probes lost during failover.

### 5.9 Logging and export (P0)

- **FR-D1.** Each probe sample shall be appended to `data/probes-<nodeid>-<YYYYMMDD>.csv` with columns: `ts_iso, node, peer, seq, rtt_ms, ewma_ms, loss_pct, jitter_ms, state, mode`.
- **FR-D2.** Each route change shall be appended to `data/routes-<nodeid>-<YYYYMMDD>.csv` with columns: `ts_iso, dst, old_path, new_path, old_cost, new_cost, reason`.
- **FR-D3.** `GET /api/v1/export/probes?from=&to=` and `/export/routes` shall stream the CSV.
- **FR-D4.** In sim mode, every CSV row shall carry `mode=sim`, and the UI shall show a persistent "Simulated" badge. **Simulated numbers must never be presented as real measurements.**

### 5.10 Simulator (P0)

See Section 12 for the full spec. Requirements:

- **FR-M1.** `brsim --scenario scenarios/india.json` starts all scenario nodes in one process, with real routing and forwarding code and a `SimTransport`.
- **FR-M2.** The scenario file defines nodes (with display name, region, and map position), links (base RTT, jitter, loss), and an optional timeline of events.
- **FR-M3.** Events can also be injected at runtime via `POST /api/v1/sim/events` and through the dashboard's Simulator page.
- **FR-M4.** The simulator shall support `set_link`, `restore_link`, `kill_node`, `revive_node`, and `reset`.
- **FR-M5.** The simulator shall be deterministic when `seed` is set in the scenario (same random jitter and loss sequence).

---

## 6. Protocols and data formats

### 6.1 Overlay packet (UDP datagram)

All integers are big-endian. Header is fixed at **32 bytes**.

| Offset | Size | Field | Notes |
|---|---|---|---|
| 0 | 2 | `magic` | `0xB7 0xAE` |
| 2 | 1 | `version` | `1` |
| 3 | 1 | `type` | `1 DATA`, `2 PING`, `3 PONG`, `4 LSA`, `5 ECHO_REQ`, `6 ECHO_REP` |
| 4 | 1 | `flags` | bit0 = HMAC tag present, bit1 = reply (reversed path) |
| 5 | 1 | `ttl` | start at 8 |
| 6 | 1 | `hop_idx` | index in `path` of the node currently holding the packet |
| 7 | 1 | `path_len` | number of nodes in path, 2 to 4 |
| 8 | 4 | `flow_id` | 0 for control traffic |
| 12 | 4 | `seq` | per-flow or per-peer sequence number |
| 16 | 8 | `ts_ns` | sender's monotonic or Unix nanoseconds, echoed back for RTT |
| 24 | 8 | `path[4]` | four `uint16` node IDs; unused entries are `0xFFFF` |
| 32 | N | `payload` | up to 1200 bytes |
| 32+N | 8 | `hmac` | optional (P1): first 8 bytes of HMAC-SHA256(key, header+payload) |

**Forwarding rule:** a node holding a packet with `hop_idx = i` sends it to `path[i+1]` after setting `hop_idx = i+1`. Receiving node checks `path[hop_idx] == self`. When `hop_idx == path_len - 1`, the packet is delivered locally.

**Reply rule:** for a reply, the destination sets flag bit1 and swaps to the reversed path, with `hop_idx = 0`.

### 6.2 Control message payloads (JSON, inside the packet payload)

PING and PONG have an empty payload (the header carries seq and timestamp). LSA payload:

```json
{
  "origin": 1,
  "seq": 4821,
  "ts": "2026-10-15T10:20:30.123Z",
  "links": [
    { "to": 3, "rtt_ms": 35.2, "loss_pct": 0.0, "jitter_ms": 1.4, "state": "up" },
    { "to": 6, "rtt_ms": 128.9, "loss_pct": 1.5, "jitter_ms": 6.1, "state": "up" }
  ]
}
```

### 6.3 Stream relay handshake (P1, TCP)

Between neighbours, nodes hold one yamux session over TCP (`stream_listen`, default `:7001`). A new stream starts with a JSON line:

```json
{ "type": "connect", "path": [1, 3, 6], "hop_idx": 1, "target": "example.com:443", "token": "<hmac>" }
```

Each relay opens a stream to `path[hop_idx + 1]`, forwards the same message with `hop_idx` incremented, and splices bytes. The exit node dials `target` and replies `{"ok":true}` or `{"ok":false,"err":"..."}`.

---

## 7. Algorithms

### 7.1 Latency, loss, and jitter

```
on pong(peer, seq, ts):
    rtt = now - ts
    ewma[peer] = rtt if first else alpha*rtt + (1-alpha)*ewma[peer]
    window[peer].push(answered=true, rtt)
    hits[peer]++; misses[peer]=0
    if state==down and hits >= up_after_hits: state = up

on probe_timeout(peer, seq):
    window[peer].push(answered=false)
    misses[peer]++; hits[peer]=0
    if misses >= down_after_misses: state = down

loss_pct   = 100 * unanswered_in_window / window_size
jitter_ms  = mean(|rtt[i] - rtt[i-1]|) over answered samples in window
```

### 7.2 Graph build

```
graph = {}
for each fresh LSA from node a:
    for each link (a -> b) with state up:
        reported[a][b] = (rtt, loss)
for each pair (a, b) where reported[a][b] or reported[b][a] exists:
    if either direction says down: skip (link unusable)
    rtt  = average of available directions
    loss = max of available directions
    graph[a][b] = graph[b][a] = (rtt, loss)
```

### 7.3 Hop-limited shortest path

```
function best_paths(src, dst, graph, max_hops):
    candidates = []
    dfs(path=[src], cost=0):
        node = path[-1]
        if node == dst: candidates.append((path, cost)); return
        if len(path)-1 == max_hops: return
        for nbr in graph[node]:
            if nbr in path: continue                       # no loops
            link_cost = rtt + loss_penalty*loss
            relay_cost = relay_overhead if nbr != dst else 0
            dfs(path+[nbr], cost + link_cost + relay_cost)
    sort candidates by (cost, hops, node ids)
    return candidates
```

With N <= 8 and max 3 hops, this is a few hundred paths at most and runs in microseconds.

### 7.4 Hysteresis and failover

```
on evaluate(dst):
    cands = best_paths(...)
    best = cands[0]
    active = current_route[dst]
    if active is None or not valid(active):
        switch(best, reason=link_down or node_down); return
    active_cost = cost_of(active, graph)
    if best.path == active.path:
        pending[dst] = None; return
    if best.cost < active_cost * (1 - switch_margin_pct/100):
        pending[dst].count += 1 if pending[dst].path == best.path else reset to 1
        if pending[dst].count >= switch_confirmations and now - last_change >= min_dwell:
            switch(best, reason=better_path)
    else:
        pending[dst] = None
```

`valid(active)` is false when any link on the path is down or any node's LSA has expired. Invalid routes bypass hysteresis.

### 7.5 Benchmark statistics

- Percentiles use the nearest-rank method on answered probes only; loss is reported separately.
- `overlay_win_rate_pct` is computed over adjacent pairs (direct_i, overlay_i). A lost probe is treated as `+inf`. If both are lost, the pair is excluded.
- `median_improvement_ms = median(direct) - median(overlay)` (positive means overlay is faster). `p95_improvement_ms` likewise.

---

## 8. API specification

Base URL: `http://127.0.0.1:8080`. All JSON, `snake_case`.

### 8.1 REST endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/health` | `{status, version, mode, node_id, uptime_s}` |
| GET | `/api/v1/state` | Full snapshot (nodes, links, routes, flows, params) |
| GET | `/api/v1/nodes` | Node list |
| GET | `/api/v1/links` | Link list with current metrics |
| GET | `/api/v1/matrix` | Latency matrix `{nodes:[ids], rtt:[[...]], loss:[[...]]}` |
| GET | `/api/v1/routes` | Active route per destination |
| GET | `/api/v1/routes/{dst}` | Active route and all candidates with cost breakdowns |
| GET | `/api/v1/history/links/{a}-{b}?window_s=300` | Time series for a link |
| GET | `/api/v1/history/path?src=&dst=&window_s=300` | Direct vs overlay RTT series from the live echo probe |
| POST | `/api/v1/benchmarks` | Start a benchmark run |
| GET | `/api/v1/benchmarks` | List runs |
| GET | `/api/v1/benchmarks/{id}` | Run status and result |
| DELETE | `/api/v1/benchmarks/{id}` | Cancel a run |
| GET | `/api/v1/params` | Routing and probing parameters |
| PUT | `/api/v1/params` | Update parameters (validated) |
| POST | `/api/v1/sim/events` | Inject a sim event (sim mode only, 404 otherwise) |
| GET | `/api/v1/sim/scenario` | Loaded scenario metadata and timeline |
| POST | `/api/v1/sim/reset` | Reset all links and nodes to scenario defaults |
| GET | `/api/v1/export/probes` | CSV stream |
| GET | `/api/v1/export/routes` | CSV stream |

**Example: `GET /api/v1/state` (abridged)**

```json
{
  "mode": "sim",
  "self": "LDH",
  "now": "2026-10-15T10:20:30.123Z",
  "nodes": [
    { "id": 1, "name": "LDH", "label": "Ludhiana", "region": "IN-PB", "pos": {"x": 0.30, "y": 0.18}, "state": "up", "role": "edge" },
    { "id": 6, "name": "SIN", "label": "Singapore", "region": "SG", "pos": {"x": 0.86, "y": 0.78}, "state": "up", "role": "relay" }
  ],
  "links": [
    { "a": 1, "b": 6, "rtt_ms": 128.4, "loss_pct": 0.0, "jitter_ms": 4.2, "state": "up", "kind": "direct" }
  ],
  "routes": [
    {
      "dst": 6,
      "active": { "path": [1, 3, 6], "cost_ms": 82.4, "since": "2026-10-15T10:19:02Z" },
      "direct": { "path": [1, 6], "cost_ms": 128.4 },
      "improvement_ms": 46.0
    }
  ],
  "params": { "alpha": 0.2, "loss_penalty_ms_per_pct": 20, "relay_overhead_ms": 1, "max_hops": 3,
              "switch_margin_pct": 10, "switch_confirmations": 3, "min_dwell_ms": 5000 }
}
```

**Example: `GET /api/v1/routes/SIN`**

```json
{
  "dst": 6,
  "active": { "path": [1, 3, 6] },
  "candidates": [
    { "path": [1, 3, 6], "cost_ms": 82.4, "breakdown": { "latency_ms": 81.4, "loss_ms": 0.0, "relay_ms": 1.0 } },
    { "path": [1, 2, 6], "cost_ms": 97.1, "breakdown": { "latency_ms": 96.1, "loss_ms": 0.0, "relay_ms": 1.0 } },
    { "path": [1, 6],    "cost_ms": 128.4, "breakdown": { "latency_ms": 128.4, "loss_ms": 0.0, "relay_ms": 0.0 } }
  ]
}
```

**Example: `POST /api/v1/benchmarks`**

```json
{ "src": "LDH", "dst": "SIN", "count": 200, "interval_ms": 100, "payload_bytes": 64, "modes": ["direct", "overlay"] }
```

Response `202`: `{ "id": "bench_20261015_1020", "status": "running" }`

**Example: finished benchmark result**

```json
{
  "id": "bench_20261015_1020",
  "status": "done",
  "mode": "sim",
  "src": "LDH", "dst": "SIN", "count": 200,
  "direct":  { "sent": 200, "received": 197, "loss_pct": 1.5, "min": 121.0, "mean": 129.4, "median": 128.7, "p95": 141.2, "p99": 150.3, "max": 162.0, "jitter": 4.6 },
  "overlay": { "sent": 200, "received": 200, "loss_pct": 0.0, "min": 78.1, "mean": 82.0, "median": 81.5, "p95": 90.2, "p99": 95.0, "max": 101.4, "jitter": 3.1, "path": [1, 3, 6] },
  "overlay_win_rate_pct": 96.4,
  "median_improvement_ms": 47.2,
  "p95_improvement_ms": 51.0
}
```

(The numbers above are format examples only.)

**Example: `POST /api/v1/sim/events`**

```json
{ "type": "set_link", "a": "MAA", "b": "SIN", "rtt_ms": 140, "loss_pct": 3, "jitter_ms": 12 }
{ "type": "kill_node", "node": "BOM" }
{ "type": "restore_link", "a": "MAA", "b": "SIN" }
{ "type": "revive_node", "node": "BOM" }
```

**Errors:** `{ "error": { "code": "invalid_param", "message": "alpha must be in (0,1]" } }` with proper HTTP status (400, 404, 409, 500).

### 8.2 WebSocket events (`/ws`)

Server to client messages share an envelope: `{ "type": "...", "ts": "...", "data": { ... } }`.

| Type | When | `data` |
|---|---|---|
| `hello` | On connect | `{mode, self, version}` |
| `snapshot` | On connect, then every 5 s | Same as `/state` |
| `link_update` | Link metrics changed (throttled to 4 per second per link) | `{a, b, rtt_ms, loss_pct, jitter_ms, state}` |
| `node_update` | Node state changed | `{id, state}` |
| `route_change` | Active route changed | `{dst, old_path, new_path, old_cost, new_cost, reason}` |
| `probe_sample` | Live path echo probe (1 per second) | `{dst, mode, rtt_ms, path, lost}` |
| `bench_progress` | Benchmark progress | `{id, done, total, last_rtt_direct, last_rtt_overlay}` |
| `bench_done` | Benchmark finished | Full result |
| `sim_event` | Simulator event applied | `{type, ...}` |
| `toast` | Server-side notice | `{level, message}` |

The client sends nothing except optional `{ "type": "subscribe", "topics": [...] }`.

---

## 9. Data models

### 9.1 Go (core types)

```go
type NodeID uint16

type LinkMetrics struct {
    To        NodeID  `json:"to"`
    RTTms     float64 `json:"rtt_ms"`
    LossPct   float64 `json:"loss_pct"`
    JitterMs  float64 `json:"jitter_ms"`
    State     string  `json:"state"` // "up" | "down"
}

type LSA struct {
    Origin NodeID        `json:"origin"`
    Seq    uint64        `json:"seq"`
    TS     time.Time     `json:"ts"`
    Links  []LinkMetrics `json:"links"`
}

type Route struct {
    Dst      NodeID   `json:"dst"`
    Path     []NodeID `json:"path"`
    CostMs   float64  `json:"cost_ms"`
    Since    time.Time `json:"since"`
}

type Candidate struct {
    Path      []NodeID `json:"path"`
    CostMs    float64  `json:"cost_ms"`
    Breakdown struct {
        LatencyMs float64 `json:"latency_ms"`
        LossMs    float64 `json:"loss_ms"`
        RelayMs   float64 `json:"relay_ms"`
    } `json:"breakdown"`
}

type Params struct {
    Alpha                float64 `json:"alpha"`
    LossPenaltyMsPerPct  float64 `json:"loss_penalty_ms_per_pct"`
    RelayOverheadMs      float64 `json:"relay_overhead_ms"`
    MaxHops              int     `json:"max_hops"`
    SwitchMarginPct      float64 `json:"switch_margin_pct"`
    SwitchConfirmations  int     `json:"switch_confirmations"`
    MinDwellMs           int     `json:"min_dwell_ms"`
    ProbeIntervalMs      int     `json:"probe_interval_ms"`
    ProbeTimeoutMs       int     `json:"probe_timeout_ms"`
    LossWindow           int     `json:"loss_window"`
    DownAfterMisses      int     `json:"down_after_misses"`
    UpAfterHits          int     `json:"up_after_hits"`
    LSAIntervalMs        int     `json:"lsa_interval_ms"`
    LSATTLMs             int     `json:"lsa_ttl_ms"`
}
```

### 9.2 TypeScript (frontend types)

```ts
export type NodeState = 'up' | 'down';
export type Mode = 'sim' | 'live';

export interface NodeInfo { id: number; name: string; label: string; region: string;
  pos: { x: number; y: number }; state: NodeState; role: 'edge' | 'relay' | 'exit'; }

export interface Link { a: number; b: number; rtt_ms: number; loss_pct: number;
  jitter_ms: number; state: NodeState; kind: 'direct' | 'overlay'; }

export interface Candidate { path: number[]; cost_ms: number;
  breakdown: { latency_ms: number; loss_ms: number; relay_ms: number } }

export interface RouteInfo { dst: number;
  active: { path: number[]; cost_ms: number; since: string };
  direct: { path: number[]; cost_ms: number | null };
  improvement_ms: number | null; }

export interface Params { alpha: number; loss_penalty_ms_per_pct: number; relay_overhead_ms: number;
  max_hops: number; switch_margin_pct: number; switch_confirmations: number; min_dwell_ms: number; }

export interface BenchStats { sent: number; received: number; loss_pct: number; min: number;
  mean: number; median: number; p95: number; p99: number; max: number; jitter: number; path?: number[] }

export interface BenchResult { id: string; status: 'running' | 'done' | 'cancelled' | 'error';
  mode: Mode; src: string; dst: string; count: number; direct: BenchStats; overlay: BenchStats;
  overlay_win_rate_pct: number; median_improvement_ms: number; p95_improvement_ms: number; }

export interface WsEnvelope<T = unknown> { type: string; ts: string; data: T }
```

---

## 10. Configuration

### 10.1 Node config (`config/node-ldh.yaml`, live mode)

```yaml
node:
  id: 1
  name: LDH
  label: Ludhiana
  role: edge                 # edge | relay | exit
mode: live                   # live | sim
listen:
  overlay_udp: "0.0.0.0:7000"
  stream_tcp: "0.0.0.0:7001"      # P1
  api: "127.0.0.1:8080"
security:
  shared_key: "CHANGE_ME_LONG_RANDOM"   # P1 HMAC key
  api_token: ""                          # optional bearer token for mutating endpoints
peers:
  - { id: 2, name: DEL, addr: "203.0.113.10:7000" }
  - { id: 3, name: BOM, addr: "203.0.113.20:7000" }
  - { id: 4, name: MAA, addr: "203.0.113.30:7000" }
  - { id: 6, name: SIN, addr: "203.0.113.40:7000" }
exit:
  enabled: false
  allow_hosts: []
socks5:
  enabled: false
  listen: "127.0.0.1:1080"
  exit_node: SIN
params: {}                  # overrides for Params defaults
logging:
  data_dir: "./data"
  results_dir: "./results"
```

### 10.2 Default parameters

| Parameter | Default | Meaning |
|---|---|---|
| `probe_interval_ms` | 500 | Time between PINGs per peer |
| `probe_timeout_ms` | 1000 | Time before a probe counts as lost |
| `alpha` | 0.2 | EWMA smoothing |
| `loss_window` | 20 | Probes used for loss and jitter |
| `down_after_misses` | 4 | Consecutive misses to mark a link down |
| `up_after_hits` | 2 | Consecutive hits to mark it up again |
| `lsa_interval_ms` | 2000 | Periodic LSA broadcast |
| `lsa_ttl_ms` | 10000 | LSA expiry |
| `loss_penalty_ms_per_pct` | 20 | Cost added per percent of loss |
| `relay_overhead_ms` | 1 | Cost added per relay |
| `max_hops` | 3 | Links per path |
| `switch_margin_pct` | 10 | Required improvement to switch |
| `switch_confirmations` | 3 | Consecutive evaluations before switching |
| `min_dwell_ms` | 5000 | Minimum time between voluntary switches |

---

## 11. Repository structure and commands

```
bharatroute/
├── PRD.md
├── README.md
├── go.mod
├── cmd/
│   ├── brnode/main.go          # live node daemon
│   └── brsim/main.go           # simulator host (7 nodes in one process)
├── internal/
│   ├── transport/              # Transport interface, udp.go, sim.go
│   ├── proto/                  # packet encode/decode, LSA types
│   ├── prober/                 # PING/PONG, EWMA, loss, jitter, link state machine
│   ├── linkstate/              # LSA flooding, LSDB, graph build
│   ├── routing/                # hop-limited search, hysteresis, route table
│   ├── forwarder/              # source-routed forwarding, echo service
│   ├── relay/                  # P1: yamux stream relay + SOCKS5
│   ├── bench/                  # benchmark and failover runners, stats
│   ├── sim/                    # link models, scenario loader, event engine
│   ├── api/                    # REST handlers, WebSocket hub
│   ├── store/                  # ring buffers, CSV writers
│   └── config/                 # YAML loading, defaults, validation
├── scenarios/
│   ├── india.json              # preset demo scenario (Section 12)
│   └── small.json              # 4-node test scenario
├── config/                     # example live configs
├── data/                       # CSV logs (gitignored)
├── results/                    # benchmark outputs (gitignored)
├── web/                        # frontend (Section 18)
│   ├── package.json, vite.config.ts, tailwind.config.ts, index.html
│   └── src/ ...
└── scripts/
    ├── dev.ps1                 # run sim + frontend on Windows
    └── deploy-vm.sh            # copy binary + config to a VM, enable systemd unit
```

### 11.1 Commands (Windows PowerShell friendly)

```powershell
# Prerequisites: Go 1.22+, Node 20+, Git
go mod tidy
go build -o bin/brsim.exe ./cmd/brsim
go build -o bin/brnode.exe ./cmd/brnode

# Simulation demo
.\bin\brsim.exe --scenario scenarios/india.json --api 127.0.0.1:8080
cd web; npm install; npm run dev        # http://localhost:5173

# Live node
.\bin\brnode.exe --config config/node-ldh.yaml

# Cross-compile a Linux binary for a VM
$env:GOOS="linux"; $env:GOARCH="amd64"; go build -o bin/brnode-linux ./cmd/brnode

# Tests
go test ./... -race
cd web; npm test
```

---

## 12. Simulator and demo scenario

### 12.1 Link model

For each directed link, one-way delay per packet = `base_rtt/2 + N(0, jitter/2)` (clamped at >= 0.5 ms). Loss is an independent Bernoulli draw per packet with probability `loss_pct/100`. Delivery uses `time.AfterFunc`, so no goroutine per packet is needed. A `down` link drops everything.

### 12.2 Scenario file (`scenarios/india.json`)

```json
{
  "name": "India to Singapore (illustrative)",
  "seed": 42,
  "notes": "All latencies are ILLUSTRATIVE placeholders, not real measurements. Replace with live-mode data.",
  "nodes": [
    { "id": 1, "name": "LDH", "label": "Ludhiana",  "region": "IN-PB", "role": "edge",  "pos": {"x": 0.30, "y": 0.16} },
    { "id": 2, "name": "DEL", "label": "Delhi",     "region": "IN-DL", "role": "relay", "pos": {"x": 0.34, "y": 0.28} },
    { "id": 3, "name": "BOM", "label": "Mumbai",    "region": "IN-MH", "role": "relay", "pos": {"x": 0.26, "y": 0.56} },
    { "id": 4, "name": "MAA", "label": "Chennai",   "region": "IN-TN", "role": "relay", "pos": {"x": 0.44, "y": 0.78} },
    { "id": 5, "name": "HYD", "label": "Hyderabad", "region": "IN-TG", "role": "relay", "pos": {"x": 0.38, "y": 0.64} },
    { "id": 6, "name": "SIN", "label": "Singapore", "region": "SG",    "role": "exit",  "pos": {"x": 0.86, "y": 0.80} },
    { "id": 7, "name": "FRA", "label": "Frankfurt", "region": "DE",    "role": "exit",  "pos": {"x": 0.08, "y": 0.10} }
  ],
  "links": [
    { "a": "LDH", "b": "SIN", "rtt_ms": 130, "jitter_ms": 5, "loss_pct": 0.5 },
    { "a": "LDH", "b": "DEL", "rtt_ms": 8,   "jitter_ms": 1, "loss_pct": 0 },
    { "a": "LDH", "b": "BOM", "rtt_ms": 38,  "jitter_ms": 2, "loss_pct": 0 },
    { "a": "LDH", "b": "MAA", "rtt_ms": 46,  "jitter_ms": 2, "loss_pct": 0 },
    { "a": "LDH", "b": "HYD", "rtt_ms": 40,  "jitter_ms": 2, "loss_pct": 0 },
    { "a": "DEL", "b": "BOM", "rtt_ms": 30,  "jitter_ms": 2, "loss_pct": 0 },
    { "a": "DEL", "b": "SIN", "rtt_ms": 120, "jitter_ms": 4, "loss_pct": 0 },
    { "a": "BOM", "b": "SIN", "rtt_ms": 58,  "jitter_ms": 3, "loss_pct": 0 },
    { "a": "BOM", "b": "MAA", "rtt_ms": 22,  "jitter_ms": 2, "loss_pct": 0 },
    { "a": "MAA", "b": "SIN", "rtt_ms": 36,  "jitter_ms": 2, "loss_pct": 0 },
    { "a": "HYD", "b": "SIN", "rtt_ms": 52,  "jitter_ms": 3, "loss_pct": 0 },
    { "a": "HYD", "b": "MAA", "rtt_ms": 14,  "jitter_ms": 1, "loss_pct": 0 },
    { "a": "LDH", "b": "FRA", "rtt_ms": 190, "jitter_ms": 8, "loss_pct": 0.5 },
    { "a": "BOM", "b": "FRA", "rtt_ms": 125, "jitter_ms": 5, "loss_pct": 0 },
    { "a": "DEL", "b": "FRA", "rtt_ms": 150, "jitter_ms": 5, "loss_pct": 0 }
  ],
  "timeline": []
}
```

Expected initial routing from LDH to SIN: direct = 130 ms; via MAA = 46 + 36 + 1 = **83 ms** (wins); via BOM = 38 + 58 + 1 = 97 ms.

### 12.3 Scripted demo (about 90 seconds)

1. **t = 0:** dashboard shows the direct path at about 130 ms and the active overlay path LDH, MAA, SIN at about 83 ms. Overview KPI shows the improvement.
2. **t = 20 s:** click "Degrade MAA to SIN" (RTT 36 to 140 ms, loss 3 percent). Within about 3 s, the route flips to LDH, BOM, SIN (about 97 ms). The toast says "Route changed: link degraded".
3. **t = 40 s:** click "Kill MAA". Nothing visibly changes for the active route (already on BOM), but MAA turns to the down style.
4. **t = 55 s:** click "Kill BOM". Route switches to LDH, HYD, SIN (about 93 ms) within about 3 s. Failover time is displayed.
5. **t = 70 s:** click "Reset". After the dwell time, route returns to LDH, MAA, SIN.
6. **Finish:** run the benchmark and show median improvement and win rate.

### 12.4 Live-mode measurement protocol (P1)

For honest results, run live mode for at least 24 hours and benchmark at several times of day. Report median, p95, win rate, and failover time. If the overlay doesn't win on some paths, say so. That is a stronger result than an inflated one. Never mix simulated and live numbers on one slide.

---

## 13. Benchmark methodology

1. **Pairing:** probes alternate direct and overlay so both modes see the same conditions (FR-B2).
2. **Warm-up:** discard the first 10 probes per mode.
3. **Sample size:** default 200 per mode; at least 1000 for numbers shown on slides.
4. **Metrics:** min, mean, median, p95, p99, max, jitter, loss, win rate, improvement.
5. **Repeatability:** sim mode with a fixed seed gives identical results; live mode should be run several times and reported as a range.
6. **Overhead check (M3):** on localhost with zero link delay, measure RTT through 0, 1, and 2 relays to quantify forwarding overhead.
7. **Failover test:** measure `failover_time_ms` over 10 repetitions and report median and worst case.
8. **Transport comparison (P2):** optionally compare UDP echo versus TCP and QUIC handshake time over measured paths with `iperf3`, if time allows.

---

## 14. Non-functional requirements

### 14.1 Performance
- 7 nodes at 500 ms probing generate about 84 probe packets per second in total in the sim, which is trivial.
- API `GET /state` must respond within 50 ms.
- Dashboard must remain smooth (60 fps animations) with 8 nodes and 28 links.

### 14.2 Reliability
- A node must keep running if a peer is unreachable, and must never crash on malformed packets (fuzz test the decoder).
- Memory: the ring buffer is capped (default 30 minutes per link).

### 14.3 Security (prototype level)
- **Not an open relay:** drop packets from unknown peers (FR-F6).
- **P1:** HMAC tag on every overlay packet with a shared key; reject packets with bad tags.
- **SOCKS5 binds to localhost only;** exit nodes are disabled by default and support an allowlist.
- **API binds to localhost;** optional bearer token for mutating endpoints.
- No secrets in the repo; keys come from config or environment variables.

### 14.4 Ethics and compliance
- Only carry your own test traffic through relay nodes.
- Read the terms of service of your cloud provider before running relays or probes.
- Do not probe networks you don't own beyond your own VMs and ordinary public test hosts.
- Don't present simulated results as real, and label them clearly (FR-D4).

### 14.5 Observability
- Structured JSON logs with `node`, `component`, and `event` fields.
- Counters exposed in `/state`: packets forwarded, dropped (bad route, ttl, unknown peer, bad HMAC), LSAs sent and received, route changes.

### 14.6 Cost
- Live mode runs on free-tier or cheap VMs. Estimate per VM-month and note it in the README. Stop VMs after the demo.

---

## 15. Testing and acceptance criteria

### 15.1 Unit tests
- Packet encode/decode round trip, including max payload and invalid input (fuzz).
- EWMA and loss window math against fixed sequences.
- Link state machine (down after 4 misses, up after 2 hits).
- Hop-limited search on hand-built graphs, including ties, loops, and disconnected nodes.
- Hysteresis: no flapping on noisy input; immediate switch on link-down.
- Benchmark stats: percentiles, win rate with lost probes.

### 15.2 Integration tests (sim mode)
- Scenario loads and all nodes reach consistent LSDBs within 5 s.
- `set_link` degradation causes a route change within M1/M2 limits.
- `kill_node` causes failover within M2.
- `reset` restores the original route.
- Same seed gives identical benchmark output.

### 15.3 End-to-end (manual and Playwright)
- Dashboard shows nodes, links, active path, and live chart within 3 s of load.
- All sim buttons work and produce the expected visual changes.
- Benchmark page runs, displays results, and exports CSV.

### 15.4 Acceptance checklist

- [ ] `brsim` starts with `india.json`, API healthy at `/api/v1/health`.
- [ ] Active route LDH to SIN is via MAA at start; direct and overlay costs are visible.
- [ ] Degrading MAA to SIN flips the route to BOM within 3 s; toast shown.
- [ ] Killing BOM flips to HYD within 3 s; failover time recorded.
- [ ] Benchmark in sim mode shows overlay median lower than direct, win rate above 90 percent.
- [ ] CSV exports download and open in Excel.
- [ ] Simulated badge always visible in sim mode.
- [ ] Frontend passes the design checklist in Section 18.12.
- [ ] (P1) Live mode with 3 VMs forms a mesh and routes; results honestly reported.
- [ ] (P1) `curl --socks5-hostname 127.0.0.1:1080 http://example.com` works through the overlay.

---

## 16. Milestones (hackathon plan)

Adjust to the time you have. The order is what matters.

| # | Milestone | Deliverable | Exit test |
|---|---|---|---|
| **M0** | Skeleton | Go module, packages, config loader, `Transport` interface, health endpoint | `go build` and `/health` OK |
| **M1** | Sim transport and scenario | `SimTransport`, `india.json` loader, event engine | Unit tests pass; packets arrive with expected delay |
| **M2** | Prober | PING/PONG, EWMA, loss, jitter, link state machine | Metrics converge to scenario values in sim |
| **M3** | Link-state | LSA flood, LSDB, graph build | All nodes agree on the graph |
| **M4** | Routing | Search, cost breakdown, hysteresis, route events | Expected path via MAA; flips on events |
| **M5** | Forwarder and echo | Source-routed forwarding, echo service, live path probe | Overlay RTT matches predicted cost |
| **M6** | API and WebSocket | REST, WS events, CSV logging | Postman and `wscat` checks pass |
| **M7** | Frontend core | Shell, overview graph, KPIs, chart, matrix, routes | Matches Section 18 |
| **M8** | Simulator UI and benchmark | Event buttons, benchmark runner and results page | Demo script in 12.3 runs end to end |
| **M9** | Polish | Toasts, empty and error states, responsive layout, README, rehearsed demo | Acceptance checklist complete |
| **M10** | Live mode (P1) | `UDPTransport`, VM deploy script, 3 to 6 VMs, HMAC | Real mesh and measured results |
| **M11** | SOCKS5 (P1) | Stream relay and SOCKS5 server | `curl` works through the overlay |
| **M12** | Stretch (P2) | Latency prediction, multipath, QUIC comparison | Optional |

**Suggested time split if you have about 36 hours:** M0 to M6 about 14 h, M7 to M9 about 12 h, M10 about 6 h, buffer and rehearsal about 4 h. Skip M11 and M12 if time is short.

---

## 17. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Live results don't show an improvement on some paths | Weak story | Report honestly; show where it helps; sim mode demonstrates the mechanism; present sim and live separately |
| Cloud VMs don't reflect real ISPs | Misleading numbers | Include one ISP-connected node (laptop or home machine); state the limitation on the Limits slide |
| Route flapping | Unstable demo | Hysteresis, minimum dwell, EWMA smoothing |
| UDP blocked by firewalls or NAT | Live mode fails | Open the UDP port on VMs; keep the edge node outbound-only (peers reply to the source address); fall back to sim for the demo |
| Clock differences between machines | Wrong one-way times | Use RTT only; never use cross-machine one-way timestamps |
| Windows firewall prompts | Demo friction | Allow `brsim.exe` and `brnode.exe` before the demo |
| Time runs out | Incomplete demo | P0 is sim-only and complete by M9; live mode is P1 |
| Overstated claims | Credibility | Follow Section 12.4 and 14.4; keep the Limits slide |

---

## 18. Frontend specification

This section tells the frontend builder how to build the dashboard according to the attached `DESIGN-zapier.md`. The design language is warm cream, deep coffee ink, and one saturated orange. **Every rule in the design file's "Do's and Don'ts" applies.**

### 18.1 Design principles for this app

1. **Warm, not cool.** Page canvas is `#fffefb` (never pure white). Text is `#201515` ink (never pure black).
2. **One accent.** Orange `#ff4f00` marks the primary action and, in this product, the **active overlay path**. Orange is how the eye finds "the answer". Do not add a second chromatic colour. Status and health are expressed with the ink and orange hierarchy, line weight, dash style, labels, and icons, not red/green/yellow.
3. **Surface contrast carries elevation.** Cards are cream `#f8f4f0` on the `#fffefb` canvas, with no shadows (shadows only on toasts and modals).
4. **12 px radius everywhere:** buttons and cards. Inputs use 6 px. Badges are pills (9999 px). **Buttons are never pills.**
5. **Two faces:** a display face for hero-scale and eyebrows, Inter for everything else. Sentence-case headlines, never uppercase display text.

### 18.2 Design tokens

Create `web/src/styles/tokens.css`:

```css
:root {
  /* Colors */
  --color-primary: #ff4f00;
  --color-on-primary: #fffefb;
  --color-ink: #201515;
  --color-ink-soft: #2f2a26;
  --color-ink-mid: #36342e;
  --color-body: #605d52;
  --color-body-mid: #939084;
  --color-mute: #c5c0b1;
  --color-canvas: #fffefb;
  --color-canvas-soft: #f8f4f0;

  /* Radius */
  --radius-sm: 6px;
  --radius-md: 12px;
  --radius-pill: 9999px;

  /* Spacing (4 px base) */
  --space-xxs: 2px;  --space-xs: 4px;   --space-sm: 8px;   --space-md: 12px;
  --space-lg: 16px;  --space-xl: 24px;  --space-2xl: 32px; --space-3xl: 48px; --space-4xl: 64px;

  /* Shadows: only for modal and toast, warm-tinted */
  --shadow-toast: 0 4px 12px rgba(32, 21, 21, 0.10);
  --shadow-modal: 0 8px 24px rgba(32, 21, 21, 0.12);

  /* Fonts */
  --font-display: "Degular Display", "Inter", system-ui, -apple-system, sans-serif;
  --font-sans: "Inter", system-ui, -apple-system, sans-serif;
}

html { background: var(--color-canvas); color: var(--color-ink); font-family: var(--font-sans); }
body { margin: 0; font-size: 18px; line-height: 27px; -webkit-font-smoothing: antialiased; }
:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
```

**Fonts:** Degular Display is proprietary. Use **Inter weight 500** (or Mona Sans 500) in its place for display text, as the design file suggests. Install `@fontsource/inter` weights 400, 500, 600, 700 and import them in `main.tsx`. Keep `--font-display` pointing to Degular first so it can be swapped in later without code changes.

### 18.3 Tailwind config

`web/tailwind.config.ts`:

```ts
import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#ff4f00',
        'on-primary': '#fffefb',
        ink: { DEFAULT: '#201515', soft: '#2f2a26', mid: '#36342e' },
        body: { DEFAULT: '#605d52', mid: '#939084' },
        mute: '#c5c0b1',
        canvas: { DEFAULT: '#fffefb', soft: '#f8f4f0' },
      },
      borderRadius: { sm: '6px', md: '12px', pill: '9999px' },
      spacing: { xxs: '2px', xs: '4px', sm: '8px', md: '12px', lg: '16px',
                 xl: '24px', '2xl': '32px', '3xl': '48px', '4xl': '64px' },
      fontFamily: {
        display: ['Degular Display', 'Inter', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'display-xl':   ['56px', { lineHeight: '56px', fontWeight: '500' }],
        'display-lg':   ['48px', { lineHeight: '48px', fontWeight: '500' }],
        'display-md':   ['32px', { lineHeight: '36px', fontWeight: '500', letterSpacing: '1px' }],
        'display-sub-lg': ['48px', { lineHeight: '49.92px', fontWeight: '500' }],
        'display-sub-md': ['32px', { lineHeight: '40px', fontWeight: '400' }],
        'display-sub-sm': ['24px', { lineHeight: '30px', fontWeight: '600', letterSpacing: '-0.6px' }],
        'display-xs':   ['20px', { lineHeight: '25px', fontWeight: '700', letterSpacing: '-0.5px' }],
        'body-lg':      ['20px', { lineHeight: '30px', letterSpacing: '-0.2px' }],
        'body-md':      ['18px', { lineHeight: '27px' }],
        'body-sm':      ['16px', { lineHeight: '24px' }],
        caption:        ['14px', { lineHeight: '21px' }],
        eyebrow:        ['14px', { lineHeight: '14px', fontWeight: '500', letterSpacing: '1px' }],
        'button-md':    ['18px', { lineHeight: '27px', fontWeight: '600' }],
        'button-sm':    ['14.4px', { lineHeight: '14.4px', fontWeight: '700', letterSpacing: '0.144px' }],
      },
      boxShadow: { toast: '0 4px 12px rgba(32,21,21,0.10)', modal: '0 8px 24px rgba(32,21,21,0.12)' },
      maxWidth: { container: '1280px' },
    },
  },
} satisfies Config;
```

Note: with `display-md` the 1 px letter spacing applies to the display face. When using Inter as the substitute, reduce it to `0.5px` if headings look too loose.

### 18.4 Typography usage

| Role | Token | Where |
|---|---|---|
| Page title | `display-md` (display face, 32/36, 500) | "Network overview", "Benchmark", etc. Sentence case. |
| Big numbers | `display-lg` (48/48, 500) | KPI values, benchmark results |
| Hero number on dark card | `display-xl` (56/56, 500) | Improvement vs direct |
| Card title | `display-sub-sm` (Inter 24/30, 600, -0.6px) | Panel headings |
| Inline micro-heading | `display-xs` (20/25, 700) | Small subsections |
| Lead text | `body-lg` | Page intro lines |
| Default body | `body-md` | Paragraphs, form values |
| Secondary body, nav links, table cells | `body-sm` | |
| Fine print, table headers, axis labels | `caption` | |
| Eyebrow label | `eyebrow` (UPPERCASE, display face, 14/14, 500, 1 px tracking) | Above page titles, e.g. "BHARATROUTE · SIMULATED" |
| Button labels | `button-md` (18/600) or `button-sm` (14.4/700) | |

Numbers in tables and KPIs should use `font-variant-numeric: tabular-nums`.

### 18.5 Layout and app shell

- **Container:** max width 1280 px, centered, with 24 px gutters (`px-xl`).
- **App shell:** sticky top **nav bar** (canvas background, padding 12 px 24 px, 1 px bottom border in `mute` at 50 percent opacity) and a **left sidebar** (240 px, canvas background) at desktop. Sidebar rows follow `ex-app-shell-row`: canvas background, 6 px radius, padding 12 px 16 px, active row shows an **orange 3 px left indicator** and ink text at weight 600.
- **Section bands:** alternate `canvas` and `canvas-soft` bands only when a page has distinct sections; padding 64 px top and bottom for hero-style bands, 32 px inside the app for content groups.
- **Grid:** 12-column grid, 24 px gap. Cards 24 px interior padding.
- **Breakpoints:** mobile below 768 px (single column, hamburger opens the sidebar as a drawer), tablet 768 to 1023 px (2-up grids, collapsed sidebar icon rail is not used: use the drawer), desktop at 1024 px and above (full sidebar, 12-column grid).
- **Touch targets:** buttons are about 48 px tall (12 px vertical padding plus 27 px line height).

**Nav bar contents (left to right):** logo wordmark "BharatRoute" (display face 500, 20 px) with a small orange square mark, a **mode badge** ("Simulated" or "Live"), spacer, connection status text ("Connected" or "Reconnecting…", `body-sm`), and a tertiary button "Export CSV".

**Sidebar items:** Overview, Links, Routes, Simulator (hidden in live mode), Benchmark, Settings.

### 18.6 Components

Build these as reusable React components in `web/src/components/ui/`. All follow the design file's component definitions.

**Button** (`variant: primary | secondary | tertiary | text`, `size: md | sm`)
- Primary: bg `#ff4f00`, text `#fffefb`, `button-md`, padding 12 px 24 px, radius 12 px. Use for the single main action per view ("Run benchmark").
- Secondary: bg `#201515`, text `#fffefb`.
- Tertiary: bg `#fffefb`, text `#201515`, 1 px solid `#201515`.
- Text: bg `#fffefb`, text `#201515`, `button-sm`, padding 8 px 16 px, radius 12 px.
- Hover: primary darkens by about 8 percent (`#e64700`); secondary lightens to `#2f2a26`; tertiary and text get `canvas-soft` background. Disabled: 40 percent opacity, no pointer. Focus: 2 px orange outline.
- **Never pill-shaped.**

**Card** (`variant: content | feature-cream | feature-dark | outline`)
- Content and feature-cream: bg `#f8f4f0`, radius 12 px, padding 24 px, no border, no shadow.
- Feature-dark: bg `#201515`, text `#fffefb`, same chrome. Use for one hero KPI card per page ("Improvement vs direct").
- Outline: bg `#fffefb`, 1 px solid `#201515` (used for pricing-style summaries, such as the benchmark result summary).

**Badge** (pill)
- bg `#f8f4f0`, text `#201515`, `body-sm`, padding 4 px 12 px, radius 9999 px. Used for mode ("Simulated"), node role, and link labels. For "Simulated", use `ink` background with `on-primary` text so it cannot be missed.

**TextInput / NumberInput / Select**
- bg `#fffefb`, text `#201515`, 1 px solid `#201515`, `body-md`, padding 12 px 16 px, radius 6 px. Focus: 2 px orange outline. Error: border stays ink, add an orange 1 px underline bar below and an error message in `caption` with `ink` text and a small "!" glyph (no red).

**DataTable** (`ex-data-table-cell`)
- Header row: bg `#f8f4f0`, `caption` text in `body` colour, cell padding 12 px 16 px.
- Body cells: `body-sm`, padding 12 px 16 px, bottom border 1 px `mute`.
- Numeric cells right-aligned with tabular numbers.
- Latency matrix cells use a **lightness ramp** of the cream-to-ink neutrals (low latency = lightest, high = darkest) with text colour flipping to `on-primary` on dark cells. The active route's links get an orange 2 px inset outline.

**Toast** (`ex-toast`)
- bg `#fffefb`, radius 12 px, padding 12 px 16 px, `body-sm`, shadow `--shadow-toast`, 1 px `mute` border. A 4 px orange left edge on route-change toasts. Auto-dismiss after 5 s. Bottom-right on desktop, top on mobile. `role="status"`, `aria-live="polite"`.

**Modal** (`ex-modal-card`)
- bg `#fffefb`, radius 12 px, padding 24 px, shadow `--shadow-modal`, backdrop `rgba(32,21,21,0.4)`. Focus trap, `Esc` to close.

**Empty state** (`ex-empty-state-card`)
- bg `#f8f4f0`, radius 12 px, padding 48 px, centered simple SVG (a few nodes joined by lines in ink), caption in `body-md`, and one primary button where an action exists.

**Sidebar row** (`ex-app-shell-row`), **Eyebrow**, **Footer**
- Footer (optional on the About view): bg `#201515`, text `#f8f4f0`, padding 48 px 24 px, `body-sm`.

### 18.7 Page specifications

#### 18.7.1 Overview (`/`)

```
┌─────────────────────────────────────────────────────────────┐
│ BHARATROUTE · SIMULATED (eyebrow)                           │
│ Network overview (display-md)                               │
│ Live view of paths out of India. (body-lg, body color)      │
├──────────────┬──────────────┬──────────────┬────────────────┤
│ Direct RTT   │ Overlay RTT  │ Active path  │ ██ DARK CARD   │
│ 128 ms       │ 83 ms        │ LDH→MAA→SIN  │ −45 ms vs      │
│ (cream card) │ (cream card) │ (cream card) │ direct         │
├──────────────┴──────────────┴──────────────┴────────────────┤
│ ┌─────────────────────────────┐ ┌──────────────────────────┐│
│ │ Network graph (SVG, cream)  │ │ Route explanation        ││
│ │                             │ │ Candidates + cost bars   ││
│ └─────────────────────────────┘ └──────────────────────────┘│
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Latency over time: direct vs overlay (line chart)       │ │
│ └─────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Recent events (route changes, sim events) list          │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

- **KPI cards (3 cream + 1 dark):** label in `caption` (body colour), value in `display-lg`, secondary line in `body-sm`. The dark card shows the improvement in `display-xl` with `on-primary` text and an orange up-arrow glyph if improvement is positive. If improvement is negative, show "Direct is faster" in plain text on the dark card.
- **Destination selector:** a Select above the grid ("Destination: Singapore") that defaults to the first `exit` node.
- **Route explanation panel:** lists candidate paths sorted by cost. Each row: path as chips (`LDH → MAA → SIN`), total cost, and a horizontal bar split into latency, loss, and relay parts. The bar uses `ink` for latency, `body-mid` for loss, `mute` for relay. The active row has a 2 px orange left border and a "Active" pill badge.
- **Recent events list:** newest first, `body-sm`, timestamp in `caption`, route-change entries show old path to new path with the reason.

#### 18.7.2 Links (`/links`)
- **Latency matrix** (DataTable) of all nodes, symmetric, with RTT values and a lightness ramp (see Section 18.6).
- Clicking a cell opens a **link detail card** with a time-series chart (RTT, EWMA, loss as bars) for the last 5 minutes, plus current state, jitter, and probe count.
- Filter: toggle "Show only links on active routes".

#### 18.7.3 Routes (`/routes`)
- Table of all destinations: destination, active path, active cost, direct cost, improvement, time since last change.
- Row expand shows candidates with cost breakdowns (same component as the Overview explanation panel).
- A **route history** list from route-change events.

#### 18.7.4 Simulator (`/simulator`, sim mode only)
- **Scenario card:** name, seed, notes (including the "illustrative values" note in `caption`).
- **Quick actions** in a 2-column grid of cream cards, each with a title, a one-line description, and a button:
  - "Degrade MAA to SIN" (tertiary button)
  - "Add 3 percent loss on LDH to MAA"
  - "Kill node BOM" / "Revive node BOM"
  - "Restore all links" (reset)
- **Custom event form:** select event type, select link or node, number inputs for RTT, jitter, loss; one primary button "Apply event".
- **Timeline** of applied events with timestamps.
- When not in sim mode, this route shows an empty state ("Simulator is only available in simulation mode") and the sidebar item is hidden.

#### 18.7.5 Benchmark (`/benchmark`)
- **Form card** (cream): source, destination, count (default 200), interval, payload bytes, modes (checkboxes). One primary button "Run benchmark".
- **Progress:** a progress bar (ink fill on mute track, 8 px tall, 6 px radius) plus live "direct vs overlay" last RTT values.
- **Results:** four big-number cards ("Direct median", "Overlay median", "Win rate", "Median improvement"; the improvement card is the dark feature card), then a **bar chart** comparing min, median, p95, p99 for direct (ink) and overlay (orange), then a stats DataTable with all fields.
- Buttons: "Download CSV" (tertiary), "Copy numbers for slides" (text button) which copies a plain-text summary: `Direct median X ms | Overlay median Y ms | Win rate Z% | p95 improvement W ms | n=200`.
- The Results card shows the "Simulated" badge when `mode == "sim"`.
- A **Failover test** section: button "Run failover test", result shows failover time and lost probes.

#### 18.7.6 Settings (`/settings`)
- Form for routing parameters (Section 10.2): alpha, loss penalty, relay overhead, max hops, switch margin, confirmations, min dwell.
- Inline help text under each input in `caption`.
- Buttons: primary "Save", text "Reset to defaults". Validation errors per Section 18.6 (no red).
- Read-only section: node ID, mode, version, API address.

### 18.8 Network graph spec (SVG)

Component: `NetworkGraph.tsx`. Container is a cream card (`canvas-soft`, 12 px radius, 24 px padding). The SVG uses `viewBox="0 0 1000 600"` and scales to width.

- **Node positions:** use `pos.x` and `pos.y` (0 to 1) from the API, scaled to the viewBox with 60 px padding. No force layout; deterministic positions make the demo stable.
- **Node:**
  - Radius 22. Fill `#fffefb`, stroke `#201515` 1.5 px.
  - Label below the node: short name (`LDH`) in `body-sm` weight 600, city in `caption` with `body` colour.
  - Source (edge) node: fill `#201515`, label text `#fffefb` inside the circle (initials).
  - Destination (exit) node: fill `#fffefb`, double ring (second ring 4 px outside, stroke `ink`).
  - Nodes on the active path: add a 3 px **orange** ring.
  - Down node: fill `canvas-soft`, stroke `mute`, label in `body-mid`, dashed ring, and a small "×" glyph.
- **Edges (links):**
  - Default (usable, not on a route): stroke `#c5c0b1`, 1.5 px, solid.
  - **Direct path** (source to destination edge): stroke `#201515`, 2 px, **dashed** (`6 4`). Label chip shows RTT.
  - **Active overlay path edges:** stroke `#ff4f00`, **4 px, solid**.
  - Degraded link (loss above 2 percent or RTT more than 50 percent above its baseline): stroke `#36342e`, 2.5 px, with a small orange "!" dot on the edge midpoint.
  - Down link: stroke `#c5c0b1`, 1.5 px, dotted (`2 4`), with an "×" at the midpoint.
- **Edge labels:** small pill chips at the midpoint with the RTT ("38 ms"): bg `#fffefb`, 1 px `mute` border, `caption`, text `ink`. For active edges, border `#ff4f00`. Hide labels for non-active links below a zoom threshold or on mobile, showing them on hover or tap.
- **Packet animation:** on the active path, 3 small orange dots (r = 4) move along the path from source to destination in a 1.6 s loop. Disabled with `prefers-reduced-motion`.
- **Legend** (bottom of card): "Active overlay path" (orange line), "Direct path" (dashed ink), "Available link" (mute), "Down" (dotted mute with ×). `caption` text.
- **Interaction:** hover a link shows a tooltip (toast style) with RTT, EWMA, loss, jitter, state. Click a node to set it as the destination (if it is an exit). Keyboard: nodes are focusable with `Tab`; `Enter` selects.
- **Accessibility:** `role="img"` with an `aria-label` summarizing the active path ("Active path from Ludhiana via Chennai to Singapore, 83 milliseconds"), plus a visually hidden table of links below.

### 18.9 Charts

Use Recharts. All charts sit in cream cards.

- **Latency over time (Overview):** `LineChart`, last 5 minutes, x-axis time, y-axis ms.
  - Overlay series: stroke `#ff4f00`, 2.5 px, no dots.
  - Direct series: stroke `#201515`, 1.5 px, dashed `6 4`.
  - Grid: horizontal lines only, `#c5c0b1` at 50 percent opacity, 1 px.
  - Axis text: `caption`, colour `#605d52`.
  - Route-change markers: vertical reference lines in `#36342e` with a small label chip.
  - Tooltip: toast style (canvas bg, 12 px radius, shadow, `body-sm`).
  - Legend: simple inline text above the chart ("— Overlay" in orange, "- - Direct" in ink).
  - Lost probes appear as gaps (`connectNulls={false}`).
- **Benchmark comparison:** `BarChart`, grouped by metric (min, median, p95, p99). Direct bars `#201515`, overlay bars `#ff4f00`, bar radius 4 px at the top, 12 px gap between groups. Value labels above bars in `caption`.
- **Link detail:** line for RTT (ink), thinner line for EWMA (`#605d52`), loss as orange bars on a secondary axis (max 100 percent).
- Never use more than ink neutrals plus orange. If a chart needs more than two series, differentiate by dash pattern and lightness, not by new hues.

### 18.10 State management and data flow

- `web/src/lib/api.ts`: typed `fetch` wrapper for the endpoints in Section 8.1, base URL from `VITE_API_URL` (default `http://127.0.0.1:8080`).
- `web/src/lib/ws.ts`: WebSocket client with automatic reconnect (exponential backoff 1 s to 10 s), dispatches events into the Zustand store.
- **Store slices:** `connection` (status, mode), `topology` (nodes, links, routes, params), `series` (ring buffers for chart data, capped at 600 points per series), `events` (last 100), `bench` (current and past runs), `toasts`.
- On connect: fetch `/state` once, then apply `snapshot`, `link_update`, `route_change`, `probe_sample`, and other events incrementally.
- When the socket drops, show "Reconnecting…" in the nav bar and gray out the live KPIs (reduce opacity to 60 percent), but keep the last values visible.
- Derived values (improvement, candidate sorting) are computed in selectors, not stored.

### 18.11 Frontend file structure

```
web/
├── index.html
├── package.json
├── vite.config.ts            # dev proxy /api to :8080 and /ws
├── tailwind.config.ts        # Section 18.3
├── postcss.config.js
├── tsconfig.json
└── src/
    ├── main.tsx              # font imports, router, providers
    ├── App.tsx               # shell + routes
    ├── styles/
    │   ├── tokens.css        # Section 18.2
    │   └── index.css         # Tailwind layers + base
    ├── lib/                  # api.ts, ws.ts, format.ts, types.ts
    ├── store/                # Zustand slices
    ├── components/
    │   ├── ui/               # Button, Card, Badge, Input, Select, DataTable, Toast, Modal, EmptyState, Eyebrow
    │   ├── layout/           # NavBar, Sidebar, AppShell
    │   ├── graph/            # NetworkGraph, GraphLegend
    │   └── charts/           # LatencyChart, BenchChart, LinkChart
    └── pages/                # Overview, Links, Routes, Simulator, Benchmark, Settings
```

**Setup commands:**

```powershell
cd web
npm create vite@latest . -- --template react-ts
npm install tailwindcss postcss autoprefixer recharts zustand react-router-dom @fontsource/inter
npm install -D vitest @testing-library/react @testing-library/jest-dom
npx tailwindcss init -p
```

### 18.12 Frontend design checklist (use during review)

- [ ] Page background is `#fffefb`, not white. No `#000` or `#fff` anywhere in the CSS.
- [ ] Headline and primary text colour is `#201515`; body copy is `#605d52`.
- [ ] Exactly one saturated accent (`#ff4f00`); no other chromatic colours in the UI, charts, or graph.
- [ ] Orange is used for: primary buttons, the active overlay path, the active sidebar indicator, focus rings, and the improvement glyph. Not for decoration.
- [ ] Buttons and cards use 12 px radius; inputs use 6 px; only badges are pills; no pill buttons.
- [ ] Cards are cream fill with no shadow; only toasts and modals have shadows.
- [ ] Headlines are sentence case; only the eyebrow is uppercase.
- [ ] Display text uses the display token (Inter 500 substitute); all else uses Inter.
- [ ] Page padding follows the 4 px scale; cards have 24 px interior padding.
- [ ] Layout works at 360, 768, and 1280 px widths with no horizontal page scroll (tables scroll inside their container).
- [ ] Buttons are about 48 px tall; all interactive elements have visible focus rings.
- [ ] A persistent "Simulated" badge shows in sim mode.
- [ ] Every status is conveyed by more than colour (shape, dash, icon, or text).
- [ ] Reduced-motion users see no animation.

### 18.13 Accessibility and contrast notes

- `#605d52` (body) on `#fffefb` passes AA for normal text. `#201515` on any canvas colour passes AAA.
- `#939084` (body-mid) is about 3:1 on canvas. Use it only for large text (18 px or more) or non-essential metadata, never for required information.
- `#c5c0b1` (mute) is for borders, gridlines, and disabled states only. Never use it for text that must be read.
- `#fffefb` on `#ff4f00` is about 3.3:1. Button labels at 18 px weight 600 or larger are acceptable, but do not use orange text on cream for small copy. If a small orange label is needed, put it on an ink background instead.
- All charts and the graph need text alternatives (Section 18.8) and must not rely on colour alone.
- Support keyboard navigation for the sidebar, graph nodes, tables, forms, and modals. Use `aria-live="polite"` for toasts and route-change announcements.

---

## 19. Appendix

### 19.1 Alignment with your presentation

| Slide | PRD coverage |
|---|---|
| BharatRoute (title) | Sections 1.1 to 1.3 |
| Why the path is long, Why it matters | Section 1.1; context text on the Overview page |
| Our idea | Sections 1.2 and 4 |
| How it works (Probe, Share, Route, Forward) | Sections 5.2 to 5.5 |
| Architecture | Section 4.1 |
| Routing logic (cost formula, example) | Sections 5.4 and 7; example in 12.2 (illustrative) |
| Built with | Section 4.3 (Go, UDP, SOCKS5, FastAPI/Chart.js on the slide; this PRD uses the Go API and React/Recharts instead, so update the slide or swap the dashboard stack) |
| Live demo | Section 12.3 |
| Results (`[__]` placeholders) | Section 13; fill from benchmark exports |
| Limits and next steps | Section 17 and P2 features |

> **Stack mismatch to resolve:** the slide "Built with" lists FastAPI and Chart.js for the dashboard. This PRD proposes the Go node serving the API and a React and Recharts frontend. Pick one: either edit the slide to say "Go, React, Recharts", or keep FastAPI and put a thin Python API in front of the node's data (not recommended for time reasons).

### 19.2 Glossary

- **Overlay network:** a virtual network built on top of the existing internet by nodes that forward packets for each other.
- **Relay:** an intermediate overlay node on a path.
- **Landing station:** the place where a submarine cable comes ashore.
- **Tromboning:** local traffic leaving a country and coming back.
- **EWMA:** exponentially weighted moving average, used to smooth noisy measurements.
- **LSA:** link-state advertisement, a message listing a node's links and their measured quality.
- **Source routing:** the sender puts the full path in the packet.
- **Hysteresis:** a rule that stops the system from switching routes on tiny or short-lived differences.
- **p95:** the value below which 95 percent of samples fall.

### 19.3 Open questions (decide before or during build)

1. Which exit nodes will you actually run in live mode (Singapore only, or also Frankfurt)?
2. Which cloud provider and regions, and what is the budget?
3. Do you want the SOCKS5 demo (P1) or is the echo and dashboard demo enough for judging?
4. Final project name (BharatRoute is a placeholder from the deck).
5. Whether to replace the slide's FastAPI/Chart.js mention (see 19.1).

### 19.4 Definition of done

The prototype is done when the acceptance checklist in Section 15.4 is complete for all P0 items, the 90-second demo in Section 12.3 runs without intervention three times in a row, the frontend passes Section 18.12, and the Results slide placeholders are filled from exported benchmark data with the correct "Simulated" or "Live" label.
