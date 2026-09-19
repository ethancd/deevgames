/**
 * The differential fuzzer for the PHASING replica (DESIGN §7.3; M2).
 *
 * | surface | A (canonical) | B (replica) | compared |
 * |---|---|---|---|
 * | transition | `applyAction` (simulate.ts:26) | `Replica.make` | the packed-state digest INCLUDING the pending-summon plane, `Kpos`, `Kturn`, `occHash` and the incremental sums after EVERY action, plus the `unmake(make(a))` identity |
 * | legality | `generateAllActions` + the `getMovementRange` multi-action expansion | `genActions`/`genPlace`/`genKeepSets` | the legal-action set as a sorted multiset of canonical `AIAction`s, plus explicit pending-summon probes |
 * | arrival | `END_PLACE_PHASE` through `applyAction` (→ `startTurn`/`resolveSummons`) | `Replica.make(END_PLACE)` | arrivals, refunds, both banks, the cleared plane, the square-keyed board and the keys, on positions deliberately perturbed to disrupt commitments |
 *
 * The third DESIGN §7.3 surface, `prover`, is still STANDARD-only (it mirrors
 * `analyzeHomeDefense`, which M4 ports) and lives in `fuzz/prover-surface.ts`;
 * `fuzz/run.ts` skips it by default for M2 and says so loudly.
 *
 * ## Games are Phasing games
 *
 * Every game starts from `createInitialGameState(..., 'phasing')` and randomises
 * `victoryRule`, `inactivityRule`, `reviewUpkeep` per player and
 * `blackCrystalHandicap ∈ {0, 3}`; some games clear `canActThisTurn` on a random
 * unit mid-game (DESIGN F2). The harness invariants
 * (`lab/harness/invariants.ts`) run after every action, and every 64th node
 * re-derives `Kpos`/`Kturn`/`occHash` from scratch, runs `Replica.check` and
 * round-trips `pack(unpack(p))`.
 *
 * Actions are drawn from the REPLICA's generator and decoded to canonical
 * `AIAction`s, so every applied action exercises `genActions`/`genPlace`/
 * `genKeepSets` even on plies where the (much more expensive) full legality
 * comparison does not run. An action the canonical engine would reject is
 * therefore caught twice: by the explicit `isLegalAction` assertion below and by
 * the digest comparison, since `applyAction` returns its input unchanged on a
 * rejected action.
 *
 * ## A fuzzer that never buys proves nothing
 *
 * Under Phasing the interesting transition is the one that is not visible for
 * several plies: `BUY_UNIT` only records a commitment, and the unit (or the
 * refund) appears at the OWNER's next turn start. The walker is therefore biased
 * hard towards `BUY` (see `KIND_WEIGHT`) and the metrics report
 * `buys`, `arrivals`, `refunds` and the fraction of games containing at least one
 * arrival AND at least one refund. `fuzz/run.ts` fails a run that produced none
 * of them.
 *
 * ## KEEP-SET COMPLETENESS
 *
 * `upkeepActions` (upkeep.ts) enumerates every affordable subset of up to twelve
 * rent-bearing units, which can exceed the 64-entry `KeepSetTable` DESIGN
 * §3.2/§5.10 caps the replica at. The legality surface therefore requires (a)
 * soundness always — every keep-set the replica emits is accepted by
 * `isUpkeepSelectionLegal` — and (b) set equality only when the replica did not
 * truncate (`count < KEEP_SET_CAPACITY`), which is the only case in which
 * equality is defined. Truncated nodes are counted in
 * `legalityKeepSetTruncations`, and they are NOT waved through: a truncated node
 * must still emit pairwise DISTINCT sets (soundness alone would accept 64 copies
 * of one legal set), and when canonical offers no more than the cap, nothing was
 * dropped and equality is required after all.
 *
 * ## Unit ids across a hand-off
 *
 * `applyAction` names a pending's arriving unit after the COMMITMENT
 * (`resolveSummons` passes `s.id` to `createUnitFromDefinition`), and a
 * commitment made during the walk has no id inside the replica. After every
 * action the fuzzer copies the canonical id of every newly-appeared unit into
 * `p.originIds`, so the decoder keeps naming units exactly as the canonical
 * engine does and a later `MOVE` decodes to a unit the canonical engine knows.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { GameState, PendingSummon, PlayerId, Position, Unit } from '../../../src/game/types';
import type { AIAction } from '../../../src/ai/types';
import { createInitialGameState, getStartCorner, getUnitAt } from '../../../src/game/board';
import { getMovementRange } from '../../../src/game/movement';
import { UNIT_DEFINITIONS, getUnitDefinition } from '../../../src/game/units';
import { isLegalAction } from '../../../src/game/legality';
import { upkeepActions } from '../../../src/game/upkeep';
import { getAllSpawnPositions } from '../../../src/game/spawning';
import { generateAllActions } from '../../../src/ai/moves';
import { applyAction } from '../../../src/ai/simulate';
import { seededRandom } from '../../../src/ai/runtime';
import { F_CAN_ACT, F_PLACED, MAX_SLOTS, NO_SLOT, Result, type PackedState } from '../../../src/ai/hard/types';
import {
  AKind,
  KEEP_SET_CAPACITY,
  newKeepSetTable,
  paKind,
  paMake,
  toAIAction,
  type KeepSetTable,
  type PA,
} from '../../../src/ai/hard/core/action';
import { DEF_INDEX } from '../../../src/ai/hard/core/catalog';
import { Replica, allocState, newUndo } from '../../../src/ai/hard/core/state';
import { recomputeKpos, recomputeKturn, recomputeOccHash } from '../../../src/ai/hard/core/zobrist';
import { pendKeyReplica } from '../../../src/ai/hard/verify/perft';
import { checkInvariants } from '../../harness/invariants';
import { DEFAULT_RULES, type RulesBlock, type StoredPosition } from '../positions/corpus';

export type Surface = 'transition' | 'legality' | 'arrival';

export interface FuzzOptions {
  seed: number;
  /** Total actions to apply across all games. */
  actions: number;
  surfaces: ReadonlySet<Surface>;
  /** Run the (expensive) legality comparison once every N actions. */
  legalityEvery: number;
  /** Plies per game before the game is abandoned (DESIGN §7.3: 500). */
  plies: number;
  /** Directory for self-contained reproducers, or null to skip writing them. */
  reproDir: string | null;
  /** Macro-node positions to sample for `positions/fuzz-<n>.jsonl`. */
  sample: number;
  /**
   * Plies on which RESIGN is OFFERED to the action picker (see the injection in
   * `runFuzz`). Drawn from a stream of its own, so `0` replays a walk
   * bit-identically to one taken before RESIGN was injectable at all — which is
   * how the seeds of earlier converger rounds are re-run as true repros.
   */
  resignRate: number;
}

