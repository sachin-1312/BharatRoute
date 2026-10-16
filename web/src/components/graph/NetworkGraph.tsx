import React, { useState } from 'react';
import { useStore } from '../../store/useStore';
import type { NodeInfo, LinkInfo } from '../../lib/types';

interface Point {
  x: number;
  y: number;
}

export const NetworkGraph: React.FC = () => {
  const nodes = useStore((state) => state.nodes);
  const links = useStore((state) => state.links);
  const routes = useStore((state) => state.routes);
  const activeDst = useStore((state) => state.activeDst);
  const setActiveDst = useStore((state) => state.setActiveDst);

  const [hoveredLink, setHoveredLink] = useState<LinkInfo | null>(null);

  // Active route for current destination
  const activeRoute = routes.find((r) => r.dst === activeDst)?.active;
  const activePath = activeRoute ? activeRoute.path : [];

  // Identify source node (role: 'edge', default 1)
  const sourceNode = nodes.find((n) => n.role === 'edge') || nodes[0];
  const sourceId = sourceNode ? sourceNode.id : 1;

  // Coordinate scaling: viewBox 0 0 1000 600, padding 60
  const getCoords = (pos: { x: number; y: number }): Point => {
    const pad = 70;
    const width = 1000 - pad * 2;
    const height = 600 - pad * 2;
    return {
      x: pad + pos.x * width,
      y: pad + pos.y * height,
    };
  };

  const nodeMap = new Map<number, NodeInfo>();
  nodes.forEach((n) => nodeMap.set(n.id, n));

  // Determine if a link is on the active path
  const isLinkOnActivePath = (a: number, b: number) => {
    if (activePath.length < 2) return false;
    for (let i = 0; i < activePath.length - 1; i++) {
      if (
        (activePath[i] === a && activePath[i + 1] === b) ||
        (activePath[i] === b && activePath[i + 1] === a)
      ) {
        return true;
      }
    }
    return false;
  };

  // Check if link is direct path between source and active destination
  const isDirectPath = (a: number, b: number) => {
    return (
      (a === sourceId && b === activeDst) ||
      (b === sourceId && a === activeDst)
    );
  };

  return (
    <div className="relative bg-canvas-soft rounded-md p-xl border border-mute/30">
      <div className="flex items-center justify-between mb-md">
        <div>
          <h2 className="text-display-sub-sm text-ink font-semibold">Network topology</h2>
          <p className="text-body-sm text-body">
            Real-time link status and source-routed overlay path
          </p>
        </div>
      </div>

      <div className="relative w-full aspect-[5/3] bg-canvas rounded-md border border-mute/40 overflow-hidden shadow-sm">
        <svg
          viewBox="0 0 1000 600"
          className="w-full h-full select-none"
          role="img"
          aria-label={`Network graph showing active path: ${activePath.join(' → ')}`}
        >
          <defs>
            <linearGradient id="link-active-grad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#ff4f00" />
              <stop offset="100%" stopColor="#e64700" />
            </linearGradient>
          </defs>

          {/* Render links */}
          {links.map((link) => {
            const na = nodeMap.get(link.a);
            const nb = nodeMap.get(link.b);
            if (!na || !nb) return null;

            const pa = getCoords(na.pos);
            const pb = getCoords(nb.pos);
            const midX = (pa.x + pb.x) / 2;
            const midY = (pa.y + pb.y) / 2;

            const onActive = isLinkOnActivePath(link.a, link.b);
            const isDirect = isDirectPath(link.a, link.b);
            const isDown = link.state === 'down';
            const isDegraded = !isDown && (link.loss_pct > 2 || link.rtt_ms > 120);

            let strokeColor = '#c5c0b1'; // default mute
            let strokeWidth = 2;
            let strokeDasharray = 'none';

            if (onActive) {
              strokeColor = '#ff4f00';
              strokeWidth = 4.5;
            } else if (isDirect) {
              strokeColor = '#201515';
              strokeWidth = 2.5;
              strokeDasharray = '6 4';
            } else if (isDown) {
              strokeColor = '#c5c0b1';
              strokeWidth = 1.5;
              strokeDasharray = '3 4';
            } else if (isDegraded) {
              strokeColor = '#36342e';
              strokeWidth = 2.5;
            }

            return (
              <g
                key={`link-${link.a}-${link.b}`}
                className="cursor-pointer group"
                onMouseEnter={() => setHoveredLink(link)}
                onMouseLeave={() => setHoveredLink(null)}
              >
                {/* Hit target line */}
                <line
                  x1={pa.x}
                  y1={pa.y}
                  x2={pb.x}
                  y2={pb.y}
                  stroke="transparent"
                  strokeWidth={18}
                />

                {/* Visible line */}
                <line
                  x1={pa.x}
                  y1={pa.y}
                  x2={pb.x}
                  y2={pb.y}
                  stroke={strokeColor}
                  strokeWidth={strokeWidth}
                  strokeDasharray={strokeDasharray}
                  strokeLinecap="round"
                />

                {/* Degraded warning dot or Down mark */}
                {isDegraded && (
                  <circle cx={midX} cy={midY} r={5} fill="#ff4f00" stroke="#fffefb" strokeWidth={1.5} />
                )}
                {isDown && (
                  <text
                    x={midX}
                    y={midY + 4}
                    textAnchor="middle"
                    fill="#201515"
                    fontSize="14"
                    fontWeight="bold"
                  >
                    ×
                  </text>
                )}

                {/* RTT Badge Chip on Link */}
                {!isDown && (
                  <g transform={`translate(${midX}, ${midY})`}>
                    <rect
                      x="-24"
                      y="-11"
                      width="48"
                      height="22"
                      rx="6"
                      fill="#fffefb"
                      stroke={onActive ? '#ff4f00' : '#c5c0b1'}
                      strokeWidth={onActive ? '2' : '1'}
                      className="shadow-sm"
                    />
                    <text
                      y="4"
                      textAnchor="middle"
                      fill="#201515"
                      fontSize="11"
                      fontWeight={onActive ? 'bold' : 'normal'}
                      fontFamily="Inter, sans-serif"
                    >
                      {link.rtt_ms > 0 ? `${Math.round(link.rtt_ms)}ms` : '—'}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* Render animated packet pulses along active path */}
          {activePath.length > 1 && (
            <g>
              {activePath.slice(0, -1).map((nodeId, idx) => {
                const nextId = activePath[idx + 1];
                const na = nodeMap.get(nodeId);
                const nb = nodeMap.get(nextId);
                if (!na || !nb) return null;
                const pa = getCoords(na.pos);
                const pb = getCoords(nb.pos);

                return (
                  <circle key={`packet-${nodeId}-${nextId}`} r={4.5} fill="#ff4f00">
                    <animate
                      attributeName="cx"
                      from={pa.x}
                      to={pb.x}
                      dur="1.6s"
                      repeatCount="indefinite"
                    />
                    <animate
                      attributeName="cy"
                      from={pa.y}
                      to={pb.y}
                      dur="1.6s"
                      repeatCount="indefinite"
                    />
                  </circle>
                );
              })}
            </g>
          )}

          {/* Render nodes */}
          {nodes.map((node) => {
            const pt = getCoords(node.pos);
            const isSource = node.role === 'edge';
            const isExit = node.role === 'exit';
            const isSelected = activeDst === node.id;
            const onActiveRoute = activePath.includes(node.id);
            const isDown = node.state === 'down';

            return (
              <g
                key={`node-${node.id}`}
                tabIndex={0}
                className="cursor-pointer focus:outline-none"
                onClick={() => {
                  if (node.id !== sourceId) {
                    setActiveDst(node.id);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && node.id !== sourceId) {
                    setActiveDst(node.id);
                  }
                }}
              >
                {/* Outer ring for Exit nodes */}
                {isExit && (
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={28}
                    fill="none"
                    stroke="#201515"
                    strokeWidth={isSelected ? 2.5 : 1.5}
                    strokeDasharray={isDown ? '4 3' : 'none'}
                  />
                )}

                {/* Orange ring for nodes on active path */}
                {onActiveRoute && (
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={isExit ? 33 : 27}
                    fill="none"
                    stroke="#ff4f00"
                    strokeWidth={3}
                  />
                )}

                {/* Main Node Circle */}
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={22}
                  fill={isDown ? '#f8f4f0' : isSource ? '#201515' : '#fffefb'}
                  stroke={isDown ? '#c5c0b1' : '#201515'}
                  strokeWidth={2}
                  strokeDasharray={isDown ? '3 3' : 'none'}
                  className="transition-transform duration-150 hover:scale-105"
                />

                {/* Label inside circle */}
                <text
                  x={pt.x}
                  y={pt.y + 4}
                  textAnchor="middle"
                  fill={isSource ? '#fffefb' : '#201515'}
                  fontSize="12"
                  fontWeight="bold"
                  fontFamily="Inter, sans-serif"
                >
                  {isDown ? '×' : node.name}
                </text>

                {/* Text below node: Short name + City label */}
                <text
                  x={pt.x}
                  y={pt.y + (isExit ? 48 : 42)}
                  textAnchor="middle"
                  fill="#201515"
                  fontSize="14"
                  fontWeight="600"
                  fontFamily="Inter, sans-serif"
                >
                  {node.name}
                </text>
                <text
                  x={pt.x}
                  y={pt.y + (isExit ? 62 : 56)}
                  textAnchor="middle"
                  fill="#605d52"
                  fontSize="12"
                  fontFamily="Inter, sans-serif"
                >
                  {node.label}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Floating tooltip for hovered link */}
        {hoveredLink && (
          <div className="absolute top-4 right-4 bg-canvas text-ink rounded-md p-md border border-mute shadow-toast text-caption flex flex-col gap-xxs pointer-events-none z-20">
            <span className="font-semibold text-ink text-body-sm">
              Link: {nodeMap.get(hoveredLink.a)?.name} ↔ {nodeMap.get(hoveredLink.b)?.name}
            </span>
            <div className="flex justify-between gap-lg">
              <span className="text-body">RTT:</span>
              <span className="font-semibold tabular-nums">{hoveredLink.rtt_ms.toFixed(1)} ms</span>
            </div>
            <div className="flex justify-between gap-lg">
              <span className="text-body">Loss:</span>
              <span className="font-semibold tabular-nums">{hoveredLink.loss_pct.toFixed(1)}%</span>
            </div>
            <div className="flex justify-between gap-lg">
              <span className="text-body">Jitter:</span>
              <span className="font-semibold tabular-nums">{hoveredLink.jitter_ms.toFixed(1)} ms</span>
            </div>
            <div className="flex justify-between gap-lg">
              <span className="text-body">State:</span>
              <span className="font-semibold capitalize">{hoveredLink.state}</span>
            </div>
          </div>
        )}
      </div>

      {/* Legend below graph per PRD 18.8 */}
      <div className="flex flex-wrap items-center justify-center gap-xl mt-lg pt-md border-t border-mute/30 text-caption text-body">
        <div className="flex items-center gap-xs">
          <span className="w-5 h-[4px] bg-primary rounded-pill inline-block" />
          <span>Active overlay path</span>
        </div>
        <div className="flex items-center gap-xs">
          <span className="w-5 h-[2px] border-b-2 border-dashed border-ink inline-block" />
          <span>Direct path</span>
        </div>
        <div className="flex items-center gap-xs">
          <span className="w-5 h-[2px] bg-mute inline-block" />
          <span>Available link</span>
        </div>
        <div className="flex items-center gap-xs">
          <span className="w-5 h-[2px] border-b-2 border-dotted border-mute inline-block" />
          <span>Degraded / Down (×)</span>
        </div>
      </div>
    </div>
  );
};
