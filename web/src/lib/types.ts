export interface Pos {
  x: number;
  y: number;
}

export interface NodeInfo {
  id: number;
  name: string;
  label: string;
  region: string;
  pos: Pos;
  state: 'up' | 'down';
  role: 'edge' | 'relay' | 'exit';
}

export interface LinkInfo {
  a: number;
  b: number;
  rtt_ms: number;
  loss_pct: number;
  jitter_ms: number;
  state: 'up' | 'down';
  kind: 'direct' | 'overlay';
}

export interface ActiveRoute {
  path: number[];
  cost_ms: number;
  since: string;
}

export interface DirectRoute {
  path: number[];
  cost_ms: number | null;
}

export interface RouteInfo {
  dst: number;
  active?: ActiveRoute;
  direct?: DirectRoute;
  improvement_ms?: number;
}

export interface Params {
  alpha: number;
  loss_penalty_ms_per_pct: number;
  relay_overhead_ms: number;
  max_hops: number;
  switch_margin_pct: number;
  switch_confirmations: number;
  min_dwell_ms: number;
  probe_interval_ms: number;
  probe_timeout_ms: number;
  loss_window: number;
  down_after_misses: number;
  up_after_hits: number;
  lsa_interval_ms: number;
  lsa_ttl_ms: number;
}

export interface State {
  mode: string;
  self: string;
  now: string;
  nodes: NodeInfo[];
  links: LinkInfo[];
  routes: RouteInfo[];
  params: Params;
}

export interface MatrixResponse {
  nodes: string[];
  rtt: number[][];
  loss: number[][];
}

export interface CandidateCostBreakdown {
  latency_ms: number;
  loss_ms: number;
  relay_ms: number;
}

export interface CandidatePath {
  path: number[];
  cost_ms: number;
  breakdown?: CandidateCostBreakdown;
  rtt_ms?: number;
  loss_pct?: number;
  hops?: number;
  latency_part_ms?: number;
  loss_part_ms?: number;
  relay_part_ms?: number;
}

export interface CandidatesResponse {
  dst: number;
  active: any;
  candidates: CandidatePath[];
}

export interface HistoryPoint {
  ts: string;
  rtt_ms: number;
  ewma_ms: number;
  loss_pct: number;
  state: string;
}

export interface PathHistoryPoint {
  ts: string;
  direct_ms: number | null;
  overlay_ms: number | null;
}

export interface BenchmarkStats {
  sent: number;
  received: number;
  loss_pct: number;
  min: number;
  mean: number;
  median: number;
  p95: number;
  p99: number;
  max: number;
}

export interface BenchmarkResult {
  id: string;
  started_at: string;
  finished_at: string;
  duration_s: number;
  mode: string;
  src: string;
  dst: string;
  count: number;
  interval_ms: number;
  payload_bytes: number;
  overlay_path: number[];
  direct: BenchmarkStats;
  overlay: BenchmarkStats;
  win_rate_pct: number;
  median_improvement_ms: number;
  p95_improvement_ms: number;
}

export interface BenchmarkProgress {
  id: string;
  round: number;
  count: number;
  direct_rtt_ms: number | null;
  overlay_rtt_ms: number | null;
}

export interface SimEvent {
  type: string;
  a?: string;
  b?: string;
  node?: string;
  rtt_ms?: number;
  jitter_ms?: number;
  loss_pct?: number;
}

export interface ToastMessage {
  id: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  timestamp: Date;
}

export interface WsEnvelope<T = any> {
  type: string;
  ts: string;
  data: T;
}