export interface FuzzMetrics {
  seed: number;
  ruleset: 'phasing';
  surfaces: Surface[];
  legalityEvery: number;
  resignRate: number;
  games: number;
  plies: number;
  actions: number;
  /**
   * EVERY transition divergence. Never filtered and never classified: round 4
   * ported `tactics/prover.ts` to Phasing, so the mate-verdict exemption this
   * counter used to be split by is gone and any non-zero value fails the run.
   */
  divergences: number;
  legalityChecks: number;
  /** `Replica.check(p)` calls made after an applied action (see `legalityEvery`). */
  stateChecks: number;
  legalitySetMismatches: number;
  legalityKeepSetTruncations: number;
  /** BUY on a square the mover already holds a commitment on, or a commitment
   * leaking into the occupancy bitboards (item B/D probes). */
  pendingLegalityChecks: number;
  pendingLegalityMismatches: number;
  unmakeMismatches: number;
  rehashMismatches: number;
  roundTripMismatches: number;
  invariantViolations: number;
  // --- Phasing commitment coverage: a run with zeroes here proves nothing ---
  buys: number;
  arrivals: number;
  refunds: number;
  gamesWithArrival: number;
  gamesWithRefund: number;
  gamesWithArrivalAndRefund: number;
  /** `gamesWithArrivalAndRefund / games`, rounded to 3 decimals. */
  arrivalRefundGameFraction: number;
  /** Plies observed with a commitment outstanding for BOTH sides at once. */
  bothSidesPendingPlies: number;
  canActClearedGames: number;
  reviewUpkeepGames: number;
  eliminationRuleGames: number;
  drawRuleOffGames: number;
  handicapGames: number;
  /**
   * TERMINAL HISTOGRAM, keyed `<victoryReason>:<winner|draw>@<action>` — the
   * action being the one that ended the game. The action suffix is what
   * separates the terminals canonical gives the same `victoryReason`: an
   * elimination at an ATTACK from one at the hand-off (`END_PLACE_PHASE`), and a
   * double elimination shows as `elimination:draw`. A coverage claim about a
   * terminal branch is checkable against this and nothing else.
   */
  terminals: Record<string, number>;
  sampled: number;
  elapsedMs: number;
}

export interface FuzzResult {
  metrics: FuzzMetrics;
  samples: StoredPosition[];
}

/** Per-action buffer: 4 attacks + 100 destinations per slot, plus the phase-ender. */
const GEN_CAPACITY = 4 + MAX_SLOTS * 104;

const TIER1_DEFS = UNIT_DEFINITIONS.filter(d => d.tier === 1);

interface Divergence {
  kind: 'transition' | 'unmake' | 'rehash' | 'legality' | 'pending' | 'invariant' | 'roundtrip';
  seed: number;
  game: number;
  ply: number;
  field: string;
  action: AIAction | null;
  prefix: AIAction[];
  rules: RulesBlock;
  replica?: string;
  canonical?: string;
  state: GameState;
}

function squareOf(p: Position): number {
  return p.y * 10 + p.x;
}

function positionOf(square: number): Position {
  return { x: square % 10, y: (square / 10) | 0 };
}

function normalize(a: AIAction): string {
  switch (a.type) {
    case 'MOVE':
      return `M:${a.unitId}:${a.to.y * 10 + a.to.x}`;
    case 'ATTACK':
      return `A:${a.unitId}:${a.targetPosition.y * 10 + a.targetPosition.x}`;
    case 'BUY_UNIT':
      return `B:${a.definitionId}:${a.position.y * 10 + a.position.x}`;
    case 'PROMOTE_UNIT':
      return `P:${a.unitId}`;
    case 'PAY_UPKEEP':
      return `U:${[...a.keepUnitIds].sort().join(',')}`;
    case 'END_PLACE_PHASE':
      return 'EP';
    case 'END_ACTION_PHASE':
      return 'EA';
    case 'RESIGN':
      return 'R';
    default:
      return `?:${JSON.stringify(a)}`;
  }
}

/**
 * The canonical legal-action set, with MOVEs expanded to every multi-action
 * destination `legality.ts` accepts (DESIGN §4.4).
 */
function canonicalLegalSet(state: GameState): string[] {
  const player: PlayerId = state.turn.currentPlayer;
  const out: string[] = [];
  for (const a of generateAllActions(state, player)) {
    if (a.type === 'MOVE') continue;
    out.push(normalize(a));
  }
  if (!state.upkeepPending && state.turn.phase === 'action' && state.turn.actionsRemaining > 0) {
    const budget = state.turn.actionsRemaining;
    for (const u of state.board.units) {
      if (u.owner !== player || !u.canActThisTurn) continue;
      const speed = getUnitDefinition(u.definitionId).speed;
      for (const r of getMovementRange(u.position, speed, budget, state.board)) {
        const cost = budget - r.actionsRemaining;
        if (cost < 1 || cost > budget) continue;
        out.push(`M:${u.id}:${r.position.y * 10 + r.position.x}`);
      }
    }
  }
  return out.sort();
}

/**
 * The fuzzer's transition digest: the replica's own digest plus the sorted
 * pending list and both banks. The pending list and banks are restated here so
 * the digest stays complete whatever `Replica.digest` currently carries — a
 * commitment and its cost are exactly the state a dropped field would hide.
 */
function fuzzDigest(replica: Replica, p: PackedState): string {
  const counts = `${p.pendCount[0]}.${p.pendCount[1]}.${p.pendCostSum[0]}.${p.pendCostSum[1]}`;
  return `${replica.digest(p)}||P:${pendKeyReplica(p)}||C:${counts}||B:${p.bank[0]}.${p.bank[1]}`;
}

/**
 * Compares two packed states field by field; returns the first difference or
 * null. NOTHING is skipped — round 4 removed the `ignoreResult` escape hatch
 * along with the mate-verdict exemption that was its only caller.
 */
function firstDifference(a: PackedState, b: PackedState): string | null {
  for (let s = 0; s < 100; s++) {
    const sa = a.pieceAt[s];
    const sb = b.pieceAt[s];
    const emptyA = sa === NO_SLOT;
    const emptyB = sb === NO_SLOT;
    if (emptyA !== emptyB) return `occupancy@${s}`;
    if (emptyA) continue;
    if (a.owner[sa] !== b.owner[sb]) return `owner@${s}`;
    if (a.defId[sa] !== b.defId[sb]) return `defId@${s}`;
    if (a.damage[sa] !== b.damage[sb]) return `damage@${s}`;
    if (a.atkCount[sa] !== b.atkCount[sb]) return `atkCount@${s}`;
    if ((a.uflags[sa] & 15) !== (b.uflags[sb] & 15)) return `uflags@${s}`;
  }
  for (let s = 0; s < 100; s++) if (a.reserve[s] !== b.reserve[s]) return `reserve@${s}`;
  // The pending-summon plane (design item B): square-keyed, so comparable
  // index by index with no slot-order caveat.
  for (let i = 0; i < 200; i++) {
    if (a.pendDef[i] !== b.pendDef[i]) return `pendDef@${i % 100}/side${(i / 100) | 0}`;
    if (a.pendCost[i] !== b.pendCost[i]) return `pendCost@${i % 100}/side${(i / 100) | 0}`;
  }
  if (a.pendBB.length !== b.pendBB.length) return 'pendBB-length';
  for (let w = 0; w < a.pendBB.length; w++) if (a.pendBB[w] !== b.pendBB[w]) return `pendBB@${w}`;
  // The OCCUPANCY LANES. `occ`, `occBy` and `occTier` are derived state that no
  // other surface here reaches: the loops above walk `pieceAt`, `digest` walks
  // `pieceAt`, and `occHash` is computed from `sq`. A `make`/`unmake` path that
  // set `pieceAt` but forgot a lane — or set the wrong tier lane — was invisible
  // until it surfaced as a wrong move generation ten layers up. `check` proves
  // `occ`/`occBy` self-consistent; only this comparison proves them EQUAL to
  // canonical's, and nothing but this proves `occTier` at all.
  for (let w = 0; w < a.occ.length; w++) if (a.occ[w] !== b.occ[w]) return `occ@${w}`;
  for (let w = 0; w < a.occBy.length; w++) if (a.occBy[w] !== b.occBy[w]) return `occBy@${w}/side${(w / 4) | 0}`;
  for (let w = 0; w < a.occTier.length; w++) if (a.occTier[w] !== b.occTier[w]) return `occTier@${w}/tier${((w / 4) | 0) + 1}`;
  for (let side = 0; side < 2; side++) {
    if (a.pendCount[side] !== b.pendCount[side]) return `pendCount${side}`;
    if (a.pendCostSum[side] !== b.pendCostSum[side]) return `pendCostSum${side}`;
  }
  const scalars: [string, number, number][] = [
    ['kposLo', a.kposLo, b.kposLo],
    ['kposHi', a.kposHi, b.kposHi],
    ['kturnLo', a.kturnLo, b.kturnLo],
    ['kturnHi', a.kturnHi, b.kturnHi],
    ['occHash', a.occHash, b.occHash],
    ['bank0', a.bank[0], b.bank[0]],
    ['bank1', a.bank[1], b.bank[1]],
    ['gained0', a.gained[0], b.gained[0]],
    ['gained1', a.gained[1], b.gained[1]],
    ['side', a.side, b.side],
    ['phase', a.phase, b.phase],
    ['actions', a.actions, b.actions],
    ['turnNumber', a.turnNumber, b.turnNumber],
    ['upkeepPending', a.upkeepPending, b.upkeepPending],
    ['clock', a.clock, b.clock],
    ['progress', a.progress, b.progress],
    ['handicap', a.handicap, b.handicap],
    ['victoryHome', a.victoryHome, b.victoryHome],
    ['drawRuleOn', a.drawRuleOn, b.drawRuleOn],
    ['reviewUpkeep0', a.reviewUpkeep[0], b.reviewUpkeep[0]],
    ['reviewUpkeep1', a.reviewUpkeep[1], b.reviewUpkeep[1]],
    ['result', a.result, b.result],
    ['reason', a.reason, b.reason],
    ['materialCc0', a.materialCc[0], b.materialCc[0]],
    ['materialCc1', a.materialCc[1], b.materialCc[1]],
    ['pstSumCc0', a.pstSumCc[0], b.pstSumCc[0]],
    ['pstSumCc1', a.pstSumCc[1], b.pstSumCc[1]],
  ];
  for (const [name, x, y] of scalars) {
    if (x !== y) return name;
  }
  return null;
}

