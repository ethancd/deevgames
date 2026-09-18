/**
 * Canonical witnesses for exam cases (EPIC-PLAN §4 E1.2: "every exact case has
 * a canonical witness").
 *
 * Every check in this file is decided by the CANONICAL engine — `src/game`
 * through `generateAllActions`, `isLegalAction` and `src/ai/simulate`'s
 * `applyAction` — and never by the engine under test. That is the whole point:
 * a key set written down by a suite builder states something that may or may not
 * be true of the position it was authored from, and an exam case is only allowed
 * to call itself `exact` when the rules themselves confirm the claim.
 *
 * Two methods, with different strength:
 *
 *   `canonical-enumeration` — every legal turn from the root is enumerated and
 *   its end position keyed by `Kpos`, the same definition `verify/perft.ts` and
 *   `suites/run.ts` use (the game ended, or the side to move / turn number
 *   changed; mid-turn states transpose heavily so each distinct `Kturn` is
 *   visited once). Each claimed key must be present AND satisfy the claim. When
 *   the enumeration finishes inside its call budget the witness is COMPLETE —
 *   the key set is then the whole set of turns satisfying the claim, and an
 *   engine landing outside it has demonstrably not done the thing. When the
 *   budget runs out the witness is still sound for the keys it confirmed, but
 *   `complete: false` records that a turn outside the list might satisfy the
 *   claim too.
 *
 *   `canonical-replay` — one explicit line, replayed through the canonical
 *   rules. Cheap, and it proves existence: the line is legal, it ends the turn,
 *   and the position it leaves satisfies the claim. It proves nothing about
 *   turns that are not on the line.
 *
 * WHAT A CLAIM IS NOT. `claim: 'kill'` says an enemy unit died, not that killing
 * was best; `claim: 'home-clear'` says the corner ended empty, not that clearing
 * it was the only defence. The claims are facts about end positions. Whether the
 * fact is what a strong player would want is exactly the question `kind:
 * 'judgment'` exists to keep separate, and EPIC-PLAN E3 warns against turning
 * "every strategic preference into a universal invariant".
 */
import type { GameState, PlayerId } from '../../../src/game/types';
import { isLegalAction } from '../../../src/game/legality';
import { generateAllActions } from '../../../src/ai/moves';
import { applyAction } from '../../../src/ai/simulate';
import { Replica, allocState } from '../../../src/ai/hard/core/state';
import { kposHex } from '../../../src/ai/hard/verify/perft';
import { resolveOpeningAction, type OpeningAction } from '../ladder/openings';
import type { ExactClaim, ExactWitness, ExamCase } from './format';

/**
 * Canonical calls one enumeration may spend. `suites/run.ts` allows 3,000,000
 * for its dead-position proof; the exam seeder is run interactively on a shared
 * box, so the default here is an order of magnitude smaller and an exhausted
 * budget produces `complete: false` rather than a failure.
 */
export const DEFAULT_ENUM_BUDGET = 300_000;

class CallBudget {
  private left: number;
  spent = 0;
  constructor(budget: number) {
    this.left = budget;
  }
  take(): boolean {
    if (this.left <= 0) return false;
    this.left--;
    this.spent++;
    return true;
  }
}

export interface TurnEnds {
  /** `Kpos` hex -> the end position itself. */
  ends: Map<string, GameState>;
  /** The enumeration finished; `ends` is every end position of the root turn. */
  complete: boolean;
  calls: number;
}

const REPLICA = new Replica();
const SCRATCH = allocState();

/**
 * Every end position of one macro turn from `root`, keyed by `Kpos`. A copy of
 * `suites/run.ts turnEndPositions` (which this file deliberately does not
 * import: that module is a CLI with top-level engine state, and the exam tools
 * must not drag a suite runner in). Returns `complete: false` when the call
 * budget ran out, with whatever it found so far.
 */
