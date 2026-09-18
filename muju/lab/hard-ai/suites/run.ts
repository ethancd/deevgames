/**
 * `npm run hard:suite -- {--suites <names> | --all} --engine <name>
 *   [--work <units>] [--shards <n>] [--out <path>]`
 * (DESIGN §7.5, MILESTONES.md M14). `--all` is A6's list — see `ALL_SUITES`.
 *
 * Runs one engine over the named `muju-suite-v1` files and scores each case by
 * DESIGN §7.5's rule: the chosen turn's END POSITION `Kpos` must be in `best`
 * and not in `avoid`. Nothing here looks at the action SEQUENCE — 14,959 of
 * them reach the initial position's 797 end positions, so a sequence-keyed
 * suite would be measuring tie-breaking, not judgement.
 *
 * ARTIFACT. One flat JSON object with a camelCase share per suite
 * (`tactics`, `spawnStrike` — points won over points offered) plus `homeMate`,
 * which is a CASE COUNT: `home-mate` carries 14 `points: 0` coverage rows where
 * no defence is better than another, and M14's gate asserts
 * `suite.homeMate === 56`, i.e. every one of its cases — scored and coverage —
 * produced a legal end position inside `best`. `invariants` is reported as the
 * PAIR of numbers below (`invariantsEval`, `invariantsSearched`, plus
 * `invariantPairs` and the per-pair `invariantDetail` table) and emits no bare
 * `invariants` key, so nothing can read one number while meaning the other.
 * `suites` carries the full per-suite breakdown and `failures` the first
 * `MAX_FAILURES` misses, with the key the engine actually reached, so a red
 * gate names the position. `wonOutright` and `deadPositions` name every case
 * the two canonical adjudications below touched.
 *
 * PAIRED CASES. `invariants` is not shaped like the others: DESIGN §5.13 authors
 * it as twenty PAIRS of post-turn positions (`violating`/`correct`) that differ
 * only in the decision the invariant is about, and its `best`/`avoid` are the
 * `Kpos` of those two positions — not end positions of a turn played from
 * `position`, which is itself the violating member. There is no common root the
 * two members are reachable from (M12's builder authors them directly as
 * post-turn states), so "do not choose the violating end position" can only be
 * read as a COMPARISON of the two, and the case passes when the side that just
 * moved prefers the correct member.
 *
 * BOTH readings of that comparison are measured and reported, because they are
 * different quantities and the artifact should not pretend otherwise:
 *
 *   - `invariantsEval` — DESIGN §5.13's own quantity: `eval/evaluate.ts`'s full
 *     (stage-2) score, where the twenty invariants ARE the penalty features.
 *     This is what the clause has always measured.
 *   - `invariantsSearched` — each member searched to the case's budget with the
 *     engine under test, compared as negamax compares a child: the OPPONENT is
 *     to move in both, so the side that just moved prefers the correct member
 *     exactly when the opponent scores the violating one higher.
 *
 * `suites.invariants` (and therefore the case count) follows the EVAL reading,
 * which is the one §5.13 defines. Measured at M14: eval 12/20, searched 5/20,
 * and neither can reach the 0.90 the gate row asked for — invariants 15 and 18
 * carry weight 0 by DESIGN ("structural", "not a feature"), so their two
 * members evaluate identically and no weighting can separate them (ceiling
 * 18/20), and six more pairs differ by -2016…-3662 cc in the violating member's
 * favour against penalty weights of -100…-800, because the violating member is
 * the one that bought, promoted or attacked and is materially richer. The
 * clause is a statement about the WEIGHT VECTOR and the fixtures, not about the
 * search; MILESTONES.md re-homes it to M18, which owns both. See DEVIATIONS
 * under M14.
 *
 * TWO CANONICAL ADJUDICATIONS sit on top of §7.5's `best`/`avoid` rule, because
 * a stored key set can state something that is not true of the position it was
 * authored from. Both are decided by the CANONICAL engine (`src/game` through
 * `generateAllActions`/`applyAction`/`isLegalAction`), never by the engine under
 * test, and both are reported per case in the artifact so a reader can see
 * exactly how many cases each one touched.
 *
 *   - A WIN IS NEVER A MISS (`wonOutright`). If the chosen turn, replayed
 *     canonically, leaves `phase === 'victory'` with the mover as `winner`, the
 *     case passes whatever its key sets say. A suite case cannot legitimately
 *     ask an engine to decline winning the game, and two `home-mate` rows and
 *     four `spawn-strike` rows do exactly that today: their `best`/`avoid` were
 *     split on "does the invader still stand on the corner" and on
 *     `victoryReason === 'home-checkmate'`, so a turn that steps onto the corner
 *     and then eliminates the last defender — a win by any reading — lands in
 *     `avoid`.
 *
 *   - A DEAD POSITION IS A COVERAGE ROW (`deadPosition`). A case that FAILS is
 *     re-examined canonically: every end position of the root is enumerated and
 *     each is asked whether the opponent has a turn that wins on the spot. When
 *     EVERY end position loses at once there is no better and no worse turn to
 *     find, and the row is demoted to `points: 0` — it still has to produce a
 *     legal end position, which is all a lost position can ask. This is the
 *     rule `build-home-mate.ts` already applies to its rescue framing ("there
 *     is no correct defensive turn in a lost position, and a suite row that
 *     pretends otherwise would be scoring noise"); it is applied here to every
 *     suite, from the canonical rules rather than from the authoring script.
 *     Measured: four `home-mate` mate rows and six `tactics` promotion rows are
 *     dead in this sense, all ten by a complete enumeration. The check runs
 *     only on a miss, short-circuits on the first end position that survives,
 *     and gives up (leaving the miss a miss) past `DEAD_CALL_BUDGET`.
 *
 * THE ENGINE'S WEIGHTS (E3 lane 7's A7-1, applied 2026-09-17). Every searched
 * reading in this file — the `tactics`, `spawn-strike` and `home-mate` turns and
 * the `invariants` pairs' `invariantsSearched` column — is played by an engine
 * built from `suiteEnginePatch` below, which resolves the profile through
 * `bots/hard.ts hardEnginePatch`. Until A7-1 this file built the engine from
 * `hardConfigFor(...)` directly, whose `weights` field is PRESENT and is M4's
 * `placeholder-m4` vector (`version: 0`, all 58 feature weights zero, the 18
 * material priors intact); `HardEngine`'s substitution at `engine.ts:221` is
 * guarded by `cfg.weights === undefined` and therefore never fired, so every
 * searched number this file has ever printed for `hard@desktop` was a
 * MATERIAL-ONLY number. E3-PLAN.md's rules section states the rule this broke:
 * "Any lab script that constructs an engine goes through
 * `hardEnginePatch`/`createHardBot` or asserts `weights.version !== 0`". Both
 * are done now — the patch goes through `hardEnginePatch` AND the resolved
 * vector is asserted non-placeholder, so a future regression throws instead of
 * quietly scoring material. A6's suite baselines were measured under the
 * placeholder vector; the re-measurement under `default-v1` is
 * `docs/hard-ai/e3/E3.2-PRECONDITIONS.md`.
 *
 * THE EVAL COLUMN'S WEIGHTS (E3 lane 9's A9-1, applied by lane 13 2026-09-17).
 * A7-1 left the `invariants` EVAL reading alone: it was scored by a
 * module-level `new Evaluator(PAIR_REPLICA)`, which defaults to
 * `DEFAULT_WEIGHTS` and carries no `evalFix` block, so `invariantsEval` was the
 * CHAMPION's opinion under every `--engine` (measured at the E3 head:
 * `invariantDetail[].evalGapCc` identical row for row, 20 of 20 pairs, for
 * `hard@desktop`, `hard@ablate:eval-no-safety` and `hard@ablate:eval-correct-v1`).
 * `suitePairEvaluator` now builds it from the same patch the searched column's
 * engines use. `hard@desktop` is unmoved (.60, 12 of 20) because its resolved
 * vector IS `DEFAULT_WEIGHTS` and no profile writes `evalFix`; every other
 * engine's EVAL column changes meaning, which is why A9-1 was proposed rather
 * than applied by the lane that found it. `weightsLabel` and `evalFix` in the
 * artifact name what the run was read under.
 *
 * RULES ARE PROCESS-GLOBAL (`setUpkeepVariant`, `setElementGraph`,
 * `setCombatHandicap` are module-level in `src/game`), so every case applies
 * its stored `rules` block before packing and the cases run sequentially inside
 * a shard. `--shards N` splits the CASE list across N child processes of this
 * file, each owning a stride, and merges their partial artifacts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { GameState, PlayerId } from '../../../src/game/types';
import { setCombatHandicap } from '../../../src/game/combat';
import { setElementGraph } from '../../../src/game/elements';
import { setUpkeepVariant } from '../../../src/game/upkeep';
import { isLegalAction } from '../../../src/game/legality';
import { generateAllActions } from '../../../src/ai/moves';
import { applyAction } from '../../../src/ai/simulate';
import type { AIAction } from '../../../src/ai/types';
import { HardEngine } from '../../../src/ai/hard/engine';
import { Replica, allocState } from '../../../src/ai/hard/core/state';
import { Scratch } from '../../../src/ai/hard/core/bits';
import { TABLE_SCRATCH_BB, TABLE_SCRATCH_I8 } from '../../../src/ai/hard/tables/context';
import { Evaluator } from '../../../src/ai/hard/eval/evaluate';
import type { Side } from '../../../src/ai/hard/types';
import { kposHex } from '../../../src/ai/hard/verify/perft';
import { hardEnginePatch } from '../bots/hard';
import { evalFixKey } from '../ablate/arms';
import { readPositions, type RulesBlock, type StoredPosition } from '../positions/corpus';
import {
  caseVerdict,
  metricName,
  normalizeKey,
  readSuite,
  resolvePositionRef,
  type SuiteCase,
} from './format';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');
const SUITES_DIR = path.resolve(import.meta.dirname);
const POSITIONS_DIR = path.resolve(import.meta.dirname, '../positions');
const SELF = path.resolve(import.meta.dirname, 'run.ts');
const DEFAULT_OUT = path.resolve(REPO_ROOT, 'lab/results/hard-ai-verify/suite.json');
/** How many misses the artifact names. A red gate has to say WHICH positions
 * it lost, and a suite run is 175 cases, so this is generous on purpose. */
