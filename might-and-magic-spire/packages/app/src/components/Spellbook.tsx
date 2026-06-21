// The hero's SPELLBOOK drawer — at most one cast per turn, mana-gated. A spell
// the hero can afford glows; one too costly (or after a cast this turn) is
// disabled. Tapping an enemy/ally-targeted spell arms it; the CombatScreen then
// asks for a target. Self/all spells resolve on tap. Slides up from the bottom.
import type { CombatSpell } from '../engine';
import { ContentImage } from '../chrome/ContentImage';
import { FlameIcon } from '../chrome/icons';

const SCHOOL_TONE: Record<CombatSpell['school'], string> = {
  Fire: 'text-blood-400',
  Earth: 'text-necro-400',
  Air: 'text-bone-100',
  Water: 'text-verd-300',
  All: 'text-verd-300',
};

export function Spellbook({
  open,
  spells,
  mana,
  spellCastThisTurn,
  armedSpellId,
  onArm,
  onClose,
}: {
  open: boolean;
  spells: CombatSpell[];
  mana: number;
  spellCastThisTurn: boolean;
  armedSpellId: string | null;
  onArm: (spell: CombatSpell) => void;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="absolute inset-0 z-40 flex flex-col justify-end" data-testid="spellbook">
      {/* scrim */}
      <button
        type="button"
        aria-label="Close spellbook"
        onClick={onClose}
        className="absolute inset-0 bg-grave-900/70"
      />
      <div className="relative z-10 max-h-[60%] overflow-y-auto rounded-t-xl border-t border-verd-500 bg-grave-800 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] animate-fade-in">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-display text-sm tracking-widest text-bone-100 engraved">SPELLBOOK</h3>
          <span className="font-display text-xs text-verd-300">{mana} mana</span>
        </div>
        {spellCastThisTurn && (
          <p className="mb-2 text-[0.65rem] italic text-bone-500">
            A spell has already been woven this turn.
          </p>
        )}
        <div className="grid grid-cols-1 gap-2">
          {spells.map((spell) => {
            const affordable = mana >= spell.manaCost && !spellCastThisTurn;
            const armed = armedSpellId === spell.id;
            return (
              <button
                key={spell.id}
                type="button"
                data-testid="spell"
                data-spell-id={spell.id}
                data-affordable={affordable ? 'true' : 'false'}
                disabled={!affordable}
                onClick={() => onArm(spell)}
                aria-label={`${spell.name}, ${spell.manaCost} mana. ${spell.description}`}
                className={[
                  'flex items-center gap-2 rounded-lg border p-2 text-left transition',
                  armed ? 'border-bone-100 bg-verd-700/30' : 'border-verd-700 bg-grave-700',
                  affordable ? 'active:scale-[0.98] ring-1 ring-verd-300/40' : 'opacity-40 grayscale',
                ].join(' ')}
              >
                <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-verd-500">
                  <ContentImage imageRef={spell.imageRef} alt={spell.name} className="h-full w-full" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1">
                    <span className={`font-display text-xs font-bold ${SCHOOL_TONE[spell.school]}`}>
                      {spell.name}
                    </span>
                    <span className="text-[0.55rem] uppercase tracking-wide text-bone-500">
                      {spell.school} · L{spell.level}
                    </span>
                  </div>
                  <div className="truncate text-[0.62rem] text-bone-400">{spell.description}</div>
                </div>
                <div className="flex shrink-0 items-center gap-0.5 font-display text-sm text-verd-300">
                  <FlameIcon className="text-xs" />
                  {spell.manaCost}
                </div>
              </button>
            );
          })}
          {spells.length === 0 && (
            <p className="py-4 text-center text-xs italic text-bone-500">
              No spells learned — visit a Shrine.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
