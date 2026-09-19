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
import { describe, expect, it, vi } from 'vitest';

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

import { endKeysCanonical, perftActions, perftMidStates, perftReplica, perftTurns } from '../../../src/ai/hard/verify/perft';
import {
  PackError,
  Replica,
  allocState,
  copyState,
  newUndo,
  type Undo,
} from '../../../src/ai/hard/core/state';
import {
  bfsFrom,
  createDistanceCache,
  moveCost,
  reachMask,
  type DistanceCache,
} from '../../../src/ai/hard/core/movement';
import {
  anchorsVoidedBy,
  blockingSet,
  isLegalSpawn,
  spawnInfo,
  spawnMaskWith,
  spawnMaskWithout,
  type SpawnInfo,
} from '../../../src/ai/hard/core/spawn';
import {
  GAMMA_Q16,
  PST_MINE,
  RENT_PV,
  projectedIncome,
  pstMine,
  rentCc,
  upkeepDue,
} from '../../../src/ai/hard/core/income';
import type { AIAction } from '../../../src/ai/types';
import type { GameState } from '../../../src/game/types';
import {
  ACTION_VALUE_CC,
  ECON_HORIZON,
  RELOCATION_MAX_ACTIONS,
  economyDP,
  economyStayInPlace,
  type EconResult,
} from '../../../src/ai/hard/tables/economy';
import {
  allocTables,
  buildTables,
  KILL_NEVER,
  type NodeTables,
} from '../../../src/ai/hard/tables/context';
import {
  F,
  FEATURE_COUNT,
  FEATURE_NAMES,
  INV_BASE,
  STAGE_OF,
  boundStage2,
  extract,
} from '../../../src/ai/hard/eval/features';
import {
  DEFAULT_WEIGHTS,
  WEIGHTS_VERSION,
  cloneWeights,
  loadWeights,
  serializeWeights,
  weightsHash,
} from '../../../src/ai/hard/eval/weights';
import { TUNED_WEIGHTS } from '../../../src/ai/hard/eval/weights.generated';
import { INVARIANT_COUNT, invariantBits } from '../../../src/ai/hard/eval/invariants';
import { Evaluator, terminalScore, type EvalMeter } from '../../../src/ai/hard/eval/evaluate';
import {
  exposedValueCc,
  nearestOwner,
  strikeArea,
  strikeIfBoughtArea,
} from '../../../src/ai/hard/tables/threat';
import {
  KILL_IMPOSSIBLE,
  KILL_MAX_LANES,
  KILL_NO_ATTACKER,
  cleaveChain,
  cleavePlan,
  killTable,
  minActionsToKill,
  newCleavePlan,
  newKillPlan,
  newKillTable,
  type KillEntry,
  type KillOpts,
  type KillPlan,
  type KillTable,
} from '../../../src/ai/hard/tables/kill';
import {
  TACTICAL_FLAGS,
  TurnFlag,
  TurnPool,
  decodeTurn,
  turnSignature,
  type Turn,
} from '../../../src/ai/hard/gen/turn';
import {
  ActionSearch,
  TurnTT,
  UNLIMITED_WORK,
  isIndependent,
  type ActionSearchTables,
  type WithinTurnScorer,
  type WorkSink,
} from '../../../src/ai/hard/gen/actionsearch';
import {
  candidateDefs,
  newPlacePlan,
  planPurchases,
  purchaseMultisets,
  type PlacePlan,
} from '../../../src/ai/hard/gen/purchase';
import {
  Mission,
  newPromoCandidate,
  planPromotions,
  type PromoCandidate,
} from '../../../src/ai/hard/gen/promote';
import { genKeepSets } from '../../../src/ai/hard/gen/upkeep';
import {
  TurnGenerator,
  newGenStats,
  type GenStats,
  type RescueWitness,
} from '../../../src/ai/hard/gen/generate';
import { newSpawnGeometry, spawnGeometry, type SpawnGeometry } from '../../../src/ai/hard/tables/geometry';
import {
  HOME_NEVER,
  HOME_RACE_LINE_LEN,
  homeRaceAvailable,
  homeSafety,
  minTurnsToCorner,
  newHomeSafety,
  type HomeSafety,
} from '../../../src/ai/hard/tables/home';
import {
  Approach,
  approachTable,
  classifyApproach,
  type ApproachResult,
} from '../../../src/ai/hard/tables/approach';

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

// --- DESIGN §4.14 (dfpn), §4.16 (search/*), §4.17 (book/*, verify/replay,
// --- engine.ts): the M14 half. `tactics/dfpn.ts` and `book/probe.ts` carry
// --- M14 stubs whose BODIES M16/M18 replace; their signatures are frozen here.

const _bound: readonly [number, number, number] = [Bound.EXACT, Bound.LOWER, Bound.UPPER];
const _ttEntry: (e: TTEntry) => number[] = e => [e.keyHi, e.scoreCc, e.depth, e.bound, e.bestEndLo, e.age];
const _tt: (t: TranspositionTable) => unknown[] = t => [
  t.probe(0, 0, {} as TTEntry),
  t.store(0, 0, 0, 0, 0, 0, 0),
  t.newSearch(),
  t.clear(),
  t.hits,
  t.probes,
];
const _newTT: (bits: number) => TranspositionTable = bits => new TranspositionTable(bits);
const _proofCache: (c: ProofCache) => unknown[] = c => [c.get(0, 0), c.put(0, 0, 0)];
const _newProofCache: (bits: number) => ProofCache = bits => new ProofCache(bits);
const _scoreToTT: (score: Centi, ply: number) => Centi = scoreToTT;
const _scoreFromTT: (score: Centi, ply: number) => Centi = scoreFromTT;