const MAX_FAILURES = 200;

/**
 * A6's `--all` list (`docs/hard-ai/e0/AMENDMENTS-DECIDED.md`: "`--all` =
 * tactics, spawn-strike, home-mate, invariants, plus economy and home-force
 * once they exist"), in A6's own order. `home-force` has no
 * `home-force.suite.json` yet, so the list is the five that exist; adding that
 * file is what adds the sixth name here.
 *
 * A9-5: A6 records `--all` as "implemented in E6.1 prep" and `parseArgs` had no
 * such argument, so every command in `docs/hard-ai/e3/E3.2-PRECONDITIONS.md`
 * spells the five out. `--all` is exactly that spelling, nothing more — no
 * suite's scoring, budget or metric name changes.
 */
export const ALL_SUITES: readonly string[] = Object.freeze([
  'tactics',
  'spawn-strike',
  'home-mate',
  'invariants',
  'economy',
]);

interface Args {
  suites: string[];
  engine: string;
  work: number;
  shards: number;
  shardIndex: number;
  shardCount: number;
  out: string;
}

export function parseArgs(argv: string[]): Args {
  const args: Args = {
    suites: ['tactics'],
    engine: 'hard@lab',
    work: 0,
    shards: 1,
    shardIndex: -1,
    shardCount: 1,
    out: DEFAULT_OUT,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--all') args.suites = [...ALL_SUITES];
    else if (a === '--suites') args.suites = argv[++i].split(',').map(s => s.trim()).filter(Boolean);
    else if (a === '--engine') args.engine = argv[++i];
    else if (a === '--work') args.work = Number(argv[++i]);
    else if (a === '--shards') args.shards = Number(argv[++i]);
    else if (a === '--shard-index') args.shardIndex = Number(argv[++i]);
    else if (a === '--shard-count') args.shardCount = Number(argv[++i]);
    else if (a === '--out') args.out = path.resolve(REPO_ROOT, argv[++i]);
    else throw new Error(`hard:suite: unrecognised argument "${a}"`);
  }
  return args;
}

