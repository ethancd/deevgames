import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { applyAction } from '../ai/simulate';
import { blowEffect, MAGNITUDE_PITCH, type BoardEffect } from '../effects/effectModel';
import { getUnitById } from '../game/board';
import type { GameState, Position } from '../game/types';
import { KILL_SOUND, type SoundEffect } from '../sound/effects';
import { activeUnitId, buildScenarioState, finishScenario, goalSquare, scenarioPlan, scenarioStops, unitId as pieceUnitId, type Scenario } from './scenarios';

export type ScenarioPhase = 'hint-piece' | 'hint-target' | 'playing' | 'solved';
/** Idle time before the ghost pointer demonstrates the next tap. */
export const GHOST_DELAY_MS = 2000;
/** A glide takes a short lift-off plus a steady pace per square. */
export const glideMs = (squares: number) => 260 + squares * 140;
/** Path dots light one after another toward the target. */
const DOT_MS = 90;

const same = (a: Position, b: Position) => a.x === b.x && a.y === b.y;

/** One continuous slide through every square of a route, however many actions it spends. */
export interface Glide { unitId: string; cells: Position[]; startedAt: number; ms: number }

interface Options {
  emit: (effect: BoardEffect) => void;
  play: (effects: readonly SoundEffect[], options?: { rate?: number }) => void;
  /** Hold hints and input, e.g. during a zoom or the intro beat. */
  paused?: boolean;
  onSolved: (final: GameState) => void;
}

/**
 * Drives one puzzle: `hint-piece → hint-target → playing → solved`. The active
 * piece, any lit gold dot (a square from which the puzzle is still winnable) and
 * the goal respond; anything else shakes and the hint restarts. Every step is
 * played through `applyAction`.
 */
