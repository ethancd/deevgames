/**
 * Macro-turn perft for the PHASING rule set (DESIGN §7.2, §4; M2).
 *
 * `enumerateTurn`/`endKeysCanonical` are the canonical half: they enumerate
 * whole macro-turns using ONLY the canonical rules engine (`src/ai/moves.ts
 * generateAllActions`, `src/ai/simulate.ts applyAction`). `perftReplica`/
 * `endKeysReplica` re-derive the same numbers through the packed replica
 * (`core/state.ts`), never touching `applyAction`. Matching the canonical
 * numbers fixture for fixture is the replica-parity differential.
 *
 * ## What a "macro turn" is under Phasing
 *
 * A sequence is a path of actions from `state` to the moment the acting side's
 * turn actually ends: the side to move changes, the turn number changes, or the
 * game leaves `phase: 'playing'`. Under Phasing the shape is
 *
 *     Act (≤ 4 actions) → END_ACTION_PHASE → [PAY_UPKEEP] → Prepare → END_PLACE_PHASE
 *
 * `END_ACTION_PHASE` collects mining income and settles upkeep WITHOUT handing
 * off (turn.ts `endTurn`), so it is an ordinary intermediate action; the turn
 * ends at `END_PLACE_PHASE` (turn.ts `startActionPhase` → `handOffTurn`), which
 * is also where the NEW mover's pending summons resolve. The end position of a
 * sequence therefore already contains the opponent's arrivals and refunds,
 * which is exactly what we want to compare.
 *
 * ## Per-phase caps (re-derived for the Phasing shape)
 *
 * The Act phase is bounded by the rules: canonical `generateAllActions` emits
 * only cost-1 MOVEs and ATTACKs, so at most `actionsPerTurn` = 4 of them fit.
 * The Prepare phase is NOT bounded by the rules — a rich bank can buy and
 * promote many times — so it needs an explicit cap. `PerftLimits` therefore
 * carries two numbers instead of one DFS depth:
 *
 *   `act`     — Act-phase actions explored (4 is exact for a full turn).
 *   `prepare` — Prepare-phase commitments (BUY/PROMOTE) explored.
 *
 * The three phase enders (`END_ACTION_PHASE`, `PAY_UPKEEP`, `END_PLACE_PHASE`)
 * occur at most once each and are not charged against either cap, so the total
 * DFS depth of one macro turn is `act + prepare + 3` = `DEFAULT_MAX_ACTIONS`
 * at the default limits. A terminal action is always explored even at a cap
 * (as before), so a sequence that legitimately finishes at exactly the cap is
 * still counted; `END_PLACE_PHASE` is legal throughout Prepare, so every node
 * within the caps yields a completed sequence and nothing is silently
 * abandoned in the Prepare phase. Passing a plain `number` still works and
 * means `{ act: n, prepare: n }`.
 *
 * ## Prepare is enumerated as a SET, not as permutations
 *
 * Under Phasing a BUY debits the bank and records a pending summon; it does NOT
 * put a unit on the board. Therefore, within one Prepare phase:
 *
 *   - no Prepare action changes occupancy, so no Prepare action changes any
 *     other's spawn-square validity (this is the crucial difference from
 *     Standard, where a bought unit immediately became a spawn anchor and BUYs
 *     genuinely did not commute);
 *   - a promotion changes only a unit's `definitionId`, and spawn rectangles
 *     depend on unit POSITIONS only, so promotions do not change BUY legality
 *     either;
 *   - each Prepare action can be applied at most once per branch (a second BUY
 *     on the same square hits the one-commitment-per-square rule, a second
 *     PROMOTE of the same unit hits `promotedThisPlacement`);
 *   - the only coupling left is the shared bank, and a total cost is
 *     order-independent.
 *
 * So a set of Prepare actions is jointly legal iff it is legal in ANY order,
 * and enumerating permutations would multiply the count by |set|! for nothing.
 * Both enumerators therefore canonicalise a Prepare phase by admitting a
 * Prepare action only when its RANK is strictly greater than the rank of the
 * previous Prepare action on the branch. Rank is square-keyed and total:
 * `PROMOTE` of the unit on square s ranks s (0..99), `BUY def on square s`
 * ranks `100 + s * defCount + def`. Each jointly legal set is thus enumerated
 * exactly once, in ascending rank order, by both engines. The reported
 * `sequences` number consequently counts (ordered Act prefix) × (unordered
 * Prepare set), and is NOT comparable to the pre-M2 Standard numbers.
 *
 * Caveat, stated because it is real: with an enemy unit already on a home
 * corner, `resolveHomeCheckmate` runs after every applied action in the Place
 * phase, and the invader's own promotions/purchases can flip that verdict. A
 * branch can therefore terminate part-way through Prepare. Both engines apply
 * the same rank order and (per design item F) adjudicate at the same points, so
 * the comparison stays valid; the count simply is not "all sets of size ≤ cap"
 * for such a position.
 *
 * ## Dedup keys
 *
 * Two states are the "same" for dedup purposes when every unit occupies the
 * same square with the same owner/definition/damage AND both sides hold the
 * same pending summons (square-keyed, DESIGN F10 §3.3 — never keyed by the
 * volatile unit id a BUY/PROMOTE assigns). `boardKey` carries the sorted
 * pending list, so `midStateKey`/`endStateKey` inherit it.
 *
 * `perftReplica` keeps two deliberate restrictions so it mirrors the canonical
 * enumerator rather than measuring something else:
 *
 *   1. MOVEs are restricted to cost 1. `genActions` emits every legal MOVE
 *      including multi-action ones (DESIGN §4.4) while `generateAllActions`
 *      emits only single-action ones (`getValidMoves` caps at `speed`); the END
 *      POSITIONS are identical either way, the SEQUENCE count is not. The
 *      fuzzer's legality surface exercises the multi-action half.
 *   2. Dedup keys reproduce the canonical `midStateKey`/`endStateKey`
 *      partitions — square-keyed board digest plus pendings, phase, actions,
 *      both banks, `upkeepPending`, side to move — rather than `Kpos`, which is
 *      a strictly finer partition (it also carries reserves, the clock and the
 *      rules block).
 *
 * See `docs/hard-ai/design/DEVIATIONS.md` under M1 for the `src/ai/moves.ts`
 * layering note this file relies on.
 */