interface WorkItem {
  suite: string;
  index: number;
  testCase: SuiteCase;
  state: GameState;
  rules: RulesBlock;
  /** `invariants`-shaped rows: the paired post-turn positions (see the header). */
  pair?: { violating: GameState; correct: GameState };
}

interface SuiteTally {
  cases: number;
  passed: number;
  points: number;
  pointsWon: number;
}

interface Failure {
  suite: string;
  id: string;
  endKey: string;
  source: string;
  reason: 'not-in-best' | 'in-avoid' | 'no-actions' | 'prefers-violating';
}

interface Partial {
  suites: Record<string, SuiteTally>;
  failures: Failure[];
  illegalTurns: number;
  divergences: number;
  cases: number;
  /** Cases credited because the chosen turn WON the game (adjudication 1). */
  wonOutright: string[];
  /** Cases demoted to coverage rows because every turn loses at once (adj. 2). */
  deadPositions: string[];
  /** Misses whose dead-position proof ran out of canonical calls; they stay misses. */
  deadBudgetExceeded: string[];
  /** One row per `invariants` pair, under both readings (see the header). */
  pairs: PairRow[];
}

interface PairRow {
  id: string;
  invariant: number;
  /** `eval(correct) - eval(violating)` from the moving side's point of view; > 0 passes. */
  evalGapCc: number;
  evalPass: boolean;
  /** `search(violating) - search(correct)` from the OPPONENT's point of view; > 0 passes. */
  searchGapCc: number;
  searchPass: boolean;
}

