// ACT MAP — the run's spine. A branching column of nodes from bottom (start)
// to top (boss). Reachable nodes glow verdigris; everything else is dimmed
// bone. Tapping a reachable node enters it. Engine owns reachability via each
// node's `next`; the UI only renders and gates taps.
import { useMemo } from 'react';
import type { RunState } from '../engine';
import { HpPip, GoldPip, HudShell } from '../components/StatBar';
import { RelicBar } from '../components/RelicBar';
import { nodeIcon, NODE_LABEL } from '../components/icons-for-node';

export function MapScreen({
  run,
  onChoose,
}: {
  run: RunState;
  onChoose: (nodeId: string) => void;
}) {
  const rows = useMemo(() => {
    const maxRow = Math.max(...run.map.map((n) => n.row));
    const out: typeof run.map[] = [];
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

  return (
    <div className="flex h-full flex-col bg-necropolis">
      <HudShell>
        <div className="flex items-center gap-3">
          <HpPip hp={run.hp} maxHp={run.maxHp} />
          <GoldPip gold={run.gold} />
        </div>
        <div className="font-display text-sm tracking-widest text-verd-300">
          ACT {run.act}
        </div>
      </HudShell>

      <div className="border-b border-verd-700 bg-grave-900/60">
        <RelicBar relics={run.relics} />
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6">
        <h2 className="mb-4 text-center font-display text-lg tracking-[0.2em] text-bone-300 engraved">
          THE NECROPOLIS SPIRE
        </h2>
        {/* Boss at top → start at bottom: render rows reversed. */}
        <div className="mx-auto flex max-w-sm flex-col-reverse gap-7">
          {rows.map((rowNodes, idx) => (
            <div
              key={idx}
              className="flex items-center justify-center gap-6"
              data-testid="map-row"
            >
              {rowNodes.map((node) => {
                const isReachable = reachable.has(node.id);
                const isCurrent = node.id === run.currentNodeId;
                return (
                  <button
                    key={node.id}
                    type="button"
                    data-testid="map-node"
                    data-node-type={node.type}
                    data-reachable={isReachable}
                    disabled={!isReachable}
                    onClick={() => isReachable && onChoose(node.id)}
                    aria-label={`${NODE_LABEL[node.type]} node${isReachable ? ', available' : ''}`}
                    className={[
                      'flex h-16 w-16 flex-col items-center justify-center rounded-full border-2 text-2xl transition',
                      isCurrent ? 'border-bone-100 bg-verd-700' : '',
                      isReachable && !isCurrent
                        ? 'border-verd-300 bg-grave-700 text-verd-300 animate-pulse-blood active:scale-90'
                        : '',
                      !isReachable && !isCurrent
                        ? 'border-grave-600 bg-grave-800 text-bone-500 opacity-50'
                        : '',
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
        <p className="mt-6 text-center text-xs italic text-bone-500">
          Climb toward the Lich King. Tap a glowing path.
        </p>
      </div>
    </div>
  );
}
