// ACT MAP — the run's spine. A branching column of nodes from bottom (start)
// to top (boss), with drawn path lines so the DAG's connectivity is visible:
// every `node.next` edge is rendered, and the edges leading OUT of where you
// stand glow verdigris so it's obvious why your next choices are what they are.
// Reachable nodes glow; everything else is dimmed bone. Engine owns reachability
// via each node's `next`; the UI only renders and gates taps.
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { RunState } from '../engine';
import { ArmyPip, GoldPip, HudShell } from '../components/StatBar';
import { HeroDollStrip } from '../components/HeroDoll';
import { nodeIcon, NODE_LABEL } from '../components/icons-for-node';

type Pt = { x: number; y: number };

export function MapScreen({
  run,
  onChoose,
  onOpenDoll,
}: {
  run: RunState;
  onChoose: (nodeId: string) => void;
  onOpenDoll?: () => void;
}) {
  const rows = useMemo(() => {
    const maxRow = Math.max(...run.map.map((n) => n.row));
    const out: (typeof run.map)[] = [];
    for (let r = 0; r <= maxRow; r++) out.push(run.map.filter((n) => n.row === r));
    return out;
  }, [run.map]);

  // Reachable = next-of-current, or the whole bottom row at run start.
  const reachable = useMemo(() => {
    if (run.currentNodeId == null) {
      const minRow = Math.min(...run.map.map((n) => n.row));
      return new Set(run.map.filter((n) => n.row === minRow).map((n) => n.id));
    }
    const cur = run.map.find((n) => n.id === run.currentNodeId);
    return new Set(cur?.next ?? []);
  }, [run.map, run.currentNodeId]);

  // The trail you've walked (visited nodes incl. where you stand now).
  const trail = useMemo(() => {
    const s = new Set(run.clearedNodeIds ?? []);
    if (run.currentNodeId) s.add(run.currentNodeId);
    return s;
  }, [run.clearedNodeIds, run.currentNodeId]);

  // Everything still reachable going forward from where you stand (BFS over
  // `next`). Before you've chosen a start node the whole map is open.
  const forward = useMemo(() => {
    const s = new Set<string>();
    if (run.currentNodeId == null) {
      run.map.forEach((n) => s.add(n.id));
      return s;
    }
    const byId = new Map(run.map.map((n) => [n.id, n]));
    const stack = [run.currentNodeId];
    while (stack.length) {
      const id = stack.pop()!;
      if (s.has(id)) continue;
      s.add(id);
      byId.get(id)?.next.forEach((nx) => stack.push(nx));
    }
    return s;
  }, [run.map, run.currentNodeId]);

  // Classify a node into a visual tier.
  const tierOf = (id: string): 'current' | 'reachable' | 'trail' | 'open' | 'locked' => {
    if (id === run.currentNodeId) return 'current';
    if (reachable.has(id)) return 'reachable';
    if (trail.has(id)) return 'trail';
    if (forward.has(id)) return 'open';
    return 'locked';
  };

  // --- measured node centres, for drawing the path lines --------------------
  const fieldRef = useRef<HTMLDivElement>(null);
  const nodeEls = useRef(new Map<string, HTMLButtonElement>());
  const [pts, setPts] = useState<Record<string, Pt>>({});
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  const setNodeRef = useCallback((id: string) => (el: HTMLButtonElement | null) => {
    if (el) nodeEls.current.set(id, el);
    else nodeEls.current.delete(id);
  }, []);

  const measure = useCallback(() => {
    const field = fieldRef.current;
    if (!field) return;
    const f = field.getBoundingClientRect();
    const next: Record<string, Pt> = {};
    for (const [id, el] of nodeEls.current) {
      const r = el.getBoundingClientRect();
      next[id] = { x: r.left - f.left + r.width / 2, y: r.top - f.top + r.height / 2 };
    }
    setPts(next);
    setSize({ w: field.scrollWidth, h: field.scrollHeight });
  }, []);

  useLayoutEffect(() => {
    measure();
    const field = fieldRef.current;
    if (!field || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(field);
    return () => ro.disconnect();
  }, [measure, run.map]);

  // Edges from each node to its `next`, classified for styling: the walked
  // TRAIL (both ends visited), the LIVE choices out of where you stand, OPEN
  // edges you can still reach, and LOCKED branches you no longer can.
  const edges = useMemo(() => {
    const kindOf = (from: string, to: string): 'trail' | 'live' | 'open' | 'locked' => {
      if (trail.has(from) && trail.has(to)) return 'trail';
      if (from === run.currentNodeId) return 'live';
      if (forward.has(from)) return 'open';
      return 'locked';
    };
    return run.map.flatMap((n) =>
      n.next.map((to) => ({ from: n.id, to, kind: kindOf(n.id, to) })),
    );
  }, [run.map, run.currentNodeId, trail, forward]);

  const EDGE_STYLE = {
    trail: { cls: 'stroke-bone-500', w: 2, o: 0.7 },
    live: { cls: 'stroke-verd-300', w: 2.5, o: 0.95 },
    open: { cls: 'stroke-verd-500', w: 1.5, o: 0.45 },
    locked: { cls: 'stroke-grave-600', w: 1, o: 0.25 },
  } as const;

  return (
    <div className="flex h-full flex-col bg-necropolis">
      <HudShell>
        <div className="flex items-center gap-3">
          <ArmyPip army={run.army} />
          <GoldPip gold={run.gold} />
        </div>
        <div className="font-display text-sm tracking-widest text-verd-300">
          ACT {run.act}
        </div>
      </HudShell>

      <div className="flex-1 overflow-y-auto px-4 py-6">
        <h2 className="mb-4 text-center font-display text-lg tracking-[0.2em] text-bone-300 engraved">
          THE NECROPOLIS SPIRE
        </h2>

        {/* Positioned field: SVG path lines beneath, the node rows above. */}
        <div ref={fieldRef} className="relative mx-auto max-w-sm">
          <svg
            className="pointer-events-none absolute inset-0"
            width={size.w}
            height={size.h}
            aria-hidden
          >
            {edges.map(({ from, to, kind }) => {
              const a = pts[from];
              const b = pts[to];
              if (!a || !b) return null;
              const my = (a.y + b.y) / 2;
              const d = `M ${a.x} ${a.y} C ${a.x} ${my}, ${b.x} ${my}, ${b.x} ${b.y}`;
              const st = EDGE_STYLE[kind];
              return (
                <path
                  key={`${from}->${to}`}
                  d={d}
                  fill="none"
                  className={st.cls}
                  strokeWidth={st.w}
                  strokeLinecap="round"
                  opacity={st.o}
                />
              );
            })}
          </svg>

          {/* Boss at top → start at bottom: render rows reversed. */}
          <div className="relative flex flex-col-reverse gap-7">
            {rows.map((rowNodes, idx) => (
              <div
                key={idx}
                className="flex items-center justify-center gap-6"
                data-testid="map-row"
              >
                {rowNodes.map((node) => {
                  const tier = tierOf(node.id);
                  const isReachable = tier === 'reachable';
                  return (
                    <button
                      key={node.id}
                      ref={setNodeRef(node.id)}
                      type="button"
                      data-testid="map-node"
                      data-node-type={node.type}
                      data-reachable={isReachable}
                      data-tier={tier}
                      disabled={!isReachable}
                      onClick={() => isReachable && onChoose(node.id)}
                      aria-label={`${NODE_LABEL[node.type]} node${isReachable ? ', available' : tier === 'trail' ? ', visited' : tier === 'locked' ? ', unreachable' : ''}`}
                      className={[
                        'flex h-16 w-16 flex-col items-center justify-center rounded-full border-2 text-2xl transition',
                        tier === 'current' ? 'border-bone-100 bg-verd-700 text-bone-100' : '',
                        tier === 'reachable'
                          ? 'border-verd-300 bg-grave-700 text-verd-300 animate-pulse-blood active:scale-90'
                          : '',
                        tier === 'trail' ? 'border-bone-500 bg-grave-700 text-bone-400' : '',
                        tier === 'open' ? 'border-grave-600 bg-grave-800 text-bone-500 opacity-60' : '',
                        tier === 'locked' ? 'border-grave-700 bg-grave-900 text-bone-600 opacity-30 grayscale' : '',
                        node.type === 'boss' ? 'h-20 w-20 border-blood-500 text-blood-400' : '',
                      ].join(' ')}
                    >
                      {nodeIcon(node.type)}
                      <span className="mt-0.5 text-[0.5rem] uppercase tracking-wider">
                        {NODE_LABEL[node.type]}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        <p className="mt-6 text-center text-xs italic text-bone-500">
          Climb toward the Lich King. Follow a glowing path.
        </p>
      </div>

      <HeroDollStrip hero={run.hero} onOpen={onOpenDoll} />
    </div>
  );
}
