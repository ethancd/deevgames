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
import type { GameState, PlayerId, Position, Unit } from '../../../src/game/types';
import { isLegalAction, phaseEndAction } from '../../../src/game/legality';
import { getAdjacentPositions, getUnitAt, getUnitById } from '../../../src/game/board';
import { calculateAttackPower } from '../../../src/game/combat';
import { findAttackApproach } from '../../../src/game/movement';
import { getPurchasePositions } from '../../../src/game/summoning';
import { generateAllActions } from '../../../src/ai/moves';
import { applyAction } from '../../../src/ai/simulate';
import type { AIAction } from '../../../src/ai/types';
import { Replica, allocState } from '../../../src/ai/hard/core/state';
import { kposHex } from '../../../src/ai/hard/verify/perft';
import { resolveOpeningAction, type OpeningAction } from '../ladder/openings';
import type { ExactClaim, ExactWitness, ExamCase, PlanWitness } from './format';

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

// ---------------------------------------------------------------------------
// Plan witnesses (STRATEGOS W1.13)
// ---------------------------------------------------------------------------
//
// A plan witness is a PREDICATE over one turn (`format.ts PLAN_RULES`). The
// turn — the engine's `RootResult.actions`, or an authored square-based line —
// is replayed from the case position through `isLegalAction`/`applyAction`
// exactly as `replayLine` does, and the facts the predicates read are collected
// on the way: every ATTACK with the power the canonical combat code gives it
// and whether it removed its defender, every accepted PROMOTE_UNIT, and the
// end position the hand-off leaves. Nothing here reads the engine under test.
// A turn that does not replay (an illegal or refused action, or a line that
// stops before the hand-off) satisfies no predicate and says why.
//
// Must be called with the case's rules globals installed (`withExamRules` or
// `installExamRules`): attack power reads the combat handicap, mining and
// upkeep read the upkeep variant.

/**
 * The most phase-end actions a PASSIVE turn can take before the hand-off.
 * DERIVED (`src/game/legality.ts phaseEndAction`, `src/game/turn.ts`): a
 * Phasing turn made only of phase ends is END_ACTION_PHASE, at most one
 * PAY_UPKEEP (the default keep-set, when upkeep is pending), END_PLACE_PHASE.
 * More than that means the rules changed under this checker, which throws.
 */
export const PASSIVE_REPLY_MAX_ACTIONS = 3;

/** One ATTACK the replayed turn made, as the canonical rules resolved it. */
export interface PlanAttack {
  attacker: string;
  from: string;
  defender: string;
  at: string;
  /** `calculateAttackPower` at the moment of the attack. */
  power: number;
  killed: boolean;
  /** The defender is the witness's `target` unit (false when there is no target). */
  onTarget: boolean;
}

/** What the replayed turn did, read off the canonical states. */
export interface PlanFacts {
  attacks: PlanAttack[];
  /** `fire_1->fire_2@D1` per accepted promotion. */
  promotions: string[];
  /** ATTACKs that removed their defender. */
  kills: number;
  /** `inactivityPlies` of the end position; null when the turn did not replay. */
  clockAfter: number | null;
  /** `getPurchasePositions(end, side).length`; null when the turn did not replay. */
  spawnSquaresAfter: number | null;
  /** How contact was established (contact-in-n), or null. */
  contact: string | null;
}

export interface PlanCheck {
  /** The turn replayed legally to the hand-off (or to the end of the game). */
  replayed: boolean;
  /** The predicate holds. Always false when `replayed` is false. */
  holds: boolean;
  /** The canonical rules ended the game inside the turn with the side as winner. */
  wonOutright: boolean;
  endKey: string | null;
  end: GameState | null;
  /** One sentence: the facts the verdict rests on. */
  evidence: string;
  /** The turn in square notation, for a reader of the artifact. */
  line: string;
  facts: PlanFacts;
}

/** A turn to judge: engine actions (ids of THIS process's root) or a square-based line. */
export type PlanTurn = { actions: readonly AIAction[] } | { line: readonly OpeningAction[] };

/** `A1`-style square: file = x, rank = y + 1 (`analyze/from-room.ts parseSquare`). */
export function squareName(p: Position): string {
  return `${String.fromCharCode(65 + p.x)}${p.y + 1}`;
}

function describeAction(state: GameState, a: AIAction): string {
  const u = 'unitId' in a ? getUnitById(state.board, a.unitId) : null;
  const at = u === null ? '?' : squareName(u.position);
  switch (a.type) {
    case 'MOVE': return `MV ${at}-${squareName(a.to)}`;
    case 'ATTACK': return `ATK ${at}x${squareName(a.targetPosition)}`;
    case 'PROMOTE_UNIT': return `PROMO ${at}`;
    case 'BUY_UNIT': return `BUY ${a.definitionId}@${squareName(a.position)}`;
    case 'PAY_UPKEEP': return `UPKEEP keep ${a.keepUnitIds.length}`;
    case 'END_ACTION_PHASE': return 'EA';
    case 'END_PLACE_PHASE': return 'EP';
    case 'RESIGN': return 'RESIGN';
  }
}

