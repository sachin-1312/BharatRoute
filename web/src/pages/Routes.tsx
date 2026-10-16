import React, { useState } from 'react';
import { useStore } from '../store/useStore';
import { Eyebrow } from '../components/ui/Eyebrow';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { RouteExplanation } from '../components/routes/RouteExplanation';

export const Routes: React.FC = () => {
  const routes = useStore((state) => state.routes);
  const nodes = useStore((state) => state.nodes);
  const events = useStore((state) => state.events);
  const setActiveDst = useStore((state) => state.setActiveDst);

  const [expandedDst, setExpandedDst] = useState<number | null>(null);

  const nodeMap = new Map<number, string>();
  nodes.forEach((n) => nodeMap.set(n.id, n.name));

  const routeChangeEvents = events.filter((e) => e.type === 'route_change');

  return (
    <div className="flex flex-col gap-2xl pb-3xl">
      <div>
        <Eyebrow>BHARATROUTE · ROUTING ENGINE</Eyebrow>
        <h1 className="text-display-md text-ink font-display font-medium mt-xs">
          Routing table & paths
        </h1>
        <p className="text-body-lg text-body mt-xxs">
          Active source-routed paths, hysteresis status, and convergence history
        </p>
      </div>

      {/* Routes DataTable */}
      <Card variant="content">
        <div className="mb-lg">
          <h3 className="text-display-sub-sm text-ink font-semibold">Active destinations</h3>
          <p className="text-body-sm text-body">
            Click any row to expand candidate evaluation breakdown
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-canvas-soft border-b border-mute/50">
                <th className="p-md text-caption text-body font-semibold">Destination</th>
                <th className="p-md text-caption text-body font-semibold">Active Path</th>
                <th className="p-md text-caption text-body font-semibold text-right">Active Cost</th>
                <th className="p-md text-caption text-body font-semibold text-right">Direct Cost</th>
                <th className="p-md text-caption text-body font-semibold text-right">Improvement</th>
                <th className="p-md text-caption text-body font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {routes.map((route) => {
                const dstNode = nodes.find((n) => n.id === route.dst);
                const path = route.active?.path || [];
                const pathStr = path.map((id) => nodeMap.get(id) || id).join(' → ');
                const isExpanded = expandedDst === route.dst;

                const directCost = route.direct?.cost_ms;
                const activeCost = route.active?.cost_ms;
                const imp =
                  directCost != null && activeCost != null
                    ? directCost - activeCost
                    : route.improvement_ms;

                return (
                  <React.Fragment key={`route-row-${route.dst}`}>
                    <tr
                      onClick={() => {
                        setExpandedDst(isExpanded ? null : route.dst);
                        setActiveDst(route.dst);
                      }}
                      className="border-b border-mute/30 hover:bg-canvas/50 cursor-pointer transition-colors"
                    >
                      <td className="p-md text-body-sm font-semibold text-ink">
                        <div className="flex items-center gap-xs">
                          <span>{dstNode?.name || route.dst}</span>
                          <span className="text-caption text-body font-normal">
                            ({dstNode?.label || ''})
                          </span>
                        </div>
                      </td>
                      <td className="p-md text-body-sm font-mono text-ink">{pathStr}</td>
                      <td className="p-md text-body-sm font-bold text-ink text-right tabular-nums">
                        {activeCost != null ? `${activeCost.toFixed(1)} ms` : '—'}
                      </td>
                      <td className="p-md text-body-sm text-body text-right tabular-nums">
                        {directCost != null ? `${directCost.toFixed(1)} ms` : '—'}
                      </td>
                      <td className="p-md text-body-sm text-right tabular-nums">
                        {imp != null && imp > 0 ? (
                          <span className="font-bold text-primary">−{imp.toFixed(1)} ms</span>
                        ) : (
                          <span className="text-body font-normal">Optimal</span>
                        )}
                      </td>
                      <td className="p-md text-caption text-right">
                        <button className="text-primary hover:underline font-semibold">
                          {isExpanded ? 'Hide' : 'Inspect'}
                        </button>
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr className="bg-canvas border-b border-mute/50">
                        <td colSpan={6} className="p-xl">
                          <RouteExplanation />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Route Change History List */}
      <Card variant="content">
        <div className="mb-lg">
          <h3 className="text-display-sub-sm text-ink font-semibold">Convergence log</h3>
          <p className="text-body-sm text-body">
            Chronological audit of route flips, hysteresis dwells, and failovers
          </p>
        </div>

        {routeChangeEvents.length === 0 ? (
          <p className="text-body-sm text-body py-lg text-center">
            No route changes logged yet. Trigger an event in the simulator to watch automatic failover.
          </p>
        ) : (
          <div className="flex flex-col divide-y divide-mute/30">
            {routeChangeEvents.map((ev) => (
              <div key={ev.id} className="py-md flex items-center justify-between text-body-sm">
                <div className="flex items-center gap-md">
                  <Badge variant="active">Flip</Badge>
                  <span className="font-medium text-ink">{ev.summary}</span>
                </div>
                <span className="text-caption text-body tabular-nums">
                  {new Date(ev.timestamp).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};
