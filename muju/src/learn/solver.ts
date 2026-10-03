import type { AIAction } from '../ai/types';
import { applyAction } from '../ai/simulate';
import { generateAllActions } from '../ai/moves';
import type { GameState, PlayerId } from '../game/types';
import { evaluate, heroTurnsDone, type PuzzleContext } from './goals';
import type { Goal } from './types';

/**
 * Exhaustive puzzle search. "Can you still win?" is ∃ (your turn) ∀ (their
 * reply) ∃ (your next turn) …, cut off as soon as `evaluate` decides. Turns are
 * walked action by action with a transposition table, so different orders that
 * reach the same position are searched once. Prepare is searched only when it
 * can matter (see `prepareMatters`). Every search is bounded by a node budget
 * and reports `unknown` rather than guessing.
 */

export class Budget extends Error { constructor() { super('Search budget exhausted'); } }

export function stateKey(s: GameState): string {
  const units = s.board.units.map(u => `${u.id}@${u.position.x},${u.position.y}:${u.definitionId}:${u.damageTaken}:${+u.canActThisTurn}${+!!u.lastAttackKilled}${+!!u.promotedThisPlacement}${+!!u.placedThisTurn}:${[...(u.attackedThisTurn ?? [])].sort().join('.')}`).sort().join('|');
  // Summons are keyed by what and where, not by id: the same purchases in another order are one position.
  const pending = (s.pendingSummons ?? []).map(p => `${p.owner}@${p.position.x},${p.position.y}:${p.definitionId}`).sort().join('|');
  let reserves = '';
  for (const row of s.board.cells) for (const c of row) reserves += c.resourceLayers.toString(36) + ',';
  const { white, black } = s.players;
  return `${s.phase}:${s.winner}:${s.turn.currentPlayer}:${s.turn.phase}:${s.turn.actionsRemaining}:${s.turn.turnNumber}:${+!!s.upkeepPending}`
    + `#${white.resources},${white.resourcesGained},${black.resources},${black.resourcesGained}#${units}#${pending}#${reserves}`;
}

const leaves = (goal: Goal): Goal[] => goal.kind === 'all' ? goal.goals.flatMap(leaves) : [goal];

export interface SearchOptions { nodeLimit?: number }

export class PuzzleSearch {
  nodes = 0;
  private readonly memo = new Map<string, boolean>();
  private readonly replies = new Map<string, { end: GameState; line: AIAction[] }[]>();
  private readonly finalBuys: boolean;
  private readonly finalPromotes: boolean;
  readonly limit: number;

  constructor(readonly ctx: PuzzleContext, options: SearchOptions = {}) {
    this.limit = options.nodeLimit ?? 2_000_000;
    const kinds = new Set(leaves(ctx.spec.goal).map(g => g.kind));
    // On your last turn, purchases only matter if the goal is a summon; promotions
    // also matter for a home mate and for anything judged after the enemy replies.
    this.finalBuys = kinds.has('summon');
    this.finalPromotes = kinds.has('summon') || kinds.has('promote') || kinds.has('home') || kinds.has('survive') || kinds.has('hold');
  }

  private tick() { if (++this.nodes > this.limit) throw new Budget(); }

  /** Which Prepare verbs can change the outcome from `state` (your turn). */
  private prepareMatters(state: GameState): { buys: boolean; promotes: boolean } {
    const last = heroTurnsDone(this.ctx, state) + 1 >= this.ctx.turns;
    return last ? { buys: this.finalBuys, promotes: this.finalPromotes } : { buys: true, promotes: true };
  }

  /**
   * Your legal actions, minus Prepare verbs that cannot matter. A puzzle with
   * its homes hidden has no shop on screen (summoning is taught later), so its
   * hints and proofs never summon either.
   */
  heroActions(state: GameState): AIAction[] {
    const all = generateAllActions(state, this.ctx.hero);
    if (state.turn.phase !== 'place' || state.upkeepPending) return orderActions(all);
    const { buys, promotes } = this.prepareMatters(state);
    const shop = buys && !!this.ctx.spec.homes;
    return all.filter(a => (a.type !== 'BUY_UNIT' || shop) && (a.type !== 'PROMOTE_UNIT' || promotes));
  }

