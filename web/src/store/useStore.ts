import { create } from 'zustand';
import type {
  NodeInfo,
  LinkInfo,
  RouteInfo,
  Params,
  PathHistoryPoint,
  BenchmarkResult,
  BenchmarkProgress,
  ToastMessage,
  WsEnvelope,
} from '../lib/types';
import { api } from '../lib/api';

interface StoreState {
  // Connection
  connStatus: 'connecting' | 'connected' | 'reconnecting' | 'disconnected';
  mode: string;
  selfNode: string;

  // Topology
  nodes: NodeInfo[];
  links: LinkInfo[];
  routes: RouteInfo[];
  params: Params | null;
  activeDst: number | null;

  // Real-time telemetry
  pathHistory: PathHistoryPoint[];
  events: Array<{
    id: string;
    type: string;
    timestamp: Date;
    summary: string;
    details?: any;
  }>;

  // Benchmark
  benchProgress: BenchmarkProgress | null;
  latestBenchResult: BenchmarkResult | null;
  benchmarks: BenchmarkResult[];
  benchRunning: boolean;

  // Notifications
  toasts: ToastMessage[];

  // Actions
  setConnStatus: (status: 'connecting' | 'connected' | 'reconnecting' | 'disconnected') => void;
  setActiveDst: (dst: number) => void;
  fetchState: () => Promise<void>;
  handleWsMessage: (msg: WsEnvelope) => void;
  addToast: (level: 'info' | 'warn' | 'error', message: string) => void;
  removeToast: (id: string) => void;
  updateParamsLocally: (params: Params) => void;
  setLatestBenchResult: (res: BenchmarkResult | null) => void;
  setBenchRunning: (running: boolean) => void;
}

export const useStore = create<StoreState>((set, get) => ({
  connStatus: 'connecting',
  mode: 'sim',
  selfNode: 'LDH',

  nodes: [],
  links: [],
  routes: [],
  params: null,
  activeDst: null,

  pathHistory: [],
  events: [],

  benchProgress: null,
  latestBenchResult: null,
  benchmarks: [],
  benchRunning: false,

  toasts: [],

  setConnStatus: (status) => set({ connStatus: status }),

  setActiveDst: (dst) => set({ activeDst: dst }),

  fetchState: async () => {
    try {
      const state = await api.getState();
      const exitNodes = state.nodes.filter((n) => n.role === 'exit');
      const currentActiveDst = get().activeDst;
      const defaultDst = currentActiveDst || (exitNodes.length > 0 ? exitNodes[0].id : state.nodes[1]?.id || 6);

      set({
        mode: state.mode,
        selfNode: state.self,
        nodes: state.nodes,
        links: state.links,
        routes: state.routes,
        params: state.params,
        activeDst: defaultDst,
        connStatus: 'connected',
      });
    } catch (err) {
      console.error('Failed to fetch initial state', err);
    }
  },

  handleWsMessage: (msg: WsEnvelope) => {
    const { type, data, ts } = msg;

    switch (type) {
      case 'state_snapshot': {
        if (data.nodes) set({ nodes: data.nodes });
        if (data.links) set({ links: data.links });
        if (data.routes) set({ routes: data.routes });
        if (data.params) set({ params: data.params });
        break;
      }

      case 'link_update': {
        set((state) => {
          const updatedLinks = [...state.links];
          const idx = updatedLinks.findIndex(
            (l) => (l.a === data.a && l.b === data.b) || (l.a === data.b && l.b === data.a)
          );
          if (idx >= 0) {
            updatedLinks[idx] = { ...updatedLinks[idx], ...data };
          } else {
            updatedLinks.push(data);
          }
          return { links: updatedLinks };
        });
        break;
      }

      case 'route_change': {
        const { dst, new_path, new_cost, reason } = data;
        set((state) => {
          const updatedRoutes = [...state.routes];
          const idx = updatedRoutes.findIndex((r) => r.dst === dst);
          const newRoute: RouteInfo = {
            dst,
            active: {
              path: new_path,
              cost_ms: new_cost,
              since: ts,
            },
          };
          if (idx >= 0) {
            newRoute.direct = updatedRoutes[idx].direct;
            if (newRoute.direct?.cost_ms != null) {
              newRoute.improvement_ms = newRoute.direct.cost_ms - new_cost;
            }
            updatedRoutes[idx] = newRoute;
          } else {
            updatedRoutes.push(newRoute);
          }

          // Add to events
          const eventItem = {
            id: `rc-${Date.now()}-${Math.random()}`,
            type: 'route_change',
            timestamp: new Date(ts),
            summary: `Route to node ${dst} changed (${reason || 'optimal'}): ${new_path.join(' → ')}`,
            details: data,
          };

          return {
            routes: updatedRoutes,
            events: [eventItem, ...state.events].slice(0, 100),
          };
        });

        get().addToast('info', `Route updated to ${new_path.join(' → ')} (${reason || 'optimal'})`);
        break;
      }

      case 'path_probe': {
        // Echo probe sample: data = { direct_ms, overlay_ms, path }
        set((state) => {
          const point: PathHistoryPoint = {
            ts,
            direct_ms: data.direct_ms ?? null,
            overlay_ms: data.overlay_ms ?? null,
          };
          const nextHistory = [...state.pathHistory, point];
          if (nextHistory.length > 600) {
            nextHistory.shift();
          }
          return { pathHistory: nextHistory };
        });
        break;
      }

      case 'sim_event': {
        set((state) => ({
          events: [
            {
              id: `sim-${Date.now()}-${Math.random()}`,
              type: 'sim_event',
              timestamp: new Date(ts),
              summary: `Simulation event: ${data.type} ${data.a ? data.a + '↔' + data.b : data.node || ''}`,
              details: data,
            },
            ...state.events,
          ].slice(0, 100),
        }));
        get().addToast('info', `Event applied: ${data.type}`);
        break;
      }

      case 'bench_progress': {
        set({ benchProgress: data, benchRunning: true });
        break;
      }

      case 'bench_done': {
        set((state) => ({
          latestBenchResult: data,
          benchProgress: null,
          benchRunning: false,
          benchmarks: [data, ...state.benchmarks],
        }));
        get().addToast('info', `Benchmark complete! Win rate: ${data.win_rate_pct?.toFixed(1) || 0}%`);
        break;
      }

      case 'toast': {
        get().addToast(data.level || 'info', data.message || 'Notification');
        break;
      }
    }
  },

  addToast: (level, message) => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    const newToast: ToastMessage = { id, level, message, timestamp: new Date() };

    set((state) => ({ toasts: [...state.toasts, newToast] }));

    setTimeout(() => {
      get().removeToast(id);
    }, 5000);
  },

  removeToast: (id) => {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },

  updateParamsLocally: (params) => set({ params }),
  setLatestBenchResult: (res) => set({ latestBenchResult: res }),
  setBenchRunning: (running) => set({ benchRunning: running }),
}));
