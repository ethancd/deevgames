/**
 * EMBER — ground-truth (dev) panel (src/ui/panels/GroundTruthPanel.tsx).
 * Pinned props in src/ui/contracts.ts (`GroundTruthPanelProps`).
 *
 * Pure presentational component. Unlike PilotPanel this one IS allowed to
 * read BodyState/WolfEntity directly — that's the point of the dev panel
 * (PLAN.md §6: "ground truth panel is a dev view, never fed to the pilot")
 * — but it still only reads what's handed to it via props, no store
 * subscription.
 */

import type { ReactElement } from 'react';
import type { GroundTruthPanelProps } from '../contracts';
import { BoltIcon, FlameIcon, MoonIcon, ScalesIcon, ShieldIcon, ThermometerIcon } from './icons';
import { GROUND_TRUTH_ROWS, MODE_COLOR, meterColorFor, sparklinePoints, type GroundTruthVar } from './format';

const ROW_ICON: Record<GroundTruthVar, (props: { className?: string }) => ReactElement> = {
  fuel: FlameIcon,
  heat: ThermometerIcon,
  damage: ShieldIcon,
  fatigue: MoonIcon,
  activation: BoltIcon,
  stability: ScalesIcon,
};

function MeterRow({ v, value, history }: { v: GroundTruthVar; value: number; history: readonly number[] }) {
  const color = meterColorFor(v, value);
  const Icon = ROW_ICON[v];
  const geo = sparklinePoints(history, 56, 18);
  const pct = Math.max(0, Math.min(100, value * 100));
  return (
    <li className="flex items-center gap-2 text-xs" data-row={v}>
      <Icon className="shrink-0 text-slate-400" />
      <span className="w-16 shrink-0 text-slate-400">{v}</span>
      <span
        role="img"
        aria-label={`${v} meter, ${value.toFixed(2)}`}
        className="h-1.5 w-24 shrink-0 overflow-hidden rounded-sm bg-slate-800"
      >
        <span className="block h-full rounded-sm" style={{ width: `${pct}%`, backgroundColor: color }} />
      </span>
      <span className="w-10 shrink-0 text-right tabular-nums text-slate-300">{value.toFixed(2)}</span>
      <svg
        viewBox={`0 0 ${geo.width} ${geo.height}`}
        width={geo.width}
        height={geo.height}
        className="ml-1 shrink-0 opacity-80"
        aria-hidden="true"
      >
        {geo.points && (
          <polyline points={geo.points} fill="none" stroke={color} strokeWidth="1" strokeLinejoin="round" />
        )}
      </svg>
    </li>
  );
}

export function GroundTruthPanel({ body, wolf, history }: GroundTruthPanelProps) {
  const colors = MODE_COLOR[body.mode];
  return (
    <section
      aria-label="Ground truth (dev)"
      className="rounded-lg border border-slate-800 bg-slate-900/80 font-sans text-slate-200"
    >
      <header className="border-b border-slate-800 px-3 py-2">
        <h2 className="text-xs font-semibold tracking-[0.15em] text-slate-100">
          GROUND TRUTH <span className="font-normal text-slate-500">(dev)</span>
        </h2>
      </header>

      <ul role="list" aria-label="body meters" className="space-y-1.5 px-3 py-2">
        {GROUND_TRUTH_ROWS.map((v) => (
          <MeterRow key={v} v={v} value={body[v]} history={history.map((h) => h[v])} />
        ))}
      </ul>

      <div className="flex items-center gap-3 border-t border-slate-800 px-3 py-2">
        <span
          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold tracking-wide ${colors.text} ${colors.border}`}
        >
          {body.mode}
        </span>
        <span className="font-mono text-xs text-slate-400">wolf: {wolf.state}</span>
      </div>
    </section>
  );
}