import type { GameState, PlayerId } from '../../../game/types';
import type { AIAction } from '../../types';
import { getUnitById } from '../../../game/board';
import { isPhasing } from '../../../game/rules';
import { generateAllActions } from '../../moves';
import { applyAction } from '../../simulate';
import { MAX_SLOTS, NO_SLOT, Result, type PackedState } from '../types';
import { AKind, newKeepSetTable, paA, paB, paC, paKind, type KeepSetTable } from '../core/action';
import { DEF_ID, DEF_INDEX } from '../core/catalog';
import { Replica, allocState, newUndo, type Undo } from '../core/state';

/** Act-phase actions in a full turn: `rules.ts DEFAULT_ACTIONS_PER_TURN`. */
export const ACT_CAP = 4;
/** Prepare commitments explored by default. Two is enough to reach every
 * "buy + promote", "buy + buy" and "promote + promote" interaction while
 * keeping a rich Prepare position inside the DFS-call budget. */
export const DEFAULT_PREPARE_CAP = 2;

export interface PerftLimits {
  /** Act-phase actions (MOVE/ATTACK) explored. */
  act: number;
  /** Prepare-phase commitments (BUY_UNIT/PROMOTE_UNIT) explored. */
  prepare: number;
}

export const DEFAULT_LIMITS: Readonly<PerftLimits> = Object.freeze({ act: ACT_CAP, prepare: DEFAULT_PREPARE_CAP });

/** Total DFS depth one macro turn can reach: Act + END_ACTION + PAY_UPKEEP + Prepare + END_PLACE. */
export function maxDepthOf(limits: PerftLimits): number {
  return limits.act + limits.prepare + 3;
}

/** The parameterless functions' budget: `act + prepare + 3` = 9 by default. */
export const DEFAULT_MAX_ACTIONS = maxDepthOf(DEFAULT_LIMITS);

/** Guards against an unbounded call (e.g. a heavy Prepare position handed to
 * the parameterless functions) hanging the process instead of failing fast. */
const MAX_DFS_CALLS = 5_000_000;