/**
 * One bucket of the terminal histogram: the canonical victory reason, the
 * winner (or `draw`), and the ACTION that ended the game. Canonical gives the
 * same `victoryReason` to an elimination at an ATTACK and to one at the
 * hand-off, so without the action suffix the histogram cannot tell the two
 * branches apart, and a coverage claim about either is unverifiable.
 */
function terminalName(state: GameState, endedBy: AIAction | null): string {
  if (state.phase !== 'victory') return 'unfinished';
  const by = endedBy === null ? 'none' : endedBy.type;
  return `${state.victoryReason ?? 'unknown'}:${state.winner ?? 'draw'}@${by}`;
}

function pendingsOf(state: GameState, player: PlayerId): PendingSummon[] {
  return (state.pendingSummons ?? []).filter(s => s.owner === player);
}

/** Phasing initial state with a randomised rules block. */
function phasingInitial(rules: RulesBlock, reviewWhite: boolean, reviewBlack: boolean): GameState {
  return {
    ...createInitialGameState(undefined, 4, rules.handicap, 'phasing'),
    victoryRule: rules.victoryRule,
    inactivityRule: rules.inactivityRule,
    reviewUpkeep: { white: reviewWhite, black: reviewBlack },
  };
}

function randomRules(rng: () => number): { rules: RulesBlock; reviewWhite: boolean; reviewBlack: boolean } {
  return {
    rules: {
      ...DEFAULT_RULES,
      handicap: rng() < 0.5 ? 3 : 0,
      victoryRule: rng() < 0.35 ? 'elimination' : 'home-or-elimination',
      inactivityRule: rng() < 0.35 ? 'off' : 'on',
    },
    reviewWhite: rng() < 0.35,
    reviewBlack: rng() < 0.35,
  };
}

/** Copies the canonical id of every newly appeared unit into `originIds`, so the
 * decoder keeps naming units the way `applyAction` does across a hand-off. */
function adoptNewUnitIds(p: PackedState, before: GameState, after: GameState): void {
  if (after.board.units.length === 0) return;
  const known = new Set(before.board.units.map(u => u.id));
  for (const u of after.board.units) {
    if (known.has(u.id)) continue;
    const slot = p.pieceAt[squareOf(u.position)];
    if (slot !== NO_SLOT) p.originIds[slot] = u.id;
  }
}