function emptyPartial(): Partial {
  return {
    suites: {},
    failures: [],
    illegalTurns: 0,
    divergences: 0,
    cases: 0,
    wonOutright: [],
    deadPositions: [],
    deadBudgetExceeded: [],
    pairs: [],
  };
}

function tallyFor(partial: Partial, suite: string): SuiteTally {
  const existing = partial.suites[suite];
  if (existing !== undefined) return existing;
  const fresh: SuiteTally = { cases: 0, passed: 0, points: 0, pointsWon: 0 };
  partial.suites[suite] = fresh;
  return fresh;
}

function applyRules(rules: RulesBlock): void {
  setElementGraph(rules.elementGraph);
  setUpkeepVariant(rules.upkeep);
  setCombatHandicap('white', rules.combatHandicap.white);
  setCombatHandicap('black', rules.combatHandicap.black);
}

/** Every case of every named suite, in a deterministic order. */
function buildWorkList(suiteNames: readonly string[]): WorkItem[] {
  const out: WorkItem[] = [];
  const cache = new Map<string, StoredPosition[]>();
  for (const name of suiteNames) {
    const suiteFile = path.join(SUITES_DIR, `${name}.suite.json`);
    if (!fs.existsSync(suiteFile)) throw new Error(`hard:suite: no such suite "${name}" (${suiteFile})`);
    const suite = readSuite(suiteFile);
    for (let i = 0; i < suite.cases.length; i++) {
      const testCase = suite.cases[i];
      const ref = resolvePositionRef(testCase.position, REPO_ROOT, SUITES_DIR, POSITIONS_DIR);
      let positions = cache.get(ref.file);
      if (positions === undefined) {
        positions = readPositions(ref.file);
        cache.set(ref.file, positions);
      }
      const stored = positions.find(sp => sp.id === ref.id);
      if (stored === undefined) throw new Error(`hard:suite: ${name}#${testCase.id} refers to missing position "${testCase.position}"`);
      const raw = testCase as SuiteCase & { violating?: string; correct?: string };
      let pair: WorkItem['pair'];
      if (typeof raw.violating === 'string' && typeof raw.correct === 'string') {
        const load = (r: string): GameState => {
          const at = resolvePositionRef(r, REPO_ROOT, SUITES_DIR, POSITIONS_DIR);
          let list = cache.get(at.file);
          if (list === undefined) {
            list = readPositions(at.file);
            cache.set(at.file, list);
          }
          const found = list.find(sp => sp.id === at.id);
          if (found === undefined) throw new Error(`hard:suite: ${name}#${testCase.id} refers to missing position "${r}"`);
          return found.state;
        };
        pair = { violating: load(raw.violating), correct: load(raw.correct) };
      }
      out.push({ suite: name, index: i, testCase, state: stored.state, rules: stored.rules, pair });
    }
  }
  return out;
}

/**
 * CANONICAL ADJUDICATION 1 (see the module header). Replays `actions` from
 * `state` through the canonical engine, refusing anything `isLegalAction`
 * refuses, and reports whether the game ended with `mover` as the winner.
 */
function wonOutright(state: GameState, actions: readonly AIAction[], mover: PlayerId): boolean {
  let current = state;
  for (const action of actions) {
    if (!isLegalAction(current, action)) return false;
    const next = applyAction(current, action);
    if (next === current) return false;
    current = next;
  }
  return current.phase === 'victory' && current.winner === mover;
}

/** Canonical calls one `deadPosition` proof may spend before it gives up. */
const DEAD_CALL_BUDGET = 3_000_000;

class CallBudget {
  private left = DEAD_CALL_BUDGET;
  take(): boolean {
    if (this.left <= 0) return false;
    this.left--;
    return true;
  }
}

