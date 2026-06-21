// DWELLING — recruit a fresh stack into the army. The dwelling offers a couple
// of undead at a per-creature gold cost; you take a bundle. Gold-gated: an
// unaffordable offer is dimmed and inert. Reuses the reward-screen chrome.
import { creatureLookup, dwellingCost, type RunState } from '../engine';
import { NodeScreenShell, OfferTile } from './NodeScreenShell';

// What each dwelling offers (deterministic per content; the mock surfaces a
// fixed Necropolis menu — the real engine will roll these from the node).
const DWELLING_OFFERS: { creatureId: string; count: number }[] = [
  { creatureId: 'necropolis_skeleton', count: 20 },
  { creatureId: 'necropolis_walking_dead', count: 8 },
  { creatureId: 'necropolis_wight', count: 5 },
];

export function DwellingScreen({
  run,
  onRecruit,
  onSkip,
}: {
  run: RunState;
  onRecruit: (creatureId: string, count: number) => void;
  onSkip: () => void;
}) {
  return (
    <NodeScreenShell
      title="The Boneyard Dwelling"
      sub="The dead answer the call. Recruit a stack into your army."
      gold={run.gold}
      onSkip={onSkip}
    >
      {DWELLING_OFFERS.map(({ creatureId, count }) => {
        const c = creatureLookup(creatureId);
        if (!c) return null;
        const cost = dwellingCost(c.tier) * count;
        return (
          <OfferTile
            key={creatureId}
            testid="dwelling-offer"
            dataAttrs={{ 'data-creature-id': creatureId }}
            imageRef={c.imageRef}
            name={`${c.name} ×${count}`}
            detail={`A${c.attack} D${c.defense} HP${c.hp} · spd ${c.speed}`}
            cost={cost}
            affordable={run.gold >= cost}
            onClick={() => onRecruit(creatureId, count)}
          />
        );
      })}
    </NodeScreenShell>
  );
}
