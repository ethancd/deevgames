/**
 * The fuzzer's third surface (DESIGN §7.3) and M10's gate-preservation proof
 * (DESIGN §5.9 (c)).
 *
 * | surface | A (canonical) | B (replica) | compared |
 * |---|---|---|---|
 * | prover | `analyzeHomeDefense` (homeCheckmate.ts:57) | `homeVerdict` | the verdict, plus every `homeWitness` line replayed through canonical `applyAction` |
 * | gate-preservation | `applyAction` (simulate.ts:25), which adjudicates home checkmate on EVERY action | `Replica.make`, which calls the packed prover only under `needsProof` | `result` / `reason` after every action |
 *
 * The two surfaces exist for different reasons. The `prover` surface asks
 * whether the packed replica of the prover is bit-for-bit the canonical
 * prover — not merely "the same answer where the answer is forced", but the
 * same answer where the 20,000-node cap bites and the answer depends on the
 * ORDER in which the two searches spend their nodes. The `gate-preservation`
 * surface asks the complementary question: whether `make`'s *gate*
 * (`needsProof`, DESIGN §3.4) skips the prover only on positions where the
 * canonical engine would have found nothing, i.e. whether the optimisation is
 * invisible in the adjudicated result.
 *
 * `prover` positions are synthesised rather than played out: a random
 * occupier position reaches the interesting regime (multi-hit rotations,
 * blockers, a bitten node cap) thousands of times more often than random play
 * does. `gate-preservation` is the opposite — it needs REAL games, so it plays
 * them, biased towards the enemy corner so that occupations, and therefore the
 * gate, actually happen.
 *
 * ## PHASING (M2)
 *
 * Both surfaces are PHASING. Every synthesised position carries
 * `ruleset: 'phasing'` and every played game starts from
 * `createInitialGameState(..., 'phasing')`, because the replica is Phasing-only
 * (`pack` throws `PackError` on anything else) and `tactics/prover.ts` now
 * implements Phasing's ACT-ONLY home defence. The two surfaces therefore run by
 * DEFAULT again: there is no Standard model left to exempt, and any verdict,
 * node-count or witness split is a failure.
 *
 * The witness is replayed from canonical `ready` — the defender to move, action
 * phase, four actions, its army healed and reset — because that is the position
 * Phasing's `act(ready, [])` searches (homeCheckmate.ts:74-75, 160). It used to
 * be replayed from the defender's UPKEEP, which is where Standard's `prepare`
 * began.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { AIAction } from '../../../src/ai/types';
import type { BoardState, Cell, GameState, PlayerId, Unit } from '../../../src/game/types';
import { createInitialGameState } from '../../../src/game/board';
import { UNEQUAL_ROUTES_MAP } from '../../../src/game/resourceMap';
import { UNIT_DEFINITIONS, getUnitDefinition } from '../../../src/game/units';
import { resetUnitActions } from '../../../src/game/board';
import { analyzeHomeDefenseEvidence } from '../../../src/game/homeCheckmate';
import { getHomeOccupier } from '../../../src/game/victory';
import { isLegalAction } from '../../../src/game/legality';
import { applyAction, transitionWithoutCheckmate } from '../../../src/ai/simulate';
import { seededRandom } from '../../../src/ai/runtime';
import { MAX_SLOTS, MAX_TURN_ACTIONS, NO_SLOT, Reason, Result, type PackedState, type Side } from '../../../src/ai/hard/types';
import { Scratch } from '../../../src/ai/hard/core/bits';
import { CORNER } from '../../../src/ai/hard/core/tables';
import { AKind, newKeepSetTable, paKind, paMake, toAIAction, type PA } from '../../../src/ai/hard/core/action';
import { Replica, allocState, newUndo } from '../../../src/ai/hard/core/state';
import {
  HomeVerdict,
  PROOF_NODES,
  homeVerdict,
  homeWitness,
  needsProof,
  proverStats,
} from '../../../src/ai/hard/tactics/prover';
import { tacticalFixtures } from '../../ai/fixtures';
import { PROVER_ORDER_CAPS, compareIncrementalProver, newProverOrderCounters } from './differential';

const VERDICT_NAME: readonly string[] = ['rescue', 'mate', 'unknown'];

// --- shared helpers ----------------------------------------------------------

function buildCells(): Cell[][] {
  const cells: Cell[][] = new Array<Cell[]>(10);
  for (let y = 0; y < 10; y++) {
    const row: Cell[] = new Array<Cell>(10);
    for (let x = 0; x < 10; x++) row[x] = { position: { x, y }, resourceLayers: UNEQUAL_ROUTES_MAP[y * 10 + x] };
    cells[y] = row;
  }
  return cells;
}

function makeUnit(id: string, defId: string, owner: PlayerId, sq: number, damage: number): Unit {
  return {
    id,
    definitionId: defId,
    owner,
    position: { x: sq % 10, y: (sq / 10) | 0 },
    hasMoved: false,
    hasAttacked: false,
    attackedThisTurn: [],
    lastAttackKilled: false,
    canActThisTurn: true,
    damageTaken: damage,
    placedThisTurn: false,
    promotedThisPlacement: false,
  };
}

/** The side that holds the other side's corner, or null. */
function invaderOf(board: BoardState): PlayerId | null {
  if (getHomeOccupier(board, 'white')) return 'white';
  if (getHomeOccupier(board, 'black')) return 'black';
  return null;
}

