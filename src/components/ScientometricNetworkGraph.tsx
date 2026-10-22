import React, { useState, useEffect, useRef } from 'react';
import { ScientometricNetwork, NetworkNode, NetworkEdge } from '../types';
import {
  Share2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Search,
  Users,
  Tag,
  Globe2,
  Building2,
  Sliders,
} from 'lucide-react';

interface ScientometricNetworkGraphProps {
  coauthorship: ScientometricNetwork;
  keywords: ScientometricNetwork;
  countries: ScientometricNetwork;
  institutions: ScientometricNetwork;
}

type NetworkTab = 'authors' | 'keywords' | 'countries' | 'institutions';

export const ScientometricNetworkGraph: React.FC<ScientometricNetworkGraphProps> = ({
  coauthorship,
  keywords,
  countries,
  institutions,
}) => {
  const [tab, setTab] = useState<NetworkTab>('authors');
  const [searchTerm, setSearchTerm] = useState('');
  const [minEdgeWeight, setMinEdgeWeight] = useState(1);
  const [hoveredNode, setHoveredNode] = useState<NetworkNode | null>(null);

  // Pan & Zoom
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const startPanRef = useRef({ x: 0, y: 0 });

  // Simulation layout states
  const [simNodes, setSimNodes] = useState<NetworkNode[]>([]);
  const draggedNodeRef = useRef<NetworkNode | null>(null);

  // Active network
  const activeNet =
    tab === 'authors'
      ? coauthorship
      : tab === 'keywords'
      ? keywords
      : tab === 'countries'
      ? countries
      : institutions;

  // Filter edges by min weight
  const filteredEdges = activeNet.edges.filter((e) => e.weight >= minEdgeWeight);

  // Simple, robust physics layout simulation
  useEffect(() => {
    const width = 800;
    const height = 500;
    const initialNodes: NetworkNode[] = activeNet.nodes.map((node, i) => {
      const angle = (i / Math.max(1, activeNet.nodes.length)) * 2 * Math.PI;
      const radius = 140 + Math.random() * 80;
      return {
        ...node,
        x: width / 2 + Math.cos(angle) * radius,
        y: height / 2 + Math.sin(angle) * radius,
        vx: 0,
        vy: 0,
      };
    });

    const nodeIndex = new Map(initialNodes.map((n) => [n.id, n]));

    // Run 100 simulation iterations
    for (let iter = 0; iter < 120; iter++) {
      // Repulsion between all node pairs
      for (let i = 0; i < initialNodes.length; i++) {
        for (let j = i + 1; j < initialNodes.length; j++) {
          const n1 = initialNodes[i];
          const n2 = initialNodes[j];
          const dx = n2.x! - n1.x!;
          const dy = n2.y! - n1.y!;
          const distSq = dx * dx + dy * dy || 1;
          const dist = Math.sqrt(distSq);
          if (dist < 260) {
            const force = 1800 / distSq;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            n1.vx! -= fx;
            n1.vy! -= fy;
            n2.vx! += fx;
            n2.vy! += fy;
          }
        }
      }

      // Edge spring attraction
      filteredEdges.forEach((e) => {
        const source = nodeIndex.get(e.source);
        const target = nodeIndex.get(e.target);
        if (source && target) {
          const dx = target.x! - source.x!;
          const dy = target.y! - source.y!;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const springForce = (dist - 90) * 0.04 * Math.min(e.weight, 4);
          const fx = (dx / dist) * springForce;
          const fy = (dy / dist) * springForce;
          source.vx! += fx;
          source.vy! += fy;
          target.vx! -= fx;
          target.vy! -= fy;
        }
      });

      // Gravity towards center
      initialNodes.forEach((n) => {
        n.vx! += (width / 2 - n.x!) * 0.015;
        n.vy! += (height / 2 - n.y!) * 0.015;

        // Apply velocity with damping
        n.x! += n.vx! * 0.6;
        n.y! += n.vy! * 0.6;
        n.vx! *= 0.5;
        n.vy! *= 0.5;
      });
    }

    setSimNodes(initialNodes);
  }, [tab, minEdgeWeight, activeNet.nodes.length, activeNet.edges.length]);

  // Mouse pan handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0 && !draggedNodeRef.current) {
      setIsPanning(true);
      startPanRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (draggedNodeRef.current) {
      const rect = e.currentTarget.getBoundingClientRect();
      const mouseX = (e.clientX - rect.left - pan.x) / zoom;
      const mouseY = (e.clientY - rect.top - pan.y) / zoom;
      const targetId = draggedNodeRef.current.id;
      setSimNodes((prev) =>
        prev.map((n) => (n.id === targetId ? { ...n, x: mouseX, y: mouseY } : n))
      );
      return;
    }
    if (isPanning) {
      setPan({
        x: e.clientX - startPanRef.current.x,
        y: e.clientY - startPanRef.current.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    draggedNodeRef.current = null;
  };

  const handleResetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setSearchTerm('');
  };

  const nodeMap = new Map(simNodes.map((n) => [n.id, n]));
  const maxWeight = Math.max(...activeNet.nodes.map((n) => n.weight), 1);

  // Network metrics
  const avgDegree = activeNet.nodes.length
    ? +((2 * filteredEdges.length) / activeNet.nodes.length).toFixed(2)
    : 0;
  const density =
    activeNet.nodes.length > 1
      ? +(
          (2 * filteredEdges.length) /
          (activeNet.nodes.length * (activeNet.nodes.length - 1))
        ).toFixed(3)
      : 0;

  return (
    <div className="bg-[var(--bg)] border border-[var(--bd)] rounded-xl p-4 my-4 shadow-sm">
      {/* Network Header & Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[var(--bd)]">
        <div>
          <h3 className="font-bold text-sm text-[var(--fg)] flex items-center gap-1.5">
            <Share2 className="w-4 h-4 text-[var(--ac)]" />
            <span>Scientometric Networks</span>
          </h3>
          <p className="text-xs text-[var(--mut)] mt-0.5">
            Interactive relational topologies: drag nodes, hover for metrics, filter co-occurrences.
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-1 bg-[var(--card)] p-1 rounded-lg border border-[var(--bd)] text-xs">
          <button
            onClick={() => setTab('authors')}
            className={`px-2.5 py-1 rounded-md flex items-center gap-1 font-medium transition-colors ${
              tab === 'authors'
                ? 'bg-blue-600 text-white font-semibold'
                : 'text-[var(--mut)] hover:text-[var(--fg)]'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Co-authorship</span>
          </button>
          <button
            onClick={() => setTab('keywords')}
            className={`px-2.5 py-1 rounded-md flex items-center gap-1 font-medium transition-colors ${
              tab === 'keywords'
                ? 'bg-blue-600 text-white font-semibold'
                : 'text-[var(--mut)] hover:text-[var(--fg)]'
            }`}
          >
            <Tag className="w-3.5 h-3.5" />
            <span>Keywords</span>
          </button>
          <button
            onClick={() => setTab('countries')}
            className={`px-2.5 py-1 rounded-md flex items-center gap-1 font-medium transition-colors ${
              tab === 'countries'
                ? 'bg-blue-600 text-white font-semibold'
                : 'text-[var(--mut)] hover:text-[var(--fg)]'
            }`}
          >
            <Globe2 className="w-3.5 h-3.5" />
            <span>Countries</span>
          </button>
          <button
            onClick={() => setTab('institutions')}
            className={`px-2.5 py-1 rounded-md flex items-center gap-1 font-medium transition-colors ${
              tab === 'institutions'
                ? 'bg-blue-600 text-white font-semibold'
                : 'text-[var(--mut)] hover:text-[var(--fg)]'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Institutions</span>
          </button>
        </div>
      </div>

      {/* Network Controls & Stats Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-xs text-[var(--mut)]">
        <div className="flex items-center gap-3">
          <div className="relative">
            <input
              className="scimetro-input text-xs py-1 pl-7 pr-2 w-44"
              placeholder={`Search in ${tab}…`}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <Search className="w-3 h-3 absolute left-2 top-2 text-[var(--mut)] pointer-events-none" />
          </div>

          <div className="flex items-center gap-1.5 text-[11px]">
            <span>Min co-occurrence:</span>
            <select
              value={minEdgeWeight}
              onChange={(e) => setMinEdgeWeight(Number(e.target.value))}
              className="scimetro-input text-xs py-0.5 px-1.5 w-auto"
            >
              <option value="1">≥ 1</option>
              <option value="2">≥ 2</option>
              <option value="3">≥ 3</option>
            </select>
          </div>
        </div>

        {/* Network Metrics Badges */}
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px]">
            Nodes: <b className="text-[var(--fg)]">{activeNet.nodes.length}</b>
          </span>
          <span className="font-mono text-[11px]">
            Links: <b className="text-[var(--fg)]">{filteredEdges.length}</b>
          </span>
          <span className="font-mono text-[11px]">
            Avg Degree: <b className="text-[var(--fg)]">{avgDegree}</b>
          </span>
          <span className="font-mono text-[11px]">
            Density: <b className="text-[var(--fg)]">{density}</b>
          </span>

          <div className="flex items-center gap-1 pl-2 border-l border-[var(--bd)]">
            <button
              onClick={() => setZoom((z) => Math.min(2.5, z + 0.2))}
              className="scimetro-btn-ghost p-1 text-[var(--mut)] hover:text-[var(--fg)]"
              title="Zoom in"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setZoom((z) => Math.max(0.5, z - 0.2))}
              className="scimetro-btn-ghost p-1 text-[var(--mut)] hover:text-[var(--fg)]"
              title="Zoom out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleResetView}
              className="scimetro-btn-ghost p-1 text-[var(--mut)] hover:text-[var(--fg)]"
              title="Reset view"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* SVG Canvas */}
      <div
        className="relative h-[480px] w-full border border-[var(--bd)] rounded-lg bg-black/[0.02] dark:bg-white/[0.02] overflow-hidden select-none cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        <svg
          viewBox="0 0 800 500"
          className="w-full h-full"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: 'center center',
            transition: isPanning || draggedNodeRef.current ? 'none' : 'transform 0.15s ease-out',
          }}
        >
          {/* Edges */}
          <g className="edges">
            {filteredEdges.map((e, idx) => {
              const source = nodeMap.get(e.source);
              const target = nodeMap.get(e.target);
              if (!source || !target || source.x == null || target.x == null) return null;

              const isHighlighted =
                hoveredNode &&
                (hoveredNode.id === source.id || hoveredNode.id === target.id);

              return (
                <line
                  key={`${e.source}-${e.target}-${idx}`}
                  x1={source.x}
                  y1={source.y}
                  x2={target.x}
                  y2={target.y}
                  stroke={isHighlighted ? 'var(--ac)' : 'var(--bd)'}
                  strokeWidth={isHighlighted ? Math.min(e.weight * 2, 6) : Math.min(e.weight * 1.2, 4)}
                  strokeOpacity={isHighlighted ? 0.9 : 0.4}
                />
              );
            })}
          </g>

          {/* Nodes */}
          <g className="nodes">
            {simNodes.map((node) => {
              const isMatch =
                searchTerm.trim() !== '' &&
                node.name.toLowerCase().includes(searchTerm.toLowerCase());
              const isHovered = hoveredNode?.id === node.id;
              const radius = 6 + Math.round((node.weight / maxWeight) * 16);

              // Palette by node type
              const fillColor =
                node.type === 'author'
                  ? '#3b82f6'
                  : node.type === 'keyword'
                  ? '#10b981'
                  : node.type === 'country'
                  ? '#f59e0b'
                  : '#8b5cf6';

              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x || 0}, ${node.y || 0})`}
                  className="cursor-pointer group"
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    draggedNodeRef.current = node;
                  }}
                  onMouseEnter={() => setHoveredNode(node)}
                  onMouseLeave={() => setHoveredNode(null)}
                >
                  <circle
                    r={radius}
                    fill={fillColor}
                    stroke={isMatch || isHovered ? '#ffffff' : 'rgba(0,0,0,0.15)'}
                    strokeWidth={isMatch || isHovered ? 3 : 1}
                    className="transition-all"
                  />
                  {/* Label */}
                  <text
                    y={radius + 12}
                    textAnchor="middle"
                    fontSize={isMatch || isHovered ? 11 : 9}
                    fontWeight={isMatch || isHovered ? 700 : 500}
                    fill="currentColor"
                    className="pointer-events-none drop-shadow-xs"
                  >
                    {node.name.length > 20 ? node.name.slice(0, 18) + '…' : node.name}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>

        {/* Hovered Node Details Card */}
        {hoveredNode && (
          <div className="absolute top-3 left-3 bg-[var(--bg)]/95 backdrop-blur-sm border border-[var(--bd)] p-2.5 rounded-lg shadow-lg text-xs max-w-xs pointer-events-none">
            <div className="font-bold text-[var(--fg)] text-sm">{hoveredNode.name}</div>
            <div className="text-[var(--mut)] text-[11px] capitalize mt-0.5">
              Type: {hoveredNode.type}
            </div>
            <div className="mt-1 flex items-center justify-between text-xs pt-1 border-t border-[var(--bd)]">
              <span>Publications / Frequency:</span>
              <span className="font-semibold text-[var(--ac)]">{hoveredNode.weight}</span>
            </div>
            {hoveredNode.secondary && (
              <div className="text-[11px] text-[var(--mut)] mt-1 truncate">
                {hoveredNode.secondary}
              </div>
            )}
          </div>
        )}

        {/* Empty state warning if no nodes */}
        {activeNet.nodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-[var(--mut)]">
            No network co-occurrence data available for {tab}. Run the search & metadata pipeline.
          </div>
        )}
      </div>
    </div>
  );
};
