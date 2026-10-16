import React from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { useStore } from '../../store/useStore';

export const LatencyChart: React.FC = () => {
  const pathHistory = useStore((state) => state.pathHistory);

  // If no live history points yet, prepare some display points
  const data = pathHistory.map((pt) => {
    const d = new Date(pt.ts);
    const timeStr = `${d.getHours().toString().padStart(2, '0')}:${d
      .getMinutes()
      .toString()
      .padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
    return {
      time: timeStr,
      overlay: pt.overlay_ms != null ? Math.round(pt.overlay_ms * 10) / 10 : null,
      direct: pt.direct_ms != null ? Math.round(pt.direct_ms * 10) / 10 : null,
    };
  });

  return (
    <div className="bg-canvas-soft rounded-md p-xl border border-mute/30">
      <div className="flex items-center justify-between mb-lg">
        <div>
          <h3 className="text-display-sub-sm text-ink font-semibold">Latency over time</h3>
          <p className="text-body-sm text-body">Direct vs overlay path RTT</p>
        </div>
        <div className="flex items-center gap-lg text-body-sm">
          <div className="flex items-center gap-xs">
            <span className="w-4 h-[3px] bg-primary rounded-pill inline-block" />
            <span className="font-medium text-ink">Overlay</span>
          </div>
          <div className="flex items-center gap-xs">
            <span className="w-4 h-[2px] border-b-2 border-dashed border-ink inline-block" />
            <span className="font-medium text-ink">Direct</span>
          </div>
        </div>
      </div>

      <div className="h-64 w-full">
        {data.length === 0 ? (
          <div className="h-full flex items-center justify-center text-body text-body-sm">
            Waiting for live path probe samples…
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid
                stroke="#c5c0b1"
                strokeOpacity={0.5}
                vertical={false}
                strokeDasharray="none"
              />
              <XAxis
                dataKey="time"
                stroke="#605d52"
                fontSize={12}
                tickLine={false}
                axisLine={{ stroke: '#c5c0b1', strokeOpacity: 0.5 }}
              />
              <YAxis
                stroke="#605d52"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                unit=" ms"
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="bg-canvas rounded-md p-md border border-mute shadow-toast text-body-sm">
                        <p className="text-caption text-body mb-xs">{label}</p>
                        {payload.map((entry) => (
                          <div key={entry.name} className="flex items-center justify-between gap-md">
                            <span className="capitalize font-medium text-ink">{entry.name}:</span>
                            <span className="font-bold tabular-nums">
                              {entry.value != null ? `${entry.value} ms` : 'Lost'}
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
                dataKey="overlay"
                stroke="#ff4f00"
                strokeWidth={2.5}
                dot={false}
                connectNulls={false}
                name="overlay"
              />
              <Line
                type="monotone"
                dataKey="direct"
                stroke="#201515"
                strokeWidth={1.5}
                strokeDasharray="6 4"
                dot={false}
                connectNulls={false}
                name="direct"
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};