const _orderTables: (o: OrderTables) => Int32Array[] = o => [o.killers, o.counter, o.histMove, o.histBuy];
const _newOrderTables: (maxPly: number) => OrderTables = newOrderTables;
const _scoreTurns: (
  p: PackedState,
  t: NodeTables,
  turns: Turn[],
  n: number,
  tt: TTEntry | null,
  ord: OrderTables,
  ply: number,
  prevSig: number,
  s: SearchContext,
) => void = scoreTurns;
const _onCutoff: (ord: OrderTables, t: Turn, ply: number, prevSig: number, depth: number) => void = onCutoff;

const _quiesceCfg: (c: QuiesceConfig) => number[] = c => [c.maxPly, c.deltaMarginCc, c.maxCandidates];
const _quiesce: (s: SearchContext, p: PackedState, alpha: Centi, beta: Centi, ply: number, qply: number) => Centi =
  quiesce;
const _isTacticalTurn: (p: PackedState, t: Turn) => boolean = isTacticalTurn;

const _searchStats: (s: HardSearchStats) => unknown[] = s => [
  s.nodes, s.qnodes, s.turnNodes, s.evals, s.ttHits, s.ttProbes, s.depth, s.seldepth,
  s.byClass, s.proverCalls, s.economyProverCalls, s.economyCappedProverCalls,
  s.preparationEconomyProverCalls, s.preparationEconomyCappedProverCalls, s.dfpnCalls, s.catalogRebuilds, s.replicaDivergences, s.work,
  s.elapsedMs, s.stopReason,
];
const _searchContext: (s: SearchContext) => unknown[] = s => [
  s.rep, s.cat, s.gen, s.tt, s.proof, s.ord, s.eval, s.meter, s.cfg, s.root, s.sc,
  s.tables, s.keep, s.undo, s.pool, s.stats, s.stop(),
];
const _searchResult: (r: SearchResult) => unknown[] = r => [r.best, r.scoreCc, r.depth, r.pv, r.stats];
const _pvs: (
  s: SearchContext,
  p: PackedState,
  depth: number,
  alpha: Centi,
  beta: Centi,
  ply: number,
  prevSig: number,
) => Centi = pvs;
const _iterativeDeepening: (s: SearchContext, p: PackedState, onDepth?: (r: SearchResult) => void) => SearchResult =
  iterativeDeepening;

const _workClass: number[] = [
  WorkClass.MACRO, WorkClass.QUIESCE, WorkClass.TURN, WorkClass.GEN, WorkClass.KILLTABLE,
  WorkClass.DFPN, WorkClass.EVAL1, WorkClass.EVAL2, WorkClass.PROVER,
];
const _workCost: readonly number[] = WORK_COST;
const _workLadder: readonly number[] = WORK_LADDER;
const _workMeter: (m: WorkMeter) => unknown[] = m => [m.spend(0), m.spend(0, 2), m.exhausted(), m.used, m.limit, m.byClass];
const _newWorkMeter: (limit: number) => WorkMeter = limit => new WorkMeter(limit);
const _chooseWork: (profile: DeviceProfile, targetMsValue: number) => number = chooseWork;
const _updateProfile: (profile: DeviceProfile, work: number, elapsedMs: number) => DeviceProfile = updateProfile;
const _targetMs: (p: PackedState, t: NodeTables, cfg: TimeConfig, bookHit: boolean, candidates: number) => number =
  targetMs;

const _rootOptions: (o: RootOptions) => unknown[] = o => [o.work, o.config, o.canonical, o.onProgress];
const _rootResult: (r: RootResult) => unknown[] = r => [
  r.actions, r.scoreCc, r.depth, r.work, r.stats, r.source, r.endKey, r.fallback,
];
const _searchRoot: (engine: HardEngine, state: GameState, opts: RootOptions) => RootResult = searchRoot;

const _dfpnConfigM16: (c: DfpnConfig) => number[] = c => [c.maxTurns, c.nodeBudget, c.epsilonQ2, c.ttBits];
const _dfpnProof: number[] = [DfpnProof.UNKNOWN, DfpnProof.PROVEN, DfpnProof.DISPROVEN];
const _dfpnResult: (r: DfpnResult) => unknown[] = r => [r.proof, r.turn, r.nodes, r.depth];
const _forceHome: (s: SearchContext, p: PackedState, side: Side, cfg: DfpnConfig, out: DfpnResult) => DfpnResult =
  forceHome;

const _bookEntryM18: (e: BookEntry) => number[] = e => [e.keyLo, e.keyHi, e.turnLo, e.turnHi, e.flags, e.score, e.count];
const _parseBook: (bytes: ArrayBuffer) => Book = parseBook;
const _packBook: (entries: BookEntry[], meta: { handicap: number; mapHash: number; weightsVersion: number; weightsKey: string; mapKey: string; rulesKey: string }) => Uint8Array =
  packBook;
const _emptyBook: Book = EMPTY_BOOK;
const _canonicalKey: (p: PackedState) => { lo: number; hi: number; negated: boolean } = canonicalKey;
const _probeBook: (book: Book, p: PackedState, turns: Turn[], n: number) => number = probeBook;