function limitsOf(limits: PerftLimits | number): PerftLimits {
  return typeof limits === 'number' ? { act: limits, prepare: limits } : limits;
}

function squareOf(x: number, y: number): number {
  return y * 10 + x;
}

// --- the pending-summon plane (design item B) --------------------------------
// `pendDef`/`pendCost` are square-keyed at `[side * 100 + square]`, `pendDef` 0
// meaning "no commitment" and otherwise `definition index + 1`.

/** One pending as `side.square(2).definitionId.cost`, so the canonical and
 * replica encodings are byte-identical and sort identically. */
function pendEntry(side: number, square: number, definitionId: string, cost: number): string {
  return `${side}.${String(square).padStart(2, '0')}.${definitionId}.${cost}`;
}

/** Sorted pending list of a canonical `GameState`. */
export function pendKeyCanonical(state: GameState): string {
  const list = (state.pendingSummons ?? []).map(s =>
    pendEntry(s.owner === 'white' ? 0 : 1, squareOf(s.position.x, s.position.y), s.definitionId, s.cost),
  );
  list.sort();
  return list.join(',');
}

/** Sorted pending list of a `PackedState`; identical strings to the canonical side. */
export function pendKeyReplica(p: PackedState): string {
  const list: string[] = [];
  for (let side = 0; side < 2; side++) {
    for (let s = 0; s < 100; s++) {
      const def = p.pendDef[side * 100 + s];
      if (def === 0) continue;
      list.push(pendEntry(side, s, DEF_ID[def - 1], p.pendCost[side * 100 + s]));
    }
  }
  list.sort();
  return list.join(',');
}

// --- canonical enumeration ---------------------------------------------------

/** Square-keyed board digest plus the sorted pending list: dedupes states that
 * differ only by which concrete unit id occupies a square (BUY/PROMOTE order),
 * per DESIGN F10, while keeping commitments (which change future boards)
 * distinguishing. */
function boardKey(state: GameState): string {
  const parts: string[] = new Array(state.board.units.length);
  for (let i = 0; i < state.board.units.length; i++) {
    const u = state.board.units[i];
    parts[i] = `${squareOf(u.position.x, u.position.y)}:${u.owner}:${u.definitionId}:${u.damageTaken}`;
  }
  parts.sort();
  return `${parts.join('|')}#P#${pendKeyCanonical(state)}`;
}

function midStateKey(state: GameState): string {
  return [
    boardKey(state),
    state.turn.phase,
    state.turn.actionsRemaining,
    state.players.white.resources,
    state.players.black.resources,
    state.upkeepPending ? 1 : 0,
  ].join('#');
}

function endStateKey(state: GameState): string {
  return [
    boardKey(state),
    state.players.white.resources,
    state.players.black.resources,
    state.turn.currentPlayer,
    state.upkeepPending ? 1 : 0,
  ].join('#');
}

/** Not a Prepare commitment. */
const NO_RANK = -1;

/** Total, square-keyed order on Prepare commitments; see the module comment. */
function prepareRank(state: GameState, action: AIAction): number {
  if (action.type === 'PROMOTE_UNIT') {
    const unit = getUnitById(state.board, action.unitId);
    return unit ? squareOf(unit.position.x, unit.position.y) : NO_RANK;
  }
  if (action.type === 'BUY_UNIT') {
    const def = DEF_INDEX.get(action.definitionId);
    if (def === undefined) return NO_RANK;
    return 100 + squareOf(action.position.x, action.position.y) * DEF_ID.length + def;
  }
  return NO_RANK;
}

function replicaPrepareRank(p: PackedState, a: number): number {
  const kind = paKind(a);
  if (kind === AKind.PROMOTE) return p.sq[paA(a)];
  if (kind === AKind.BUY) return 100 + paB(a) * DEF_ID.length + paA(a);
  return NO_RANK;
}

export interface PerftResult {
  /** Distinct legal action sequences within the limits that complete a full macro-turn. */
  sequences: number;
  /** Distinct states visited during the DFS (square-keyed, including intermediate nodes). */
  midStates: number;
  /** Distinct post-turn positions the completed sequences reach (square-keyed). */
  endPositions: number;
  /** Total DFS calls made; exposed for the `hard:perft` budget report. */
  calls: number;
}

