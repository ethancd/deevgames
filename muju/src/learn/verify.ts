import { applyAction } from '../ai/simulate';
import { generateAllActions } from '../ai/moves';
import { getStartCorner } from '../game/board';
import type { GameState } from '../game/types';
import { evaluate, goalText, makeContext, type PuzzleContext } from './goals';
import { formatLine, parseBoard, playLine } from './notation';
import { Budget, PuzzleSearch, chooseReply, stateKey } from './solver';
import type { Goal, PuzzleSpec } from './types';

/**
 * Proof obligations for one puzzle, shared by `tests/learn/catalog.test.ts`
 * and `tools/learn-check.ts`. Errors fail CI; notes are for the author.
 */
export interface PuzzleReport {
  id: string;
  text: string;
  errors: string[];
  notes: string[];
  /** Distinct ways your first turn can end, and how many of them solve the puzzle (one-turn puzzles). */
  outcomes?: { winning: number; total: number };
  /** A winning first turn found by the solver, in notation. */
  witness?: string[];
  nodes: number;
  ms: number;
}

const leaves = (goal: Goal): Goal[] => goal.kind === 'all' ? goal.goals.flatMap(leaves) : [goal];

export function verifyPuzzle(spec: PuzzleSpec, options: { nodeLimit?: number; outcomes?: boolean } = {}): PuzzleReport {
  const t0 = performance.now();
  const report: PuzzleReport = { id: spec.id, text: '', errors: [], notes: [], nodes: 0, ms: 0 };
  const fail = (m: string) => report.errors.push(m);
  let ctx: PuzzleContext;
  try {
    ctx = makeContext(spec);
    report.text = goalText(spec);
  } catch (e) { fail(`does not build: ${(e as Error).message}`); return report; }
  const { start, hero, enemy, turns } = ctx;
  const size = start.board.cells.length;
  const kinds = new Set(leaves(spec.goal).map(g => g.kind));

  // Shape.
  const heroes = start.board.units.filter(u => u.owner === hero), enemies = start.board.units.filter(u => u.owner === enemy);
  if (!heroes.length) fail('you have no pieces');
  const needsEnemy = turns > 1 || ctx.timing === 'reply' || kinds.has('summon') || kinds.has('promote') || kinds.has('bank') || kinds.has('home') || !!spec.prepare;
  if (!enemies.length && needsEnemy) fail('needs at least one enemy piece: with none, the game ends at Mine & prepare');
  const heroHome = getStartCorner(hero, size), enemyHome = getStartCorner(enemy, size);
  if (spec.homes && enemies.some(u => u.position.x === heroHome.x && u.position.y === heroHome.y)) report.notes.push('an enemy piece starts on your home');
  if (spec.homes && heroes.some(u => u.position.x === enemyHome.x && u.position.y === enemyHome.y)) report.notes.push('one of your pieces starts on the enemy home');
  if ((kinds.has('home') || kinds.has('summon')) && !spec.homes) fail('home and summon goals need `homes: true`');
  for (const p of parseBoard(spec.board).pieces) if (p.owner === hero && p.damage) fail('your own pieces cannot start damaged (they heal at your turn start)');
  if (spec.side === 'black' && turns > 1) report.notes.push('multi-turn puzzle played as Black');

  if (evaluate(ctx, start) !== 'pending') fail('the goal is already decided at the start');

  const search = new PuzzleSearch(ctx, { nodeLimit: options.nodeLimit ?? 3_000_000 });
  try {
    // Solvable at all?
    if (!search.wins(start)) fail('the solver finds no solution');
    else {
      const line = search.line(start);
      if (line) report.witness = formatLine(start, line);
    }
    // Is the stated horizon tight? A two-turn puzzle that can be done in one is mislabeled.
    if (turns > 1) {
      const quick = new PuzzleSearch(makeContext({ ...spec, turns: turns - 1 }), { nodeLimit: options.nodeLimit ?? 3_000_000 });
      if (quick.wins(makeContext({ ...spec, turns: turns - 1 }).start)) fail(`it can already be solved in ${turns - 1} turn${turns - 1 === 1 ? '' : 's'}`);
    }
    // Doing nothing must not solve it, unless the puzzle says it is a freebie.
    const idle = playIdle(ctx);
    if (idle && evaluate(ctx, idle) === 'solved' && !spec.freebie) fail('ending the turn without doing anything solves it (mark `freebie: true` if intended)');
    if (spec.freebie && (!idle || evaluate(ctx, idle) !== 'solved')) report.notes.push('marked freebie but idling does not solve it');

    // The author's line.
    const played = playLine(start, spec.solution);
    if (played.error) fail(`solution: ${played.error}`);
    else {
      const status = evaluate(ctx, played.state);
      if (status === 'failed') fail('solution fails');
      else if (status === 'pending') {
        if (played.state.turn.currentPlayer === hero && heroTurnsDone(ctx, played.state) === 0) fail('solution stops mid-turn without solving');
        else if (!search.wins(played.state)) fail('solution can be refuted by the enemy reply');
      }
    }
    // Every try must be a dead end, and the live reply must find the refutation.
    for (const [i, attempt] of (spec.tries ?? []).entries()) {
      const tried = playLine(start, attempt);
      if (tried.error) { fail(`try ${i + 1}: ${tried.error}`); continue; }
      if (search.wins(tried.state)) { fail(`try ${i + 1} [${attempt.join(' ')}] still wins`); continue; }
      if (tried.state.phase === 'playing' && tried.state.turn.currentPlayer === enemy) {
        const reply = chooseReply(ctx, tried.state);
        if (!reply.refutes) fail(`try ${i + 1}: the live reply does not find the refutation`);
      }
    }
    if (options.outcomes !== false && turns === 1) report.outcomes = firstTurnOutcomes(ctx, search);
  } catch (e) {
    if (e instanceof Budget) fail(`search budget exhausted (${search.nodes} nodes): make the position smaller`);
    else throw e;
  }
  report.nodes = search.nodes;
  report.ms = Math.round(performance.now() - t0);
  if (report.nodes > 300_000) report.notes.push(`heavy search (${report.nodes} nodes): live hints may be slow`);
  return report;
}

