// The two-rank battlefield — a war ledger carved in bone. The ENEMY army holds
// the far (top) ground: its back rank highest, front rank facing the trench.
// YOUR army holds the near (bottom) ground for thumb reach: front rank meeting
// the enemy, back rank + hero behind. A sunken combat-log trench divides them.
import type { CombatState, DamageForecast, Stack } from '../engine';
import { StackView } from './StackView';
import type { FloatKind } from './FloatingNumber';

type FloatMap = Record<string, { id: string; text: string; kind: FloatKind }[]>;
type ForecastMap = Record<string, DamageForecast>;

function Rank({
  stacks,
  label,
  selectedId,
  targetableIds,
  selectableIds,
  forecasts,
  floats,
  onClearFloat,
  onTapStack,
}: {
  stacks: Stack[];
  label: string;
  selectedId: string | null;
  targetableIds: Set<string>;
  selectableIds: Set<string>;
  forecasts: ForecastMap;
  floats: FloatMap;
  onClearFloat: (id: string) => void;
  onTapStack: (s: Stack) => void;
}) {
  if (stacks.length === 0) {
    return (
      <div className="flex min-h-[1.5rem] items-center justify-center text-[0.55rem] italic text-bone-600">
        — {label} empty —
      </div>
    );
  }
  return (
    <div className="flex items-end justify-center gap-1.5" data-testid="rank" data-rank-label={label}>
      {stacks.map((s) => {
        const targetable = targetableIds.has(s.id);
        const selectable = selectableIds.has(s.id);
        // dim a friendly stack that can't act, or an enemy that isn't a legal target.
        const dimmed =
          s.side === 'player'
            ? selectableIds.size > 0 && !selectable && !(selectedId === s.id)
            : targetableIds.size > 0 && !targetable;
        return (
          <StackView
            key={s.id}
            stack={s}
            selected={selectedId === s.id}
            targetable={targetable}
            dimmed={dimmed}
            forecast={forecasts[s.id]}
            floats={floats[s.id] ?? []}
            onClearFloat={onClearFloat}
            onTap={() => onTapStack(s)}
          />
        );
      })}
    </div>
  );
}

export function BattleField({
  combat,
  selectedId,
  targetableIds,
  selectableIds,
  forecasts = {},
  floats,
  onClearFloat,
  onTapStack,
}: {
  combat: CombatState;
  selectedId: string | null;
  targetableIds: Set<string>;
  selectableIds: Set<string>;
  forecasts?: ForecastMap;
  floats: FloatMap;
  onClearFloat: (id: string) => void;
  onTapStack: (s: Stack) => void;
}) {
  const enemy = combat.enemyArmy.stacks.filter((s) => s.count > 0);
  const you = combat.yourArmy.stacks.filter((s) => s.count > 0);
  const enemyBack = enemy.filter((s) => s.rank === 'back');
  const enemyFront = enemy.filter((s) => s.rank === 'front');
  const yourFront = you.filter((s) => s.rank === 'front');
  const yourBack = you.filter((s) => s.rank === 'back');

  const rankProps = {
    selectedId,
    targetableIds,
    selectableIds,
    forecasts,
    floats,
    onClearFloat,
    onTapStack,
  };

  return (
    <div className="flex flex-1 flex-col justify-between gap-2 overflow-y-auto px-2 py-2" data-testid="battlefield">
      {/* Enemy far ground */}
      <div className="flex flex-col gap-2">
        <Rank stacks={enemyBack} label="enemy-back" {...rankProps} />
        <Rank stacks={enemyFront} label="enemy-front" {...rankProps} />
      </div>

      {/* The trench: a hairline no-man's-land between the lines */}
      <div className="relative my-1 h-px w-full bg-gradient-to-r from-transparent via-verd-500/60 to-transparent">
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-grave-800 px-2 font-display text-[0.5rem] uppercase tracking-[0.3em] text-bone-600">
          no man&rsquo;s land
        </span>
      </div>

      {/* Your near ground */}
      <div className="flex flex-col gap-2">
        <Rank stacks={yourFront} label="your-front" {...rankProps} />
        <Rank stacks={yourBack} label="your-back" {...rankProps} />
      </div>
    </div>
  );
}