export function runFuzz(options: FuzzOptions): FuzzResult {
  const started = Date.now();
  const replica = new Replica();
  const undo = newUndo();
  const keep = newKeepSetTable();
  const canonicalPacked = allocState();
  const roundTripPacked = allocState();
  // One slot past the generators' own capacity, for the injected RESIGN below.
  const genBuffer = new Int32Array(GEN_CAPACITY + 1);

  const metrics: FuzzMetrics = {
    seed: options.seed,
    ruleset: 'phasing',
    surfaces: [...options.surfaces].sort(),
    legalityEvery: options.legalityEvery,
    resignRate: options.resignRate,
    games: 0,
    plies: 0,
    actions: 0,
    divergences: 0,
    legalityChecks: 0,
    stateChecks: 0,
    legalitySetMismatches: 0,
    legalityKeepSetTruncations: 0,
    pendingLegalityChecks: 0,
    pendingLegalityMismatches: 0,
    unmakeMismatches: 0,
    rehashMismatches: 0,
    roundTripMismatches: 0,
    invariantViolations: 0,
    buys: 0,
    arrivals: 0,
    refunds: 0,
    gamesWithArrival: 0,
    gamesWithRefund: 0,
    gamesWithArrivalAndRefund: 0,
    arrivalRefundGameFraction: 0,
    bothSidesPendingPlies: 0,
    canActClearedGames: 0,
    reviewUpkeepGames: 0,
    eliminationRuleGames: 0,
    drawRuleOffGames: 0,
    handicapGames: 0,
    terminals: {},
    sampled: 0,
    elapsedMs: 0,
  };

  const divergences: Divergence[] = [];
  const buckets = new Map<number, StoredPosition[]>();

  const record = (d: Divergence): void => {
    if (divergences.length < 32) divergences.push(d);
    if (d.kind === 'transition') metrics.divergences++;
    else if (d.kind === 'unmake') metrics.unmakeMismatches++;
    else if (d.kind === 'rehash') metrics.rehashMismatches++;
    else if (d.kind === 'roundtrip') metrics.roundTripMismatches++;
    else if (d.kind === 'legality') metrics.legalitySetMismatches++;
    else if (d.kind === 'pending') metrics.pendingLegalityMismatches++;
    else metrics.invariantViolations++;
  };

  let game = 0;
  while (metrics.actions < options.actions) {
    const rng = seededRandom((options.seed + game * 7919) >>> 0);
    // A SEPARATE stream, so the injection below cannot shift `rng` and every seed
    // of an earlier round replays identically at `resignRate: 0`.
    const resignRng = seededRandom((options.seed + game * 7919 + 0x52534741) >>> 0);
    const { rules, reviewWhite, reviewBlack } = randomRules(rng);
    if (rules.handicap !== 0) metrics.handicapGames++;
    if (rules.victoryRule === 'elimination') metrics.eliminationRuleGames++;
    if (rules.inactivityRule === 'off') metrics.drawRuleOffGames++;
    if (reviewWhite || reviewBlack) metrics.reviewUpkeepGames++;

    let state: GameState = phasingInitial(rules, reviewWhite, reviewBlack);
    let p = replica.pack(state);

    const clearsCanAct = rng() < 0.3;
    const clearAtPly = clearsCanAct ? Math.floor(rng() * 40) : -1;
    let clearedThisGame = false;
    let arrivalsThisGame = 0;
    let refundsThisGame = 0;
    /** The last action applied, i.e. the one the terminal histogram credits. */
    let endedBy: AIAction | null = null;
    const prefix: AIAction[] = [];

    for (let ply = 0; ply < options.plies && metrics.actions < options.actions; ply++) {
      if (state.phase !== 'playing') break;

      if (ply === clearAtPly && state.board.units.length > 0) {
        const index = Math.floor(rng() * state.board.units.length);
        const units: Unit[] = state.board.units.map((u, i) => (i === index ? { ...u, canActThisTurn: false } : u));
        state = { ...state, board: { ...state.board, units } };
        p = replica.pack(state);
        clearedThisGame = true;
      }

      if (pendingsOf(state, 'white').length > 0 && pendingsOf(state, 'black').length > 0) metrics.bothSidesPendingPlies++;

      // Generate on the replica; decode to the canonical vocabulary.
      let count: number;
      if (p.upkeepPending === 1) {
        count = replica.genKeepSets(p, keep);
        for (let i = 0; i < count; i++) genBuffer[i] = paMake(AKind.PAY_UPKEEP, i);
      } else if (p.phase === 0) {
        count = replica.genPlace(p, genBuffer);
      } else {
        count = replica.genActions(p, genBuffer);
      }
      if (count === 0) break;

      if (options.surfaces.has('legality') && metrics.actions % options.legalityEvery === 0) {
        metrics.legalityChecks++;
        const report = (d: Omit<Divergence, 'seed' | 'game' | 'ply' | 'prefix' | 'rules' | 'state'>): void =>
          record({ ...d, seed: options.seed, game, ply, prefix: [...prefix], rules, state });
        checkLegalitySurface(p, state, keep, count, genBuffer, metrics, report);
        checkPendingSurface(replica, p, state, metrics, report);
      }

      // RESIGN is legal in EVERY phase, including a pending upkeep
      // (`legality.ts:20,24`), and `make`/`unmake` support it in one line each
      // (`makeResign`, and the `AKind.RESIGN` case of `unmake`, which restores
      // the `result`/`reason` every record header carries). No generator emits
      // it — it is never a candidate a search would consider — so the walker
      // injects it, rarely: it ENDS the game, and at a high rate it would
      // truncate games and cost more coverage than it buys. `terminals` reports
      // how often it actually fired.
      if (resignRng() < options.resignRate) genBuffer[count++] = paMake(AKind.RESIGN);

      // Injected AFTER the legality comparison above: `generateAllActions` does
      // not offer RESIGN, so a RESIGN in the buffer would read as a set
      // mismatch rather than as the extra candidate it is.
      const chosen = pickAction(rng, genBuffer, count);
      const action = toAIAction(p, chosen, keep);
      if (!isLegalAction(state, action)) {
        record({
          kind: 'legality',
          seed: options.seed,
          game,
          ply,
          field: 'replica-emitted-illegal-action',
          action,
          prefix: [...prefix],
          rules,
          state,
        });
        break;
      }

      const next = applyAction(state, action);
      const digestBefore = fuzzDigest(replica, p);
      undo.top = 0;
      replica.resetUndoScratch();
      replica.make(p, chosen, undo, keep);

      // unmake identity
      replica.unmake(p, undo);
      if (fuzzDigest(replica, p) !== digestBefore) {
        record({
          kind: 'unmake',
          seed: options.seed,
          game,
          ply,
          field: 'digest',
          action,
          prefix: [...prefix],
          rules,
          replica: fuzzDigest(replica, p),
          canonical: digestBefore,
          state,
        });
        break;
      }
      undo.top = 0;
      replica.resetUndoScratch();
      replica.make(p, chosen, undo, keep);
      adoptNewUnitIds(p, state, next);

      if (action.type === 'BUY_UNIT') metrics.buys++;
      // `resolveSummons` always writes a fresh `lastSummoning`; object identity
      // is therefore exactly "a hand-off resolved commitments on this ply".
      if (next.lastSummoning && next.lastSummoning !== state.lastSummoning) {
        arrivalsThisGame += next.lastSummoning.summoned.length;
        refundsThisGame += next.lastSummoning.disrupted.length;
        metrics.arrivals += next.lastSummoning.summoned.length;
        metrics.refunds += next.lastSummoning.disrupted.length;
      }

      if (options.surfaces.has('transition')) {
        replica.pack(next, canonicalPacked);
        const field = firstDifference(p, canonicalPacked);
        if (field !== null) {
          record({
            kind: 'transition',
            seed: options.seed,
            game,
            ply,
            field,
            action,
            prefix: [...prefix],
            rules,
            replica: fuzzDigest(replica, p),
            canonical: fuzzDigest(replica, canonicalPacked),
            state: next,
          });
          break;
        }
      }

      metrics.actions++;
      metrics.plies++;
      prefix.push(action);
      if (prefix.length > 600) prefix.shift();

      // `check` is the replica's own invariant suite (ET §8.6). At the default
      // cadence it runs with the rehash sweep below, once every 64 actions; with
      // `--legality-every 1` in force the caller has asked for the expensive
      // comparison on every action, and this is part of it.
      if (options.legalityEvery === 1 && metrics.actions % 64 !== 0) {
        metrics.stateChecks++;
        try {
          replica.check(p);
        } catch (err) {
          record({
            kind: 'rehash',
            seed: options.seed,
            game,
            ply,
            field: `check: ${(err as Error).message}`,
            action,
            prefix: [...prefix],
            rules,
            state: next,
          });
        }
      }

      if (metrics.actions % 64 === 0) {
        const kpos = recomputeKpos(p);
        const kturn = recomputeKturn(p);
        const occHash = recomputeOccHash(p);
        if (kpos.lo !== p.kposLo || kpos.hi !== p.kposHi || kturn.lo !== p.kturnLo || kturn.hi !== p.kturnHi || occHash !== p.occHash) {
          record({ kind: 'rehash', seed: options.seed, game, ply, field: 'keys', action, prefix: [...prefix], rules, state: next });
        }
        metrics.stateChecks++;
        try {
          replica.check(p);
        } catch (err) {
          record({
            kind: 'rehash',
            seed: options.seed,
            game,
            ply,
            field: `check: ${(err as Error).message}`,
            action,
            prefix: [...prefix],
            rules,
            state: next,
          });
        }
        // `unpack` must emit `pendingSummons` and `ruleset: 'phasing'` (item G):
        // if it omitted either, this round trip loses the plane or `pack` throws.
        try {
          replica.pack(replica.unpack(p), roundTripPacked);
          const field = firstDifference(p, roundTripPacked);
          if (field !== null) {
            record({ kind: 'roundtrip', seed: options.seed, game, ply, field, action, prefix: [...prefix], rules, state: next });
          }
        } catch (err) {
          record({
            kind: 'roundtrip',
            seed: options.seed,
            game,
            ply,
            field: `pack(unpack(p)): ${(err as Error).message}`,
            action,
            prefix: [...prefix],
            rules,
            state: next,
          });
        }
      }

      try {
        checkInvariants(next, `fuzz g${game} ply${ply}`);
      } catch (err) {
        record({
          kind: 'invariant',
          seed: options.seed,
          game,
          ply,
          field: (err as Error).message,
          action,
          prefix: [...prefix],
          rules,
          state: next,
        });
        break;
      }

      // A macro node is the state a hand-off returns: the side to move changed.
      if (options.sample > 0 && next.phase === 'playing' && next.turn.currentPlayer !== state.turn.currentPlayer) {
        const turn = next.turn.turnNumber;
        let bucket = buckets.get(turn);
        if (bucket === undefined) {
          bucket = [];
          buckets.set(turn, bucket);
        }
        if (bucket.length < 64 || rng() < 0.05) {
          // `lastIncome`/`lastUpkeep`/`lastSummoning` are per-turn telemetry no
          // rule reads; they would triple the stored line for nothing.
          const { lastIncome: _income, lastUpkeep: _upkeep, lastSummoning: _summoning, ...trimmed } = next;
          const stored: StoredPosition = {
            schema: 'muju-position-v1',
            id: `fuzz-${options.seed}-${game}-${ply}`,
            tags: ['fuzz', 'phasing', `turn-${turn}`],
            rationale: `Macro node sampled by the M2 Phasing differential fuzzer (seed ${options.seed}, game ${game}, ply ${ply}).`,
            depth: 2,
            rules: { ...rules, handicap: rules.handicap },
            state: trimmed,
          };
          if (bucket.length < 64) bucket.push(stored);
          else bucket[Math.floor(rng() * bucket.length)] = stored;
        }
      }

      state = next;
      endedBy = action;
    }

    if (clearedThisGame) metrics.canActClearedGames++;
    if (arrivalsThisGame > 0) metrics.gamesWithArrival++;
    if (refundsThisGame > 0) metrics.gamesWithRefund++;
    if (arrivalsThisGame > 0 && refundsThisGame > 0) metrics.gamesWithArrivalAndRefund++;
    const terminal = terminalName(state, endedBy);
    metrics.terminals[terminal] = (metrics.terminals[terminal] ?? 0) + 1;
    metrics.games++;
    game++;
  }

  const samples = options.sample > 0 ? stratify(buckets, options.sample) : [];
  metrics.sampled = samples.length;
  metrics.arrivalRefundGameFraction =
    metrics.games > 0 ? Math.round((metrics.gamesWithArrivalAndRefund / metrics.games) * 1000) / 1000 : 0;
  metrics.elapsedMs = Date.now() - started;

  if (options.reproDir !== null && divergences.length > 0) {
    writeRepros(options.reproDir, 'divergence', divergences);
  }

  return { metrics, samples };
}

