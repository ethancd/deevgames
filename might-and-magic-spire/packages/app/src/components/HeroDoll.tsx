// The HERO DOLL — the commander's panel. A 9-slot anatomical paper-doll of
// artifacts (Head/Neck/Torso/RightHand/LeftHand/Ring/Feet/Misc/Special), the
// four primary stats (A/D/P/K), and a mana bar. Absorbs the old RelicBar.
//
//   variant="collapsed" — a single thin strip for the combat screen (portrait +
//     A/D/P/K pips + mana), tappable to open the full overlay.
//   variant="full"      — the anatomical doll with all nine slots, used on the
//     map HUD overlay. Tap an owned-but-unequipped artifact, then an empty slot,
//     to equip it (dispatches onEquip).
import { useState } from 'react';
import type { ArtifactSlot, Equipment, Hero } from '../engine';
import { ownedArtifacts } from '../engine';
import type { RunState } from '../engine';
import { ContentImage } from '../chrome/ContentImage';
import { StatPip, ManaPip } from './StatBar';

const SLOTS: ArtifactSlot[] = [
  'Head', 'Neck', 'Torso', 'RightHand', 'LeftHand', 'Ring', 'Feet', 'Misc', 'Special',
];
const SLOT_LABEL: Record<ArtifactSlot, string> = {
  Head: 'Head',
  Neck: 'Neck',
  Torso: 'Torso',
  RightHand: 'R. Hand',
  LeftHand: 'L. Hand',
  Ring: 'Ring',
  Feet: 'Feet',
  Misc: 'Misc',
  Special: 'Special',
};

function StatRow({ hero }: { hero: Hero }) {
  return (
    <div className="flex items-center gap-1">
      <StatPip stat="attack" value={hero.attack} />
      <StatPip stat="defense" value={hero.defense} />
      <StatPip stat="power" value={hero.power} />
      <StatPip stat="knowledge" value={hero.knowledge} />
    </div>
  );
}

export function HeroDollStrip({ hero, onOpen }: { hero: Hero; onOpen?: () => void }) {
  return (
    <button
      type="button"
      data-testid="hero-doll-strip"
      onClick={onOpen}
      disabled={!onOpen}
      aria-label={`Hero ${hero.name}. Tap for paper-doll.`}
      className="flex w-full items-center gap-2 border-t border-verd-700 bg-grave-900/90 px-3 py-1.5 text-left active:bg-grave-800"
    >
      <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full border border-verd-500">
        <ContentImage imageRef={hero.imageRef} alt={hero.name} className="h-full w-full" />
      </div>
      <div className="font-display text-[0.7rem] engraved">{hero.name}</div>
      <div className="ml-1"><StatRow hero={hero} /></div>
      <div className="ml-auto"><ManaPip mana={hero.mana} maxMana={hero.maxMana} /></div>
    </button>
  );
}

function SlotCell({
  slot,
  item,
  selectableForEquip,
  onTap,
}: {
  slot: ArtifactSlot;
  item: Equipment | undefined;
  selectableForEquip: boolean;
  onTap: () => void;
}) {
  return (
    <button
      type="button"
      data-testid="doll-slot"
      data-slot={slot}
      data-filled={item ? 'true' : 'false'}
      onClick={onTap}
      aria-label={item ? `${SLOT_LABEL[slot]}: ${item.name}` : `${SLOT_LABEL[slot]}: empty`}
      className={[
        'flex h-14 w-14 flex-col items-center justify-center gap-0.5 rounded-md border bg-grave-800 p-0.5 transition active:scale-95',
        item ? 'border-verd-500' : 'border-dashed border-grave-600',
        selectableForEquip && !item ? 'animate-pulse-blood border-bone-100' : '',
      ].join(' ')}
    >
      {item ? (
        <div className="h-9 w-9 overflow-hidden rounded">
          <ContentImage imageRef={item.imageRef} alt={item.name} className="h-full w-full" />
        </div>
      ) : (
        <span className="text-[0.5rem] uppercase tracking-wide text-bone-600">{SLOT_LABEL[slot]}</span>
      )}
    </button>
  );
}

