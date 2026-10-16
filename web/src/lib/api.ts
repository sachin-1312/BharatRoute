import type {
  State,
  NodeInfo,
  LinkInfo,
  RouteInfo,
  MatrixResponse,
  CandidatesResponse,
  HistoryPoint,
  PathHistoryPoint,
  Params,
  BenchmarkResult,
  SimEvent,
} from './types';

const BASE_URL = import.meta.env.VITE_API_URL || '';

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${BASE_URL}${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`API error ${res.status}: ${errorText || res.statusText}`);
  }

  return res.json();
}

export const api = {
  getHealth: () => request<{ status: string; version: string; mode: string; node_id: string; uptime_s: number }>('/api/v1/health'),
  getState: () => request<State>('/api/v1/state'),
  getNodes: () => request<NodeInfo[]>('/api/v1/nodes'),
  getLinks: () => request<LinkInfo[]>('/api/v1/links'),
  getMatrix: () => request<MatrixResponse>('/api/v1/matrix'),
  getRoutes: () => request<RouteInfo[]>('/api/v1/routes'),
  getCandidates: (dst: string | number) => request<CandidatesResponse>(`/api/v1/routes/${dst}`),
  getLinkHistory: (a: string | number, b: string | number, windowS = 300) =>
    request<HistoryPoint[]>(`/api/v1/history/links/${a}-${b}?window_s=${windowS}`),
  getPathHistory: (src: string, dst: string, windowS = 300) =>
    request<PathHistoryPoint[]>(`/api/v1/history/path?src=${src}&dst=${dst}&window_s=${windowS}`),
  
  startBenchmark: (req: {
    src: string;
    dst: string;
    count?: number;
    interval_ms?: number;
    payload_bytes?: number;
    modes?: string[];
  }) =>
    request<{ run_id: string; status: string }>('/api/v1/benchmarks', {
      method: 'POST',
      body: JSON.stringify(req),
    }),
  getBenchmarks: () => request<BenchmarkResult[]>('/api/v1/benchmarks'),
  getBenchmark: (id: string) => request<BenchmarkResult>(`/api/v1/benchmarks/${id}`),
  cancelBenchmark: (id: string) => request<{ status: string }>(`/api/v1/benchmarks/${id}`, { method: 'DELETE' }),

  getParams: () => request<Params>('/api/v1/params'),
  updateParams: (params: Partial<Params>) =>
    request<{ status: string }>('/api/v1/params', {
      method: 'PUT',
      body: JSON.stringify(params),
    }),

  postSimEvent: (event: SimEvent) =>
    request<{ status: string }>('/api/v1/sim/events', {
      method: 'POST',
      body: JSON.stringify(event),
    }),
  getSimScenario: () => request<any>('/api/v1/sim/scenario'),
  resetSim: () => request<{ status: string }>('/api/v1/sim/reset', { method: 'POST' }),

  exportProbesUrl: `${BASE_URL}/api/v1/export/probes`,
  exportRoutesUrl: `${BASE_URL}/api/v1/export/routes`,
};
