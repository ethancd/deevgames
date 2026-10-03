import { getStartCorner, getUnitById } from '../game/board';
import { getUnitDefinition } from '../game/units';
import type { GameState, PendingSummon, PlayerId, Position } from '../game/types';
import { buildPuzzleState, enemyOf, heroOf, pieceIdAt, turnsOf } from './build';
import { squareOf, typeOf } from './notation';
import type { Goal, PuzzleSpec } from './types';

export type Status = 'pending' | 'solved' | 'failed';

/** Everything a goal check needs, resolved once per puzzle. */
export interface PuzzleContext {
  spec: PuzzleSpec;
  start: GameState;
  hero: PlayerId;
  enemy: PlayerId;
  turns: number;
  startIds: ReadonlySet<string>;
  heroStartIds: readonly string[];
  /** When the goal can be judged: any time, at the end of your last turn, or after the enemy's reply to it. */
  timing: 'anytime' | 'turn-end' | 'reply';
  /** Proofs only: home and eliminate goals count only their own kind of win (no cooks by another route). */
  strict: boolean;
}

/** Goals judged the moment they become true. */
const ACHIEVEMENTS = new Set<Goal['kind']>(['reach', 'mine', 'capture', 'eliminate', 'home', 'summon', 'promote']);
const leaves = (goal: Goal): Goal[] => goal.kind === 'all' ? goal.goals.flatMap(leaves) : [goal];
const needsReply = (g: Goal) => g.kind === 'survive' || g.kind === 'hold' || (g.kind === 'summon' && !!g.arrive);

export function makeContext(spec: PuzzleSpec, options: { strict?: boolean } = {}): PuzzleContext {
  const start = buildPuzzleState(spec);
  const goals = leaves(spec.goal);
  const timing = goals.some(needsReply) ? 'reply' : goals.every(g => ACHIEVEMENTS.has(g.kind)) ? 'anytime' : 'turn-end';
  const hero = heroOf(spec);
  return { spec, start, hero, enemy: enemyOf(spec), turns: turnsOf(spec), startIds: new Set(start.board.units.map(u => u.id)),
    heroStartIds: start.board.units.filter(u => u.owner === hero).map(u => u.id), timing, strict: !!options.strict };
}

/** How many of your turns have been handed over since the puzzle began. */
export function heroTurnsDone(ctx: PuzzleContext, state: GameState): number {
  const round = state.turn.turnNumber - ctx.start.turn.turnNumber;
  return ctx.hero === 'white' && state.turn.currentPlayer !== 'white' ? round + 1 : round;
}

const heroUnits = (ctx: PuzzleContext, state: GameState) => state.board.units.filter(u => u.owner === ctx.hero);
const at = (p: Position, q: Position) => p.x === q.x && p.y === q.y;

/** One leaf goal against the current state. `final` is true once nothing more can happen. */
/** Winning the game outright (not the empty-board upkeep win of a puzzle with no enemy). */
export const DECISIVE = new Set(['elimination', 'home-checkmate', 'home-occupation']);
/** An enemy that releases its last pieces at its own upkeep has also lost outright, but a
 * puzzle that never had enemy pieces "wins" that way at Mine & prepare, which is not a win. */
const decisiveWin = (ctx: PuzzleContext, state: GameState) =>
  state.phase === 'victory' && state.winner === ctx.hero && (DECISIVE.has(state.victoryReason ?? '')
    || (state.victoryReason === 'upkeep-elimination' && ctx.start.board.units.some(u => u.owner === ctx.enemy)));

