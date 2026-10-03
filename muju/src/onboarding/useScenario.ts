import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { applyAction } from '../ai/simulate';
import { blowEffect, MAGNITUDE_PITCH, type BoardEffect } from '../effects/effectModel';
import { getUnitById } from '../game/board';
import type { GameState, Position } from '../game/types';
import { KILL_SOUND, type SoundEffect } from '../sound/effects';
import { activeUnitId, buildScenarioState, finishScenario, goalSquare, scenarioPlan, unitId as pieceUnitId, type Scenario } from './scenarios';

export type ScenarioPhase = 'hint-piece' | 'hint-target' | 'playing' | 'solved';
/** Idle time before the ghost pointer demonstrates the next tap. */
export const GHOST_DELAY_MS = 2000;
/** One speed-sized hop per beat, like replay playback. */
export const HOP_MS = 240;
/** Path dots light one after another toward the target. */
const DOT_MS = 90;

const same = (a: Position, b: Position) => a.x === b.x && a.y === b.y;

interface Options {
  emit: (effect: BoardEffect) => void;
  play: (effects: readonly SoundEffect[], options?: { rate?: number }) => void;
  /** Hold hints and input, e.g. during a zoom or the intro beat. */
  paused?: boolean;
  onSolved: (final: GameState) => void;
}

/**
 * Drives one puzzle: `hint-piece → hint-target → playing → solved`. Only the
 * active piece and then the goal square respond; anything else shakes and the
 * hint restarts. The line itself is always played through `applyAction`.
 */
export function useScenario(scenario: Scenario, { emit, play, paused = false, onSolved }: Options) {
  const [state, setState] = useState(() => buildScenarioState(scenario));
  const [phase, setPhase] = useState<ScenarioPhase>('hint-piece');
  const [ghost, setGhost] = useState(false);
  const [lit, setLit] = useState(0);
  const [wrong, setWrong] = useState<{ at: Position; key: number } | null>(null);
  const [hopping, setHopping] = useState(false);
  const timers = useRef<number[]>([]);
  const solvedRef = useRef(onSolved);
  solvedRef.current = onSolved;

  const activeId = activeUnitId(scenario);
  const goal = goalSquare(scenario);
  const plan = useMemo(() => scenarioPlan(buildScenarioState(scenario), scenario), [scenario]);
  const later = useCallback((ms: number, fn: () => void) => { timers.current.push(window.setTimeout(fn, ms)); }, []);
  useEffect(() => () => { timers.current.forEach(clearTimeout); timers.current = []; }, []);

  // Ghost pointer after idle; any tap or phase change restarts the wait.
  const [idleKey, setIdleKey] = useState(0);
  useEffect(() => {
    setGhost(false);
    if (paused || (phase !== 'hint-piece' && phase !== 'hint-target')) return;
    const timer = window.setTimeout(() => setGhost(true), GHOST_DELAY_MS);
    return () => clearTimeout(timer);
  }, [phase, paused, idleKey]);

  // Light the path one dot at a time once the piece is selected.
  useEffect(() => {
    if (phase !== 'hint-target') { setLit(0); return; }
    if (lit >= plan.path.length) return;
    const timer = window.setTimeout(() => setLit(n => n + 1), DOT_MS);
    return () => clearTimeout(timer);
  }, [phase, lit, plan.path.length]);

  const miss = useCallback((at: Position) => {
    setWrong({ at, key: Date.now() });
    play(['wrong']);
    setIdleKey(k => k + 1);
  }, [play]);

  const run = useCallback(() => {
    setPhase('playing');
    setHopping(true);
    let current = state;
    plan.actions.forEach((action, i) => later(HOP_MS * (i + 1), () => {
      const before = current, next = applyAction(current, action);
      if (next === current) return;
      current = next;
      setState(next);
      if (action.type === 'MOVE') play(['move']);
      if (action.type === 'ATTACK') {
        const attacker = getUnitById(before.board, action.unitId)!;
        const target = before.board.units.find(u => same(u.position, action.targetPosition))!;
        const killed = !getUnitById(next.board, target.id);
        const blow = blowEffect(attacker, target, killed ? 'kill' : 'hit');
        emit(blow);
        if (blow.kind === 'kill') play(['capture', KILL_SOUND[blow.attackerElement]], { rate: MAGNITUDE_PITCH[blow.magnitude] });
        else play(['attack']);
      }
    }));
    const end = HOP_MS * (plan.actions.length + 1);
    later(end, () => {
      setHopping(false);
      const { final, mined, checkmate } = finishScenario(current, scenario);
      if (scenario.goal.kind === 'move' && mined) {
        setState(final);
        emit({ kind: 'collect', x: goal.x, y: goal.y, count: mined });
        for (let i = 0; i < mined; i++) later(160 * i + 380, () => play(['collect']));
      }
      if (scenario.goal.kind === 'invade' && checkmate) {
        emit({ kind: 'checkmate', x: goal.x, y: goal.y, winner: 'white' });
        play(['checkmate']);
      }
      // Puzzle 3 only celebrates on a proven `#`; otherwise it simply does not advance.
      if (scenario.goal.kind === 'invade' && !checkmate) return;
      later(scenario.goal.kind === 'move' ? 1100 : 900, () => { setPhase('solved'); solvedRef.current(final); });
    });
  }, [state, plan, later, play, emit, scenario, goal.x, goal.y]);

  const tap = useCallback((at: Position, unitId?: string) => {
    if (paused || phase === 'playing' || phase === 'solved') return;
    const unit = unitId ? getUnitById(state.board, unitId) : null;
    if (unit && scenario.pieces.some(p => p.inert && pieceUnitId(p) === unit.id)) return;
    if (unit?.id === activeId) {
      if (phase === 'hint-piece') { setPhase('hint-target'); play(['hint']); }
      setIdleKey(k => k + 1);
      return;
    }
    if (phase === 'hint-target' && same(at, goal)) { run(); return; }
    miss(at);
  }, [paused, phase, state.board, scenario.pieces, activeId, goal, run, miss, play]);

  return {
    state, phase, ghost, hopping, wrong, goal, activeId,
    /** Lit path squares, never including the goal itself. */
    litPath: phase === 'hint-target' ? plan.path.slice(0, lit).filter(p => !same(p, goal)) : [],
    goalLit: phase === 'hint-target' && lit >= plan.path.length,
    onCellClick: (at: Position) => tap(at),
    onUnitClick: (unitId: string) => { const unit = getUnitById(state.board, unitId); if (unit) tap(unit.position, unitId); },
  };
}
