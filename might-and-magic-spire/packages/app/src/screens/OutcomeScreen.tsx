// WIN / LOSS terminus. Win = reached and felled the act boss; loss = HP hit 0.
import { SkullIcon } from '../chrome/icons';

export function OutcomeScreen({
  outcome,
  onRestart,
}: {
  outcome: 'won' | 'lost';
  onRestart: () => void;
}) {
  const won = outcome === 'won';
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
