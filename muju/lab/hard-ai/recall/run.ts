/**
 * `npm run hard:recall -- --corpus <file> --positions <n> --reply-positions <n>
 *  --k <K> --deep <K> [--shards <n>] [--out <path>]
 *  [--arm <name>] [--reply-node-gen gen|interior]`
 * (DESIGN §5.6, §7.6; MILESTONES.md M13; E1.3 added the last two).
 *
 * The recall instrument answers one question: **does the production generator's
 * short list still contain the turn a deeper look would have chosen?** A beam
 * that scores well but drops the refutation is worthless, so the measurement is
 * a comparison of two generators against a truth neither of them defines:
 *
 *   cheap      `TurnGenerator.generate` at the shipped `GenConfig` (`--k`);
 *   reference  `TurnGenerator.generateReference` — widths `[40, 16, 8, 4]`, 200
 *              place plans, every `strikeIfBought` witness and denial move
 *              (F25), `--deep` candidates;
 *   truth      the argmax of a 2-ply minimax over the reference set: play the
 *              candidate, let the opponent answer with the cheap generator, and
 *              score the leaf with the full (stage-2) evaluation.
 *
 * `top1` is how often the truth is in the cheap list at all, `top3` how often at
 * least one of the reference's best three is, and `regret` the cc the cheap list
 * gives up by not holding the truth.
 *
 * **The ceiling** (DESIGN §9, addendum 2026-09-15). Those three numbers are
 * bounded well below 1 by the SHAPE of the measurement, not by the generator:
 * the truth is an argmax over ~96 deeply-scored candidates and the cheap list
 * holds 24 of them, so even a generator with a perfect cone — one that returned
 * the `k` highest-scoring turns of the reference's whole output, chosen with
 * hindsight — measures `top1 ≈ 0.64`, not 1.0. The run therefore computes that
 * list too and reports it as `ceiling*`, with `*Share` = production / ceiling.
 * The shares are what measure the GENERATOR: `top1Share` is the fraction of the
 * attainable optimum the within-turn cone actually reaches, and it separates
 * cone loss (share) from the beam budget's own cost (1 − ceiling). The ceiling
 * depends only on the reference and the depth-2 pass, so it is stable while the
 * cheap generator changes — measured 0.640/0.645/0.645 across three cone widths
 * — which is exactly what a yardstick has to be.
 *
 * **Opponent-reply positions** (F25). Recall measured only at engine-to-move
 * roots hides exactly the failure that matters — a refutation the opponent has
 * and the generator never shows the search. `--reply-positions` therefore plays
 * the cheap generator's own best turn on a corpus position and measures again at
 * the node that produces, reporting `replyTop1` separately.
 *
 * **Ablation arms** (E1.3). `--arm <name>` replaces the cheap generator's
 * `GenConfig` with `lab/hard-ai/ablate/arms.ts`'s one-factor patch over
 * `DESKTOP` — that is how an arm gets a wider action beam or more place plans,
 * which `--k` alone cannot express. The truth's GENERATORS do not move with it:
 * `generateReference` takes its widths, place plans and keep floor from
 * `REFERENCE_*` constants and its `ttBits`/purchase weights from fields no arm
 * touches, the depth-2 reply set stays at `REPLY_K` on `DESKTOP.gen`, and
 * `DEPTH2_CANDIDATES` is fixed. Without `--arm` the run is byte-identical to
 * what it was (measured before and after the change below: the default
 * artifact differs only in its `at` timestamp).
 *
 * THE ARM'S EVALUATION (lane 12's A8, lane 5's L5-A1; applied by E3 lane 13,
 * 2026-09-17). Until then the instrument built `new Evaluator(this.rep)` —
 * `DEFAULT_WEIGHTS`, no `evalFix` block — and two bare `allocTables()`, so a
 * `weights` arm or an `evalFix` arm changed NO recall column: measured, the
 * whole artifact for `--arm eval-no-safety` was identical to base's on 20 root
 * and 10 reply positions of `fuzz-1000.jsonl`. The evaluator and both
 * `NodeTables` now come off `recallEnginePatch(arm)`, exactly as
 * `src/ai/hard/engine.ts` builds an engine's, so such an arm is visible:
 * `eval-no-safety` on the same 20+10 moves `top1` .30 -> .35, `replyTop1`
 * .20 -> .30, `regret_p90` 1,432 -> 931 cc.
 *
 * WHAT THAT COSTS: for a `weights`/`evalFix` arm the depth-2 TRUTH moves too,
 * because its leaves are scored by this evaluator. The cheap list, the
 * reference list and the truth are then all the arm's own — which is the
 * self-consistency question the instrument asks of the shipped engine, but two
 * such arms are no longer ranked against one fixed yardstick the way two
 * GENERATOR arms are. Read `top1`/`regret` for a weights arm as "this engine's
 * beam against this engine's own deeper look", never as cone quality measured
 * against base's.
 *
 * `--reply-node-gen interior` measures `--reply-positions` items with
 * `genInterior` instead of `gen`, which is what the ENGINE does at a reply
 * node (`search/pvs.ts generateAt`: `ply === 0 ? s.gen : s.genInterior`, and
 * `analyze/analyze.ts` lists the reply node with `config.genInterior`). It
 * defaults ON under `--arm` and OFF otherwise, so the gate's `replyTop1` keeps
 * its meaning while an arm that moves only `kInterior` is still visible. The
 * ceiling list at such an item is sized by that generator's own `K`, not by
 * `--k`; `replyTop1` under the two settings is NOT comparable.
 *
 * **Named-plan assertions.** Two positions are checked by name rather than
 * statistically: `f16PunisherPresent` (the `BUY water_1@C1` plan on the F16
 * fixture, `recall/fixtures.jsonl`) and `homeRacePresent` (the Radi G1 line as a
 * FORCED candidate on `authored.jsonl#home-race`, the archived rev-7 position).
 *
 * **Legality.** Every cheap candidate is replayed through the CANONICAL engine
 * (`src/ai/simulate.ts applyAction`, which revalidates with `isLegalAction`) and
 * the repacked end position is compared with the turn's own `Kpos`;
 * `illegalTurns` counts every disagreement. `emptyLists` counts positions where
 * the generator returned nothing at all (DESIGN F7 forbids it).
 *
 * `--shards N` runs the work list in N child processes of this file
 * (`--shard-index`/`--shard-count`, disjoint strides of one deterministic list)
 * and merges their partial artifacts, exactly as the other gate runners do.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import type { GameState } from '../../../src/game/types';
import { applyAction } from '../../../src/ai/simulate';
import type { AIAction } from '../../../src/ai/types';
import { Replica, allocState, newUndo, type Undo } from '../../../src/ai/hard/core/state';
import { Scratch } from '../../../src/ai/hard/core/bits';
import { AKind, newKeepSetTable, paA, paB, paKind, type KeepSetTable } from '../../../src/ai/hard/core/action';
import { DEF_INDEX } from '../../../src/ai/hard/core/catalog';
import { allocTables, buildTables, type NodeTables } from '../../../src/ai/hard/tables/context';
import { Evaluator, terminalScore } from '../../../src/ai/hard/eval/evaluate';
import { TurnPool, TurnFlag, decodeTurn, type Turn } from '../../../src/ai/hard/gen/turn';
import { UNLIMITED_WORK } from '../../../src/ai/hard/gen/actionsearch';
import {
  TurnGenerator,
  newGenStats,
  outCapacityFor,
  referenceCapacity,
  type GenStats,
} from '../../../src/ai/hard/gen/generate';
import { DESKTOP } from '../../../src/ai/hard/config';
import type { GenConfig, Weights } from '../../../src/ai/hard/config';
import { REFERENCE_K, REFERENCE_NODE_BUDGET, REFERENCE_PLACE_PLANS, REFERENCE_WIDTHS } from '../../../src/ai/hard/gen/generate';
import { ABLATE_LABEL_PREFIX, armEngineName, armHardConfig, evalFixKey, requireArm } from '../ablate/arms';
import { hardEnginePatch } from '../bots/hard';
import { MAX_TURN_ACTIONS, Result, type Centi, type PackedState, type Side } from '../../../src/ai/hard/types';
import { setCombatHandicap } from '../../../src/game/combat';
import { setElementGraph } from '../../../src/game/elements';
import { setUpkeepVariant } from '../../../src/game/upkeep';
import { readPositions, type RulesBlock, type StoredPosition } from '../positions/corpus';
import { F16_DEF, F16_ID, F16_SQUARE, FIXTURES_FILE } from './build-fixtures';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');
const POSITIONS_DIR = path.resolve(import.meta.dirname, '../positions');
const SELF = path.resolve(import.meta.dirname, 'run.ts');
const DEFAULT_OUT = path.resolve(REPO_ROOT, 'lab/results/hard-ai-verify/recall.json');

/** `authored.jsonl` id of the archived rev-7 home race (SU addendum 20b). */
const HOME_RACE_ID = 'home-race';
const HOME_RACE_DEF = 'lightning_1';
/** G1 = file G (x 6), rank 1 (y 0). */
const HOME_RACE_SQUARE = 6;
/** J10 = the Black corner. */
const HOME_RACE_CORNER = 99;

