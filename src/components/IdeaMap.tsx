"use client";

import { useMemo, useState } from "react";
import { Lightbulb, Link2, Network, Sparkles } from "lucide-react";
import type { IdeaGraph, IdeaGraphEdge, IdeaGraphNode, IdeaThought } from "@/lib/types";
import { NavToggleButton } from "@/components/IdeaSidebar";
import { cn } from "@/lib/utils";

const WIDTH = 900;
const HEIGHT = 640;
const PADDING = 60;

// Distinct, theme-friendly cluster colors. Related ideas (same group) share one.
const CLUSTER_COLORS = [
  "#f59e0b", // amber
  "#3b82f6", // blue
  "#10b981", // emerald
  "#a855f7", // purple
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#ef4444", // red
  "#84cc16", // lime
  "#f97316", // orange
  "#14b8a6", // teal
];

function clusterColor(index: number): string {
  return CLUSTER_COLORS[index % CLUSTER_COLORS.length];
}

interface Point {
  x: number;
  y: number;
}

/** Deterministic pseudo-random in [0, 1) from a string seed. */
function seededUnit(seed: string, salt: number): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

/**
 * Hand-rolled, dependency-free force-directed layout. Deterministic (seeded by
 * node id) so the map is stable across renders. Clusters are nudged apart and
 * linked ideas pulled together, with stronger links pulling harder.
 */
function computeLayout(
  nodes: IdeaGraphNode[],
  edges: IdeaGraphEdge[]
): Map<string, Point> {
  const positions = new Map<string, Point>();
  const n = nodes.length;
  if (n === 0) return positions;

  const cx = WIDTH / 2;
  const cy = HEIGHT / 2;

  const clusterCount = Math.max(1, new Set(nodes.map((nd) => nd.groupIndex)).size);
  nodes.forEach((node) => {
    // Seed each cluster in its own arc of a ring, then jitter per node.
    const clusterAngle = (node.groupIndex / clusterCount) * Math.PI * 2;
    const clusterR = clusterCount > 1 ? Math.min(WIDTH, HEIGHT) * 0.28 : 0;
    const jitterA = seededUnit(node.id, 1) * Math.PI * 2;
    const jitterR = 40 + seededUnit(node.id, 2) * 90;
    positions.set(node.id, {
      x: cx + Math.cos(clusterAngle) * clusterR + Math.cos(jitterA) * jitterR,
      y: cy + Math.sin(clusterAngle) * clusterR + Math.sin(jitterA) * jitterR,
    });
  });

  if (n === 1) {
    positions.set(nodes[0].id, { x: cx, y: cy });
    return positions;
  }

  const area = (WIDTH - PADDING * 2) * (HEIGHT - PADDING * 2);
  const k = Math.sqrt(area / n); // ideal distance
  const iterations = 320;

  for (let iter = 0; iter < iterations; iter++) {
    const disp = new Map<string, Point>();
    for (const node of nodes) disp.set(node.id, { x: 0, y: 0 });

    // Repulsion between every pair.
    for (let i = 0; i < n; i++) {
      const a = positions.get(nodes[i].id)!;
      for (let j = i + 1; j < n; j++) {
        const b = positions.get(nodes[j].id)!;
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let dist = Math.hypot(dx, dy);
        if (dist < 0.01) {
          dx = (seededUnit(nodes[i].id + nodes[j].id, iter) - 0.5) * 0.5;
          dy = (seededUnit(nodes[j].id + nodes[i].id, iter) - 0.5) * 0.5;
          dist = Math.hypot(dx, dy) || 0.01;
        }
        // Same-cluster nodes repel a little less so they stay grouped.
        const sameCluster = nodes[i].groupIndex === nodes[j].groupIndex;
        const rep = ((k * k) / dist) * (sameCluster ? 0.55 : 1);
        const fx = (dx / dist) * rep;
        const fy = (dy / dist) * rep;
        const da = disp.get(nodes[i].id)!;
        const db = disp.get(nodes[j].id)!;
        da.x += fx;
        da.y += fy;
        db.x -= fx;
        db.y -= fy;
      }
    }

    // Attraction along edges (stronger score pulls harder).
    for (const edge of edges) {
      const a = positions.get(edge.source);
      const b = positions.get(edge.target);
      if (!a || !b) continue;
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const dist = Math.hypot(dx, dy) || 0.01;
      const strength = 0.5 + Math.min(1, Math.max(0, edge.score));
      const attr = ((dist * dist) / k) * strength;
      const fx = (dx / dist) * attr;
      const fy = (dy / dist) * attr;
      const da = disp.get(edge.source)!;
      const db = disp.get(edge.target)!;
      da.x -= fx;
      da.y -= fy;
      db.x += fx;
      db.y += fy;
    }

    // Cool down over time; apply displacement with a max step.
    const temp = (1 - iter / iterations) * (k * 0.9);
    for (const node of nodes) {
      const p = positions.get(node.id)!;
      const d = disp.get(node.id)!;
      // Gentle gravity toward center keeps disconnected nodes on screen.
      d.x += (cx - p.x) * 0.012;
      d.y += (cy - p.y) * 0.012;
      const len = Math.hypot(d.x, d.y) || 0.01;
      p.x += (d.x / len) * Math.min(len, temp);
      p.y += (d.y / len) * Math.min(len, temp);
      p.x = Math.max(PADDING, Math.min(WIDTH - PADDING, p.x));
      p.y = Math.max(PADDING, Math.min(HEIGHT - PADDING, p.y));
    }
  }

  return positions;
}