  private enemyActions(state: GameState): AIAction[] {
    const all = generateAllActions(state, this.ctx.enemy);
    if (state.turn.phase !== 'place' || state.upkeepPending) return orderActions(all);
    // Enemy purchases land after your next turn has started, so they only matter
    // in longer puzzles that opt in.
    return all.filter(a => a.type !== 'BUY_UNIT' || !!this.ctx.spec.opponentBuys);
  }

  /** ∃∀∃…: can the side `ctx.hero` still reach the goal from `state`? */
  wins(state: GameState): boolean {
    const status = evaluate(this.ctx, state);
    if (status !== 'pending') return status === 'solved';
    if (state.phase !== 'playing') return false;
    const key = stateKey(state);
    const known = this.memo.get(key);
    if (known !== undefined) return known;
    this.tick();
    let result: boolean;
    if (state.turn.currentPlayer === this.ctx.hero) {
      result = this.heroActions(state).some(action => {
        const next = applyAction(state, action);
        return next !== state && this.wins(next);
      });
    } else {
      result = this.replyEnds(state).every(({ end }) => this.wins(end));
    }
    this.memo.set(key, result);
    return result;
  }

  /** The shortest winning line for the rest of your current turn, or null. */
  line(state: GameState): AIAction[] | null {
    if (state.turn.currentPlayer !== this.ctx.hero || state.phase !== 'playing') return null;
    if (evaluate(this.ctx, state) === 'solved') return [];
    if (!this.wins(state)) return null;
    // Breadth-first over this turn's positions, so "Show me" plays the fewest steps.
    const seen = new Set([stateKey(state)]);
    let frontier: { s: GameState; line: AIAction[] }[] = [{ s: state, line: [] }];
    while (frontier.length) {
      const next: typeof frontier = [];
      for (const { s, line } of frontier) {
        for (const action of this.heroActions(s)) {
          const n = applyAction(s, action);
          if (n === s) continue;
          const k = stateKey(n);
          if (seen.has(k)) continue;
          seen.add(k);
          this.tick();
          const status = evaluate(this.ctx, n);
          if (status === 'solved') return [...line, action];
          if (status === 'failed') continue;
          const turnOver = n.phase !== 'playing' || n.turn.currentPlayer !== this.ctx.hero;
          if (turnOver) { if (this.wins(n)) return [...line, action]; continue; }
          if (this.wins(n)) next.push({ s: n, line: [...line, action] });
        }
      }
      frontier = next;
    }
    return null;
  }

  /**
   * Every distinct way the enemy's turn can end from `state` (enemy to move),
   * with one line that reaches each. An end is the first position where it is
   * your turn again, or the game is over.
   */
  replyEnds(state: GameState): { end: GameState; line: AIAction[] }[] {
    const key = stateKey(state);
    const cached = this.replies.get(key);
    if (cached) return cached;
    // Breadth-first, so every ending is reached by its shortest line: the reply
    // the player watches never wanders in and out.
    const ends = new Map<string, { end: GameState; line: AIAction[] }>();
    const seen = new Set<string>([key]);
    let frontier: { s: GameState; line: AIAction[] }[] = [{ s: state, line: [] }];
    while (frontier.length) {
      const next: typeof frontier = [];
      for (const { s, line } of frontier) {
        this.tick();
        for (const action of this.enemyActions(s)) {
          const n = applyAction(s, action);
          if (n === s) continue;
          const k = stateKey(n);
          if (n.phase !== 'playing' || n.turn.currentPlayer !== this.ctx.enemy) {
            if (!ends.has(k)) ends.set(k, { end: n, line: [...line, action] });
            continue;
          }
          if (seen.has(k)) continue;
          seen.add(k);
          next.push({ s: n, line: [...line, action] });
        }
      }
      frontier = next;
    }
    const result = [...ends.values()].sort((a, b) => replyScore(this.ctx.hero, state, b.end) - replyScore(this.ctx.hero, state, a.end));
    this.replies.set(key, result);
    return result;
  }
}

/** Attacks first, then moves, then ending the phase: refutations and kills surface early. */
function orderActions(actions: AIAction[]): AIAction[] {
  const rank: Record<AIAction['type'], number> = { ATTACK: 0, MOVE: 1, PAY_UPKEEP: 2, PROMOTE_UNIT: 3, BUY_UNIT: 4, END_ACTION_PHASE: 5, END_PLACE_PHASE: 6, RESIGN: 9 };
  return [...actions].sort((a, b) => rank[a.type] - rank[b.type]);
}

