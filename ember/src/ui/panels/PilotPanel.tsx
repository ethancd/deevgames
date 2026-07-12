/**
 * EMBER — pilot-view panel (src/ui/panels/PilotPanel.tsx). Pinned props in
 * src/ui/contracts.ts (`PilotPanelProps`).
 *
 * Pure presentational component: renders EXACTLY from the ContextPacket (+
 * the separately-passed `intent`/`narrationEnabled` props) — no store
 * subscription, no reach into BodyState/WorldState. That's the whole point
 * of this panel per PLAN.md §6: it's what the pilot itself would see, never
 * ground truth. See PilotPanel.test.tsx's "identical BodyStates -> identical
 * output" test for the purity check this buys.
 */

import type { Bucket, Intent } from '../../core/types';
import type { PilotPanelProps } from '../contracts';
import {
  GLOBAL_ROWS,
  INTENT_TINT_CLASSES,
  bucketColorClass,
  bucketLabel,
  parseTrend,
  summarizeParams,
  tintForSkill,
  type GlobalRowKey,
} from './format';
import { IntentDangerIcon, IntentMoveIcon, IntentNeutralIcon, IntentRestIcon } from './icons';

const ROW_LABEL: Record<GlobalRowKey, string> = {
  capacity: 'capacity',
  activation: 'activation',
  stability: 'stability',
  temperature: 'temperature',
};

function GlobalRow({
  row,
  bucket,
  confidencePct,
  trend,
}: {
  row: GlobalRowKey;
  bucket: Bucket;
  confidencePct: number;
  trend: ReturnType<typeof parseTrend>;
}) {
  const showArrow = trend !== null && trend.row === row;
  return (
    <div className="flex items-baseline gap-2 text-xs" data-row={row}>
      <span className="w-24 shrink-0 text-slate-400">{ROW_LABEL[row]}:</span>
      <span className={`inline-flex items-center gap-1 font-semibold ${bucketColorClass(row, bucket)}`}>
        {bucketLabel(row, bucket)}
        {showArrow && (
          <span aria-label={trend!.rising ? 'rising' : 'falling'} title={trend!.rising ? 'rising' : 'falling'}>
            {trend!.rising ? '▲' : '▼'}
          </span>
        )}
      </span>
      <span className="ml-auto tabular-nums text-slate-500">{confidencePct}%</span>
    </div>
  );
}

function DriveRow({ drive, urgency }: { drive: string; urgency: number }) {
  const pct = Math.max(0, Math.min(100, urgency * 100));
  return (
    <li className="flex items-center gap-2 text-xs">
      <span className="w-16 shrink-0 truncate text-slate-400">{drive}</span>
      <span className="h-1.5 flex-1 overflow-hidden rounded-sm bg-slate-800">
        <span className="block h-full rounded-sm bg-amber-500" style={{ width: `${pct}%` }} />
      </span>
      <span className="w-10 text-right tabular-nums text-slate-400">{urgency.toFixed(2)}</span>
    </li>
  );
}

function intentGlyph(tint: ReturnType<typeof tintForSkill>) {
  const cls = INTENT_TINT_CLASSES[tint].icon;
  if (tint === 'amber') return <IntentDangerIcon className={cls} />;
  if (tint === 'violet') return <IntentRestIcon className={cls} />;
  if (tint === 'teal') return <IntentMoveIcon className={cls} />;
  return <IntentNeutralIcon className={cls} />;
}

function IntentBanner({ intent, narrationEnabled }: { intent: Intent | null; narrationEnabled: boolean }) {
  const tint = intent ? tintForSkill(intent.skill) : 'gray';
  const classes = INTENT_TINT_CLASSES[tint];
  const bodyText = intent ? `skill: ${intent.skill} → ${summarizeParams(intent)}` : 'skill: none — awaiting decision';
  const goal = intent?.goal;
  return (
    <div className={`rounded-md border px-3 py-2 ${classes.bg} ${classes.border}`} role="status" aria-label="current intent">
      <div className={`flex items-center gap-2 text-xs font-medium ${classes.text}`}>
        {intentGlyph(tint)}
        <span>{bodyText}</span>
      </div>
      {narrationEnabled && goal ? <p className="mt-1 pl-5 text-[11px] italic text-slate-400">{goal}</p> : null}
    </div>
  );
}

export function PilotPanel({ packet, intent, narrationEnabled }: PilotPanelProps) {
  return (
    <section
      aria-label="Pilot view"
      className="rounded-lg border border-slate-800 bg-slate-900/80 font-sans text-slate-200"
    >
      <header className="border-b border-slate-800 px-3 py-2">
        <h2 className="text-xs font-semibold tracking-[0.15em] text-slate-100">PILOT VIEW</h2>
      </header>

      {packet === null ? (
        <p role="status" className="px-3 py-6 text-center text-xs italic text-slate-500">
          no pilot consultation yet
        </p>
      ) : (
        <div className="space-y-3 px-3 py-2">
          <div>
            <h3 className="mb-1 text-[11px] tracking-[0.15em] text-slate-500">INTEROCEPTION</h3>
            <div role="list" aria-label="interoception readings" className="space-y-0.5">
              {GLOBAL_ROWS.map((row) => {
                const bucket = packet.interoception.global[row];
                const confidencePct = Math.round(packet.interoception.global.confidence * 100);
                const trend = parseTrend(packet.interoception.global.trend);
                return (
                  <div role="listitem" key={row}>
                    <GlobalRow row={row} bucket={bucket} confidencePct={confidencePct} trend={trend} />
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <h3 className="mb-1 text-[11px] tracking-[0.15em] text-slate-500">DRIVES</h3>
            <ul role="list" aria-label="drives" className="space-y-1">
              {packet.interoception.drives.map((d) => (
                <DriveRow key={d.drive} drive={d.drive} urgency={d.urgency} />
              ))}
            </ul>
          </div>

          <IntentBanner intent={intent ?? packet.activeIntent?.intent ?? null} narrationEnabled={narrationEnabled} />
        </div>
      )}
    </section>
  );
}