/**
 * Every end position of one macro turn from `root`, keyed by `Kpos` — the same
 * definition `verify/perft.ts` and the suite builders use: the game ended, or
 * the side to move / turn number changed. Mid-turn states transpose heavily, so
 * each distinct `Kturn` is visited once. Returns null when the budget ran out.
 */
function turnEndPositions(root: GameState, budget: CallBudget): Map<string, GameState> | null {
  const out = new Map<string, GameState>();
  const seen = new Set<string>();
  const rootPlayer = root.turn.currentPlayer;
  const rootTurnNumber = root.turn.turnNumber;
  let overflow = false;
  const visit = (state: GameState): void => {
    if (overflow) return;
    if (!budget.take()) {
      overflow = true;
      return;
    }
    const p = DEAD_REPLICA.pack(state, DEAD_SCRATCH);
    const turnKey = `${(p.kturnHi >>> 0).toString(16)}:${(p.kturnLo >>> 0).toString(16)}`;
    if (seen.has(turnKey)) return;
    seen.add(turnKey);
    for (const action of generateAllActions(state, state.turn.currentPlayer)) {
      if (overflow) return;
      const next = applyAction(state, action);
      if (next === state) continue;
      const done =
        next.phase !== 'playing' ||
        next.turn.currentPlayer !== rootPlayer ||
        next.turn.turnNumber !== rootTurnNumber;
      if (!done) {
        visit(next);
        continue;
      }
      const key = kposHex(DEAD_REPLICA.pack(next, DEAD_SCRATCH));
      if (!out.has(key)) out.set(key, next);
    }
  };
  visit(root);
  return overflow ? null : out;
}

/** True when some turn from `state` ends the game in the side-to-move's favour. */
function winsAtOnce(state: GameState, budget: CallBudget): boolean | null {
  const mover = state.turn.currentPlayer;
  const ends = turnEndPositions(state, budget);
  if (ends === null) return null;
  for (const end of ends.values()) if (end.phase === 'victory' && end.winner === mover) return true;
  return false;
}

/**
 * CANONICAL ADJUDICATION 2 (see the module header): every end position of the
 * mover's turn hands the opponent a win on the spot, so no turn from `root` is
 * better than any other. Short-circuits on the first survivor; null means the
 * budget ran out and the caller must treat the case as a plain miss.
 */
function deadPosition(root: GameState): boolean | null {
  const budget = new CallBudget();
  const mover = root.turn.currentPlayer;
  const ends = turnEndPositions(root, budget);
  if (ends === null) return null;
  if (ends.size === 0) return false;
  for (const end of ends.values()) {
    if (end.phase === 'victory') {
      // Already decided: a win for the mover is not a dead position at all,
      // and a loss is one of the losses this proof is counting.
      if (end.winner === mover) return false;
      continue;
    }
    const answered = winsAtOnce(end, budget);
    if (answered === null) return null;
    if (!answered) return false;
  }
  return true;
}

const DEAD_REPLICA = new Replica();
const DEAD_SCRATCH = allocState();

/** `eval/evaluate.ts`'s full (stage-2) score of `state` from `side`'s point of
 * view — DESIGN §5.13's own quantity, where the twenty invariants are the
 * penalty features. */
function evaluateFor(evaluator: Evaluator, state: GameState, side: Side): number {
  const p = PAIR_REPLICA.pack(state, PAIR_SCRATCH_STATE);
  evaluator.invalidate();
  return evaluator.full(p, side, PAIR_SCRATCH, 0);
}

const PAIR_REPLICA = new Replica();
const PAIR_SCRATCH_STATE = allocState();
const PAIR_SCRATCH = new Scratch(1, TABLE_SCRATCH_BB, TABLE_SCRATCH_I8, 2);

/**
 * The evaluator the EVAL column is scored with (E3 lane 9's A9-1, applied by
 * lane 13 2026-09-17). It was a module-level `new Evaluator(PAIR_REPLICA)`,
 * i.e. `DEFAULT_WEIGHTS` and no `evalFix` block — the CHAMPION's judgement
 * under any `--engine`, which is why `invariantDetail[].evalGapCc` was
 * identical row for row between `hard@desktop` and `hard@ablate:eval-no-safety`
 * (20 of 20 pairs, measured before this change). It now carries the same two
 * things `HardEngine`'s own evaluator carries (`src/ai/hard/engine.ts:259`):
 * the resolved weight vector and the `evalFix` block, both off the SAME patch
 * the searched column's engines are built from, so the two columns read one
 * engine.
 *
 * For `hard@desktop` this is a no-op by construction — the resolved vector is
 * `DEFAULT_WEIGHTS` and no profile writes `evalFix` — which is the check that
 * the A6-baselined `invariantsEval` .60 is unmoved.
 */