export function HeroDollFull({
  run,
  onEquip,
  onClose,
}: {
  run: RunState;
  onEquip: (artifactId: string, slot: ArtifactSlot) => void;
  onClose?: () => void;
}) {
  const { hero } = run;
  const [armed, setArmed] = useState<Equipment | null>(null);
  const equippedIds = new Set(
    Object.values(hero.equipment).filter(Boolean).map((e) => (e as Equipment).id),
  );
  const unequipped = ownedArtifacts(run).filter((a) => !equippedIds.has(a.id));

  const tapSlot = (slot: ArtifactSlot) => {
    if (armed && !hero.equipment[slot]) {
      onEquip(armed.id, slot);
      setArmed(null);
    }
  };

  return (
    <div className="flex h-full flex-col bg-necropolis p-4 animate-fade-in" data-testid="hero-doll">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-lg tracking-widest text-bone-100 engraved">{hero.name}</h2>
        {onClose && (
          <button
            type="button"
            data-testid="hero-doll-close"
            onClick={onClose}
            className="rounded border border-verd-700 px-3 py-1 font-display text-xs uppercase tracking-widest text-bone-300 active:scale-95"
          >
            Close
          </button>
        )}
      </div>

      <div className="mb-2 flex items-center gap-2 text-bone-400">
        <span className="text-xs">{hero.heroClass}</span>
        <span className="text-bone-600">·</span>
        <span className="text-xs">{hero.specialty}</span>
      </div>

      <div className="mb-3 flex items-center justify-between">
        <StatRow hero={hero} />
        <ManaPip mana={hero.mana} maxMana={hero.maxMana} />
      </div>

      {/* anatomical 3×3 paper-doll */}
      <div className="mx-auto grid grid-cols-3 gap-2">
        {SLOTS.map((slot) => (
          <SlotCell
            key={slot}
            slot={slot}
            item={hero.equipment[slot]}
            selectableForEquip={!!armed}
            onTap={() => tapSlot(slot)}
          />
        ))}
      </div>

      {/* the satchel of unequipped artifacts */}
      <div className="mt-4">
        <h3 className="mb-1 font-display text-xs tracking-widest text-verd-300">SATCHEL</h3>
        {unequipped.length === 0 ? (
          <p className="text-[0.7rem] italic text-bone-600">No spare artifacts. Visit a Merchant.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {unequipped.map((a) => (
              <button
                key={a.id}
                type="button"
                data-testid="satchel-artifact"
                data-artifact-id={a.id}
                onClick={() => setArmed((cur) => (cur?.id === a.id ? null : a))}
                aria-label={`${a.name} (${a.slot}): ${a.bonuses}`}
                className={[
                  'flex w-20 flex-col items-center gap-1 rounded-md border bg-grave-700 p-1.5 transition active:scale-95',
                  armed?.id === a.id ? 'border-bone-100 ring-1 ring-bone-100' : 'border-verd-700',
                ].join(' ')}
              >
                <div className="h-9 w-9 overflow-hidden rounded">
                  <ContentImage imageRef={a.imageRef} alt={a.name} className="h-full w-full" />
                </div>
                <span className="truncate text-[0.55rem] text-bone-300">{a.name}</span>
                <span className="text-[0.5rem] uppercase tracking-wide text-verd-300">{a.slot}</span>
              </button>
            ))}
          </div>
        )}
        {armed && (
          <p className="mt-2 text-[0.7rem] text-bone-300">
            Tap the <span className="text-bone-100">{SLOT_LABEL[armed.slot]}</span> slot to equip{' '}
            <span className="text-bone-100">{armed.name}</span>.
          </p>
        )}
      </div>
    </div>
  );
}