/** How menacing an enemy reply looks: wins, then kills, then damage, then closing in. */
function replyScore(hero: PlayerId, before: GameState, after: GameState): number {
  if (after.phase === 'victory' && after.winner !== hero) return 1e6;
  const mine = (s: GameState) => s.board.units.filter(u => u.owner === hero);
  const lost = mine(before).length - mine(after).length;
  const damage = mine(after).reduce((sum, u) => sum + u.damageTaken, 0);
  const enemies = after.board.units.filter(u => u.owner !== hero);
  const targets = mine(after);
  const closeness = targets.length ? -enemies.reduce((sum, e) => sum + Math.min(...targets.map(t => Math.abs(t.position.x - e.position.x) + Math.abs(t.position.y - e.position.y))), 0) : 0;
  return lost * 1000 + damage * 50 + closeness;
}

export type Verdict = 'yes' | 'no' | 'unknown';

/** Can the puzzle still be solved from `state`? */
export function canStillWin(ctx: PuzzleContext, state: GameState, options?: SearchOptions): Verdict {
  try { return new PuzzleSearch(ctx, options).wins(state) ? 'yes' : 'no'; }
  catch (e) { if (e instanceof Budget) return 'unknown'; throw e; }
}

/** A winning line for the current turn ("Show me"), or null if none or out of budget. */
export function solutionLine(ctx: PuzzleContext, state: GameState, options?: SearchOptions): AIAction[] | null {
  try { const line = new PuzzleSearch(ctx, options).line(state); return line && compressLine(state, line); }
  catch (e) { if (e instanceof Budget) return null; throw e; }
}

/**
 * The enemy's reply from the start of its turn: a line after which the puzzle can
 * no longer be solved if one exists (the refutation is the lesson), otherwise the
 * most menacing reply. Bounded; falls back to the most menacing reply.
 */
export function chooseReply(ctx: PuzzleContext, state: GameState, options?: SearchOptions): { line: AIAction[]; refutes: boolean } {
  const search = new PuzzleSearch(ctx, options);
  let ends: { end: GameState; line: AIAction[] }[];
  try { ends = search.replyEnds(state); } catch (e) { if (e instanceof Budget) return { line: fallbackReply(state), refutes: false }; throw e; }
  if (!ends.length) return { line: fallbackReply(state), refutes: false };
  for (const candidate of ends) {
    try {
      if (!search.wins(candidate.end)) return { line: compressLine(state, candidate.line), refutes: true };
    } catch (e) { if (e instanceof Budget) break; throw e; }
  }
  return { line: compressLine(state, ends[0].line), refutes: false };
}

/** End the turn as quickly as the rules allow: Mine & prepare, keep everything affordable, End turn. */
function fallbackReply(state: GameState): AIAction[] {
  const line: AIAction[] = [];
  let s = state;
  for (let i = 0; i < 6 && s.phase === 'playing' && s.turn.currentPlayer === state.turn.currentPlayer; i++) {
    const action: AIAction | undefined = s.turn.phase === 'action' ? { type: 'END_ACTION_PHASE' }
      : s.upkeepPending ? generateAllActions(s, s.turn.currentPlayer).find(a => a.type === 'PAY_UPKEEP')
      : { type: 'END_PLACE_PHASE' };
    if (!action) break;
    const next = applyAction(s, action);
    if (next === s) break;
    line.push(action);
    s = next;
  }
  return line;
}

/** Merge consecutive one-action hops of the same piece into one declared trip when it costs the same. */
export function compressLine(state: GameState, line: readonly AIAction[]): AIAction[] {
  const out: AIAction[] = [];
  const befores: GameState[] = [];
  let s = state;
  for (const action of line) {
    const prev = out.at(-1);
    if (prev?.type === 'MOVE' && action.type === 'MOVE' && prev.unitId === action.unitId) {
      const base = befores[befores.length - 1];
      const merged = applyAction(base, { type: 'MOVE', unitId: action.unitId, to: action.to });
      const stepped = applyAction(s, action);
      if (merged !== base && stepped !== s && merged.turn.actionsRemaining === stepped.turn.actionsRemaining) {
        out[out.length - 1] = { type: 'MOVE', unitId: action.unitId, to: action.to };
        s = merged;
        continue;
      }
    }
    const next = applyAction(s, action);
    if (next === s) return [...line];
    befores.push(s);
    out.push(action);
    s = next;
  }
  return out;
}
