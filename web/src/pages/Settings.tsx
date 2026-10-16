import React, { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { Eyebrow } from '../components/ui/Eyebrow';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { api } from '../lib/api';
import type { Params } from '../lib/types';

export const Settings: React.FC = () => {
  const storeParams = useStore((state) => state.params);
  const mode = useStore((state) => state.mode);
  const selfNode = useStore((state) => state.selfNode);
  const addToast = useStore((state) => state.addToast);
  const updateParamsLocally = useStore((state) => state.updateParamsLocally);

  const [formParams, setFormParams] = useState<Partial<Params>>({
    alpha: 0.2,
    loss_penalty_ms_per_pct: 20,
    relay_overhead_ms: 1,
    max_hops: 3,
    switch_margin_pct: 10,
    switch_confirmations: 3,
    min_dwell_ms: 5000,
    probe_interval_ms: 500,
    probe_timeout_ms: 1000,
    loss_window: 20,
    down_after_misses: 4,
    up_after_hits: 2,
    lsa_interval_ms: 2000,
    lsa_ttl_ms: 10000,
  });

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (storeParams) {
      setFormParams(storeParams);
    } else {
      api.getParams().then(setFormParams).catch(console.warn);
    }
  }, [storeParams]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      await api.updateParams(formParams);
      updateParamsLocally(formParams as Params);
      addToast('info', 'Routing parameters saved and applied');
    } catch (err: any) {
      addToast('error', `Failed to update parameters: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefaults = () => {
    const defaults: Params = {
      alpha: 0.2,
      loss_penalty_ms_per_pct: 20,
      relay_overhead_ms: 1,
      max_hops: 3,
      switch_margin_pct: 10,
      switch_confirmations: 3,
      min_dwell_ms: 5000,
      probe_interval_ms: 500,
      probe_timeout_ms: 1000,
      loss_window: 20,
      down_after_misses: 4,
      up_after_hits: 2,
      lsa_interval_ms: 2000,
      lsa_ttl_ms: 10000,
    };
    setFormParams(defaults);
    addToast('info', 'Reset form to factory defaults. Click Save to apply.');
  };

  return (
    <div className="flex flex-col gap-2xl pb-3xl">
      <div>
        <Eyebrow>BHARATROUTE · CONFIGURATION</Eyebrow>
        <h1 className="text-display-md text-ink font-display font-medium mt-xs">
          Engine parameters
        </h1>
        <p className="text-body-lg text-body mt-xxs">
          Tune smoothing constants, hysteresis damping, and loss sensitivity
        </p>
      </div>

      <form onSubmit={handleSave} className="flex flex-col gap-xl">
        {/* Routing & Hysteresis */}
        <Card variant="content">
          <h3 className="text-display-sub-sm text-ink font-semibold mb-lg">
            Routing & hysteresis algorithm
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-lg">
            <Input
              label="Switch margin (%)"
              type="number"
              value={formParams.switch_margin_pct ?? 10}
              onChange={(e) =>
                setFormParams({ ...formParams, switch_margin_pct: Number(e.target.value) })
              }
              helperText="Candidate route must be cheaper by this percent (FR-R6)"
            />
            <Input
              label="Switch confirmations"
              type="number"
              value={formParams.switch_confirmations ?? 3}
              onChange={(e) =>
                setFormParams({ ...formParams, switch_confirmations: Number(e.target.value) })
              }
              helperText="Consecutive rounds candidate must win before switching"
            />
            <Input
              label="Minimum dwell (ms)"
              type="number"
              value={formParams.min_dwell_ms ?? 5000}
              onChange={(e) =>
                setFormParams({ ...formParams, min_dwell_ms: Number(e.target.value) })
              }
              helperText="Minimum time route must stay pinned after a flip"
            />
            <Input
              label="Max hops"
              type="number"
              value={formParams.max_hops ?? 3}
              onChange={(e) =>
                setFormParams({ ...formParams, max_hops: Number(e.target.value) })
              }
              helperText="Maximum allowed links on an overlay path"
            />
            <Input
              label="Relay overhead (ms)"
              type="number"
              value={formParams.relay_overhead_ms ?? 1}
              onChange={(e) =>
                setFormParams({ ...formParams, relay_overhead_ms: Number(e.target.value) })
              }
              helperText="Virtual cost added per intermediate relay"
            />
            <Input
              label="Loss penalty (ms/%)"
              type="number"
              value={formParams.loss_penalty_ms_per_pct ?? 20}
              onChange={(e) =>
                setFormParams({
                  ...formParams,
                  loss_penalty_ms_per_pct: Number(e.target.value),
                })
              }
              helperText="Milliseconds of virtual cost added per 1% loss"
            />
          </div>
        </Card>

        {/* Prober & LSA timers */}
        <Card variant="content">
          <h3 className="text-display-sub-sm text-ink font-semibold mb-lg">Prober & LSA timers</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-lg">
            <Input
              label="EWMA alpha"
              type="number"
              step="0.05"
              value={formParams.alpha ?? 0.2}
              onChange={(e) =>
                setFormParams({ ...formParams, alpha: Number(e.target.value) })
              }
              helperText="Weight of newest RTT sample in smoothed average"
            />
            <Input
              label="Probe interval (ms)"
              type="number"
              value={formParams.probe_interval_ms ?? 500}
              onChange={(e) =>
                setFormParams({ ...formParams, probe_interval_ms: Number(e.target.value) })
              }
              helperText="How often PING probes are sent to each peer"
            />
            <Input
              label="Probe timeout (ms)"
              type="number"
              value={formParams.probe_timeout_ms ?? 1000}
              onChange={(e) =>
                setFormParams({ ...formParams, probe_timeout_ms: Number(e.target.value) })
              }
              helperText="Deadline before an inflight probe counts as lost"
            />
            <Input
              label="Down after misses"
              type="number"
              value={formParams.down_after_misses ?? 4}
              onChange={(e) =>
                setFormParams({ ...formParams, down_after_misses: Number(e.target.value) })
              }
              helperText="Consecutive missed probes before link is marked down"
            />
            <Input
              label="Up after hits"
              type="number"
              value={formParams.up_after_hits ?? 2}
              onChange={(e) =>
                setFormParams({ ...formParams, up_after_hits: Number(e.target.value) })
              }
              helperText="Consecutive successful probes before link comes up"
            />
            <Input
              label="LSA interval (ms)"
              type="number"
              value={formParams.lsa_interval_ms ?? 2000}
              onChange={(e) =>
                setFormParams({ ...formParams, lsa_interval_ms: Number(e.target.value) })
              }
              helperText="Periodic link-state advertisement flood frequency"
            />
          </div>
        </Card>

        {/* Action Buttons */}
        <div className="flex items-center justify-between">
          <Button type="button" variant="text" onClick={handleResetDefaults}>
            Reset to defaults
          </Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save parameters'}
          </Button>
        </div>
      </form>

      {/* Read-Only Node Info Section (PRD 18.7.6) */}
      <Card variant="outline">
        <h3 className="text-display-sub-sm text-ink font-semibold mb-md">Daemon environment</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-md text-body-sm">
          <div>
            <span className="text-caption text-body block">Gateway Node</span>
            <span className="font-semibold text-ink font-mono">{selfNode}</span>
          </div>
          <div>
            <span className="text-caption text-body block">Operating Mode</span>
            <span className="font-semibold text-ink uppercase">{mode}</span>
          </div>
          <div>
            <span className="text-caption text-body block">Build Version</span>
            <span className="font-semibold text-ink">0.1.0-sim</span>
          </div>
          <div>
            <span className="text-caption text-body block">Control API Address</span>
            <span className="font-semibold text-ink font-mono">127.0.0.1:8080</span>
          </div>
        </div>
      </Card>
    </div>
  );
};