function writeRepros(dir: string, stem: string, items: readonly unknown[]): void {
  fs.mkdirSync(dir, { recursive: true });
  items.forEach((d, i) => {
    fs.writeFileSync(path.join(dir, `${stem}-${i}.json`), JSON.stringify(d, null, 2) + '\n');
  });
}

/** Round-robin across turn-number buckets so the sample is stratified by turn. */
function stratify(buckets: Map<number, StoredPosition[]>, want: number): StoredPosition[] {
  const turns = [...buckets.keys()].sort((a, b) => a - b);
  const out: StoredPosition[] = [];
  for (let round = 0; out.length < want; round++) {
    let progressed = false;
    for (const turn of turns) {
      const bucket = buckets.get(turn) as StoredPosition[];
      if (round >= bucket.length) continue;
      out.push(bucket[round]);
      progressed = true;
      if (out.length === want) break;
    }
    if (!progressed) break;
  }
  return out;
}

/**
 * Kind-weighted choice. Uniform sampling over the raw action list is dominated
 * by MOVEs and by the phase-enders, which leaves kills, purchases, promotions,
 * upkeep pressure and therefore the three non-draw terminals almost untested.
 *
 * Under Phasing, BUY is weighted above everything else: a commitment is the only
 * way to reach an arrival or a refund at all, and every Phasing-specific field
 * in `PackedState` is dead weight in a game with no commitments. The Prepare
 * phase also never auto-advances, so a walker that under-weights BUY simply
 * plays `END_PLACE_PHASE` and never exercises the plane.
 */
const KIND_WEIGHT = new Int32Array(8);
KIND_WEIGHT[AKind.END_PLACE] = 2;
KIND_WEIGHT[AKind.MOVE] = 6;
KIND_WEIGHT[AKind.ATTACK] = 22;
KIND_WEIGHT[AKind.BUY] = 40;
KIND_WEIGHT[AKind.PROMOTE] = 10;
KIND_WEIGHT[AKind.END_ACTION] = 4;
KIND_WEIGHT[AKind.PAY_UPKEEP] = 1;
// Injected by the walk, not generated (see `FuzzOptions.resignRate`). Weight 1
// against the other kinds available at the node — which at a pending-upkeep node
// is only PAY_UPKEEP, so the offer itself has to be rare or a quarter of the games
// end in a resignation and the long-game coverage goes with them.
KIND_WEIGHT[AKind.RESIGN] = 1;

const KIND_COUNT = new Int32Array(8);

function pickAction(rng: () => number, buffer: Int32Array, count: number): PA {
  KIND_COUNT.fill(0);
  for (let i = 0; i < count; i++) KIND_COUNT[paKind(buffer[i])]++;
  let total = 0;
  for (let k = 0; k < 8; k++) if (KIND_COUNT[k] > 0) total += KIND_WEIGHT[k];
  if (total === 0) return buffer[Math.floor(rng() * count)];
  let roll = rng() * total;
  let picked = -1;
  for (let k = 0; k < 8; k++) {
    if (KIND_COUNT[k] === 0) continue;
    roll -= KIND_WEIGHT[k];
    if (roll < 0) {
      picked = k;
      break;
    }
  }
  if (picked < 0) return buffer[Math.floor(rng() * count)];
  let nth = Math.floor(rng() * KIND_COUNT[picked]);
  for (let i = 0; i < count; i++) {
    if (paKind(buffer[i]) !== picked) continue;
    if (nth === 0) return buffer[i];
    nth--;
  }
  return buffer[count - 1];
}

type Report = (d: Omit<Divergence, 'seed' | 'game' | 'ply' | 'prefix' | 'rules' | 'state'>) => void;

function checkLegalitySurface(
  p: PackedState,
  state: GameState,
  keep: KeepSetTable,
  count: number,
  buffer: Int32Array,
  metrics: FuzzMetrics,
  report: Report,
): void {
  if (p.result !== Result.ONGOING) return;
  const mine: string[] = new Array<string>(count);
  for (let i = 0; i < count; i++) mine[i] = normalize(toAIAction(p, buffer[i], keep));
  mine.sort();

  if (state.upkeepPending) {
    // Soundness: every emitted keep-set must be canonically legal.
    for (let i = 0; i < count; i++) {
      const action = toAIAction(p, buffer[i], keep);
      if (!isLegalAction(state, action)) {
        report({ kind: 'legality', field: `illegal-keep-set[${i}]`, action, replica: mine.join(' '), canonical: '' });
        return;
      }
    }
    const theirs = upkeepActions(state)
      .filter(a => isLegalAction(state, a))
      .map(normalize)
      .sort();
    if (count >= KEEP_SET_CAPACITY) {
      // Set EQUALITY is undefined here and ONLY here: the replica caps the table
      // at `KEEP_SET_CAPACITY` (DESIGN §3.2/§5.10) while `upkeepActions` does not.
      // Converger round 3 was the first sweep to reach this path (2 nodes in
      // 1.25M legality checks, seeds 76 and 87), and it used to return blind, so
      // a truncated node asserted only the soundness loop above. Everything else
      // about the node is still defined, so check it:
      //   - the emitted sets must be pairwise DISTINCT. Soundness accepts 64
      //     copies of one legal set, and the multiset comparison that would have
      //     caught the duplicate is exactly what the cap skips.
      //   - when canonical offers no more than the cap, nothing was dropped and
      //     full equality is defined again, so require it. (Given soundness and
      //     distinctness this cannot fire; it is here so that the one case where
      //     equality survives truncation is not silently exempted with it.)
      // `theirs` may be SHORTER than `mine` without either engine being wrong:
      // `upkeepActions` enumerates subsets of at most twelve rent-bearing units,
      // so it is the incomplete side above that, and the soundness loop has
      // already accepted every emitted set one by one. That case is not reported.
      metrics.legalityKeepSetTruncations++;
      for (let i = 1; i < mine.length; i++) {
        if (mine[i] === mine[i - 1]) {
          report({ kind: 'legality', field: `keep-set-duplicate-under-truncation[${mine[i]}]`, action: null, replica: mine.join(' '), canonical: theirs.join(' ') });
          return;
        }
      }
      if (theirs.length === mine.length && theirs.some((x, i) => x !== mine[i])) {
        report({ kind: 'legality', field: 'keep-set-multiset-at-cap', action: null, replica: mine.join(' '), canonical: theirs.join(' ') });
      }
      return;
    }
    if (theirs.length !== mine.length || theirs.some((x, i) => x !== mine[i])) {
      report({ kind: 'legality', field: 'keep-set-multiset', action: null, replica: mine.join(' '), canonical: theirs.join(' ') });
    }
    return;
  }

  const theirs = canonicalLegalSet(state);
  if (theirs.length !== mine.length || theirs.some((x, i) => x !== mine[i])) {
    report({ kind: 'legality', field: 'action-multiset', action: null, replica: mine.join(' '), canonical: theirs.join(' ') });
  }
}