function turnOver(state: GameState, side: PlayerId, turnNumber: number): boolean {
  return state.phase !== 'playing' || state.turn.currentPlayer !== side || state.turn.turnNumber !== turnNumber;
}

/** A standing threat at `state`: a unit of `side` orthogonally adjacent to an enemy it could damage. */
function adjacencyContact(state: GameState, side: PlayerId): string | null {
  for (const u of state.board.units) {
    if (u.owner !== side) continue;
    for (const p of getAdjacentPositions(u.position)) {
      const v = getUnitAt(state.board, p);
      if (v === null || v.owner === side) continue;
      const power = calculateAttackPower(u, v);
      if (power > 0) return `${u.definitionId}@${squareName(u.position)} stands adjacent to ${v.definitionId}@${squareName(v.position)} (power ${power})`;
    }
  }
  return null;
}

/**
 * After the opponent's PASSIVE reply (phase ends only), is there a replayable
 * single-unit damaging strike in `side`'s next turn? Returns the line in words,
 * or null. `witnessed` grade only: see `PLAN_RULES['contact-in-n']`.
 */
export function strikeAfterPassiveReply(end: GameState, side: PlayerId): string | null {
  let s = end;
  let taken = 0;
  while (s.phase === 'playing' && s.turn.currentPlayer !== side) {
    if (++taken > PASSIVE_REPLY_MAX_ACTIONS) throw new Error(`passive reply: ${taken} phase ends without handing back to ${side}; the turn structure changed`);
    const a = phaseEndAction(s);
    if (!isLegalAction(s, a, s.turn.currentPlayer)) throw new Error(`passive reply: the rules' own phase end ${a.type} is illegal`);
    const next = applyAction(s, a);
    if (next === s) throw new Error(`passive reply: the simulator refused the rules' own phase end ${a.type}`);
    s = next;
  }
  if (s.phase !== 'playing') return null;
  const own = s.board.units.filter(u => u.owner === side);
  const enemies = s.board.units.filter(u => u.owner !== side);
  for (const u of own) {
    for (const v of enemies) {
      const power = calculateAttackPower(u, v);
      if (power <= 0) continue;
      const path = findAttackApproach(u, v, s.board, s.turn.actionsRemaining);
      if (path === null) continue;
      let t = s;
      if (path.length > 0) {
        const move: AIAction = { type: 'MOVE', unitId: u.id, to: path[path.length - 1] };
        if (!isLegalAction(t, move, side)) continue;
        const moved = applyAction(t, move);
        if (moved === t) continue;
        t = moved;
      }
      const strike: AIAction = { type: 'ATTACK', unitId: u.id, targetPosition: v.position };
      if (!isLegalAction(t, strike, side)) continue;
      if (applyAction(t, strike) === t) continue;
      const via = path.length > 0 ? ` via ${squareName(path[path.length - 1])}` : '';
      return `after a passive reply ${u.definitionId}@${squareName(u.position)}${via} strikes ${v.definitionId}@${squareName(v.position)} (power ${power}) next turn`;
    }
  }
  return null;
}

function formatAttack(a: PlanAttack): string {
  return `${a.attacker}@${a.from} x ${a.defender}@${a.at} power ${a.power}${a.killed ? ', kill' : ''}`;
}

/**
 * Replays `turn` from `root` and decides `witness`'s predicate for the side to
 * move. Throws only on a MALFORMED witness (a `target` square with no enemy
 * unit on it, or a side that is not to move); a turn that does not replay is a
 * failed check with a reason.
 */