function sideOf(player: PlayerId): Side {
  return player === 'white' ? 0 : 1;
}

function writeRepros(dir: string | null, stem: string, records: unknown[]): void {
  if (dir === null || records.length === 0) return;
  fs.mkdirSync(dir, { recursive: true });
  records.forEach((r, i) => {
    fs.writeFileSync(path.join(dir, `${stem}-${i}.json`), JSON.stringify(r, null, 2) + '\n');
  });
}

// --- the prover surface ------------------------------------------------------

export interface ProverSurfaceOptions {
  seed: number;
  /** Synthesised occupier positions to compare (DESIGN §5.9: 20,000). */
  cases: number;
  /** Directory for self-contained reproducers, or null to skip writing them. */
  reproDir: string | null;
}

export interface ProverSurfaceMetrics {
  seed: number;
  cases: number;
  /** `lab/ai/fixtures.ts` cases compared against `analyzeHomeDefense` (28). */
  fixtureCases: number;
  fixtureMismatch: number;
  fuzzCases: number;
  fuzzVerdictMismatch: number;
  /** Cases where the replica burned a different number of prover nodes. */
  nodeMismatch: number;
  /** Rescues whose `homeWitness` line was replayed canonically. */
  witnessChecked: number;
  /** Witness lines with an action canonical `applyAction` rejected. */
  witnessIllegal: number;
  /** Legal witness lines that did NOT remove the occupier. */
  witnessNotRemoved: number;
  /** Verdict histogram over the fuzz cases, for coverage. */
  verdicts: Record<string, number>;
  /** Fuzz cases run at a reduced node cap, to exercise the cap itself. */
  cappedCases: number;
  /** Fuzz cases the node cap actually bit (`cutoffReason: 'node_limit'`). */
  cutoffCases: number;
  /** Fuzz cases decided by `enoughPossibleDamage` alone (`method: 'damage_bound'`). */
  boundCases: number;
  /** SU §8.1: proven mate beats the draw clock; an unproven occupation does not. */
  clockFixtureOk: boolean;
  elapsedMs: number;
}

interface ProverDivergence {
  kind: 'verdict' | 'nodes' | 'witness-illegal' | 'witness-not-removed';
  seed: number;
  case: number;
  invader: PlayerId;
  canonical: string;
  replica: string;
  maxNodes: number;
  detail?: string;
  state: GameState;
}

const ALL_DEFS: readonly string[] = UNIT_DEFINITIONS.map(d => d.id);
/** The three toughest bodies: an occupier the defender has to gang up on. */
const TOUGH_DEFS: readonly string[] = UNIT_DEFINITIONS.filter(d => d.defense >= 4).map(d => d.id);
/** Cheap bodies: rescuers that need two hits, a promotion, or a cleared lane. */
const WEAK_DEFS: readonly string[] = UNIT_DEFINITIONS.filter(d => d.tier <= 2).map(d => d.id);

/**
 * A random Phasing position in which `invader` holds the defender's corner.
 *
 * The distributions are chosen to make the prover WORK: damage on the occupier
 * (which moves the damage bound), tough occupiers that need two hits, and
 * defenders clustered near their own corner (where blockers and lane-clearing
 * matter). The defender's bank is still varied across a wide range — under
 * Phasing it must make NO difference to the verdict, which is itself worth
 * fuzzing. No defender is ever placed on the invader's corner, so replaying a
 * witness through `applyAction` can never trip the defender's OWN
 * home-checkmate adjudication mid-line.
 */
