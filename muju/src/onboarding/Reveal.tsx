import { useEffect, useRef } from 'react';

/** How long a piece's name stays at the top of the screen, fade included. */
export const REVEAL_MS = 2000;

/** The piece's name fades in at the top middle, then fades away and leaves nothing behind.
 * Screen readers hear it through the page's live region instead. */
export function Reveal({ word, onDone }: { word: string; onDone: () => void }) {
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const timer = window.setTimeout(() => done.current(), REVEAL_MS);
    return () => clearTimeout(timer);
  }, []);
  return <p className="onboarding-word" data-testid="tutorial-word" aria-hidden="true">{word}</p>;
}