/** Shared enumeration used by `perftActions`/`perftTurns`/`perftMidStates` and
 * by `lab/hard-ai/perft/run.ts` (which needs all three numbers per fixture from
 * one DFS pass rather than three redundant ones). */
export function enumerateTurn(root: GameState, limits: PerftLimits | number = DEFAULT_LIMITS): PerftResult {
  const { act, prepare } = limitsOf(limits);
  // Standard keeps permuted Prepare orders: a bought unit lands on the board
  // immediately and can anchor the next purchase, so BUYs do not commute there.
  const unordered = isPhasing(root);
  let sequences = 0;
  let calls = 0;
  const mid = new Set<string>();
  const end = new Set<string>();
  const rootPlayer: PlayerId = root.turn.currentPlayer;
  const rootTurnNumber = root.turn.turnNumber;

  function visit(state: GameState, actLeft: number, prepareLeft: number, lastRank: number): void {
    calls++;
    if (calls > MAX_DFS_CALLS) {
      throw new Error(
        `perft: exceeded ${MAX_DFS_CALLS} DFS calls at act=${act}, prepare=${prepare}; ` +
          'lower the limits for this position or check for a branching regression',
      );
    }
    mid.add(midStateKey(state));
    for (const action of generateAllActions(state, state.turn.currentPlayer)) {
      const rank = unordered ? prepareRank(state, action) : NO_RANK;
      if (rank !== NO_RANK && rank <= lastRank) continue;
      const isAct = action.type === 'MOVE' || action.type === 'ATTACK';
      const isPrepare = action.type === 'BUY_UNIT' || action.type === 'PROMOTE_UNIT';
      const next = applyAction(state, action);
      // Defensive: a generated action the transition rejects would otherwise
      // recurse on an identical state forever.
      if (next === state) continue;
      const done =
        next.phase !== 'playing' ||
        next.turn.currentPlayer !== rootPlayer ||
        next.turn.turnNumber !== rootTurnNumber;
      if (done) {
        sequences++;
        end.add(endStateKey(next));
        continue;
      }
      if (isAct) {
        if (actLeft <= 0) continue;
        visit(next, actLeft - 1, prepareLeft, lastRank);
      } else if (isPrepare) {
        if (prepareLeft <= 0) continue;
        visit(next, actLeft, prepareLeft - 1, rank);
      } else {
        // A phase ender that did not end the turn (END_ACTION_PHASE,
        // PAY_UPKEEP): at most one of each per macro turn, so it charges
        // neither cap and cannot recurse forever.
        visit(next, actLeft, prepareLeft, lastRank);
      }
    }
  }
  visit(root, act, prepare, NO_RANK);
  return { sequences, midStates: mid.size, endPositions: end.size, calls };
}

/** Number of distinct legal action sequences within `limits` from `state` that
 * complete a whole macro-turn (DESIGN §7.2, ET §8.1). */
export function perftActions(state: GameState, limits: PerftLimits | number = DEFAULT_LIMITS): number {
  return enumerateTurn(state, limits).sequences;
}

/** Number of distinct end-of-turn positions reachable from `state` within one
 * macro turn. */
export function perftTurns(state: GameState, limits: PerftLimits | number = DEFAULT_LIMITS): number {
  return enumerateTurn(state, limits).endPositions;
}

/** Number of distinct mid-turn states visited enumerating one macro turn. */
export function perftMidStates(state: GameState, limits: PerftLimits | number = DEFAULT_LIMITS): number {
  return enumerateTurn(state, limits).midStates;
}

// --- replica half ------------------------------------------------------------

/** Generous upper bound on one node's action list (4 attacks + 100 moves per slot + 1). */
const GEN_CAPACITY = 4 + MAX_SLOTS * 104;

function replicaBoardKey(p: PackedState): string {
  const parts: string[] = [];
  for (let s = 0; s < 100; s++) {
    const slot = p.pieceAt[s];
    if (slot === NO_SLOT) continue;
    parts.push(`${s}:${p.owner[slot]}:${p.defId[slot]}:${p.damage[slot]}`);
  }
  return `${parts.join('|')}#P#${pendKeyReplica(p)}`;
}