/**
 * Candidates carried into the depth-2 pass. The reference list runs to a few
 * hundred entries and each one costs a table build plus a reply generation, so
 * only the best `DEPTH2_CANDIDATES` by static evaluation are scored deeply —
 * the cheap list is always scored in full on top of that, so a cheap candidate
 * the narrowing dropped still contributes its regret.
 */
const DEPTH2_CANDIDATES = 96;
/** Opponent replies considered at the depth-2 leaf. A thin reply set makes the
 * truth itself noisy — a candidate looks good only because the answer to it was
 * never generated — so this is deliberately wider than an interior search node's
 * `kInterior`. */
const REPLY_K = 16;
/** `TurnPool` capacity: the reference generator is the demanding caller. */
const POOL_CAPACITY = 8192;
const REPLY_POOL_CAPACITY = 512;

interface Args {
  corpus: string;
  positions: number;
  replyPositions: number;
  k: number;
  deep: number;
  shards: number;
  shardIndex: number;
  shardCount: number;
  out: string;
  /** Prints one diagnostic line per position whose truth the cheap list missed. */
  verbose: boolean;
  /** E1.3 ablation arm (`lab/hard-ai/ablate/arms.ts`), or null for the shipped generator. */
  arm: string | null;
  /** Which `GenConfig` `--reply-positions` items are generated with. */
  replyNodeGen: 'gen' | 'interior';
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    corpus: 'fuzz-1000.jsonl',
    positions: 200,
    replyPositions: 100,
    k: DESKTOP.gen.K,
    deep: 2000,
    shards: 1,
    shardIndex: -1,
    shardCount: 1,
    out: DEFAULT_OUT,
    verbose: false,
    arm: null,
    replyNodeGen: 'gen',
  };
  let replyNodeGenGiven = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--corpus') args.corpus = argv[++i];
    else if (a === '--positions') args.positions = Number(argv[++i]);
    else if (a === '--reply-positions') args.replyPositions = Number(argv[++i]);
    else if (a === '--k') args.k = Number(argv[++i]);
    else if (a === '--deep') args.deep = Number(argv[++i]);
    else if (a === '--shards') args.shards = Number(argv[++i]);
    else if (a === '--shard-index') args.shardIndex = Number(argv[++i]);
    else if (a === '--shard-count') args.shardCount = Number(argv[++i]);
    else if (a === '--out') args.out = path.resolve(REPO_ROOT, argv[++i]);
    else if (a === '--verbose') args.verbose = true;
    else if (a === '--arm') args.arm = argv[++i];
    else if (a === '--reply-node-gen') {
      const v = argv[++i];
      if (v !== 'gen' && v !== 'interior') throw new Error(`recall/run: --reply-node-gen expects gen|interior, got "${v}"`);
      args.replyNodeGen = v;
      replyNodeGenGiven = true;
    } else throw new Error(`recall/run: unrecognised argument "${a}"`);
  }
  if (args.arm !== null) {
    // `--k` cannot express an arm (widths and place plans are not K), and the
    // artifact must record the K the arm actually ran at.
    args.k = armHardConfig(requireArm(args.arm).name).gen.K;
    if (!replyNodeGenGiven) args.replyNodeGen = 'interior';
  }
  return args;
}

// --- the work list --------------------------------------------------------------

type ItemKind = 'fixture' | 'root' | 'reply';

interface WorkItem {
  kind: ItemKind;
  id: string;
  state: GameState;
  /**
   * The position's own rules block. The element graph, upkeep schedule and
   * combat handicap are process GLOBALS a bare `GameState` does not carry
   * (`positions/corpus.ts:6`), so every item re-applies its own before it is
   * measured — otherwise the first variant position to enter any of these
   * corpora would be silently measured under the previous position's rules.
   */
  rules: RulesBlock;
  /** `fixture` items assert a named plan instead of contributing to the rates. */
  assert?: 'f16' | 'home-race';
}

/** The three process-global rule knobs a stored position may move. */
function applyRules(rules: RulesBlock): void {
  setElementGraph(rules.elementGraph);
  setUpkeepVariant(rules.upkeep);
  setCombatHandicap('white', rules.combatHandicap.white);
  setCombatHandicap('black', rules.combatHandicap.black);
}