function holds(ctx: PuzzleContext, state: GameState, goal: Goal): boolean {
  switch (goal.kind) {
    case 'reach': {
      const mover = goal.piece ? pieceIdAt(ctx.spec, goal.piece) : null;
      return goal.flags.every(flag => heroUnits(ctx, state).some(u => at(u.position, squareOf(flag)) && (!mover || u.id === mover)));
    }
    case 'mine':
      return state.players[ctx.hero].resourcesGained - ctx.start.players[ctx.hero].resourcesGained >= goal.atLeast;
    case 'capture':
      return goal.targets.every(t => !getUnitById(state.board, pieceIdAt(ctx.spec, t)));
    // Winning the game another way also wins these: nobody is told they failed after winning.
    case 'eliminate':
      return !state.board.units.some(u => u.owner === ctx.enemy) || (!ctx.strict && decisiveWin(ctx, state));
    case 'home':
      return decisiveWin(ctx, state) && (!ctx.strict || state.victoryReason === 'home-checkmate' || state.victoryReason === 'home-occupation');
    case 'promote': {
      const type = typeOf(goal.to);
      if (goal.piece) return getUnitById(state.board, pieceIdAt(ctx.spec, goal.piece))?.definitionId === type;
      const count = (s: GameState) => s.board.units.filter(u => u.owner === ctx.hero && u.definitionId === type).length;
      return count(state) > count(ctx.start);
    }
    case 'summon': {
      const type = goal.type ? typeOf(goal.type) : null;
      const squares = goal.at?.map(squareOf);
      const fits = (definitionId: string, position: Position) => (!type || definitionId === type) && (!squares || squares.some(s => at(s, position)));
      const found = goal.arrive
        ? heroUnits(ctx, state).filter(u => !ctx.startIds.has(u.id) && fits(u.definitionId, u.position))
        : (state.pendingSummons ?? []).filter(p => p.owner === ctx.hero && !ctx.start.pendingSummons?.some(q => q.id === p.id) && fits(p.definitionId, p.position));
      return new Set(found.map(f => `${f.position.x},${f.position.y}`)).size >= (goal.count ?? 1);
    }
    case 'bank':
      return state.players[ctx.hero].resources >= goal.atLeast;
    case 'keep':
      return goal.pieces.every(s => !!getUnitById(state.board, pieceIdAt(ctx.spec, s)));
    case 'survive': {
      const ids = goal.pieces ? goal.pieces.map(s => pieceIdAt(ctx.spec, s)) : ctx.heroStartIds;
      return ids.every(id => !!getUnitById(state.board, id));
    }
    case 'hold':
      return !(state.phase === 'victory' && state.winner !== ctx.hero);
    case 'deny':
      // Judged right after your hand-over, when the enemy's summons have just landed or been refunded.
      return decisiveWin(ctx, state) || deniedSummons(ctx.spec, goal).every(p => !state.board.units.some(u => u.id === p.id));
    case 'all':
      return goal.goals.every(g => holds(ctx, state, g));
  }
}

/**
 * Judge a position. A loss always fails. Achievement goals (reach, mine, capture,
 * eliminate, home, summon, promote) are solved the moment they hold; bank and keep
 * are judged when your last turn ends; survive, hold and summon-arrive after the
 * enemy's reply to it. Missing the deadline fails.
 */
export function evaluate(ctx: PuzzleContext, state: GameState): Status {
  if (state.phase === 'victory' && state.winner !== ctx.hero) return 'failed';
  // Winning outright ends the puzzle; so does having nothing left to fight (a
  // puzzle with no enemy pieces is won by upkeep-elimination at Mine & prepare).
  const over = state.phase === 'victory';
  const done = heroTurnsDone(ctx, state);
  const ok = holds(ctx, state, ctx.spec.goal);
  if (ctx.timing === 'anytime') return ok ? 'solved' : over || done >= ctx.turns ? 'failed' : 'pending';
  if (over) return ok ? 'solved' : 'failed';
  if (ctx.timing === 'turn-end') return done >= ctx.turns ? ok ? 'solved' : 'failed' : 'pending';
  // Reply goals are judged when your next turn starts, after the enemy has answered.
  if (done >= ctx.turns && state.turn.currentPlayer === ctx.hero) return ok ? 'solved' : 'failed';
  // At the hand-over, anything that is not judged after the reply is final: the
  // enemy's turn can only take pieces away, never mine, capture or summon for you.
  if (done >= ctx.turns && !leaves(ctx.spec.goal).filter(g => !needsReply(g)).every(g => holds(ctx, state, g))) return 'failed';
  return 'pending';
}

