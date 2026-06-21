// TITLE — the "hello, run" entry that proves the data path end to end: it
// reads the fixture-derived starter deck through the engine and starts a run.
import { useState } from 'react';
import { SkullIcon } from '../chrome/icons';

export function TitleScreen({ onStart }: { onStart: (seed: string) => void }) {
  const [seed, setSeed] = useState('necropolis-1');
  return (
    <div className="flex h-full flex-col items-center justify-center bg-necropolis px-6 text-center">
      <div className="mb-4 text-7xl text-bone-100 animate-fade-in">
        <SkullIcon />
      </div>
      <h1 className="font-display text-3xl font-black tracking-[0.18em] text-bone-100 engraved">
        MIGHT &amp; MAGIC
      </h1>
      <div className="my-1 h-px w-40 bg-gradient-to-r from-transparent via-verd-500 to-transparent" />
      <h2 className="font-display text-xl tracking-[0.4em] text-verd-300">SPIRE</h2>
      <p className="mt-4 max-w-xs text-sm italic text-bone-500">
        Raise the dead of the Necropolis and climb the Spire to the Lich King.
      </p>

      <label className="mt-8 flex flex-col items-center gap-1 text-xs text-bone-500">
        Seed
        <input
          value={seed}
          onChange={(e) => setSeed(e.target.value)}
          className="w-48 rounded border border-verd-700 bg-grave-800 px-3 py-2 text-center font-display text-bone-100 focus:border-verd-300 focus:outline-none"
          aria-label="Run seed"
        />
      </label>

      <button
        type="button"
        data-testid="start-run"
        onClick={() => onStart(seed || 'necropolis-1')}
        className="mt-6 rounded-md border-2 border-verd-300 bg-verd-700/40 px-10 py-4 font-display text-lg uppercase tracking-widest text-bone-100 active:scale-95 hover:bg-verd-700/70"
      >
        Begin the Descent
      </button>
    </div>
  );
}