export function suitePairEvaluator(engine: string): Evaluator {
  const patch = suiteEnginePatch(engine);
  const weights = patch.weights;
  if (weights === undefined) throw new Error(`hard:suite: ${engine} resolved no weight vector for the EVAL column`);
  return new Evaluator(PAIR_REPLICA, weights, patch.evalFix ?? null);
}

/**
 * The engine patch every searched reading in this file is played with (A7-1).
 * `hardEnginePatch` substitutes `DEFAULT_WEIGHTS` for M4's placeholder vector;
 * the assertion is the second half of E3-PLAN.md's rule, so that a profile or
 * arm that somehow still resolves to `version: 0` stops the run instead of
 * reporting a material-only score as the engine's judgement.
 */
// (`Partial` is this file's own artifact interface, so the patch type is taken
// from `hardEnginePatch` itself rather than spelled with TS's utility type.)
export function suiteEnginePatch(engine: string): ReturnType<typeof hardEnginePatch> {
  const patch = hardEnginePatch(engine.startsWith('hard@') ? engine.slice('hard@'.length) : engine);
  if (patch.weights === undefined || patch.weights.version === 0) {
    throw new Error(
      `hard:suite: ${engine} resolved to placeholder weights (${patch.weights?.label ?? 'none'}, version ` +
        `${patch.weights?.version ?? 'none'}); the searched readings would be material-only (E3 A7-1)`,
    );
  }
  return patch;
}

/**
 * The EVAL column, engine by engine, with no search — the column A9-1 is about,
 * exposed so `tests/lab/suites.test.ts` can compare two engines on it in
 * milliseconds instead of running two 20-second suite rows. The arithmetic is
 * the one `runShard` uses below (`correct − violating`, both from the point of
 * view of the side that just moved), and rules are process-global, so each item
 * applies its own before it is scored.
 */
export function suitePairGaps(engine: string, suiteName = 'invariants'): { id: string; evalGapCc: number }[] {
  const evaluator = suitePairEvaluator(engine);
  const out: { id: string; evalGapCc: number }[] = [];
  for (const item of buildWorkList([suiteName])) {
    if (item.pair === undefined) continue;
    applyRules(item.rules);
    const side: Side = item.testCase.side === 'black' ? 1 : 0;
    const violating = evaluateFor(evaluator, item.pair.violating, side);
    const correct = evaluateFor(evaluator, item.pair.correct, side);
    out.push({ id: item.testCase.id, evalGapCc: correct - violating });
  }
  return out;
}

