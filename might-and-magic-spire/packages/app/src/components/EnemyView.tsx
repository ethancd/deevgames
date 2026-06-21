// One enemy: portrait (content art), HP bar, block pip, and the TELEGRAPHED
// intent badge — the core Slay-the-Spire information. Tapping selects it as
// the target for the next single-target card.
import type { Enemy } from '../engine';
import { ContentImage } from '../chrome/ContentImage';
import { SwordIcon, ShieldIcon, BuffIcon, DebuffIcon, QuestionIcon } from '../chrome/icons';

function IntentBadge({ enemy }: { enemy: Enemy }) {
  const { intent } = enemy;
  const icon =
    intent.kind === 'attack' ? <SwordIcon /> :
    intent.kind === 'block' ? <ShieldIcon /> :
    intent.kind === 'buff' ? <BuffIcon /> :
    intent.kind === 'debuff' ? <DebuffIcon /> :
    <QuestionIcon />;
  const tone =
    intent.kind === 'attack' ? 'text-blood-400 border-blood-500' :
    intent.kind === 'block' ? 'text-verd-300 border-verd-500' :
    'text-necro-400 border-necro-400/60';
  return (
    <div
      data-testid="intent"
      aria-label={`Intent: ${intent.label}`}
      className={`flex items-center gap-1 rounded-full border bg-grave-900/80 px-2 py-0.5 text-xs font-bold ${tone}`}
    >
      <span className="text-sm">{icon}</span>
      {intent.value != null && <span className="tabular-nums">{intent.value}</span>}
    </div>
  );
}

export function EnemyView({
  enemy,
  selected,
  onSelect,
}: {
  enemy: Enemy;
  selected: boolean;
  onSelect: () => void;
}) {
  const hpPct = Math.max(0, (enemy.hp / enemy.maxHp) * 100);
  return (
    <button
      type="button"
      data-testid="enemy"
      data-enemy-id={enemy.id}
      onClick={onSelect}
      aria-label={`${enemy.name}, ${enemy.hp} of ${enemy.maxHp} health. ${enemy.intent.label}`}
      className={[
        'relative flex flex-col items-center gap-1 rounded-lg p-1 transition',
        selected ? 'ring-2 ring-blood-400' : 'ring-1 ring-transparent',
        'active:scale-95',
      ].join(' ')}
    >
      <div className="mb-0.5">
        <IntentBadge enemy={enemy} />
      </div>
      <div className="relative h-24 w-20 overflow-hidden rounded-md border border-verd-700 bg-grave-700">
        <ContentImage imageRef={enemy.imageRef} alt={enemy.name} className="h-full w-full" />
        {enemy.block > 0 && (
          <span className="absolute bottom-0 left-0 flex items-center gap-0.5 rounded-tr bg-verd-700/90 px-1 text-[0.6rem] text-bone-100">
            <ShieldIcon /> {enemy.block}
          </span>
        )}
      </div>
      <div className="font-display text-[0.65rem] engraved">{enemy.name}</div>
      <div className="relative h-2 w-20 overflow-hidden rounded-sm border border-grave-600 bg-grave-900">
        <div className="h-full bg-gradient-to-r from-blood-500 to-blood-400" style={{ width: `${hpPct}%` }} />
      </div>
      <div className="text-[0.6rem] tabular-nums text-bone-300">
        {enemy.hp}/{enemy.maxHp}
      </div>
    </button>
  );
}
