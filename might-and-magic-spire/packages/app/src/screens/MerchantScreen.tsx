// MERCHANT — buy an artifact for the hero's paper-doll. The engine rolls the
// pedlar's offers into run.pendingRewards (kind 'buy', each carrying an
// artifactId, slot and gold cost) and validates the selection against them.
// Buying auto-equips into the artifact's slot. Gold-gated.
import { artifactLookup, engine, type RewardChoice, type RunState } from '../engine';
import { NodeScreenShell, OfferTile } from './NodeScreenShell';

type BuyOffer = Extract<RewardChoice, { kind: 'buy' }>;

export function MerchantScreen({
  run,
  onBuy,
  onSkip,
}: {
  run: RunState;
  onBuy: (artifactId: string) => void;
  onSkip: () => void;
}) {
  const offers = (engine.pendingRewards?.(run) ?? []).filter(
    (r): r is BuyOffer => r.kind === 'buy',
  );

  return (
    <NodeScreenShell
      title="The Bone Pedlar"
      sub="Relics of the fallen, for a price. Equip them on your doll."
      gold={run.gold}
      onSkip={onSkip}
    >
      {offers.length === 0 && (
        <p className="text-sm italic text-bone-500">The pedlar has nothing left to sell.</p>
      )}
      {offers.map((offer) => {
        const a = artifactLookup(offer.artifactId);
        if (!a) return null;
        const affordable = run.gold >= offer.cost;
        return (
          <OfferTile
            key={offer.artifactId}
            testid="merchant-offer"
            dataAttrs={{ 'data-artifact-id': offer.artifactId }}
            imageRef={a.imageRef}
            name={a.name}
            detail={`${a.slot} · ${a.bonuses}`}
            cost={offer.cost}
            affordable={affordable}
            onClick={() => onBuy(offer.artifactId)}
          />
        );
      })}
    </NodeScreenShell>
  );
}
