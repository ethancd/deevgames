// WIN / LOSS terminus. Win = reached and felled the act boss; loss = your army
// (your life total) was wiped. We show a short recap of the FINAL blows so a
// loss on the enemy turn (e.g. a fatal retaliation) is never silent.
import type { CombatEvent } from '../engine';
import { SkullIcon } from '../chrome/icons';

export function OutcomeScreen({
  outcome,
  events,
  onRestart,
}: {
  outcome: 'won' | 'lost';
  events?: CombatEvent[];
  onRestart: () => void;
}) {
  const won = outcome === 'won';
  // The last few strikes that ended the battle — the killing blows first.
  const recap = (events ?? []).filter((e) => e.damage > 0).slice(-4);
  return (
    <div className="flex h-full flex-col items-center justify-center bg-necropolis px-6 text-center animate-fade-in">
      <div className={`mb-4 text-7xl ${won ? 'text-verd-300' : 'text-blood-400'}`}>
        <SkullIcon />
      </div>
      <h1 className="font-display text-3xl font-black tracking-widest engraved">
        {won ? 'THE SPIRE IS YOURS' : 'YOU JOIN THE DEAD'}
      </h1>
      <p className="mt-2 max-w-xs text-sm italic text-bone-500">
        {won
          ? 'The Lich King kneels. The Necropolis answers to you now.'
          : 'Your bones settle among the others. The Spire endures.'}
      </p>

      {!won && recap.length > 0 && (
        <div
          data-testid="outcome-recap"
          className="mt-5 w-full max-w-xs rounded-lg border border-blood-500/40 bg-grave-800/70 px-3 py-2 text-left"
        >
          <div className="mb-1 font-display text-[0.6rem] uppercase tracking-widest text-bone-500">
            The final blows
          </div>
          {recap.map((e, i) => (
            <div key={i} className="text-[0.7rem] text-bone-300">
              <span className={e.side === 'enemy' ? 'text-blood-300' : 'text-verd-300'}>
                {e.attackerName}
              </span>{' '}
              {e.kind === 'retaliate' ? 'retaliates on' : 'strikes'}{' '}
              {e.targetName} for <span className="tabular-nums text-bone-100">{e.damage}</span>
              {e.killed > 0 && <span className="text-bone-500"> ({e.killed} slain)</span>}
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        data-testid="restart"
        onClick={onRestart}
        className="mt-8 rounded-md border-2 border-verd-300 bg-verd-700/40 px-10 py-4 font-display text-lg uppercase tracking-widest text-bone-100 active:scale-95"
      >
        {won ? 'Descend Again' : 'Rise Again'}
      </button>
    </div>
  );
}