// === Goal text ===

const nameOf = (type: string) => getUnitDefinition(typeOf(type)).name;
const startType = (spec: PuzzleSpec, square: string) => {
  const unit = getUnitById(buildPuzzleState(spec).board, pieceIdAt(spec, square));
  return unit!.definitionId;
};
const isEnemyHome = (spec: PuzzleSpec, square: string) => {
  const corner = getStartCorner(enemyOf(spec), buildPuzzleState(spec).board.cells.length), at = squareOf(square);
  return corner.x === at.x && corner.y === at.y;
};
/** The enemy's pending summons at the start that a deny goal targets. */
function deniedSummons(spec: PuzzleSpec, goal: Extract<Goal, { kind: 'deny' }>): PendingSummon[] {
  const start = buildPuzzleState(spec);
  const enemy = enemyOf(spec);
  return (start.pendingSummons ?? []).filter(p => p.owner === enemy && (!goal.at || goal.at.some(s => { const q = squareOf(s); return q.x === p.position.x && q.y === p.position.y; })));
}
const joinAnd = (parts: string[]) => parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;

function pieceList(spec: PuzzleSpec, squares: string[]): string {
  const groups = new Map<string, number>();
  for (const s of squares) { const n = nameOf(startType(spec, s)); groups.set(n, (groups.get(n) ?? 0) + 1); }
  return joinAnd([...groups].map(([name, n]) => n === 1 ? `the ${name}` : n === 2 ? `both ${name}` : `all ${n} ${name}`));
}

function phrase(spec: PuzzleSpec, goal: Goal): string {
  switch (goal.kind) {
    case 'reach':
      // Standing on the enemy home is only the start of occupying it (the win is holding it until your next turn).
      if (spec.homes && goal.flags.length === 1 && isEnemyHome(spec, goal.flags[0])) {
        return goal.piece ? `Start occupying the enemy home with the ${nameOf(startType(spec, goal.piece))}` : 'Start occupying the enemy home';
      }
      if (goal.piece) return `Get the ${nameOf(startType(spec, goal.piece))} to the flag`;
      return goal.flags.length === 1 ? 'Reach the flag' : goal.flags.length === 2 ? 'Reach both flags' : `Reach all ${goal.flags.length} flags`;
    case 'mine': return `Mine ${goal.atLeast} crystal${goal.atLeast === 1 ? '' : 's'}`;
    case 'capture': return `Capture ${pieceList(spec, goal.targets)}`;
    case 'eliminate': return 'Capture every enemy piece';
    case 'home': return 'Occupy the enemy home until your next turn';
    case 'summon': {
      const n = goal.count ?? 1;
      const what = goal.type ? nameOf(goal.type) : n === 1 ? 'piece' : 'pieces';
      const where = goal.at ? goal.at.length === 1 ? ' on the flag' : ' on the flags' : '';
      // Committing a summon only starts it; it succeeds when the piece lands at your next turn start.
      if (goal.arrive) return n === 1 ? `Successfully summon a ${what}${where}` : `Successfully summon ${n} ${what}${where}`;
      return n === 1 ? `Start summoning a ${what}${where}` : `Start summoning ${n} ${what}${where}`;
    }
    case 'promote': return goal.piece ? `Promote the ${nameOf(startType(spec, goal.piece))} to ${nameOf(goal.to)}` : `Promote to ${nameOf(goal.to)}`;
    case 'bank': return `Keep ${goal.atLeast} crystal${goal.atLeast === 1 ? '' : 's'} in the bank`;
    case 'keep': return `Keep ${pieceList(spec, goal.pieces)}`;
    case 'survive': return goal.pieces ? `Keep ${pieceList(spec, goal.pieces)} safe` : 'Keep all your pieces safe';
    case 'hold': return 'Don’t let them win';
    case 'deny': {
      const targets = deniedSummons(spec, goal);
      if (targets.length === 1) return `Stop the enemy ${nameOf(targets[0].definitionId)} from landing`;
      return targets.length === 2 ? 'Stop both enemy summons from landing' : `Stop all ${targets.length} enemy summons from landing`;
    }
    case 'all': return joinAnd(goal.goals.map(g => phrase(spec, g)).map((p, i) => i ? p[0].toLowerCase() + p.slice(1) : p));
  }
}

