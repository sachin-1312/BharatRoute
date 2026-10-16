import React from 'react';
import { useStore } from '../../store/useStore';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { api } from '../../lib/api';

export const NavBar: React.FC = () => {
  const mode = useStore((state) => state.mode);
  const connStatus = useStore((state) => state.connStatus);

  const handleExportProbes = () => {
    window.open(api.exportProbesUrl, '_blank');
  };

  const statusDisplay = {
    connected: { text: 'Connected', dot: 'bg-ink' },
    connecting: { text: 'Connecting…', dot: 'bg-body-mid animate-pulse' },
    reconnecting: { text: 'Reconnecting…', dot: 'bg-primary animate-pulse' },
    disconnected: { text: 'Offline', dot: 'bg-body-mid' },
  }[connStatus];

  return (
    <header className="sticky top-0 z-40 bg-canvas border-b border-mute/50 px-xl py-md">
      <div className="max-w-container mx-auto flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-md">
          <div className="flex items-center gap-xs">
            <span className="w-3 h-3 bg-primary rounded-xxs inline-block" />
            <span className="font-display font-medium text-display-xs text-ink tracking-tight">
              BharatRoute
            </span>
          </div>

          <Badge variant={mode === 'sim' ? 'simulated' : 'default'}>
            {mode === 'sim' ? 'Simulated' : 'Live'}
          </Badge>
        </div>

        {/* Right side controls */}
        <div className="flex items-center gap-lg">
          <div className="flex items-center gap-xs text-body-sm text-body">
            <span className={`w-2 h-2 rounded-full inline-block ${statusDisplay.dot}`} />
            <span>{statusDisplay.text}</span>
          </div>

          <Button
            variant="tertiary"
            size="sm"
            onClick={handleExportProbes}
            title="Download CSV export of probes"
          >
            Export CSV
          </Button>
        </div>
      </div>
    </header>
  );
};
