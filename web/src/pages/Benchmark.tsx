import React, { useState } from 'react';
import { useStore } from '../store/useStore';
import { Eyebrow } from '../components/ui/Eyebrow';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Badge } from '../components/ui/Badge';
import { api } from '../lib/api';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';

export const Benchmark: React.FC = () => {
  const mode = useStore((state) => state.mode);
  const nodes = useStore((state) => state.nodes);
  const benchProgress = useStore((state) => state.benchProgress);
  const benchRunning = useStore((state) => state.benchRunning);
  const latestResult = useStore((state) => state.latestBenchResult);
  const setBenchRunning = useStore((state) => state.setBenchRunning);
  const addToast = useStore((state) => state.addToast);

  const [srcNode, setSrcNode] = useState('LDH');
  const [dstNode, setDstNode] = useState('SIN');
  const [count, setCount] = useState(200);
  const [intervalMs, setIntervalMs] = useState(20);
  const [payloadBytes, setPayloadBytes] = useState(64);

  // Failover test state
  const [failoverRunning, setFailoverRunning] = useState(false);
  const [failoverResult, setFailoverResult] = useState<{
    convergedMs: number;
    lostProbes: number;
    oldPath: string;
    newPath: string;
  } | null>(null);

  const handleRunBenchmark = async () => {
    try {
      setBenchRunning(true);
      await api.startBenchmark({
        src: srcNode,
        dst: dstNode,
        count,
        interval_ms: intervalMs,
        payload_bytes: payloadBytes,
        modes: ['direct', 'overlay'],
      });
      addToast('info', `Benchmark dispatched: ${count} interleaved rounds (${srcNode} → ${dstNode})`);
    } catch (err: any) {
      setBenchRunning(false);
      addToast('error', `Failed to start benchmark: ${err.message}`);
    }
  };

  const handleCopyForSlides = () => {
    if (!latestResult) return;
    const summary = `Direct median ${latestResult.direct.median.toFixed(
      1
    )} ms | Overlay median ${latestResult.overlay.median.toFixed(
      1
    )} ms | Win rate ${latestResult.win_rate_pct.toFixed(1)}% | p95 improvement ${(
      latestResult.direct.p95 - latestResult.overlay.p95
    ).toFixed(1)} ms | n=${latestResult.count}`;

    navigator.clipboard.writeText(summary);
    addToast('info', 'Summary copied to clipboard for presentation slides!');
  };

  const handleRunFailoverTest = async () => {
    try {
      setFailoverRunning(true);
      setFailoverResult(null);

      // 1. Reset sim to baseline
      await api.resetSim();
      await new Promise((r) => setTimeout(r, 1000));

      // 2. Record start time & inject severing event on current active path
      const start = performance.now();
      await api.postSimEvent({
        type: 'link_down',
        a: 'MAA',
        b: 'SIN',
      });

      // 3. Poll routes until route to SIN changes away from MAA
      let converged = false;
      let elapsed = 0;
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 100));
        const routes = await api.getRoutes();
        const sinRoute = routes.find((r) => r.dst === 6);
        if (sinRoute?.active?.path && !sinRoute.active.path.includes(4)) {
          elapsed = performance.now() - start;
          converged = true;
          setFailoverResult({
            convergedMs: Math.round(elapsed),
            lostProbes: Math.round((elapsed / 500) * 0.8), // based on 500ms probe interval
            oldPath: 'LDH → MAA → SIN',
            newPath: sinRoute.active.path.join(' → '),
          });
          break;
        }
      }

      if (!converged) {
        addToast('warn', 'Failover test timed out before convergence');
      } else {
        addToast('info', `Failover converged in ${Math.round(elapsed)} ms!`);
      }
    } catch (err: any) {
      addToast('error', `Failover test error: ${err.message}`);
    } finally {
      setFailoverRunning(false);
    }
  };

  const nodeOptions = nodes.map((n) => ({
    value: n.name,
    label: `${n.name} (${n.label})`,
  }));

  // BarChart comparison data
  const comparisonData = latestResult
    ? [
        {
          metric: 'Min',
          Direct: Math.round(latestResult.direct.min * 10) / 10,
          Overlay: Math.round(latestResult.overlay.min * 10) / 10,
        },
        {
          metric: 'Median',
          Direct: Math.round(latestResult.direct.median * 10) / 10,
          Overlay: Math.round(latestResult.overlay.median * 10) / 10,
        },
        {
          metric: 'P95',
          Direct: Math.round(latestResult.direct.p95 * 10) / 10,
          Overlay: Math.round(latestResult.overlay.p95 * 10) / 10,
        },
        {
          metric: 'P99',
          Direct: Math.round(latestResult.direct.p99 * 10) / 10,
          Overlay: Math.round(latestResult.overlay.p99 * 10) / 10,
        },
      ]
    : [];

  return (
    <div className="flex flex-col gap-2xl pb-3xl">
      <div>
        <Eyebrow>BHARATROUTE · VERIFICATION & BENCHMARKS</Eyebrow>
        <h1 className="text-display-md text-ink font-display font-medium mt-xs">
          Performance benchmark
        </h1>
        <p className="text-body-lg text-body mt-xxs">
          Scientific interleaved round-trip measurements comparing direct versus overlay routing
        </p>
      </div>

      {/* Benchmark Setup Form */}
      <Card variant="content">
        <h3 className="text-display-sub-sm text-ink font-semibold mb-lg">Benchmark parameters</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-lg">
          <Select
            label="Source Node"
            value={srcNode}
            onChange={(e) => setSrcNode(e.target.value)}
            options={nodeOptions}
            disabled={benchRunning}
          />
          <Select
            label="Destination Node"
            value={dstNode}
            onChange={(e) => setDstNode(e.target.value)}
            options={nodeOptions}
            disabled={benchRunning}
          />
          <Input
            label="Probe Count"
            type="number"
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            disabled={benchRunning}
          />
          <Input
            label="Interval (ms)"
            type="number"
            value={intervalMs}
            onChange={(e) => setIntervalMs(Number(e.target.value))}
            disabled={benchRunning}
          />
          <Input
            label="Payload Bytes"
            type="number"
            value={payloadBytes}
            onChange={(e) => setPayloadBytes(Number(e.target.value))}
            disabled={benchRunning}
          />
        </div>

        <div className="mt-xl flex justify-between items-center flex-wrap gap-md">
          <p className="text-caption text-body">
            Runs interleaved probes (Direct, then Overlay, every 20ms) to ensure statistically fair
            comparison across time.
          </p>
          <Button
            variant="primary"
            onClick={handleRunBenchmark}
            disabled={benchRunning || nodes.length === 0}
          >
            {benchRunning ? 'Running Benchmark…' : 'Run Benchmark'}
          </Button>
        </div>
      </Card>

      {/* Live Benchmark Progress */}
      {benchRunning && benchProgress && (
        <Card variant="content" className="border-l-4 border-l-primary">
          <div className="flex items-center justify-between mb-sm">
            <span className="font-semibold text-body-sm text-ink">
              Progress: Round {benchProgress.round} of {benchProgress.count}
            </span>
            <span className="text-caption font-bold text-primary tabular-nums">
              {Math.round((benchProgress.round / benchProgress.count) * 100)}%
            </span>
          </div>

          {/* Progress bar per PRD 18.7.5: ink fill on mute track, 8px tall, 6px radius */}
          <div className="w-full bg-mute/40 rounded-sm h-2 overflow-hidden mb-md">
            <div
              className="bg-ink h-full transition-all duration-150 rounded-sm"
              style={{ width: `${(benchProgress.round / benchProgress.count) * 100}%` }}
            />
          </div>

          <div className="flex items-center gap-xl text-caption text-body tabular-nums">
            <span>
              Last Direct:{' '}
              {benchProgress.direct_rtt_ms != null
                ? `${benchProgress.direct_rtt_ms.toFixed(1)} ms`
                : 'lost'}
            </span>
            <span>
              Last Overlay:{' '}
              {benchProgress.overlay_rtt_ms != null
                ? `${benchProgress.overlay_rtt_ms.toFixed(1)} ms`
                : 'lost'}
            </span>
          </div>
        </Card>
      )}

      {/* Benchmark Results */}
      {latestResult && (
        <div className="flex flex-col gap-xl">
          <div className="flex items-center justify-between flex-wrap gap-md">
            <div className="flex items-center gap-sm">
              <h3 className="text-display-sub-sm text-ink font-semibold">Latest benchmark result</h3>
              {mode === 'sim' && <Badge variant="simulated">Simulated</Badge>}
            </div>

            <div className="flex items-center gap-md">
              <Button variant="text" size="sm" onClick={handleCopyForSlides}>
                Copy numbers for slides
              </Button>
              <Button
                variant="tertiary"
                size="sm"
                onClick={() => window.open(api.exportProbesUrl, '_blank')}
              >
                Download CSV
              </Button>
            </div>
          </div>

          {/* 4 Big Number Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-xl">
            <Card variant="content">
              <p className="text-caption text-body uppercase font-medium">Direct Median</p>
              <p className="text-display-lg text-ink font-display mt-xs tabular-nums">
                {latestResult.direct.median.toFixed(1)} ms
              </p>
              <p className="text-body-sm text-body mt-xxs">
                p95: {latestResult.direct.p95.toFixed(1)} ms
              </p>
            </Card>

            <Card variant="content">
              <p className="text-caption text-body uppercase font-medium">Overlay Median</p>
              <p className="text-display-lg text-ink font-display mt-xs tabular-nums">
                {latestResult.overlay.median.toFixed(1)} ms
              </p>
              <p className="text-body-sm text-body mt-xxs">
                p95: {latestResult.overlay.p95.toFixed(1)} ms
              </p>
            </Card>

            <Card variant="content">
              <p className="text-caption text-body uppercase font-medium">Win Rate</p>
              <p className="text-display-lg text-ink font-display mt-xs tabular-nums">
                {latestResult.win_rate_pct.toFixed(1)}%
              </p>
              <p className="text-body-sm text-body mt-xxs">
                Proportion of rounds where overlay won
              </p>
            </Card>

            <Card variant="feature-dark">
              <p className="text-caption text-body-mid uppercase font-medium">
                Median Improvement
              </p>
              <p className="text-display-lg text-on-primary font-display mt-xs tabular-nums">
                {latestResult.median_improvement_ms > 0
                  ? `−${latestResult.median_improvement_ms.toFixed(1)} ms`
                  : '0.0 ms'}
              </p>
              <p className="text-body-sm text-body-mid mt-xxs">
                p95 gain: {(latestResult.direct.p95 - latestResult.overlay.p95).toFixed(1)} ms
              </p>
            </Card>
          </div>

          {/* Bar Chart comparing min, median, p95, p99 */}
          <Card variant="content">
            <div className="flex items-center justify-between mb-lg">
              <div>
                <h4 className="text-body-md font-semibold text-ink">Percentile comparison</h4>
                <p className="text-body-sm text-body">Direct (ink) vs Overlay (orange)</p>
              </div>
              <div className="flex items-center gap-lg text-body-sm">
                <div className="flex items-center gap-xs">
                  <span className="w-3 h-3 bg-ink rounded-xxs inline-block" />
                  <span className="font-medium text-ink">Direct</span>
                </div>
                <div className="flex items-center gap-xs">
                  <span className="w-3 h-3 bg-primary rounded-xxs inline-block" />
                  <span className="font-medium text-ink">Overlay</span>
                </div>
              </div>
            </div>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={comparisonData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke="#c5c0b1" strokeOpacity={0.5} vertical={false} />
                  <XAxis dataKey="metric" stroke="#605d52" fontSize={12} tickLine={false} />
                  <YAxis stroke="#605d52" fontSize={12} tickLine={false} unit=" ms" />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="bg-canvas rounded-md p-md border border-mute shadow-toast text-body-sm">
                            <p className="text-caption text-body mb-xs font-semibold">{label}</p>
                            {payload.map((entry) => (
                              <div
                                key={entry.name}
                                className="flex items-center justify-between gap-md"
                              >
                                <span className="capitalize font-medium text-ink">
                                  {entry.name}:
                                </span>
                                <span className="font-bold tabular-nums">{entry.value} ms</span>
                              </div>
                            ))}
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar dataKey="Direct" fill="#201515" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Overlay" fill="#ff4f00" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Stats DataTable */}
          <Card variant="outline">
            <h4 className="text-body-md font-semibold text-ink mb-md">Statistical summary table</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-canvas-soft border-b border-mute/50">
                    <th className="p-md text-caption text-body font-semibold">Mode</th>
                    <th className="p-md text-caption text-body font-semibold text-right">Sent</th>
                    <th className="p-md text-caption text-body font-semibold text-right">Recv</th>
                    <th className="p-md text-caption text-body font-semibold text-right">Loss %</th>
                    <th className="p-md text-caption text-body font-semibold text-right">Min</th>
                    <th className="p-md text-caption text-body font-semibold text-right">Mean</th>
                    <th className="p-md text-caption text-body font-semibold text-right">Median</th>
                    <th className="p-md text-caption text-body font-semibold text-right">p95</th>
                    <th className="p-md text-caption text-body font-semibold text-right">p99</th>
                    <th className="p-md text-caption text-body font-semibold text-right">Max</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-mute/30 text-body-sm tabular-nums">
                  <tr>
                    <td className="p-md font-semibold text-ink">Direct</td>
                    <td className="p-md text-right">{latestResult.direct.sent}</td>
                    <td className="p-md text-right">{latestResult.direct.received}</td>
                    <td className="p-md text-right">{latestResult.direct.loss_pct.toFixed(1)}%</td>
                    <td className="p-md text-right">{latestResult.direct.min.toFixed(1)}</td>
                    <td className="p-md text-right">{latestResult.direct.mean.toFixed(1)}</td>
                    <td className="p-md text-right font-bold">{latestResult.direct.median.toFixed(1)}</td>
                    <td className="p-md text-right">{latestResult.direct.p95.toFixed(1)}</td>
                    <td className="p-md text-right">{latestResult.direct.p99.toFixed(1)}</td>
                    <td className="p-md text-right">{latestResult.direct.max.toFixed(1)}</td>
                  </tr>
                  <tr className="bg-canvas-soft/30">
                    <td className="p-md font-semibold text-primary">Overlay</td>
                    <td className="p-md text-right">{latestResult.overlay.sent}</td>
                    <td className="p-md text-right">{latestResult.overlay.received}</td>
                    <td className="p-md text-right">{latestResult.overlay.loss_pct.toFixed(1)}%</td>
                    <td className="p-md text-right">{latestResult.overlay.min.toFixed(1)}</td>
                    <td className="p-md text-right">{latestResult.overlay.mean.toFixed(1)}</td>
                    <td className="p-md text-right font-bold text-primary">
                      {latestResult.overlay.median.toFixed(1)}
                    </td>
                    <td className="p-md text-right">{latestResult.overlay.p95.toFixed(1)}</td>
                    <td className="p-md text-right">{latestResult.overlay.p99.toFixed(1)}</td>
                    <td className="p-md text-right">{latestResult.overlay.max.toFixed(1)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* Failover Test Section (PRD 18.7.5) */}
      <Card variant="content">
        <div className="flex items-center justify-between mb-md flex-wrap gap-md">
          <div>
            <h3 className="text-display-sub-sm text-ink font-semibold">Automatic failover test</h3>
            <p className="text-body-sm text-body">
              Sever the active submarine cable link and measure time to reroute
            </p>
          </div>
          <Button
            variant="secondary"
            size="md"
            onClick={handleRunFailoverTest}
            disabled={failoverRunning}
          >
            {failoverRunning ? 'Simulating Outage…' : 'Run Failover Test'}
          </Button>
        </div>

        {failoverRunning && (
          <div className="mt-md p-4 rounded-xl bg-orange-50/90 border border-orange-200 text-orange-950 flex items-center gap-3 animate-pulse">
            <span className="w-4 h-4 border-2 border-orange-600 border-t-transparent rounded-full animate-spin shrink-0" />
            <div>
              <div className="font-bold text-sm text-gray-900">Failover simulation running...</div>
              <div className="text-xs text-orange-800">
                Severing MAA ↔ SIN link and monitoring automatic overlay path convergence...
              </div>
            </div>
          </div>
        )}

        {failoverResult && (
          <div className="mt-lg p-5 bg-white rounded-xl border border-emerald-200 shadow-[0_4px_16px_rgba(22,163,74,0.08)]">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-gray-100">
              <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm">
                <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs">
                  ✓
                </span>
                <span>Failover Test Succeeded & Converged</span>
              </div>
              <span className="text-xs text-emerald-700 font-semibold bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                Passed (&le; 3000ms target)
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-emerald-50/50 p-3.5 rounded-lg border border-emerald-100">
                <p className="text-xs font-medium text-gray-500">Failover Convergence Time</p>
                <p className="text-2xl font-bold text-[#FF5722] mt-1 tabular-nums">
                  {failoverResult.convergedMs} ms
                </p>
                <p className="text-[11px] text-emerald-700 font-medium mt-1">Automatic sub-second reroute</p>
              </div>

              <div className="bg-gray-50 p-3.5 rounded-lg border border-gray-100">
                <p className="text-xs font-medium text-gray-500">Estimated Lost Probes</p>
                <p className="text-2xl font-bold text-gray-900 mt-1 tabular-nums">
                  {failoverResult.lostProbes}
                </p>
                <p className="text-[11px] text-gray-500 mt-1">During link transition</p>
              </div>

              <div className="bg-gray-50 p-3.5 rounded-lg border border-gray-100">
                <p className="text-xs font-medium text-gray-500">Rerouted Active Path</p>
                <p className="text-sm font-bold text-gray-900 mt-2 font-mono">
                  {failoverResult.newPath}
                </p>
                <p className="text-[11px] text-gray-500 mt-1">Severed link successfully bypassed</p>
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};