interface IdeaMapProps {
  graph: IdeaGraph;
  thoughts?: IdeaThought[];
  onSelectIdea: (ideaId: string) => void;
  onOpenSidebar?: () => void;
  sidebarOpen?: boolean;
  showSidebarToggleOnDesktop?: boolean;
}

export function IdeaMap({
  graph,
  thoughts = [],
  onSelectIdea,
  onOpenSidebar,
  sidebarOpen = false,
  showSidebarToggleOnDesktop = false,
}: IdeaMapProps) {
  const { nodes, edges } = graph;
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<number | null>(null);

  const positions = useMemo(() => computeLayout(nodes, edges), [nodes, edges]);

  const degree = useMemo(() => {
    const d = new Map<string, number>();
    for (const e of edges) {
      d.set(e.source, (d.get(e.source) ?? 0) + 1);
      d.set(e.target, (d.get(e.target) ?? 0) + 1);
    }
    return d;
  }, [edges]);

  const nodeById = useMemo(() => {
    const m = new Map<string, IdeaGraphNode>();
    for (const nd of nodes) m.set(nd.id, nd);
    return m;
  }, [nodes]);

  const clusters = useMemo(() => {
    const seen = new Map<number, { index: number; label: string; count: number }>();
    for (const nd of nodes) {
      const c = seen.get(nd.groupIndex);
      if (c) c.count += 1;
      else seen.set(nd.groupIndex, { index: nd.groupIndex, label: nd.groupLabel, count: 1 });
    }
    return [...seen.values()].sort((a, b) => a.index - b.index);
  }, [nodes]);

  const connectedToHover = useMemo(() => {
    if (!hoveredNode) return new Set<string>();
    const set = new Set<string>();
    for (const e of edges) {
      if (e.source === hoveredNode) set.add(e.target);
      if (e.target === hoveredNode) set.add(e.source);
    }
    return set;
  }, [hoveredNode, edges]);

  const hoveredEdgeData = hoveredEdge !== null ? edges[hoveredEdge] : null;
  const hoveredNodeData = hoveredNode ? nodeById.get(hoveredNode) : null;

  if (nodes.length === 0) {
    return (
      <div className="flex h-full flex-col">
        {onOpenSidebar && (
          <header
            className={cn(
              "border-b border-zinc-800 px-3 py-2",
              !showSidebarToggleOnDesktop && "md:hidden"
            )}
          >
            <NavToggleButton
              onClick={onOpenSidebar}
              open={sidebarOpen}
              visibleOnDesktop={showSidebarToggleOnDesktop}
            />
          </header>
        )}
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <Network className="h-10 w-10 text-zinc-700" />
          <p className="text-sm font-medium text-zinc-300">No ideas to map yet</p>
          <p className="max-w-sm text-xs text-zinc-500">
            Describe products, feedback, or concepts in the chat. As ideas accumulate, this map
            shows how they connect — related topics cluster together and links show why.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-zinc-800 px-4 py-3">
        <div className="flex items-start gap-2">
          {onOpenSidebar && (
            <NavToggleButton
              onClick={onOpenSidebar}
              open={sidebarOpen}
              visibleOnDesktop={showSidebarToggleOnDesktop}
            />
          )}
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-lg font-semibold text-white">
              <Network className="h-5 w-5 text-amber-400" />
              Idea Map
            </h1>
            <p className="flex items-center gap-1.5 text-xs text-zinc-500">
              <Sparkles className="h-3 w-3" />
              {nodes.length} ideas · {edges.length} connections · related topics share a color
            </p>
          </div>
        </div>
      </header>

      <div className="relative flex-1 overflow-hidden">
        {edges.length === 0 && (
          <div className="pointer-events-none absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-full border border-zinc-700/60 bg-zinc-900/80 px-3 py-1 text-[11px] text-zinc-400">
            No connections yet — keep exploring related ideas and links will appear.
          </div>
        )}

        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="xMidYMid meet"
          className="h-full w-full"
          role="img"
          aria-label="Interactive map of connected ideas"
        >
          {/* Edges */}
          {edges.map((edge, i) => {
            const a = positions.get(edge.source);
            const b = positions.get(edge.target);
            if (!a || !b) return null;
            const isHovered = hoveredEdge === i;
            const touchesHoverNode =
              hoveredNode === edge.source || hoveredNode === edge.target;
            const active = isHovered || touchesHoverNode;
            const strength = Math.min(1, Math.max(0, edge.score));
            const width = 1 + strength * 5;
            const baseOpacity = 0.18 + strength * 0.45;
            const dimmed = (hoveredNode && !touchesHoverNode) || (hoveredEdge !== null && !isHovered);
            return (
              <line
                key={`${edge.source}-${edge.target}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={active ? "#fbbf24" : "#71717a"}
                strokeWidth={active ? width + 1.5 : width}
                strokeOpacity={dimmed ? 0.08 : active ? 0.95 : baseOpacity}
                strokeLinecap="round"
                className="cursor-pointer transition-[stroke-opacity]"
                onMouseEnter={() => setHoveredEdge(i)}
                onMouseLeave={() => setHoveredEdge((cur) => (cur === i ? null : cur))}
              >
                <title>{`${edge.reason} (strength ${(edge.score * 100).toFixed(0)}%)`}</title>
              </line>
            );
          })}

          {/* Nodes */}
          {nodes.map((node) => {
            const p = positions.get(node.id);
            if (!p) return null;
            const color = clusterColor(node.groupIndex);
            const isHovered = node.id === hoveredNode;
            const isNeighbor = connectedToHover.has(node.id);
            const dimmed = Boolean(hoveredNode) && !isHovered && !isNeighbor;
            const r = 9 + Math.min(10, (degree.get(node.id) ?? 0) * 2);
            const label = node.title.length > 26 ? `${node.title.slice(0, 24)}…` : node.title;
            return (
              <g
                key={node.id}
                transform={`translate(${p.x} ${p.y})`}
                className="cursor-pointer"
                opacity={dimmed ? 0.35 : 1}
                onMouseEnter={() => setHoveredNode(node.id)}
                onMouseLeave={() => setHoveredNode((cur) => (cur === node.id ? null : cur))}
                onClick={() => onSelectIdea(node.id)}
              >
                {isHovered && (
                  <circle r={r + 6} fill={color} opacity={0.18} />
                )}
                <circle
                  r={r}
                  fill={color}
                  fillOpacity={isHovered || isNeighbor ? 0.95 : 0.75}
                  stroke={isHovered ? "#fff" : color}
                  strokeWidth={isHovered ? 2.5 : 1.5}
                />
                <text
                  y={r + 14}
                  textAnchor="middle"
                  className="pointer-events-none select-none"
                  fontSize={13}
                  fill={isHovered ? "#f4f4f5" : "#a1a1aa"}
                  fontWeight={isHovered ? 600 : 400}
                >
                  {label}
                </text>
                <title>{node.summary || node.title}</title>
              </g>
            );
          })}
        </svg>

        {/* Detail / legend panel */}
        <div className="pointer-events-none absolute bottom-3 left-3 max-w-[19rem] rounded-lg border border-zinc-800 bg-zinc-950/85 p-3 text-xs backdrop-blur">
          {hoveredEdgeData ? (
            <div>
              <div className="flex items-center gap-1.5 font-medium text-amber-300">
                <Link2 className="h-3.5 w-3.5" />
                Connection
              </div>
              <p className="mt-1 text-zinc-300">
                <span className="text-zinc-100">
                  {nodeById.get(hoveredEdgeData.source)?.title}
                </span>
                <span className="text-zinc-600"> ↔ </span>
                <span className="text-zinc-100">
                  {nodeById.get(hoveredEdgeData.target)?.title}
                </span>
              </p>
              <p className="mt-1 text-zinc-400">{hoveredEdgeData.reason}</p>
              <p className="mt-1 text-[10px] uppercase tracking-wide text-zinc-600">
                Strength {(hoveredEdgeData.score * 100).toFixed(0)}%
              </p>
            </div>
          ) : hoveredNodeData ? (
            <div>
              <div className="flex items-center gap-1.5 font-medium text-amber-300">
                <Lightbulb className="h-3.5 w-3.5" />
                {hoveredNodeData.title}
              </div>
              {hoveredNodeData.summary && (
                <p className="mt-1 line-clamp-3 text-zinc-400">{hoveredNodeData.summary}</p>
              )}
              {hoveredNodeData.tags.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {hoveredNodeData.tags.map((t) => (
                    <span
                      key={t}
                      className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] uppercase text-zinc-500"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
              {thoughts.filter((t) => t.ideaId === hoveredNodeData.id).length > 0 && (
                <div className="mt-2 max-h-32 overflow-y-auto border-t border-zinc-800 pt-2">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                    Thoughts across chats
                  </p>
                  <ul className="mt-1 space-y-1">
                    {thoughts
                      .filter((t) => t.ideaId === hoveredNodeData.id)
                      .slice(0, 5)
                      .map((t) => (
                        <li key={t.id} className="text-[10px] text-zinc-500">
                          <span className="text-zinc-400">{t.sessionTitle}:</span> {t.excerpt}
                        </li>
                      ))}
                  </ul>
                </div>
              )}
              <p className="mt-1.5 text-[10px] text-zinc-600">Click to open that chat</p>
            </div>
          ) : (
            <div>
              <p className="mb-1.5 font-medium text-zinc-300">Clusters</p>
              <ul className="space-y-1">
                {clusters.slice(0, 6).map((c) => (
                  <li key={c.index} className="flex items-center gap-2 text-zinc-400">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: clusterColor(c.index) }}
                    />
                    <span className="truncate">{c.label}</span>
                    <span className="ml-auto shrink-0 text-zinc-600">{c.count}</span>
                  </li>
                ))}
              </ul>
              <p className={cn("mt-2 text-[10px] text-zinc-600")}>
                Hover a node for thoughts from your chats · click to open that conversation
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
