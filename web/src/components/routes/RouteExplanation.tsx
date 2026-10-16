import React, { useEffect, useState } from 'react';
import { useStore } from '../../store/useStore';
import { api } from '../../lib/api';
import { Badge } from '../ui/Badge';
import type { CandidatePath } from '../../lib/types';

export const RouteExplanation: React.FC = () => {
  const activeDst = useStore((state) => state.activeDst);
  const nodes = useStore((state) => state.nodes);
  const routes = useStore((state) => state.routes);

  const [candidates, setCandidates] = useState<CandidatePath[]>([]);
  const [loading, setLoading] = useState(false);

  const nodeMap = new Map<number, string>();
  nodes.forEach((n) => nodeMap.set(n.id, n.name));

  const activeRoute = routes.find((r) => r.dst === activeDst)?.active;
  const activePathStr = activeRoute ? activeRoute.path.join('-') : '';

  useEffect(() => {
    if (!activeDst) return;
    setLoading(true);
    api
      .getCandidates(activeDst)
      .then((res) => {
        setCandidates(res.candidates || []);
      })
      .catch((err) => {
        console.warn('Failed to load route candidates', err);
      })
      .finally(() => setLoading(false));
  }, [activeDst, routes]);

  const dstNode = nodes.find((n) => n.id === activeDst);

  return (
    <div className="bg-canvas-soft rounded-md p-xl border border-mute/30 flex flex-col h-full">
      <div className="mb-md">
        <h3 className="text-display-sub-sm text-ink font-semibold">Route decision</h3>
        <p className="text-body-sm text-body">
          Cost breakdown for destination {dstNode?.name || activeDst} ({dstNode?.label || ''})
        </p>
      </div>

      {loading && candidates.length === 0 ? (
        <div className="py-xl text-center text-body-sm text-body">Evaluating candidates…</div>
      ) : candidates.length === 0 ? (
        <div className="py-xl text-center text-body-sm text-body">No candidate paths found.</div>
      ) : (
        <div className="flex flex-col gap-sm overflow-y-auto max-h-[440px] pr-xs">
          {candidates.map((cand, idx) => {
            const pathStr = cand.path.join('-');
            const isActive = pathStr === activePathStr;

            const latencyMs = cand.breakdown?.latency_ms ?? cand.latency_part_ms ?? cand.cost_ms;
            const lossMs = cand.breakdown?.loss_ms ?? cand.loss_part_ms ?? 0;
            const relayMs = cand.breakdown?.relay_ms ?? cand.relay_part_ms ?? 0;
            const hops = cand.hops ?? (cand.path ? cand.path.length - 1 : 1);
            const rttMs = cand.rtt_ms ?? latencyMs;

            const latPct = cand.cost_ms > 0 ? (latencyMs / cand.cost_ms) * 100 : 100;
            const lossPct = cand.cost_ms > 0 ? (lossMs / cand.cost_ms) * 100 : 0;
            const relayPct = cand.cost_ms > 0 ? (relayMs / cand.cost_ms) * 100 : 0;

            return (
              <div
                key={`cand-${idx}-${pathStr}`}
                className={`p-md rounded-md bg-canvas border transition-all ${
                  isActive
                    ? 'border-primary border-l-4 shadow-sm'
                    : 'border-mute/40 hover:border-ink/30'
                }`}
              >
                <div className="flex items-center justify-between mb-xs">
                  <div className="flex items-center gap-xs flex-wrap">
                    <span className="font-semibold text-body-sm text-ink font-mono">
                      {cand.path.map((id) => nodeMap.get(id) || id).join(' → ')}
                    </span>
                    {isActive && <Badge variant="active">Active</Badge>}
                    {hops === 1 && <Badge variant="outline">Direct</Badge>}
                  </div>
                  <span className="font-bold text-body-md text-ink tabular-nums">
                    {cand.cost_ms.toFixed(1)} ms
                  </span>
                </div>

                {/* Horizontal Cost Breakdown Bar */}
                <div className="w-full bg-canvas-soft rounded-pill h-2 overflow-hidden flex my-xs">
                  <div
                    style={{ width: `${latPct}%` }}
                    className="bg-ink h-full"
                    title={`Latency: ${latencyMs.toFixed(1)} ms`}
                  />
                  <div
                    style={{ width: `${lossPct}%` }}
                    className="bg-body-mid h-full"
                    title={`Loss penalty: ${lossMs.toFixed(1)} ms`}
                  />
                  <div
                    style={{ width: `${relayPct}%` }}
                    className="bg-mute h-full"
                    title={`Relay overhead: ${relayMs.toFixed(1)} ms`}
                  />
                </div>

                <div className="flex items-center justify-between text-caption text-body">
                  <span>RTT: {rttMs.toFixed(1)} ms</span>
                  {lossMs > 0 && <span>Loss: {lossMs.toFixed(1)} ms</span>}
                  <span>Hops: {hops}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Bar legend */}
      <div className="mt-auto pt-md border-t border-mute/30 flex items-center justify-center gap-lg text-caption text-body">
        <div className="flex items-center gap-xs">
          <span className="w-3 h-3 bg-ink rounded-xxs inline-block" />
          <span>Latency</span>
        </div>
        <div className="flex items-center gap-xs">
          <span className="w-3 h-3 bg-body-mid rounded-xxs inline-block" />
          <span>Loss penalty</span>
        </div>
        <div className="flex items-center gap-xs">
          <span className="w-3 h-3 bg-mute rounded-xxs inline-block" />
          <span>Relay overhead</span>
        </div>
      </div>
    </div>
  );
};
