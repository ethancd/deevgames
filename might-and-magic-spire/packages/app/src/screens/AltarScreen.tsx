// ALTAR — upgrade one of your stacks to its higher form (Skeleton → Skeleton
// Warrior, etc.). Each upgradeable stack shows a before→after stat preview and
// a gold cost. Stacks with no upgrade form are listed as already-ascended.
import { CREATURES, creatureLookup, upgradeCost, type RunState } from '../engine';
import { NodeScreenShell } from './NodeScreenShell';
import { ContentImage } from '../chrome/ContentImage';

function upgradeOf(creatureId: string) {
  return CREATURES.find((c) => c.upgradeOf === creatureId);
}

export function AltarScreen({
  run,
  onUpgrade,
  onSkip,
}: {
  run: RunState;
  onUpgrade: (stackId: string) => void;
  onSkip: () => void;
}) {
  const upgradeable = run.army.filter((s) => !!upgradeOf(s.creatureId));

  return (
    <NodeScreenShell
      title="The Ascension Altar"
      sub="Lay a stack upon the altar to raise it into its greater form."
      gold={run.gold}
      onSkip={onSkip}
    >
      {upgradeable.length === 0 && (
        <p className="text-sm italic text-bone-500">Every stack has already ascended.</p>
      )}
      {upgradeable.map((stack) => {
        const from = creatureLookup(stack.creatureId)!;
        const to = upgradeOf(stack.creatureId)!;
        const cost = upgradeCost(run, stack.id);
        const affordable = run.gold >= cost;
        return (
          <button
            key={stack.id}
            type="button"
            data-testid="altar-offer"
            data-stack-id={stack.id}
            data-affordable={affordable ? 'true' : 'false'}
            disabled={!affordable}
            onClick={() => onUpgrade(stack.id)}
            className={[
              'flex w-44 flex-col items-center gap-2 rounded-lg border bg-grave-700 p-3 verd-frame transition',
              affordable ? 'border-verd-500 active:scale-95' : 'border-grave-600 opacity-45 grayscale',
            ].join(' ')}
          >
            <div className="flex items-center gap-2">
              <div className="h-12 w-12 overflow-hidden rounded border border-grave-600">
                <ContentImage imageRef={from.imageRef} alt={from.name} className="h-full w-full" />
              </div>
              <span className="font-display text-verd-300">→</span>
              <div className="h-12 w-12 overflow-hidden rounded border border-verd-500">
                <ContentImage imageRef={to.imageRef} alt={to.name} className="h-full w-full" />
              </div>
            </div>
            <div className="font-display text-[0.72rem] engraved leading-tight">
              {from.name} ×{stack.count} → {to.name}
            </div>
            <div className="text-[0.6rem] text-bone-400">
              A{from.attack}/D{from.defense}/spd{from.speed} → A{to.attack}/D{to.defense}/spd{to.speed}
            </div>
            <div className={`mt-auto font-display text-xs ${affordable ? 'text-amber-300/90' : 'text-blood-400'}`}>
              {cost} gold
            </div>
          </button>
        );
      })}
    </NodeScreenShell>
  );
}
