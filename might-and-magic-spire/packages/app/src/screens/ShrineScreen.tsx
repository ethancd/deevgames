// SHRINE — learn a new combat spell into the hero's spellbook. The engine rolls
// the shrine's offers into run.pendingRewards (kind 'learn', each carrying a
// spellId and gold cost) and validates the selection against them. Already-known
// spells are never offered. Gold-gated.
import { spellLookup, engine, type RewardChoice, type RunState } from '../engine';
import { NodeScreenShell, OfferTile } from './NodeScreenShell';

type LearnOffer = Extract<RewardChoice, { kind: 'learn' }>;

export function ShrineScreen({
  run,
  onLearn,
  onSkip,
}: {
  run: RunState;
  onLearn: (spellId: string) => void;
  onSkip: () => void;
}) {
  const offers = (engine.pendingRewards?.(run) ?? []).filter(
    (r): r is LearnOffer => r.kind === 'learn',
  );

  return (
    <NodeScreenShell
      title="The Whispering Shrine"
      sub="Bones remember old magic. Learn a spell into your book."
      gold={run.gold}
      onSkip={onSkip}
    >
      {offers.length === 0 && (
        <p className="text-sm italic text-bone-500">You have learned all the shrine can teach.</p>
      )}
      {offers.map((offer) => {
        const s = spellLookup(offer.spellId);
        if (!s) return null;
        const affordable = run.gold >= offer.cost;
        return (
          <OfferTile
            key={offer.spellId}
            testid="shrine-offer"
            dataAttrs={{ 'data-spell-id': offer.spellId }}
            imageRef={s.imageRef}
            name={s.name}
            detail={`${s.school} · L${s.level} · ${s.manaCost} mana`}
            cost={offer.cost}
            affordable={affordable}
            onClick={() => onLearn(offer.spellId)}
          />
        );
      })}
    </NodeScreenShell>
  );
}