/** The one line a player reads: verb, count, object, horizon. */
export function goalText(spec: PuzzleSpec): string {
  if (spec.text) return spec.text;
  const turns = turnsOf(spec);
  const goals = leaves(spec.goal);
  // Goals settled at or after your hand-over carry no "this turn".
  const later = goals.filter(g => needsReply(g) || g.kind === 'deny');
  const now = goals.filter(g => !later.includes(g));
  const horizon = turns === 1 ? 'this turn' : `in ${turns} turns`;
  const parts: string[] = [];
  if (now.length) {
    const said = phrase(spec, now.length === 1 ? now[0] : { kind: 'all', goals: now });
    // "…until your next turn" already sets the time, so a home goal takes no "this turn",
    // and a longer horizon leads: "Within 2 turns, occupy the enemy home until your next turn".
    if (now.some(g => g.kind === 'home')) parts.push(turns === 1 ? said : `Within ${turns} turns, ${said[0].toLowerCase()}${said.slice(1)}`);
    else parts.push(`${said} ${horizon}`);
  }
  if (later.length) parts.push(phrase(spec, later.length === 1 ? later[0] : { kind: 'all', goals: later }));
  const text = joinAnd(parts.map((p, i) => i && !p.startsWith('Within') ? p[0].toLowerCase() + p.slice(1) : p));
  return text;
}

/** What the board marks for the goal: flags, prey, pieces to protect, the enemy home. */
export interface GoalMarks { flags: Position[]; targets: string[]; protect: string[]; enemyHome: Position | null; deny: Position[] }
export function goalMarks(ctx: PuzzleContext): GoalMarks {
  const marks: GoalMarks = { flags: [], targets: [], protect: [], enemyHome: null, deny: [] };
  for (const goal of leaves(ctx.spec.goal)) {
    if (goal.kind === 'reach') marks.flags.push(...goal.flags.map(squareOf));
    if (goal.kind === 'summon' && goal.at) marks.flags.push(...goal.at.map(squareOf));
    if (goal.kind === 'capture') marks.targets.push(...goal.targets.map(s => pieceIdAt(ctx.spec, s)));
    if (goal.kind === 'keep') marks.protect.push(...goal.pieces.map(s => pieceIdAt(ctx.spec, s)));
    if (goal.kind === 'survive' && goal.pieces) marks.protect.push(...goal.pieces.map(s => pieceIdAt(ctx.spec, s)));
    if (goal.kind === 'home') marks.enemyHome = getStartCorner(ctx.enemy, ctx.start.board.cells.length);
    if (goal.kind === 'deny') marks.deny.push(...deniedSummons(ctx.spec, goal).map(p => p.position));
  }
  return marks;
}

/** Live progress for a counting goal, e.g. crystals mined so far toward "Mine 12". */
export function mineProgress(ctx: PuzzleContext, state: GameState): { have: number; need: number } | null {
  const goal = leaves(ctx.spec.goal).find(g => g.kind === 'mine') as Extract<Goal, { kind: 'mine' }> | undefined;
  if (!goal) return null;
  return { have: state.players[ctx.hero].resourcesGained - ctx.start.players[ctx.hero].resourcesGained, need: goal.atLeast };
}