/**
 * Commitment-specific legality probes (design items B and D). The action-multiset
 * comparison above already proves the POSITIVE half of the Phasing commitment
 * rules — that a commitment neither anchors nor blocks anything — because the
 * canonical oracle it is compared against derives spawn squares, moves and
 * attacks from real units only (`getAllSpawnPositions`, `getValidMoves`,
 * `getValidAttacks` read `board.units`). What that comparison cannot see is a
 * BUY that neither engine emits, or a commitment that leaked into the replica's
 * occupancy bitboards. Both are checked directly here:
 *
 *   a. a BUY on a square the mover already holds a commitment on is illegal in
 *      BOTH engines, for every affordable tier-1 definition (`isLegal` is asked
 *      about an action `genPlace` never emits);
 *   b. a commitment-only square is NOT set in `occ`/`occBy`, and a real unit may
 *      still stand on it (a commitment never occupies a square);
 *   c. the mover's own commitment squares are exactly the squares
 *      `getAllSpawnPositions` minus `getPurchasePositions` would exclude, i.e.
 *      the replica's plane agrees with the canonical commitment list.
 */
function checkPendingSurface(replica: Replica, p: PackedState, state: GameState, metrics: FuzzMetrics, report: Report): void {
  if (p.result !== Result.ONGOING) return;
  const side = p.side;
  const mover = state.turn.currentPlayer;

  // (c) the plane and the canonical commitment list name the same squares.
  const canonicalSquares = new Set(pendingsOf(state, mover).map(s => squareOf(s.position)));
  const planeSquares = new Set<number>();
  for (let s = 0; s < 100; s++) if (p.pendDef[side * 100 + s] !== 0) planeSquares.add(s);
  metrics.pendingLegalityChecks++;
  if (canonicalSquares.size !== planeSquares.size || [...canonicalSquares].some(s => !planeSquares.has(s))) {
    report({
      kind: 'pending',
      field: 'own-commitment-squares',
      action: null,
      replica: [...planeSquares].sort((a, b) => a - b).join(','),
      canonical: [...canonicalSquares].sort((a, b) => a - b).join(','),
    });
  }

  for (const square of planeSquares) {
    const position = positionOf(square);

    // (a) BUY on an own commitment square is illegal in both engines.
    for (const def of TIER1_DEFS) {
      const index = DEF_INDEX.get(def.id);
      if (index === undefined) continue;
      metrics.pendingLegalityChecks++;
      const replicaSays = replica.isLegal(p, paMake(AKind.BUY, index, square, 0));
      const canonicalSays = isLegalAction(state, { type: 'BUY_UNIT', definitionId: def.id, position });
      if (replicaSays || canonicalSays) {
        report({
          kind: 'pending',
          field: `buy-on-own-commitment@${square}:${def.id}`,
          action: { type: 'BUY_UNIT', definitionId: def.id, position },
          replica: String(replicaSays),
          canonical: String(canonicalSays),
        });
      }
    }

    // (b) a commitment never occupies a square.
    metrics.pendingLegalityChecks++;
    const occupied = ((p.occ[square >>> 5] >>> (square & 31)) & 1) === 1;
    const realUnit = getUnitAt(state.board, position) !== null;
    if (occupied !== realUnit) {
      report({
        kind: 'pending',
        field: `commitment-in-occupancy@${square}`,
        action: null,
        replica: String(occupied),
        canonical: String(realUnit),
      });
    }
  }
}

// --- the arrival surface -----------------------------------------------------

export interface ArrivalOptions {
  seed: number;
  /** Positions to build and hand off. */
  cases: number;
  /** Plies to walk before synthesising commitments (upper bound; randomised). */
  plies: number;
  reproDir: string | null;
}

export interface ArrivalMetrics {
  seed: number;
  cases: number;
  /** Cases whose synthesis produced an unusable position (rejected, not counted). */
  skipped: number;
  /** Why they were rejected. */
  skipReasons: Record<string, number>;
  /** Cases where the arriving side held at least one commitment. */
  withCommitments: number;
  arrivals: number;
  refunds: number;
  casesWithArrival: number;
  casesWithRefund: number;
  casesWithBoth: number;
  /** Cases where the NON-arriving side also held a commitment (it must survive). */
  casesWithBothSidesPending: number;
  /** Hand-offs that ended the game (home occupation / elimination) before
   * `resolveSummons` ran, so both planes must survive untouched. */
  terminalHandoffs: number;
  intrusions: Record<string, number>;
  transitionMismatches: number;
  unmakeMismatches: number;
  rehashMismatches: number;
  roundTripMismatches: number;
  arrivalFlagMismatches: number;
  refundBankMismatches: number;
  planeNotClearedMismatches: number;
  survivorMismatches: number;
  elapsedMs: number;
}

interface ArrivalDivergence {
  kind: string;
  seed: number;
  case: number;
  field: string;
  intrusion: string;
  replica?: string;
  canonical?: string;
  before: GameState;
  after: GameState;
}

const INTRUSIONS = ['none', 'park-own', 'park-enemy', 'block-home', 'kill-anchor', 'displace-anchor'] as const;
type Intrusion = (typeof INTRUSIONS)[number];

/**
 * Walks a seeded Phasing game for up to `plies` plies and returns the LAST
 * position that was still `playing`. Returning the last playing position rather
 * than wherever the game happened to stop means a walk that ends in a victory
 * still yields a usable case instead of being thrown away.
 */
function walkPhasing(rng: () => number, plies: number, rules: RulesBlock, reviewWhite: boolean, reviewBlack: boolean): GameState {
  let state = phasingInitial(rules, reviewWhite, reviewBlack);
  let lastPlaying = state;
  for (let i = 0; i < plies; i++) {
    if (state.phase !== 'playing') break;
    const actions = generateAllActions(state, state.turn.currentPlayer);
    if (actions.length === 0) break;
    const next = applyAction(state, actions[Math.floor(rng() * actions.length)]);
    if (next === state) break;
    state = next;
    if (state.phase === 'playing') lastPlaying = state;
  }
  return lastPlaying;
}

/**
 * Mines `amount` crystals straight into `player`'s bank, taking them out of real
 * cell reserves. Both harness invariants stay exact: total reserves plus total
 * `resourcesGained` is conserved, and no player holds more than it ever mined.
 * This is how the surface guarantees a bank big enough to commit summons with,
 * instead of depending on what the walk happened to leave lying around.
 */
function topUp(state: GameState, player: PlayerId, amount: number): GameState {
  let left = amount;
  const cells = state.board.cells.map(row => row.map(cell => ({ ...cell })));
  for (let y = 0; y < 10 && left > 0; y++) {
    for (let x = 0; x < 10 && left > 0; x++) {
      const take = Math.min(left, cells[y][x].resourceLayers);
      cells[y][x].resourceLayers -= take;
      left -= take;
    }
  }
  const mined = amount - left;
  const me = state.players[player];
  return {
    ...state,
    board: { ...state.board, cells },
    players: {
      ...state.players,
      [player]: { ...me, resources: me.resources + mined, resourcesGained: me.resourcesGained + mined },
    },
  };
}

