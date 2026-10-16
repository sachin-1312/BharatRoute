import React, { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { Eyebrow } from '../components/ui/Eyebrow';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Badge } from '../components/ui/Badge';
import { api } from '../lib/api';

export const Simulator: React.FC = () => {
  const mode = useStore((state) => state.mode);
  const nodes = useStore((state) => state.nodes);
  const events = useStore((state) => state.events);
  const addToast = useStore((state) => state.addToast);

  const [scenario, setScenario] = useState<any>(null);
  const [eventType, setEventType] = useState('set_link');
  const [selectedA, setSelectedA] = useState('MAA');
  const [selectedB, setSelectedB] = useState('SIN');
  const [selectedNode, setSelectedNode] = useState('BOM');
  const [rttMs, setRttMs] = useState(120);
  const [jitterMs, setJitterMs] = useState(5);
  const [lossPct, setLossPct] = useState(5);
  const [bomDown, setBomDown] = useState(false);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<{
    name: string;
    desc: string;
    time: string;
    status: 'active' | 'restored';
  } | null>(null);

  useEffect(() => {
    if (mode === 'sim') {
      api
        .getSimScenario()
        .then(setScenario)
        .catch((err) => console.warn('Failed to load sim scenario', err));
    }
  }, [mode]);

  if (mode !== 'sim') {
    return (
      <div className="flex flex-col items-center justify-center p-4xl text-center">
        <Card variant="content" className="max-w-md">
          <h2 className="text-display-sub-sm font-semibold text-ink">Simulator unavailable</h2>
          <p className="text-body-md text-body mt-sm">
            The event injection simulator is only active in simulation mode. Live VM mode uses
            physical network conditions.
          </p>
        </Card>
      </div>
    );
  }

  const handleApplyCustomEvent = async () => {
    try {
      if (eventType === 'kill_node' || eventType === 'node_down' || eventType === 'revive_node' || eventType === 'node_up') {
        await api.postSimEvent({
          type: eventType,
          node: selectedNode,
        });
      } else {
        await api.postSimEvent({
          type: eventType,
          a: selectedA,
          b: selectedB,
          rtt_ms: rttMs,
          jitter_ms: jitterMs,
          loss_pct: lossPct,
        });
      }
      setLastAction({
        name: `Custom Event: ${eventType}`,
        desc: `Target: ${eventType.includes('node') ? `Node ${selectedNode}` : `Link ${selectedA} ↔ ${selectedB}`} (${rttMs}ms, ${lossPct}% loss)`,
        time: new Date().toLocaleTimeString(),
        status: 'active',
      });
      addToast('info', `Event "${eventType}" dispatched to simulation bus`);
    } catch (err: any) {
      addToast('error', `Failed to apply event: ${err.message}`);
    }
  };

  const handleQuickAction = async (action: string) => {
    try {
      switch (action) {
        case 'degrade_maa_sin':
          await api.postSimEvent({
            type: 'set_link',
            a: 'MAA',
            b: 'SIN',
            rtt_ms: 110,
            jitter_ms: 8,
            loss_pct: 0,
          });
          setActiveAction('degrade_maa_sin');
          setLastAction({
            name: 'Degrade MAA ↔ SIN Applied',
            desc: 'Injected 70ms congestion delay to Chennai → Singapore submarine cable (now 110ms). Alternate overlay route selected.',
            time: new Date().toLocaleTimeString(),
            status: 'active',
          });
          break;
        case 'loss_ldh_maa':
          await api.postSimEvent({
            type: 'set_link',
            a: 'LDH',
            b: 'MAA',
            rtt_ms: 46,
            jitter_ms: 2,
            loss_pct: 3.5,
          });
          setActiveAction('loss_ldh_maa');
          setLastAction({
            name: '3.5% Domestic Packet Loss Injected',
            desc: 'Packet loss penalty applied to LDH ↔ MAA. Rerouting hysteresis evaluation triggered.',
            time: new Date().toLocaleTimeString(),
            status: 'active',
          });
          break;
        case 'toggle_bom':
          if (!bomDown) {
            await api.postSimEvent({ type: 'kill_node', node: 'BOM' });
            setBomDown(true);
            setActiveAction('bom_down');
            setLastAction({
              name: 'Node Mumbai (BOM) Severed (Outage)',
              desc: 'Total landing station outage simulated at Mumbai. Route engine diverts all exit flows through MAA/Chennai.',
              time: new Date().toLocaleTimeString(),
              status: 'active',
            });
          } else {
            await api.postSimEvent({ type: 'revive_node', node: 'BOM' });
            setBomDown(false);
            setActiveAction(null);
            setLastAction({
              name: 'Node Mumbai (BOM) Revived',
              desc: 'Relay hardware brought back online. Routing engine re-evaluates lowest cost paths.',
              time: new Date().toLocaleTimeString(),
              status: 'restored',
            });
          }
          break;
        case 'reset':
          await api.resetSim();
          setBomDown(false);
          setActiveAction(null);
          setLastAction({
            name: 'Simulation Reset',
            desc: 'All link latencies, jitter, and loss restored to nominal baseline values.',
            time: new Date().toLocaleTimeString(),
            status: 'restored',
          });
          addToast('info', 'Simulation reset: all links restored to default baseline');
          return;
      }
      addToast('info', `Quick event applied: ${action}`);
    } catch (err: any) {
      addToast('error', `Quick action failed: ${err.message}`);
    }
  };

  const nodeOptions = nodes.map((n) => ({
    value: n.name,
    label: `${n.name} (${n.label})`,
  }));

  const simEvents = events.filter((e) => e.type === 'sim_event');

  return (
    <div className="flex flex-col gap-2xl pb-3xl">
      <div>
        <Eyebrow>BHARATROUTE · CHAOS & SIMULATOR</Eyebrow>
        <h1 className="text-display-md text-ink font-display font-medium mt-xs">
          Simulation controller
        </h1>
        <p className="text-body-lg text-body mt-xxs">
          Inject synthetic fiber cuts, latency spikes, and packet loss to demonstrate failover
        </p>
      </div>

      {/* Scenario Metadata Card */}
      {scenario && (
        <Card variant="content">
          <div className="flex items-center justify-between mb-sm flex-wrap gap-xs">
            <h3 className="text-display-sub-sm text-ink font-semibold">{scenario.name}</h3>
            <Badge variant="simulated">Seed: {scenario.seed || 'default'}</Badge>
          </div>
          <p className="text-body-sm text-body">{scenario.notes}</p>
          <p className="text-caption text-body-mid mt-xs">
            Note: Baseline latencies reflect approximate physical distances and cable geometries
            for illustrative hackathon comparison.
          </p>
        </Card>
      )}

      {/* Live Simulation Status Banner */}
      {lastAction && (
        <div
          className={`p-4 rounded-xl border flex items-start justify-between gap-4 transition-all ${
            lastAction.status === 'active'
              ? 'bg-amber-50/90 border-amber-200 text-amber-950'
              : 'bg-emerald-50/90 border-emerald-200 text-emerald-950'
          }`}
        >
          <div className="flex items-start gap-3">
            <div
              className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                lastAction.status === 'active'
                  ? 'bg-amber-200 text-amber-900'
                  : 'bg-emerald-200 text-emerald-900'
              }`}
            >
              <span className="text-base font-bold">⚡</span>
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-sm text-gray-900">{lastAction.name}</span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                    lastAction.status === 'active'
                      ? 'bg-amber-200 text-amber-900'
                      : 'bg-emerald-200 text-emerald-900'
                  }`}
                >
                  {lastAction.status === 'active' ? 'Active in Simulation' : 'Baseline Restored'}
                </span>
                <span className="text-xs text-gray-500 tabular-nums">At {lastAction.time}</span>
              </div>
              <p className="text-xs text-gray-700 mt-1 leading-relaxed">{lastAction.desc}</p>
            </div>
          </div>
          {lastAction.status === 'active' && (
            <Button variant="secondary" size="sm" onClick={() => handleQuickAction('reset')}>
              Reset to Baseline
            </Button>
          )}
        </div>
      )}

      {/* Quick Action Cards Grid (Section 18.7.4) */}
      <div>
        <h3 className="text-display-sub-sm text-ink font-semibold mb-md">Demo quick actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-xl">
          <Card variant="content" className="flex flex-col justify-between">
            <div>
              <h4 className="text-body-md font-semibold text-ink">Degrade MAA to SIN</h4>
              <p className="text-body-sm text-body mt-xxs">
                Adds 70ms congestion delay to the primary submarine cable link out of Chennai.
              </p>
            </div>
            <div className="mt-lg flex items-center gap-2">
              <Button
                variant={activeAction === 'degrade_maa_sin' ? 'primary' : 'tertiary'}
                size="sm"
                onClick={() => handleQuickAction('degrade_maa_sin')}
              >
                {activeAction === 'degrade_maa_sin' ? '✓ Degraded' : 'Degrade MAA ↔ SIN'}
              </Button>
            </div>
          </Card>

          <Card variant="content" className="flex flex-col justify-between">
            <div>
              <h4 className="text-body-md font-semibold text-ink">Add 3.5% loss on LDH to MAA</h4>
              <p className="text-body-sm text-body mt-xxs">
                Injects domestic packet loss triggering loss penalty calculations.
              </p>
            </div>
            <div className="mt-lg flex items-center gap-2">
              <Button
                variant={activeAction === 'loss_ldh_maa' ? 'primary' : 'tertiary'}
                size="sm"
                onClick={() => handleQuickAction('loss_ldh_maa')}
              >
                {activeAction === 'loss_ldh_maa' ? '✓ Loss Injected' : 'Add 3.5% Loss'}
              </Button>
            </div>
          </Card>

          <Card variant="content" className="flex flex-col justify-between">
            <div>
              <h4 className="text-body-md font-semibold text-ink">
                {bomDown ? 'Revive Node Mumbai (BOM)' : 'Kill Node Mumbai (BOM)'}
              </h4>
              <p className="text-body-sm text-body mt-xxs">
                Simulates total relay hardware outage at the Mumbai landing station.
              </p>
            </div>
            <div className="mt-lg flex items-center gap-2">
              <Button
                variant={bomDown ? 'primary' : 'tertiary'}
                size="sm"
                onClick={() => handleQuickAction('toggle_bom')}
              >
                {bomDown ? 'Revive BOM' : 'Kill BOM'}
              </Button>
            </div>
          </Card>

          <Card variant="content" className="flex flex-col justify-between">
            <div>
              <h4 className="text-body-md font-semibold text-ink">Restore all links</h4>
              <p className="text-body-sm text-body mt-xxs">
                Clears all impairments and brings all nodes and links back to baseline.
              </p>
            </div>
            <div className="mt-lg">
              <Button variant="secondary" size="sm" onClick={() => handleQuickAction('reset')}>
                Reset Simulation
              </Button>
            </div>
          </Card>
        </div>
      </div>

      {/* Custom Event Injection Form */}
      <Card variant="content">
        <h3 className="text-display-sub-sm text-ink font-semibold mb-lg">Custom impairment</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-lg">
          <Select
            label="Event type"
            value={eventType}
            onChange={(e) => setEventType(e.target.value)}
            options={[
              { value: 'set_link', label: 'Impair link metrics' },
              { value: 'link_down', label: 'Sever link (down)' },
              { value: 'restore_link', label: 'Restore link (nominal)' },
              { value: 'kill_node', label: 'Kill node' },
              { value: 'revive_node', label: 'Revive node' },
            ]}
          />

          {eventType.startsWith('node_') ? (
            <Select
              label="Target Node"
              value={selectedNode}
              onChange={(e) => setSelectedNode(e.target.value)}
              options={nodeOptions}
            />
          ) : (
            <>
              <Select
                label="Node A"
                value={selectedA}
                onChange={(e) => setSelectedA(e.target.value)}
                options={nodeOptions}
              />
              <Select
                label="Node B"
                value={selectedB}
                onChange={(e) => setSelectedB(e.target.value)}
                options={nodeOptions}
              />
            </>
          )}

          {eventType === 'link_impair' && (
            <>
              <Input
                label="RTT (ms)"
                type="number"
                value={rttMs}
                onChange={(e) => setRttMs(Number(e.target.value))}
              />
              <Input
                label="Jitter (ms)"
                type="number"
                value={jitterMs}
                onChange={(e) => setJitterMs(Number(e.target.value))}
              />
              <Input
                label="Loss (%)"
                type="number"
                value={lossPct}
                onChange={(e) => setLossPct(Number(e.target.value))}
              />
            </>
          )}
        </div>

        <div className="mt-xl flex justify-end">
          <Button variant="primary" onClick={handleApplyCustomEvent}>
            Apply Event
          </Button>
        </div>
      </Card>

      {/* Timeline of Injected Events */}
      <Card variant="content">
        <h3 className="text-display-sub-sm text-ink font-semibold mb-lg">Event history</h3>
        {simEvents.length === 0 ? (
          <p className="text-body-sm text-body py-lg text-center">
            No events have been injected during this session.
          </p>
        ) : (
          <div className="flex flex-col divide-y divide-mute/30">
            {simEvents.map((ev) => (
              <div key={ev.id} className="py-md flex items-center justify-between text-body-sm">
                <span className="font-medium text-ink">{ev.summary}</span>
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
