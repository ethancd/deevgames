// @vitest-environment node
/**
 * Declaration tests for the DESIGN §4 interfaces (M4). Every signature DESIGN
 * §3.1-§3.3 and §4.1-§4.3/§4.17 freezes is reproduced here as a typed
 * assignment, so changing an exported shape fails `tsc` rather than silently
 * drifting; the module-level `@ts-expect-error until M<n>` imports at the
 * bottom do the same for the modules not yet built — when the milestone that
 * builds one lands, the suppression becomes unused and `tsc` fails until that
 * milestone replaces it with real declaration tests.
 *
 * `npm run hard:types` (`lab/hard-ai/tsconfig.json`) is what typechecks this
 * file; `npx tsc --noEmit -p tsconfig.json` covers `src` only. See
 * `docs/hard-ai/design/DEVIATIONS.md` under M4.
 */
import { describe, expect, it } from 'vitest';

import {
  CC,
  DEAD,
  DRAW_CC,
  F_CAN_ACT,
  F_LAST_KILLED,
  F_PLACED,
  F_PROMOTED,
  MATE_PLY_CC,
  MAX_SLOTS,
  MAX_TURN_ACTIONS,
  NO_SLOT,
  Reason,
  Result,
  WIN_CC,
  type Centi,
  type DefId,
  type Key,
  type PackedState,
  type Side,
  type Slot,
  type Square,
} from '../../../src/ai/hard/types';

import {
  Scratch,
  bbAnd,
  bbAndNot,
  bbClear,
  bbCopy,
  bbCount,
  bbDilate,
  bbEquals,
  bbFirst,
  bbHas,
  bbIntersects,
  bbIsEmpty,
  bbNew,
  bbNext,
  bbOr,
  bbReserveSum,
  bbRing,
  bbSet,
  bbXor,
  bbZero,
  type BB,
} from '../../../src/ai/hard/core/bits';

import {
  ADJ,
  ADJ_COUNT,
  ADJ_LIST,
  BLACK,
  BOARD,
  CORNER,
  CORNER_NEIGHBOURS,
  CORRIDOR,
  MANHATTAN,
  RECT,
  RECT_AREA,
  SQ_X,
  SQ_Y,
  WHITE,
  dist2Corner,
  rot180,
  sq,
} from '../../../src/ai/hard/core/tables';

import {
  DEF_ID,
  DEF_INDEX,
  NDEF,
  activeCatalog,
  buildCatalog,
  catalogSignature,
  type Catalog,
} from '../../../src/ai/hard/core/catalog';

import {
  Z,
  ZOBRIST_SEED,
  buildZobrist,
  recomputeKpos,
  recomputeKturn,
  recomputeOccHash,
  type ZobristTables,
} from '../../../src/ai/hard/core/zobrist';

import {
  AKind,
  fromAIAction,
  keepSetIds,
  paA,
  paB,
  paC,
  paKind,
  paMake,
  toAIAction,
  type KeepSetTable,
  type PA,
} from '../../../src/ai/hard/core/action';

import {
  DESKTOP,
  LAB,
  MIDRANGE,
  PHONE,
  profileFor,
  type ActionSearchConfig,
  type Book,
  type BookEntry,
  type DeviceProfile,
  type DfpnConfig,
  type GenConfig,
  type HardConfig,
  type PurchaseConfig,
  type PurchaseWeights,
  type QuiesceConfig,
  type SearchConfig,
  type TimeConfig,
  type Weights,
} from '../../../src/ai/hard/config';

import { perftActions, perftMidStates, perftTurns } from '../../../src/ai/hard/verify/perft';
import type { AIAction } from '../../../src/ai/types';
import type { GameState } from '../../../src/game/types';

// --- DESIGN §3.1: types.ts ---------------------------------------------------