export function enumerateTurnEnds(root: GameState, budget = DEFAULT_ENUM_BUDGET): TurnEnds {
  const meter = new CallBudget(budget);
  const out = new Map<string, GameState>();
  const seen = new Set<string>();
  const rootPlayer = root.turn.currentPlayer;
  const rootTurnNumber = root.turn.turnNumber;
  let overflow = false;

  const visit = (state: GameState): void => {
    if (overflow) return;
    if (!meter.take()) {
      overflow = true;
      return;
    }
    const p = REPLICA.pack(state, SCRATCH);
    const turnKey = `${(p.kturnHi >>> 0).toString(16)}:${(p.kturnLo >>> 0).toString(16)}`;
    if (seen.has(turnKey)) return;
    seen.add(turnKey);
    for (const action of generateAllActions(state, state.turn.currentPlayer)) {
      if (overflow) return;
      const next = applyAction(state, action);
      if (next === state) continue;
      const done = next.phase !== 'playing' || next.turn.currentPlayer !== rootPlayer || next.turn.turnNumber !== rootTurnNumber;
      if (!done) {
        visit(next);
        continue;
      }
      const key = kposHex(REPLICA.pack(next, SCRATCH));
      if (!out.has(key)) out.set(key, next);
    }
  };

  visit(root);
  return { ends: out, complete: !overflow, calls: meter.spent };
}

function enemyCount(state: GameState, mover: PlayerId): number {
  let n = 0;
  for (const u of state.board.units) if (u.owner !== mover) n++;
  return n;
}

function homeOccupied(state: GameState, mover: PlayerId): boolean {
  const corner = state.players[mover].startCorner;
  return state.board.units.some(u => u.owner !== mover && u.position.x === corner.x && u.position.y === corner.y);
}

/** Does `end` satisfy `claim` for the side that just moved? */
export function claimHolds(claim: ExactClaim, root: GameState, end: GameState, mover: PlayerId): boolean {
  switch (claim) {
    case 'win':
      return end.phase === 'victory' && end.winner === mover;
    case 'kill':
      return enemyCount(end, mover) < enemyCount(root, mover);
    case 'home-clear':
      return !homeOccupied(end, mover);
  }
}

export interface ReplayedLine {
  ok: boolean;
  endKey: string | null;
  end: GameState | null;
  reason: string | null;
}

/**
 * Replays one square-based line from `root` through the canonical rules. The
 * line must be legal action by action, must not be refused by the simulator,
 * and must reach a turn boundary (or end the game); anything else is a refusal
 * with a reason, never a repaired line.
 *
 * Must be called with the case's rules globals installed (`withExamRules`).
 */
export function replayLine(root: GameState, line: readonly OpeningAction[], where: string): ReplayedLine {
  let state = root;
  const rootPlayer = root.turn.currentPlayer;
  const rootTurnNumber = root.turn.turnNumber;
  for (let i = 0; i < line.length; i++) {
    if (state.phase !== 'playing') return { ok: false, endKey: null, end: null, reason: `${where}: action ${i} follows the end of the game` };
    let action;
    try {
      action = resolveOpeningAction(state, line[i], `${where} action ${i}`);
    } catch (err) {
      return { ok: false, endKey: null, end: null, reason: err instanceof Error ? err.message : String(err) };
    }
    if (!isLegalAction(state, action, state.turn.currentPlayer)) {
      return { ok: false, endKey: null, end: null, reason: `${where}: action ${i} (${line[i].type}) is illegal for ${state.turn.currentPlayer}` };
    }
    const next = applyAction(state, action);
    if (next === state) return { ok: false, endKey: null, end: null, reason: `${where}: action ${i} (${line[i].type}) was refused by the simulator` };
    state = next;
  }
  const done = state.phase !== 'playing' || state.turn.currentPlayer !== rootPlayer || state.turn.turnNumber !== rootTurnNumber;
  if (!done) return { ok: false, endKey: null, end: null, reason: `${where}: the line does not end the turn` };
  return { ok: true, endKey: kposHex(REPLICA.pack(state, SCRATCH)), end: state, reason: null };
}

export interface WitnessCheck {
  ok: boolean;
  /** Keys the canonical rules confirmed satisfy the claim. */
  confirmed: string[];
  /** Claimed keys the canonical rules did NOT confirm, with why. */
  rejected: { key: string; reason: string }[];
  /** Enumeration finished, so `confirmed` is closed under the claim. */
  complete: boolean;
  calls: number;
}

/**
 * Re-verifies an exact witness against the canonical rules. This is what "do
 * not copy a case you cannot re-verify" is implemented as: the seeder runs it
 * over every candidate and carries only the cases it returns `ok` for.
 *
 * Must be called with the case's rules globals installed (`withExamRules`).
 */