function buildWorkList(args: Args): WorkItem[] {
  const items: WorkItem[] = [];
  const f16 = readPositions(FIXTURES_FILE).find(sp => sp.id === F16_ID);
  if (f16 === undefined) throw new Error(`recall/run: ${FIXTURES_FILE} has no "${F16_ID}" fixture`);
  items.push({ kind: 'fixture', id: F16_ID, state: f16.state, rules: f16.rules, assert: 'f16' });

  const authored = readPositions(path.join(POSITIONS_DIR, 'authored.jsonl'));
  const race = authored.find(sp => sp.id === HOME_RACE_ID);
  if (race === undefined) throw new Error(`recall/run: authored.jsonl has no "${HOME_RACE_ID}" fixture`);
  items.push({ kind: 'fixture', id: HOME_RACE_ID, state: race.state, rules: race.rules, assert: 'home-race' });

  // A derived corpus (E1.3's `ablate/run.ts` writes one) lives outside
  // `positions/`, so an absolute path is taken as given.
  const corpusPath = path.isAbsolute(args.corpus) ? args.corpus : path.join(POSITIONS_DIR, args.corpus);
  if (!fs.existsSync(corpusPath)) throw new Error(`recall/run: missing corpus ${corpusPath}`);
  const corpus: StoredPosition[] = readPositions(corpusPath).filter(sp => sp.state.phase === 'playing');
  for (let i = 0; i < args.positions && i < corpus.length; i++) {
    items.push({ kind: 'root', id: `root#${corpus[i].id}`, state: corpus[i].state, rules: corpus[i].rules });
  }
  // Reply nodes are taken from the TAIL of the same corpus, so a reply node is
  // never the same position as a root node in the same run.
  for (let i = 0; i < args.replyPositions; i++) {
    const index = corpus.length - 1 - i;
    if (index < args.positions) break;
    items.push({ kind: 'reply', id: `reply#${corpus[index].id}`, state: corpus[index].state, rules: corpus[index].rules });
  }
  return items;
}

// --- per-position measurement -----------------------------------------------------

/** A candidate's action list, copied out of the pool before it is recycled. */
interface Snapshot {
  key: string;
  actions: Int32Array;
  count: number;
  flags: number;
  fromCheap: boolean;
  fromRef: boolean;
  staticCc: Centi;
  deepCc: Centi;
  scored: boolean;
}

interface Partial {
  rootPositions: number;
  replyPositions: number;
  rootTop1: number;
  rootTop3: number;
  rootTop1Value: number;
  rootTop3Value: number;
  replyTop1Hits: number;
  replyTop1ValueHits: number;
  /**
   * The same four counters for the CEILING list — the `k` highest-static
   * candidates of the scored union, i.e. what a generator with a perfect cone
   * and the shipped beam budget would have returned. See `summarise`.
   */
  ceilTop1: number;
  ceilTop3: number;
  ceilTop1Value: number;
  replyCeilTop1Hits: number;
  ceilRegrets: number[];
  regrets: number[];
  illegalTurns: number;
  emptyLists: number;
  cheapCandidates: number;
  refCandidates: number;
  f16Checked: number;
  f16Present: number;
  homeRaceChecked: number;
  homeRacePresent: number;
  notes: string[];
}

function newPartial(): Partial {
  return {
    rootPositions: 0,
    replyPositions: 0,
    rootTop1: 0,
    rootTop3: 0,
    rootTop1Value: 0,
    rootTop3Value: 0,
    replyTop1Hits: 0,
    replyTop1ValueHits: 0,
    ceilTop1: 0,
    ceilTop3: 0,
    ceilTop1Value: 0,
    replyCeilTop1Hits: 0,
    ceilRegrets: [],
    regrets: [],
    illegalTurns: 0,
    emptyLists: 0,
    cheapCandidates: 0,
    refCandidates: 0,
    f16Checked: 0,
    f16Present: 0,
    homeRaceChecked: 0,
    homeRacePresent: 0,
    notes: [],
  };
}

const MAX_NOTES = 20;

function keyOf(lo: number, hi: number): string {
  return `${(hi >>> 0).toString(16).padStart(8, '0')}${(lo >>> 0).toString(16).padStart(8, '0')}`;
}

function genConfigWithK(base: GenConfig, k: number): GenConfig {
  return {
    K: k,
    maxPlacePlans: base.maxPlacePlans,
    action: base.action,
    purchase: base.purchase,
    maxPromotions: base.maxPromotions,
    reference: base.reference,
  };
}

/**
 * The arm's resolved engine configuration, exactly as `src/ai/hard/engine.ts`
 * resolves it: through `hardEnginePatch` (which substitutes `DEFAULT_WEIGHTS`
 * for M4's `version: 0` placeholder that `armHardConfig` alone returns), with
 * E3-PLAN's non-placeholder assertion on top. `null` is the shipped generator,
 * i.e. `hard@desktop` — `DEFAULT_WEIGHTS` and no `evalFix` block, which is what
 * the default path always had, so the default recall run is unchanged.
 *
 * A8 of `docs/hard-ai/e3/amendments/lane12.md` and L5-A1 of `.../lane5.md`:
 * before this, `recall/run.ts` built `new Evaluator(this.rep)` and two bare
 * `allocTables()`, so a `weights` arm and an `evalFix` arm changed no recall
 * column at all.
 */
// (`Partial` is this file's own artifact interface, so the patch type is taken
// from `hardEnginePatch` itself rather than spelled with TS's utility type —
// the same dodge `suites/run.ts suiteEnginePatch` uses.)
export function recallEnginePatch(arm: string | null): ReturnType<typeof hardEnginePatch> {
  const patch = hardEnginePatch(arm === null ? 'desktop' : `${ABLATE_LABEL_PREFIX}${arm}`);
  const weights = patch.weights;
  if (weights === undefined || weights.version === 0) {
    throw new Error(
      `recall/run: ${arm ?? 'desktop'} resolved to placeholder weights ` +
        `(${weights?.label ?? 'none'}, version ${weights?.version ?? 'none'}); the depth-2 truth would be material-only`,
    );
  }
  return patch;
}

