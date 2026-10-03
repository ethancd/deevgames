import type { AIAction } from '../ai/types';
import { applyAction } from '../ai/simulate';
import { generateAllActions } from '../ai/moves';
import { getStartCorner } from '../game/board';
import type { GameState } from '../game/types';
import { DECISIVE, evaluate, goalText, makeContext, type PuzzleContext } from './goals';
import { formatLine, parseBoard, playLine } from './notation';
import { Budget, PuzzleSearch, chooseReply, compressLine, stateKey } from './solver';
import type { Goal, PuzzleSpec } from './types';
import { LIVE_BUDGET } from './worker/client';

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
  /** Live "can I still win" checks after your first one or two actions that exceed the app's budget (`--live`). */
  live?: { over: number; total: number };
  /** A winning first turn found by the solver, in notation. */
  witness?: string[];
  nodes: number;
  ms: number;
}

const leaves = (goal: Goal): Goal[] => goal.kind === 'all' ? goal.goals.flatMap(leaves) : [goal];

export function verifyPuzzle(spec: PuzzleSpec, options: { nodeLimit?: number; outcomes?: boolean; live?: boolean } = {}): PuzzleReport {
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
  const needsEnemy = turns > 1 || ctx.timing === 'reply' || kinds.has('summon') || kinds.has('deny') || kinds.has('promote') || kinds.has('bank') || kinds.has('home') || !!spec.prepare;
  if (!enemies.length && needsEnemy) fail('needs at least one enemy piece: with none, the game ends at Mine & prepare');
  const heroHome = getStartCorner(hero, size), enemyHome = getStartCorner(enemy, size);
  if (spec.homes && enemies.some(u => u.position.x === heroHome.x && u.position.y === heroHome.y)) report.notes.push('an enemy piece starts on your home');
  if (spec.homes && heroes.some(u => u.position.x === enemyHome.x && u.position.y === enemyHome.y)) report.notes.push('one of your pieces starts on the enemy home');
  if ((kinds.has('home') || kinds.has('summon') || kinds.has('hold') || kinds.has('deny')) && !spec.homes) fail('home, hold, summon and deny goals need `homes: true`');
  if (kinds.has('deny') && !(start.pendingSummons ?? []).some(p => p.owner === enemy)) fail('a deny goal needs enemy summons in `pending` (owner: the enemy)');
  for (const p of parseBoard(spec.board).pieces) if (p.owner === hero && p.damage) fail('your own pieces cannot start damaged (they heal at your turn start)');
  if (spec.side === 'black' && turns > 1) report.notes.push('multi-turn puzzle played as Black');

  if (evaluate(ctx, start) !== 'pending') fail('the goal is already decided at the start');

  const search = new PuzzleSearch(ctx, { nodeLimit: options.nodeLimit ?? 1_500_000 });
  // Home and eliminate goals are proved strictly: their own kind of win must exist
  // (any other win also counts in the app, but must not be the only way).
  const strictKinds = kinds.has('home') || kinds.has('eliminate');
  const strict = strictKinds ? new PuzzleSearch(makeContext(spec, { strict: true }), { nodeLimit: options.nodeLimit ?? 1_500_000 }) : null;
  try {
    // Solvable at all? (A strict win is also a win, so one search settles both.)
    const prover = strict ?? search;
    if (!prover.wins(prover.ctx.start)) {
      fail(strict && search.wins(start) ? (kinds.has('home') ? 'it can only be won by capturing everything, not at the home' : 'it can only be won at the home, not by capturing everything') : 'the solver finds no solution');
    } else {
      const line = prover.line(prover.ctx.start);
      if (line) report.witness = formatLine(start, compressLine(start, line));
    }
    // Is the stated horizon tight? A two-turn puzzle that can be done in one is mislabeled.
    if (turns > 1) {
      const quick = new PuzzleSearch(makeContext({ ...spec, turns: turns - 1 }), { nodeLimit: options.nodeLimit ?? 1_500_000 });
      if (quick.wins(makeContext({ ...spec, turns: turns - 1 }).start)) fail(`it can already be solved in ${turns - 1} turn${turns - 1 === 1 ? '' : 's'}`);
    }
    // Doing nothing must not solve it, unless the puzzle says it is a freebie.
    // (For goals judged after the reply, "solves it" means it wins against every reply.)
    const idle = playIdle(ctx);
    const lastTurn = !!idle && heroTurnsDone(ctx, idle) >= turns;
    const idleWins = !!idle && (evaluate(ctx, idle) === 'solved' || (lastTurn && evaluate(ctx, idle) === 'pending' && search.wins(idle)));
    if (idleWins && !spec.freebie) fail('ending the turn without doing anything solves it (mark `freebie: true` if intended)');
    if (spec.freebie && !idleWins) report.notes.push('marked freebie but idling does not solve it');

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
      // The app plays the enemy's refutation only when the puzzle is still open at the hand-over
      // (or for a home goal, where the defender's turn is the lesson); a line already lost there shows its card at once.
      const decidedAtHandOver = evaluate(ctx, tried.state) === 'failed' && !kinds.has('home');
      if (tried.state.phase === 'playing' && tried.state.turn.currentPlayer === enemy && !decidedAtHandOver) {
        // At the app's own budget: a refutation found only by a deeper search is never played.
        const reply = chooseReply(ctx, tried.state, { nodeLimit: LIVE_BUDGET.reply });
        if (!reply.refutes) fail(`try ${i + 1}: the live reply does not find the refutation`);
      }
    }
    // No first turn may win only by another route (one-turn puzzles are checked with the outcomes below).
    if (strict && turns > 1 && options.outcomes !== false) {
      const cook = routeCook(ctx, search, strict);
      if (cook) fail(`first turn [${cook.join(' ')}] wins only by ${kinds.has('home') ? 'elimination' : 'home occupation'}`);
    }
    if (options.outcomes !== false && turns === 1) {
      const { winning, total, wonButFailed, otherRoute } = firstTurnOutcomes(ctx, search);
      report.outcomes = { winning, total };
      if (wonButFailed) fail(`a first turn wins the game (${wonButFailed}) but fails the puzzle: a player who wins must not be told they failed`);
      if (otherRoute) fail(`a first turn wins by ${otherRoute} instead of the puzzle's own idea`);
    }
    if (options.live && turns === 1) report.live = liveChecks(ctx, search);
  } catch (e) {
    if (e instanceof Budget) fail(`search budget exhausted (${search.nodes + (strict?.nodes ?? 0)} nodes): make the position smaller`);
    else throw e;
  }
  report.nodes = search.nodes + (strict?.nodes ?? 0);
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