function randomOccupierPosition(rng: () => number, invader: PlayerId): GameState {
  const defender: PlayerId = invader === 'white' ? 'black' : 'white';
  const invaderSide = sideOf(invader);
  const homeSq = CORNER[1 - invaderSide];
  const ownCornerSq = CORNER[invaderSide];
  const taken = new Set<number>([homeSq]);
  const units: Unit[] = [];

  // Half the occupiers are a tough body (DEF >= 4): those need two hits, a
  // promotion or a rotation, which is where `prepare` and the node cap bite.
  const tough = rng() < 0.5;
  const occupierDef = tough ? TOUGH_DEFS[(rng() * TOUGH_DEFS.length) | 0] : ALL_DEFS[(rng() * ALL_DEFS.length) | 0];
  const occupierMax = getUnitDefinition(occupierDef).defense;
  units.push(makeUnit('invader-0', occupierDef, invader, homeSq, rng() < 0.3 ? (rng() * occupierMax) | 0 : 0));

  // Defenders: 1..8, biased towards their own (occupied) corner so that
  // adjacency, blocking and multi-hit rotations come up often, and biased
  // towards cheap bodies so a single hit is rarely enough.
  const defenders = 1 + ((rng() * 8) | 0);
  const weak = rng() < 0.6;
  for (let i = 0; i < defenders; i++) {
    const near = rng() < 0.8;
    let sq = -1;
    for (let tries = 0; tries < 64 && sq < 0; tries++) {
      const dx = near ? (rng() * 4) | 0 : (rng() * 10) | 0;
      const dy = near ? (rng() * 4) | 0 : (rng() * 10) | 0;
      const x = invader === 'black' ? dx : 9 - dx;
      const y = invader === 'black' ? dy : 9 - dy;
      const candidate = y * 10 + x;
      if (!taken.has(candidate) && candidate !== ownCornerSq) sq = candidate;
    }
    if (sq < 0) continue;
    taken.add(sq);
    const pool = weak ? WEAK_DEFS : ALL_DEFS;
    units.push(makeUnit(`defender-${i}`, pool[(rng() * pool.length) | 0], defender, sq, 0));
  }

  // Extra invader units: blockers and secondary targets near the same corner.
  const extras = (rng() * 4) | 0;
  for (let i = 0; i < extras; i++) {
    const dx = (rng() * 4) | 0;
    const dy = (rng() * 4) | 0;
    const x = invader === 'black' ? dx : 9 - dx;
    const y = invader === 'black' ? dy : 9 - dy;
    const sq = y * 10 + x;
    if (taken.has(sq)) continue;
    taken.add(sq);
    const def = ALL_DEFS[(rng() * ALL_DEFS.length) | 0];
    units.push(makeUnit(`invader-${i + 1}`, def, invader, sq, (rng() * getUnitDefinition(def).defense) | 0));
  }

  const cash = [0, 0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 30][(rng() * 15) | 0];
  const board: BoardState = { cells: buildCells(), units, initialResourceLayers: [...UNEQUAL_ROUTES_MAP] };
  return {
    actionsPerTurn: 4,
    ruleset: 'phasing',
    pendingSummons: [],
    blackCrystalHandicap: 0,
    victoryRule: 'home-or-elimination',
    inactivityRule: 'on',
    upkeepPending: false,
    reviewUpkeep: { white: false, black: false },
    inactivityPlies: 0,
    progressThisTurn: false,
    phase: 'playing',
    board,
    players: {
      white: { id: 'white', resources: defender === 'white' ? cash : 0, startCorner: { x: 0, y: 0 }, resourcesGained: 0, resourcesUpkeep: 0 },
      black: { id: 'black', resources: defender === 'black' ? cash : 0, startCorner: { x: 9, y: 9 }, resourcesGained: 0, resourcesUpkeep: 0 },
    },
    turn: { currentPlayer: defender, phase: 'action', actionsRemaining: 4, turnNumber: 4 },
    winner: null,
    selectedUnit: null,
    validMoves: [],
    validAttacks: [],
  };
}

/**
 * Canonical `ready` (homeCheckmate.ts:74-75) — the position Phasing's
 * `act(ready, [])` searches, and therefore the one a `homeWitness` line replays
 * from: the defender to move in its ACTION phase with four actions and its army
 * healed and reset, and no upkeep pending.
 */
function replyStart(state: GameState, defender: PlayerId): GameState {
  return {
    ...state,
    board: resetUnitActions(state.board, defender),
    upkeepPending: false,
    turn: { ...state.turn, currentPlayer: defender, phase: 'action', actionsRemaining: 4 },
  };
}

/** A Phasing view of a ruleset-agnostic fixture board (never a conversion). */
function asPhasing(state: GameState): GameState {
  return { ...state, ruleset: 'phasing', pendingSummons: [] };
}

/**
 * Replays a `homeWitness` line through canonical `applyAction`. Returns null
 * when every action was legal AND the occupier is gone at the end, otherwise
 * the reason it failed.
 */