const _replayCheck: (c: ReplayCheck) => unknown[] = c => [c.actions, c.verified, c.divergedAt, c.reason, c.endState];
const _verifyTurn: (rep: Replica, state: GameState, p: PackedState, t: Turn, keep: KeepSetTable) => ReplayCheck =
  verifyTurn;

const _hardEngine: (e: HardEngine) => unknown[] = e => [
  e.setSeed(0),
  e.setWeights({} as Weights),
  e.setBook(null),
  e.searchTurn({} as GameState),
  e.searchTurn({} as GameState, { work: 1 }),
  e.findBestAction({} as GameState),
  e.findBestAction({} as GameState, 1),
  e.calibrate(),
  e.profile,
  e.config,
];
const _newHardEngine: (cfg?: Partial<HardConfig>) => HardEngine = cfg => new HardEngine(cfg);

import { Bound, ProofCache, TranspositionTable, scoreFromTT, scoreToTT, type TTEntry } from '../../../src/ai/hard/search/tt';
import { newOrderTables, onCutoff, scoreTurns, type OrderTables } from '../../../src/ai/hard/search/order';
import { isTacticalTurn, quiesce } from '../../../src/ai/hard/search/quiesce';
import {
  iterativeDeepening,
  pvs,
  type HardSearchStats,
  type SearchContext,
  type SearchResult,
} from '../../../src/ai/hard/search/pvs';
import {
  WORK_COST,
  WORK_LADDER,
  WorkClass,
  WorkMeter,
  chooseWork,
  targetMs,
  updateProfile,
} from '../../../src/ai/hard/search/time';
import { searchRoot, type RootOptions, type RootResult } from '../../../src/ai/hard/search/root';
import {
  Proof as DfpnProof,
  forceHome,
  type DfpnResult,
} from '../../../src/ai/hard/tactics/dfpn';
import { EMPTY_BOOK, packBook, parseBook } from '../../../src/ai/hard/book/format';
import { canonicalKey, probeBook } from '../../../src/ai/hard/book/probe';
import { verifyTurn, type ReplayCheck } from '../../../src/ai/hard/verify/replay';
import { HardEngine } from '../../../src/ai/hard/engine';

const _perftActions: (state: GameState, maxActions: number) => number = perftActions;
const _perftTurns: (state: GameState) => number = perftTurns;
const _perftMidStates: (state: GameState) => number = perftMidStates;

// --- DESIGN §4.4-§4.7 + §7.2 replica half: core/{state,movement,spawn,income}, verify/perft (M5) ---

const _packError: (e: PackError) => string = e => e.message;
const _undo: (u: Undo) => [Int32Array, number] = u => [u.w, u.top];
const _newUndo: () => Undo = newUndo;
const _allocState: () => PackedState = allocState;
const _copyState: (dst: PackedState, src: PackedState) => void = copyState;
const _replica: (r: Replica) => unknown[] = r => [
  r.cat,
  r.pack({} as GameState),
  r.unpack({} as PackedState),
  r.isLegal({} as PackedState, 0),
  r.isLegal({} as PackedState, 0, {} as KeepSetTable),
  r.make({} as PackedState, 0, {} as Undo),
  r.make({} as PackedState, 0, {} as Undo, {} as KeepSetTable),
  r.unmake({} as PackedState, {} as Undo),
  r.genActions({} as PackedState, new Int32Array(1)),
  r.genPlace({} as PackedState, new Int32Array(1)),
  r.genKeepSets({} as PackedState, {} as KeepSetTable),
  r.rehash({} as PackedState),
  r.check({} as PackedState),
  r.digest({} as PackedState),
];
const _newReplica: Replica = new Replica();

const _distanceCache: (d: DistanceCache) => unknown[] = d => [
  d.get({} as PackedState, 0),
  d.multi({} as PackedState, bbNew(), new Int8Array(100)),
  d.invalidate(),
  d.hits,
  d.misses,
];
const _createDistanceCache: (bits?: number) => DistanceCache = createDistanceCache;
const _moveCost: (dist: Int8Array, to: Square, speed: number) => number = moveCost;
const _reachMask: (dist: Int8Array, speed: number, actions: number, out: BB) => BB = reachMask;
const _bfsFrom: (occ: BB, origin: Square, out: Int8Array) => void = bfsFrom;

const _spawnInfoShape: (s: SpawnInfo) => [BB, number, BB, number, number] = s => [
  s.legal,
  s.area,
  s.anchors,
  s.depth,
  s.reserveSum,
];
const _spawnInfo: (p: PackedState, side: Side, out: SpawnInfo) => SpawnInfo = spawnInfo;
const _isLegalSpawn: (p: PackedState, side: Side, s: Square) => boolean = isLegalSpawn;
const _spawnMaskWithout: (p: PackedState, side: Side, slot: Slot, out: BB) => BB = spawnMaskWithout;
const _spawnMaskWith: (p: PackedState, side: Side, extra: Square, out: BB) => BB = spawnMaskWith;
const _anchorsVoidedBy: (p: PackedState, victimSide: Side, s: Square) => number = anchorsVoidedBy;
const _blockingSet: (p: PackedState, side: Side, candidate: BB | null, cap: number, out: BB) => number = blockingSet;

const _gammaQ16: Int32Array = GAMMA_Q16;
const _pstMineTable: Int32Array = PST_MINE;
const _rentPv: number = RENT_PV;
const _projectedIncome: (p: PackedState, side: Side) => number = projectedIncome;
const _upkeepDue: (p: PackedState, side: Side) => number = upkeepDue;
const _pstMine: (def: DefId, reserve: number) => Centi = pstMine;
const _rentCc: (p: PackedState, side: Side) => Centi = rentCc;