class RecallChecker {
  private readonly rep = new Replica();
  private readonly sc = new Scratch(8, 8, 4, 4);
  private readonly tables: NodeTables = allocTables();
  private readonly replyTables: NodeTables = allocTables();
  /**
   * The scorer's evaluator. Built in the constructor from the ARM's resolved
   * configuration (A8 of `amendments/lane12.md`, L5-A1 of `amendments/lane5.md`,
   * applied by lane 13): it used to be `new Evaluator(this.rep)`, i.e.
   * `DEFAULT_WEIGHTS` and no `evalFix` block, so a `weights` arm and an
   * `evalFix` arm were invisible to every recall column.
   */
  private readonly evaluator: Evaluator;
  private readonly pool = new TurnPool(POOL_CAPACITY);
  private readonly replyPool = new TurnPool(REPLY_POOL_CAPACITY);
  private readonly keep: KeepSetTable = newKeepSetTable();
  private readonly replyKeep: KeepSetTable = newKeepSetTable();
  private readonly gen: TurnGenerator;
  private readonly replyGen: TurnGenerator;
  /**
   * `--reply-node-gen interior`: the generator a `reply` item is measured with,
   * built from the arm's `genInterior`. Null when reply items are measured with
   * the root generator, which is the default and the historical behaviour.
   */
  private readonly replyNodeGen: TurnGenerator | null;
  private readonly replyNodeOut: Turn[];
  private readonly replyNodeK: number;
  private readonly cheapOut: Turn[];
  private readonly refOut: Turn[];
  private readonly replyOut: Turn[];
  private readonly stats: GenStats = newGenStats();
  private readonly undo: Undo = newUndo();
  private readonly score: (p: PackedState, sc: Scratch, ply: number) => Centi;

  private readonly verbose: boolean;
  /** What the depth-2 truth was scored under, for the artifact (A8 / L5-A1). */
  readonly weightsLabel: string;
  readonly evalFixLabel: string;
  /** The shipped beam budget under test; also the size of the ceiling list. */
  private readonly k: number;
  /** The side whose turn the scorer is valuing; set before every generation. */
  private scoreMover: Side = 0;

  constructor(args: Args) {
    this.verbose = args.verbose;
    this.k = args.k;
    // The generator UNDER TEST. `--arm` supplies a whole `GenConfig` (widths and
    // place plans are not reachable through `--k`); without it this is exactly
    // what it always was, `DESKTOP.gen` at `--k`.
    const armCfg = args.arm === null ? null : armHardConfig(args.arm);
    const cheapCfg = armCfg === null ? genConfigWithK(DESKTOP.gen, args.k) : armCfg.gen;
    // THE ARM'S EVALUATION (lane 12's A8 and lane 5's L5-A1, applied by lane 13).
    // The truth this instrument is built on is a depth-2 minimax whose leaves
    // are scored by `this.score` below, so the weight vector and the `evalFix`
    // block ARE part of the measurement — and until now neither reached it: the
    // evaluator was `new Evaluator(this.rep)` (`DEFAULT_WEIGHTS`, no block) and
    // both `NodeTables` came out of `allocTables()` with `evalFix: null`, so
    // `hard@ablate:eval-no-safety` and `hard@ablate:eval-correct-v1` produced
    // base's numbers to the digit. They are resolved here the way
    // `src/ai/hard/engine.ts:246-259` resolves them, through `hardEnginePatch`
    // (E3-PLAN's rule: never `armHardConfig` alone, whose `weights` field is
    // M4's `version: 0` placeholder), and stamped on both table sets and on the
    // evaluator.
    const patch = recallEnginePatch(args.arm);
    const weights = patch.weights as Weights;
    const evalFix = patch.evalFix ?? null;
    this.tables.evalFix = evalFix;
    this.replyTables.evalFix = evalFix;
    this.evaluator = new Evaluator(this.rep, weights, evalFix);
    this.weightsLabel = weights.label;
    this.evalFixLabel = evalFixKey(patch.evalFix);
    this.gen = new TurnGenerator(this.rep, cheapCfg, this.pool, this.sc);
    // The TRUTH's reply set: fixed at `DESKTOP.gen` and `REPLY_K` whatever the
    // arm is, or two arms would be scored against two different yardsticks.
    this.replyGen = new TurnGenerator(this.rep, genConfigWithK(DESKTOP.gen, REPLY_K), this.replyPool, this.sc);
    const replyNodeCfg = args.replyNodeGen === 'interior' ? (armCfg ?? DESKTOP).genInterior : null;
    this.replyNodeGen = replyNodeCfg === null ? null : new TurnGenerator(this.rep, replyNodeCfg, this.pool, this.sc);
    this.replyNodeOut = replyNodeCfg === null ? [] : new Array<Turn>(outCapacityFor(replyNodeCfg));
    this.replyNodeK = replyNodeCfg === null ? args.k : replyNodeCfg.K;
    this.cheapOut = new Array<Turn>(outCapacityFor(cheapCfg));
    this.refOut = new Array<Turn>(referenceCapacity());
    this.replyOut = new Array<Turn>(outCapacityFor(genConfigWithK(DESKTOP.gen, REPLY_K)));
    // DESIGN §5.4: "the within-turn score (stage-1 eval of the post-boundary
    // position from the mover's perspective)". A turn that ENDS the game scores
    // the terminal instead — `ActionSearch` records mid-turn terminals too
    // (a lethal attack that eliminates, an occupation the gate proves), and on
    // those `p.side` has not flipped, so the mover cannot be read off the state.
    this.score = (p, sc, ply) => {
      const mover = this.scoreMover;
      const terminal = terminalScore(p, mover, ply);
      if (terminal !== null) return terminal;
      return this.evaluator.stage0(p, mover) + this.evaluator.stage1(p, mover, sc, ply);
    };
  }

  /** Packs, marks the prover live and builds the level-2 tables. */
  private prepare(state: GameState): PackedState | null {
    let p: PackedState;
    try {
      p = this.rep.pack(state, allocState());
    } catch {
      return null;
    }
    if (p.result !== Result.ONGOING) return null;
    // A candidate line may step onto the enemy corner, which `make` only
    // adjudicates with the prover switched on (`core/state.ts provesHomeCheckmate`).
    p.proverMode = 2;
    buildTables(p, this.sc, 0, 2, this.tables);
    return p;
  }

  private snapshot(turns: readonly Turn[], n: number, fromCheap: boolean, into: Map<string, Snapshot>): void {
    for (let i = 0; i < n; i++) {
      const turn = turns[i];
      const key = keyOf(turn.endLo, turn.endHi);
      const existing = into.get(key);
      if (existing !== undefined) {
        existing.fromCheap = existing.fromCheap || fromCheap;
        existing.fromRef = existing.fromRef || !fromCheap;
        continue;
      }
      const actions = new Int32Array(MAX_TURN_ACTIONS);
      actions.set(turn.actions.subarray(0, turn.count));
      into.set(key, {
        key,
        actions,
        count: turn.count,
        flags: turn.flags,
        fromCheap,
        fromRef: !fromCheap,
        staticCc: turn.gainCc,
        deepCc: 0,
        scored: false,
      });
    }
  }

  /** Applies a snapshot's actions; returns the number applied, or -1 on rejection. */
  private applySnapshot(p: PackedState, snap: Snapshot): number {
    let applied = 0;
    for (let i = 0; i < snap.count; i++) {
      const a = snap.actions[i];
      if (!this.rep.isLegal(p, a, this.keep)) return -1;
      this.rep.make(p, a, this.undo, this.keep);
      applied++;
    }
    return applied;
  }