function replayWitness(state: GameState, invader: PlayerId, line: readonly AIAction[]): string | null {
  const defender: PlayerId = invader === 'white' ? 'black' : 'white';
  let s = replyStart(state, defender);
  for (let i = 0; i < line.length; i++) {
    if (!isLegalAction(s, line[i])) return `action ${i} (${JSON.stringify(line[i])}) is illegal`;
    const next = applyAction(s, line[i]);
    if (next === s) return `action ${i} (${JSON.stringify(line[i])}) was rejected by applyAction`;
    s = next;
  }
  if (getHomeOccupier(s.board, invader)) return 'the occupier survived the line';
  return null;
}

/**
 * SU §8.1, verified through the packed gate, in its PHASING shape: at
 * `clock = 9` a PROVEN home checkmate resolves as soon as the invader's own
 * `END_ACTION` has settled upkeep and entered Prepare — before the hand-off
 * would tick the tenth quiet ply — and so beats the draw, while an UNPROVEN
 * occupation (a rescue exists) survives Prepare and is still drawn at the
 * hand-off.
 *
 * Under Phasing the MOVE onto the corner adjudicates NOTHING: `resolveHomeCheckmate`
 * returns the state untouched outside Prepare (homeCheckmate.ts:179), which is
 * the gate `Replica.provesHomeCheckmate` mirrors. Standard adjudicated at the
 * move itself, which is what this fixture used to assert.
 */
export function clockFixture(): boolean {
  const replica = new Replica();
  const undo = newUndo();
  const keep = newKeepSetTable();

  const build = (rescuer: Unit | null): GameState => {
    const units: Unit[] = [
      // Black Hi one step from White's corner, ready to walk in.
      makeUnit('invader', 'fire_1', 'black', 1, 0),
      // A lone White Muju far away: it can never reach A1 in one turn.
      makeUnit('muju', 'water_1', 'white', 99 - 11, 0),
    ];
    if (rescuer !== null) units.push(rescuer);
    return {
      actionsPerTurn: 4,
      ruleset: 'phasing',
      pendingSummons: [],
      blackCrystalHandicap: 0,
      victoryRule: 'home-or-elimination',
      inactivityRule: 'on',
      upkeepPending: false,
      reviewUpkeep: { white: false, black: false },
      inactivityPlies: 9,
      progressThisTurn: false,
      phase: 'playing',
      board: { cells: buildCells(), units, initialResourceLayers: [...UNEQUAL_ROUTES_MAP] },
      players: {
        white: { id: 'white', resources: 0, startCorner: { x: 0, y: 0 }, resourcesGained: 0, resourcesUpkeep: 0 },
        black: { id: 'black', resources: 0, startCorner: { x: 9, y: 9 }, resourcesGained: 0, resourcesUpkeep: 0 },
      },
      turn: { currentPlayer: 'black', phase: 'action', actionsRemaining: 4, turnNumber: 9 },
      winner: null,
      selectedUnit: null,
      validMoves: [],
      validAttacks: [],
    };
  };

  const apply = (p: PackedState, state: GameState, pa: PA, action: AIAction): GameState => {
    undo.top = 0;
    replica.resetUndoScratch();
    replica.make(p, pa, undo, keep);
    return applyAction(state, action);
  };

  /** MOVE onto A1, then the invader's own END_ACTION, which enters Prepare. */
  const step = (state: GameState): { replica: PackedState; canonical: GameState; afterMove: GameState } => {
    const p = replica.pack(state, allocState());
    const slot = p.pieceAt[1];
    const afterMove = apply(p, state, paMake(AKind.MOVE, slot, 0, 1), { type: 'MOVE', unitId: 'invader', to: { x: 0, y: 0 } });
    // Phasing adjudicates in Prepare only, so neither engine has decided yet.
    if (p.result !== Result.ONGOING || afterMove.phase !== 'playing') {
      return { replica: p, canonical: afterMove, afterMove };
    }
    const canonical = apply(p, afterMove, paMake(AKind.END_ACTION), { type: 'END_ACTION_PHASE' });
    return { replica: p, canonical, afterMove };
  };

  // (a) Proven mate: nobody can answer, so END_ACTION wins at clock 9 — before
  // the hand-off, which is where the tenth quiet ply would have drawn.
  const mate = step(build(null));
  const mateOk =
    mate.afterMove.phase === 'playing' &&
    mate.replica.result === Result.BLACK_WIN &&
    mate.replica.reason === Reason.HOME_CHECKMATE &&
    mate.canonical.phase === 'victory' &&
    mate.canonical.winner === 'black' &&
    mate.canonical.victoryReason === 'home-checkmate';

  // (b) Unproven occupation: a White Radi sits next to A1 and kills the Hi, so
  // Prepare is NOT a checkmate and the position survives to the hand-off, where
  // the tenth quiet ply ends it as a draw.
  const rescued = step(build(makeUnit('rescuer', 'lightning_1', 'white', 10, 0)));
  const occupiedOk = rescued.replica.result === Result.ONGOING && rescued.canonical.phase === 'playing';

  const p = rescued.replica;
  const canonicalEnd = apply(p, rescued.canonical, paMake(AKind.END_PLACE), { type: 'END_PLACE_PHASE' });
  const drawOk =
    p.result === Result.DRAW &&
    p.reason === Reason.INACTIVITY &&
    canonicalEnd.phase === 'victory' &&
    canonicalEnd.winner === null &&
    canonicalEnd.victoryReason === 'inactivity';

  return mateOk && occupiedOk && drawOk;
}