const _side: Side = 1;
const _square: Square = 99;
const _defId: DefId = 17;
const _slot: Slot = MAX_SLOTS - 1;
const _centi: Centi = 100;
const _key: Key = { lo: 0, hi: 0 };
const _result: Result = Result.DRAW;
const _reason: Reason = Reason.HOME_CHECKMATE;
/** Pins the PackedState field names and their types. */
const _packedShape: (p: PackedState) => unknown[] = p => [
  p.sq, p.defId, p.owner, p.damage, p.atkCount, p.uflags, p.slotCount, p.pieceAt,
  p.occ, p.occBy, p.occTier, p.reserve, p.initialReserve, p.bank, p.gained,
  p.side, p.phase, p.actions, p.turnNumber, p.upkeepPending, p.clock, p.progress,
  p.handicap, p.victoryHome, p.drawRuleOn, p.reviewUpkeep, p.result, p.reason,
  p.kposLo, p.kposHi, p.kturnLo, p.kturnHi, p.occHash, p.catalogSignature,
  p.materialCc, p.pstSumCc, p.proverMode, p.originIds,
];

// --- DESIGN §4.1: core/bits.ts -----------------------------------------------

const _bbNew: () => BB = bbNew;
const _bbZero: (d: BB) => BB = bbZero;
const _bbCopy: (d: BB, a: BB) => BB = bbCopy;
const _bbSet: (d: BB, s: Square) => BB = bbSet;
const _bbClear: (d: BB, s: Square) => BB = bbClear;
const _bbHas: (a: BB, s: Square) => boolean = bbHas;
const _bbOr: (d: BB, a: BB, b: BB) => BB = bbOr;
const _bbAnd: (d: BB, a: BB, b: BB) => BB = bbAnd;
const _bbAndNot: (d: BB, a: BB, b: BB) => BB = bbAndNot;
const _bbXor: (d: BB, a: BB, b: BB) => BB = bbXor;
const _bbEquals: (a: BB, b: BB) => boolean = bbEquals;
const _bbIsEmpty: (a: BB) => boolean = bbIsEmpty;
const _bbIntersects: (a: BB, b: BB) => boolean = bbIntersects;
const _bbCount: (a: BB) => number = bbCount;
const _bbFirst: (a: BB) => number = bbFirst;
const _bbNext: (a: BB, after: number) => number = bbNext;
const _bbDilate: (d: BB, a: BB) => BB = bbDilate;
const _bbRing: (d: BB, a: BB) => BB = bbRing;
const _bbReserveSum: (a: BB, reserve: Uint8Array) => number = bbReserveSum;
const _scratch: new (maxPly: number, bbPerPly: number, i8PerPly: number) => {
  bb(ply: number, i: number): BB;
  i8(ply: number, i: number): Int8Array;
  i32(ply: number, i: number): Int32Array;
} = Scratch;

// --- DESIGN §4.2: core/tables.ts ---------------------------------------------

const _board: number = BOARD;
const _white: Side = WHITE;
const _black: Side = BLACK;
const _corner: readonly [Square, Square] = CORNER;
const _cornerNeighbours: readonly [readonly [Square, Square], readonly [Square, Square]] = CORNER_NEIGHBOURS;
const _adj: readonly BB[] = ADJ;
const _adjList: Int8Array = ADJ_LIST;
const _adjCount: Uint8Array = ADJ_COUNT;
const _rect: readonly (readonly BB[])[] = RECT;
const _rectArea: readonly Uint8Array[] = RECT_AREA;
const _manhattan: Uint8Array = MANHATTAN;
const _corridor: BB = CORRIDOR;
const _sqX: Uint8Array = SQ_X;
const _sqY: Uint8Array = SQ_Y;
const _sq: (x: number, y: number) => Square = sq;
const _rot180: (s: Square) => Square = rot180;
const _dist2Corner: (side: Side, s: Square) => number = dist2Corner;

// --- DESIGN §4.3: core/catalog.ts --------------------------------------------

