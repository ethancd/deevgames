import { useCallback, useRef, useState } from 'react';
import { UnitArtwork } from '../components/UnitArtwork';
import { BoardEffects, useBoardEffects } from '../effects/BoardEffects';
import { getUnitDefinition } from '../game/units';
import { useSoundEffects } from '../sound/SoundProvider';
import { PuzzleBoard } from './PuzzleBoard';
import { Reveal } from './Reveal';
import { SCENARIOS, type Scenario } from './scenarios';
import type { ScenarioPhase } from './useScenario';
import './onboarding.css';

/** Every scenario, replayable. Adding a puzzle is adding a scenario object. */
export function PuzzleList({ onBack }: { onBack: () => void }) {
  const [playing, setPlaying] = useState<Scenario | null>(null);
  if (playing) return <PuzzlePlayer key={playing.id} scenario={playing} onBack={() => setPlaying(null)} />;
  return <main className="puzzle-list mode-select min-h-screen bg-gray-900 text-white flex items-center justify-center p-4">
    <div className="max-w-md w-full space-y-6">
      <div className="music-lobby-nav"><button type="button" className="text-sm text-cyan-300" onClick={onBack}>← Modes</button></div>
      <h1 className="text-3xl font-bold text-center">Puzzles</h1>
      <ul className="puzzle-grid">
        {SCENARIOS.map((scenario, i) => {
          const def = getUnitDefinition(scenario.reveal.type);
          return <li key={scenario.id}><button type="button" onClick={() => setPlaying(scenario)} aria-label={`Puzzle ${i + 1}: ${scenario.reveal.word}`}>
            <span className="puzzle-glyph"><UnitArtwork element={def.element} owner={scenario.pieces.find(p => p.id === scenario.active)!.owner} tier={def.tier} /></span>
            <strong>{scenario.reveal.word}</strong>
            <small>{scenario.size}×{scenario.size}</small>
          </button></li>;
        })}
      </ul>
    </div>
  </main>;
}

function PuzzlePlayer({ scenario, onBack }: { scenario: Scenario; onBack: () => void }) {
  const [round, setRound] = useState(0);
  const [stage, setStage] = useState<'puzzle' | 'reveal' | 'done'>('puzzle');
  const [phase, setPhase] = useState<ScenarioPhase>('hint-piece');
  const stageRef = useRef<HTMLDivElement>(null);
  const effects = useBoardEffects();
  const play = useSoundEffects();
  const onSolved = useCallback(() => { setStage('reveal'); play(['reveal']); }, [play]);
  const narration = stage !== 'puzzle' ? `${scenario.narration.done} ${scenario.reveal.word}.`
    : phase === 'hint-target' ? scenario.narration.target : scenario.narration.piece;
  return <main className="onboarding puzzle-player" data-stage={stage} data-puzzle={scenario.id} aria-label={`${scenario.reveal.word} puzzle`}>
    <div className="onboarding-word-band">{stage === 'reveal' && <Reveal word={scenario.reveal.word} onDone={() => setStage('done')} />}</div>
    <div ref={stageRef} className="onboarding-stage">
      <div className="onboarding-layer"><div className="zoom-board">
        <PuzzleBoard key={round} scenario={scenario} emit={effects.emit} play={play} paused={stage !== 'puzzle'} onSolved={onSolved} onPhase={setPhase} />
      </div></div>
      <BoardEffects handle={effects.handle} />
    </div>
    <div className="onboarding-skip-band puzzle-player-actions">
      {stage === 'done' && <button type="button" className="onboarding-skip" onClick={() => { setRound(r => r + 1); setStage('puzzle'); }}>Play again</button>}
      <button type="button" className="onboarding-skip" onClick={onBack}>All puzzles <span aria-hidden="true">→</span></button>
    </div>
    <p className="vh-label" aria-live="polite">{narration}</p>
  </main>;
}