export function runProverSurface(options: ProverSurfaceOptions): ProverSurfaceMetrics {
  const started = Date.now();
  const replica = new Replica();
  const sc = new Scratch(1, 0, 0, 1);
  const witnessBuffer = new Int32Array(MAX_TURN_ACTIONS);
  const witnessKeep = newKeepSetTable();
  const packed = allocState();
  const divergences: ProverDivergence[] = [];

  const metrics: ProverSurfaceMetrics = {
    seed: options.seed,
    cases: options.cases,
    fixtureCases: 0,
    fixtureMismatch: 0,
    fuzzCases: 0,
    fuzzVerdictMismatch: 0,
    nodeMismatch: 0,
    witnessChecked: 0,
    witnessIllegal: 0,
    witnessNotRemoved: 0,
    verdicts: { rescue: 0, mate: 0, unknown: 0 },
    cappedCases: 0,
    cutoffCases: 0,
    boundCases: 0,
    clockFixtureOk: false,
    elapsedMs: 0,
  };

  const record = (d: ProverDivergence): void => {
    if (divergences.length < 16) divergences.push(d);
  };

  /** One comparison: canonical verdict vs `homeVerdict`, then the witness. */
  const compare = (state: GameState, invader: PlayerId, index: number, fixture: boolean, maxNodes: number): void => {
    // `resolveHomeCheckmate` hands the prover `transitionWithoutCheckmate` so the
    // proof never recursively adjudicates its own hypothetical positions
    // (homeCheckmate.ts:52-56); the comparison uses the same transition.
    const evidence = analyzeHomeDefenseEvidence(state, invader, transitionWithoutCheckmate, maxNodes);
    const canonical = evidence.result;
    const p = replica.pack(state, packed);
    const side = sideOf(invader);
    const verdict = homeVerdict(p, side, maxNodes, sc, 0);
    const stats = proverStats();
    const mine = VERDICT_NAME[verdict];
    // The verdict alone is a weak comparison: two provers can agree on every
    // uncapped position and still diverge the moment the cap bites. Node
    // counts are the sharp instrument — they differ as soon as the two
    // searches order their children differently or fold a different set of
    // transpositions together, long before the verdict does.
    const nodesAgree = stats.nodes === evidence.nodes && (stats.method === 1) === (evidence.method === 'damage_bound');
    if (!nodesAgree) {
      metrics.nodeMismatch++;
      record({
        kind: 'nodes',
        seed: options.seed,
        case: index,
        invader,
        canonical: `${canonical}/${evidence.nodes} nodes/${evidence.method}`,
        replica: `${mine}/${stats.nodes} nodes/method ${stats.method}`,
        maxNodes,
        state,
      });
    }
    if (!fixture) {
      metrics.fuzzCases++;
      metrics.verdicts[mine]++;
      if (maxNodes < PROOF_NODES) metrics.cappedCases++;
      if (stats.cutoff) metrics.cutoffCases++;
      if (stats.method === 1) metrics.boundCases++;
    } else {
      metrics.fixtureCases++;
    }
    if (mine !== canonical) {
      if (fixture) metrics.fixtureMismatch++;
      else metrics.fuzzVerdictMismatch++;
      record({ kind: 'verdict', seed: options.seed, case: index, invader, canonical, replica: mine, maxNodes, state });
      return;
    }
    if (verdict !== HomeVerdict.RESCUE) return;

    const length = homeWitness(p, side, maxNodes, witnessBuffer);
    if (length === 0) return;
    const line: AIAction[] = new Array<AIAction>(length);
    // The Phasing witness is MOVEs and ATTACKs only, so `toAIAction` never
    // indexes the keep-set table; an empty one is all it needs.
    for (let i = 0; i < length; i++) line[i] = toAIAction(p, witnessBuffer[i], witnessKeep);
    const failure = replayWitness(state, invader, line);
    metrics.witnessChecked++;
    if (failure === null) return;
    if (failure === 'the occupier survived the line') metrics.witnessNotRemoved++;
    else metrics.witnessIllegal++;
    record({
      kind: failure === 'the occupier survived the line' ? 'witness-not-removed' : 'witness-illegal',
      seed: options.seed,
      case: index,
      invader,
      canonical,
      replica: mine,
      maxNodes,
      detail: `${failure}; line = ${JSON.stringify(line)}`,
      state,
    });
  };

  // (a) the 28 authored fixtures, read as Phasing positions over the same board
  //     (`asPhasing`): the corpus is ruleset-agnostic and the replica is
  //     Phasing-only, so `pack` would refuse them as written.
  const fixtures = tacticalFixtures();
  for (let i = 0; i < fixtures.length; i++) {
    const invader = invaderOf(fixtures[i].state.board);
    if (invader === null) continue;
    compare(asPhasing(fixtures[i].state), invader, i, true, PROOF_NODES);
  }

  // (b) synthesised occupier positions.
  const rng = seededRandom(options.seed >>> 0);
  for (let i = 0; i < options.cases; i++) {
    const invader: PlayerId = rng() < 0.5 ? 'white' : 'black';
    const state = randomOccupierPosition(rng, invader);
    // A third of the cases run at a deliberately small node cap. Two provers
    // that agree with 20,000 nodes in hand can still disagree the moment the
    // cap bites, because then the answer depends on the ORDER in which they
    // spend nodes and on which nodes their transposition sets fold together
    // (DESIGN §5.9: exhaustion is UNKNOWN, never a win). Squeezing the budget
    // is the only way to make that regime common enough to test.
    const maxNodes = rng() < 0.34 ? 1 + ((rng() * 48) | 0) : PROOF_NODES;
    compare(state, invader, i, false, maxNodes);
  }

  // (c) the SU §8.1 clock fixture.
  metrics.clockFixtureOk = clockFixture();

  writeRepros(options.reproDir, 'prover-divergence', divergences);
  metrics.elapsedMs = Date.now() - started;
  return metrics;
}