const _ndef: number = NDEF;
const _catalogShape: (c: Catalog) => unknown[] = c => [
  c.atk, c.def, c.spd, c.mine, c.tier, c.cost, c.upkeep, c.element, c.nextDef,
  c.promoCost, c.tier1, c.power, c.killsInOne, c.hitsToKill, c.signature,
];
const _buildCatalog: () => Catalog = buildCatalog;
const _catalogSignature: () => number = catalogSignature;
const _activeCatalog: () => Catalog = activeCatalog;
const _defIndex: ReadonlyMap<string, DefId> = DEF_INDEX;
const _defIdList: readonly string[] = DEF_ID;

// --- DESIGN §3.3: core/zobrist.ts --------------------------------------------

const _zobristSeed: number = ZOBRIST_SEED;
const _zobristShape: (z: ZobristTables) => Uint32Array[] = z => [
  z.piece, z.reserve, z.damage, z.atkCount, z.uflags, z.side, z.phase,
  z.actions, z.clock, z.bankLo, z.bankHi, z.upkeep, z.rules, z.handicap,
];
const _buildZobrist: (seed?: number) => ZobristTables = buildZobrist;
const _z: ZobristTables = Z;
const _recomputeKpos: (p: PackedState) => Key = recomputeKpos;
const _recomputeKturn: (p: PackedState) => Key = recomputeKturn;
const _recomputeOccHash: (p: PackedState) => number = recomputeOccHash;

// --- DESIGN §3.2: core/action.ts ---------------------------------------------

const _pa: PA = 0;
const _akind: AKind = AKind.MOVE;
const _paMake: (kind: AKind, a?: number, b?: number, c?: number) => PA = paMake;
const _paKind: (a: PA) => AKind = paKind;
const _paA: (a: PA) => number = paA;
const _paB: (a: PA) => number = paB;
const _paC: (a: PA) => number = paC;
const _toAIAction: (p: PackedState, a: PA, keep: KeepSetTable) => AIAction = toAIAction;
const _fromAIAction: (p: PackedState, a: AIAction, keep: KeepSetTable) => PA = fromAIAction;
const _keepSetShape: (k: KeepSetTable) => [Uint32Array, number] = k => [k.masks, k.count];
const _keepSetIds: (p: PackedState, keep: KeepSetTable, index: number) => string[] = keepSetIds;

// --- DESIGN §4.17: config.ts -------------------------------------------------

const _actionSearchConfig: (c: ActionSearchConfig) => [Int32Array, number, number] = c => [c.widths, c.keep, c.ttBits];
const _purchaseWeights: (w: PurchaseWeights) => number[] = w => [
  w.mineCc, w.safeCc, w.blockCc, w.strikeCc, w.anchorCc, w.zeroSpawnCc, w.liquidityCc, w.homeRaceCc,
];
const _purchaseConfig: (c: PurchaseConfig) => unknown[] = c => [
  c.maxBodies, c.maxMultisets, c.maxPlans, c.squares, c.keepPerMultiset, c.weights,
];
const _genConfig: (c: GenConfig) => unknown[] = c => [c.K, c.maxPlacePlans, c.action, c.purchase, c.maxPromotions, c.reference];
const _dfpnConfig: (c: DfpnConfig) => number[] = c => [c.maxTurns, c.nodeBudget, c.epsilonQ2, c.ttBits];
const _quiesceConfig: (c: QuiesceConfig) => number[] = c => [c.maxPly, c.deltaMarginCc, c.maxCandidates];
const _deviceProfile: (p: DeviceProfile) => number[] = p => [p.unitsPerMs, p.samples];
const _timeConfig: (c: TimeConfig) => number[] = c => [c.minMs, c.maxMs, c.baseMs, c.abortFactor];
const _weights: (w: Weights) => unknown[] = w => [w.w, w.material, w.version, w.label];
const _bookEntry: (e: BookEntry) => number[] = e => [e.keyLo, e.keyHi, e.turnLo, e.turnHi, e.flags, e.score, e.count];
const _book: (b: Book) => unknown[] = b => [b.lookup(0, 0), b.size, b.handicap, b.mapHash, b.weightsVersion];
const _searchConfig: (c: SearchConfig) => unknown[] = c => [
  c.maxDepth, c.aspirationCc, c.lmrRank1, c.lmrRank2, c.futilityMarginCc,
  c.useLmr, c.useAspiration, c.useFutility, c.useExtensions,
  c.quiesce, c.gen, c.genInterior, c.ttBits, c.dfpn, c.useDfpn,
];
const _hardConfig: (c: HardConfig) => unknown[] = c => [
  c.time, c.profile, c.ttBitsMacro, c.ttBitsTurn, c.K, c.kInterior, c.weights, c.book, c.maxDepth,
];
const _desktop: HardConfig = DESKTOP;
const _midrange: HardConfig = MIDRANGE;
const _phone: HardConfig = PHONE;
const _lab: HardConfig = LAB;
const _profileFor: (unitsPerMs: number, deviceMemoryGb: number | undefined) => HardConfig = profileFor;