  private unapply(p: PackedState, applied: number): void {
    for (let i = 0; i < applied; i++) this.rep.unmake(p, this.undo);
  }

  /**
   * 2-ply minimax value of one candidate, from `root`'s point of view: play it,
   * let the opponent answer with the cheap generator, take the minimum of the
   * full evaluations of the leaves.
   */
  private depth2(p: PackedState, snap: Snapshot, root: Side): Centi {
    const top = this.undo.top;
    const applied = this.applySnapshot(p, snap);
    if (applied < 0) {
      this.unapply(p, 0);
      this.undo.top = top;
      return -0x7fffffff;
    }
    let value: Centi;
    const terminal = terminalScore(p, root, 1);
    if (terminal !== null) {
      value = terminal;
    } else {
      buildTables(p, this.sc, 1, 2, this.replyTables);
      this.replyPool.reset();
      this.scoreMover = p.side as Side;
      const replies = this.replyGen.generate(
        p,
        this.replyTables,
        this.score,
        UNLIMITED_WORK,
        1,
        this.replyKeep,
        this.replyOut,
        this.stats,
      );
      if (replies === 0) {
        value = this.evaluator.full(p, root, this.sc, 1);
      } else {
        value = 0x7fffffff;
        for (let i = 0; i < replies; i++) {
          const reply = this.replyOut[i];
          const replyTop = this.undo.top;
          let ok = true;
          let n = 0;
          for (let a = 0; a < reply.count && ok; a++) {
            const action = reply.actions[a];
            if (!this.rep.isLegal(p, action, this.replyKeep)) ok = false;
            else {
              this.rep.make(p, action, this.undo, this.replyKeep);
              n++;
            }
          }
          if (ok) {
            const leafTerminal = terminalScore(p, root, 2);
            const leaf = leafTerminal !== null ? leafTerminal : this.evaluator.full(p, root, this.sc, 2);
            if (leaf < value) value = leaf;
          }
          this.unapply(p, n);
          this.undo.top = replyTop;
        }
        if (value === 0x7fffffff) value = this.evaluator.full(p, root, this.sc, 1);
      }
      this.scoreMover = root;
    }
    this.unapply(p, applied);
    this.undo.top = top;
    return value;
  }

  /**
   * Replays a cheap candidate through the CANONICAL engine and checks that the
   * end position it reaches is the one the turn claims. Returns true when the
   * line is faithful.
   */
  private canonicalReplay(state: GameState, p: PackedState, turn: Turn): boolean {
    let actions: AIAction[];
    try {
      actions = decodeTurn(p, turn, this.keep);
    } catch {
      return false;
    }
    let current = state;
    for (const action of actions) {
      const next = applyAction(current, action);
      if (next === current) return false;
      current = next;
    }
    let repacked: PackedState;
    try {
      repacked = this.rep.pack(current, allocState());
    } catch {
      return false;
    }
    return repacked.kposLo === turn.endLo && repacked.kposHi === turn.endHi;
  }

  /** Plays the cheap generator's best turn, returning the reply position. */
  private playBest(state: GameState): GameState | null {
    const p = this.prepare(state);
    if (p === null) return null;
    this.pool.reset();
    this.scoreMover = p.side as Side;
    const n = this.gen.generate(p, this.tables, this.score, UNLIMITED_WORK, 0, this.keep, this.cheapOut, this.stats);
    if (n === 0) return null;
    let best = 0;
    for (let i = 1; i < n; i++) if (this.cheapOut[i].gainCc > this.cheapOut[best].gainCc) best = i;
    let actions: AIAction[];
    try {
      actions = decodeTurn(p, this.cheapOut[best], this.keep);
    } catch {
      return null;
    }
    let current = state;
    for (const action of actions) {
      const next = applyAction(current, action);
      if (next === current) return null;
      current = next;
    }
    return current.phase === 'playing' ? current : null;
  }

