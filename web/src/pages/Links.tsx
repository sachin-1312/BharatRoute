import React, { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { Eyebrow } from '../components/ui/Eyebrow';
import { Card } from '../components/ui/Card';
import { api } from '../lib/api';
import type { MatrixResponse, HistoryPoint } from '../lib/types';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';

export const Links: React.FC = () => {
  const links = useStore((state) => state.links);
  const routes = useStore((state) => state.routes);

  const [matrix, setMatrix] = useState<MatrixResponse | null>(null);
  const [selectedLink, setSelectedLink] = useState<{ a: string; b: string } | null>(null);
  const [linkHistory, setLinkHistory] = useState<HistoryPoint[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [filterActiveOnly, setFilterActiveOnly] = useState(false);

  useEffect(() => {
    api
      .getMatrix()
      .then(setMatrix)
      .catch((err) => console.warn('Failed to load matrix', err));
  }, [links]);

  useEffect(() => {
    if (!selectedLink) return;
    setHistoryLoading(true);
    api
      .getLinkHistory(selectedLink.a, selectedLink.b, 300)
      .then(setLinkHistory)
      .catch((err) => console.warn('Failed to fetch link history', err))
      .finally(() => setHistoryLoading(false));
  }, [selectedLink]);

  // Set of node pairs on active routes
  const activeLinkPairs = new Set<string>();
  routes.forEach((r) => {
    if (r.active?.path) {
      for (let i = 0; i < r.active.path.length - 1; i++) {
        const u = r.active.path[i];
        const v = r.active.path[i + 1];
        activeLinkPairs.add(`${u}-${v}`);
        activeLinkPairs.add(`${v}-${u}`);
      }
    }
  });

  return (
    <div className="flex flex-col gap-2xl pb-3xl">
      <div>
        <Eyebrow>BHARATROUTE · TELEMETRY</Eyebrow>
        <h1 className="text-display-md text-ink font-display font-medium mt-xs">
          Link quality & matrix
        </h1>
        <p className="text-body-lg text-body mt-xxs">
          Full mesh round-trip measurements and link-state health
        </p>
      </div>

      {/* Latency Matrix Card */}
      <Card variant="content">
        <div className="flex items-center justify-between mb-lg flex-wrap gap-md">
          <div>
            <h3 className="text-display-sub-sm text-ink font-semibold">Latency matrix (RTT ms)</h3>
            <p className="text-body-sm text-body">
              Click any cell to inspect link history and telemetry
            </p>
          </div>
          <label className="flex items-center gap-xs cursor-pointer select-none text-body-sm text-ink font-medium">
            <input
              type="checkbox"
              checked={filterActiveOnly}
              onChange={(e) => setFilterActiveOnly(e.target.checked)}
              className="accent-primary w-4 h-4 rounded-sm"
            />
            <span>Highlight active route links only</span>
          </label>
        </div>

        {matrix && matrix.nodes.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-canvas-soft border-b border-mute/50">
                  <th className="p-md text-caption text-body font-semibold">From \ To</th>
                  {matrix.nodes.map((node) => (
                    <th
                      key={`col-${node}`}
                      className="p-md text-caption text-body font-semibold text-right"
                    >
                      {node}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrix.nodes.map((rowNode, i) => (
                  <tr key={`row-${rowNode}`} className="border-b border-mute/30 hover:bg-canvas/50">
                    <td className="p-md font-semibold text-body-sm text-ink bg-canvas-soft">
                      {rowNode}
                    </td>
                    {matrix.nodes.map((colNode, j) => {
                      if (i === j) {
                        return (
                          <td
                            key={`cell-${rowNode}-${colNode}`}
                            className="p-md text-right text-caption text-mute tabular-nums"
                          >
                            —
                          </td>
                        );
                      }

                      const rtt = matrix.rtt[i]?.[j] || 0;
                      const isZero = rtt === 0;

                      // Lightness ramp neutral styling
                      let bgClass = 'bg-canvas';
                      let textClass = 'text-ink';
                      if (!isZero) {
                        if (rtt < 40) bgClass = 'bg-[#f4efe8]';
                        else if (rtt < 80) bgClass = 'bg-[#eae3d9]';
                        else if (rtt < 140) bgClass = 'bg-[#dfd7cc]';
                        else {
                          bgClass = 'bg-[#36342e]';
                          textClass = 'text-on-primary';
                        }
                      }

                      const isSelected =
                        (selectedLink?.a === rowNode && selectedLink?.b === colNode) ||
                        (selectedLink?.a === colNode && selectedLink?.b === rowNode);

                      return (
                        <td
                          key={`cell-${rowNode}-${colNode}`}
                          onClick={() => setSelectedLink({ a: rowNode, b: colNode })}
                          className={`p-md text-right font-medium text-body-sm tabular-nums cursor-pointer transition-all ${bgClass} ${textClass} ${
                            isSelected ? 'ring-2 ring-primary ring-inset font-bold' : ''
                          }`}
                        >
                          {isZero ? 'down' : `${Math.round(rtt)}`}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-body-sm text-body py-lg text-center">Loading latency matrix…</p>
        )}
      </Card>

      {/* Selected Link Telemetry Detail */}
      {selectedLink && (
        <Card variant="content">
          <div className="flex items-center justify-between mb-lg">
            <div>
              <h3 className="text-display-sub-sm text-ink font-semibold">
                Link telemetry: {selectedLink.a} ↔ {selectedLink.b}
              </h3>
              <p className="text-body-sm text-body">
                5-minute rolling window of continuous active probes
              </p>
            </div>
            <button
              onClick={() => setSelectedLink(null)}
              className="text-body-sm text-body hover:text-ink font-semibold"
            >
              Close
            </button>
          </div>

          {historyLoading ? (
            <p className="text-body-sm text-body py-lg text-center">Loading history points…</p>
          ) : linkHistory.length === 0 ? (
            <p className="text-body-sm text-body py-lg text-center">
              No recent probe samples found for this pair.
            </p>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={linkHistory.map((h) => ({
                    time: new Date(h.ts).toLocaleTimeString(),
                    rtt: Math.round(h.rtt_ms * 10) / 10,
                    ewma: Math.round(h.ewma_ms * 10) / 10,
                    loss: h.loss_pct,
                  }))}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <CartesianGrid stroke="#c5c0b1" strokeOpacity={0.5} vertical={false} />
                  <XAxis dataKey="time" stroke="#605d52" fontSize={12} tickLine={false} />
                  <YAxis stroke="#605d52" fontSize={12} tickLine={false} unit=" ms" />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="bg-canvas rounded-md p-md border border-mute shadow-toast text-body-sm">
                            <p className="text-caption text-body mb-xs">{label}</p>
                            {payload.map((entry) => (
                              <div
                                key={entry.name}
                                className="flex items-center justify-between gap-md"
                              >
                                <span className="capitalize font-medium text-ink">
                                  {entry.name}:
                                </span>
                                <span className="font-bold tabular-nums">
                                  {entry.value} {entry.name === 'loss' ? '%' : 'ms'}
                                </span>
                              </div>
                            ))}
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="rtt"
                    stroke="#201515"
                    strokeWidth={2}
                    dot={false}
                    name="RTT"
                  />
                  <Line
                    type="monotone"
                    dataKey="ewma"
                    stroke="#605d52"
                    strokeWidth={1.5}
                    dot={false}
                    name="EWMA"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      )}
    </div>
  );
};
