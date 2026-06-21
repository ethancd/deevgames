// MERCHANT — buy an artifact for the hero's paper-doll. The pedlar offers a few
// artifacts; buying one adds it to the hero (auto-equipped if its slot is free,
// else stashed in the satchel to equip from the Hero Doll). Gold-gated; already-
// owned artifacts are filtered out.
import { ARTIFACTS, artifactCost, artifactLookup, ownedArtifacts, type RunState } from '../engine';
import { NodeScreenShell, OfferTile } from './NodeScreenShell';

const MERCHANT_OFFER_IDS = [
  'artifact_centaurs_axe',
  'artifact_necklace_of_swiftness',
  'artifact_ring_of_vitality',
  'artifact_cloak_of_the_undead_king',
];

export function MerchantScreen({
  run,
  onBuy,
  onSkip,
}: {
  run: RunState;
  onBuy: (artifactId: string) => void;
  onSkip: () => void;
}) {
  const owned = new Set(ownedArtifacts(run).map((a) => a.id));
  const offers = MERCHANT_OFFER_IDS.filter((id) => !owned.has(id) && ARTIFACTS.some((a) => a.id === id));

  return (
    <NodeScreenShell
      title="The Bone Pedlar"
      sub="Relics of the fallen, for a price. Equip them on your doll."
      gold={run.gold}
      onSkip={onSkip}
    >
      {offers.length === 0 && (
        <p className="text-sm italic text-bone-500">The pedlar has nothing left you do not own.</p>
      )}
      {offers.map((artifactId) => {
        const a = artifactLookup(artifactId)!;
        const cost = artifactCost(artifactId);
        return (
          <OfferTile
            key={artifactId}
            testid="merchant-offer"
            dataAttrs={{ 'data-artifact-id': artifactId }}
            imageRef={a.imageRef}
            name={a.name}
            detail={`${a.slot} · ${a.bonuses}`}
            cost={cost}
            affordable={run.gold >= cost}
            onClick={() => onBuy(artifactId)}
          />
        );
      })}
    </NodeScreenShell>
  );
}