export function evaluatePlan(witness: PlanWitness, root: GameState, turn: PlanTurn, where: string): PlanCheck {
  const side = witness.side;
  if (root.turn.currentPlayer !== side) throw new Error(`${where}: the plan judges ${side}, but ${root.turn.currentPlayer} is to move`);
  let targetId: string | null = null;
  if (witness.target !== undefined) {
    const t = getUnitAt(root.board, witness.target);
    if (t === null || t.owner === side) throw new Error(`${where}: no enemy unit stands on the target square ${squareName(witness.target)}`);
    targetId = t.id;
  }
  const facts: PlanFacts = { attacks: [], promotions: [], kills: 0, clockAfter: null, spawnSquaresAfter: null, contact: null };
  const words: string[] = [];
  const failed = (reason: string): PlanCheck => ({
    replayed: false, holds: false, wonOutright: false, endKey: null, end: null, evidence: reason, line: words.join(' · '), facts,
  });

  const turnNumber = root.turn.turnNumber;
  const count = 'actions' in turn ? turn.actions.length : turn.line.length;
  let state = root;
  for (let i = 0; i < count; i++) {
    if (turnOver(state, side, turnNumber)) return failed(`${where}: action ${i} follows the end of the turn`);
    let action: AIAction;
    try {
      action = 'actions' in turn ? turn.actions[i] : resolveOpeningAction(state, turn.line[i], `${where} action ${i}`);
    } catch (err) {
      return failed(err instanceof Error ? err.message : String(err));
    }
    if (!isLegalAction(state, action, state.turn.currentPlayer)) return failed(`${where}: action ${i} (${action.type}) is illegal for ${state.turn.currentPlayer}`);
    words.push(describeAction(state, action));
    let attack: (PlanAttack & { defenderId: string }) | null = null;
    let promoted: Unit | null = null;
    if (action.type === 'ATTACK') {
      const attacker = getUnitById(state.board, action.unitId);
      const defender = getUnitAt(state.board, action.targetPosition);
      if (attacker === null || defender === null) return failed(`${where}: action ${i} names an empty square`);
      attack = {
        attacker: attacker.definitionId, from: squareName(attacker.position), defender: defender.definitionId, at: squareName(defender.position),
        power: calculateAttackPower(attacker, defender), killed: false, onTarget: defender.id === targetId, defenderId: defender.id,
      };
    } else if (action.type === 'PROMOTE_UNIT') {
      promoted = getUnitById(state.board, action.unitId);
    }
    const next = applyAction(state, action);
    if (next === state) return failed(`${where}: action ${i} (${action.type}) was refused by the simulator`);
    if (attack !== null) {
      const { defenderId, ...record } = attack;
      record.killed = getUnitById(next.board, defenderId) === null;
      if (record.killed) facts.kills++;
      facts.attacks.push(record);
      words[words.length - 1] += ` p${record.power}${record.killed ? ' kill' : ''}`;
    }
    if (promoted !== null) {
      const after = getUnitById(next.board, promoted.id);
      facts.promotions.push(`${promoted.definitionId}->${after?.definitionId ?? '?'}@${squareName(promoted.position)}`);
    }
    state = next;
  }
  if (!turnOver(state, side, turnNumber)) return failed(`${where}: the turn does not reach the hand-off`);

  const end = state;
  facts.clockAfter = end.inactivityPlies ?? 0;
  facts.spawnSquaresAfter = getPurchasePositions(end, side).length;
  const wonOutright = end.phase === 'victory' && end.winner === side;
  const endKey = kposHex(REPLICA.pack(end, SCRATCH));

  let holds: boolean;
  let evidence: string;
  switch (witness.predicate) {
    case 'damaging-attack': {
      const hits = facts.attacks.filter(a => a.power > 0 && (targetId === null || a.onTarget));
      holds = hits.length > 0;
      const scope = witness.target === undefined ? '' : ` on the target at ${squareName(witness.target)}`;
      evidence = holds
        ? `damaging attack${scope}: ${formatAttack(hits[0])}`
        : facts.attacks.length === 0
          ? `no attack in the turn`
          : `no damaging attack${scope}; attacks made: ${facts.attacks.map(formatAttack).join('; ')}`;
      break;
    }
    case 'no-clock-reset': {
      holds = facts.kills === 0;
      evidence = holds
        ? `no kill; the clock reads ${facts.clockAfter} after the hand-off${end.phase !== 'playing' ? ` and the game is over (${end.victoryReason}, winner ${String(end.winner)})` : ''}`
        : `the turn kills (${facts.attacks.filter(a => a.killed).map(formatAttack).join('; ')}), which resets the clock`;
      break;
    }
    case 'spawn-area-open': {
      holds = facts.spawnSquaresAfter > 0;
      evidence = `${facts.spawnSquaresAfter} legal spawn square(s) for ${side} after the turn`;
      break;
    }
    case 'promotion-made': {
      holds = facts.promotions.length > 0;
      evidence = holds ? `promoted ${facts.promotions.join(', ')}` : 'no promotion in the turn';
      break;
    }
    case 'contact-in-n': {
      // `n` is one of CONTACT_PLIES (1 or 3). Anything past 1 reaches beyond the
      // side's own ply: the opponent's passive reply, then the side's next turn.
      const plies = witness.n ?? 1;
      const lookAhead = plies > 1;
      const strike = facts.attacks.find(a => a.power > 0);
      facts.contact = strike !== undefined
        ? `strike this turn: ${formatAttack(strike)}`
        : adjacencyContact(end, side) ?? (lookAhead ? strikeAfterPassiveReply(end, side) : null);
      holds = facts.contact !== null;
      const horizon = `${plies} ${plies === 1 ? 'ply' : 'plies'}`;
      evidence = holds
        ? `contact within ${horizon}: ${facts.contact}`
        : `no contact within ${horizon}: no damaging strike this turn, no adjacency after it${lookAhead ? ', no single-unit strike line after a passive reply' : ''}`;
      break;
    }
  }
  return { replayed: true, holds, wonOutright, endKey, end, evidence, line: words.join(' · '), facts };
}