// --- the gate-preservation surface -------------------------------------------

export interface GatePreservationOptions {
  seed: number;
  /** Actions to apply across all games (DESIGN §5.9 (c): 100,000). */
  actions: number;
  /** Plies per game before the game is abandoned. */
  plies: number;
  reproDir: string | null;
  /**
   * TEST SEAM (see `FuzzOptions.replica`): the `Replica` the walk drives, a
   * fresh one when omitted. `tests/lab/fuzz-fault-injection.test.ts` passes a
   * subclass whose `make` corrupts the adjudicated `result`/`reason`, and
   * asserts `mismatches` moves — i.e. that this surface can fail at all.
   */
  replica?: Replica;
}

export interface GatePreservationMetrics {
  seed: number;
  actions: number;
  games: number;
  /** Actions after which the replica's `result`/`reason` differed from canonical. */
  mismatches: number;
  /** Actions on which `needsProof` held, i.e. the gate let a proof through. */
  proofsCompared: number;
  /** Actions on which a corner was occupied but `needsProof` suppressed the proof. */
  proofsSuppressed: number;
  /** Games decided by `home-checkmate`. */
  homeCheckmates: number;
  /**
   * THE INCREMENTAL PROVER COMPARISON (round 6). This walk is the only one that
   * holds a replica state built entirely by `make` over a real invasion-biased
   * game, so it is where an ordering defect that only a cap-truncated search can
   * see is most likely to show. `compareIncrementalProver` compares verdict AND
   * node count against canonical at tight caps and at `PROOF_NODES`, with a fresh
   * pack as the control, and records the node-count distribution behind the
   * key-soundness argument (M2-STATUS §2.6).
   */
  incrementalProverCases: number;
  incrementalProverVerdictMismatches: number;
  incrementalProverNodeMismatches: number;
  freshPackProverMismatches: number;
  incrementalProverCapHits: number;
  /** Gate proofs inside `make` that ended at `PROOF_NODES`. Expected 0. */
  gateProverCapHits: number;
  proverPositions: number;
  proverMaxNodes: number;
  proverNodeBuckets: Record<string, number>;
  /** Comparisons whose position has slot order != canonical order. Coverage. */
  proverOrderPermuted: number;
  /** §2.6.5: positions re-proved with the birth sequence reversed, and violations. */
  proverOrderInvarianceCases: number;
  proverOrderInvarianceViolations: number;
  terminals: Record<string, number>;
  elapsedMs: number;
}

interface GateDivergence {
  seed: number;
  game: number;
  ply: number;
  action: AIAction;
  replica: string;
  canonical: string;
  prefix: AIAction[];
  state: GameState;
}

/** Per-action buffer: 4 attacks + 100 destinations per slot, plus the phase-ender. */
const GEN_CAPACITY = 4 + MAX_SLOTS * 104;

const REASON_NAME: readonly string[] = [
  'none',
  'elimination',
  'upkeep-elimination',
  'home-occupation',
  'home-checkmate',
  'inactivity',
  'resignation',
];