async function runShard(args: Args, items: readonly WorkItem[]): Promise<Partial> {
  const partial = emptyPartial();
  const patch = suiteEnginePatch(args.engine);
  // A9-1: one evaluator per shard, carrying the engine's own weights and
  // `evalFix` block (see `suitePairEvaluator`).
  const pairEval = suitePairEvaluator(args.engine);
  for (const item of items) {
    applyRules(item.rules);
    const work = args.work > 0 ? args.work : item.testCase.budget.work;
    const tally = tallyFor(partial, item.suite);
    tally.cases++;
    partial.cases++;
    // `points` is added at the END of the case: a `deadPosition` demotion turns
    // the row into a coverage row, and a coverage row offers no points.
    let offered = item.testCase.points;

    if (item.pair !== undefined) {
      const side: Side = item.testCase.side === 'black' ? 1 : 0;
      // The EVAL reading (DESIGN §5.13's own): both members scored from the
      // point of view of the side that just moved, which must prefer `correct`.
      const evalViolating = evaluateFor(pairEval, item.pair.violating, side);
      const evalCorrect = evaluateFor(pairEval, item.pair.correct, side);
      const evalPass = evalCorrect > evalViolating;
      // The SEARCHED reading: both members have the OPPONENT to move and
      // `searchTurn` scores from the side-to-move's point of view, so "the side
      // that just moved prefers the correct member" is "the opponent scores the
      // violating one higher".
      const searchViolating = (await new HardEngine(patch).searchTurn(item.pair.violating, { work })).scoreCc;
      const searchCorrect = (await new HardEngine(patch).searchTurn(item.pair.correct, { work })).scoreCc;
      const searchPass = searchViolating > searchCorrect;
      partial.pairs.push({
        id: item.testCase.id,
        invariant: item.testCase.invariant ?? 0,
        evalGapCc: evalCorrect - evalViolating,
        evalPass,
        searchGapCc: searchViolating - searchCorrect,
        searchPass,
      });
      tally.points += offered;
      if (evalPass) {
        tally.passed++;
        tally.pointsWon += offered;
      } else if (partial.failures.length < MAX_FAILURES) {
        partial.failures.push({
          suite: item.suite,
          id: item.testCase.id,
          endKey: `eval correct-violating ${evalCorrect - evalViolating} cc; searched violating-correct ${searchViolating - searchCorrect} cc`,
          source: 'pair',
          reason: 'prefers-violating',
        });
      }
      continue;
    }

    const engine = new HardEngine(patch);
    const result = await engine.searchTurn(item.state, { work });
    if (result.fallback === 'divergence') partial.divergences++;
    if (result.actions.length === 0) {
      partial.illegalTurns++;
      tally.points += offered;
      if (partial.failures.length < MAX_FAILURES) {
        partial.failures.push({ suite: item.suite, id: item.testCase.id, endKey: '', source: result.source, reason: 'no-actions' });
      }
      continue;
    }
    const endKey = normalizeKey(result.endKey);
    let passed = caseVerdict(item.testCase, endKey);
    const reason: Failure['reason'] = item.testCase.avoid.some(k => normalizeKey(k) === endKey) ? 'in-avoid' : 'not-in-best';

    if (!passed && wonOutright(item.state, result.actions, item.state.turn.currentPlayer)) {
      // A win is never a miss (module header, adjudication 1).
      passed = true;
      partial.wonOutright.push(`${item.suite}#${item.testCase.id}`);
    }
    if (!passed) {
      // A dead position is a coverage row (module header, adjudication 2).
      const dead = deadPosition(item.state);
      if (dead === true) {
        passed = true;
        offered = 0;
        partial.deadPositions.push(`${item.suite}#${item.testCase.id}`);
      } else if (dead === null) {
        partial.deadBudgetExceeded.push(`${item.suite}#${item.testCase.id}`);
      }
    }

    tally.points += offered;
    if (passed) {
      tally.passed++;
      tally.pointsWon += offered;
    } else if (partial.failures.length < MAX_FAILURES) {
      partial.failures.push({ suite: item.suite, id: item.testCase.id, endKey, source: result.source, reason });
    }
  }
  return partial;
}

function mergePartials(parts: readonly Partial[]): Partial {
  const merged = emptyPartial();
  for (const part of parts) {
    for (const [name, tally] of Object.entries(part.suites)) {
      const into = tallyFor(merged, name);
      into.cases += tally.cases;
      into.passed += tally.passed;
      into.points += tally.points;
      into.pointsWon += tally.pointsWon;
    }
    merged.illegalTurns += part.illegalTurns;
    merged.divergences += part.divergences;
    merged.cases += part.cases;
    merged.wonOutright.push(...part.wonOutright);
    merged.deadPositions.push(...part.deadPositions);
    merged.deadBudgetExceeded.push(...part.deadBudgetExceeded);
    merged.pairs.push(...part.pairs);
    for (const f of part.failures) if (merged.failures.length < MAX_FAILURES) merged.failures.push(f);
  }
  merged.failures.sort((a, b) => (a.suite === b.suite ? a.id.localeCompare(b.id) : a.suite.localeCompare(b.suite)));
  merged.wonOutright.sort();
  merged.deadPositions.sort();
  merged.deadBudgetExceeded.sort();
  merged.pairs.sort((a, b) => a.invariant - b.invariant || a.id.localeCompare(b.id));
  return merged;
}

