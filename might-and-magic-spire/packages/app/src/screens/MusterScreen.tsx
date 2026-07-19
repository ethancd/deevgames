// MUSTER — the weekly Monday shop (COMBAT.md §25/§28). The engine defers the
// Monday node and rolls offers into run.pendingRewards: `muster` (reinforce an
// existing stack) and `recruit` (raise a NEW stack of a newly-unlocked tier).
// Buying re-offers the muster (multi-buy); "march on" closes it and resolves the
// deferred node. We dispatch straight through pickReward.
import { creatureLookup, engine, type RewardChoice, type RunState } from '../engine';
import { NodeScreenShell, OfferTile } from './NodeScreenShell';

type MusterOffer = Extract<RewardChoice, { kind: 'muster' }>;
type RecruitOffer = Extract<RewardChoice, { kind: 'recruit' }>;

export function MusterScreen({
  run,
  onPick,
  onMarchOn,
}: {
  run: RunState;
  onPick: (choice: RewardChoice) => void;
  onMarchOn: () => void;
}) {
  const offers = engine.pendingRewards?.(run) ?? [];
  const reinforce = offers.filter((r): r is MusterOffer => r.kind === 'muster');
  const recruits = offers.filter((r): r is RecruitOffer => r.kind === 'recruit');

  return (
    <NodeScreenShell
      title="Monday Muster"
      sub="A new week dawns. Reinforce your stacks or raise new ones, then march on."
      gold={run.gold}
      onSkip={onMarchOn}
    >
      {reinforce.length === 0 && recruits.length === 0 && (
        <p className="text-sm italic text-bone-500">No troops to muster.</p>
      )}

      {/* Reinforce existing stacks — show current → new count so taps are legible. */}
      {reinforce.map((offer) => {
        const c = creatureLookup(offer.creatureId);
        if (!c) return null;
        const have = run.army.find((s) => s.id === offer.stackId)?.count ?? 0;
        const affordable = run.gold >= offer.cost;
        return (
          <OfferTile
            key={offer.stackId}
            testid="muster-reinforce"
            dataAttrs={{ 'data-stack-id': offer.stackId }}
            imageRef={c.imageRef}
            name={c.name}
            detail={`${have} → ${have + offer.count}`}
            cost={offer.cost}
            affordable={affordable}
            onClick={() => onPick(offer)}
          />
        );
      })}

      {/* Recruit a NEW stack of a freshly-unlocked tier (§28). */}
      {recruits.map((offer) => {
        const c = creatureLookup(offer.creatureId);
        if (!c) return null;
        const affordable = run.gold >= offer.cost;
        return (
          <OfferTile
            key={`new-${offer.creatureId}`}
            testid="muster-recruit"
            dataAttrs={{ 'data-creature-id': offer.creatureId }}
            imageRef={c.imageRef}
            name={`${c.name} ×${offer.count}`}
            detail="NEW — tier unlocked"
            cost={offer.cost}
            affordable={affordable}
            onClick={() => onPick(offer)}
            badge={
              <span className="absolute right-0 top-0 rounded-bl bg-amber-400 px-1 text-[0.5rem] font-bold text-black">
                NEW
              </span>
            }
          />
        );
      })}
    </NodeScreenShell>
  );
}
