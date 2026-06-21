// SHRINE — learn a new combat spell into the hero's spellbook. The shrine
// offers a few combat spells the hero doesn't yet know, gold-gated. Already-
// known spells are filtered out.
import { SPELLS, spellLookup, type RunState } from '../engine';
import { NodeScreenShell, OfferTile } from './NodeScreenShell';

// Spells a shrine may teach (combat-relevant, beyond the starter set).
const SHRINE_OFFER_IDS = ['spell_lightning_bolt', 'spell_animate_dead', 'spell_curse', 'spell_bless'];

function learnCost(spellId: string): number {
  const s = spellLookup(spellId);
  return s ? s.manaCost * 8 : 60;
}

export function ShrineScreen({
  run,
  onLearn,
  onSkip,
}: {
  run: RunState;
  onLearn: (spellId: string) => void;
  onSkip: () => void;
}) {
  const known = new Set(run.hero.spellbook.map((s) => s.id));
  const offers = SHRINE_OFFER_IDS.filter((id) => !known.has(id) && SPELLS.some((s) => s.id === id));

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
      {offers.map((spellId) => {
        const s = spellLookup(spellId)!;
        const cost = learnCost(spellId);
        return (
          <OfferTile
            key={spellId}
            testid="shrine-offer"
            dataAttrs={{ 'data-spell-id': spellId }}
            imageRef={s.imageRef}
            name={s.name}
            detail={`${s.school} · L${s.level} · ${s.manaCost} mana`}
            cost={cost}
            affordable={run.gold >= cost}
            onClick={() => onLearn(spellId)}
          />
        );
      })}
    </NodeScreenShell>
  );
}