export function useScenario(scenario: Scenario, { emit, play, paused = false, onSolved }: Options) {
  const [state, setState] = useState(() => buildScenarioState(scenario));
  const [phase, setPhase] = useState<ScenarioPhase>('hint-piece');
  const [ghost, setGhost] = useState(false);
  const [lit, setLit] = useState(0);
  const [wrong, setWrong] = useState<{ at: Position; key: number } | null>(null);
  const [glide, setGlide] = useState<Glide | null>(null);
  const [gliding, setGliding] = useState(false);
  const timers = useRef<number[]>([]);
  const solvedRef = useRef(onSolved);
  solvedRef.current = onSolved;

  const activeId = activeUnitId(scenario);
  const goal = goalSquare(scenario);
  const hinting = phase === 'hint-piece' || phase === 'hint-target';
  // The route and its winning stops always start from where the piece stands now.
  const plan = useMemo(() => hinting ? scenarioPlan(state, scenario) : null, [hinting, state, scenario]);
  const stops = useMemo(() => hinting ? scenarioStops(state, scenario) : [], [hinting, state, scenario]);
  const later = useCallback((ms: number, fn: () => void) => { timers.current.push(window.setTimeout(fn, ms)); }, []);
  useEffect(() => () => { timers.current.forEach(clearTimeout); timers.current = []; }, []);

  // Ghost pointer after idle; any tap or phase change restarts the wait.
  const [idleKey, setIdleKey] = useState(0);
  useEffect(() => {
    setGhost(false);
    if (paused || !hinting) return;
    const timer = window.setTimeout(() => setGhost(true), GHOST_DELAY_MS);
    return () => clearTimeout(timer);
  }, [phase, paused, idleKey, hinting]);

  // Light the path one dot at a time once the piece is selected, again after each stop.
  const pathLength = plan?.path.length ?? 0;
  useEffect(() => { setLit(0); }, [state]);
  useEffect(() => {
    if (phase !== 'hint-target') { setLit(0); return; }
    if (lit >= pathLength || gliding) return;
    const timer = window.setTimeout(() => setLit(n => n + 1), DOT_MS);
    return () => clearTimeout(timer);
  }, [phase, lit, pathLength, gliding]);

  const miss = useCallback((at: Position) => {
    setWrong({ at, key: Date.now() });
    play(['wrong']);
    setIdleKey(k => k + 1);
  }, [play]);

  /** Slide the active piece along `route` (excluding its start); returns the glide's length. */
  const slide = useCallback((from: Position, route: Position[]) => {
    const ms = glideMs(route.length);
    setGlide({ unitId: activeId, cells: [from, ...route], startedAt: performance.now(), ms });
    setGliding(true);
    later(ms - 60, () => play(['move']));
    later(ms, () => setGliding(false));
    return ms;
  }, [activeId, later, play]);

  /** A lit gold dot: move there now and keep hinting from the new square. */
  const stopAt = useCallback((at: Position) => {
    const unit = getUnitById(state.board, activeId)!;
    const index = plan!.path.findIndex(p => same(p, at));
    const next = applyAction(state, { type: 'MOVE', unitId: activeId, to: at });
    if (next === state || index < 0) return;
    slide(unit.position, plan!.path.slice(0, index + 1));
    setState(next);
    setIdleKey(k => k + 1);
  }, [state, plan, activeId, slide]);

  const run = useCallback(() => {
    setPhase('playing');
    const line = plan!;
    const start = getUnitById(state.board, activeId)!.position;
    // Every move lands at once in the rules; on screen the piece glides the whole route.
    let current = state;
    for (const action of line.actions.filter(a => a.type === 'MOVE')) current = applyAction(current, action);
    const moved = current;
    if (moved !== state) setState(moved);
    const arrive = moved !== state ? slide(start, line.path) : 0;
    const strike = line.actions.find(a => a.type === 'ATTACK');
    later(arrive + 80, () => {
      if (strike) {
        const next = applyAction(current, strike);
        const attacker = getUnitById(current.board, strike.unitId)!;
        const target = current.board.units.find(u => same(u.position, strike.targetPosition))!;
        const blow = blowEffect(attacker, target, getUnitById(next.board, target.id) ? 'hit' : 'kill');
        current = next;
        setState(next);
        emit(blow);
        if (blow.kind === 'kill') play(['capture', KILL_SOUND[blow.attackerElement]], { rate: MAGNITUDE_PITCH[blow.magnitude] });
        else play(['attack']);
      }
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
  }, [state, plan, activeId, slide, later, play, emit, scenario, goal.x, goal.y]);

  // A tap made while the piece is still sliding plays the moment it lands.
  const queued = useRef<{ at: Position; unitId?: string } | null>(null);
  const tap = useCallback((at: Position, unitId?: string) => {
    if (gliding) { queued.current = { at, unitId }; return; }
    if (paused || !hinting) return;
    const unit = unitId ? getUnitById(state.board, unitId) : null;
    if (unit && scenario.pieces.some(p => p.inert && pieceUnitId(p) === unit.id)) return;
    if (unit?.id === activeId) {
      if (phase === 'hint-piece') { setPhase('hint-target'); play(['hint']); }
      setIdleKey(k => k + 1);
      return;
    }
    if (phase === 'hint-target' && same(at, goal)) { run(); return; }
    if (phase === 'hint-target' && stops.some(p => same(p, at))) { stopAt(at); return; }
    miss(at);
  }, [paused, hinting, gliding, phase, state.board, scenario.pieces, activeId, goal, stops, run, stopAt, miss, play]);

  useEffect(() => {
    if (gliding || !queued.current) return;
    const { at, unitId } = queued.current;
    queued.current = null;
    tap(at, unitId);
  }, [gliding, tap]);

  const litSquares = phase === 'hint-target' && plan ? plan.path.slice(0, lit) : [];
  return {
    state, phase, ghost, wrong, goal, activeId, glide, gliding,
    /** Lit gold dots: squares on the route the piece can stop on and still win. */
    litPath: litSquares.filter(p => !same(p, goal) && stops.some(s => same(s, p))),
    goalLit: phase === 'hint-target' && lit >= pathLength,
    onCellClick: (at: Position) => tap(at),
    onUnitClick: (unitId: string) => { const unit = getUnitById(state.board, unitId); if (unit) tap(unit.position, unitId); },
  };
}