  check(item: WorkItem, acc: Partial): void {
    applyRules(item.rules);
    const state = item.kind === 'reply' ? this.playBest(item.state) : item.state;
    if (state === null) {
      if (acc.notes.length < MAX_NOTES) acc.notes.push(`${item.id}: no playable cheap turn to reach a reply node`);
      return;
    }
    const p = this.prepare(state);
    if (p === null) {
      if (acc.notes.length < MAX_NOTES) acc.notes.push(`${item.id}: not a packable ongoing position`);
      return;
    }
    const root = p.side as Side;

    // A `reply` item is a node the ENGINE would generate with `genInterior`
    // (`search/pvs.ts generateAt`), so `--reply-node-gen interior` measures it
    // with that cone and sizes its ceiling list by that cone's own `K`.
    const atReplyNode = item.kind === 'reply' && this.replyNodeGen !== null;
    const gen = atReplyNode ? (this.replyNodeGen as TurnGenerator) : this.gen;
    const out = atReplyNode ? this.replyNodeOut : this.cheapOut;
    const k = atReplyNode ? this.replyNodeK : this.k;

    this.pool.reset();
    this.scoreMover = root;
    const cheapCount = gen.generate(
      p,
      this.tables,
      this.score,
      UNLIMITED_WORK,
      0,
      this.keep,
      out,
      this.stats,
    );
    if (cheapCount === 0) {
      acc.emptyLists++;
      if (acc.notes.length < MAX_NOTES) acc.notes.push(`${item.id}: cheap generator returned no candidate`);
      return;
    }
    acc.cheapCandidates += cheapCount;

    if (item.assert === 'f16') {
      acc.f16Checked++;
      if (this.hasBuy(cheapCount, F16_DEF, F16_SQUARE)) acc.f16Present++;
      else if (acc.notes.length < MAX_NOTES) acc.notes.push(`${item.id}: no BUY ${F16_DEF}@${F16_SQUARE} candidate`);
    }
    if (item.assert === 'home-race') {
      acc.homeRaceChecked++;
      if (this.hasForcedHomeRace(cheapCount)) acc.homeRacePresent++;
      else if (acc.notes.length < MAX_NOTES) acc.notes.push(`${item.id}: no FORCED home-race candidate`);
    }

    for (let i = 0; i < cheapCount; i++) {
      if (!this.canonicalReplay(state, p, out[i])) {
        acc.illegalTurns++;
        if (acc.notes.length < MAX_NOTES) acc.notes.push(`${item.id}: candidate ${i} diverged from the canonical engine`);
      }
    }

    const snaps = new Map<string, Snapshot>();
    this.snapshot(out, cheapCount, true, snaps);

    this.pool.reset();
    this.scoreMover = root;
    const refCount = this.gen.generateReference(p, this.tables, this.score, 0, this.keep, this.refOut);
    acc.refCandidates += refCount;
    this.snapshot(this.refOut, refCount, false, snaps);

    // Fixture items assert a named plan; they do not contribute to the rates
    // (their positions are hand-made, not a sample of anything).
    if (item.assert !== undefined) return;

    const all = [...snaps.values()];
    // Narrow the deep pass: every cheap candidate, plus the reference's best by
    // static score.
    const refOnly = all.filter(s => !s.fromCheap);
    refOnly.sort((a, b) => b.staticCc - a.staticCc || (a.key < b.key ? -1 : 1));
    const deep: Snapshot[] = all.filter(s => s.fromCheap);
    for (const s of refOnly) {
      if (deep.length >= DEPTH2_CANDIDATES) break;
      deep.push(s);
    }
    for (const s of deep) {
      s.deepCc = this.depth2(p, s, root);
      s.scored = true;
    }

    const refScored = deep.filter(s => s.fromRef && s.deepCc > -0x7fffffff);
    const cheapScored = deep.filter(s => s.fromCheap && s.deepCc > -0x7fffffff);
    if (refScored.length === 0 || cheapScored.length === 0) {
      if (acc.notes.length < MAX_NOTES) acc.notes.push(`${item.id}: nothing scorable at depth 2`);
      return;
    }
    refScored.sort((a, b) => b.deepCc - a.deepCc || (a.key < b.key ? -1 : 1));
    let bestCheap = cheapScored[0].deepCc;
    for (const s of cheapScored) if (s.deepCc > bestCheap) bestCheap = s.deepCc;

    const truth = refScored[0];
    const hitTop1 = truth.fromCheap;
    let hitTop3 = false;
    for (let i = 0; i < Math.min(3, refScored.length); i++) if (refScored[i].fromCheap) hitTop3 = true;
    const regret = Math.max(0, truth.deepCc - bestCheap);
    // Value recall: the cheap list attains the reference optimum (`top1Value`),
    // or at least the reference's third-best DISTINCT value (`top3Value`).
    const distinct: number[] = [];
    for (const s of refScored) if (distinct.length < 3 && (distinct.length === 0 || distinct[distinct.length - 1] !== s.deepCc)) distinct.push(s.deepCc);
    const hitTop1Value = bestCheap >= truth.deepCc;
    const hitTop3Value = bestCheap >= distinct[Math.min(2, distinct.length - 1)];

    if (this.verbose && regret > 200) {
      const asTurn = (snap: Snapshot): Turn => ({
        actions: snap.actions, count: snap.count, endLo: 0, endHi: 0, sig: 0, flags: snap.flags,
        gainCc: snap.staticCc, place: -1, hangCc: 0,
      });
      const bestCheapSnap = cheapScored.slice().sort((a, b) => b.deepCc - a.deepCc)[0];
      try {
        console.log(`  TRUTH ${item.id} deep=${truth.deepCc} static=${truth.staticCc} ` + JSON.stringify(decodeTurn(p, asTurn(truth), this.keep)));
        console.log(`  CHEAP ${item.id} deep=${bestCheapSnap.deepCc} static=${bestCheapSnap.staticCc} ` + JSON.stringify(decodeTurn(p, asTurn(bestCheapSnap), this.keep)));
      } catch (err) {
        console.log(`  decode failed: ${(err as Error).message}`);
      }
    }
    if (this.verbose && !hitTop1) {
      const rank = refScored.findIndex(s => s.key === truth.key);
      const staticRank = [...deep].sort((a, b) => b.staticCc - a.staticCc).findIndex(s => s.key === truth.key);
      console.log(
        `miss ${item.id}: cheap=${cheapScored.length} deep=${deep.length} ref=${refScored.length} ` +
          `truth=${truth.key} deep2=${truth.deepCc} static=${truth.staticCc} staticRank=${staticRank} rank=${rank} ` +
          `bestCheapDeep=${bestCheap} regret=${regret} truthFlags=${truth.flags} truthActions=${truth.count}`,
      );
    }

    // --- the ceiling -------------------------------------------------------
    //
    // The same three statistics for the list a generator with a PERFECT cone
    // and the shipped beam budget would have returned: the `k` highest-static
    // candidates of the scored union. It is not attainable — it is chosen with
    // hindsight over `generateReference`'s whole output — but it is the exact
    // upper bound of any `K = k` list ranked by DESIGN §5.4's within-turn score,
    // so the gap between `top1` and `ceilingTop1` is the CONE's loss and the gap
    // between `ceilingTop1` and 1 is what the beam budget itself costs. See
    // DEVIATIONS under M13 and DESIGN §9's 2026-09-15 addendum.
    const applicable = deep.filter(s => s.deepCc > -0x7fffffff);
    const ceiling = applicable
      .slice()
      .sort((a, b) => b.staticCc - a.staticCc || (a.key < b.key ? -1 : 1))
      .slice(0, k);
    const ceilingKeys = new Set(ceiling.map(s => s.key));
    const ceilHitTop1 = ceilingKeys.has(truth.key);
    let ceilHitTop3 = false;
    for (let i = 0; i < Math.min(3, refScored.length); i++) if (ceilingKeys.has(refScored[i].key)) ceilHitTop3 = true;
    let bestCeiling = -0x7fffffff;
    for (const s of ceiling) if (s.deepCc > bestCeiling) bestCeiling = s.deepCc;
    const ceilRegret = Math.max(0, truth.deepCc - bestCeiling);

    if (item.kind === 'reply') {
      acc.replyPositions++;
      if (hitTop1) acc.replyTop1Hits++;
      if (hitTop1Value) acc.replyTop1ValueHits++;
      if (ceilHitTop1) acc.replyCeilTop1Hits++;
    } else {
      acc.rootPositions++;
      if (hitTop1) acc.rootTop1++;
      if (hitTop3) acc.rootTop3++;
      if (hitTop1Value) acc.rootTop1Value++;
      if (hitTop3Value) acc.rootTop3Value++;
      if (ceilHitTop1) acc.ceilTop1++;
      if (ceilHitTop3) acc.ceilTop3++;
      if (bestCeiling >= truth.deepCc) acc.ceilTop1Value++;
      acc.regrets.push(regret);
      acc.ceilRegrets.push(ceilRegret);
    }
  }

  private hasBuy(count: number, definitionId: string, square: number): boolean {
    const def = DEF_INDEX.get(definitionId);
    if (def === undefined) return false;
    for (let i = 0; i < count; i++) {
      const turn = this.cheapOut[i];
      for (let k = 0; k < turn.count; k++) {
        const a = turn.actions[k];
        if (paKind(a) === AKind.BUY && paA(a) === def && paB(a) === square) return true;
      }
    }
    return false;
  }