// --- Modules not yet built: type-only imports the later milestone removes ----
// Each alias reproduces the module DESIGN §4 names; the suppression below it
// goes away (and is replaced by real declaration tests) at that milestone.

// @ts-expect-error until M5: core/state.ts (PackError, Undo, newUndo, allocState, copyState, Replica).
export type M5_State = typeof import('../../../src/ai/hard/core/state');
// @ts-expect-error until M5: core/movement.ts (DistanceCache, createDistanceCache, moveCost, reachMask, bfsFrom).
export type M5_Movement = typeof import('../../../src/ai/hard/core/movement');
// @ts-expect-error until M5: core/spawn.ts (SpawnInfo, spawnInfo, isLegalSpawn, spawnMaskWithout/With, anchorsVoidedBy, blockingSet).
export type M5_Spawn = typeof import('../../../src/ai/hard/core/spawn');
// @ts-expect-error until M5: core/income.ts (GAMMA_Q16, PST_MINE, RENT_PV, projectedIncome, upkeepDue, pstMine, rentCc).
export type M5_Income = typeof import('../../../src/ai/hard/core/income');
// @ts-expect-error until M6: tables/threat.ts (strikeArea, strikeIfBoughtArea, nearestOwner, exposedValueCc).
export type M6_Threat = typeof import('../../../src/ai/hard/tables/threat');
// @ts-expect-error until M6: tables/approach.ts (Approach, ApproachResult, classifyApproach, approachTable).
export type M6_Approach = typeof import('../../../src/ai/hard/tables/approach');
// @ts-expect-error until M6: tables/context.ts (NodeTables, allocTables, buildTables).
export type M6_Context = typeof import('../../../src/ai/hard/tables/context');
// @ts-expect-error until M7: tables/kill.ts (KillOpts, KillPlan, KillEntry, KillTable, minActionsToKill, killTable, cleaveChain).
export type M7_Kill = typeof import('../../../src/ai/hard/tables/kill');
// @ts-expect-error until M8: tables/economy.ts (ECON_HORIZON, ACTION_VALUE_CC, RELOCATION_MAX_ACTIONS, EconResult, economyDP, economyStayInPlace).
export type M8_Economy = typeof import('../../../src/ai/hard/tables/economy');
// @ts-expect-error until M9: tables/geometry.ts (SpawnGeometry, spawnGeometry).
export type M9_Geometry = typeof import('../../../src/ai/hard/tables/geometry');
// @ts-expect-error until M9: tables/home.ts (HomeSafety, homeSafety, minTurnsToCorner, homeRaceAvailable).
export type M9_Home = typeof import('../../../src/ai/hard/tables/home');
// @ts-expect-error until M10: tactics/prover.ts (HomeVerdict, PROOF_NODES, needsProof, damageBound, homeVerdict, homeWitness).
export type M10_Prover = typeof import('../../../src/ai/hard/tactics/prover');
// @ts-expect-error until M11: gen/turn.ts (TurnFlag, Turn, TurnPool, turnSignature, decodeTurn).
export type M11_Turn = typeof import('../../../src/ai/hard/gen/turn');
// @ts-expect-error until M11: gen/actionsearch.ts (ActionSearchConfig, WithinTurnScorer, TurnTT, ActionSearch, isIndependent).
export type M11_ActionSearch = typeof import('../../../src/ai/hard/gen/actionsearch');
// @ts-expect-error until M12: eval/features.ts (FEATURE_COUNT, F, FEATURE_NAMES, STAGE_OF, extract, boundStage2).
export type M12_Features = typeof import('../../../src/ai/hard/eval/features');
// @ts-expect-error until M12: eval/weights.ts (Weights, DEFAULT_WEIGHTS, loadWeights, serializeWeights, weightsHash).
export type M12_Weights = typeof import('../../../src/ai/hard/eval/weights');
// @ts-expect-error until M12: eval/invariants.ts (invariantBits).
export type M12_Invariants = typeof import('../../../src/ai/hard/eval/invariants');
// @ts-expect-error until M12: eval/evaluate.ts (Evaluator, terminalScore).
export type M12_Evaluate = typeof import('../../../src/ai/hard/eval/evaluate');
// @ts-expect-error until M13: gen/purchase.ts (PlacePlan, candidateDefs, purchaseMultisets, planPurchases).
export type M13_Purchase = typeof import('../../../src/ai/hard/gen/purchase');
// @ts-expect-error until M13: gen/promote.ts (Mission, PromoCandidate, planPromotions).
export type M13_Promote = typeof import('../../../src/ai/hard/gen/promote');
// @ts-expect-error until M13: gen/upkeep.ts (genKeepSets).
export type M13_Upkeep = typeof import('../../../src/ai/hard/gen/upkeep');
// @ts-expect-error until M13: gen/generate.ts (GenConfig, GenStats, TurnGenerator).
export type M13_Generate = typeof import('../../../src/ai/hard/gen/generate');
// @ts-expect-error until M14: search/tt.ts (Bound, TTEntry, TranspositionTable, ProofCache, scoreToTT, scoreFromTT).
export type M14_TT = typeof import('../../../src/ai/hard/search/tt');
// @ts-expect-error until M14: search/order.ts (OrderTables, newOrderTables, scoreTurns, onCutoff).
export type M14_Order = typeof import('../../../src/ai/hard/search/order');
// @ts-expect-error until M14: search/quiesce.ts (QuiesceConfig, quiesce, isTacticalTurn).
export type M14_Quiesce = typeof import('../../../src/ai/hard/search/quiesce');
// @ts-expect-error until M14: search/pvs.ts (SearchConfig, HardSearchStats, SearchContext, SearchResult, pvs, iterativeDeepening).
export type M14_Pvs = typeof import('../../../src/ai/hard/search/pvs');
// @ts-expect-error until M14: search/time.ts (WorkClass, WORK_COST, WORK_LADDER, WorkMeter, DeviceProfile, TimeConfig, chooseWork, updateProfile, targetMs).
export type M14_Time = typeof import('../../../src/ai/hard/search/time');
// @ts-expect-error until M14: search/root.ts (RootOptions, RootResult, searchRoot).
export type M14_Root = typeof import('../../../src/ai/hard/search/root');
// @ts-expect-error until M14: verify/replay.ts (ReplayCheck, verifyTurn).
export type M14_Replay = typeof import('../../../src/ai/hard/verify/replay');
// @ts-expect-error until M14: engine.ts (HardEngine).
export type M14_Engine = typeof import('../../../src/ai/hard/engine');
// @ts-expect-error until M16: tactics/dfpn.ts (DfpnConfig, Proof, DfpnResult, forceHome).
export type M16_Dfpn = typeof import('../../../src/ai/hard/tactics/dfpn');
// @ts-expect-error until M18: book/format.ts (BookEntry, Book, parseBook, packBook, EMPTY_BOOK).
export type M18_BookFormat = typeof import('../../../src/ai/hard/book/format');
// @ts-expect-error until M18: book/probe.ts (canonicalKey, probeBook).
export type M18_BookProbe = typeof import('../../../src/ai/hard/book/probe');