function replicaOutcome(p: PackedState): string {
  const result = p.result === Result.ONGOING ? 'ongoing' : p.result === Result.WHITE_WIN ? 'white' : p.result === Result.BLACK_WIN ? 'black' : 'draw';
  return `${result}:${REASON_NAME[p.reason] ?? String(p.reason)}`;
}

function canonicalOutcome(state: GameState): string {
  if (state.phase !== 'victory') return 'ongoing:none';
  const result = state.winner === 'white' ? 'white' : state.winner === 'black' ? 'black' : 'draw';
  return `${result}:${state.victoryReason ?? 'none'}`;
}

const KIND_WEIGHT = new Int32Array(8);
KIND_WEIGHT[AKind.END_PLACE] = 2;
KIND_WEIGHT[AKind.MOVE] = 8;
KIND_WEIGHT[AKind.ATTACK] = 18;
KIND_WEIGHT[AKind.BUY] = 8;
KIND_WEIGHT[AKind.PROMOTE] = 6;
KIND_WEIGHT[AKind.END_ACTION] = 3;
KIND_WEIGHT[AKind.PAY_UPKEEP] = 1;
KIND_WEIGHT[AKind.RESIGN] = 0;

const KIND_COUNT = new Int32Array(8);

/**
 * Kind-weighted choice with an invasion bias: with probability `homeBias` the
 * mover plays the MOVE that gets closest to the enemy corner. Uniform play
 * almost never produces a home occupation, and a gate-preservation run that
 * never occupies a corner proves nothing — `proofsCompared` is the metric that
 * says the run actually exercised the gate.
 */
