import React, { useState, useRef } from 'react';
import { StudyStats, Publication } from '../types';
import {
  Download,
  Copy,
  Check,
  Code2,
  Eye,
  Table as TableIcon,
  Maximize2,
  Layers,
  Sparkles,
} from 'lucide-react';

interface FigureProps {
  stats: StudyStats;
  priorStudies?: Publication[];
  topic: string;
}

// ----------------------------------------------------
// FIGURE 1: Annual Scientific Production & Trajectory
// ----------------------------------------------------
export const Figure1Production: React.FC<FigureProps> = ({ stats, topic }) => {
  const years = Object.keys(stats.byYear).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  const pubs = years.map((y) => stats.byYear[y] || 0);
  const cites = years.map((y) => stats.citesByYear[y] || 0);
  const maxPub = Math.max(...pubs, 1);
  const maxCite = Math.max(...cites, 1);

  const [hoveredYear, setHoveredYear] = useState<string | null>(null);

  const svgW = 680;
  const svgH = 260;
  const padLeft = 45;
  const padRight = 45;
  const padBottom = 35;
  const padTop = 30;
  const chartW = svgW - padLeft - padRight;
  const chartH = svgH - padTop - padBottom;

  const barStep = chartW / Math.max(years.length, 1);
  const barW = Math.max(4, Math.min(18, barStep * 0.65));

  // Cumulative points
  let cum = 0;
  const cumPoints = years.map((y, idx) => {
    cum += stats.byYear[y] || 0;
    const x = padLeft + idx * barStep + barStep / 2;
    const yCoord = padTop + chartH - (chartH * cum) / Math.max(stats.docs, 1);
    return { x, y: yCoord, year: y, cum };
  });

  const pathD = cumPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${svgW} ${svgH}`}
        className="w-full max-h-[300px] text-[var(--fg)] select-none font-sans"
      >
        <defs>
          <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2563eb" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.5" />
          </linearGradient>
          <linearGradient id="cumAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = padTop + chartH * (1 - ratio);
          const val = Math.round(maxPub * ratio);
          return (
            <g key={ratio}>
              <line
                x1={padLeft}
                y1={y}
                x2={svgW - padRight}
                y2={y}
                stroke="currentColor"
                strokeOpacity="0.1"
                strokeDasharray="2,2"
              />
              <text
                x={padLeft - 6}
                y={y + 3}
                fontSize="9"
                textAnchor="end"
                fill="currentColor"
                opacity="0.6"
              >
                {val}
              </text>
            </g>
          );
        })}

        {/* Cumulative Area & Line */}
        {cumPoints.length > 1 && (
          <>
            <path
              d={`${pathD} L ${cumPoints[cumPoints.length - 1].x} ${padTop + chartH} L ${
                cumPoints[0].x
              } ${padTop + chartH} Z`}
              fill="url(#cumAreaGrad)"
            />
            <path
              d={pathD}
              fill="none"
              stroke="#10b981"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </>
        )}

        {/* Annual Publication Bars */}
        {years.map((year, idx) => {
          const pCount = stats.byYear[year] || 0;
          const cCount = stats.citesByYear[year] || 0;
          const barH = (chartH * pCount) / maxPub;
          const x = padLeft + idx * barStep + (barStep - barW) / 2;
          const y = padTop + chartH - barH;
          const isHovered = hoveredYear === year;

          return (
            <g
              key={year}
              onMouseEnter={() => setHoveredYear(year)}
              onMouseLeave={() => setHoveredYear(null)}
              className="cursor-pointer transition-all"
            >
              <rect
                x={x}
                y={y}
                width={barW}
                height={barH}
                rx="2"
                fill="url(#barGrad)"
                opacity={isHovered ? 1 : 0.85}
              />

              {/* Citations marker */}
              {cCount > 0 && (
                <circle
                  cx={x + barW / 2}
                  cy={padTop + chartH - (chartH * cCount) / maxCite}
                  r={isHovered ? 3.5 : 2}
                  fill="#f59e0b"
                />
              )}

              {/* X Axis Labels */}
              {(idx === 0 ||
                idx === years.length - 1 ||
                idx % Math.ceil(years.length / 8) === 0) && (
                <text
                  x={x + barW / 2}
                  y={padTop + chartH + 16}
                  fontSize="9"
                  textAnchor="middle"
                  fill="currentColor"
                  opacity="0.75"
                >
                  {year}
                </text>
              )}
            </g>
          );
        })}

        {/* Baseline */}
        <line
          x1={padLeft}
          y1={padTop + chartH}
          x2={svgW - padRight}
          y2={padTop + chartH}
          stroke="currentColor"
          strokeOpacity="0.3"
        />

        {/* Legend & Stats Callout */}
        <g transform={`translate(${padLeft + 10}, ${padTop - 12})`}>
          <rect x="0" y="-8" width="10" height="10" rx="2" fill="#3b82f6" />
          <text x="14" y="0" fontSize="9" fill="currentColor" opacity="0.8">
            Annual Publications
          </text>

          <line x1="120" y1="-3" x2="135" y2="-3" stroke="#10b981" strokeWidth="2" />
          <text x="140" y="0" fontSize="9" fill="currentColor" opacity="0.8">
            Cumulative Trajectory
          </text>

          <circle cx="255" cy="-3" r="3" fill="#f59e0b" />
          <text x="263" y="0" fontSize="9" fill="currentColor" opacity="0.8">
            Citations Received
          </text>
        </g>

        {/* Growth Callout Pill */}
        <g transform={`translate(${svgW - padRight - 150}, ${padTop - 16})`}>
          <rect
            x="0"
            y="-4"
            width="150"
            height="18"
            rx="4"
            className="fill-blue-500/10 stroke-blue-500/30"
            strokeWidth="1"
          />
          <text x="75" y="8" fontSize="9" textAnchor="middle" fill="#2563eb" fontWeight="600">
            CAGR: {stats.annualGrowthPct != null ? `${stats.annualGrowthPct}%` : 'N/A'} • t_d:{' '}
            {stats.doublingTimeYears ? `${stats.doublingTimeYears}y` : '—'}
          </text>
        </g>

        {/* Hover Tooltip */}
        {hoveredYear && (
          <g transform={`translate(${padLeft + 15}, ${padTop + 20})`}>
            <rect
              x="0"
              y="0"
              width="140"
              height="40"
              rx="4"
              className="fill-zinc-900/90 text-white dark:fill-zinc-100/95 dark:text-zinc-900"
            />
            <text x="8" y="15" fontSize="10" fontWeight="bold" fill="white">
              Year {hoveredYear}
            </text>
            <text x="8" y="28" fontSize="9" fill="#93c5fd">
              Pubs: {stats.byYear[hoveredYear] || 0} | Cites: {stats.citesByYear[hoveredYear] || 0}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
};

// ----------------------------------------------------
// FIGURE 2: Bradford's Law 3-Zone Distribution Model
// ----------------------------------------------------
export const Figure2Bradford: React.FC<FigureProps> = ({ stats }) => {
  const zones = stats.bradfordZones;
  const colors = ['#2563eb', '#f59e0b', '#64748b'];

  const totalWorks = stats.docs || 1;
  const svgW = 680;
  const svgH = 220;

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full max-h-[260px] text-[var(--fg)] font-sans">
        {/* Proportional Stacked Strip */}
        <text x="40" y="30" fontSize="11" fontWeight="bold" fill="currentColor">
          Bradford Scattering Zones (Equal Publication Partition: 1 : k : k²)
        </text>

        <g transform="translate(40, 45)">
          {/* Main 3 Zone Progress Blocks */}
          {(() => {
            let offset = 0;
            const fullW = svgW - 80;
            return zones.map((z, idx) => {
              const width = Math.max(30, (fullW * z.worksCount) / totalWorks);
              const curOffset = offset;
              offset += width;

              return (
                <g key={z.zone} className="transition-all">
                  <rect
                    x={curOffset}
                    y="0"
                    width={width - 2}
                    height="32"
                    rx="4"
                    fill={colors[idx]}
                    opacity="0.85"
                  />
                  <text
                    x={curOffset + (width - 2) / 2}
                    y="20"
                    fontSize="10"
                    fontWeight="bold"
                    fill="#ffffff"
                    textAnchor="middle"
                  >
                    Zone {z.zone}: {z.percentage}%
                  </text>
                </g>
              );
            });
          })()}
        </g>

        {/* 3 Zone Breakdown Cards */}
        <g transform="translate(40, 95)">
          {zones.map((z, idx) => {
            const cardW = (svgW - 80 - 16) / 3;
            const x = idx * (cardW + 8);

            return (
              <g key={z.zone} transform={`translate(${x}, 0)`}>
                <rect
                  x="0"
                  y="0"
                  width={cardW}
                  height="100"
                  rx="6"
                  className="fill-[var(--card)] stroke-[var(--bd)]"
                  strokeWidth="1"
                />
                {/* Zone Color Bar */}
                <rect x="0" y="0" width={cardW} height="4" rx="2" fill={colors[idx]} />

                <text x="12" y="22" fontSize="11" fontWeight="bold" fill="currentColor">
                  {z.name}
                </text>
                <text x="12" y="38" fontSize="10" fill="currentColor" opacity="0.75">
                  Sources: <tspan fontWeight="bold">{z.sourcesCount}</tspan> journals
                </text>
                <text x="12" y="52" fontSize="10" fill="currentColor" opacity="0.75">
                  Yield: <tspan fontWeight="bold">{z.worksCount}</tspan> works ({z.percentage}%)
                </text>
                <text x="12" y="70" fontSize="9" fill="currentColor" opacity="0.6">
                  Key Sources:
                </text>
                <text x="12" y="84" fontSize="8.5" fill="currentColor" opacity="0.8" fontStyle="italic">
                  {z.sources.slice(0, 2).join(', ') || 'Various venues'}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
};

// ----------------------------------------------------
// FIGURE 3: Co-Authorship Network Topology
// ----------------------------------------------------
export const Figure3Coauthorship: React.FC<FigureProps> = ({ stats }) => {
  const net = stats.coauthorshipNetwork;
  const nodes = net.nodes.slice(0, 16);
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const edges = net.edges
    .filter((e) => nodeMap.has(e.source) && nodeMap.has(e.target))
    .slice(0, 20);

  const svgW = 680;
  const svgH = 300;
  const centerX = svgW / 2;
  const centerY = svgH / 2;
  const radius = Math.min(centerX, centerY) - 50;

  // Position nodes circularly or clustered
  const positionedNodes = nodes.map((node, i) => {
    const angle = (2 * Math.PI * i) / Math.max(nodes.length, 1);
    const r = radius * (0.6 + 0.4 * (i % 2));
    const x = centerX + r * Math.cos(angle);
    const y = centerY + r * Math.sin(angle);
    return { ...node, x, y };
  });

  const posMap = new Map(positionedNodes.map((n) => [n.id, n]));

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full max-h-[340px] text-[var(--fg)] font-sans">
        <defs>
          <radialGradient id="authorNodeGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#1d4ed8" />
          </radialGradient>
        </defs>

        {/* Background Network Aura */}
        <circle cx={centerX} cy={centerY} r={radius + 15} fill="none" stroke="currentColor" strokeOpacity="0.05" strokeDasharray="4,4" />

        {/* Edges */}
        {edges.map((e, idx) => {
          const s = posMap.get(e.source);
          const t = posMap.get(e.target);
          if (!s || !t) return null;
          const strokeW = Math.min(4, Math.max(1, e.weight));
          return (
            <line
              key={idx}
              x1={s.x}
              y1={s.y}
              x2={t.x}
              y2={t.y}
              stroke="#3b82f6"
              strokeOpacity={0.35 + Math.min(0.4, e.weight * 0.1)}
              strokeWidth={strokeW}
            />
          );
        })}

        {/* Nodes */}
        {positionedNodes.map((n, idx) => {
          const r = Math.min(18, Math.max(7, Math.sqrt(n.weight) * 3));
          const initials = n.name
            .split(/\s+/)
            .map((p) => p[0])
            .join('')
            .slice(0, 2)
            .toUpperCase();

          return (
            <g key={n.id} className="cursor-pointer group">
              <circle
                cx={n.x}
                cy={n.y}
                r={r}
                fill="url(#authorNodeGrad)"
                stroke="#ffffff"
                strokeWidth="1.5"
                className="group-hover:opacity-90 transition-opacity"
              >
                <title>{`${n.name}: ${n.weight} works / citations`}</title>
              </circle>
              <text
                x={n.x}
                y={n.y + 3}
                fontSize="8"
                fontWeight="bold"
                fill="#ffffff"
                textAnchor="middle"
                pointerEvents="none"
              >
                {initials}
              </text>
              <text
                x={n.x}
                y={n.y + r + 11}
                fontSize="8.5"
                fontWeight="600"
                fill="currentColor"
                textAnchor="middle"
                className="opacity-80 group-hover:opacity-100"
              >
                {n.name.length > 15 ? n.name.slice(0, 13) + '…' : n.name}
              </text>
            </g>
          );
        })}

        {/* Statistics Badge */}
        <g transform="translate(20, 20)">
          <rect x="0" y="0" width="160" height="42" rx="6" className="fill-[var(--card)] stroke-[var(--bd)]" strokeWidth="1" />
          <text x="10" y="16" fontSize="9.5" fontWeight="bold" fill="currentColor">
            Co-Authorship Topology
          </text>
          <text x="10" y="32" fontSize="8.5" fill="currentColor" opacity="0.75">
            Nodes: {net.nodes.length} • Collaborative Ties: {net.edges.length}
          </text>
        </g>
      </svg>
    </div>
  );
};

// ----------------------------------------------------
// FIGURE 4: Thematic Keyword Co-Occurrence Fronts
// ----------------------------------------------------
export const Figure4Keywords: React.FC<FigureProps> = ({ stats }) => {
  const net = stats.keywordNetwork;
  const nodes = net.nodes.slice(0, 14);
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const edges = net.edges
    .filter((e) => nodeMap.has(e.source) && nodeMap.has(e.target))
    .slice(0, 18);

  const svgW = 680;
  const svgH = 280;
  const centerX = svgW / 2;
  const centerY = svgH / 2;

  // Grid layout with random organic jitter for keywords
  const positionedNodes = nodes.map((node, i) => {
    const angle = (2 * Math.PI * i) / Math.max(nodes.length, 1);
    const r = 95 + ((i * 17) % 35);
    const x = centerX + r * Math.cos(angle);
    const y = centerY + r * Math.sin(angle) * 0.85;
    return { ...node, x, y };
  });

  const posMap = new Map(positionedNodes.map((n) => [n.id, n]));

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full max-h-[320px] text-[var(--fg)] font-sans">
        {/* Co-word Links */}
        {edges.map((e, idx) => {
          const s = posMap.get(e.source);
          const t = posMap.get(e.target);
          if (!s || !t) return null;
          return (
            <line
              key={idx}
              x1={s.x}
              y1={s.y}
              x2={t.x}
              y2={t.y}
              stroke="#10b981"
              strokeOpacity={0.35}
              strokeWidth={Math.min(3, Math.max(1, e.weight))}
              strokeDasharray={e.weight > 2 ? 'none' : '3,2'}
            />
          );
        })}

        {/* Keyword Bubble Nodes */}
        {positionedNodes.map((n) => {
          const label = n.name.length > 20 ? n.name.slice(0, 18) + '…' : n.name;
          const textW = label.length * 6 + 18;

          return (
            <g key={n.id} transform={`translate(${n.x}, ${n.y})`} className="cursor-pointer group">
              <rect
                x={-textW / 2}
                y="-11"
                width={textW}
                height="22"
                rx="11"
                className="fill-emerald-500/15 stroke-emerald-600/40 group-hover:fill-emerald-500/30 transition-colors"
                strokeWidth="1.2"
              />
              <circle cx={-textW / 2 + 8} cy="0" r="3" fill="#10b981" />
              <text
                x={4}
                y="3.5"
                fontSize="9"
                fontWeight="600"
                fill="currentColor"
                textAnchor="middle"
              >
                {label}
              </text>
            </g>
          );
        })}

        {/* Legend */}
        <g transform="translate(20, 20)">
          <rect x="0" y="0" width="165" height="38" rx="6" className="fill-[var(--card)] stroke-[var(--bd)]" strokeWidth="1" />
          <text x="10" y="15" fontSize="9.5" fontWeight="bold" fill="currentColor">
            Conceptual Thematic Fronts
          </text>
          <text x="10" y="28" fontSize="8.5" fill="currentColor" opacity="0.75">
            Clusters: Subject terms & Co-occurrences
          </text>
        </g>
      </svg>
    </div>
  );
};

// ----------------------------------------------------
// FIGURE 5: Global Cross-National Collaboration & MCP
// ----------------------------------------------------
export const Figure5Countries: React.FC<FigureProps> = ({ stats }) => {
  const topCountries = stats.topCountries.slice(0, 8);
  const maxWorks = Math.max(...topCountries.map((c) => c.works), 1);

  const svgW = 680;
  const svgH = 260;
  const leftPad = 110;
  const rightPad = 70;
  const barChartW = svgW - leftPad - rightPad;
  const barH = 16;
  const rowH = 26;

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full max-h-[300px] text-[var(--fg)] font-sans">
        {/* Legend */}
        <g transform="translate(110, 16)">
          <rect x="0" y="-8" width="12" height="10" rx="2" fill="#2563eb" />
          <text x="16" y="0" fontSize="9" fill="currentColor" opacity="0.8">
            SCP (Single Country National Yield)
          </text>

          <rect x="210" y="-8" width="12" height="10" rx="2" fill="#10b981" />
          <text x="226" y="0" fontSize="9" fill="currentColor" opacity="0.8">
            MCP (Multiple Country International Collab)
          </text>
        </g>

        {topCountries.map((c, idx) => {
          const y = 35 + idx * rowH;
          const totalW = (barChartW * c.works) / maxWorks;
          const mcpW = (totalW * c.mcp) / Math.max(c.works, 1);
          const scpW = totalW - mcpW;

          return (
            <g key={c.country} className="group">
              {/* Country Name */}
              <text
                x={leftPad - 12}
                y={y + 11}
                fontSize="9.5"
                fontWeight="600"
                textAnchor="end"
                fill="currentColor"
              >
                {c.country}
              </text>

              {/* SCP Bar */}
              <rect
                x={leftPad}
                y={y}
                width={Math.max(2, scpW)}
                height={barH}
                rx="2"
                fill="#2563eb"
                opacity="0.85"
              >
                <title>{`${c.country}: ${c.scp} Single-Country publications`}</title>
              </rect>

              {/* MCP Bar */}
              <rect
                x={leftPad + scpW}
                y={y}
                width={Math.max(2, mcpW)}
                height={barH}
                rx="2"
                fill="#10b981"
                opacity="0.9"
              >
                <title>{`${c.country}: ${c.mcp} International co-publications (MCP ratio: ${(
                  c.mcpRatio * 100
                ).toFixed(1)}%)`}</title>
              </rect>

              {/* Works & Ratio Label */}
              <text
                x={leftPad + totalW + 8}
                y={y + 12}
                fontSize="8.5"
                fontFamily="monospace"
                fill="currentColor"
                opacity="0.8"
              >
                {c.works} (MCP: {(c.mcpRatio * 100).toFixed(0)}%)
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

// ----------------------------------------------------
// FIGURE 6: Institutional Research Alliances
// ----------------------------------------------------
export const Figure6Institutions: React.FC<FigureProps> = ({ stats }) => {
  const net = stats.institutionNetwork;
  const nodes = net.nodes.slice(0, 10);
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const edges = net.edges
    .filter((e) => nodeMap.has(e.source) && nodeMap.has(e.target))
    .slice(0, 12);

  const svgW = 680;
  const svgH = 260;
  const centerX = svgW / 2;
  const centerY = svgH / 2;
  const radius = 95;

  const positionedNodes = nodes.map((node, i) => {
    const angle = (2 * Math.PI * i) / Math.max(nodes.length, 1);
    const x = centerX + radius * Math.cos(angle);
    const y = centerY + radius * Math.sin(angle);
    return { ...node, x, y };
  });

  const posMap = new Map(positionedNodes.map((n) => [n.id, n]));

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full max-h-[300px] text-[var(--fg)] font-sans">
        {/* Alliances */}
        {edges.map((e, idx) => {
          const s = posMap.get(e.source);
          const t = posMap.get(e.target);
          if (!s || !t) return null;
          return (
            <line
              key={idx}
              x1={s.x}
              y1={s.y}
              x2={t.x}
              y2={t.y}
              stroke="#8b5cf6"
              strokeOpacity={0.4}
              strokeWidth={Math.min(3, Math.max(1, e.weight))}
            />
          );
        })}

        {/* Institution Nodes */}
        {positionedNodes.map((n) => {
          const shortName = n.name.length > 22 ? n.name.slice(0, 20) + '…' : n.name;
          return (
            <g key={n.id} className="cursor-pointer group">
              <circle
                cx={n.x}
                cy={n.y}
                r="11"
                fill="#8b5cf6"
                stroke="#ffffff"
                strokeWidth="1.5"
                className="group-hover:opacity-90"
              />
              <text x={n.x} y={n.y + 3.5} fontSize="8" fontWeight="bold" fill="#ffffff" textAnchor="middle">
                🏛
              </text>
              <text
                x={n.x}
                y={n.y + 20}
                fontSize="8.5"
                fontWeight="600"
                fill="currentColor"
                textAnchor="middle"
                className="opacity-80 group-hover:opacity-100"
              >
                {shortName}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

// ----------------------------------------------------
// FIGURE 7: Literature Review Taxonomy & Synthesis Flow
// ----------------------------------------------------
export const Figure7ReviewSynthesis: React.FC<FigureProps> = ({ priorStudies = [], topic }) => {
  const svgW = 680;
  const svgH = 260;

  const countBib = priorStudies.filter((p) => p.reviewType === 'bibliometric').length;
  const countSlr = priorStudies.filter((p) => p.reviewType === 'systematic_review').length;
  const countSurvey = priorStudies.filter((p) => p.reviewType === 'conceptual_survey' || !p.reviewType).length;

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full max-h-[300px] text-[var(--fg)] font-sans">
        {/* Step 1: Open Knowledge Graph Discovery */}
        <g transform="translate(30, 80)">
          <rect
            x="0"
            y="0"
            width="140"
            height="90"
            rx="6"
            className="fill-blue-500/10 stroke-blue-500/40"
            strokeWidth="1.2"
          />
          <text x="70" y="22" fontSize="10" fontWeight="bold" fill="currentColor" textAnchor="middle">
            1. Graph Identification
          </text>
          <text x="70" y="40" fontSize="8.5" fill="currentColor" opacity="0.8" textAnchor="middle">
            Wikidata QLever SPARQL
          </text>
          <text x="70" y="55" fontSize="8" fill="currentColor" opacity="0.65" textAnchor="middle">
            Subject triples (P921)
          </text>
          <text x="70" y="70" fontSize="8.5" fontWeight="600" fill="#2563eb" textAnchor="middle">
            {priorStudies.length} Review Studies
          </text>
        </g>

        {/* Arrow 1 */}
        <path d="M 175 125 L 205 125" stroke="currentColor" strokeOpacity="0.4" strokeWidth="2" markerEnd="url(#arrow)" />

        {/* Step 2: Categorization */}
        <g transform="translate(210, 30)">
          {/* Subcategory A */}
          <g transform="translate(0, 0)">
            <rect x="0" y="0" width="180" height="52" rx="4" className="fill-amber-500/10 stroke-amber-500/40" strokeWidth="1" />
            <text x="10" y="18" fontSize="9.5" fontWeight="bold" fill="currentColor">
              A. Bibliometric / Scientometric
            </text>
            <text x="10" y="34" fontSize="8" fill="currentColor" opacity="0.75">
              Citation mapping, trends: {countBib} studies
            </text>
          </g>

          {/* Subcategory B */}
          <g transform="translate(0, 68)">
            <rect x="0" y="0" width="180" height="52" rx="4" className="fill-emerald-500/10 stroke-emerald-500/40" strokeWidth="1" />
            <text x="10" y="18" fontSize="9.5" fontWeight="bold" fill="currentColor">
              B. Systematic Reviews (SLR)
            </text>
            <text x="10" y="34" fontSize="8" fill="currentColor" opacity="0.75">
              PRISMA protocols: {countSlr} studies
            </text>
          </g>

          {/* Subcategory C */}
          <g transform="translate(0, 136)">
            <rect x="0" y="0" width="180" height="52" rx="4" className="fill-indigo-500/10 stroke-indigo-500/40" strokeWidth="1" />
            <text x="10" y="18" fontSize="9.5" fontWeight="bold" fill="currentColor">
              C. Thematic & State-of-Art
            </text>
            <text x="10" y="34" fontSize="8" fill="currentColor" opacity="0.75">
              Taxonomies, surveys: {countSurvey} studies
            </text>
          </g>
        </g>

        {/* Arrow 2 */}
        <path d="M 395 125 L 425 125" stroke="currentColor" strokeOpacity="0.4" strokeWidth="2" />

        {/* Step 3: Synthesis & Scientometric Gap */}
        <g transform="translate(430, 60)">
          <rect
            x="0"
            y="0"
            width="220"
            height="130"
            rx="6"
            className="fill-rose-500/10 stroke-rose-500/40"
            strokeWidth="1.2"
          />
          <text x="110" y="24" fontSize="10" fontWeight="bold" fill="currentColor" textAnchor="middle">
            3. Research Gap Positioning
          </text>
          <text x="16" y="45" fontSize="8.5" fill="currentColor" opacity="0.85">
            • Beyond closed subscription silos (WoS/Scopus)
          </text>
          <text x="16" y="65" fontSize="8.5" fill="currentColor" opacity="0.85">
            • Longitudinal linked open data reproducibility
          </text>
          <text x="16" y="85" fontSize="8.5" fill="currentColor" opacity="0.85">
            • Multi-network topologies (Authors, Institutions)
          </text>
          <text x="16" y="105" fontSize="8.5" fill="currentColor" opacity="0.85">
            • Rigorous informetric laws (Lotka, Bradford, Price)
          </text>
        </g>
      </svg>
    </div>
  );
};

// ----------------------------------------------------
// FIGURE CONTAINER WRAPPER (Academic Card Styling)
// ----------------------------------------------------
interface ManuscriptFigureCardProps {
  figureNumber: number;
  title: string;
  note: string;
  mermaidCode?: string;
  stats: StudyStats;
  priorStudies?: Publication[];
  topic: string;
}

export const ManuscriptFigureCard: React.FC<ManuscriptFigureCardProps> = ({
  figureNumber,
  title,
  note,
  mermaidCode,
  stats,
  priorStudies,
  topic,
}) => {
  const [viewMode, setViewMode] = useState<'visual' | 'code'>('visual');
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleCopyCaption = () => {
    navigator.clipboard.writeText(`Figure ${figureNumber}. ${title}\nNote: ${note}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadSvg = () => {
    if (!containerRef.current) return;
    const svgElem = containerRef.current.querySelector('svg');
    if (!svgElem) return;

    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(svgElem);
    const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Figure_${figureNumber}_${topic.replace(/[^a-zA-Z0-9]/g, '_')}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const renderVisualContent = () => {
    switch (figureNumber) {
      case 1:
        return <Figure1Production stats={stats} topic={topic} />;
      case 2:
        return <Figure2Bradford stats={stats} topic={topic} />;
      case 3:
        return <Figure3Coauthorship stats={stats} topic={topic} />;
      case 4:
        return <Figure4Keywords stats={stats} topic={topic} />;
      case 5:
        return <Figure5Countries stats={stats} topic={topic} />;
      case 6:
        return <Figure6Institutions stats={stats} topic={topic} />;
      case 7:
        return <Figure7ReviewSynthesis stats={stats} priorStudies={priorStudies} topic={topic} />;
      default:
        return null;
    }
  };

  return (
    <figure
      id={`fig-${figureNumber}`}
      ref={containerRef}
      className="my-6 rounded-xl border border-[var(--bd)] bg-[var(--bg)] shadow-xs overflow-hidden"
    >
      {/* Figure Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-black/[0.02] dark:bg-white/[0.02] border-b border-[var(--bd)] text-xs">
        <div className="flex items-center gap-2">
          <span className="font-bold text-[var(--ac)] bg-blue-500/10 px-2 py-0.5 rounded text-[11px]">
            Figure {figureNumber}
          </span>
          <span className="font-semibold text-[var(--fg)] text-xs">{title}</span>
        </div>

        <div className="flex items-center gap-1.5 ml-auto">
          {mermaidCode && (
            <div className="flex items-center rounded-md border border-[var(--bd)] p-0.5 text-[11px]">
              <button
                onClick={() => setViewMode('visual')}
                className={`px-2 py-0.5 rounded font-medium flex items-center gap-1 ${
                  viewMode === 'visual'
                    ? 'bg-blue-600 text-white font-semibold'
                    : 'text-[var(--mut)] hover:text-[var(--fg)]'
                }`}
              >
                <Eye className="w-3 h-3" />
                <span>Figure</span>
              </button>
              <button
                onClick={() => setViewMode('code')}
                className={`px-2 py-0.5 rounded font-medium flex items-center gap-1 ${
                  viewMode === 'code'
                    ? 'bg-blue-600 text-white font-semibold'
                    : 'text-[var(--mut)] hover:text-[var(--fg)]'
                }`}
              >
                <Code2 className="w-3 h-3" />
                <span>Mermaid</span>
              </button>
            </div>
          )}

          <button
            onClick={handleDownloadSvg}
            title="Download Figure as High-Res Vector SVG"
            className="p-1 rounded text-[var(--mut)] hover:text-[var(--fg)] hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={handleCopyCaption}
            title="Copy Figure Caption"
            className="p-1 rounded text-[var(--mut)] hover:text-[var(--fg)] hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-500" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Visual Content or Code */}
      <div className="p-4 bg-[var(--bg)] flex items-center justify-center min-h-[160px]">
        {viewMode === 'visual' ? (
          renderVisualContent()
        ) : (
          <pre className="w-full text-xs font-mono bg-black/5 dark:bg-white/5 p-3 rounded-lg overflow-x-auto whitespace-pre-wrap">
            {mermaidCode}
          </pre>
        )}
      </div>

      {/* Formal Academic Caption */}
      <figcaption className="px-4 py-2.5 bg-black/[0.01] dark:bg-white/[0.01] border-t border-[var(--bd)] text-[11px] leading-relaxed text-[var(--mut)]">
        <span className="font-semibold text-[var(--fg)]">Figure {figureNumber}.</span> {title}.{' '}
        <span className="italic">{note}</span>
      </figcaption>
    </figure>
  );
};