const heroTurnsDone = (ctx: PuzzleContext, s: GameState) => s.turn.turnNumber - ctx.start.turn.turnNumber + (ctx.hero === 'white' && s.turn.currentPlayer !== 'white' ? 1 : 0);

/** End your turn at once: Mine & prepare, keep everything you can, End turn. */
function playIdle(ctx: PuzzleContext): GameState | null {
  let s = ctx.start;
  for (let i = 0; i < 4 && s.phase === 'playing' && s.turn.currentPlayer === ctx.hero; i++) {
    const action = s.turn.phase === 'action' ? { type: 'END_ACTION_PHASE' as const }
      : s.upkeepPending ? generateAllActions(s, ctx.hero).filter(a => a.type === 'PAY_UPKEEP').sort((a, b) => (b as { keepUnitIds: string[] }).keepUnitIds.length - (a as { keepUnitIds: string[] }).keepUnitIds.length)[0]
      : { type: 'END_PLACE_PHASE' as const };
    if (!action) return null;
    const next = applyAction(s, action);
    if (next === s) return null;
    s = next;
    if (evaluate(ctx, s) !== 'pending') return s;
  }
  return s;
}

/** Distinct first-turn endings (solved early, or the hand-over) and how many of them win. */
function firstTurnOutcomes(ctx: PuzzleContext, search: PuzzleSearch): { winning: number; total: number } {
  const outcomes = new Map<string, boolean>();
  const seen = new Set<string>();
  const walk = (s: GameState) => {
    const status = evaluate(ctx, s);
    if (status !== 'pending' || s.phase !== 'playing' || s.turn.currentPlayer !== ctx.hero) {
      const k = stateKey(s);
      if (!outcomes.has(k)) outcomes.set(k, status === 'solved' || (status === 'pending' && search.wins(s)));
      return;
    }
    const k = stateKey(s);
    if (seen.has(k)) return;
    seen.add(k);
    if (seen.size > 200_000) throw new Budget();
    for (const action of search.heroActions(s)) {
      const next = applyAction(s, action);
      if (next !== s) walk(next);
    }
  };
  walk(ctx.start);
  const values = [...outcomes.values()];
  return { winning: values.filter(Boolean).length, total: values.length };
}
