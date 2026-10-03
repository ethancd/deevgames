import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Board } from '../components/Board';
import { BoardEffects, useBoardEffects } from '../effects/BoardEffects';
import type { GameState } from '../game/types';
import { useSoundEffects } from '../sound/SoundProvider';
import { PuzzleBoard } from './PuzzleBoard';
import { Reveal } from './Reveal';
import { SCENARIOS, unitId } from './scenarios';
import { markOnboardingComplete } from './storage';
import type { ScenarioPhase } from './useScenario';
import './onboarding.css';

type Stage = 'intro' | 'puzzle' | 'reveal' | 'zoom' | 'out';
const INTRO_MS = 900, ZOOM_DELAY_MS = 150, ZOOM_MS = 1500, OUT_MS = 600;
const reducedMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Wordless first visit: three puzzles on boards that grow 3×3 → 6×6 → 10×10.
 * The only words on screen are "Skip Tutorial" and each piece's name, which
 * passes through the top of the screen once its puzzle is solved. Teaching is
 * light, motion and sound; screen readers get the steps in a live region.
 */
export function Onboarding({ onComplete }: { onComplete: () => void }) {
  const [index, setIndex] = useState(0);
  const [stage, setStage] = useState<Stage>('intro');
  const [previous, setPrevious] = useState<GameState | null>(null);
  const [phase, setPhase] = useState<ScenarioPhase>('hint-piece');
  const stageRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef<HTMLDivElement>(null);
  const oldRef = useRef<HTMLDivElement>(null);
  const effects = useBoardEffects();
  const play = useSoundEffects();
  const scenario = SCENARIOS[index];
  const solved = useRef<GameState | null>(null);
  const finished = useRef(false);

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    markOnboardingComplete();
    onComplete();
  }, [onComplete]);

  useEffect(() => {
    if (stage === 'intro') { const t = window.setTimeout(() => setStage('puzzle'), INTRO_MS); return () => clearTimeout(t); }
    if (stage === 'out') { const t = window.setTimeout(finish, reducedMotion() ? 0 : OUT_MS); return () => clearTimeout(t); }
  }, [stage, finish]);

  const onSolved = useCallback((final: GameState) => { solved.current = final; setStage('reveal'); }, []);
  useEffect(() => { if (stage === 'reveal') play(['reveal']); }, [stage, play]);

  const afterReveal = useCallback(() => {
    if (index === SCENARIOS.length - 1) { setStage('out'); return; }
    setPrevious(solved.current);
    setIndex(i => i + 1);
    setPhase('hint-piece');
    setStage('zoom');
  }, [index]);

  // Zoom out: the next board starts scaled so its top-left cells sit exactly on the
  // old ones and shrinks to fit. The old board shrinks with it, pinned to the same
  // point, so the two never drift apart while it fades.
  useLayoutEffect(() => {
    if (stage !== 'zoom') return;
    const done = () => { setPrevious(null); setStage('puzzle'); };
    const wrap = zoomRef.current, old = oldRef.current?.querySelector<HTMLElement>('.zoom-board');
    const fresh = wrap?.querySelector('[data-testid="cell-0-0"]')?.getBoundingClientRect();
    const prior = old?.querySelector('[data-testid="cell-0-0"]')?.getBoundingClientRect();
    if (reducedMotion() || !wrap || !old || !fresh || !prior || !wrap.animate) { done(); return; }
    const box = wrap.getBoundingClientRect();
    const scale = prior.width / fresh.width;
    const origin = `${fresh.left - box.left}px ${fresh.top - box.top}px`;
    wrap.style.transformOrigin = origin;
    old.style.transformOrigin = origin;
    const timing = { duration: ZOOM_MS, delay: ZOOM_DELAY_MS, easing: 'cubic-bezier(.65,0,.35,1)', fill: 'backwards' as const };
    const zoom = wrap.animate([{ transform: `scale(${scale})` }, { transform: 'scale(1)' }], timing);
    old.animate([{ transform: 'scale(1)' }, { transform: `scale(${1 / scale})` }], { ...timing, fill: 'both' });
    oldRef.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ZOOM_MS * .55, delay: ZOOM_DELAY_MS, easing: 'ease-in-out', fill: 'both' });
    zoom.onfinish = done;
    return () => { zoom.onfinish = null; };
  }, [stage]);

  const narration = stage === 'out' ? 'Muju Hono Irumbu.'
    : stage === 'reveal' ? `${scenario.narration.done} ${scenario.reveal.word}.`
    : phase === 'hint-target' ? scenario.narration.target : scenario.narration.piece;
  const prior = SCENARIOS[index - 1];

  return <main className="onboarding" data-stage={stage} data-puzzle={scenario.id} aria-label="Muju Hono Irumbu tutorial">
    <div className="onboarding-word-band">{stage === 'reveal' && <Reveal key={scenario.id} word={scenario.reveal.word} onDone={afterReveal} />}</div>
    <div ref={stageRef} className="onboarding-stage">
      {previous && prior && stage === 'zoom' && <div ref={oldRef} className="onboarding-layer zoom-old" aria-hidden="true">
        <div className="zoom-board"><Board board={previous.board} hideHomeMarkers={prior.hideHomeMarkers}
          selectedUnit={null} validMoves={[]} validAttacks={[]} validSpawns={[]} onCellClick={() => {}} onUnitClick={() => {}}
          unitClassName={unit => prior.pieces.some(p => p.inert && unitId(p) === unit.id) ? 'tutorial-inert' : undefined} /></div>
      </div>}
      <div className="onboarding-layer">
        <div ref={zoomRef} className="zoom-board">
          <PuzzleBoard key={scenario.id} scenario={scenario} emit={effects.emit} play={play}
            paused={stage !== 'puzzle'} onSolved={onSolved} onPhase={setPhase} />
        </div>
      </div>
      <BoardEffects handle={effects.handle} />
    </div>
    <div className="onboarding-skip-band">
      <button type="button" className="onboarding-skip" onClick={finish}>Skip Tutorial <span aria-hidden="true">→</span></button>
    </div>
    <p className="vh-label" aria-live="polite" data-testid="tutorial-narration">{narration}</p>
  </main>;
}