export function verifyExactWitness(
  witness: ExactWitness,
  root: GameState,
  mover: PlayerId,
  where: string,
  budget = DEFAULT_ENUM_BUDGET,
): WitnessCheck {
  if (witness.method === 'canonical-replay') {
    const line = witness.line ?? [];
    const replayed = replayLine(root, line, where);
    if (!replayed.ok || replayed.end === null || replayed.endKey === null) {
      return { ok: false, confirmed: [], rejected: [{ key: witness.endKeys[0] ?? '?', reason: replayed.reason ?? 'the line did not replay' }], complete: false, calls: 0 };
    }
    if (!witness.endKeys.includes(replayed.endKey)) {
      return { ok: false, confirmed: [], rejected: [{ key: replayed.endKey, reason: `the line reaches ${replayed.endKey}, which the witness does not list` }], complete: false, calls: 0 };
    }
    if (!claimHolds(witness.claim, root, replayed.end, mover)) {
      return { ok: false, confirmed: [], rejected: [{ key: replayed.endKey, reason: `the line's end position does not satisfy claim "${witness.claim}"` }], complete: false, calls: 0 };
    }
    return { ok: true, confirmed: [replayed.endKey], rejected: [], complete: false, calls: 0 };
  }

  const { ends, complete, calls } = enumerateTurnEnds(root, budget);
  const confirmed: string[] = [];
  const rejected: { key: string; reason: string }[] = [];
  for (const key of witness.endKeys) {
    const end = ends.get(key);
    if (end === undefined) {
      rejected.push({ key, reason: complete ? 'no legal turn from this position ends there' : 'not reached before the enumeration budget ran out' });
      continue;
    }
    if (!claimHolds(witness.claim, root, end, mover)) {
      rejected.push({ key, reason: `the end position does not satisfy claim "${witness.claim}"` });
      continue;
    }
    confirmed.push(key);
  }
  return { ok: rejected.length === 0 && confirmed.length > 0, confirmed, rejected, complete, calls };
}

/**
 * DEAD POSITION (`suites/run.ts`'s second canonical adjudication): every end
 * position of the mover's turn hands the opponent a win on the spot, so no turn
 * is better than any other and a case authored here would be scoring noise.
 * `build-home-mate.ts` already applies this rule to its rescue framing ("there
 * is no correct defensive turn in a lost position"); the exam seeder applies it
 * before calling anything exact.
 *
 * Returns `null` when the budget ran out — the caller must then treat the
 * position as UNKNOWN, never as alive.
 */
export function deadPosition(root: GameState, budget = DEFAULT_ENUM_BUDGET): boolean | null {
  const mover = root.turn.currentPlayer;
  const first = enumerateTurnEnds(root, budget);
  if (!first.complete) return null;
  if (first.ends.size === 0) return false;
  let left = budget;
  for (const end of first.ends.values()) {
    if (end.phase === 'victory') {
      // Already decided: a win for the mover is not a dead position at all, and
      // a loss is one of the losses this proof is counting.
      if (end.winner === mover) return false;
      continue;
    }
    const reply = enumerateTurnEnds(end, left);
    left -= reply.calls;
    if (!reply.complete || left <= 0) return null;
    let answered = false;
    for (const r of reply.ends.values()) {
      if (r.phase === 'victory' && r.winner === end.turn.currentPlayer) {
        answered = true;
        break;
      }
    }
    if (!answered) return false;
  }
  return true;
}

/** Every end position of the root that satisfies `claim`, by `Kpos`. Used by the
 * seeder to author a COMPLETE witness rather than re-verify an existing one. */
export function keysSatisfying(root: GameState, claim: ExactClaim, mover: PlayerId, budget = DEFAULT_ENUM_BUDGET): WitnessCheck {
  const { ends, complete, calls } = enumerateTurnEnds(root, budget);
  const confirmed: string[] = [];
  for (const [key, end] of ends) if (claimHolds(claim, root, end, mover)) confirmed.push(key);
  confirmed.sort();
  return { ok: confirmed.length > 0, confirmed, rejected: [], complete, calls };
}

/** Convenience for callers holding a whole case. */
export function verifyCaseWitness(c: ExamCase, state: GameState, budget = DEFAULT_ENUM_BUDGET): WitnessCheck {
  if (c.witness.label !== 'exact') throw new Error(`${c.id}: verifyCaseWitness is for exact cases; this one is a judgment`);
  return verifyExactWitness(c.witness, state, c.sideToMove, c.id, budget);
}