function spawnShard(args: Args, index: number, count: number, tmp: string): Promise<Partial> {
  const cliArgs = [
    '--import', 'tsx', SELF,
    '--suites', args.suites.join(','),
    '--engine', args.engine,
    '--work', String(args.work),
    '--shard-index', String(index),
    '--shard-count', String(count),
    '--out', tmp,
  ];
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, cliArgs, { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', d => { stderr += String(d); });
    child.on('error', reject);
    child.on('exit', code => {
      if (code !== 0) {
        reject(new Error(`hard:suite shard ${index}/${count} exited ${code}:\n${stderr.slice(-4000)}`));
        return;
      }
      try {
        resolve(JSON.parse(fs.readFileSync(tmp, 'utf8')) as Partial);
      } catch (err) {
        reject(new Error(`hard:suite shard ${index}/${count}: unreadable partial ${tmp}: ${String(err)}`));
      }
    });
  });
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const items = buildWorkList(args.suites);

  if (args.shardIndex >= 0) {
    const mine = items.filter((_, i) => i % args.shardCount === args.shardIndex);
    const partial = await runShard(args, mine);
    fs.mkdirSync(path.dirname(args.out), { recursive: true });
    fs.writeFileSync(args.out, JSON.stringify(partial) + '\n');
    return;
  }

  let merged: Partial;
  const shards = Math.max(1, Math.min(args.shards, items.length));
  if (shards <= 1) {
    merged = await runShard(args, items);
  } else {
    const dir = path.join(path.dirname(args.out), `.suite-shards-${process.pid}`);
    fs.mkdirSync(dir, { recursive: true });
    const runs: Promise<Partial>[] = [];
    for (let i = 0; i < shards; i++) runs.push(spawnShard(args, i, shards, path.join(dir, `shard-${i}.json`)));
    const parts = await Promise.all(runs);
    merged = mergePartials(parts);
    fs.rmSync(dir, { recursive: true, force: true });
  }

  const enginePatch = suiteEnginePatch(args.engine);
  const metrics: Record<string, unknown> = {
    engine: args.engine,
    // A9-1: which vector and which correctness block BOTH columns were read
    // under. Before A9-1 the EVAL column was always `default-v1` / `absent`
    // whatever these said.
    weightsLabel: enginePatch.weights?.label ?? 'none',
    evalFix: evalFixKey(enginePatch.evalFix),
    work: args.work,
    shards,
    cases: merged.cases,
    illegalTurns: merged.illegalTurns,
    replicaDivergences: merged.divergences,
    failures: merged.failures,
    // The two canonical adjudications of the module header, named case by case
    // so a reader can check every one of them by hand.
    wonOutright: merged.wonOutright,
    deadPositions: merged.deadPositions,
    deadBudgetExceeded: merged.deadBudgetExceeded,
    suites: merged.suites,
  };
  let passedCases = 0;
  for (const [name, tally] of Object.entries(merged.suites)) {
    passedCases += tally.passed;
    // `home-mate` is scored by CASE COUNT (see the module header); `invariants`
    // is reported under BOTH readings below and deliberately emits no bare
    // `invariants` key, so nothing can read one number while meaning the other;
    // every other suite by the share of the points it offered.
    if (name === 'invariants') continue;
    metrics[metricName(name)] = name === 'home-mate' ? tally.passed : tally.points === 0 ? 0 : tally.pointsWon / tally.points;
  }
  metrics.passedCases = passedCases;
  if (merged.pairs.length > 0) {
    const evalPassed = merged.pairs.filter(r => r.evalPass).length;
    const searchPassed = merged.pairs.filter(r => r.searchPass).length;
    metrics.invariantPairs = merged.pairs.length;
    metrics.invariantsEval = evalPassed / merged.pairs.length;
    metrics.invariantsSearched = searchPassed / merged.pairs.length;
    metrics.invariantDetail = merged.pairs;
  }

  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, JSON.stringify(metrics, null, 2) + '\n');
  const summary: Record<string, unknown> = {};
  for (const name of args.suites) {
    if (name === 'invariants') {
      summary.invariantsEval = metrics.invariantsEval;
      summary.invariantsSearched = metrics.invariantsSearched;
      continue;
    }
    summary[metricName(name)] = metrics[metricName(name)];
  }
  console.log(`hard:suite: wrote ${args.out}`);
  console.log(
    JSON.stringify({
      ...summary,
      cases: merged.cases,
      illegalTurns: merged.illegalTurns,
      wonOutright: merged.wonOutright.length,
      deadPositions: merged.deadPositions.length,
    }),
  );
}

// Run only when this file is the process entry point (the same guard
// `exam/run.ts` carries): `--shards N` re-invokes SELF as a child, and
// `tests/lab/suites.test.ts` imports `suiteEnginePatch` without starting a run.
const invokedDirectly = process.argv[1] !== undefined && path.resolve(process.argv[1]) === SELF;
if (invokedDirectly) {
  main().catch(err => {
    console.error(`hard:suite: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
    process.exitCode = 1;
  });
}