  /** The archived rev-7 line: FORCED, `BUY lightning_1@G1`, MOVE onto J10. */
  private hasForcedHomeRace(count: number): boolean {
    const def = DEF_INDEX.get(HOME_RACE_DEF);
    if (def === undefined) return false;
    for (let i = 0; i < count; i++) {
      const turn = this.cheapOut[i];
      if ((turn.flags & TurnFlag.FORCED) === 0 || (turn.flags & TurnFlag.HOME_RACE) === 0) continue;
      let buy = false;
      let enter = false;
      for (let k = 0; k < turn.count; k++) {
        const a = turn.actions[k];
        if (paKind(a) === AKind.BUY && paA(a) === def && paB(a) === HOME_RACE_SQUARE) buy = true;
        if (paKind(a) === AKind.MOVE && paB(a) === HOME_RACE_CORNER) enter = true;
      }
      if (buy && enter) return true;
    }
    return false;
  }
}

// --- shard plumbing ----------------------------------------------------------------

function shardOutPath(out: string, index: number): string {
  const dir = path.dirname(out);
  const stem = path.basename(out, '.json');
  return path.join(dir, `${stem}.shard-${index}.json`);
}

function runShard(args: Args): Partial {
  const items = buildWorkList(args);
  const checker = new RecallChecker(args);
  const acc = newPartial();
  for (let i = 0; i < items.length; i++) {
    if (args.shardCount > 1 && i % args.shardCount !== args.shardIndex) continue;
    checker.check(items[i], acc);
  }
  return acc;
}

function mergePartials(parts: readonly Partial[]): Partial {
  const merged = newPartial();
  for (const part of parts) {
    merged.rootPositions += part.rootPositions;
    merged.replyPositions += part.replyPositions;
    merged.rootTop1 += part.rootTop1;
    merged.rootTop3 += part.rootTop3;
    merged.rootTop1Value += part.rootTop1Value;
    merged.rootTop3Value += part.rootTop3Value;
    merged.replyTop1Hits += part.replyTop1Hits;
    merged.replyTop1ValueHits += part.replyTop1ValueHits;
    merged.ceilTop1 += part.ceilTop1;
    merged.ceilTop3 += part.ceilTop3;
    merged.ceilTop1Value += part.ceilTop1Value;
    merged.replyCeilTop1Hits += part.replyCeilTop1Hits;
    for (const r of part.ceilRegrets) merged.ceilRegrets.push(r);
    merged.illegalTurns += part.illegalTurns;
    merged.emptyLists += part.emptyLists;
    merged.cheapCandidates += part.cheapCandidates;
    merged.refCandidates += part.refCandidates;
    merged.f16Checked += part.f16Checked;
    merged.f16Present += part.f16Present;
    merged.homeRaceChecked += part.homeRaceChecked;
    merged.homeRacePresent += part.homeRacePresent;
    for (const r of part.regrets) merged.regrets.push(r);
    for (const n of part.notes) if (merged.notes.length < MAX_NOTES) merged.notes.push(n);
  }
  return merged;
}

function spawnShard(args: Args, index: number, count: number): Promise<void> {
  const cliArgs = [
    '--import', 'tsx', SELF,
    '--corpus', args.corpus,
    '--positions', String(args.positions),
    '--reply-positions', String(args.replyPositions),
    '--k', String(args.k),
    '--deep', String(args.deep),
    ...(args.arm === null ? [] : ['--arm', args.arm]),
    '--reply-node-gen', args.replyNodeGen,
    ...(args.verbose ? ['--verbose'] : []),
    '--shard-index', String(index),
    '--shard-count', String(count),
    '--out', path.relative(REPO_ROOT, shardOutPath(args.out, index)),
  ];
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, cliArgs, { cwd: REPO_ROOT, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', d => {
      stderr += String(d);
    });
    child.on('error', reject);
    child.on('exit', code => {
      if (code === 0) resolve();
      else reject(new Error(`recall shard ${index}/${count} exited ${String(code)}:\n${stderr.slice(-4000)}`));
    });
  });
}

function percentile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[index];
}

function ratio(hits: number, total: number): number {
  return total === 0 ? 0 : Math.round((hits / total) * 10000) / 10000;
}

/**
 * The share of an attainable maximum. `0` when the ceiling itself is 0 — that
 * is a measurement with nothing to attain, not a perfect score.
 */
function share(hits: number, ceiling: number): number {
  return ceiling === 0 ? 0 : Math.round((hits / ceiling) * 10000) / 10000;
}

function gitRevision(): string | null {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function writeArtifact(out: string, body: Record<string, unknown>): void {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(body, null, 2) + '\n');
}