/** `verify/perft.ts` exists (M1's canonical half); `perftReplica`/`endKeysCanonical` land at M5. */
const _perftActions: (state: GameState, maxActions: number) => number = perftActions;
const _perftTurns: (state: GameState) => number = perftTurns;
const _perftMidStates: (state: GameState) => number = perftMidStates;

describe('DESIGN §4 declaration tests', () => {
  it('every §3.1-§3.3 / §4.1-§4.3 / §4.17 signature is exported with the frozen shape', () => {
    const declared: unknown[] = [
      _side, _square, _defId, _slot, _centi, _key, _result, _reason, _packedShape,
      _bbNew, _bbZero, _bbCopy, _bbSet, _bbClear, _bbHas, _bbOr, _bbAnd, _bbAndNot, _bbXor,
      _bbEquals, _bbIsEmpty, _bbIntersects, _bbCount, _bbFirst, _bbNext, _bbDilate, _bbRing,
      _bbReserveSum, _scratch,
      _board, _white, _black, _corner, _cornerNeighbours, _adj, _adjList, _adjCount, _rect,
      _rectArea, _manhattan, _corridor, _sqX, _sqY, _sq, _rot180, _dist2Corner,
      _ndef, _catalogShape, _buildCatalog, _catalogSignature, _activeCatalog, _defIndex, _defIdList,
      _zobristSeed, _zobristShape, _buildZobrist, _z, _recomputeKpos, _recomputeKturn, _recomputeOccHash,
      _pa, _akind, _paMake, _paKind, _paA, _paB, _paC, _toAIAction, _fromAIAction, _keepSetShape, _keepSetIds,
      _actionSearchConfig, _purchaseWeights, _purchaseConfig, _genConfig, _dfpnConfig, _quiesceConfig,
      _deviceProfile, _timeConfig, _weights, _bookEntry, _book, _searchConfig, _hardConfig,
      _desktop, _midrange, _phone, _lab, _profileFor,
      _perftActions, _perftTurns, _perftMidStates,
    ];
    expect(declared.every(d => d !== undefined && d !== null)).toBe(true);
    expect(declared).toHaveLength(92);
  });

  it('DESIGN §3.1 constants hold their frozen values', () => {
    expect([CC, WIN_CC, MATE_PLY_CC, DRAW_CC]).toEqual([100, 1_000_000, 1_000, 0]);
    expect([MAX_SLOTS, NO_SLOT, DEAD, MAX_TURN_ACTIONS]).toEqual([128, 255, 255, 24]);
    expect([F_CAN_ACT, F_LAST_KILLED, F_PLACED, F_PROMOTED]).toEqual([1, 2, 4, 8]);
    expect(Result).toEqual({ ONGOING: 0, WHITE_WIN: 1, BLACK_WIN: 2, DRAW: 3 });
    expect(Reason).toEqual({
      NONE: 0, ELIMINATION: 1, UPKEEP_ELIMINATION: 2, HOME_OCCUPATION: 3,
      HOME_CHECKMATE: 4, INACTIVITY: 5, RESIGNATION: 6,
    });
    expect(AKind).toEqual({
      END_PLACE: 0, MOVE: 1, ATTACK: 2, BUY: 3, PROMOTE: 4, END_ACTION: 5, PAY_UPKEEP: 6, RESIGN: 7,
    });
    expect([BOARD, NDEF, WHITE, BLACK]).toEqual([100, 18, 0, 1]);
  });
});