function pickAction(rng: () => number, buffer: Int32Array, count: number, p: PackedState, homeBias: number): PA {
  if (rng() < homeBias) {
    const target = CORNER[1 - p.side];
    const tx = target % 10;
    const ty = (target / 10) | 0;
    let best = -1;
    let bestDist = 1e9;
    for (let i = 0; i < count; i++) {
      if (paKind(buffer[i]) !== AKind.MOVE) continue;
      const to = (buffer[i] >>> 10) & 0x7f;
      const d = Math.abs((to % 10) - tx) + Math.abs(((to / 10) | 0) - ty);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    if (best >= 0) return buffer[best];
  }
  KIND_COUNT.fill(0);
  for (let i = 0; i < count; i++) KIND_COUNT[paKind(buffer[i])]++;
  let total = 0;
  for (let k = 0; k < 8; k++) if (KIND_COUNT[k] > 0) total += KIND_WEIGHT[k];
  if (total === 0) return buffer[(rng() * count) | 0];
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
  if (picked < 0) return buffer[(rng() * count) | 0];
  let nth = (rng() * KIND_COUNT[picked]) | 0;
  for (let i = 0; i < count; i++) {
    if (paKind(buffer[i]) !== picked) continue;
    if (nth === 0) return buffer[i];
    nth--;
  }
  return buffer[count - 1];
}

/** `getHomeOccupier` for either side on the packed board (victory.ts:103-106). */
function cornerOccupied(p: PackedState): boolean {
  const white = p.pieceAt[CORNER[1]];
  if (white !== NO_SLOT && p.owner[white] === 0) return true;
  const black = p.pieceAt[CORNER[0]];
  return black !== NO_SLOT && p.owner[black] === 1;
}

export function runGatePreservation(options: GatePreservationOptions): GatePreservationMetrics {
  const started = Date.now();
  const replica = options.replica ?? new Replica();
  const undo = newUndo();
  const keep = newKeepSetTable();
  const genBuffer = new Int32Array(GEN_CAPACITY);
  const divergences: GateDivergence[] = [];
  const proverFresh = allocState();
  const proverScratch = new Scratch(1, 0, 0, 1);
  const proverOrder = newProverOrderCounters();
  const cappedBefore = replica.cappedProverCalls;

  const metrics: GatePreservationMetrics = {
    seed: options.seed,
    actions: 0,
    games: 0,
    mismatches: 0,
    proofsCompared: 0,
    proofsSuppressed: 0,
    homeCheckmates: 0,
    incrementalProverCases: 0,
    incrementalProverVerdictMismatches: 0,
    incrementalProverNodeMismatches: 0,
    freshPackProverMismatches: 0,
    incrementalProverCapHits: 0,
    gateProverCapHits: 0,
    proverPositions: 0,
    proverMaxNodes: 0,
    proverNodeBuckets: {},
    proverOrderPermuted: 0,
    proverOrderInvarianceCases: 0,
    proverOrderInvarianceViolations: 0,
    terminals: {},
    elapsedMs: 0,
  };

  let game = 0;
  // Same guard as the transition walk: a mismatch abandons the game before the
  // action counter moves, so a systematic one would start games forever.
  while (metrics.actions < options.actions && divergences.length < 16) {
    const rng = seededRandom((options.seed + game * 7919) >>> 0);
    const handicap = rng() < 0.5 ? 3 : 0;
    // `victoryRule: 'elimination'` switches the gate OFF entirely
    // (`victoryHome = 0`), which is itself a case the proof must cover.
    const victoryRule = rng() < 0.2 ? 'elimination' : 'home-or-elimination';
    const homeBias = 0.25 + rng() * 0.5;
    let state: GameState = {
      ...createInitialGameState(undefined, 4, handicap, 'phasing'),
      victoryRule,
      inactivityRule: rng() < 0.25 ? 'off' : 'on',
      reviewUpkeep: { white: rng() < 0.25, black: rng() < 0.25 },
    };
    let p = replica.pack(state, allocState());
    const prefix: AIAction[] = [];

    for (let ply = 0; ply < options.plies && metrics.actions < options.actions; ply++) {
      if (state.phase !== 'playing') break;

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

      const chosen = pickAction(rng, genBuffer, count, p, homeBias);
      const action = toAIAction(p, chosen, keep);
      if (!isLegalAction(state, action)) break;

      const next = applyAction(state, action);
      undo.top = 0;
      replica.resetUndoScratch();
      replica.make(p, chosen, undo, keep);

      // A Phasing BUY places nothing, so the ids that need adopting appear at an
      // ARRIVAL (the hand-off), not at the purchase: teach the replica whatever
      // canonical named this ply, whichever action produced it.
      if (next.board.units.length > 0) {
        const known = new Set(state.board.units.map(x => x.id));
        for (const fresh of next.board.units) {
          if (known.has(fresh.id)) continue;
          const slot = p.pieceAt[fresh.position.y * 10 + fresh.position.x];
          if (slot !== NO_SLOT) p.originIds[slot] = fresh.id;
        }
      }

      // The gate fires on the state `make` produced, which is the state
      // `resolveHomeCheckmate` adjudicates (simulate.ts:33).
      if (needsProof(p)) metrics.proofsCompared++;
      else if (cornerOccupied(p) && p.result === Result.ONGOING) metrics.proofsSuppressed++;

      // The INCREMENTAL prover comparison, on the state `make` just produced.
      const proverField = compareIncrementalProver(replica, p, next, proverFresh, proverScratch, PROVER_ORDER_CAPS, proverOrder);
      if (proverField !== null) {
        metrics.mismatches++;
        if (divergences.length < 16) {
          divergences.push({ seed: options.seed, game, ply, action, replica: proverField, canonical: 'canonical prover (see replica field)', prefix: [...prefix], state: next });
        }
        break;
      }

      const mine = replicaOutcome(p);
      const theirs = canonicalOutcome(next);
      if (mine !== theirs) {
        metrics.mismatches++;
        if (divergences.length < 16) {
          divergences.push({ seed: options.seed, game, ply, action, replica: mine, canonical: theirs, prefix: [...prefix], state: next });
        }
        break;
      }

      metrics.actions++;
      prefix.push(action);
      if (prefix.length > 600) prefix.shift();
      state = next;
    }

    const terminal = state.phase === 'victory' ? `${state.victoryReason ?? 'unknown'}:${state.winner ?? 'draw'}` : 'unfinished';
    metrics.terminals[terminal] = (metrics.terminals[terminal] ?? 0) + 1;
    if (state.victoryReason === 'home-checkmate') metrics.homeCheckmates++;
    metrics.games++;
    game++;
  }

  metrics.incrementalProverCases = proverOrder.cases;
  metrics.incrementalProverVerdictMismatches = proverOrder.verdictMismatches;
  metrics.incrementalProverNodeMismatches = proverOrder.nodeMismatches;
  metrics.freshPackProverMismatches = proverOrder.freshPackMismatches;
  metrics.incrementalProverCapHits = proverOrder.capHits;
  metrics.gateProverCapHits = replica.cappedProverCalls - cappedBefore;
  metrics.proverPositions = proverOrder.positions;
  metrics.proverMaxNodes = proverOrder.maxNodes;
  metrics.proverNodeBuckets = proverOrder.nodeBuckets;
  metrics.proverOrderPermuted = proverOrder.orderPermuted;
  metrics.proverOrderInvarianceCases = proverOrder.orderInvarianceCases;
  metrics.proverOrderInvarianceViolations = proverOrder.orderInvarianceViolations;
  writeRepros(options.reproDir, 'gate-divergence', divergences);
  metrics.elapsedMs = Date.now() - started;
  return metrics;
}