function summarise(args: Args, merged: Partial): Record<string, unknown> {
  const regrets = [...merged.regrets].sort((a, b) => a - b);
  const ceilRegrets = [...merged.ceilRegrets].sort((a, b) => a - b);
  return {
    top1: ratio(merged.rootTop1, merged.rootPositions),
    top3: ratio(merged.rootTop3, merged.rootPositions),
    replyTop1: ratio(merged.replyTop1Hits, merged.replyPositions),
    // Value recall — the same comparison scored on the depth-2 VALUE rather than
    // on turn identity: `top1Value` is "the cheap list holds a turn as good as
    // the reference's best", `top3Value` "as good as its third-best distinct
    // value". Reported alongside because identity recall against a reference
    // that returns an order of magnitude more candidates is dominated by the
    // sample-size gap; see DEVIATIONS under M13.
    top1Value: ratio(merged.rootTop1Value, merged.rootPositions),
    top3Value: ratio(merged.rootTop3Value, merged.rootPositions),
    replyTop1Value: ratio(merged.replyTop1ValueHits, merged.replyPositions),
    regret_p50: percentile(regrets, 0.5),
    regret_p90: percentile(regrets, 0.9),
    regret_max: regrets.length === 0 ? 0 : regrets[regrets.length - 1],
    // --- the ceiling and the share of it the shipped generator attains -------
    //
    // `ceiling*` is the same measurement made on the `k` highest-static
    // candidates of the scored union — the best list any `K = k` generator
    // ranked by DESIGN §5.4's within-turn score could possibly return, chosen
    // with hindsight over `generateReference`'s whole output. It bounds the
    // instrument: no generator of this shape can beat it, so the ABSOLUTE
    // identity targets are only meaningful relative to it. `*Share` is the
    // production generator's fraction of that bound, which is the number that
    // actually measures the within-turn CONE.
    ceilingTop1: ratio(merged.ceilTop1, merged.rootPositions),
    ceilingTop3: ratio(merged.ceilTop3, merged.rootPositions),
    ceilingTop1Value: ratio(merged.ceilTop1Value, merged.rootPositions),
    ceilingReplyTop1: ratio(merged.replyCeilTop1Hits, merged.replyPositions),
    ceilingRegret_p50: percentile(ceilRegrets, 0.5),
    ceilingRegret_p90: percentile(ceilRegrets, 0.9),
    top1Share: share(merged.rootTop1, merged.ceilTop1),
    top3Share: share(merged.rootTop3, merged.ceilTop3),
    top1ValueShare: share(merged.rootTop1Value, merged.ceilTop1Value),
    replyTop1Share: share(merged.replyTop1Hits, merged.replyCeilTop1Hits),
    positions: merged.rootPositions,
    replyPositions: merged.replyPositions,
    illegalTurns: merged.illegalTurns,
    emptyLists: merged.emptyLists,
    f16PunisherPresent: merged.f16Checked > 0 && merged.f16Present === merged.f16Checked,
    homeRacePresent: merged.homeRaceChecked > 0 && merged.homeRacePresent === merged.homeRaceChecked,
    meanCheapCandidates:
      merged.rootPositions + merged.replyPositions === 0
        ? 0
        : Math.round((merged.cheapCandidates / (merged.rootPositions + merged.replyPositions)) * 10) / 10,
    meanRefCandidates:
      merged.rootPositions + merged.replyPositions === 0
        ? 0
        : Math.round((merged.refCandidates / (merged.rootPositions + merged.replyPositions)) * 10) / 10,
    notes: merged.notes,
    corpus: args.corpus,
    k: args.k,
    /**
     * E1.3. Present only under `--arm`, so the M13 gate artifact keeps exactly
     * the shape it had. `reference` restates what the truth was built from,
     * because EPIC-PLAN §2's finding — "the reference is K=2000 with its own
     * 120,000-node cap, not K=96 and not exhaustive" — means every number above
     * is recall RELATIVE TO A SELECTIVE REFERENCE and can miss a blind spot the
     * two generators share.
     */
    ...(args.arm === null
      ? {}
      : {
          ablation: {
            arm: args.arm,
            engine: armEngineName(args.arm),
            factor: requireArm(args.arm).factor,
            change: requireArm(args.arm).change,
            configHash: requireArm(args.arm).configHash,
            replyNodeGen: args.replyNodeGen,
            // A8 / L5-A1: what the depth-2 truth's leaves were scored under.
            // Before the fix these were always `default-v1` / `absent`,
            // whatever the arm was.
            weights: recallEnginePatch(args.arm).weights?.label ?? 'none',
            evalFix: evalFixKey(recallEnginePatch(args.arm).evalFix),
            reference: {
              kind: 'SELECTIVE',
              K: REFERENCE_K,
              nodeBudget: REFERENCE_NODE_BUDGET,
              widths: [...REFERENCE_WIDTHS],
              placePlans: REFERENCE_PLACE_PLANS,
              note: 'SELECTIVE reference: generateReference is K=2000 under a 120,000-node cap, not exhaustive; shared blind spots are invisible to relative recall (EPIC-PLAN §2).',
            },
          },
        }),
    deep: args.deep,
    deepCandidates: DEPTH2_CANDIDATES,
    replyK: REPLY_K,
    shards: args.shards,
    git: gitRevision(),
    node: process.version,
    at: new Date().toISOString(),
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  // Child shard: run our slice, write the partial, exit 0.
  //
  // EXIT CODE. This tool measures; it does not judge. DESIGN §7.1 puts the
  // thresholds in the gate row ("reads `gate.artifact`, applies
  // `gate.criterion`"), and `verify/run.ts` merges the artifact into the gate's
  // envelope ONLY when every step of the chain exited 0 — so a tool that exits
  // 1 on a missed target produces a red envelope with no numbers in it. A
  // successful measurement therefore exits 0 whatever it measured; a genuine
  // failure (an unreadable corpus, a crashed shard) still throws.
  if (args.shardIndex >= 0) {
    const part = runShard(args);
    writeArtifact(args.out, part as unknown as Record<string, unknown>);
    return;
  }

  let merged: Partial;
  const shardCount = Math.max(1, Math.floor(args.shards));
  if (shardCount <= 1) {
    merged = runShard({ ...args, shardIndex: 0, shardCount: 1 });
  } else {
    await Promise.all(Array.from({ length: shardCount }, (_, i) => spawnShard(args, i, shardCount)));
    const parts: Partial[] = [];
    for (let i = 0; i < shardCount; i++) {
      const file = shardOutPath(args.out, i);
      if (!fs.existsSync(file)) throw new Error(`recall/run: shard ${i} wrote no artifact at ${file}`);
      parts.push(JSON.parse(fs.readFileSync(file, 'utf8')) as Partial);
      fs.rmSync(file);
    }
    merged = mergePartials(parts);
  }

  const metrics = summarise(args, merged);
  writeArtifact(args.out, metrics);
  console.log(`recall: wrote ${args.out}`);
  console.log(
    JSON.stringify({
      top1: metrics.top1,
      top3: metrics.top3,
      replyTop1: metrics.replyTop1,
      top1Value: metrics.top1Value,
      top3Value: metrics.top3Value,
      // The gated quantities (DESIGN §9 addendum 2026-09-15): each statistic as
      // a share of the ceiling the instrument itself can reach at this `k`.
      ceilingTop1: metrics.ceilingTop1,
      top1Share: metrics.top1Share,
      top3Share: metrics.top3Share,
      top1ValueShare: metrics.top1ValueShare,
      replyTop1Share: metrics.replyTop1Share,
      regret_p50: metrics.regret_p50,
      regret_p90: metrics.regret_p90,
      regret_max: metrics.regret_max,
      positions: metrics.positions,
      replyPositions: metrics.replyPositions,
      illegalTurns: metrics.illegalTurns,
      emptyLists: metrics.emptyLists,
      f16PunisherPresent: metrics.f16PunisherPresent,
      homeRacePresent: metrics.homeRacePresent,
    }),
  );
}

/**
 * One recall measurement, in process, with no file written — `main()` minus its
 * IO and its sharding. `tests/lab/recall.test.ts` uses it to compare two arms
 * on one fixture in about two seconds each; nothing in the CLI path changed.
 */
export function recallProbe(argv: readonly string[]): Record<string, unknown> {
  const args = parseArgs([...argv]);
  return summarise(args, runShard({ ...args, shardIndex: 0, shardCount: 1 }));
}

// Run only when this file is the process entry point (the same guard
// `suites/run.ts` and `exam/run.ts` carry): `--shards N` re-invokes SELF as the
// entry point and still runs, and `tests/lab/recall.test.ts` can import
// `recallProbe`/`recallEnginePatch` without starting a measurement.
const invokedDirectly = process.argv[1] !== undefined && path.resolve(process.argv[1]) === SELF;
if (invokedDirectly) void main();