function replicaMidKey(p: PackedState): string {
  return [replicaBoardKey(p), p.phase, p.actions, p.bank[0], p.bank[1], p.upkeepPending].join('#');
}

function replicaEndKey(p: PackedState): string {
  return [replicaBoardKey(p), p.bank[0], p.bank[1], p.side, p.upkeepPending].join('#');
}

/** `Kpos` as a stable hex string — the set-equality surface. */
export function kposHex(p: PackedState): string {
  return `${(p.kposHi >>> 0).toString(16).padStart(8, '0')}${(p.kposLo >>> 0).toString(16).padStart(8, '0')}`;
}

export function perftReplica(root: GameState, limits: PerftLimits | number = DEFAULT_LIMITS): PerftResult {
  const { act, prepare } = limitsOf(limits);
  const replica = new Replica();
  const p = replica.pack(root, allocState());
  const rootSide = p.side;
  const rootTurnNumber = p.turnNumber;
  const undo: Undo = newUndo();
  const buffers: Int32Array[] = [];
  const keeps: KeepSetTable[] = [];
  const mid = new Set<string>();
  const end = new Set<string>();
  let sequences = 0;
  let calls = 0;

  // `depth` is the recursion level, not a budget: it only ever increases, so a
  // child never shares the parent's generation buffer (a phase ender recurses
  // without charging either cap, so the caps cannot serve as buffer indices).
  function visit(depth: number, actLeft: number, prepareLeft: number, lastRank: number): void {
    calls++;
    if (calls > MAX_DFS_CALLS) {
      throw new Error(
        `perftReplica: exceeded ${MAX_DFS_CALLS} DFS calls at act=${act}, prepare=${prepare}; ` +
          'lower the limits for this position or check for a branching regression',
      );
    }
    mid.add(replicaMidKey(p));
    while (buffers.length <= depth) buffers.push(new Int32Array(GEN_CAPACITY));
    while (keeps.length <= depth) keeps.push(newKeepSetTable());
    const out = buffers[depth];
    const keep = keeps[depth];
    let n: number;
    if (p.upkeepPending === 1) {
      n = replica.genKeepSets(p, keep);
      for (let i = 0; i < n; i++) out[i] = (AKind.PAY_UPKEEP & 0x7) | ((i & 0x7f) << 3);
    } else if (p.phase === 0) {
      n = replica.genPlace(p, out);
    } else {
      n = replica.genActions(p, out);
    }
    for (let i = 0; i < n; i++) {
      const a = out[i];
      const kind = paKind(a);
      if (kind === AKind.MOVE && paC(a) !== 1) continue;
      const rank = replicaPrepareRank(p, a);
      if (rank !== NO_RANK && rank <= lastRank) continue;
      const isAct = kind === AKind.MOVE || kind === AKind.ATTACK;
      const isPrepare = kind === AKind.BUY || kind === AKind.PROMOTE;
      if (!isAct && !isPrepare) {
        // Phase enders can end the turn, so they are always applied.
      } else if (isAct ? actLeft <= 0 : prepareLeft <= 0) {
        // Would exceed this phase's cap; the terminal check below cannot fire
        // for an Act or Prepare action (neither hands off), so skip it whole.
        continue;
      }
      replica.make(p, a, undo, keep);
      const done = p.result !== Result.ONGOING || p.side !== rootSide || p.turnNumber !== rootTurnNumber;
      if (done) {
        sequences++;
        end.add(replicaEndKey(p));
      } else if (isAct) {
        visit(depth + 1, actLeft - 1, prepareLeft, lastRank);
      } else if (isPrepare) {
        visit(depth + 1, actLeft, prepareLeft - 1, rank);
      } else {
        visit(depth + 1, actLeft, prepareLeft, lastRank);
      }
      replica.unmake(p, undo);
    }
  }

  visit(0, act, prepare, NO_RANK);
  return { sequences, midStates: mid.size, endPositions: end.size, calls };
}

/**
 * The end-position `Kpos` set of one macro turn, enumerated by the CANONICAL
 * engine and packed afterwards; compared against `endKeysReplica` by F1's
 * SET-equality gate (DESIGN §7.2).
 */
