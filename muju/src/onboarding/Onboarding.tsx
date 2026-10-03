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

type Stage = 'intro' | 'puzzle' | 'reveal' | 'zoom' | 'title' | 'out';
const INTRO_MS = 900, ZOOM_MS = 750, TITLE_MS = 2200, OUT_MS = 500;
const reducedMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Wordless first visit: three puzzles on boards that grow 3×3 → 6×6 → 10×10,
 * each ending in its piece's name, then the assembled title. Teaching is light,
 * motion and sound; words appear only as the reveals, the title, Skip and
 * screen-reader narration.
 */
export function Onboarding({ onComplete }: { onComplete: () => void }) {
  const [index, setIndex] = useState(0);
  const [stage, setStage] = useState<Stage>('intro');
  const [words, setWords] = useState(0);
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
    if (stage === 'title') { const t = window.setTimeout(() => setStage('out'), TITLE_MS); return () => clearTimeout(t); }
    if (stage === 'out') { const t = window.setTimeout(finish, reducedMotion() ? 0 : OUT_MS); return () => clearTimeout(t); }
  }, [stage, finish]);

  const onSolved = useCallback((final: GameState) => { solved.current = final; setStage('reveal'); }, []);
  useEffect(() => {
    if (stage !== 'reveal') return;
    setWords(n => Math.max(n, index + 1));
    play(['reveal']);
  }, [stage, index, play]);

  const afterReveal = useCallback(() => {
    if (index === SCENARIOS.length - 1) { setStage('title'); return; }
    setPrevious(solved.current);
    setIndex(i => i + 1);
    setPhase('hint-piece');
    setStage('zoom');
  }, [index]);

  // The pulled-back board starts scaled so its top-left cells sit exactly on the old ones.
  useLayoutEffect(() => {
    if (stage !== 'zoom') return;
    const done = () => { setPrevious(null); setStage('puzzle'); };
    const wrap = zoomRef.current, old = oldRef.current;
    const fresh = wrap?.querySelector('[data-testid="cell-0-0"]')?.getBoundingClientRect();
    const prior = old?.querySelector('[data-testid="cell-0-0"]')?.getBoundingClientRect();
    if (reducedMotion() || !wrap || !old || !fresh || !prior || !wrap.animate) { done(); return; }
    const box = wrap.getBoundingClientRect();
    const scale = prior.width / fresh.width;
    wrap.style.transformOrigin = `${fresh.left - box.left}px ${fresh.top - box.top}px`;
    const easing = 'cubic-bezier(.45,0,.2,1)';
    const zoom = wrap.animate([{ transform: `scale(${scale})` }, { transform: 'scale(1)' }], { duration: ZOOM_MS, easing });
    old.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ZOOM_MS * .6, easing: 'ease-out', fill: 'forwards' });
    zoom.onfinish = done;
    return () => { zoom.onfinish = null; };
  }, [stage]);

  const narration = stage === 'title' || stage === 'out' ? 'Muju Hono Irumbu.'
    : stage === 'reveal' ? `${scenario.narration.done} ${scenario.reveal.word}.`
    : phase === 'hint-target' ? scenario.narration.target : scenario.narration.piece;
  const assembled = stage === 'title' || stage === 'out';

  return <main className="onboarding" data-stage={stage} data-puzzle={scenario.id} aria-label="Muju Hono Irumbu tutorial">
    <button type="button" className="onboarding-skip" onClick={finish}>Skip</button>
    <h1 className={`onboarding-title${assembled ? ' assembled' : ''}`} aria-hidden={!assembled}>
      {SCENARIOS.map((s, i) => <span key={s.id} className={i < words ? 'is-shown' : ''}>{assembled ? s.reveal.title : s.reveal.word}</span>)}
    </h1>
    <div ref={stageRef} className="onboarding-stage">
      {previous && stage === 'zoom' && <div ref={oldRef} className="onboarding-layer zoom-old" aria-hidden="true">
        <div className="zoom-board"><Board board={previous.board} hideHomeMarkers={SCENARIOS[index - 1].hideHomeMarkers}
          selectedUnit={null} validMoves={[]} validAttacks={[]} validSpawns={[]} onCellClick={() => {}} onUnitClick={() => {}}
          unitClassName={unit => SCENARIOS[index - 1].pieces.some(p => p.inert && unitId(p) === unit.id) ? 'tutorial-inert' : undefined} /></div>
      </div>}
      <div className="onboarding-layer">
        <div ref={zoomRef} className="zoom-board">
          <PuzzleBoard key={scenario.id} scenario={scenario} stage={stageRef} emit={effects.emit} play={play}
            paused={stage !== 'puzzle'} onSolved={onSolved} onPhase={setPhase} />
        </div>
      </div>
      {stage === 'reveal' && <Reveal key={scenario.id} scenario={scenario} onDone={afterReveal} />}
      <BoardEffects handle={effects.handle} />
    </div>
    <p className="vh-label" aria-live="polite" data-testid="tutorial-narration">{narration}</p>
  </main>;
}
