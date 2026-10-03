import { useEffect, useRef } from 'react';
import { UnitArtwork } from '../components/UnitArtwork';
import { getUnitDefinition } from '../game/units';
import type { Scenario } from './scenarios';

/** Hold before advancing on its own; a tap advances sooner. */
export const REVEAL_MS = 2100;

/** The piece's name, large, with its counter beside it. */
export function Reveal({ scenario, onDone }: { scenario: Scenario; onDone: () => void }) {
  const done = useRef(onDone);
  done.current = onDone;
  const finished = useRef(false);
  const finish = () => { if (!finished.current) { finished.current = true; done.current(); } };
  useEffect(() => {
    const timer = window.setTimeout(finish, REVEAL_MS);
    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const def = getUnitDefinition(scenario.reveal.type);
  return <button type="button" className="tutorial-reveal" onClick={finish} data-testid="tutorial-reveal" aria-label={`${scenario.reveal.word}. Continue`}>
    <span className="tutorial-reveal-card">
      <span className="tutorial-reveal-glyph"><UnitArtwork element={def.element} owner="white" tier={def.tier} /></span>
      <span className="tutorial-reveal-word">{scenario.reveal.word}</span>
    </span>
  </button>;
}