/**
 * Distinct first-turn endings (solved early, or the hand-over) and how many of
 * them win. Also catches the two ways a puzzle can disagree with the game: a
 * line that wins the game but fails the puzzle, and a win-the-game goal reached
 * by a different victory than the one it teaches.
 */
function firstTurnOutcomes(ctx: PuzzleContext, search: PuzzleSearch): { winning: number; total: number; wonButFailed?: string; otherRoute?: string } {
  const outcomes = new Map<string, boolean>();
  const seen = new Set<string>();
  const kinds = new Set(leaves(ctx.spec.goal).map(g => g.kind));
  const natural = kinds.has('home') ? ['home-checkmate', 'home-occupation'] : kinds.has('eliminate') ? ['elimination'] : null;
  let wonButFailed: string | undefined, otherRoute: string | undefined;
  const walk = (s: GameState) => {
    const status = evaluate(ctx, s);
    if (status !== 'pending' || s.phase !== 'playing' || s.turn.currentPlayer !== ctx.hero) {
      const k = stateKey(s);
      if (!outcomes.has(k)) outcomes.set(k, status === 'solved' || (status === 'pending' && search.wins(s)));
      const decisive = s.phase === 'victory' && s.winner === ctx.hero && DECISIVE.has(s.victoryReason ?? '');
      if (decisive && status === 'failed') wonButFailed ??= s.victoryReason;
      if (decisive && status === 'solved' && natural && !natural.includes(s.victoryReason!)) otherRoute ??= s.victoryReason;
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
  return { winning: values.filter(Boolean).length, total: values.length, wonButFailed, otherRoute };
}

/** A first turn after which the puzzle is won by another route but not by its own. */
function routeCook(ctx: PuzzleContext, search: PuzzleSearch, strict: PuzzleSearch): string[] | null {
  const seen = new Set<string>();
  let found: string[] | null = null;
  const walk = (s: GameState, line: AIAction[]) => {
    if (found) return;
    if (s.phase !== 'playing' || s.turn.currentPlayer !== ctx.hero) {
      if (search.wins(s) && !strict.wins(s)) found = formatLine(ctx.start, compressLine(ctx.start, line));
      return;
    }
    const k = stateKey(s);
    if (seen.has(k)) return;
    seen.add(k);
    if (seen.size > 100_000) throw new Budget();
    for (const action of search.heroActions(s)) {
      const next = applyAction(s, action);
      if (next !== s) walk(next, [...line, action]);
    }
  };
  walk(ctx.start, []);
  return found;
}

/** The app's live budget for "can I still win?" (src/learn/worker/client.ts). */
export const LIVE_WIN_BUDGET = LIVE_BUDGET.win;

/** Run the live check from every position after your first one or two actions; count those it cannot settle in budget. */
function liveChecks(ctx: PuzzleContext, search: PuzzleSearch): { over: number; total: number } {
  const positions = new Map<string, GameState>();
  const step = (s: GameState, depth: number) => {
    if (!depth) return;
    for (const action of search.heroActions(s)) {
      if (action.type !== 'MOVE' && action.type !== 'ATTACK') continue;
      const next = applyAction(s, action);
      if (next === s || evaluate(ctx, next) !== 'pending') continue;
      positions.set(stateKey(next), next);
      step(next, depth - 1);
    }
  };
  step(ctx.start, 2);
  let over = 0;
  for (const s of positions.values()) {
    try { new PuzzleSearch(ctx, { nodeLimit: LIVE_WIN_BUDGET }).wins(s); }
    catch (e) { if (e instanceof Budget) over++; else throw e; }
  }
  return { over, total: positions.size };
}
