import { useMemo, useState } from 'react';
import type { Pact, PactKind } from '../types';
import { frontierWeightShares } from '../lib/pactsRandomizer';

interface Props {
  pacts: readonly Pact[];
  unlocked: ReadonlySet<string>;
  recentId: string | null;
  showWeights?: boolean;
}

interface Layout {
  positions: Map<string, { x: number; y: number }>;
  width: number;
  height: number;
}

const NODE_RADIUS: Record<PactKind, number> = {
  minor: 8,
  major: 14,
  capstone: 20,
};

const KIND_LABEL: Record<PactKind, string> = {
  minor: 'Minor',
  major: 'Major',
  capstone: 'Capstone',
};

// 8-point star path for capstones, sized to match capstone radius.
// Coordinates are in SVG units around (0,0); fits within an r=20 circle.
const CAPSTONE_STAR_D =
  'M0,-18 L4,-6 L18,-6 L7,2 L11,16 L0,8 L-11,16 L-7,2 L-18,-6 L-4,-6 Z';
// 4-point diamond for major nodes, fits within r=14.
const MAJOR_DIAMOND_D = 'M0,-9 L9,0 L0,9 L-9,0 Z';

const COL_WIDTH = 220;
const ROW_HEIGHT = 110;
const PADDING = 60;
const NODE_GAP = 70;