export function endKeysCanonical(root: GameState, limits: PerftLimits | number = DEFAULT_LIMITS): Set<string> {
  const { act, prepare } = limitsOf(limits);
  const unordered = isPhasing(root);
  const replica = new Replica();
  const scratch = allocState();
  const keys = new Set<string>();
  const rootPlayer: PlayerId = root.turn.currentPlayer;
  const rootTurnNumber = root.turn.turnNumber;
  let calls = 0;

  function visit(state: GameState, actLeft: number, prepareLeft: number, lastRank: number): void {
    calls++;
    if (calls > MAX_DFS_CALLS) throw new Error(`endKeysCanonical: exceeded ${MAX_DFS_CALLS} DFS calls`);
    for (const action of generateAllActions(state, state.turn.currentPlayer)) {
      const rank = unordered ? prepareRank(state, action) : NO_RANK;
      if (rank !== NO_RANK && rank <= lastRank) continue;
      const isAct = action.type === 'MOVE' || action.type === 'ATTACK';
      const isPrepare = action.type === 'BUY_UNIT' || action.type === 'PROMOTE_UNIT';
      const next = applyAction(state, action);
      if (next === state) continue;
      const done =
        next.phase !== 'playing' || next.turn.currentPlayer !== rootPlayer || next.turn.turnNumber !== rootTurnNumber;
      if (done) {
        keys.add(kposHex(replica.pack(next, scratch)));
        continue;
      }
      if (isAct) {
        if (actLeft <= 0) continue;
        visit(next, actLeft - 1, prepareLeft, lastRank);
      } else if (isPrepare) {
        if (prepareLeft <= 0) continue;
        visit(next, actLeft, prepareLeft - 1, rank);
      } else {
        visit(next, actLeft, prepareLeft, lastRank);
      }
    }
  }
  visit(root, act, prepare, NO_RANK);
  return keys;
}

/** The replica's end-position `Kpos` set for the same turn — the other side of
 * the SET-equality gate. */
export function endKeysReplica(root: GameState, limits: PerftLimits | number = DEFAULT_LIMITS): Set<string> {
  const { act, prepare } = limitsOf(limits);
  const replica = new Replica();
  const p = replica.pack(root, allocState());
  const rootSide = p.side;
  const rootTurnNumber = p.turnNumber;
  const undo: Undo = newUndo();
  const buffers: Int32Array[] = [];
  const keeps: KeepSetTable[] = [];
  const keys = new Set<string>();

  function visit(depth: number, actLeft: number, prepareLeft: number, lastRank: number): void {
    while (buffers.length <= depth) buffers.push(new Int32Array(GEN_CAPACITY));
    while (keeps.length <= depth) keeps.push(newKeepSetTable());
    const out = buffers[depth];
    const keep = keeps[depth];
    let n: number;
    if (p.upkeepPending === 1) {
      n = replica.genKeepSets(p, keep);
      for (let i = 0; i < n; i++) out[i] = (AKind.PAY_UPKEEP & 0x7) | ((i & 0x7f) << 3);
    } else if (p.phase === 0) {
      n = replica.genPlace(p, out);
    } else {
      n = replica.genActions(p, out);
    }
    for (let i = 0; i < n; i++) {
      const a = out[i];
      const kind = paKind(a);
      const rank = replicaPrepareRank(p, a);
      if (rank !== NO_RANK && rank <= lastRank) continue;
      const isAct = kind === AKind.MOVE || kind === AKind.ATTACK;
      const isPrepare = kind === AKind.BUY || kind === AKind.PROMOTE;
      if ((isAct && actLeft <= 0) || (isPrepare && prepareLeft <= 0)) continue;
      replica.make(p, a, undo, keep);
      const done = p.result !== Result.ONGOING || p.side !== rootSide || p.turnNumber !== rootTurnNumber;
      if (done) keys.add(kposHex(p));
      else if (isAct) visit(depth + 1, actLeft - 1, prepareLeft, lastRank);
      else if (isPrepare) visit(depth + 1, actLeft, prepareLeft - 1, rank);
      else visit(depth + 1, actLeft, prepareLeft, lastRank);
      replica.unmake(p, undo);
    }
  }
  visit(0, act, prepare, NO_RANK);
  return keys;
}