/** Commits 1..3 summons for `player` on currently valid spawn squares, debiting
 * the bank exactly as `applyBuyUnit` does (so the refund at arrival time returns
 * crystals the side really paid). */
function commitSummons(state: GameState, player: PlayerId, rng: () => number, idPrefix: string): GameState {
  const want = 1 + Math.floor(rng() * 3);
  let next = topUp(state, player, want * 5);
  for (let i = 0; i < want; i++) {
    const squares = getAllSpawnPositions(player, next.board).filter(
      pos => !pendingsOf(next, player).some(s => s.position.x === pos.x && s.position.y === pos.y),
    );
    if (squares.length === 0) break;
    const position = squares[Math.floor(rng() * squares.length)];
    const def = TIER1_DEFS[Math.floor(rng() * TIER1_DEFS.length)];
    const me = next.players[player];
    if (me.resources < def.cost) continue;
    next = {
      ...next,
      pendingSummons: [
        ...(next.pendingSummons ?? []),
        { id: `${idPrefix}-${i}`, owner: player, definitionId: def.id, position: { ...position }, cost: def.cost },
      ],
      players: { ...next.players, [player]: { ...me, resources: me.resources - def.cost } },
    };
  }
  return next;
}

function moveUnitTo(state: GameState, unitId: string, to: Position): GameState {
  return {
    ...state,
    board: { ...state.board, units: state.board.units.map(u => (u.id === unitId ? { ...u, position: { ...to } } : u)) },
  };
}

function removeUnit(state: GameState, unitId: string): GameState {
  return { ...state, board: { ...state.board, units: state.board.units.filter(u => u.id !== unitId) } };
}

/**
 * Perturbs the position so some of `victim`'s commitments stop being supported.
 * Every intrusion is state surgery, not a played action: the point is to reach
 * the shape "a commitment that WAS valid when it was paid for is invalid at
 * arrival time", which legal play reaches only occasionally.
 *
 *   `park-own`      — one of the victim's own units stands on the square.
 *   `park-enemy`    — an enemy unit stands on the square.
 *   `block-home`    — an enemy unit stands on the victim's start corner, which
 *                     lies in EVERY rectangle of that side, so every commitment
 *                     of the victim loses support at once (the home-occupation
 *                     rule of PHASING-2026-09-16.md).
 *   `kill-anchor`   — the victim's unit that supports the square is removed.
 *   `displace-anchor` — that anchor is moved elsewhere instead of removed.
 */
function intrude(state: GameState, victim: PlayerId, kind: Intrusion, rng: () => number): GameState {
  const commitments = pendingsOf(state, victim);
  if (commitments.length === 0 || kind === 'none') return state;
  const target = commitments[Math.floor(rng() * commitments.length)];
  const enemies = state.board.units.filter(u => u.owner !== victim);
  const mine = state.board.units.filter(u => u.owner === victim);
  const emptyTarget = getUnitAt(state.board, target.position) === null;

  if (kind === 'park-own' && emptyTarget && mine.length > 1) {
    return moveUnitTo(state, mine[Math.floor(rng() * mine.length)].id, target.position);
  }
  if (kind === 'park-enemy' && emptyTarget && enemies.length > 1) {
    return moveUnitTo(state, enemies[Math.floor(rng() * enemies.length)].id, target.position);
  }
  if (kind === 'block-home' && enemies.length > 1) {
    const corner = getStartCorner(victim);
    if (getUnitAt(state.board, corner) === null) {
      return moveUnitTo(state, enemies[Math.floor(rng() * enemies.length)].id, corner);
    }
    return state;
  }
  // The anchors that currently support the target square.
  const corner = getStartCorner(victim);
  const inRectangle = (u: Unit): boolean =>
    target.position.x >= Math.min(corner.x, u.position.x) &&
    target.position.x <= Math.max(corner.x, u.position.x) &&
    target.position.y >= Math.min(corner.y, u.position.y) &&
    target.position.y <= Math.max(corner.y, u.position.y);
  const anchors = mine.filter(inRectangle);
  if (anchors.length === 0 || mine.length <= 1) return state;
  const anchor = anchors[Math.floor(rng() * anchors.length)];
  if (kind === 'kill-anchor') return removeUnit(state, anchor.id);
  // displace-anchor: park it on a far empty square of the opposite quadrant.
  for (let attempt = 0; attempt < 20; attempt++) {
    const to = { x: Math.floor(rng() * 10), y: Math.floor(rng() * 10) };
    if (getUnitAt(state.board, to) === null && !(to.x === corner.x && to.y === corner.y)) {
      return moveUnitTo(state, anchor.id, to);
    }
  }
  return state;
}

/** A synthesised position is usable only if it is a legal, playing Phasing
 * position with `END_PLACE_PHASE` available. Returns the rejection reason, so
 * the metrics say WHY cases were dropped rather than only how many. */
function unusableReason(state: GameState): string | null {
  if (state.phase !== 'playing') return 'not-playing';
  if (state.board.units.filter(u => u.owner === 'white').length === 0) return 'white-eliminated';
  if (state.board.units.filter(u => u.owner === 'black').length === 0) return 'black-eliminated';
  const squares = new Set(state.board.units.map(u => squareOf(u.position)));
  if (squares.size !== state.board.units.length) return 'shared-square';
  if (state.players.white.resources < 0 || state.players.black.resources < 0) return 'negative-bank';
  if (!isLegalAction(state, { type: 'END_PLACE_PHASE' })) return 'end-place-illegal';
  try {
    checkInvariants(state, 'arrival-surface synthesis');
  } catch (err) {
    return `invariant: ${(err as Error).message}`;
  }
  return null;
}

/**
 * The arrival surface (M2): compare `END_PLACE_PHASE` across the two engines on
 * positions built to make arrivals and refunds happen together.
 *
 * Each case walks a seeded Phasing game to a random mid-game position, commits
 * summons for BOTH sides, applies a random intrusion against the side that is
 * about to arrive (and sometimes against the other side, which must be left
 * untouched by the hand-off), forces the Prepare shape, and then compares:
 * the full packed state (board, plane, banks, keys, sums), the `unmake`
 * identity, `pack(unpack(p))`, the arriving units' flags (they may act and may
 * promote, so `F_CAN_ACT` set and `F_PLACED` clear), the refund arithmetic, that
 * the arriving side's plane is empty afterwards, and that the other side's plane
 * survived unchanged.
 */
