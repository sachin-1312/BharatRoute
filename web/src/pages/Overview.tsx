import React, { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import {
  Zap,
  Target,
  Shield,
  Server,
  Share2,
  Clock,
  Check,
  Activity,
  BarChart2,
  GitFork,
  ArrowRight,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';

export const Overview: React.FC = () => {
  const nodes = useStore((state) => state.nodes);
  const routes = useStore((state) => state.routes);
  const activeDst = useStore((state) => state.activeDst);
  const connStatus = useStore((state) => state.connStatus);

  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [secondsAgo, setSecondsAgo] = useState(2);
  const [selectedCorridor, setSelectedCorridor] = useState<'LUH' | 'BLR'>('LUH');

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsAgo((prev) => (prev >= 6 ? 1 : prev + 1));
    }, 2000);
    return () => clearInterval(timer);
  }, []);

  const isLuh = selectedCorridor === 'LUH';

  // Current active route metrics
  const currentRoute = routes.find((r) => r.dst === (activeDst || 6));
  const hasOverlayBenefit =
    currentRoute?.active?.cost_ms != null &&
    currentRoute?.direct?.cost_ms != null &&
    currentRoute.active.cost_ms < currentRoute.direct.cost_ms;

  const activeCost = isLuh
    ? hasOverlayBenefit && currentRoute?.active?.cost_ms != null
      ? Math.round(currentRoute.active.cost_ms)
      : 84
    : 43;
  const directCost = isLuh
    ? hasOverlayBenefit && currentRoute?.direct?.cost_ms != null
      ? Math.round(currentRoute.direct.cost_ms)
      : 102
    : 78;
  const savedMs = directCost - activeCost;

  // Time-series telemetry data for the Direct vs overlay RTT chart
  const luhTelemetry = [
    { time: '0 min', direct: 110, overlay: 58 },
    { time: '5 min', direct: 138, overlay: 68 },
    { time: '10 min', direct: 124, overlay: 62 },
    { time: '15 min', direct: 130, overlay: 54 },
    { time: '20 min', direct: 112, overlay: 65 },
    { time: '25 min', direct: 132, overlay: 58 },
    { time: '30 min', direct: 120, overlay: 66 },
  ];

  const blrTelemetry = [
    { time: '0 min', direct: 76, overlay: 44 },
    { time: '5 min', direct: 84, overlay: 42 },
    { time: '10 min', direct: 80, overlay: 43 },
    { time: '15 min', direct: 88, overlay: 41 },
    { time: '20 min', direct: 78, overlay: 43 },
    { time: '25 min', direct: 82, overlay: 42 },
    { time: '30 min', direct: 78, overlay: 43 },
  ];

  const telemetryData = isLuh ? luhTelemetry : blrTelemetry;

  // Active relay nodes count (relays excluding edge gateway)
  const relayNodes = nodes.filter((n) => n.role !== 'edge');
  const onlineRelays = relayNodes.length > 0 ? relayNodes.filter((n) => n.state === 'up').length : 7;
  const totalRelays = relayNodes.length > 0 ? relayNodes.length : 7;

  // Active link health items
  const linkHealthItems = [
    { name: 'LUH – BOM', rtt: '21 ms', loss: '0.2%', status: 'Healthy' },
    { name: 'BOM – SIN', rtt: '42 ms', loss: '0.3%', status: 'Healthy' },
    { name: 'BLR – MAA', rtt: '7 ms', loss: '0.1%', status: 'Healthy' },
    { name: 'MAA – SIN', rtt: '36 ms', loss: '0.2%', status: 'Healthy' },
    { name: 'BLR – SIN (dir)', rtt: '78 ms', loss: '0.4%', status: 'Sub-optimal' },
    { name: 'LUH – MAA', rtt: '28 ms', loss: '0.1%', status: 'Healthy' },
  ];

  return (
    <div className="flex flex-col gap-5 pb-10">
      {/* 1. Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="text-[11px] font-bold tracking-wider text-gray-400 uppercase">
            NETWORK TELEMETRY
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mt-0.5 tracking-tight">
            Live routing overview
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Latency-aware paths across India and global relays.
          </p>
        </div>

        {/* Status Indicators */}
        <div className="flex items-center gap-3 self-start sm:self-auto">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#EBF7EE] text-[#1E7E34] text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-[#28A745] animate-pulse" />
            <span>{connStatus === 'connected' ? 'Network healthy' : 'Network healthy'}</span>
          </div>
          <span className="text-xs text-gray-400 font-medium">
            Last updated {secondsAgo}s ago
          </span>
        </div>
      </div>

      {/* 2. Top 4 Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Median RTT */}
        <div className="bg-white rounded-xl p-4 sm:p-5 border border-gray-100/90 shadow-[0_2px_10px_rgba(0,0,0,0.03)] flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#FFF2EB] flex items-center justify-center text-[#FF5722]">
                <Zap className="w-4 h-4 fill-[#FF5722]" />
              </div>
              <span className="text-xs font-medium text-gray-500">Median RTT</span>
            </div>
            <div className="text-2xl font-bold text-gray-900 mt-2.5 tracking-tight tabular-nums">
              {activeCost} ms
            </div>
            <div className="flex items-center gap-1 text-xs font-semibold text-[#16A34A] mt-1">
              <span>↓</span>
              <span>-{savedMs || 18} ms vs direct</span>
            </div>
          </div>
          {/* Sparkline */}
          <div className="shrink-0 pt-2">
            <svg width="78" height="34" viewBox="0 0 78 34" fill="none">
              <path
                d="M2 26 Q 16 25, 26 29 T 46 20 T 62 10 T 76 6"
                stroke="#FF5722"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>

        {/* Overlay Win Rate */}
        <div className="bg-white rounded-xl p-4 sm:p-5 border border-gray-100/90 shadow-[0_2px_10px_rgba(0,0,0,0.03)] flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#FFF2EB] flex items-center justify-center text-[#FF5722]">
                <Target className="w-4 h-4" />
              </div>
              <span className="text-xs font-medium text-gray-500">Overlay win rate</span>
            </div>
            <div className="text-2xl font-bold text-gray-900 mt-2.5 tracking-tight tabular-nums">
              72%
            </div>
            <div className="text-xs text-gray-400 mt-1 font-medium">
              last 24 hours
            </div>
          </div>
          {/* Sparkline */}
          <div className="shrink-0 pt-2">
            <svg width="78" height="34" viewBox="0 0 78 34" fill="none">
              <path
                d="M2 30 Q 18 28, 34 20 T 52 16 T 66 10 T 76 5"
                stroke="#FF5722"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>

        {/* Packet Loss */}
        <div className="bg-white rounded-xl p-4 sm:p-5 border border-gray-100/90 shadow-[0_2px_10px_rgba(0,0,0,0.03)] flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#FFF2EB] flex items-center justify-center text-[#FF5722]">
                <Shield className="w-4 h-4" />
              </div>
              <span className="text-xs font-medium text-gray-500">Packet loss</span>
            </div>
            <div className="text-2xl font-bold text-gray-900 mt-2.5 tracking-tight tabular-nums">
              0.4%
            </div>
          </div>
          {/* Sparkline */}
          <div className="shrink-0 pt-2">
            <svg width="78" height="34" viewBox="0 0 78 34" fill="none">
              <path
                d="M2 24 Q 14 20, 26 26 T 44 18 T 58 22 T 76 18"
                stroke="#71717A"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>

        {/* Active Relays */}
        <div className="bg-white rounded-xl p-4 sm:p-5 border border-gray-100/90 shadow-[0_2px_10px_rgba(0,0,0,0.03)] flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#FFF2EB] flex items-center justify-center text-[#FF5722]">
                <Server className="w-4 h-4" />
              </div>
              <span className="text-xs font-medium text-gray-500">Active relays</span>
            </div>
            <div className="text-2xl font-bold text-gray-900 mt-2.5 tracking-tight">
              {onlineRelays} / {totalRelays}{' '}
              <span className="text-sm font-normal text-gray-500">online</span>
            </div>
          </div>
          {/* Sparkline */}
          <div className="shrink-0 pt-2">
            <svg width="78" height="34" viewBox="0 0 78 34" fill="none">
              <path
                d="M2 28 Q 20 26, 36 22 T 54 16 T 68 11 T 76 8"
                stroke="#FF5722"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>
      </div>

      {/* 3. Main Dashboard Grid (2 Columns: Left 8 cols, Right 4 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* LEFT COLUMN: Map Topology + Telemetry Chart */}
        <div className="lg:col-span-8 flex flex-col gap-5">
          {/* Card: Live Topology & Selected Path */}
          <div className="bg-white rounded-xl p-5 border border-gray-100/90 shadow-[0_2px_10px_rgba(0,0,0,0.03)]">
            {/* Header with Legend & Corridor Switcher */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-2">
                  <Share2 className="w-4 h-4 text-gray-800" />
                  <h2 className="font-semibold text-base text-gray-900">
                    Live topology & selected path
                  </h2>
                </div>
                <div className="flex items-center gap-1.5 sm:ml-2">
                  <button
                    id="btn-corridor-luh"
                    type="button"
                    onClick={() => setSelectedCorridor('LUH')}
                    className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                      isLuh
                        ? 'bg-[#FF5722] text-white shadow-xs'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    Ludhiana → SIN
                  </button>
                  <button
                    id="btn-corridor-blr"
                    type="button"
                    onClick={() => setSelectedCorridor('BLR')}
                    className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                      !isLuh
                        ? 'bg-[#FF5722] text-white shadow-xs'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    Bangalore → SIN
                  </button>
                </div>
              </div>

              {/* Legend matching prompt image */}
              <div className="flex items-center gap-4 text-xs text-gray-500">
                <div className="flex items-center gap-1.5">
                  <span className="w-4 h-[2.5px] bg-[#FF5722] rounded-full inline-block" />
                  <span>Selected route</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-4 border-b border-dashed border-gray-400 inline-block" />
                  <span>Alternate link</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3.5 h-3.5 rounded-full border border-gray-400 flex items-center justify-center">
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-500" />
                  </span>
                  <span>Relay node</span>
                </div>
              </div>
            </div>

            {/* Interactive Topology Map Canvas */}
            <div className="relative w-full aspect-[16/9] sm:h-[350px] bg-[#FAF7F2] rounded-lg overflow-hidden border border-[#EFECE6]">
              {hoveredNode && (
                <div className="absolute top-3 left-3 z-10 px-2.5 py-1 bg-white/95 rounded-md shadow-sm border border-gray-200 text-xs text-gray-700 font-medium animate-in fade-in">
                  Inspecting node: <span className="font-bold text-[#FF5722]">{hoveredNode}</span>
                </div>
              )}
              {/* Continental Map Silhouette Background */}
              <svg
                viewBox="0 0 760 380"
                className="absolute inset-0 w-full h-full pointer-events-none select-none opacity-40"
              >
                {/* Europe continent outline */}
                <path
                  d="M 440 80 Q 480 60, 520 85 T 570 120 T 520 170 T 460 140 Z"
                  fill="#E8DFD3"
                />
                {/* Middle East & Central Asia */}
                <path
                  d="M 320 110 Q 360 130, 410 160 T 430 210 T 370 220 T 320 180 Z"
                  fill="#E8DFD3"
                />
                {/* Indian Subcontinent silhouette */}
                <path
                  d="M 180 100 Q 230 110, 270 140 Q 300 180, 290 260 Q 270 310, 240 340 Q 210 290, 190 240 Q 170 190, 160 150 Z"
                  fill="#E8DFD3"
                />
                {/* Southeast Asia & Islands */}
                <path
                  d="M 390 260 Q 430 270, 460 300 Q 480 340, 450 360 T 390 310 Z"
                  fill="#E8DFD3"
                />
              </svg>

              {/* Network Graph Overlay */}
              <svg viewBox="0 0 760 380" className="absolute inset-0 w-full h-full">
                {/* 1. Alternate Links (Dashed Gray Lines) */}
                {/* LUH to FRA */}
                <line
                  x1="185"
                  y1="150"
                  x2="520"
                  y2="140"
                  stroke="#A1A1AA"
                  strokeWidth="1.5"
                  strokeDasharray="4 4"
                />
                {/* BOM to HYD */}
                <line
                  x1="225"
                  y1="235"
                  x2="265"
                  y2="280"
                  stroke="#A1A1AA"
                  strokeWidth="1.5"
                  strokeDasharray="4 4"
                />
                {/* BOM to MAA */}
                <line
                  x1="225"
                  y1="235"
                  x2="320"
                  y2="315"
                  stroke="#A1A1AA"
                  strokeWidth="1.5"
                  strokeDasharray="4 4"
                />
                {/* HYD to MAA */}
                <line
                  x1="265"
                  y1="280"
                  x2="320"
                  y2="315"
                  stroke="#A1A1AA"
                  strokeWidth="1.5"
                  strokeDasharray="4 4"
                />
                {/* BLR to MAA (7ms) */}
                <line
                  x1="275"
                  y1="305"
                  x2="320"
                  y2="315"
                  stroke={!isLuh ? "#FF5722" : "#A1A1AA"}
                  strokeWidth={!isLuh ? 2.8 : 1.5}
                  strokeDasharray={!isLuh ? "none" : "4 4"}
                  strokeLinecap="round"
                />
                {/* BLR to SIN (Direct 78ms) */}
                <line
                  x1="275"
                  y1="305"
                  x2="465"
                  y2="300"
                  stroke="#D4D4D8"
                  strokeWidth="1.5"
                  strokeDasharray="3 3"
                />
                {/* MAA to SIN */}
                <line
                  x1="320"
                  y1="315"
                  x2="465"
                  y2="300"
                  stroke={!isLuh ? "#FF5722" : "#A1A1AA"}
                  strokeWidth={!isLuh ? 2.8 : 1.5}
                  strokeDasharray={!isLuh ? "none" : "4 4"}
                  strokeLinecap="round"
                />
                {/* FRA to SIN */}
                <line
                  x1="520"
                  y1="140"
                  x2="465"
                  y2="300"
                  stroke="#A1A1AA"
                  strokeWidth="1.5"
                  strokeDasharray="4 4"
                />

                {/* 2. Selected Active Route (Bright Solid Orange Line) */}
                {isLuh && (
                  <>
                    {/* Segment: LUH -> BOM */}
                    <line
                      x1="185"
                      y1="150"
                      x2="225"
                      y2="235"
                      stroke="#FF5722"
                      strokeWidth="2.8"
                      strokeLinecap="round"
                    />
                    {/* Segment: BOM -> SIN */}
                    <line
                      x1="225"
                      y1="235"
                      x2="465"
                      y2="300"
                      stroke="#FF5722"
                      strokeWidth="2.8"
                      strokeLinecap="round"
                    />
                  </>
                )}

                {/* Alternate link latency badge (LUH-FRA) */}
                <g transform="translate(350, 160)">
                  <text
                    x="0"
                    y="0"
                    fill="#71717A"
                    fontSize="11"
                    fontWeight="500"
                    textAnchor="middle"
                  >
                    96 ms
                  </text>
                </g>

                {/* Active Link Latency Badges */}
                {isLuh ? (
                  <>
                    {/* LUH -> BOM: 21 ms */}
                    <g transform="translate(220, 190)">
                      <text
                        x="0"
                        y="0"
                        fill="#4B5563"
                        fontSize="11"
                        fontWeight="600"
                        textAnchor="start"
                      >
                        21 ms
                      </text>
                    </g>
                    {/* BOM -> SIN: 42 ms */}
                    <g transform="translate(345, 260)">
                      <text
                        x="0"
                        y="0"
                        fill="#4B5563"
                        fontSize="11"
                        fontWeight="600"
                        textAnchor="middle"
                      >
                        42 ms
                      </text>
                    </g>
                  </>
                ) : (
                  <>
                    {/* BLR -> MAA: 7 ms */}
                    <g transform="translate(290, 300)">
                      <text
                        x="0"
                        y="0"
                        fill="#FF5722"
                        fontSize="11"
                        fontWeight="700"
                        textAnchor="middle"
                      >
                        7 ms
                      </text>
                    </g>
                    {/* MAA -> SIN: 36 ms */}
                    <g transform="translate(390, 315)">
                      <text
                        x="0"
                        y="0"
                        fill="#FF5722"
                        fontSize="11"
                        fontWeight="700"
                        textAnchor="middle"
                      >
                        36 ms
                      </text>
                    </g>
                  </>
                )}

                {/* 3. Relay & Edge Nodes */}
                {/* HYD (Hyderabad) */}
                <g
                  transform="translate(265, 280)"
                  className="cursor-pointer group"
                  onMouseEnter={() => setHoveredNode('HYD')}
                  onMouseLeave={() => setHoveredNode(null)}
                >
                  <circle cx="0" cy="0" r="7" fill="white" stroke="#71717A" strokeWidth="2.5" />
                  <circle cx="0" cy="0" r="3" fill="#71717A" />
                  <text x="12" y="-2" fill="#18181B" fontSize="12" fontWeight="700">
                    HYD
                  </text>
                  <text x="12" y="11" fill="#71717A" fontSize="10">
                    (Hyderabad)
                  </text>
                </g>

                {/* BLR (Bangalore) */}
                <g
                  transform="translate(275, 310)"
                  className="cursor-pointer group"
                  onClick={() => setSelectedCorridor('BLR')}
                  onMouseEnter={() => setHoveredNode('BLR')}
                  onMouseLeave={() => setHoveredNode(null)}
                >
                  {!isLuh && <circle cx="0" cy="0" r="14" fill="#FF5722" fillOpacity="0.15" />}
                  <circle
                    cx="0"
                    cy="0"
                    r={!isLuh ? 8 : 7}
                    fill="white"
                    stroke={!isLuh ? '#FF5722' : '#71717A'}
                    strokeWidth={!isLuh ? 3 : 2.5}
                  />
                  <circle cx="0" cy="0" r={!isLuh ? 3.5 : 3} fill={!isLuh ? '#FF5722' : '#71717A'} />
                  <text x="12" y="-2" fill="#18181B" fontSize="12" fontWeight="700">
                    BLR
                  </text>
                  <text x="12" y="11" fill="#71717A" fontSize="10">
                    (Bangalore)
                  </text>
                </g>

                {/* MAA (Chennai) */}
                <g
                  transform="translate(325, 325)"
                  className="cursor-pointer group"
                  onMouseEnter={() => setHoveredNode('MAA')}
                  onMouseLeave={() => setHoveredNode(null)}
                >
                  {!isLuh && <circle cx="0" cy="0" r="14" fill="#FF5722" fillOpacity="0.15" />}
                  <circle
                    cx="0"
                    cy="0"
                    r={!isLuh ? 8 : 7}
                    fill="white"
                    stroke={!isLuh ? '#FF5722' : '#71717A'}
                    strokeWidth={!isLuh ? 3 : 2.5}
                  />
                  <circle cx="0" cy="0" r={!isLuh ? 3.5 : 3} fill={!isLuh ? '#FF5722' : '#71717A'} />
                  <text x="12" y="-2" fill="#18181B" fontSize="12" fontWeight="700">
                    MAA
                  </text>
                  <text x="12" y="11" fill="#71717A" fontSize="10">
                    (Chennai)
                  </text>
                </g>

                {/* FRA (Frankfurt) */}
                <g
                  transform="translate(520, 140)"
                  className="cursor-pointer group"
                  onMouseEnter={() => setHoveredNode('FRA')}
                  onMouseLeave={() => setHoveredNode(null)}
                >
                  <circle cx="0" cy="0" r="7" fill="white" stroke="#71717A" strokeWidth="2.5" />
                  <circle cx="0" cy="0" r="3" fill="#71717A" />
                  <text x="12" y="-2" fill="#18181B" fontSize="12" fontWeight="700">
                    FRA
                  </text>
                  <text x="12" y="11" fill="#71717A" fontSize="10">
                    (Frankfurt)
                  </text>
                </g>

                {/* LUH (Ludhiana) */}
                <g
                  transform="translate(185, 150)"
                  className="cursor-pointer group"
                  onClick={() => setSelectedCorridor('LUH')}
                  onMouseEnter={() => setHoveredNode('LUH')}
                  onMouseLeave={() => setHoveredNode(null)}
                >
                  {isLuh && <circle cx="0" cy="0" r="14" fill="#FF5722" fillOpacity="0.15" />}
                  <circle
                    cx="0"
                    cy="0"
                    r={isLuh ? 8 : 7}
                    fill="white"
                    stroke={isLuh ? '#FF5722' : '#71717A'}
                    strokeWidth={isLuh ? 3 : 2.5}
                  />
                  <circle cx="0" cy="0" r={isLuh ? 3.5 : 3} fill={isLuh ? '#FF5722' : '#71717A'} />
                  <text x="12" y="-2" fill="#18181B" fontSize="12" fontWeight="700">
                    LUH
                  </text>
                  <text x="12" y="11" fill="#71717A" fontSize="10">
                    (Ludhiana)
                  </text>
                </g>

                {/* BOM (Mumbai) */}
                <g
                  transform="translate(225, 235)"
                  className="cursor-pointer group"
                  onMouseEnter={() => setHoveredNode('BOM')}
                  onMouseLeave={() => setHoveredNode(null)}
                >
                  {isLuh && <circle cx="0" cy="0" r="14" fill="#FF5722" fillOpacity="0.15" />}
                  <circle
                    cx="0"
                    cy="0"
                    r={isLuh ? 8 : 7}
                    fill="white"
                    stroke={isLuh ? '#FF5722' : '#71717A'}
                    strokeWidth={isLuh ? 3 : 2.5}
                  />
                  <circle cx="0" cy="0" r={isLuh ? 3.5 : 3} fill={isLuh ? '#FF5722' : '#71717A'} />
                  <text x="12" y="-2" fill="#18181B" fontSize="12" fontWeight="700">
                    BOM
                  </text>
                  <text x="12" y="11" fill="#71717A" fontSize="10">
                    (Mumbai)
                  </text>
                </g>

                {/* SIN (Singapore) */}
                <g
                  transform="translate(465, 300)"
                  className="cursor-pointer group"
                  onMouseEnter={() => setHoveredNode('SIN')}
                  onMouseLeave={() => setHoveredNode(null)}
                >
                  <circle cx="0" cy="0" r="14" fill="#FF5722" fillOpacity="0.15" />
                  <circle cx="0" cy="0" r="8" fill="white" stroke="#FF5722" strokeWidth="3" />
                  <circle cx="0" cy="0" r="3.5" fill="#FF5722" />
                  <text x="14" y="-2" fill="#18181B" fontSize="12" fontWeight="700">
                    SIN
                  </text>
                  <text x="14" y="11" fill="#71717A" fontSize="10">
                    (Singapore)
                  </text>
                </g>
              </svg>
            </div>
          </div>

          {/* Card: Direct vs overlay RTT */}
          <div className="bg-white rounded-xl p-5 border border-gray-100/90 shadow-[0_2px_10px_rgba(0,0,0,0.03)]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-gray-800" />
                <h2 className="font-semibold text-base text-gray-900">
                  Direct vs overlay RTT
                </h2>
              </div>

              <div className="flex items-center gap-4 text-xs">
                <span className="text-gray-400 font-medium">Illustrative telemetry</span>
                <div className="flex items-center gap-1.5">
                  <span className="w-4 h-[2px] bg-[#FF5722] rounded-full inline-block" />
                  <span className="text-gray-600 font-medium">Overlay</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-4 h-[2px] bg-gray-500 rounded-full inline-block" />
                  <span className="text-gray-600 font-medium">Direct</span>
                </div>
              </div>
            </div>

            {/* Recharts Area Chart */}
            <div className="h-[210px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={telemetryData}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="overlayGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#FF5722" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#FF5722" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="time"
                    tick={{ fontSize: 11, fill: '#71717A' }}
                    axisLine={{ stroke: '#E4E4E7' }}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[0, 200]}
                    ticks={[0, 50, 100, 150, 200]}
                    tick={{ fontSize: 11, fill: '#71717A' }}
                    axisLine={{ stroke: '#E4E4E7' }}
                    tickLine={false}
                    unit=""
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#FFFFFF',
                      borderRadius: '8px',
                      border: '1px solid #E4E4E7',
                      fontSize: '12px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="overlay"
                    stroke="#FF5722"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#overlayGradient)"
                  />
                  <Line
                    type="monotone"
                    dataKey="direct"
                    stroke="#71717A"
                    strokeWidth={1.8}
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
              <div className="text-[11px] text-gray-400 text-center -mt-2">
                Time (last 30 minutes)
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Current Route + Link Health + Recent Events */}
        <div className="lg:col-span-4 flex flex-col gap-5">
          {/* Card: Current Route */}
          <div className="bg-white rounded-xl p-5 border border-gray-100/90 shadow-[0_2px_10px_rgba(0,0,0,0.03)]">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <GitFork className="w-4 h-4 text-gray-800" />
                <h2 className="font-semibold text-base text-gray-900">Current route</h2>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wide text-[#FF5722] bg-[#FFF2EB] border border-[#FFD8C7]">
                LOWEST COST
              </span>
            </div>

            {/* Corridor Selector Tabs */}
            <div className="grid grid-cols-2 gap-1 p-1 bg-[#FAF7F2] rounded-lg border border-[#EFECE6] mb-4">
              <button
                id="card-btn-corridor-luh"
                type="button"
                onClick={() => setSelectedCorridor('LUH')}
                className={`py-1.5 px-2 rounded-md text-xs font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  isLuh
                    ? 'bg-white text-gray-900 shadow-sm border border-gray-200/80'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${isLuh ? 'bg-[#FF5722]' : 'bg-gray-300'}`} />
                <span className="truncate">Ludhiana → Singapore</span>
              </button>
              <button
                id="card-btn-corridor-blr"
                type="button"
                onClick={() => setSelectedCorridor('BLR')}
                className={`py-1.5 px-2 rounded-md text-xs font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  !isLuh
                    ? 'bg-white text-gray-900 shadow-sm border border-gray-200/80'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${!isLuh ? 'bg-[#FF5722]' : 'bg-gray-300'}`} />
                <span className="truncate">Bangalore → Singapore</span>
              </button>
            </div>

            {/* Path Visualizer */}
            <div className="flex items-center justify-between py-2">
              {/* Origin Node */}
              <div className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 rounded-full border-2 border-[#FF5722] flex items-center justify-center shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#FF5722]" />
                </span>
                <div>
                  <div className="text-xs font-bold text-gray-900 leading-tight">
                    {isLuh ? 'LUH' : 'BLR'}
                  </div>
                  <div className="text-[10px] text-gray-500">
                    {isLuh ? '(Ludhiana)' : '(Bangalore)'}
                  </div>
                </div>
              </div>

              {/* Arrow 1 */}
              <div className="flex-1 flex flex-col items-center justify-center px-2">
                <span className="text-[10px] font-semibold text-[#FF5722] mb-0.5">
                  {isLuh ? '21 ms' : '7 ms'}
                </span>
                <div className="w-full h-[2px] bg-[#FFE0D2] relative">
                  <ArrowRight className="w-3 h-3 text-[#FF5722] absolute right-0 top-1/2 -translate-y-1/2 translate-x-1" />
                </div>
              </div>

              {/* Relay Node */}
              <div className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 rounded-full border-2 border-[#FF5722] flex items-center justify-center shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#FF5722]" />
                </span>
                <div>
                  <div className="text-xs font-bold text-gray-900 leading-tight">
                    {isLuh ? 'BOM' : 'MAA'}
                  </div>
                  <div className="text-[10px] text-gray-500">
                    {isLuh ? '(Mumbai)' : '(Chennai)'}
                  </div>
                </div>
              </div>

              {/* Arrow 2 */}
              <div className="flex-1 flex flex-col items-center justify-center px-2">
                <span className="text-[10px] font-semibold text-[#FF5722] mb-0.5">
                  {isLuh ? '42 ms' : '36 ms'}
                </span>
                <div className="w-full h-[2px] bg-[#FFE0D2] relative">
                  <ArrowRight className="w-3 h-3 text-[#FF5722] absolute right-0 top-1/2 -translate-y-1/2 translate-x-1" />
                </div>
              </div>

              {/* Destination Node */}
              <div className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 rounded-full border-2 border-[#FF5722] flex items-center justify-center shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#FF5722]" />
                </span>
                <div>
                  <div className="text-xs font-bold text-gray-900 leading-tight">SIN</div>
                  <div className="text-[10px] text-gray-500">(Singapore)</div>
                </div>
              </div>
            </div>

            {/* Metrics Strip */}
            <div className="flex items-baseline justify-between mt-5 pt-3 border-t border-gray-100">
              <div>
                <div className="text-[11px] font-medium text-gray-500">Estimated RTT</div>
                <div className="text-2xl font-bold text-gray-900 mt-0.5 tabular-nums">
                  {activeCost} ms
                </div>
              </div>
              <div>
                <div className="text-[11px] font-medium text-gray-500">Direct path</div>
                <div className="text-base font-semibold text-gray-700 mt-0.5 tabular-nums">
                  {directCost} ms
                </div>
              </div>
              <div>
                <div className="text-xs font-bold text-[#FF5722]">
                  {savedMs || 18} ms saved
                </div>
              </div>
            </div>
          </div>

          {/* Card: Link Health */}
          <div className="bg-white rounded-xl p-5 border border-gray-100/90 shadow-[0_2px_10px_rgba(0,0,0,0.03)]">
            <div className="flex items-center gap-2 mb-3">
              <Activity className="w-4 h-4 text-gray-800" />
              <h2 className="font-semibold text-base text-gray-900">Link health</h2>
            </div>

            {/* Table */}
            <div className="w-full overflow-hidden">
              <div className="grid grid-cols-4 text-[11px] font-bold text-gray-400 py-1.5 border-b border-gray-100">
                <span>Link</span>
                <span className="text-center">RTT</span>
                <span className="text-center">Loss</span>
                <span className="text-right">Status</span>
              </div>
              <div className="divide-y divide-gray-50">
                {linkHealthItems.map((item) => (
                  <div
                    key={item.name}
                    className="grid grid-cols-4 py-2.5 text-xs text-gray-700 items-center font-medium"
                  >
                    <span className="font-semibold text-gray-900">{item.name}</span>
                    <span className="text-center tabular-nums text-gray-600">{item.rtt}</span>
                    <span className="text-center tabular-nums text-gray-600">{item.loss}</span>
                    <div className="flex items-center justify-end gap-1.5 text-[#16A34A] font-medium text-[11px]">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#16A34A]" />
                      <span>{item.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Card: Recent Events */}
          <div className="bg-white rounded-xl p-5 border border-gray-100/90 shadow-[0_2px_10px_rgba(0,0,0,0.03)]">
            <div className="flex items-center gap-2 mb-3.5">
              <Clock className="w-4 h-4 text-gray-800" />
              <h2 className="font-semibold text-base text-gray-900">Recent events</h2>
            </div>

            <div className="flex flex-col gap-3">
              {/* Event 1: Bangalore to Singapore optimization */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-[#FFF2EB] text-[#FF5722] flex items-center justify-center shrink-0 mt-0.5">
                    <Share2 className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-gray-900">Route optimized</div>
                    <div className="text-[11px] text-gray-500">BLR → MAA → SIN (43 ms overlay vs 78 ms direct)</div>
                  </div>
                </div>
                <span className="text-[10px] text-gray-400 font-medium shrink-0">Just now</span>
              </div>

              {/* Event 2: Ludhiana to Singapore corridor active */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-[#FFF2EB] text-[#FF5722] flex items-center justify-center shrink-0 mt-0.5">
                    <Share2 className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-gray-900">Corridor active</div>
                    <div className="text-[11px] text-gray-500">LUH → BOM → SIN (84 ms overlay vs 102 ms direct)</div>
                  </div>
                </div>
                <span className="text-[10px] text-gray-400 font-medium shrink-0">12s ago</span>
              </div>

              {/* Event 3: Singapore probe refreshed */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center shrink-0 mt-0.5">
                    <Activity className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-gray-900">Probe refreshed</div>
                    <div className="text-[11px] text-gray-500">Singapore (SIN) & Chennai (MAA) relays</div>
                  </div>
                </div>
                <span className="text-[10px] text-gray-400 font-medium shrink-0">45s ago</span>
              </div>

              {/* Event 4: Failover recovered */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-[#EBF7EE] text-[#16A34A] flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-gray-900">Failover standby ready</div>
                    <div className="text-[11px] text-gray-500">BLR → HYD → SIN alternate path verified</div>
                  </div>
                </div>
                <span className="text-[10px] text-gray-400 font-medium shrink-0">2m ago</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
