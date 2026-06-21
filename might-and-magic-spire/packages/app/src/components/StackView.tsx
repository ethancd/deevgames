// One creature STACK on the battlefield: a portrait, a wax-seal COUNT medallion
// (the headline number — HoMM3 reads stacks by count, not a hp bar), a thin
// top-HP sliver for the lead creature, speed/rank marks, ability chips, and —
// for enemy stacks — the honest TELEGRAPH of its coming action. Replaces
// EnemyView. All touch; tapping dispatches the parent's onTap.
import type { Stack } from '../engine';
import { ContentImage } from '../chrome/ContentImage';
import { SwordIcon, ShieldIcon, ShootIcon, QuestionIcon, FlameIcon } from '../chrome/icons';
import { FloatingNumber, type FloatKind } from './FloatingNumber';

function TelegraphBadge({ stack }: { stack: Stack }) {
  const t = stack.telegraph;
  if (!t) return null;
  const icon =
    t.kind === 'attack' ? <SwordIcon /> :
    t.kind === 'shoot' ? <ShootIcon /> :
    t.kind === 'defend' ? <ShieldIcon /> :
    t.kind === 'cast' ? <FlameIcon /> :
    <QuestionIcon />;
  const tone =
    t.kind === 'attack' || t.kind === 'shoot'
      ? 'text-blood-400 border-blood-500'
      : t.kind === 'cast'
        ? 'text-necro-400 border-necro-400/60'
        : 'text-verd-300 border-verd-500';
  return (
    <div
      data-testid="telegraph"
      data-telegraph-kind={t.kind}
      aria-label={`Intent: ${t.label}`}
      className={`flex items-center gap-1 rounded-full border bg-grave-900/85 px-1.5 py-0.5 text-[0.65rem] font-bold ${tone}`}
    >
      <span className="text-xs">{icon}</span>
      {t.value != null && <span className="tabular-nums">{t.value}</span>}
    </div>
  );
}

// Surface the 1-2 most battle-relevant abilities as chips.
const ABILITY_KEYWORDS = ['Ranged', 'Flying', 'Life drain', 'No enemy retaliation', 'Regeneration', 'Curse', 'Dragon'];
function abilityChips(stack: Stack): string[] {
  return stack.abilities
    .filter((a) => ABILITY_KEYWORDS.some((k) => a.toLowerCase().includes(k.toLowerCase())))
    .slice(0, 2);
}

export function StackView({
  stack,
  selected,
  targetable,
  dimmed,
  floats = [],
  onClearFloat,
  onTap,
}: {
  stack: Stack;
  selected?: boolean;
  targetable?: boolean;
  dimmed?: boolean;
  floats?: { id: string; text: string; kind: FloatKind }[];
  onClearFloat?: (id: string) => void;
  onTap?: () => void;
}) {
  const hpPct = Math.max(0, Math.min(100, (stack.hpTop / stack.maxHpPer) * 100));
  const chips = abilityChips(stack);
  const dead = stack.count <= 0;

  return (
    <button
      type="button"
      data-testid="stack"
      data-side={stack.side}
      data-rank={stack.rank}
      data-stack-id={stack.id}
      data-acted={stack.hasActed ? 'true' : 'false'}
      data-defending={stack.isDefending ? 'true' : 'false'}
      disabled={!onTap || dead}
      onClick={onTap}
      aria-label={`${stack.name} ×${stack.count}, ${stack.rank} rank.${stack.telegraph ? ` ${stack.telegraph.label}.` : ''}`}
      className={[
        'relative flex w-[4.7rem] shrink-0 flex-col items-center gap-0.5 rounded-lg p-1 transition',
        selected ? 'ring-2 ring-bone-100' : 'ring-1 ring-transparent',
        targetable ? 'rounded-lg animate-pulse-blood' : '',
        dimmed ? 'opacity-35 grayscale' : '',
        dead ? 'opacity-25 grayscale' : 'active:scale-95',
      ].join(' ')}
    >
      {/* enemy telegraph rides above the portrait */}
      {stack.side === 'enemy' && !dead && (
        <div className="mb-0.5 min-h-[1.1rem]">
          <TelegraphBadge stack={stack} />
        </div>
      )}

      <div className="relative h-[3.4rem] w-[3.9rem] overflow-hidden rounded-md border border-verd-700 bg-grave-700">
        <ContentImage imageRef={stack.imageRef} alt={stack.name} className="h-full w-full" />
        {/* count medallion — the headline */}
        <span
          data-testid="stack-count"
          className="absolute -bottom-1 -right-1 flex min-w-[1.4rem] items-center justify-center rounded-full border border-bone-300/50 bg-blood-500 px-1 py-0.5 font-display text-[0.7rem] font-bold leading-none text-bone-50 shadow"
        >
          {stack.count}
        </span>
        {stack.isDefending && (
          <span className="absolute left-0 top-0 rounded-br bg-verd-700/90 px-0.5 text-verd-200">
            <ShieldIcon className="text-[0.7rem]" />
          </span>
        )}
        {/* floating combat numbers */}
        {floats.map((f) => (
          <FloatingNumber key={f.id} id={f.id} text={f.text} kind={f.kind} onDone={onClearFloat ?? (() => {})} />
        ))}
      </div>

      {/* top-creature hp sliver */}
      <div className="relative h-1 w-[3.9rem] overflow-hidden rounded-sm border border-grave-600 bg-grave-900">
        <div
          className="h-full bg-gradient-to-r from-blood-500 to-blood-400"
          style={{ width: `${hpPct}%` }}
        />
      </div>

      <div className="flex w-full items-center justify-center gap-1 text-[0.5rem] text-bone-400">
        <span className="font-display tracking-wide">{stack.rank === 'back' ? 'BACK' : 'FRONT'}</span>
        <span className="tabular-nums">·spd {stack.speed}</span>
      </div>
      <div className="max-w-[4.6rem] truncate font-display text-[0.6rem] engraved">{stack.name}</div>

      {chips.length > 0 && (
        <div className="flex flex-wrap justify-center gap-0.5">
          {chips.map((c) => (
            <span
              key={c}
              className="rounded-sm border border-verd-700 bg-grave-900/60 px-0.5 text-[0.45rem] uppercase tracking-wide text-verd-300"
            >
              {c}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}