export function runArrivalSurface(options: ArrivalOptions): ArrivalMetrics {
  const started = Date.now();
  const replica = new Replica();
  const undo = newUndo();
  const keep = newKeepSetTable();
  const canonicalPacked = allocState();
  const roundTripPacked = allocState();

  const metrics: ArrivalMetrics = {
    seed: options.seed,
    cases: 0,
    skipped: 0,
    skipReasons: {},
    withCommitments: 0,
    arrivals: 0,
    refunds: 0,
    casesWithArrival: 0,
    casesWithRefund: 0,
    casesWithBoth: 0,
    casesWithBothSidesPending: 0,
    terminalHandoffs: 0,
    intrusions: {},
    transitionMismatches: 0,
    unmakeMismatches: 0,
    rehashMismatches: 0,
    roundTripMismatches: 0,
    arrivalFlagMismatches: 0,
    refundBankMismatches: 0,
    planeNotClearedMismatches: 0,
    survivorMismatches: 0,
    elapsedMs: 0,
  };
  const divergences: ArrivalDivergence[] = [];

  for (let caseIndex = 0; caseIndex < options.cases; caseIndex++) {
    const rng = seededRandom((options.seed + caseIndex * 104729) >>> 0);
    const { rules, reviewWhite, reviewBlack } = randomRules(rng);
    const skip = (reason: string): void => {
      metrics.skipped++;
      metrics.skipReasons[reason] = (metrics.skipReasons[reason] ?? 0) + 1;
    };
    const walked = walkPhasing(rng, 8 + Math.floor(rng() * options.plies), rules, reviewWhite, reviewBlack);
    if (walked.phase !== 'playing') {
      skip('walk-never-playing');
      continue;
    }
    const mover = walked.turn.currentPlayer;
    const other: PlayerId = mover === 'white' ? 'black' : 'white';

    // Commit for both sides, then perturb. The hand-off resolves the OTHER
    // side's commitments (it becomes the mover), so that is the side the
    // intrusion targets; the mover's own plane must survive untouched.
    let state = commitSummons(walked, other, rng, `arr-${caseIndex}-o`);
    state = commitSummons(state, mover, rng, `arr-${caseIndex}-m`);
    const kind = INTRUSIONS[Math.floor(rng() * INTRUSIONS.length)];
    state = intrude(state, other, kind, rng);
    if (rng() < 0.3) state = intrude(state, mover, INTRUSIONS[Math.floor(rng() * INTRUSIONS.length)], rng);

    // Force the Prepare shape: Phasing reaches it after END_ACTION_PHASE has
    // collected income and settled upkeep, so actions are spent and no upkeep
    // choice is outstanding.
    state = {
      ...state,
      upkeepPending: false,
      turn: { ...state.turn, phase: 'place', actionsRemaining: 0 },
      selectedUnit: null,
      validMoves: [],
      validAttacks: [],
    };
    const reason = unusableReason(state);
    if (reason !== null) {
      skip(reason);
      continue;
    }

    metrics.cases++;
    metrics.intrusions[kind] = (metrics.intrusions[kind] ?? 0) + 1;
    const arriving = pendingsOf(state, other);
    const surviving = pendingsOf(state, mover);
    if (arriving.length > 0) metrics.withCommitments++;
    if (arriving.length > 0 && surviving.length > 0) metrics.casesWithBothSidesPending++;

    const before = state;
    const after = applyAction(before, { type: 'END_PLACE_PHASE' });
    let p: PackedState;
    try {
      p = replica.pack(before);
    } catch (err) {
      divergences.push({
        kind: 'pack',
        seed: options.seed,
        case: caseIndex,
        field: `pack threw: ${(err as Error).message}`,
        intrusion: kind,
        before,
        after,
      });
      metrics.transitionMismatches++;
      continue;
    }
    const bankBefore = p.bank[other === 'white' ? 0 : 1];
    const digestBefore = fuzzDigest(replica, p);
    const endPlace = paMake(AKind.END_PLACE, 0, 0, 0);

    undo.top = 0;
    replica.resetUndoScratch();
    replica.make(p, endPlace, undo, keep);
    replica.unmake(p, undo);
    if (fuzzDigest(replica, p) !== digestBefore) {
      metrics.unmakeMismatches++;
      divergences.push({
        kind: 'unmake',
        seed: options.seed,
        case: caseIndex,
        field: 'digest',
        intrusion: kind,
        replica: fuzzDigest(replica, p),
        canonical: digestBefore,
        before,
        after,
      });
      continue;
    }
    undo.top = 0;
    replica.resetUndoScratch();
    replica.make(p, endPlace, undo, keep);

    // `startTurn` adjudicates an existing home occupation and elimination BEFORE
    // it resolves the new mover's commitments, so a terminal hand-off leaves both
    // planes untouched. `resolveSummons` always writes a fresh `lastSummoning`,
    // so object identity is exactly "commitments were resolved on this hand-off".
    const resolved = after.lastSummoning !== undefined && after.lastSummoning !== before.lastSummoning;
    if (!resolved) metrics.terminalHandoffs++;
    const summoned = resolved ? after.lastSummoning!.summoned : [];
    const disrupted = resolved ? after.lastSummoning!.disrupted : [];
    metrics.arrivals += summoned.length;
    metrics.refunds += disrupted.length;
    if (summoned.length > 0) metrics.casesWithArrival++;
    if (disrupted.length > 0) metrics.casesWithRefund++;
    if (summoned.length > 0 && disrupted.length > 0) metrics.casesWithBoth++;

    const push = (dkind: string, field: string, replicaSide?: string, canonicalSide?: string): void => {
      if (divergences.length < 32) {
        divergences.push({ kind: dkind, seed: options.seed, case: caseIndex, field, intrusion: kind, replica: replicaSide, canonical: canonicalSide, before, after });
      }
    };

    adoptNewUnitIds(p, before, after);
    replica.pack(after, canonicalPacked);
    const field = firstDifference(p, canonicalPacked);
    if (field !== null) {
      metrics.transitionMismatches++;
      push('transition', field, fuzzDigest(replica, p), fuzzDigest(replica, canonicalPacked));
    }

    // Replica-side assertions that do not go through the canonical pack, so a
    // shared misunderstanding of the rule cannot hide behind a matching digest.
    {
      const arrivingSide = other === 'white' ? 0 : 1;
      const moverSide = mover === 'white' ? 0 : 1;
      const wantArriving = resolved ? 0 : arriving.length;
      if (p.pendCount[arrivingSide] !== wantArriving || (wantArriving === 0 && p.pendCostSum[arrivingSide] !== 0)) {
        metrics.planeNotClearedMismatches++;
        push(
          resolved ? 'plane-not-cleared' : 'plane-cleared-on-terminal-handoff',
          `pendCount=${p.pendCount[arrivingSide]} pendCostSum=${p.pendCostSum[arrivingSide]}`,
          String(wantArriving),
        );
      }
      if (p.pendCount[moverSide] !== surviving.length) {
        metrics.survivorMismatches++;
        push('survivor-plane', `pendCount=${p.pendCount[moverSide]}`, String(surviving.length));
      }
      const refundTotal = disrupted.reduce((sum, s) => sum + s.cost, 0);
      if (p.bank[arrivingSide] !== bankBefore + refundTotal) {
        metrics.refundBankMismatches++;
        push('refund-bank', `bank=${p.bank[arrivingSide]}`, `${bankBefore}+${refundTotal}`);
      }
    }
    // Arrivals may act and may promote this turn: `placedThisTurn` false.
    for (const s of summoned) {
      const slot = p.pieceAt[squareOf(s.position)];
      if (slot === NO_SLOT) {
        metrics.arrivalFlagMismatches++;
        push('arrival-missing', `square ${squareOf(s.position)}`);
        continue;
      }
      const flags = p.uflags[slot];
      if ((flags & F_CAN_ACT) === 0 || (flags & F_PLACED) !== 0) {
        metrics.arrivalFlagMismatches++;
        push('arrival-flags', `uflags=${flags}`, 'F_CAN_ACT set, F_PLACED clear');
      }
    }

    const kpos = recomputeKpos(p);
    const kturn = recomputeKturn(p);
    const occHash = recomputeOccHash(p);
    if (kpos.lo !== p.kposLo || kpos.hi !== p.kposHi || kturn.lo !== p.kturnLo || kturn.hi !== p.kturnHi || occHash !== p.occHash) {
      metrics.rehashMismatches++;
      push('rehash', 'keys');
    }
    try {
      replica.check(p);
    } catch (err) {
      metrics.rehashMismatches++;
      push('check', (err as Error).message);
    }
    try {
      replica.pack(replica.unpack(p), roundTripPacked);
      const rt = firstDifference(p, roundTripPacked);
      if (rt !== null) {
        metrics.roundTripMismatches++;
        push('roundtrip', rt);
      }
    } catch (err) {
      metrics.roundTripMismatches++;
      push('roundtrip', `pack(unpack(p)): ${(err as Error).message}`);
    }
  }

  metrics.elapsedMs = Date.now() - started;
  if (options.reproDir !== null && divergences.length > 0) writeRepros(options.reproDir, 'arrival', divergences);
  return metrics;
}
