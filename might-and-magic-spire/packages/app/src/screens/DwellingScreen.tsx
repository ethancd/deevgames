// DWELLING — recruit a fresh stack into the army. The engine rolls the
// dwelling's offers into run.pendingRewards (kind 'recruit', each carrying a
// creatureId, count and gold cost) and strictly validates the selection against
// them. We render whatever the engine offers; an unaffordable offer is dimmed
// and inert. Reuses the reward-screen chrome.
import { creatureLookup, engine, type RewardChoice, type RunState } from '../engine';
import { NodeScreenShell, OfferTile } from './NodeScreenShell';

type RecruitOffer = Extract<RewardChoice, { kind: 'recruit' }>;

export function DwellingScreen({
  run,
  onRecruit,
  onSkip,
}: {
  run: RunState;
  onRecruit: (creatureId: string, count: number) => void;
  onSkip: () => void;
}) {
  const offers = (engine.pendingRewards?.(run) ?? []).filter(
    (r): r is RecruitOffer => r.kind === 'recruit',
  );

  return (
    <NodeScreenShell
      title="The Boneyard Dwelling"
      sub="The dead answer the call. Recruit a stack into your army."
      gold={run.gold}
      onSkip={onSkip}
    >
      {offers.length === 0 && (
        <p className="text-sm italic text-bone-500">The dwelling stands silent.</p>
      )}
      {offers.map((offer) => {
        const c = creatureLookup(offer.creatureId);
        if (!c) return null;
        const affordable = run.gold >= offer.cost;
        return (
          <OfferTile
            key={offer.creatureId}
            testid="dwelling-offer"
            dataAttrs={{ 'data-creature-id': offer.creatureId }}
            imageRef={c.imageRef}
            name={`${c.name} ×${offer.count}`}
            detail={`A${c.attack} D${c.defense} HP${c.hp} · spd ${c.speed}`}
            cost={offer.cost}
            affordable={affordable}
            onClick={() => onRecruit(offer.creatureId, offer.count)}
          />
        );
      })}
    </NodeScreenShell>
  );
}