export function PactsTree({ pacts, unlocked, recentId, showWeights = false }: Props) {
  const layout = useMemo(() => computeLayout(pacts), [pacts]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const hovered = hoveredId ? pacts.find((p) => p.id === hoveredId) ?? null : null;

  // Dev diagnostic: per-frontier-node probability share. Frontier-only so
  // unlocked/unreachable nodes stay clean.
  const shares = useMemo(
    () => (showWeights ? frontierWeightShares(pacts, unlocked) : null),
    [showWeights, pacts, unlocked],
  );

  // "Eligible" in the new model = adjacent to something already unlocked
  // (the frontier). Non-frontier nodes are still rollable, just with low
  // weight; we don't decorate them as eligible to keep the visual signal
  // honest about where the next roll is most likely to land.
  const eligibleIds = useMemo(() => {
    const out = new Set<string>();
    for (const p of pacts) {
      if (unlocked.has(p.id)) continue;
      if (p.prerequisites.some((req) => unlocked.has(req))) out.add(p.id);
    }
    return out;
  }, [pacts, unlocked]);

  return (
    <div className="pacts-tree-wrap">
      <svg
        className="pacts-tree-svg"
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        role="img"
        aria-label="Demonic Pacts tree"
      >
        <g className="pacts-tree-edges">
          {pacts.flatMap((p) => {
            const to = layout.positions.get(p.id);
            if (!to) return [];
            return p.prerequisites.flatMap((req) => {
              const from = layout.positions.get(req);
              if (!from) return [];
              const isLive = unlocked.has(req) && unlocked.has(p.id);
              return [
                <line
                  key={`${req}->${p.id}`}
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  className={isLive ? 'pacts-edge pacts-edge-live' : 'pacts-edge'}
                />,
              ];
            });
          })}
        </g>
        <g className="pacts-tree-nodes">
          {pacts.map((p) => {
            const pos = layout.positions.get(p.id);
            if (!pos) return null;
            const isUnlocked = unlocked.has(p.id);
            const isRecent = p.id === recentId;
            const isEligible = eligibleIds.has(p.id);
            const r = NODE_RADIUS[p.kind];
            const cls = [
              'pacts-node',
              `pacts-node-${p.kind}`,
              isUnlocked && 'pacts-node-unlocked',
              isRecent && 'pacts-node-recent',
              isEligible && 'pacts-node-eligible',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <g
                key={p.id}
                className={cls}
                transform={`translate(${pos.x}, ${pos.y})`}
                onMouseEnter={() => setHoveredId(p.id)}
                onMouseLeave={() => setHoveredId((cur) => (cur === p.id ? null : cur))}
                onFocus={() => setHoveredId(p.id)}
                onBlur={() => setHoveredId((cur) => (cur === p.id ? null : cur))}
                tabIndex={0}
                aria-label={`${p.name} — ${KIND_LABEL[p.kind]} pact${isUnlocked ? ', unlocked' : ''}`}
              >
                <circle r={r} className="pacts-node-circle" />
                {renderInner(p, r)}
                {shares && shares.has(p.id) && (
                  <text
                    className="pacts-node-weight"
                    y={r + 16}
                    textAnchor="middle"
                  >
                    {Math.round(shares.get(p.id)! * 100)}%
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>
      {hovered && (
        <div className="pacts-tooltip" role="tooltip">
          <div className="pacts-tooltip-head">
            <strong>{hovered.name}</strong>
            <span className={`pacts-tooltip-kind pacts-tooltip-kind-${hovered.kind}`}>
              {KIND_LABEL[hovered.kind]}
            </span>
          </div>
          <div className="pacts-tooltip-branch">{hovered.branch}</div>
          {hovered.effect && <p className="pacts-tooltip-effect">{hovered.effect}</p>}
          {hovered.prerequisites.length > 0 && (
            <div className="pacts-tooltip-prereqs">
              Requires: {hovered.prerequisites.map((id) => labelFor(id, pacts)).join(', ')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function labelFor(id: string, pacts: readonly Pact[]): string {
  return pacts.find((p) => p.id === id)?.name ?? id;
}

// Render the inner content of a node. Prefer the wiki icon (downloaded by
// scripts/download-pact-icons.mjs) when available; otherwise fall back to
// a kind-keyed geometric glyph so unmatched nodes still read at a glance.
function renderInner(p: Pact, r: number) {
  if (p.iconCode) {
    // Image is sized inside the circle with a small inset so the kind-
    // colored stroke ring stays visible.
    const size = r * 1.7;
    return (
      <image
        href={`pact-icons/Pact_${p.iconCode}.png`}
        x={-size / 2}
        y={-size / 2}
        width={size}
        height={size}
        className="pacts-node-icon"
        preserveAspectRatio="xMidYMid meet"
      />
    );
  }
  switch (p.kind) {
    case 'capstone':
      return <path d={CAPSTONE_STAR_D} className="pacts-node-glyph" />;
    case 'major':
      return <path d={MAJOR_DIAMOND_D} className="pacts-node-glyph" />;
    case 'minor':
      return <circle r={2.5} className="pacts-node-glyph" />;
  }
}

// Layout: if every pact has explicit x/y, use them (translating to a
// non-negative coordinate system since the planner centres its root at
// (0,0) and uses negative coords). Otherwise compute via branch-as-column
// + topological depth-as-row.
function computeLayout(pacts: readonly Pact[]): Layout {
  const allHavePos = pacts.length > 0 && pacts.every((p) => p.x !== undefined && p.y !== undefined);
  if (allHavePos) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of pacts) {
      const x = p.x ?? 0;
      const y = p.y ?? 0;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    const positions = new Map<string, { x: number; y: number }>();
    for (const p of pacts) {
      positions.set(p.id, {
        x: (p.x ?? 0) - minX + PADDING,
        y: (p.y ?? 0) - minY + PADDING,
      });
    }
    return {
      positions,
      width: maxX - minX + PADDING * 2,
      height: maxY - minY + PADDING * 2,
    };
  }

  const depthById = topologicalDepth(pacts);
  const branches = [...new Set(pacts.map((p) => p.branch))];
  branches.sort();
  const branchIdx = new Map(branches.map((b, i) => [b, i]));

  // Bucket: branch+depth → pact[] in stable order
  const buckets = new Map<string, Pact[]>();
  for (const p of pacts) {
    const key = `${p.branch}/${depthById.get(p.id) ?? 0}`;
    const arr = buckets.get(key) ?? [];
    arr.push(p);
    buckets.set(key, arr);
  }

  const positions = new Map<string, { x: number; y: number }>();
  let maxDepth = 0;
  for (const [key, group] of buckets) {
    const [branch, depthStr] = key.split('/');
    const depth = parseInt(depthStr, 10);
    maxDepth = Math.max(maxDepth, depth);
    const bIdx = branchIdx.get(branch) ?? 0;
    const colCenter = PADDING + bIdx * COL_WIDTH + COL_WIDTH / 2;
    const total = group.length;
    group.forEach((p, i) => {
      const offset = (i - (total - 1) / 2) * NODE_GAP;
      positions.set(p.id, {
        x: colCenter + offset,
        y: PADDING + depth * ROW_HEIGHT + ROW_HEIGHT / 2,
      });
    });
  }

  const width = PADDING * 2 + branches.length * COL_WIDTH;
  const height = PADDING * 2 + (maxDepth + 1) * ROW_HEIGHT;
  return { positions, width, height };
}

function topologicalDepth(pacts: readonly Pact[]): Map<string, number> {
  const byId = new Map(pacts.map((p) => [p.id, p]));
  const depth = new Map<string, number>();
  const inProgress = new Set<string>();
  function visit(id: string): number {
    if (depth.has(id)) return depth.get(id)!;
    if (inProgress.has(id)) return 0; // cycle guard
    inProgress.add(id);
    const p = byId.get(id);
    if (!p || p.prerequisites.length === 0) {
      depth.set(id, 0);
      inProgress.delete(id);
      return 0;
    }
    let max = 0;
    for (const r of p.prerequisites) {
      max = Math.max(max, visit(r) + 1);
    }
    depth.set(id, max);
    inProgress.delete(id);
    return max;
  }
  for (const p of pacts) visit(p.id);
  return depth;
}