const _perftReplica: (state: GameState, maxActions: number) => { sequences: number; midStates: number; endPositions: number; calls: number } =
  perftReplica;
const _endKeysCanonical: (state: GameState, maxActions?: number) => Set<string> = endKeysCanonical;

import {
  HomeVerdict,
  PROOF_NODES,
  damageBound,
  homeVerdict,
  homeWitness,
  needsProof,
  type ProverMeter,
} from '../../../src/ai/hard/tactics/prover';

// E0.5 timeout budget: slowest test 0.0 s in the 2026-09-15 survey (M2 Max, load ~5, maxWorkers 2); 10 s is this file's explicit ceiling.
vi.setConfig({ testTimeout: 10_000 });

describe('DESIGN §4 declaration tests', () => {
  it('every §4.14 tactics/prover.ts signature is exported with the frozen shape (M10)', () => {
    const _homeVerdictEnum: { RESCUE: 0; MATE: 1; UNKNOWN: 2 } = HomeVerdict;
    const _proofNodes: number = PROOF_NODES;
    const _needsProof: (p: PackedState) => boolean = needsProof;
    const _damageBound: (p: PackedState, invader: Side, sc: Scratch, ply: number) => boolean = damageBound;
    // DESIGN §4.14's last parameter is `meter?: WorkMeter`, which does not
    // exist until M14 and which `tactics` may not import; `ProverMeter` is the
    // structural stand-in the real `WorkMeter` satisfies (DEVIATIONS, M10).
    const _homeVerdict: (p: PackedState, invader: Side, maxNodes: number, sc: Scratch, ply: number, meter?: ProverMeter) => number =
      homeVerdict;
    const _homeWitness: (p: PackedState, invader: Side, maxNodes: number, out: Int32Array) => number = homeWitness;
    const declared: unknown[] = [_homeVerdictEnum, _proofNodes, _needsProof, _damageBound, _homeVerdict, _homeWitness];
    expect(declared.every(d => d !== undefined && d !== null)).toBe(true);
    expect(declared).toHaveLength(6);
  });

  it('every §4.4-§4.7 and §7.2 replica signature is exported with the frozen shape', () => {
    const declared: unknown[] = [
      _packError, _undo, _newUndo, _allocState, _copyState, _replica, _newReplica,
      _distanceCache, _createDistanceCache, _moveCost, _reachMask, _bfsFrom,
      _spawnInfoShape, _spawnInfo, _isLegalSpawn, _spawnMaskWithout, _spawnMaskWith,
      _anchorsVoidedBy, _blockingSet,
      _gammaQ16, _pstMineTable, _rentPv, _projectedIncome, _upkeepDue, _pstMine, _rentCc,
      _perftReplica, _endKeysCanonical,
    ];
    expect(declared.every(d => d !== undefined && d !== null)).toBe(true);
    expect(declared).toHaveLength(28);
  });

  it('every §4.12 tables/geometry.ts, tables/home.ts signature is exported with the frozen shape (M9)', () => {
    const _spawnGeometryShape: (g: SpawnGeometry) => number[] = g => [
      g.area, g.reserveSum, g.anchorDepth, g.fragility, g.blocking,
      g.infiltrationAnchors, g.convertible, g.zeroCliff, g.cornerNeighboursHeld,
    ];
    const _newSpawnGeometry: () => SpawnGeometry = newSpawnGeometry;
    const _spawnGeometry: (p: PackedState, t: NodeTables, side: Side, sc: Scratch, ply: number, out: SpawnGeometry) => SpawnGeometry =
      spawnGeometry;

    const _homeSafetyShape: (h: HomeSafety) => [number, number, 0 | 1, number, 0 | 1, 0 | 1] = h => [
      h.actionsToCorner, h.turnsToCorner, h.buyThreat, h.rescuers, h.plug, h.occupied,
    ];
    const _newHomeSafety: () => HomeSafety = newHomeSafety;
    const _homeSafety: (p: PackedState, t: NodeTables, side: Side, out: HomeSafety) => HomeSafety = homeSafety;
    const _minTurnsToCorner: (p: PackedState, t: NodeTables, attacker: Side) => number = minTurnsToCorner;
    const _homeRaceAvailable: (p: PackedState, t: NodeTables, side: Side, out: Int32Array) => number = homeRaceAvailable;

    const declared: unknown[] = [
      _spawnGeometryShape, _newSpawnGeometry, _spawnGeometry,
      _homeSafetyShape, _newHomeSafety, _homeSafety, _minTurnsToCorner, _homeRaceAvailable,
      HOME_NEVER, HOME_RACE_LINE_LEN,
    ];
    expect(declared.every(d => d !== undefined && d !== null)).toBe(true);
    expect(declared).toHaveLength(10);
    expect(HOME_RACE_LINE_LEN).toBe(3);
  });

  it('every §4.12 tables/economy.ts signature is exported with the frozen shape (M8)', () => {
    const _econResultShape: (e: EconResult) => [Centi, Int16Array, Int16Array, number, Centi, number] = e => [
      e.stream,
      e.income,
      e.upkeep,
      e.turnsToInsolvency,
      e.relocationDebt,
      e.waste,
    ];
    const _economyDP: (p: PackedState, t: NodeTables, side: Side, sc: Scratch, ply: number, out: EconResult) => EconResult = economyDP;
    const _economyStayInPlace: (p: PackedState, side: Side, out: EconResult) => EconResult = economyStayInPlace;
    const declared: unknown[] = [
      ECON_HORIZON, ACTION_VALUE_CC, RELOCATION_MAX_ACTIONS,
      _econResultShape, _economyDP, _economyStayInPlace,
    ];
    expect(declared.every(d => d !== undefined && d !== null)).toBe(true);
    expect(declared).toHaveLength(6);
    expect([ECON_HORIZON, ACTION_VALUE_CC, RELOCATION_MAX_ACTIONS]).toEqual([6, 60, 8]);
  });

  it('every §4.11 tables/kill.ts signature is exported with the frozen shape (M7)', () => {
    const _killOptsShape: (o: KillOpts) => [number, number, boolean, boolean, number] = o => [
      o.actionBudget,
      o.crystalBudget,
      o.allowBuys,
      o.allowPromotes,
      o.maxLanes,
    ];
    const _killPlanShape: (k: KillPlan) => [number, number, Int8Array, Int8Array, Int8Array, 0 | 1] = k => [
      k.actions,
      k.crystals,
      k.attackers,
      k.spawnAt,
      k.lanes,
      k.needsPromo,
    ];
    const _killEntryShape: (e: KillEntry) => [number, number, 0 | 1, 0 | 1, Centi] = e => [
      e.minActions,
      e.minCrystals,
      e.needsBuy,
      e.needsPromo,
      e.valueCc,
    ];
    const _killTableShape: (t: KillTable) => [KillEntry[], BB, number, number] = t => [
      t.entry,
      t.killableNow,
      t.bestValuePerAction,
      t.count,
    ];
    // DESIGN §4.11 types `t` as `NodeTables`; `kill.ts` declares only the
    // structural subset it reads (`KillContext`) so that `context.ts -> kill.ts`
    // stays acyclic. These three assignments are what make the two spellings
    // interchangeable for every caller — see DEVIATIONS under M7.
    const _minActionsToKill: (
      p: PackedState, t: NodeTables, attacker: Side, target: Slot, o: KillOpts, sc: Scratch, ply: number, out: KillPlan,
    ) => boolean = minActionsToKill;
    const _killTable: (
      p: PackedState, t: NodeTables, attacker: Side, o: KillOpts, sc: Scratch, ply: number, out: KillTable,
    ) => KillTable = killTable;
    const _cleaveChain: (p: PackedState, t: NodeTables, enemySlot: Slot, sc: Scratch, ply: number) => Centi = cleaveChain;

    const declared: unknown[] = [
      _killOptsShape, _killPlanShape, _killEntryShape, _killTableShape,
      _minActionsToKill, _killTable, _cleaveChain,
      newKillPlan, newKillTable, newCleavePlan, cleavePlan,
    ];
    expect(declared.every(d => d !== undefined && d !== null)).toBe(true);
    expect(declared).toHaveLength(11);
    expect([KILL_IMPOSSIBLE, KILL_MAX_LANES, KILL_NO_ATTACKER]).toEqual([255, 4, -128]);
  });

  it('every §4.13 gen/turn.ts, gen/actionsearch.ts signature is exported with the frozen shape (M11)', () => {
    const _turnShape: (t: Turn) => [Int32Array, number, number, number, number, number, Centi, number, Centi] = t => [
      t.actions, t.count, t.endLo, t.endHi, t.sig, t.flags, t.gainCc, t.place, t.hangCc,
    ];
    const _turnPool: (capacity: number) => TurnPool = capacity => new TurnPool(capacity);
    const _poolShape: (p: TurnPool) => [() => void, () => Turn, number] = p => [
      () => p.reset(), () => p.alloc(), p.used,
    ];
    const _turnSignature: (p: PackedState, t: Turn) => number = turnSignature;
    const _decodeTurn: (p: PackedState, t: Turn, keep: KeepSetTable) => AIAction[] = decodeTurn;

    const _actionSearchTables: (t: ActionSearchTables) => [readonly [BB, BB], Int8Array] = t => [t.exposure, t.killActions];
    const _scorer: WithinTurnScorer = (p, sc, ply) => p.materialCc[p.side] + sc.bbPerPly + ply;
    const _turnTT: (bits: number) => TurnTT = bits => new TurnTT(bits);
    const _ttShape: (t: TurnTT) => [boolean, void, void] = t => [t.probe(0, 0, 0), t.store(0, 0, 0), t.bump()];
    // DESIGN §4.13 types the meter as `search/time.ts WorkMeter`, which M14
    // builds; `gen` may not import `search` (§2), so the parameter is the
    // structural `WorkSink` the module actually calls. See DEVIATIONS under M11.
    const _run: (
      s: ActionSearch,
      p: PackedState, t: ActionSearchTables, prefix: Int32Array, prefixLen: number, placeIndex: number,
      score: WithinTurnScorer, meter: WorkSink, ply: number, out: Turn[],
    ) => number = (s, p, t, prefix, prefixLen, placeIndex, score, meter, ply, out) =>
      s.run(p, t, prefix, prefixLen, placeIndex, score, meter, ply, out);
    const _enumerateAll: (
      s: ActionSearch, p: PackedState, prefix: Int32Array, prefixLen: number, onEnd: (lo: number, hi: number) => void,
    ) => number = (s, p, prefix, prefixLen, onEnd) => s.enumerateAll(p, prefix, prefixLen, onEnd);
    const _isIndependent: (p: PackedState, dist: DistanceCache, prev: PA, prevBallLo: BB, cur: PA) => boolean = isIndependent;

    const declared: unknown[] = [
      _turnShape, _turnPool, _poolShape, _turnSignature, _decodeTurn,
      _actionSearchTables, _scorer, _turnTT, _ttShape, _run, _enumerateAll, _isIndependent,
      UNLIMITED_WORK,
    ];
    expect(declared.every(d => d !== undefined && d !== null)).toBe(true);
    expect(declared).toHaveLength(13);
    // Phasing M4 flags and the tactical subset quiescence reads.
    expect([
      TurnFlag.KILL, TurnFlag.CLEAVE_CHAIN, TurnFlag.HOME_ENTRY, TurnFlag.HOME_RESCUE, TurnFlag.SPAWN_DENY,
      TurnFlag.PURCHASE, TurnFlag.PROMOTION, TurnFlag.RETREAT, TurnFlag.QUIET, TurnFlag.FORCED,
      TurnFlag.BOOK, TurnFlag.HOME_RACE, TurnFlag.HOME_FORTIFY, TurnFlag.DISRUPT,
    ]).toEqual([1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192]);
    expect(TACTICAL_FLAGS).toBe(
      TurnFlag.KILL | TurnFlag.CLEAVE_CHAIN | TurnFlag.HOME_ENTRY | TurnFlag.HOME_RESCUE |
        TurnFlag.HOME_FORTIFY,
    );
    expect(TACTICAL_FLAGS & TurnFlag.DISRUPT).toBe(0); // Refunds are not captures.
    // A Phasing home race is a delayed commitment, not a tactic (gen/turn.ts).
    expect(TACTICAL_FLAGS & TurnFlag.HOME_RACE).toBe(0);
  });

  it('every §4.13 gen/purchase.ts, gen/promote.ts, gen/upkeep.ts, gen/generate.ts signature is exported with the frozen shape (M13)', () => {
    const _placePlan: (plan: PlacePlan) => [Int32Array, number, number, Centi, number, number] = plan => [
      plan.actions, plan.count, plan.spend, plan.scoreCc, plan.flags, plan.spawnAfter,
    ];
    const _newPlacePlan: () => PlacePlan = newPlacePlan;
    const _candidateDefs: (p: PackedState, t: NodeTables, side: Side, out: Uint8Array) => number = candidateDefs;
    const _purchaseMultisets: (defs: Uint8Array, n: number, bank: number, maxBodies: number, out: Int32Array) => number =
      purchaseMultisets;
    const _planPurchases: (
      p: PackedState, t: NodeTables, cfg: PurchaseConfig, sc: Scratch, ply: number, out: PlacePlan[],
    ) => number = planPurchases;

    const _promoCandidate: (c: PromoCandidate) => [Slot, number, number, Centi] = c => [
      c.slot, c.mission, c.cost, c.scoreCc,
    ];
    const _newPromoCandidate: () => PromoCandidate = newPromoCandidate;
    const _planPromotions: (p: PackedState, t: NodeTables, max: number, out: PromoCandidate[]) => number = planPromotions;

    const _genKeepSets: (p: PackedState, t: NodeTables, out: KeepSetTable) => number = genKeepSets;

    const _genStats: (s: GenStats) => [number, number, number, number, number] = s => [
      s.placePlans, s.rawLines, s.dedupedTo, s.nodes, s.injected,
    ];
    const _newGenStats: () => GenStats = newGenStats;
    const _generator: (rep: Replica, cfg: GenConfig, pool: TurnPool, sc: Scratch) => TurnGenerator =
      (rep, cfg, pool, sc) => new TurnGenerator(rep, cfg, pool, sc);
    const _generate: (
      g: TurnGenerator,
      p: PackedState, t: NodeTables, score: WithinTurnScorer, meter: WorkSink, ply: number,
      keep: KeepSetTable, out: Turn[], stats: GenStats,
    ) => number = (g, p, t, score, meter, ply, keep, out, stats) => g.generate(p, t, score, meter, ply, keep, out, stats);
    const _generateReference: (
      g: TurnGenerator, p: PackedState, t: NodeTables, score: WithinTurnScorer, ply: number,
      keep: KeepSetTable, out: Turn[],
    ) => number = (g, p, t, score, ply, keep, out) => g.generateReference(p, t, score, ply, keep, out);
    // DESIGN §5.6 injection 4 reads `tactics/prover.ts homeWitness`, which `gen`
    // may not import (§2 layering); the witness is installed structurally
    // instead. See DEVIATIONS under M13.
    const _setRescueWitness: (g: TurnGenerator, w: RescueWitness | null) => void = (g, w) => g.setRescueWitness(w);

    const declared: unknown[] = [
      _placePlan, _newPlacePlan, _candidateDefs, _purchaseMultisets, _planPurchases,
      _promoCandidate, _newPromoCandidate, _planPromotions,
      _genKeepSets,
      _genStats, _newGenStats, _generator, _generate, _generateReference, _setRescueWitness,
    ];
    expect(declared.every(d => d !== undefined && d !== null)).toBe(true);
    expect(declared).toHaveLength(15);
    // Prepare fortification replaces the old immediate-attack promotion mission.
    expect([Mission.FORTIFY, Mission.SURVIVE, Mission.INCOME, Mission.REACH, Mission.ANCHOR]).toEqual([0, 1, 2, 3, 4]);
  });

  it('every §4.8-§4.10 tables signature is exported with the frozen shape (M6)', () => {
    /** Pins the `NodeTables` field names and their types (DESIGN §4.8). */
    const _nodeTablesShape: (t: NodeTables) => unknown[] = t => [
      t.keyLo, t.keyHi, t.level, t.side,
      t.dist, t.strike, t.strikeIfBought, t.exposure, t.spawn, t.cornerDist, t.home, t.geom,
      t.killActions, t.killCrystals, t.killNeedsBuy, t.killNow, t.approach, t.retreats, t.chain, t.econ,
    ];
    const _allocTables: () => NodeTables = allocTables;
    const _buildTables: (p: PackedState, sc: Scratch, ply: number, level: 1 | 2, out: NodeTables) => NodeTables =
      buildTables;

    const _strikeArea: (p: PackedState, side: Side, t: NodeTables, actions: number, out: BB) => BB = strikeArea;
    const _strikeIfBoughtArea: (p: PackedState, side: Side, t: NodeTables, out: BB) => BB = strikeIfBoughtArea;
    const _nearestOwner: (p: PackedState, side: Side, t: NodeTables, outSlot: Uint8Array, outCost: Uint8Array) => void =
      nearestOwner;
    const _exposedValueCc: (p: PackedState, side: Side, t: NodeTables, material: Int32Array) => Centi = exposedValueCc;

    const _approachResultShape: (r: ApproachResult) => [Approach, number, number, number, 0 | 1] = r => [
      r.cls,
      r.d,
      r.retreats,
      r.attackerSlot,
      r.buy,
    ];
    const _classifyApproach: (
      p: PackedState, t: NodeTables, attackerSq: Square, speed: number, targetSlot: Slot, sc: Scratch, ply: number,
    ) => ApproachResult = classifyApproach;
    const _approachTable: (
      p: PackedState, t: NodeTables, defender: Side, sc: Scratch, ply: number,
      outClass: Uint8Array, outRetreats: Uint8Array,
    ) => void = approachTable;

    const declared: unknown[] = [
      _nodeTablesShape, _allocTables, _buildTables, KILL_NEVER,
      _strikeArea, _strikeIfBoughtArea, _nearestOwner, _exposedValueCc,
      _approachResultShape, _classifyApproach, _approachTable,
    ];
    expect(declared.every(d => d !== undefined && d !== null)).toBe(true);
    expect(declared).toHaveLength(11);
    expect([Approach.NONE, Approach.STRAND, Approach.RETREAT]).toEqual([0, 1, 2]);
    expect(KILL_NEVER).toBe(127);
  });

  it('every §4.15 eval signature is exported with the frozen shape (M12)', () => {
    const _featureCount: number = FEATURE_COUNT;
    const _featureNames: readonly string[] = FEATURE_NAMES;
    const _stageOf: Uint8Array = STAGE_OF;
    const _extract: (
      p: PackedState, t: NodeTables | null, side: Side, stage: 0 | 1 | 2, sc: Scratch, ply: number, out: Int32Array,
    ) => void = extract;
    const _boundStage2: (p: PackedState, t: NodeTables, w: Weights) => Centi = boundStage2;

    const _defaultWeights: Weights = DEFAULT_WEIGHTS;
    const _tunedWeights: Weights = TUNED_WEIGHTS;
    const _loadWeights: (json: unknown) => Weights = loadWeights;
    const _serializeWeights: (w: Weights) => string = serializeWeights;
    const _weightsHash: (w: Weights) => string = weightsHash;
    const _cloneWeights: (w: Weights) => Weights = cloneWeights;

    const _invariantBits: (p: PackedState, t: NodeTables, side: Side, sc: Scratch, ply: number) => number =
      invariantBits;

    const _evaluator: (e: Evaluator) => unknown[] = e => [
      e.setWeights,
      e.stage0,
      e.stage1,
      e.stage2,
      e.evaluate,
      e.full,
    ];
    const _newEvaluator: (rep: Replica, w?: Weights) => Evaluator = (rep, w) => new Evaluator(rep, w);
    const _stage0: (p: PackedState, root: Side) => Centi = (p, root) => new Evaluator(_newReplica).stage0(p, root);
    const _stage1: (p: PackedState, root: Side, sc: Scratch, ply: number) => Centi = (p, root, sc, ply) =>
      new Evaluator(_newReplica).stage1(p, root, sc, ply);
    const _stage2: (p: PackedState, root: Side, sc: Scratch, ply: number) => Centi = (p, root, sc, ply) =>
      new Evaluator(_newReplica).stage2(p, root, sc, ply);
    const _evaluate: (
      p: PackedState, root: Side, alpha: Centi, beta: Centi, sc: Scratch, ply: number, meter: EvalMeter,
    ) => Centi = (p, root, alpha, beta, sc, ply, meter) =>
      new Evaluator(_newReplica).evaluate(p, root, alpha, beta, sc, ply, meter);
    const _full: (p: PackedState, root: Side, sc: Scratch, ply: number, outFeatures?: Int32Array) => Centi = (
      p, root, sc, ply, outFeatures,
    ) => new Evaluator(_newReplica).full(p, root, sc, ply, outFeatures);
    const _terminalScore: (p: PackedState, root: Side, ply: number) => Centi | null = terminalScore;

    const declared: unknown[] = [
      _featureCount, _featureNames, _stageOf, _extract, _boundStage2,
      _defaultWeights, _tunedWeights, _loadWeights, _serializeWeights, _weightsHash, _cloneWeights,
      _invariantBits, _evaluator, _newEvaluator, _stage0, _stage1, _stage2, _evaluate, _full, _terminalScore,
    ];
    expect(declared.every(d => d !== undefined && d !== null)).toBe(true);
    expect(declared).toHaveLength(20);

    // Original feature boundaries survive; M6 appends its four diagnostics.
    expect(FEATURE_COUNT).toBe(62);
    expect(FEATURE_NAMES).toHaveLength(62);
    expect([F.Material, F.HomeInvaded, F.PstMine, F.ElementCoverage, F.EconDelta, F.Inv20StrandNoRetreat]).toEqual([
      0, 4, 5, 22, 23, 57,
    ]);
    expect([F.PendingValue, F.ArrivalThreat, F.DisruptPressure, F.RentShortfall]).toEqual([58, 59, 60, 61]);
    expect(INV_BASE).toBe(38);
    expect(INVARIANT_COUNT).toBe(20);
    expect([STAGE_OF[F.Material], STAGE_OF[F.PstMine], STAGE_OF[F.EconDelta], STAGE_OF[F.Inv20StrandNoRetreat]])
      .toEqual([0, 1, 2, 2]);
    expect(DEFAULT_WEIGHTS.w).toHaveLength(FEATURE_COUNT);
    expect(DEFAULT_WEIGHTS.material).toHaveLength(NDEF);
    expect(DEFAULT_WEIGHTS.version).toBe(WEIGHTS_VERSION);
  });

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

  it('every §4.14 / §4.16 / §4.17 search, book, replay and engine signature is exported with the frozen shape', () => {
    const declared: unknown[] = [
      _bound, _ttEntry, _tt, _newTT, _proofCache, _newProofCache, _scoreToTT, _scoreFromTT,
      _orderTables, _newOrderTables, _scoreTurns, _onCutoff,
      _quiesceCfg, _quiesce, _isTacticalTurn,
      _searchStats, _searchContext, _searchResult, _pvs, _iterativeDeepening,
      _workClass, _workCost, _workLadder, _workMeter, _newWorkMeter, _chooseWork, _updateProfile, _targetMs,
      _rootOptions, _rootResult, _searchRoot,
      _dfpnConfigM16, _dfpnProof, _dfpnResult, _forceHome,
      _bookEntryM18, _parseBook, _packBook, _emptyBook, _canonicalKey, _probeBook,
      _replayCheck, _verifyTurn, _hardEngine, _newHardEngine,
    ];
    expect(declared.every(d => d !== undefined && d !== null)).toBe(true);
    expect(declared).toHaveLength(45);
  });

  /**
   * DESIGN §8's table is `25e3 × 2^k` for `k = 0..7`, and every one of those
   * eight rungs is still here, in place and in order. The four above them are
   * the TURN-PACE EXTENSION (`src/ai/turnTime.ts`, `search/time.ts
   * WORK_LADDER`): a player may now fund a Hard turn with 30 s or 60 s, and
   * `chooseWork` takes the largest rung at or under `unitsPerMs × targetMs`, so
   * the old top of 3.2e6 was the engine's speed limit — ~5.3 s of search on
   * DESIGN §6.3's desktop box, whatever the allowance said.
   *
   * THIS PIN MOVED; NO BEHAVIOURAL PIN DID — AND THE LADDER IS NOT WHAT KEEPS
   * IT SO. A rung above the old top cannot change the answer for a budget below
   * 6.4e6 units, but the budget is `MEASURED unitsPerMs × targetMs`: default
   * Hard's 10,000 ms crosses 6.4e6 on any box at 640 units/ms or more, which is
   * within reach of the desktop profile's own 600. So the guarantee is carried
   * by the ALLOWANCE instead — `search/time.ts chooseTurnWork`, the one function
   * `engine.ts` funds a wall-mode turn through, refuses any rung above
   * `RELEASE_TOP_RUNG` for an allowance at or below `QUICK_TURN_ALLOWANCE_MS`
   * (the release's 8,000 ms, `quick`'s 10,000 ms, `?hardMs`, every profile's
   * `time.maxMs`, every mid-turn re-request), whatever the box measures. Every
   * fixed-work golden (400,000 units and below) never reaches these rungs at
   * all. `tests/ai/hard/turn-pace.test.ts` sweeps `unitsPerMs` from 50 to 5,000
   * to pin both halves; the determinism, cross-commit, iter-fit and rescue-cap
   * pins are untouched.
   */
  it('DESIGN §8 freezes WORK_COST, and WORK_LADDER extends it for the turn paces', () => {
    expect(Array.from(WORK_COST)).toEqual([4, 4, 1, 4, 8, 2, 2, 12, 40]);
    expect(Array.from(WORK_LADDER)).toEqual([
      25e3, 50e3, 100e3, 200e3, 400e3, 800e3, 1.6e6, 3.2e6, // DESIGN §8, k = 0..7
      6.4e6, 12.8e6, 25.6e6, 51.2e6, // the turn-pace extension, k = 8..11
    ]);
    expect(WorkClass).toEqual({
      MACRO: 0, QUIESCE: 1, TURN: 2, GEN: 3, KILLTABLE: 4, DFPN: 5, EVAL1: 6, EVAL2: 7, PROVER: 8,
    });
    expect(Bound).toEqual({ EXACT: 0, LOWER: 1, UPPER: 2 });
    expect(DfpnProof).toEqual({ UNKNOWN: 0, PROVEN: 1, DISPROVEN: 2 });
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
      expect(cfg.weights.w.length).toBe(62);
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