describe('config.ts: DESIGN §6.3 profile table and §8 constants', () => {
  const profiles: readonly (readonly [string, HardConfig, number, number, number[], number, number, number, number, number, number, number])[] = [
    ['DESKTOP', DESKTOP, 24, 16, [6, 4, 3, 2], 16, 8, 4, 19, 18, 2000, 6000],
    ['MIDRANGE', MIDRANGE, 16, 12, [5, 3, 2, 2], 12, 6, 3, 18, 17, 1500, 4000],
    ['PHONE', PHONE, 12, 8, [4, 3, 2, 1], 8, 4, 2, 15, 16, 1200, 2500],
    ['LAB', LAB, 24, 16, [6, 4, 3, 2], 16, 8, 4, 19, 18, 2000, 6000],
  ];

  for (const [name, cfg, K, kInterior, widths, root, interior, qply, ttMacro, ttTurn, minMs, maxMs] of profiles) {
    it(`${name} matches DESIGN §6.3`, () => {
      expect([cfg.K, cfg.kInterior]).toEqual([K, kInterior]);
      expect([...cfg.gen.action.widths]).toEqual(widths);
      expect([...cfg.genInterior.action.widths]).toEqual(widths);
      expect([cfg.gen.K, cfg.genInterior.K]).toEqual([K, kInterior]);
      expect([cfg.gen.maxPlacePlans, cfg.genInterior.maxPlacePlans]).toEqual([root, interior]);
      expect(cfg.quiesce.maxPly).toBe(qply);
      expect([cfg.ttBitsMacro, cfg.ttBitsTurn, cfg.ttBits]).toEqual([ttMacro, ttTurn, ttMacro]);
      expect([cfg.time.minMs, cfg.time.maxMs]).toEqual([minMs, maxMs]);
      expect(cfg.time.abortFactor).toBe(3);
      expect(cfg.book).toBeNull();
    });
  }

  it('the DESIGN §8 search constants are shared by every profile', () => {
    for (const [, cfg] of profiles) {
      expect(cfg.maxDepth).toBe(12);
      expect(cfg.aspirationCc).toBe(200);
      expect(cfg.futilityMarginCc).toBe(200);
      expect([cfg.lmrRank1, cfg.lmrRank2]).toEqual([6, 12]);
      expect([cfg.quiesce.deltaMarginCc, cfg.quiesce.maxCandidates]).toEqual([300, 8]);
      expect([cfg.dfpn.maxTurns, cfg.dfpn.epsilonQ2, cfg.dfpn.ttBits]).toEqual([3, 5, 17]);
      expect([cfg.gen.action.keep, cfg.gen.purchase.maxBodies, cfg.gen.purchase.squares, cfg.gen.purchase.keepPerMultiset]).toEqual([4, 4, 8, 3]);
      expect(cfg.weights.w.length).toBe(58);
      expect(cfg.weights.material.length).toBe(NDEF);
    }
  });

  it('every refinement flag ships off until its own milestone gates it (DESIGN §5.11.5)', () => {
    for (const [, cfg] of profiles) {
      expect([cfg.useLmr, cfg.useAspiration, cfg.useFutility, cfg.useExtensions, cfg.useDfpn]).toEqual([false, false, false, false, false]);
    }
  });

  it('profileFor picks PHONE / MIDRANGE / DESKTOP on DESIGN §6.3’s triggers', () => {
    expect(profileFor(120, undefined).K).toBe(12);
    expect(profileFor(249, undefined).K).toBe(12);
    expect(profileFor(250, undefined).K).toBe(16);
    expect(profileFor(599, undefined).K).toBe(16);
    expect(profileFor(600, undefined).K).toBe(24);
    expect(profileFor(5000, undefined).K).toBe(24);
    // deviceMemory <= 2 GB forces PHONE no matter how fast the CPU is.
    expect(profileFor(5000, 2).K).toBe(12);
    expect(profileFor(5000, 4).K).toBe(24);
    expect(profileFor(900, undefined).profile).toEqual({ unitsPerMs: 900, samples: 0 });
  });

  it('returns independent objects so callers can mutate a profile safely', () => {
    const a = profileFor(900, undefined);
    const b = profileFor(900, undefined);
    expect(a).not.toBe(b);
    expect(a.weights.w).not.toBe(b.weights.w);
    a.weights.w[0] = 42;
    expect(b.weights.w[0]).toBe(0);
    expect(DESKTOP.weights.w[0]).toBe(0);
    expect(DESKTOP.gen.action.widths).not.toBe(MIDRANGE.gen.action.widths);
    expect(DESKTOP.gen.purchase.weights).not.toBe(DESKTOP.genInterior.purchase.weights);
  });
});
