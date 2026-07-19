// ALTAR — upgrade one of your stacks to its higher form (Skeleton → Skeleton
// Warrior, etc.). The engine rolls one 'upgrade' offer per upgradeable stack
// into run.pendingRewards (each carrying the stackId, the target creature id and
// a gold cost) and validates the selection against them. Each offer shows a
// before→after stat preview. Gold-gated.
import { creatureLookup, engine, type RewardChoice, type RunState } from '../engine';
import { NodeScreenShell } from './NodeScreenShell';
import { ContentImage } from '../chrome/ContentImage';

type UpgradeOffer = Extract<RewardChoice, { kind: 'upgrade' }>;

export function AltarScreen({
  run,
  onUpgrade,
  onSkip,
}: {
  run: RunState;
  onUpgrade: (stackId: string) => void;
  onSkip: () => void;
}) {
  const offers = (engine.pendingRewards?.(run) ?? []).filter(
    (r): r is UpgradeOffer => r.kind === 'upgrade',
  );

  return (
    <NodeScreenShell
      title="The Ascension Altar"
      sub="Lay a stack upon the altar to raise it into its greater form."
      gold={run.gold}
      onSkip={onSkip}
    >
      {offers.length === 0 && (
        <p className="text-sm italic text-bone-500">Every stack has already ascended.</p>
      )}
      {offers.map((offer) => {
        const stack = run.army.find((s) => s.id === offer.stackId);
        const from = stack ? creatureLookup(stack.creatureId) : undefined;
        const to = creatureLookup(offer.toCreatureId);
        if (!stack || !from || !to) return null;
        const affordable = run.gold >= offer.cost;
        return (
          <button
            key={offer.stackId}
            type="button"
            data-testid="altar-offer"
            data-stack-id={offer.stackId}
            data-affordable={affordable ? 'true' : 'false'}
            disabled={!affordable}
            onClick={() => onUpgrade(offer.stackId)}
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
              {offer.cost} gold
            </div>
          </button>
        );
      })}
    </NodeScreenShell>
  );
}
