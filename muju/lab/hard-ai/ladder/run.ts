/**
 * `npm run hard:ladder -- --a <engine> --b <engine> --work fixed:<units>|wall:<ms>
 *   --handicaps 0,3 --pairs <n> --seed <s> --shards <k>
 *   [--openings <file.jsonl>] [--openings-skip <n>] [--openings-ids <id,id,...>]
 *   [--replays on|off] [--resume] [--allow-initial-only] [--allow-opening-reuse]
 *   [--sprt elo0,elo1,alpha,beta] [--legality as-shipped|strict]
 *   --out <dir>` (DESIGN §7.7, EPIC-PLAN E0.4).
 *
 * Orchestrates a full ladder run: builds the (opening, handicap, seed) pair
 * schedule (`pairing.ts`), fans it out across `shard.ts`'s child processes,
 * merges every shard's `games-<i>.jsonl` / `pairs-<i>.jsonl` /
 * `failures-<i>.jsonl`, computes SPRT/Elo, and writes the run's artifacts:
 * `manifest.json`, `games.jsonl`, `pairs.jsonl`, `failures.jsonl`,
 * `replays/<pairId>-<orientation>.json`, `sprt.json`, `elo.json`,
 * `summary.md`, and `metrics.json` (a flat, gate-criterion-friendly digest;
 * `hard:determinism` auto-merges any `<out>/metrics.json` it finds in a
 * sibling `<stem>-<label>` directory next to its own `--out` file, under the
 * key `<label>` — see `verify/determinism.ts`).
 *
 * OPENINGS. `--openings <file.jsonl>` takes rows of the form
 * `{"id": "...", "actions": [<OpeningAction>, ...]}` — the ACTION-LIST form,
 * the only form accepted (`openings.ts` explains why a raw `{id, state}` is
 * refused, and why an `OpeningAction` names units by the square they stand on
 * rather than by a unit id). Every opening is replayed through the shipped
 * legality check, simulator and invariant check before a single game is
 * played, once per handicap in the run, and an opening that is not
 * legal-by-replay aborts the run. Without `--openings` every pair starts from
 * the canonical initial state under the opening id `initial`.
 *
 * SELECTING OPENINGS. `--openings-skip <n>` drops the first `n` rows of the
 * file, in file order; `--openings-ids <id,id,...>` keeps only the named ids, in
 * the order given, and an id the file does not hold is an error. The two are
 * mutually exclusive and both require `--openings`. Selection happens BEFORE
 * the legal-by-replay validation and before the capacity guard below, so both
 * see only the openings the run will actually use, and the manifest's
 * `openings.ids` is the SELECTED list (with `openings.skip` and
 * `openings.selectedIds` saying how it was reached). A `--resume` compares
 * `openings.ids`, so resuming a run at a different `--openings-skip` is refused
 * as a different experiment (AMENDMENTS-DECIDED A15: later runs must not
 * replay the openings an earlier one already used). Both games of a
 * pair share the opening and the seed and exchange seats, and the pair's
 * identity is explicit: `pairId = "<openingId>:<handicap>:<pairIndex>"`.
 *
 * ARTIFACTS SURVIVE FAILURE. `manifest.json` is written BEFORE the first game
 * with `status: "running"` and finalized to `"complete"` or `"incomplete"`; a
 * game whose bot throws is recorded in `failures.jsonl` by the shard
 * (`worker.ts`) instead of killing it; a shard that dies outright no longer
 * discards the other shards' completed games — everything that finished is
 * merged, the run is marked `incomplete`, the artifacts are written and only
 * THEN does the process exit non-zero. `.shards/` is removed only on a
 * complete run.
 *
 * WAITING OUT A DEAD SHARD. `shard.ts#runSharded` rejects as soon as ONE shard
 * exits non-zero and does not wait for the others, so its rejection says
 * nothing about whether the siblings are finished — merging their files right
 * then reads a half-written run and reports `games: 0` for work that is still
 * in progress. On a shard failure this file therefore waits for every other
 * shard to SETTLE first (`awaitShardsSettled`): each shard publishes
 * `status-<i>.json` with its pid and a `done` flag (`worker.ts`), so a shard
 * counts as settled once it says `done`, or once its pid is gone. Only then are
 * the shard files merged, and the manifest's `error` records what each shard
 * was doing when the run gave up.
 *
 * SPRT. `--sprt elo0,elo1,alpha,beta` is validated at PARSE time
 * (`sprt.ts#validateSprtParams`), before a single game is played: the M19
 * phone row's inherited `0,0,0.05,0.05` cannot separate its hypotheses and is
 * refused with a pointer to `docs/hard-ai/e0/AMENDMENTS-PENDING.md` A1. Two
 * statistics are then reported over the same pairs. The SEQUENTIAL test
 * (`sprtSequential`) is the run's decision, `metrics.decision`: pairs are
 * checked one at a time in PAIRINDEX order — the predeclared checkpoint order,
 * fixed by `--pairs` and `--seed` before the run starts, not the order the
 * shards happened to finish in — and the first bound crossing at or after
 * `minPairs` decides. The BATCH test (`sprt`) over all pairs at once is
 * reported beside it. Both land in `sprt.json` under `sequential` / `batch`,
 * with the stop record under `stop`, and both are printed in `summary.md`.
 *
 * EARLY STOP. While the shards play, the runner re-evaluates the sequential
 * test over the contiguous prefix of completed pairs and, on a decision,
 * writes `.shards/sprt-stop.json`. Each shard checks for it BETWEEN pairs
 * (`worker.ts`), so it stops launching new pairs but always finishes the pair
 * it is inside: both orientations of every started pair reach the artifacts. A
 * run stopped that way is `complete`, not `incomplete`. The manifest's
 * `sprtStop` says which happened — `earlyStop: false` with a non-null
 * `decidedAtPair` means the whole schedule was played and the checkpoint is
 * only where the test would have stopped, which is the case for every run
 * whose decision arrives with the last pair.
 *
 * HOW MUCH THE STOP ACTUALLY SAVES. Two things bound it. A shard finishes the
 * pair it is inside, so up to `--shards` pairs are played after the signal.
 * More importantly `shard.ts` gives each shard a CONTIGUOUS slice of pair
 * indices (`pairing.ts#shardRange`), while the checkpoint prefix must be
 * contiguous in pairIndex: at `--shards k` the prefix cannot pass the end of
 * shard 0's slice until shard 0 is done, by which time the other shards have
 * played most of their own slices in parallel. At `--shards 1` the stop lands
 * where the test decides (a 40-pair Rush vs Random run at seed 5 decides at
 * pair 23 and plays 24); at `--shards 2` the same run still played all 40 and
 * the manifest recorded `pairsPlayedBeyondDecision: 17`. The manifest never
 * claims more than happened, and `decidedAtPair` is the decision either way.
 *
 * RESUME. `--resume` re-reads `<out>/games.jsonl` and `<out>/pairs.jsonl`,
 * keeps every pair that already has a `PairRow` (both games finished), and
 * plays only the rest. Games belonging to a pair that did NOT complete are
 * dropped and replayed, so the merged output can never hold two rows for the
 * same `pairId` + `orientation` — and that is asserted, not assumed. A resume
 * into an `--out` whose `manifest.json` names different engines, work, seed,
 * pairs, handicaps, legality or openings is REFUSED
 * (`resumeIdentityMismatches`): those rows are a different experiment.
 *
 * ATTRIBUTION. `computeMetrics` keys games off `pairId` + `orientation`, never
 * off position in the file, so a missing or failed game shifts nothing.
 *
 * PAIR INDEPENDENCE. Two engine arms are deterministic given position and
 * budget, and `hard@` ignores its seed outright (`src/ai/hard/engine.ts:215-217`,
 * `setSeed` is a no-op), so without `--openings` every pair at one handicap
 * replays the SAME game: the E0 pilot measured it (E0-PILOT-REPORT §7 P1). An
 * engine-vs-engine run of more than one pair without `--openings` is therefore
 * REFUSED unless `--allow-initial-only` is passed. The same argument bounds a
 * run that HAS openings: the schedule's independent cells are the (opening,
 * handicap) pairs, so an engine-vs-engine run of more than
 * `openings x handicaps` pairs would replay a cell it already scheduled with
 * nothing but a different seed, and is REFUSED unless `--allow-opening-reuse`
 * is passed (AMENDMENTS-DECIDED A15). An overridden run of either kind records
 * `openingsIndependent: false` with a warning in the manifest, the metrics and
 * the summary. Every run also counts `distinctGames` per orientation, from the
 * replays when they were written and from the `games.jsonl` tuple when they were
 * not, so a duplicate schedule is visible in the artifacts even when it was
 * produced some other way.
 *
 * OVERRUN TOLERANCE. `--overrun-tolerance <ms>ms|<pct>%|max(<ms>ms,<pct>%)`
 * separates an engine that lands a few ms past its turn allowance from one that
 * lands 1.5x past it (E0-PILOT-REPORT §7 P2). `timing.overAllowance` keeps the
 * untoleranced count and `timing.overruns` counts the turns past the tolerance.
 * The default `max(10ms,1%)` is FROZEN (AMENDMENTS-DECIDED A14) and every
 * artifact prints it with that citation. A14 also fixes what a violation does:
 * each arm reports `timing.<arm>.overrunRate = overruns / turns`, and a rate
 * above `OVERRUN_RATE_VOID_THRESHOLD` (5%) for EITHER arm voids the comparison
 * row — `decision: 'void'`, `voidReason` naming the arm and the rate, in the
 * manifest, `metrics.json` and `summary.md` — exactly as an adjudication rate
 * over 1% already does. `bots/hard.ts`'s own `hardBotTiming().overruns` is
 * untouched and stays raw.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import type { PlayerId } from '../../../src/game/types';
import { buildPairs, expandPair, type GameSpec, type Orientation, type PairAssignment } from './pairing';
import type { GameRow, PairRow, FailureRow, ShardConfig, SprtStopSignal } from './worker';
import { SHARD_CONFIG_FILE, SPRT_STOP_FILE, readShardStatus } from './worker';
import { HARD_DIVERGENCE_ANOMALY } from '../bots/hard';
import { INITIAL_OPENING, loadOpenings, sha256, type OpeningSpec } from './openings';
import { LADDER_RULES_VERSION, validateLadderOpenings } from './ruleset';
import {
  FALLBACK_KINDS,
  addFallbackCounts,
  describeFallbacks,
  emptyFallbackCounts,
  fallbackTotal,
  type FallbackCounts,
} from './fallbacks';
import { resolveEngine, parseWorkSpec, workKey, engineHasWork, type WorkSpec } from './engines';
import { runSharded } from './shard';
import {
  sprt,
  sprtSequential,
  validateSprtParams,
  type SprtDecision,
  type SprtParams,
  type SprtResult,
  type SprtSequentialResult,
} from './sprt';
import { eloEstimate, type EloEstimate } from './elo';
import { baselineIdentity, type SourceIdentity } from './identity';
import type { PlayerGameStats, ReplayFile, ReplayStep } from '../../harness/types';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');

export interface CliArgs {
  a: string;
  b: string;
  work: WorkSpec;
  handicaps: number[];
  pairs: number;
  seed: number;
  shards: number;
  sprt: SprtParams | null;
  legality: 'as-shipped' | 'strict';
  out: string;
  /** Path to the `--openings` JSONL file, or null for the canonical initial position only. */
  openingsPath: string | null;
  /** sha256 of the openings file's bytes (null when there is no file). */
  openingsSha256: string | null;
  /** Openings in schedule order, AFTER `--openings-skip` / `--openings-ids`; `[INITIAL_OPENING]` when `--openings` is absent. */
  openings: OpeningSpec[];
  /** `--openings-skip <n>`: how many leading rows of the file were dropped; null when the flag was absent. */
  openingsSkip: number | null;
  /** `--openings-ids <id,...>`: the ids named on the command line, in the order given; null when the flag was absent. */
  openingsSelectedIds: string[] | null;
  /** `--replays off` disables per-game replay files. */
  replays: boolean;
  /** `--resume`: keep the pairs a previous run at this `--out` already completed. */
  resume: boolean;
  /** `--allow-initial-only`: run an engine-vs-engine schedule that has no independence source anyway. */
  allowInitialOnly: boolean;
  /** `--allow-opening-reuse`: run an engine-vs-engine schedule with more pairs than (opening, handicap) cells. */
  allowOpeningReuse: boolean;
  /** `--overrun-tolerance <spec>`: how far past the turn allowance still counts as on time. */
  overrunTolerance: OverrunTolerance;
  /** The argv this run was invoked with, recorded in the manifest. */
  argv: string[];
}

/** Known `hard@<label>` profiles, named by the `--profile` rejection below. */
const HARD_PROFILE_HINT =
  'select a profile through the engine label instead, e.g. --a hard@phone --b hard@mobile ' +
  '(labels: lab, lab-dfpn, lab-refined, desktop, midrange, phone/mobile — lab/hard-ai/bots/hard.ts)';

/**
 * `Number('eight')` is `NaN` and `Number('')` is 0, so an unparsed count used
 * to reach `buildPairs` as `NaN` (a run that schedules nothing and reports
 * complete) or as a silent zero. Every numeric flag is therefore parsed
 * strictly: the whole string must be the number, and it must be in range.
 */
function strictNumber(raw: string): number {
  const text = raw.trim();
  // Number() accepts '', '0x10', 'Infinity' and whitespace; none of them is a
  // count a human meant to type.
  if (text === '' || !/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text)) return NaN;
  return Number(text);
}

function positiveInt(flag: string, raw: string): number {
  const n = strictNumber(raw);
  if (!Number.isInteger(n) || n < 1) throw new Error(`hard:ladder: invalid ${flag} "${raw}", expected a positive integer`);
  return n;
}

function nonNegativeInt(flag: string, raw: string): number {
  const n = strictNumber(raw);
  if (!Number.isInteger(n) || n < 0) throw new Error(`hard:ladder: invalid ${flag} "${raw}", expected a non-negative integer`);
  return n;
}

function finiteInt(flag: string, raw: string): number {
  const n = strictNumber(raw);
  if (!Number.isInteger(n)) throw new Error(`hard:ladder: invalid ${flag} "${raw}", expected a finite integer`);
  return n;
}

/**
 * How far past its turn allowance a turn may land and still count as on time.
 *
 * The E0 pilot found the overrun counter has no tolerance at all: `aiv2-hard`
 * landed 1-8 ms past a 3000 ms budget and counted as overrunning 44 of 44
 * turns, while `hard@lab`'s 4701 ms turn — 1.57x its budget — counted the same
 * (E0-PILOT-REPORT §7 P2). The VALUE is settled: A14 FROZE it at
 * `max(10 ms, 1% of the allowance)` (AMENDMENTS-DECIDED A14), so `frozen` is
 * always true and every artifact that prints a tolerance says which entry
 * froze it. A run may still pass `--overrun-tolerance` to re-derive the counts
 * under another value (a zero tolerance restores the raw count), and the spec
 * it used is recorded beside the numbers.
 */
export interface OverrunTolerance {
  /** The spec exactly as typed, e.g. `max(10ms,1%)`. */
  spec: string;
  /** The flat part, in ms; 0 when the spec names none. */
  ms: number;
  /** The proportional part, in percent of the turn allowance; 0 when the spec names none. */
  pct: number;
  /** Always true: A14 ratified the tolerance, so every artifact reports it as frozen rather than proposed. */
  frozen: true;
}

/** The FROZEN tolerance (AMENDMENTS-DECIDED A14). */
export const DEFAULT_OVERRUN_TOLERANCE_SPEC = 'max(10ms,1%)';

/** The line every artifact prints beside a tolerance, naming the entry that froze it (A14). */
export const OVERRUN_TOLERANCE_CITATION = 'frozen (AMENDMENTS-DECIDED A14)';

/**
 * A14's violation bar: an arm whose `overruns / turns` exceeds this VOIDS the
 * comparison row. `> 0.05` exactly — a rate of exactly 5% is not a violation.
 */
export const OVERRUN_RATE_VOID_THRESHOLD = 0.05;

/** Where the hard adapter throws its seed away, cited by the pair-independence refusal. */
export const HARD_SET_SEED_NOOP_REF = 'src/ai/hard/engine.ts:215-217';

const TOLERANCE_MS_RE = /^(\d+(?:\.\d+)?)ms$/;
const TOLERANCE_PCT_RE = /^(\d+(?:\.\d+)?)%$/;

/** `"<ms>ms"`, `"<pct>%"` or `"max(<ms>ms,<pct>%)"`; anything else is refused rather than silently read as 0. */
export function parseOverrunTolerance(spec: string): OverrunTolerance {
  const text = spec.trim().toLowerCase().replace(/\s+/g, '');
  const bad = (): never => {
    throw new Error(
      `hard:ladder: invalid --overrun-tolerance "${spec}", expected <ms>ms, <pct>% or max(<ms>ms,<pct>%)`,
    );
  };
  const term = (t: string): { kind: 'ms' | 'pct'; value: number } => {
    const asMs = TOLERANCE_MS_RE.exec(t);
    if (asMs) return { kind: 'ms', value: Number(asMs[1]) };
    const asPct = TOLERANCE_PCT_RE.exec(t);
    if (asPct) return { kind: 'pct', value: Number(asPct[1]) };
    return bad();
  };
  const outer = /^max\((.*)\)$/.exec(text);
  if (outer) {
    const parts = outer[1].split(',');
    if (parts.length !== 2) bad();
    const [x, y] = parts.map(term);
    // `max(10ms,20ms)` is just the larger of the two and hides that the spec
    // names no proportional part at all.
    if (x.kind === y.kind) bad();
    const flat = x.kind === 'ms' ? x : y;
    const pct = x.kind === 'pct' ? x : y;
    return { spec, ms: flat.value, pct: pct.value, frozen: true };
  }
  const single = term(text);
  return { spec, ms: single.kind === 'ms' ? single.value : 0, pct: single.kind === 'pct' ? single.value : 0, frozen: true };
}

/** The tolerance in ms against a concrete allowance; null in fixed-work mode, which has no clock to overrun. */
export function toleranceMsFor(tolerance: OverrunTolerance, allowanceMs: number | null): number | null {
  if (allowanceMs === null) return null;
  return Math.max(tolerance.ms, (tolerance.pct / 100) * allowanceMs);
}

/**
 * Why this schedule's pairs would not be independent, or null when they can be.
 *
 * Both arms engines, more than one pair, and no `--openings`: every pair at a
 * handicap starts from the canonical initial position, both engines are
 * deterministic given position and budget, and the per-pair seed reaches
 * neither of them — `hard@` discards it outright. The E0 pilot measured exactly
 * that (E0-PILOT-REPORT §7 P1), and a statistic that counts copies as
 * independent observations reports an interval ~sqrt(n) too narrow.
 */
export function pairIndependenceRefusal(args: Pick<CliArgs, 'a' | 'b' | 'pairs' | 'openingsPath'>): string | null {
  if (!engineHasWork(args.a) || !engineHasWork(args.b)) return null;
  if (args.pairs <= 1) return null;
  if (args.openingsPath !== null) return null;
  return (
    `hard:ladder: refusing ${args.pairs} pairs of ${args.a} vs ${args.b} without --openings: those pairs would not ` +
    'be independent. Both arms are engines, both are deterministic given position and budget, and the per-pair seed ' +
    `reaches neither — the hard adapter's engine throws it away (${HARD_SET_SEED_NOOP_REF}: setSeed is a no-op) — so ` +
    'without --openings every pair at one handicap starts from the same canonical position and replays the same ' +
    'game. The E0 pilot measured it: pilot-h0 pairs initial:0:0 and initial:0:1 carry different scheduled seeds and ' +
    'played identical games in both orientations (docs/hard-ai/e0/E0-PILOT-REPORT.md §7 P1), so an interval over n ' +
    'such pairs is about sqrt(n) too narrow. Pass --openings <file.jsonl> to give the pairs an independence source, ' +
    'or --allow-initial-only to run anyway (the artifacts then record openingsIndependent: false and the run ' +
    'describes one game per orientation, not n).'
  );
}

/** The fields the independence helpers read: both refusals and the warning they produce. */
export type IndependenceArgs = Pick<
  CliArgs,
  'a' | 'b' | 'pairs' | 'openingsPath' | 'openings' | 'handicaps' | 'allowOpeningReuse'
>;

/** How many INDEPENDENT cells a schedule with openings has: one per (opening, handicap). */
export function openingCapacity(args: Pick<CliArgs, 'openings' | 'handicaps'>): number {
  return args.openings.length * new Set(args.handicaps).size;
}

/**
 * Why this schedule would replay a cell it already scheduled, or null when it
 * would not (AMENDMENTS-DECIDED A15).
 *
 * `pairing.ts#buildPairs` cycles handicaps fastest and advances the opening
 * once per handicap sweep, so the schedule's distinct starting conditions are
 * exactly the (opening, handicap) cells — `openings x handicaps` of them. Ask
 * for more pairs than that and the extra pairs land on cells the schedule
 * already holds, differing only in their seed; both arms being engines, the
 * seed reaches neither of them (P1), so those pairs replay games already
 * played. Only checked for a run that HAS an openings file: the no-openings
 * case is `pairIndependenceRefusal`'s, with its own `--allow-initial-only`.
 */
export function openingCapacityRefusal(
  args: Pick<CliArgs, 'a' | 'b' | 'pairs' | 'openingsPath' | 'openings' | 'handicaps'>,
): string | null {
  if (!engineHasWork(args.a) || !engineHasWork(args.b)) return null;
  if (args.openingsPath === null) return null;
  const capacity = openingCapacity(args);
  if (args.pairs <= capacity) return null;
  const handicapCount = new Set(args.handicaps).size;
  return (
    `hard:ladder: refusing ${args.pairs} pairs of ${args.a} vs ${args.b} over ${args.openings.length} opening(s) x ` +
    `${handicapCount} handicap(s) = ${capacity} independent (opening, handicap) cell(s): ${args.pairs - capacity} ` +
    'pair(s) would replay a cell the schedule already holds, with a different seed and nothing to spend it on. Both ' +
    'arms are engines, both are deterministic given position and budget, and the per-pair seed reaches neither — the ' +
    `hard adapter's engine throws it away (${HARD_SET_SEED_NOOP_REF}: setSeed is a no-op) — so a repeated cell ` +
    'replays the game its first occurrence already played, which is what the E0 pilot measured ' +
    '(docs/hard-ai/e0/E0-PILOT-REPORT.md §7 P1), and an interval that counts the copies is too narrow. Lower --pairs ' +
    `to at most ${capacity}, give the run more openings (--openings, narrowed with --openings-skip / --openings-ids), ` +
    'or pass --allow-opening-reuse to run anyway (the artifacts then record openingsIndependent: false).'
  );
}

/** True when this run's pairs have an independence source; false under `--allow-initial-only` or `--allow-opening-reuse`. */
export function openingsIndependent(args: IndependenceArgs): boolean {
  return pairIndependenceRefusal(args) === null && openingCapacityRefusal(args) === null;
}

/** The one line an overridden run carries in its manifest, metrics and summary; null when the pairs are independent. */
export function independenceWarning(args: IndependenceArgs): string | null {
  if (pairIndependenceRefusal(args) !== null) {
    return (
      `openingsIndependent: false — ${args.pairs} pairs of ${args.a} vs ${args.b} all start from the canonical initial ` +
      `position and both engines are deterministic (the hard adapter's setSeed is a no-op, ${HARD_SET_SEED_NOOP_REF}), ` +
      'so the pairs at one handicap replay one game per orientation (E0-PILOT-REPORT §7 P1): every interval here is ' +
      'descriptive only.'
    );
  }
  if (openingCapacityRefusal(args) !== null) {
    const capacity = openingCapacity(args);
    return (
      `openingsIndependent: false — ${args.pairs} pairs of ${args.a} vs ${args.b} over ${args.openings.length} ` +
      `opening(s) x ${new Set(args.handicaps).size} handicap(s) = ${capacity} independent (opening, handicap) cell(s), ` +
      `so ${args.pairs - capacity} pair(s) replay a cell already scheduled and both engines are deterministic (the ` +
      `hard adapter's setSeed is a no-op, ${HARD_SET_SEED_NOOP_REF}), giving copies rather than observations ` +
      '(E0-PILOT-REPORT §7 P1): every interval here is descriptive only.'
    );
  }
  return null;
}

/**
 * The `--openings-skip` / `--openings-ids` selection, applied to a loaded
 * openings file BEFORE it is validated or measured against the capacity guard.
 * Exactly one of the two may be given. `skip` drops leading rows in FILE order;
 * `ids` keeps the named openings in the order they are named, and an id the
 * file does not hold is an error rather than a silently shorter run.
 */
export function selectOpenings(
  openings: readonly OpeningSpec[],
  selection: { skip: number | null; ids: readonly string[] | null },
): OpeningSpec[] {
  if (selection.skip !== null && selection.ids !== null) {
    throw new Error('hard:ladder: --openings-skip and --openings-ids are mutually exclusive; pass one or neither');
  }
  if (selection.ids !== null) {
    const byId = new Map(openings.map(o => [o.id, o]));
    const seen = new Set<string>();
    const out: OpeningSpec[] = [];
    for (const id of selection.ids) {
      const opening = byId.get(id);
      if (opening === undefined) {
        throw new Error(
          `hard:ladder: --openings-ids names "${id}", which the openings file does not hold ` +
            `(it has ${openings.length}: ${openings.map(o => o.id).join(', ')})`,
        );
      }
      if (seen.has(id)) throw new Error(`hard:ladder: --openings-ids names "${id}" twice; each opening may be used once`);
      seen.add(id);
      out.push(opening);
    }
    if (out.length === 0) throw new Error('hard:ladder: --openings-ids selected no openings');
    return out;
  }
  if (selection.skip !== null) {
    if (selection.skip >= openings.length) {
      throw new Error(
        `hard:ladder: --openings-skip ${selection.skip} drops every opening in a file of ${openings.length}; ` +
          'nothing would be left to play',
      );
    }
    return openings.slice(selection.skip);
  }
  return [...openings];
}

export function parseArgs(argv: string[]): CliArgs {
  const get = (flag: string): string | null => {
    const i = argv.indexOf(flag);
    return i === -1 ? null : argv[i + 1];
  };
  const require = (flag: string): string => {
    const v = get(flag);
    if (v === null || v === undefined) throw new Error(`hard:ladder: missing ${flag}`);
    return v;
  };
  if (argv.includes('--profile')) {
    throw new Error(`hard:ladder: --profile is not a run-level knob and never had an effect; ${HARD_PROFILE_HINT}`);
  }
  const sprtRaw = get('--sprt');
  let sprtParams: SprtParams | null = null;
  if (sprtRaw) {
    const fields = sprtRaw.split(',').map(Number);
    const [elo0, elo1, alpha, beta] = fields;
    if (fields.length !== 4 || fields.some(n => !Number.isFinite(n))) {
      throw new Error(`hard:ladder: invalid --sprt "${sprtRaw}", expected elo0,elo1,alpha,beta`);
    }
    sprtParams = { elo0, elo1, alpha, beta };
    // BEFORE a single game is played: a parameter set the statistic cannot run
    // on would otherwise burn the whole run and report `continue` forever.
    try {
      validateSprtParams(sprtParams);
    } catch (err) {
      throw new Error(
        `hard:ladder: invalid --sprt "${sprtRaw}": ${err instanceof Error ? err.message : String(err)}. ` +
          'The M19 phone row inherited `--sprt 0,0,0.05,0.05`, whose hypotheses are identical and can never ' +
          'separate; docs/hard-ai/e0/AMENDMENTS-DECIDED.md A1 replaced it with the non-inferiority test ' +
          '`--sprt -25,0,0.05,0.05` (H0: 25 Elo weaker than shipped Medium; H1: equal). Use that spec.',
      );
    }
  }
  const toleranceRaw = get('--overrun-tolerance');
  const overrunTolerance = parseOverrunTolerance(toleranceRaw ?? DEFAULT_OVERRUN_TOLERANCE_SPEC);
  const replaysRaw = get('--replays');
  if (replaysRaw !== null && replaysRaw !== 'on' && replaysRaw !== 'off') {
    throw new Error(`hard:ladder: invalid --replays "${replaysRaw}", expected on|off`);
  }
  const handicaps = require('--handicaps').split(',').map(Number);
  if (handicaps.some(h => !Number.isFinite(h))) throw new Error(`hard:ladder: invalid --handicaps "${get('--handicaps')}"`);
  // `pairing.ts#buildPairs` cycles this list AS GIVEN, so a repeated handicap
  // schedules the same (opening, handicap) cell twice over — the duplicate
  // pairs A15's capacity guard exists to refuse, except that the guard counts
  // DISTINCT handicaps and so would not see them. Refused at parse time rather
  // than silently halving the schedule's independence.
  const duplicateHandicaps = [...new Set(handicaps.filter((h, i) => handicaps.indexOf(h) !== i))];
  if (duplicateHandicaps.length > 0) {
    throw new Error(
      `hard:ladder: invalid --handicaps "${get('--handicaps')}": ${duplicateHandicaps.join(', ')} listed more than ` +
        'once. The pair schedule cycles the handicaps as given, so a repeated handicap replays every (opening, ' +
        'handicap) cell it appears in, with nothing but a different seed to tell the copies apart ' +
        '(AMENDMENTS-DECIDED A15; E0-PILOT-REPORT §7 P1). List each handicap once, e.g. --handicaps 0,3.',
    );
  }

  const openingsRaw = get('--openings');
  const skipRaw = get('--openings-skip');
  const idsRaw = get('--openings-ids');
  if (skipRaw !== null && idsRaw !== null) {
    throw new Error('hard:ladder: --openings-skip and --openings-ids are mutually exclusive; pass one or neither');
  }
  if ((skipRaw !== null || idsRaw !== null) && !openingsRaw) {
    throw new Error(
      `hard:ladder: ${skipRaw !== null ? '--openings-skip' : '--openings-ids'} selects from an openings file; ` +
        'pass --openings <file.jsonl> too',
    );
  }
  const openingsSkip = skipRaw === null ? null : nonNegativeInt('--openings-skip', skipRaw);
  const openingsSelectedIds = idsRaw === null ? null : idsRaw.split(',').map(id => id.trim());
  if (openingsSelectedIds !== null && openingsSelectedIds.some(id => id === '')) {
    throw new Error(`hard:ladder: invalid --openings-ids "${idsRaw}", expected a comma-separated list of opening ids`);
  }
  let openings: OpeningSpec[] = [INITIAL_OPENING];
  let openingsPath: string | null = null;
  let openingsSha256: string | null = null;
  if (openingsRaw) {
    openingsPath = path.resolve(REPO_ROOT, openingsRaw);
    const file = loadOpenings(openingsPath);
    openingsSha256 = file.sha256;
    // Selection FIRST: the legal-by-replay validation below and the capacity
    // guard in this function both describe the openings the run will use, not
    // the ones the file happens to hold.
    openings = selectOpenings(file.openings, { skip: openingsSkip, ids: openingsSelectedIds });
    // Legal-by-replay UNDER THIS RUN'S RULE SET, or the run does not start
    // (EPIC-PLAN E1). `validateLadderOpenings` refuses a book that is not the
    // P1 (Phasing) one before it replays anything, so an E0/E1 Standard id can
    // never be relabelled as Phasing and measured as though it were — the
    // harness would build a Phasing state and replay Standard actions into it.
    validateLadderOpenings(openings, handicaps);
  }

  const args: CliArgs = {
    a: require('--a'),
    b: require('--b'),
    work: parseWorkSpec(require('--work')),
    handicaps,
    pairs: positiveInt('--pairs', require('--pairs')),
    seed: finiteInt('--seed', require('--seed')),
    shards: positiveInt('--shards', get('--shards') ?? '1'),
    sprt: sprtParams,
    legality: (get('--legality') ?? 'as-shipped') as 'as-shipped' | 'strict',
    out: path.resolve(REPO_ROOT, require('--out')),
    openingsPath,
    openingsSha256,
    openings,
    openingsSkip,
    openingsSelectedIds,
    replays: replaysRaw !== 'off',
    resume: argv.includes('--resume'),
    allowInitialOnly: argv.includes('--allow-initial-only'),
    allowOpeningReuse: argv.includes('--allow-opening-reuse'),
    overrunTolerance,
    argv: [...argv],
  };
  // BEFORE a single game is played, like the `--sprt` validation above: a
  // schedule whose pairs are copies of one another cannot be fixed afterwards.
  if (!args.allowInitialOnly) {
    const refusal = pairIndependenceRefusal(args);
    if (refusal !== null) throw new Error(refusal);
  }
  if (!args.allowOpeningReuse) {
    const refusal = openingCapacityRefusal(args);
    if (refusal !== null) throw new Error(refusal);
  }
  return args;
}

/** The run's full pair schedule: one entry per (opening, handicap, seed) triple. */
export function buildSchedule(args: CliArgs): PairAssignment[] {
  return buildPairs(args.pairs, args.seed, args.handicaps, args.openings.map(o => o.id));
}

/**
 * The opening ids the SCHEDULE actually reaches, in first-use order.
 *
 * `args.openings` is the POOL the run may draw from — the whole file, minus
 * `--openings-skip` / `--openings-ids`. A run of fewer pairs than
 * `pool x handicaps` never reaches the tail of that pool (`buildPairs` advances
 * the opening once per handicap sweep), so reporting the pool as "the openings
 * this run used" overstates it: E1.1's 16 pairs over a 14-opening pool at one
 * handicap used 8. The pool is what `--resume` compares (it fixes what every
 * `pairId` means); this is what the run played.
 */
export function openingsUsed(args: CliArgs): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const pair of buildSchedule(args)) {
    if (seen.has(pair.openingId)) continue;
    seen.add(pair.openingId);
    out.push(pair.openingId);
  }
  return out;
}

function gitRevision(): string | null {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

/** True when the working tree has uncommitted changes (so a result can never be silently attributed to a clean commit). */
function gitDirty(): boolean | null {
  try {
    return execFileSync('git', ['status', '--porcelain'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim().length > 0;
  } catch {
    return null;
  }
}

function wasmSha256(): string | null {
  const wasmPath = path.join(REPO_ROOT, 'src/ai/wasm/tactics.wasm');
  if (!fs.existsSync(wasmPath)) return null;
  return sha256(fs.readFileSync(wasmPath));
}

export function readJsonl<T>(filePath: string): T[] {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, 'utf8')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .map(l => JSON.parse(l) as T);
}

/** Concatenates every shard's file, in shard order, into one array. Synchronous so the caller can use the rows immediately. */
function readShardRows<T>(shardsDir: string, prefix: string, shardCount: number): T[] {
  const out: T[] = [];
  for (let i = 0; i < shardCount; i++) out.push(...readJsonl<T>(path.join(shardsDir, `${prefix}-${i}.jsonl`)));
  return out;
}

/** True while `pid` names a live process. `EPERM` means it exists but is not ours, which still counts as alive. */
export function shardProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export interface ShardSettleOptions {
  /** How long to keep waiting for a shard that has written no status file at all (it may never have started). */
  startupGraceMs?: number;
  /** Ceiling on the whole wait. Infinite by default: a shard that is still playing games is worth waiting for. */
  timeoutMs?: number;
  pollMs?: number;
  /** Liveness probe; injected by tests so they need no real processes. */
  isAlive?: (pid: number) => boolean;
}

export interface ShardSettleReport {
  /** Shards that published `done: true`: their files are final. */
  finished: number[];
  /** Shards whose process is gone without saying `done` — killed or crashed. Their files hold every row they had written. */
  died: number[];
  /** Shards that never published a status inside the startup grace (they never started). */
  missing: number[];
  /** Shards still alive when `timeoutMs` expired; their files may be mid-write. */
  stillRunning: number[];
  waitedMs: number;
}

/**
 * Waits until every shard has either finished or died, so the merge that
 * follows reads complete files. Used when a shard failed: `runSharded` rejects
 * on the first non-zero exit while its siblings are still playing.
 */
export async function awaitShardsSettled(
  shardsDir: string,
  shardCount: number,
  options: ShardSettleOptions = {},
): Promise<ShardSettleReport> {
  const pollMs = options.pollMs ?? 200;
  const startupGraceMs = options.startupGraceMs ?? 30_000;
  const timeoutMs = options.timeoutMs ?? Number.POSITIVE_INFINITY;
  const isAlive = options.isAlive ?? shardProcessAlive;
  const startedAt = Date.now();
  const pending = new Set<number>();
  for (let i = 0; i < shardCount; i++) pending.add(i);
  const report: ShardSettleReport = { finished: [], died: [], missing: [], stillRunning: [], waitedMs: 0 };

  for (;;) {
    for (const i of [...pending]) {
      const status = readShardStatus(shardsDir, i);
      if (status === null) {
        // No status yet: still inside the grace it may simply not have booted.
        if (Date.now() - startedAt >= startupGraceMs) {
          report.missing.push(i);
          pending.delete(i);
        }
        continue;
      }
      if (status.done) {
        report.finished.push(i);
        pending.delete(i);
        continue;
      }
      if (!isAlive(status.pid)) {
        report.died.push(i);
        pending.delete(i);
      }
    }
    if (pending.size === 0) break;
    if (Date.now() - startedAt >= timeoutMs) {
      report.stillRunning.push(...pending);
      break;
    }
    await new Promise(resolve => setTimeout(resolve, pollMs));
  }

  for (const list of [report.finished, report.died, report.missing, report.stillRunning]) list.sort((x, y) => x - y);
  report.waitedMs = Date.now() - startedAt;
  return report;
}

/** One line for the manifest saying what every shard was doing when the run gave up. */
export function describeSettle(report: ShardSettleReport): string {
  const parts = [
    `hard:ladder: waited ${report.waitedMs} ms for the remaining shards after a shard failure`,
    `finished [${report.finished.join(', ')}]`,
    `died [${report.died.join(', ')}]`,
    `never started [${report.missing.join(', ')}]`,
    `still running [${report.stillRunning.join(', ')}]`,
  ];
  const line = parts.join('; ') + '.';
  return report.stillRunning.length > 0
    ? `${line} Those shards were ABANDONED mid-write: their games may be missing from this run's merged artifacts.`
    : `${line} Every shard file was merged as it stood.`;
}

/** Failure rows the manifest should report: the merged ones, or whatever reached `failures.jsonl` if the run died before the merge. */
export function failuresForManifest(merged: readonly FailureRow[] | null, failuresPath: string): FailureRow[] {
  return merged === null ? readJsonl<FailureRow>(failuresPath) : [...merged];
}

function writeJsonl(filePath: string, rows: readonly unknown[]): void {
  fs.writeFileSync(filePath, rows.map(r => JSON.stringify(r)).join('\n') + (rows.length > 0 ? '\n' : ''));
}

/**
 * Throws if the merged game rows hold two entries for the same `pairId` +
 * `orientation` — the failure mode a careless `--resume` would produce, and one
 * that would double-count a game in every metric downstream.
 */
export function assertNoDuplicateGames(games: readonly GameRow[]): void {
  const seen = new Map<string, number>();
  for (const g of games) {
    const key = `${g.pairId}/${g.orientation}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  const dupes = [...seen.entries()].filter(([, n]) => n > 1);
  if (dupes.length > 0) {
    const detail = dupes.slice(0, 10).map(([k, n]) => `${k} x${n}`).join(', ');
    throw new Error(
      `hard:ladder: ${dupes.length} duplicate pairId+orientation in the merged games (${detail}). ` +
        'Every game must appear exactly once; refusing to report metrics over double-counted games.',
    );
  }
}

export interface ResumePlan {
  /** Pair ids a previous run completed (both games present as a `PairRow`). */
  completedPairIds: string[];
  /** Prior game rows worth keeping: those belonging to a completed, still-scheduled pair. */
  keptGames: GameRow[];
  /** Prior pair rows worth keeping, deduplicated by `pairId`. */
  keptPairs: PairRow[];
  /** Prior game rows dropped because their pair never completed (they will be replayed). */
  droppedGames: number;
}

/**
 * Works out what a `--resume` at this `--out` may keep. A pair counts as done
 * only when its `PairRow` exists; the orphan games of a half-played pair are
 * dropped so replaying that pair cannot produce a duplicate.
 */
export function planResume(schedule: readonly PairAssignment[], priorGames: readonly GameRow[], priorPairs: readonly PairRow[]): ResumePlan {
  const scheduled = new Set(schedule.map(p => p.pairId));
  const keptPairs: PairRow[] = [];
  const completed = new Set<string>();
  for (const row of priorPairs) {
    if (!scheduled.has(row.pairId) || completed.has(row.pairId)) continue;
    completed.add(row.pairId);
    keptPairs.push(row);
  }
  const keptGames: GameRow[] = [];
  let droppedGames = 0;
  const seenGame = new Set<string>();
  for (const g of priorGames) {
    const key = `${g.pairId}/${g.orientation}`;
    if (!completed.has(g.pairId) || seenGame.has(key)) {
      droppedGames++;
      continue;
    }
    seenGame.add(key);
    keptGames.push(g);
  }
  return { completedPairIds: [...completed], keptGames, keptPairs, droppedGames };
}

/**
 * The fields of a prior `manifest.json` that must match this invocation before
 * a `--resume` may keep any of its pairs. A resume that differs in any of them
 * is a DIFFERENT EXPERIMENT sharing a directory: its pair rows were produced by
 * other engines, another budget, another opening book or another legality mode,
 * and merging them would silently pool two populations into one Elo and one
 * SPRT. `pairs` is included because the schedule (and therefore every
 * `pairId`'s meaning) is derived from it.
 *
 * Returns one human-readable line per differing field, empty when the run may
 * resume. `openings.sha256` is compared, not the file path: the same book moved
 * to another directory is the same book, and a rewritten file at the same path
 * is not.
 */
export function resumeIdentityMismatches(args: CliArgs, prior: RunManifest): string[] {
  const out: string[] = [];
  const cmp = (field: string, want: unknown, got: unknown): void => {
    if (JSON.stringify(want) !== JSON.stringify(got)) out.push(`${field}: manifest ${JSON.stringify(want)} != run ${JSON.stringify(got)}`);
  };
  cmp('a', prior.a, args.a);
  cmp('b', prior.b, args.b);
  cmp('work', prior.work, workKey(args.work));
  cmp('seed', prior.seed, args.seed);
  cmp('pairs', prior.pairs, args.pairs);
  cmp('handicaps', prior.handicaps, args.handicaps);
  cmp('legality', prior.legality, args.legality);
  cmp('openings.sha256', prior.openings.sha256, args.openingsSha256);
  cmp('openings.ids', prior.openings.ids, args.openings.map(o => o.id));
  return out;
}

/** Anomalies whose text names a timing problem; folded into `metrics.timingAnomalies`. */
const TIMING_ANOMALY_RE = /timeout|timed out|deadline|overran|overrun|over budget|time limit|too slow/i;

function anomalyKind(anomaly: string): string {
  if (anomaly === HARD_DIVERGENCE_ANOMALY) return HARD_DIVERGENCE_ANOMALY;
  if (anomaly.startsWith('ply-cap')) return 'ply-cap';
  if (anomaly.startsWith('illegal ')) return 'illegal-action';
  if (anomaly.startsWith('noop ')) return 'noop-action';
  if (anomaly.startsWith('opening ')) return 'opening';
  if (TIMING_ANOMALY_RE.test(anomaly)) return 'timing';
  return anomaly.split(/[\s:]/)[0] || 'other';
}

export interface HandicapStratum {
  handicap: number;
  /** Pairs scheduled at this handicap. */
  pairsScheduled: number;
  /** Pairs with a complete `PairRow` at this handicap. */
  pairs: number;
  games: number;
  /** A's mean per-game score at this handicap, ∈ [0, 1]; NaN with no games. */
  score: number;
  wins: number;
  draws: number;
  losses: number;
  /** `eloEstimate(pairScores)` over this stratum's completed pairs (null when it has none). */
  elo: EloEstimate | null;
}

/**
 * One engine's turn-level timing over the whole run (AMENDMENTS-DECIDED A4).
 * Read off the seat that engine actually played in each game, never off the
 * game clock: `GameRecord.durationMs` covers both engines at once.
 */
export interface EngineTiming {
  /** Turns with a per-turn record (`PlayerGameStats.turnMs`). 0 on pre-v3 rows. */
  turns: number;
  /**
   * 95th percentile of this engine's per-turn wall clock, by nearest rank
   * (`ceil(0.95 n)`th smallest, so it is always an observed turn and never an
   * interpolation between two). `NaN` when the engine has no per-turn records.
   */
  p95TurnMs: number;
  /** Longest single turn, `NaN` with no records. */
  maxTurnMs: number;
  /**
   * Turns whose total exceeded the run's `--work wall:<ms>` allowance by ANY
   * margin — the untoleranced count E0's pilot reported, kept so a tolerance
   * can never hide a turn. Always 0 in fixed-work mode: a fixed-work run funds
   * units, not milliseconds, so it has no allowance to overrun.
   */
  overAllowance: number;
  /**
   * Turns past the allowance by more than `toleranceMs` — the count a
   * responsiveness criterion reads. `overAllowance - overruns` is the turns
   * that finished within the tolerance (1-8 ms past 3000 ms, in the pilot).
   */
  overruns: number;
  /**
   * `--overrun-tolerance` resolved against this run's allowance, in ms; null in
   * fixed-work mode. The default is FROZEN (AMENDMENTS-DECIDED A14).
   */
  toleranceMs: number | null;
  /**
   * `overruns / turns` for this arm — A14's violation statistic. Null when the
   * arm played no turn with a per-turn record, and null in fixed-work mode,
   * which funds units rather than milliseconds and so has no rate to report. A
   * rate above `OVERRUN_RATE_VOID_THRESHOLD` voids the run.
   */
  overrunRate: number | null;
  /**
   * Turns the hard adapter ended without searching because too little of the
   * allowance was left (`bots/hard.ts`), and searches that were not the first
   * of their turn.
   *
   * TWO SOURCES, PREFERRED IN ORDER (E1.5). Per SEAT
   * (`PlayerGameStats.hardTiming`): each bot instance's own counters for its
   * own game, which attribute to this arm whatever the other arm is — a
   * Hard-vs-Hard row included. Failing that (records written before the per-seat
   * field existed), the PROCESS-WIDE `hardBotTiming()` counters folded into each
   * game by `worker.ts`, which cannot be split between two `hard@` seats and so
   * are used only for a run whose single `hard@` arm owns all of them. `null`
   * when neither source says anything about this arm.
   */
  budgetExhausted: number | null;
  reSearches: number | null;
  /**
   * AMENDMENTS-DECIDED A16. `abortedSearches` is the searches this arm's
   * adapter saw end on the engine's watchdog rather than on its work rung —
   * under A11 the watchdog IS the turn's remaining allowance, so this is "how
   * often the clock, not the budget, chose the move". `abortRate =
   * abortedSearches / searches`. `firstSearchAborted` counts the GAMES whose
   * first search was one of them: the cold-start case, where the device
   * profile is still `INITIAL_UNITS_PER_MS` and has measured nothing.
   * `emptyPlans` counts searches that returned no actions at all (A10).
   *
   * All four share `budgetExhausted`'s two sources and its limits: per-seat
   * counters where the games carry them (E1.5, which is what makes
   * `firstSearchAborted` readable in a Hard-vs-Hard row at all), otherwise the
   * process-wide counters for a run whose single `hard@` arm owns them. They
   * are null for a run whose games predate the counter — a missing count is
   * never reported as a zero.
   */
  searches: number | null;
  abortedSearches: number | null;
  abortRate: number | null;
  firstSearchAborted: number | null;
  emptyPlans: number | null;
}

/**
 * A replay's identity as a GAME, with everything that differs between two
 * replays of the same play stripped. Unit ids embed `Date.now()` and a random
 * suffix (`src/game/board.ts`), so they are renumbered in order of first
 * appearance rather than hashed as they stand; no clock is read at all, because
 * a `ReplayStep` carries none. Two pairs that played the same moves therefore
 * digest identically, which is what `distinctGames` counts.
 *
 * RULES-BOUND, AND PENDING SUMMONS COUNT. Two things were invisible to the
 * digest before Phasing existed and both had to be added, or `distinctGames`
 * would under-count:
 *
 *  - the RULES REVISION is hashed first. The same action list means a different
 *    game under Standard and under Phasing (`END_ACTION_PHASE` hands off in one
 *    and mines in the other), so two rows that must never be pooled must never
 *    collide here either. Defaults to the historical Standard spelling when a
 *    caller passes none, so every digest of an archived replay is unchanged.
 *  - PENDING SUMMONS are part of the position. They are public, they are paid
 *    for, and they are the whole mechanism of the rule set: two games that
 *    differ only in which squares each side committed to are DIFFERENT games,
 *    and a digest over board units alone would call them one. They are hashed
 *    in the same shape `lab/harness/runner.ts#snapshotStep` records — owner,
 *    definition, square, paid cost, no ids (a summon's id is minted per
 *    process) — sorted so the recording order cannot change the digest, which
 *    is the rule `openings/phasing.ts#gameplayDigest` follows.
 */
export function canonicalGameDigest(
  steps: readonly ReplayStep[],
  rulesVersion: string = 'muju-standard',
): string {
  const alias = new Map<string, string>();
  const idOf = (unitId: string): string => {
    const known = alias.get(unitId);
    if (known !== undefined) return known;
    const next = `u${alias.size}`;
    alias.set(unitId, next);
    return next;
  };
  const canonicalAction = (action: ReplayStep['action']): unknown => {
    if (action === null) return null;
    switch (action.type) {
      case 'MOVE': return { type: action.type, unit: idOf(action.unitId), to: action.to };
      case 'ATTACK': return { type: action.type, unit: idOf(action.unitId), targetPosition: action.targetPosition };
      case 'PROMOTE_UNIT': return { type: action.type, unit: idOf(action.unitId) };
      case 'PAY_UPKEEP': return { type: action.type, keep: action.keepUnitIds.map(idOf) };
      default: return action;
    }
  };
  /** The step's commitments, canonicalised: sorted by owner then row-major
   * square then definition then cost, ids dropped. `null` for a step recorded
   * before the field existed, which is every archived Standard replay — the
   * absence is hashed, so an archive digest cannot collide with a Phasing one
   * that happens to hold no summons. */
  const canonicalPending = (step: ReplayStep): unknown => {
    if (step.pendingSummons === undefined) return null;
    return step.pendingSummons
      .map(s => [s.o, s.y, s.x, s.d, s.cost] as const)
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])) || a[1] - b[1] || a[2] - b[2] || String(a[3]).localeCompare(String(b[3])) || a[4] - b[4]);
  };
  const body = steps.map(step => [
    step.ply,
    step.turn,
    step.player,
    step.phase,
    step.actionsRemaining,
    canonicalAction(step.action),
    step.units,
    step.cells,
    step.res,
    canonicalPending(step),
  ]);
  return sha256(JSON.stringify([rulesVersion, body]));
}

/**
 * A game's identity when `--replays off` left no replay to digest: the tuple
 * `games.jsonl` does carry. Coarser than `canonicalGameDigest` — two different
 * games of the same length and ending collide — so `distinctGames.source` says
 * which was used and the summary prints it.
 */
export function gameRowDigest(row: Pick<GameRow, 'turns' | 'plies' | 'winType' | 'winner'>): string {
  return sha256(`${row.turns}:${row.plies}:${row.winType}:${row.winner ?? 'none'}`);
}

/** How many DIFFERENT games this run actually played, per pair orientation (E0-PILOT-REPORT §7 P1). */
export interface DistinctGames {
  'A-white': number;
  'B-white': number;
  /** Scheduled pairs that contributed at least one game — the count the two above are compared against. */
  ofPairs: number;
  /** `replay` when every counted game was digested from its replay file, `game-row` when any fell back to the tuple. */
  source: 'replay' | 'game-row';
  /** True when an orientation played fewer distinct games than it played games. */
  duplicates: boolean;
}

/**
 * Counts the distinct games per orientation. Replays are digested when they are
 * on disk (they are written by default); a game whose replay is missing or
 * unreadable falls back to its `games.jsonl` tuple and marks the whole count
 * `source: 'game-row'`, so a coarse comparison is never reported as a fine one.
 *
 * Each replay is read once, at the end of the run: linear in the games played
 * and small beside the play time that produced them.
 */
export function computeDistinctGames(args: CliArgs, games: readonly GameRow[]): DistinctGames {
  const scheduled = new Set(buildSchedule(args).map(p => p.pairId));
  const digests: Record<Orientation, Set<string>> = { 'A-white': new Set(), 'B-white': new Set() };
  const gamesPlayed: Record<Orientation, number> = { 'A-white': 0, 'B-white': 0 };
  const pairsSeen = new Set<string>();
  let counted = 0;
  let fromReplay = 0;
  for (const row of games) {
    if (!scheduled.has(row.pairId)) continue;
    if (digests[row.orientation] === undefined) continue;
    let digest: string | null = null;
    if (row.replayPath !== undefined) {
      try {
        const replay = JSON.parse(fs.readFileSync(path.resolve(args.out, row.replayPath), 'utf8')) as ReplayFile;
        digest = canonicalGameDigest(replay.steps, replay.meta?.rulesVersion ?? row.rulesVersion ?? 'muju-standard');
        fromReplay++;
      } catch {
        digest = null; // no replay to read: the tuple below is what this run has
      }
    }
    counted++;
    pairsSeen.add(row.pairId);
    gamesPlayed[row.orientation]++;
    digests[row.orientation].add(digest ?? gameRowDigest(row));
  }
  const distinct = { 'A-white': digests['A-white'].size, 'B-white': digests['B-white'].size };
  const duplicated = (key: Orientation): boolean => gamesPlayed[key] > 1 && distinct[key] < gamesPlayed[key];
  return {
    ...distinct,
    ofPairs: pairsSeen.size,
    source: counted > 0 && fromReplay === counted ? 'replay' : 'game-row',
    duplicates: duplicated('A-white') || duplicated('B-white'),
  };
}

export interface RunMetrics {
  a: string;
  b: string;
  work: string;
  handicaps: number[];
  pairs: number;
  /** Pairs with both games recorded. */
  pairsCompleted: number;
  games: number;
  /** Games the schedule called for (2 per scheduled pair). */
  gamesScheduled: number;
  /** Scheduled games with no row in `games.jsonl` (failed, or never played). */
  missingGames: number;
  /** Game rows whose `pairId`/`orientation` is not in this run's schedule. */
  unattributedGames: number;
  /** Rows in `failures.jsonl`. */
  failures: number;
  seed: number;
  shards: number;
  /** The POOL this run may draw from, after `--openings-skip` / `--openings-ids`; what `--resume` compares. */
  openings: string[];
  /** The pool ids the schedule actually reaches, in first-use order (`openingsUsed`); a subset of `openings`. */
  openingsUsed: string[];
  openingsSha256: string | null;
  /** `--openings-skip`: leading rows of the file this run dropped; null when the flag was absent. */
  openingsSkip: number | null;
  /** `--openings-ids`: the ids named on the command line; null when the flag was absent. */
  openingsSelectedIds: string[] | null;
  /**
   * False when this run's pairs have no independence source: both arms engines,
   * more than one pair, no `--openings`, and `--allow-initial-only` passed. Its
   * statistics then describe one game per orientation, whatever `pairs` says.
   */
  openingsIndependent: boolean;
  /** The one line an overridden run carries; null when the pairs are independent. */
  independenceWarning: string | null;
  /** Distinct games per orientation — the direct check on P1, whatever produced the duplicates. */
  distinctGames: DistinctGames;
  /** The tolerance `timing.overruns` was derived under. FROZEN (AMENDMENTS-DECIDED A14). */
  overrunTolerance: OverrunTolerance;
  replays: boolean;
  resumed: boolean;
  adjudicationRate: number;
  illegalActions: number;
  /** `hard@*` seats whose plan the canonical engine refused mid-turn
   * (M14; `lab/hard-ai/bots/hard.ts`, recorded per game by `worker.ts`). */
  replicaDivergences: number;
  /**
   * The six ENGINE FALLBACK counts summed over every game of the run
   * (`ladder/fallbacks.ts`; `GameRow.fallbacks` per game). Gate 0 item 6 of
   * `docs/hard-ai/PHASING-PREREGISTRATION-2026-09-18.md` requires ZERO of each:
   * a fallback means part of the game was played by the V2 path, so the row is
   * not the comparison it claims to be. Any non-zero field VOIDS the row, next
   * to `illegalActions` and `replicaDivergences`, which the same clause vetoes.
   */
  fallbacks: FallbackCounts;
  /** Total over the six — 0 for a clean run, and what the veto tests. */
  fallbackTotal: number;
  /**
   * False when NO game in the run carried a `fallbacks` field, i.e. every row
   * predates the counters. The totals above are then 0 because nothing was
   * measured, not because nothing happened, so they may not be read as evidence
   * for Gate 0 — and `voidReason` says so instead of passing the gate silently.
   */
  fallbacksRecorded: boolean;
  /** Anomalies naming a timing problem, plus games decided by `winType: 'timeout'`. */
  timingAnomalies: number;
  /** Every anomaly in every game, counted by kind (`anomalyKind`). */
  anomalyCounts: Record<string, number>;
  /** A's per-game record over the whole run. */
  wins: number;
  draws: number;
  losses: number;
  strata: HandicapStratum[];
  bothSeatsPlayed: boolean;
  /**
   * AMENDMENTS-DECIDED A4, option (a): every pair this run PLAYED completed in both
   * orientations and has a pair row, with no failure rows — strictly stronger
   * than `bothSeatsPlayed`, which only asks whether each seat was played
   * somewhere in the run. It does NOT assert that the whole schedule was
   * played: `pairsCompleted`, `missingGames` and `status` say that, and an
   * SPRT that stops the run early leaves whole pairs unplayed on purpose.
   */
  seatMirrored: boolean;
  /**
   * True when this comparison row may not be reported as a result: an
   * adjudication rate over 1% (SU addendum 2), an arm whose `overrunRate`
   * exceeds `OVERRUN_RATE_VOID_THRESHOLD` (AMENDMENTS-DECIDED A14), or any
   * illegal action, replica divergence or engine fallback at all (Gate 0 item 6
   * of `docs/hard-ai/PHASING-PREREGISTRATION-2026-09-18.md`). A voided run's
   * `decision` is `'void'`, with or without an SPRT.
   */
  voided: boolean;
  /** Why the run is void — every reason that fired, joined with `; `. Null when it is not. */
  voidReason: string | null;
  meanTurnMs: { a: number; b: number };
  /**
   * Mean box load over the run: every `loadAvgStart` and `loadAvgEnd` sample in
   * `games.jsonl`, averaged (critique C8 / C13).
   *
   * `manifest.loadavg` records the load at the run's start only, which for a
   * row of hours says nothing about the load its later games met. This is the
   * number that makes a rung distribution or a units/ms column comparable
   * across rows. NULL — never 0 — when no game carries the samples, which is
   * every run written before the fields existed.
   */
  loadAvgMean: number | null;
  /** Per-engine turn-level timing (A4). */
  timing: { a: EngineTiming; b: EngineTiming };
  /** Elo point estimate (A vs B), `NaN` when there are no pairs to estimate from. */
  elo: number;
  eloLo: number;
  eloHi: number;
  los: number;
  eloDetail: EloEstimate | null;
  /** The BATCH statistic over every completed pair (reported, never the verdict). */
  sprt: (Omit<SprtResult, 'decision'> & { decision: SprtResult['decision'] | 'void' }) | null;
  /**
   * The SEQUENTIAL test over the same pairs in pairIndex order — the run's
   * verdict, because that is the stopping rule whose error rates the protocol
   * predeclares. Null when no `--sprt` was requested.
   */
  sprtSequential: (Omit<SprtSequentialResult, 'decision'> & { decision: SprtDecision | 'void' }) | null;
  decision: string | null;
  status: 'complete' | 'incomplete';
}

/** Nearest-rank percentile: the `ceil(p n)`th smallest sample, or NaN when there are none. */
export function percentile(samples: readonly number[], p: number): number {
  if (samples.length === 0) return NaN;
  const sorted = [...samples].sort((x, y) => x - y);
  const rank = Math.min(sorted.length, Math.max(1, Math.ceil(p * sorted.length)));
  return sorted[rank - 1];
}

/**
 * A14's violation check: every arm whose `overrunRate` exceeds
 * `OVERRUN_RATE_VOID_THRESHOLD`, as one reason string each naming the arm, its
 * engine and its rate. Empty when both arms are inside the bar, and empty in
 * fixed-work mode, where `overrunRate` is null because there is no clock to
 * overrun.
 */
export function overrunRateVoidReasons(a: string, b: string, timing: { a: EngineTiming; b: EngineTiming }): string[] {
  const out: string[] = [];
  for (const key of ['a', 'b'] as const) {
    const t = timing[key];
    if (t.overrunRate === null || t.overrunRate <= OVERRUN_RATE_VOID_THRESHOLD) continue;
    out.push(
      `timing.${key}.overrunRate ${(t.overrunRate * 100).toFixed(2)}% (${t.overruns}/${t.turns} turns) for arm ` +
        `${key} = ${key === 'a' ? a : b} exceeds the ${(OVERRUN_RATE_VOID_THRESHOLD * 100).toFixed(0)}% ceiling ` +
        '(AMENDMENTS-DECIDED A14): this comparison row is VOID',
    );
  }
  return out;
}

/**
 * GATE 0 ITEM 6's veto, as one reason string per violation.
 *
 * > In every ladder game: 0 illegal actions, 0 replica divergences, 0 engine
 * > fallbacks (packError, engineError, divergence, invalidSuffix, emptyPlan,
 * > workerError). A fallback means the game was partly V2 vs V2.
 *
 * This is a CORRECTNESS bar, not a rate: one fallback is one turn of the row
 * played by a different engine than the row's name says, so the threshold is
 * zero and there is nothing to average. The three counts are reported
 * separately because they say different things about where the failure was —
 * the runner refusing the engine's action (`illegalActions`), the adapter
 * refusing its own replica's plan (`replicaDivergences`), and the engine
 * handing back nothing usable at all (`fallbacks`) — and the fallback vector
 * names which of the six kinds fired.
 *
 * `recorded` false means no game carried the counters: the run cannot show it
 * met the bar, which is itself a reason the row may not be reported under a
 * preregistration that requires the evidence.
 */
export function gate0VoidReasons(counts: {
  illegalActions: number;
  replicaDivergences: number;
  fallbacks: FallbackCounts;
  recorded: boolean;
  games: number;
}): string[] {
  const out: string[] = [];
  if (counts.illegalActions > 0) {
    out.push(
      `illegalActions ${counts.illegalActions} exceeds the 0 the preregistration requires ` +
        '(PHASING-PREREGISTRATION-2026-09-18 Gate 0 item 6): this comparison row is VOID',
    );
  }
  if (counts.replicaDivergences > 0) {
    out.push(
      `replicaDivergences ${counts.replicaDivergences} exceeds the 0 the preregistration requires ` +
        '(Gate 0 item 6): the replica proposed actions the canonical rules refused, so those turns fell ' +
        'back to the V2 path — this comparison row is VOID',
    );
  }
  const total = fallbackTotal(counts.fallbacks);
  if (total > 0) {
    out.push(
      `engine fallbacks ${total} (${describeFallbacks(counts.fallbacks)}) exceed the 0 the preregistration ` +
        'requires (Gate 0 item 6): a fallback means the game was partly V2 vs V2 — this comparison row is VOID',
    );
  }
  if (!counts.recorded && counts.games > 0) {
    out.push(
      'engine fallbacks were NOT recorded by any game in this run (every row predates GameRow.fallbacks), ' +
        'so Gate 0 item 6 cannot be shown to hold: this comparison row is VOID',
    );
  }
  return out;
}

/** True for an engine name the hard adapter owns (`hard@<label>`); its counters are process-wide. */
function isHardEngine(name: string): boolean {
  return name === 'hard' || name.startsWith('hard@');
}

/**
 * The completed pairs' scores in PAIRINDEX order — the predeclared checkpoint
 * order of the sequential test. Shards own contiguous slices and finish out of
 * step, so `pairs.jsonl` is in merge order, which depends on the shard count
 * and on how fast each shard ran; a sequential test evaluated in that order
 * would give a different verdict on a rerun of the same games. `pairIndex` is
 * fixed by `--pairs` and `--seed` alone, so it is reproducible and is declared
 * before the run starts.
 */
export function pairScoresInCheckpointOrder(schedule: readonly PairAssignment[], pairs: readonly PairRow[]): number[] {
  const scoreByPairId = new Map(pairs.map(p => [p.pairId, p.scoreA]));
  const ordered: number[] = [];
  for (const p of [...schedule].sort((x, y) => x.pairIndex - y.pairIndex)) {
    const score = scoreByPairId.get(p.pairId);
    if (score !== undefined) ordered.push(score);
  }
  return ordered;
}

/**
 * Attributes every game to its own pair and orientation via `pairId`, never by
 * position in the merged file: a run that lost a game must lose exactly that
 * game's contribution, not shift every later game onto the wrong pair and the
 * wrong seat.
 */
export function computeMetrics(args: CliArgs, games: readonly GameRow[], pairs: readonly PairRow[], failures: readonly FailureRow[] = []): RunMetrics {
  const schedule = buildSchedule(args);
  const specsByPairId = new Map<string, Record<Orientation, GameSpec>>();
  for (const p of schedule) {
    const [gA, gB] = expandPair(p);
    specsByPairId.set(p.pairId, { 'A-white': gA, 'B-white': gB });
  }

  let aWhiteGames = 0, bWhiteGames = 0;
  // Per-ENGINE latency: `GameRecord.durationMs` is the whole game's wall clock
  // and is identical for both seats, so attributing it to A and B (as this did
  // before) made `meanTurnMs.a === meanTurnMs.b` by construction and any
  // criterion comparing the two vacuous. `PlayerGameStats.decisionMs` /
  // `.turnsTaken` (harness v3) are per-seat, so each engine's ms-per-turn is
  // read off the seat it actually played.
  const latencyByEngine: { a: { ms: number; turns: number }; b: { ms: number; turns: number } } =
    { a: { ms: 0, turns: 0 }, b: { ms: 0, turns: 0 } };
  // Every per-turn wall-clock sample each engine produced, for A4's p95/max.
  const turnMsByEngine: { a: number[]; b: number[] } = { a: [], b: [] };
  // Process-wide hard-adapter counters, summed over the games that carry them.
  // The A10/A16 counters start `null` and become a number the first time a
  // game record carries one: a run whose games predate them reports "unknown",
  // never 0 (`lab/harness/types.ts`).
  const hardTotals: {
    reSearches: number;
    budgetExhausted: number;
    searches: number;
    abortedSearches: number | null;
    firstSearchAborted: number | null;
    emptyPlans: number | null;
  } = { reSearches: 0, budgetExhausted: 0, searches: 0, abortedSearches: null, firstSearchAborted: null, emptyPlans: null };
  // E1.5: the same counters, per ARM, summed from each game's per-SEAT records
  // (`PlayerGameStats.hardTiming`). Null until a game carries one for that
  // seat, so an arm with no hard bot — or a run of older records — stays
  // "unknown" and falls back to the process-wide totals above.
  type HardCounts = typeof hardTotals;
  const perArmTotals: { a: HardCounts | null; b: HardCounts | null } = { a: null, b: null };
  const addSeatTiming = (key: 'a' | 'b', seat: NonNullable<PlayerGameStats['hardTiming']>): void => {
    const into =
      perArmTotals[key] ??
      (perArmTotals[key] = { reSearches: 0, budgetExhausted: 0, searches: 0, abortedSearches: 0, firstSearchAborted: 0, emptyPlans: 0 });
    into.reSearches += seat.reSearches;
    into.budgetExhausted += seat.budgetExhausted;
    into.searches += seat.searches;
    into.abortedSearches = (into.abortedSearches ?? 0) + seat.abortedSearches;
    into.firstSearchAborted = (into.firstSearchAborted ?? 0) + seat.firstSearchAborted;
    into.emptyPlans = (into.emptyPlans ?? 0) + seat.emptyPlans;
  };
  // C8 / C13: the box load each game met, from the per-game samples. Summed
  // over every game that carries them (an older row carries none), start and
  // end alike, and reported as a mean.
  let loadAvgSum = 0;
  let loadAvgSamples = 0;
  let adjudicated = 0;
  let illegalActions = 0;
  let replicaDivergences = 0;
  // Gate 0 item 6: the six fallback kinds, summed over every game that recorded
  // them. `fallbacksRecorded` stays false for a run of rows written before the
  // field existed, so six zeros are never mistaken for six measured zeros.
  const fallbacks = emptyFallbackCounts();
  let fallbacksRecorded = false;
  let timingAnomalies = 0;
  let unattributedGames = 0;
  let wins = 0, draws = 0, losses = 0;
  const anomalyCounts: Record<string, number> = {};
  const seatResultByGame = new Map<string, { handicap: number; result: 'win' | 'draw' | 'loss' }>();

  for (const rec of games) {
    const spec = specsByPairId.get(rec.pairId)?.[rec.orientation];
    for (const sample of [rec.loadAvgStart, rec.loadAvgEnd]) {
      if (typeof sample === 'number' && Number.isFinite(sample)) {
        loadAvgSum += sample;
        loadAvgSamples++;
      }
    }
    if (rec.winType === 'adjudication') adjudicated++;
    illegalActions += rec.players.white.illegalActions + rec.players.black.illegalActions;
    if (rec.fallbacks !== undefined) {
      fallbacksRecorded = true;
      addFallbackCounts(fallbacks, rec.fallbacks);
    }
    if (rec.winType === 'timeout') timingAnomalies++;
    for (const anomaly of rec.anomalies) {
      const kind = anomalyKind(anomaly);
      anomalyCounts[kind] = (anomalyCounts[kind] ?? 0) + 1;
      if (anomaly === HARD_DIVERGENCE_ANOMALY) replicaDivergences++;
      if (TIMING_ANOMALY_RE.test(anomaly)) timingAnomalies++;
    }
    if (!spec) {
      // Never silently dropped: a row the schedule does not explain is counted.
      unattributedGames++;
      continue;
    }
    if (spec.white === 'A') aWhiteGames++; else bWhiteGames++;
    const seatOfA: PlayerId = spec.white === 'A' ? 'white' : 'black';
    const seatOfB: PlayerId = seatOfA === 'white' ? 'black' : 'white';
    const result = rec.winner === null ? 'draw' : rec.winner === seatOfA ? 'win' : 'loss';
    if (result === 'win') wins++; else if (result === 'draw') draws++; else losses++;
    seatResultByGame.set(`${rec.pairId}/${rec.orientation}`, { handicap: spec.handicap, result });
    // Pre-v3 records (no per-seat timing) fall back to the game clock split
    // evenly, which is the best this metric can say about them.
    const fallbackMs = rec.durationMs / 2;
    const fallbackTurns = Math.max(1, Math.ceil(rec.turns / 2));
    latencyByEngine.a.ms += rec.players[seatOfA].decisionMs ?? fallbackMs;
    latencyByEngine.a.turns += rec.players[seatOfA].turnsTaken ?? fallbackTurns;
    latencyByEngine.b.ms += rec.players[seatOfB].decisionMs ?? fallbackMs;
    latencyByEngine.b.turns += rec.players[seatOfB].turnsTaken ?? fallbackTurns;
    // Appended one at a time, never spread: `push(...xs)` passes every sample
    // as an ARGUMENT, and a campaign row (`--pairs 1500`) carries far more
    // per-turn samples than the ~125k arguments a call can take. The throw
    // would land after every game had already been played.
    for (const ms of rec.players[seatOfA].turnMs ?? []) turnMsByEngine.a.push(ms);
    for (const ms of rec.players[seatOfB].turnMs ?? []) turnMsByEngine.b.push(ms);
    const seatTimingA = rec.players[seatOfA].hardTiming;
    if (seatTimingA) addSeatTiming('a', seatTimingA);
    const seatTimingB = rec.players[seatOfB].hardTiming;
    if (seatTimingB) addSeatTiming('b', seatTimingB);
    if (rec.hardTiming) {
      hardTotals.reSearches += rec.hardTiming.reSearches;
      hardTotals.budgetExhausted += rec.hardTiming.budgetExhausted;
      hardTotals.searches += rec.hardTiming.searches;
      const aborted = rec.hardTiming.abortedSearches;
      if (aborted !== undefined) hardTotals.abortedSearches = (hardTotals.abortedSearches ?? 0) + aborted;
      const firstAborted = rec.hardTiming.firstSearchAborted;
      if (firstAborted !== undefined) hardTotals.firstSearchAborted = (hardTotals.firstSearchAborted ?? 0) + firstAborted;
      const empty = rec.hardTiming.emptyPlans;
      if (empty !== undefined) hardTotals.emptyPlans = (hardTotals.emptyPlans ?? 0) + empty;
    }
  }

  const scheduledPairIds = new Set(schedule.map(p => p.pairId));
  const scoredPairs = pairs.filter(p => scheduledPairIds.has(p.pairId));
  const pairScores = scoredPairs.map(p => p.scoreA);
  const handicapOfPair = new Map(schedule.map(p => [p.pairId, p.handicap]));

  const strata: HandicapStratum[] = [];
  for (const handicap of [...new Set(args.handicaps)]) {
    const stratumPairs = scoredPairs.filter(p => handicapOfPair.get(p.pairId) === handicap);
    const stratumResults = [...seatResultByGame.values()].filter(r => r.handicap === handicap);
    const w = stratumResults.filter(r => r.result === 'win').length;
    const d = stratumResults.filter(r => r.result === 'draw').length;
    const l = stratumResults.filter(r => r.result === 'loss').length;
    strata.push({
      handicap,
      pairsScheduled: schedule.filter(p => p.handicap === handicap).length,
      pairs: stratumPairs.length,
      games: stratumResults.length,
      score: stratumResults.length === 0 ? NaN : (w + d / 2) / stratumResults.length,
      wins: w,
      draws: d,
      losses: l,
      elo: stratumPairs.length > 0 ? eloEstimate(stratumPairs.map(p => p.scoreA)) : null,
    });
  }

  const allowanceMs = args.work.mode === 'wall' ? args.work.ms : null;
  // The tolerance is applied HERE, when the metric is derived; `bots/hard.ts`'s
  // own `hardBotTiming().overruns` stays raw (A14 is a reporting bar, not an
  // adapter behaviour).
  const toleranceMs = toleranceMsFor(args.overrunTolerance, allowanceMs);
  const soleHard = isHardEngine(args.a) !== isHardEngine(args.b) ? (isHardEngine(args.a) ? 'a' : 'b') : null;
  const timingOf = (key: 'a' | 'b'): EngineTiming => {
    const samples = turnMsByEngine[key];
    // E1.5: per-arm counters win wherever the games carry them — they are the
    // only source that can attribute a Hard-vs-Hard row. The process-wide
    // totals remain the fallback for records written before the per-seat field,
    // and only where exactly one arm is `hard@` and therefore owns all of them.
    const counts = perArmTotals[key] ?? (soleHard === key ? hardTotals : null);
    const overruns = allowanceMs === null || toleranceMs === null ? 0 : samples.filter(ms => ms > allowanceMs + toleranceMs).length;
    return {
      turns: samples.length,
      p95TurnMs: percentile(samples, 0.95),
      // `Math.max(...samples)` for the same reason as the append above: a
      // campaign-sized sample list exceeds the argument limit and throws.
      maxTurnMs: samples.length === 0 ? NaN : samples.reduce((hi, ms) => (ms > hi ? ms : hi), -Infinity),
      overAllowance: allowanceMs === null ? 0 : samples.filter(ms => ms > allowanceMs).length,
      overruns,
      toleranceMs,
      // Null rather than 0 when there is nothing to divide: no turns recorded,
      // or a fixed-work run, which has no clock to overrun.
      overrunRate: allowanceMs === null || samples.length === 0 ? null : overruns / samples.length,
      budgetExhausted: counts === null ? null : counts.budgetExhausted,
      reSearches: counts === null ? null : counts.reSearches,
      searches: counts === null ? null : counts.searches,
      abortedSearches: counts === null ? null : counts.abortedSearches,
      // Null unless there is both a numerator this arm owns and a search to
      // divide by: an unknown count and an unplayed arm are not a 0% rate.
      abortRate:
        counts !== null && counts.abortedSearches !== null && counts.searches > 0
          ? counts.abortedSearches / counts.searches
          : null,
      firstSearchAborted: counts === null ? null : counts.firstSearchAborted,
      emptyPlans: counts === null ? null : counts.emptyPlans,
    };
  };
  const timing = { a: timingOf('a'), b: timingOf('b') };

  const adjudicationRate = games.length === 0 ? 0 : adjudicated / games.length;
  // Both void causes are recorded the same way: `voided` plus a `voidReason`
  // naming what fired. The adjudication bar is SU addendum 2; the overrun-rate
  // bar is AMENDMENTS-DECIDED A14.
  const voidReasons: string[] = [];
  if (adjudicationRate > 0.01) {
    voidReasons.push(`adjudicationRate ${(adjudicationRate * 100).toFixed(2)}% exceeds 1% (SU addendum 2)`);
  }
  voidReasons.push(...overrunRateVoidReasons(args.a, args.b, timing));
  voidReasons.push(
    ...gate0VoidReasons({ illegalActions, replicaDivergences, fallbacks, recorded: fallbacksRecorded, games: games.length }),
  );
  const voided = voidReasons.length > 0;
  const voidReason = voided ? voidReasons.join('; ') : null;
  const eloDetail = pairScores.length > 0 ? eloEstimate(pairScores) : null;
  let sprtResult: (Omit<SprtResult, 'decision'> & { decision: SprtResult['decision'] | 'void' }) | null = null;
  let sequential: (Omit<SprtSequentialResult, 'decision'> & { decision: SprtDecision | 'void' }) | null = null;
  if (args.sprt) {
    const raw = sprt(pairScores, args.sprt);
    sprtResult = { ...raw, decision: voided ? 'void' : raw.decision };
    const rawSeq = sprtSequential(pairScoresInCheckpointOrder(schedule, scoredPairs), args.sprt);
    sequential = { ...rawSeq, decision: voided ? 'void' : rawSeq.decision };
  }
  // A4: no pair the run PLAYED is half-played, and nothing failed. A pair with
  // one orientation missing biases the pentanomial score (one seat's colour
  // advantage is counted without its mirror), which is what this asks about;
  // whether the run got through its whole schedule is `pairsCompleted` and
  // `status`, and an SPRT that stops the run early deliberately leaves pairs
  // unplayed (never half-played).
  const orientationsByPair = new Map<string, Set<string>>();
  for (const key of seatResultByGame.keys()) {
    const [pairId, orientation] = key.split('/');
    const set = orientationsByPair.get(pairId) ?? new Set<string>();
    set.add(orientation);
    orientationsByPair.set(pairId, set);
  }
  const startedPairs = [...orientationsByPair.entries()];
  const seatMirrored =
    failures.length === 0 &&
    startedPairs.length > 0 &&
    startedPairs.every(([pairId, seats]) => seats.size === 2 && scoredPairs.some(p => p.pairId === pairId));
  const msPerTurn = (l: { ms: number; turns: number }): number => (l.turns === 0 ? 0 : l.ms / l.turns);
  const gamesScheduled = schedule.length * 2;
  const attributed = games.length - unattributedGames;
  return {
    a: args.a,
    b: args.b,
    work: workKey(args.work),
    handicaps: args.handicaps,
    pairs: args.pairs,
    pairsCompleted: scoredPairs.length,
    games: games.length,
    gamesScheduled,
    missingGames: Math.max(0, gamesScheduled - attributed),
    unattributedGames,
    failures: failures.length,
    seed: args.seed,
    shards: args.shards,
    openings: args.openings.map(o => o.id),
    openingsUsed: openingsUsed(args),
    openingsSha256: args.openingsSha256,
    openingsSkip: args.openingsSkip,
    openingsSelectedIds: args.openingsSelectedIds,
    openingsIndependent: openingsIndependent(args),
    independenceWarning: independenceWarning(args),
    distinctGames: computeDistinctGames(args, games),
    overrunTolerance: args.overrunTolerance,
    replays: args.replays,
    resumed: args.resume,
    adjudicationRate,
    illegalActions,
    replicaDivergences,
    fallbacks,
    fallbackTotal: fallbackTotal(fallbacks),
    fallbacksRecorded,
    timingAnomalies,
    anomalyCounts,
    wins,
    draws,
    losses,
    strata,
    bothSeatsPlayed: aWhiteGames > 0 && bWhiteGames > 0,
    seatMirrored,
    voided,
    voidReason,
    meanTurnMs: { a: msPerTurn(latencyByEngine.a), b: msPerTurn(latencyByEngine.b) },
    loadAvgMean: loadAvgSamples === 0 ? null : loadAvgSum / loadAvgSamples,
    timing,
    elo: eloDetail?.elo ?? NaN,
    eloLo: eloDetail?.eloLo ?? NaN,
    eloHi: eloDetail?.eloHi ?? NaN,
    los: eloDetail?.los ?? NaN,
    eloDetail,
    sprt: sprtResult,
    sprtSequential: sequential,
    // The verdict is the SEQUENTIAL one: pairs are checked in the predeclared
    // checkpoint order, and that is the stopping rule the type-I simulations
    // measure. The batch statistic stays in `sprt` for comparison. A VOID run
    // says `void` whether or not an SPRT was requested: A14's overrun bar and
    // SU addendum 2's adjudication bar both void the comparison row itself,
    // and a run with no statistic must not report that as a null verdict.
    decision: voided ? 'void' : (sequential?.decision ?? null),
    // A run whose own metrics say a scheduled game has no row is not complete,
    // whatever the pair rows claim.
    status:
      failures.length === 0 &&
      scoredPairs.length === schedule.length &&
      unattributedGames === 0 &&
      Math.max(0, gamesScheduled - attributed) === 0
        ? 'complete'
        : 'incomplete',
  };
}

export interface RunManifest {
  schema: 'muju-ladder-manifest-v1';
  status: 'running' | 'complete' | 'incomplete';
  a: string;
  b: string;
  aConfigHash: string;
  bConfigHash: string;
  /** `LadderEngine.resolvedConfig(work)` when the engine exposes one (feature-detected), else null. */
  aResolvedConfig: unknown;
  bResolvedConfig: unknown;
  work: string;
  seed: number;
  pairs: number;
  shards: number;
  handicaps: number[];
  legality: 'as-shipped' | 'strict';
  sprt: SprtParams | null;
  /**
   * `ids` is the SELECTED list, in schedule order: `skip` rows dropped from the
   * front of the file, or `selectedIds` kept in the order they were named. Both
   * are null when the run took the file as it stood. A `--resume` compares
   * `ids`, so a rerun at another selection is a different experiment.
   */
  openings: {
    path: string | null;
    sha256: string | null;
    ids: string[];
    count: number;
    skip: number | null;
    selectedIds: string[] | null;
    /** The `ids` the schedule actually reaches, in first-use order; a subset of `ids` (`openingsUsed`). */
    used: string[];
  };
  /** False when the pairs have no independence source (`--allow-initial-only`, `--allow-opening-reuse`). */
  openingsIndependent: boolean;
  /** The one line an overridden run carries; null when the pairs are independent. */
  independenceWarning: string | null;
  /** The overrun tolerance this run's metrics were derived under. FROZEN (AMENDMENTS-DECIDED A14). */
  overrunTolerance: OverrunTolerance;
  replays: boolean;
  resume: boolean;
  /** The full pair schedule, so an interrupted run can be read back without re-deriving it. */
  schedule: Array<{ pairId: string; pairIndex: number; openingId: string; handicap: number; seed: number }>;
  resumedPairIds: string[];
  /**
   * What the sequential SPRT did to this run's schedule. Null when no `--sprt`
   * was requested. `signalledAtPair` is the checkpoint at which the runner told
   * the shards to stop launching pairs; `pairsPlayed` beyond it are pairs that
   * were already under way (a shard finishes the pair it is inside) or that
   * started before the signal was seen. `earlyStop: false` with a non-null
   * `decidedAtPair` means the decision is POST HOC: every scheduled pair was
   * played and the checkpoint is only where the test would have stopped.
   */
  sprtStop: {
    decision: SprtDecision | 'void';
    decidedAtPair: number | null;
    minPairs: number;
    earlyStop: boolean;
    signalledAtPair: number | null;
    pairsPlayedBeyondDecision: number;
  } | null;
  /** The rule set and the three module-global knobs every game was played
   * under. `rulesVersion` is `GameRecord.rulesVersion`'s value, recorded here so
   * a manifest alone says which rule set the row measures. */
  rules: { rulesVersion: string; elementGraph: string; upkeep: string; inactivityRule: string };
  argv: string[];
  git: string | null;
  gitDirty: boolean | null;
  /**
   * E0.1's four tree hashes (`identity.ts#baselineIdentity`): `src/ai`,
   * `src/game`, the WASM kernel and `package-lock.json`. A commit says which
   * revision was checked out; these say what the process actually ran, which is
   * the only identity a dirty tree has.
   */
  baseline: SourceIdentity;
  wasmSha256: string | null;
  node: string;
  device: string;
  cpuCount: number;
  loadavg: number[];
  at: string;
  finishedAt: string | null;
  wallMs: number | null;
  counts: { scheduledPairs: number; completedPairs: number; games: number; failures: number; resumedPairs: number } | null;
  /**
   * Whether the finished run's comparison row is VOID, and why — the same
   * verdict `metrics.json` and `summary.md` carry (adjudication over 1%, SU
   * addendum 2; an arm's overrun rate over 5%, AMENDMENTS-DECIDED A14). Null
   * while the manifest still says `running`.
   */
  voided: boolean | null;
  voidReason: string | null;
  error: string | null;
}

/** Lane F adds `resolvedConfig?(work)` to `LadderEngine`; feature-detected so this file works before and after that merge. */
function resolvedConfigOf(name: string, work: WorkSpec): unknown {
  try {
    const engine = resolveEngine(name) as { resolvedConfig?: (w: WorkSpec) => unknown };
    return engine.resolvedConfig?.(work) ?? null;
  } catch {
    return null;
  }
}

export function buildManifest(args: CliArgs, schedule: readonly PairAssignment[], resumedPairIds: readonly string[]): RunManifest {
  return {
    schema: 'muju-ladder-manifest-v1',
    status: 'running',
    a: args.a,
    b: args.b,
    aConfigHash: engineHasWork(args.a) ? resolveEngine(args.a).configHash(args.work) : `scripted:${args.a}`,
    bConfigHash: engineHasWork(args.b) ? resolveEngine(args.b).configHash(args.work) : `scripted:${args.b}`,
    aResolvedConfig: resolvedConfigOf(args.a, args.work),
    bResolvedConfig: resolvedConfigOf(args.b, args.work),
    work: workKey(args.work),
    seed: args.seed,
    pairs: args.pairs,
    shards: args.shards,
    handicaps: args.handicaps,
    legality: args.legality,
    sprt: args.sprt,
    openings: {
      path: args.openingsPath === null ? null : path.relative(REPO_ROOT, args.openingsPath),
      sha256: args.openingsSha256,
      ids: args.openings.map(o => o.id),
      count: args.openings.length,
      skip: args.openingsSkip,
      selectedIds: args.openingsSelectedIds,
      used: openingsUsed(args),
    },
    openingsIndependent: openingsIndependent(args),
    independenceWarning: independenceWarning(args),
    overrunTolerance: args.overrunTolerance,
    replays: args.replays,
    resume: args.resume,
    schedule: schedule.map(p => ({ pairId: p.pairId, pairIndex: p.pairIndex, openingId: p.openingId, handicap: p.handicap, seed: p.seed })),
    resumedPairIds: [...resumedPairIds],
    sprtStop: null,
    rules: { rulesVersion: LADDER_RULES_VERSION, elementGraph: 'double-thick', upkeep: 'shipped', inactivityRule: 'on' },
    argv: args.argv,
    git: gitRevision(),
    gitDirty: gitDirty(),
    baseline: baselineIdentity().sources,
    wasmSha256: wasmSha256(),
    node: process.version,
    device: `${os.cpus()[0]?.model ?? 'unknown-cpu'} x${os.cpus().length} (${os.platform()}/${os.arch()})`,
    cpuCount: os.cpus().length,
    loadavg: os.loadavg(),
    at: new Date().toISOString(),
    finishedAt: null,
    wallMs: null,
    counts: null,
    voided: null,
    voidReason: null,
    error: null,
  };
}

function writeManifest(outDir: string, manifest: RunManifest): void {
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
}

/**
 * Renders `summary.md`. Exported so a test can drive it over a metrics object
 * it constructed (a degenerate Elo sample, a duplicated schedule) instead of
 * playing the games that would produce one.
 */
export function summaryMarkdown(metrics: RunMetrics): string {
  const lines: Array<string | null> = [
    `# Ladder: ${metrics.a} vs ${metrics.b}`,
    '',
    `- status: **${metrics.status}**`,
    `- work: \`${metrics.work}\`, handicaps: \`${metrics.handicaps.join(',')}\`, seed: ${metrics.seed}, shards: ${metrics.shards}`,
    // The ids listed are the ones the schedule PLAYED (`openingsUsed`), not the
    // pool. They used to be the pool, which reads as the run's independence
    // width and is not: rows #1 and #2 of E3.2 printed all 32 pool ids beside
    // "used 16 of 32" (`E3.2-ROW-REPORT.md` §10.5), so `summary.md` alone
    // over-counted the width by a factor of two while `metrics.json`
    // `openingsUsed` and `manifest.openings.used` held the right 16. The pool
    // is still countable here as the `of M` denominator, and it is listed in
    // full in `metrics.json.openings` and `manifest.openings.ids`.
    `- openings: used ${metrics.openingsUsed.length} of ${metrics.openings.length} — ` +
      `${metrics.openingsUsed.join(', ')}${metrics.openingsSha256 ? ` (sha256 ${metrics.openingsSha256.slice(0, 12)})` : ''}` +
      `${metrics.openingsSkip === null ? '' : ` — --openings-skip ${metrics.openingsSkip}`}` +
      `${metrics.openingsSelectedIds === null ? '' : ` — --openings-ids ${metrics.openingsSelectedIds.join(',')}`}`,
    `- openingsIndependent: ${metrics.openingsIndependent}`,
    metrics.independenceWarning === null ? null : `- **WARNING** ${metrics.independenceWarning}`,
    metrics.distinctGames.ofPairs === 0
      ? '- distinctGames: none (no attributed games)'
      : `- distinctGames: A-white ${metrics.distinctGames['A-white']}, B-white ${metrics.distinctGames['B-white']}` +
        ` of ${metrics.distinctGames.ofPairs} pair(s)` +
        ` (digested from ${metrics.distinctGames.source === 'replay' ? 'the replays' : 'the games.jsonl turns/plies/winType tuple, which is coarser'})` +
        (metrics.distinctGames.duplicates ? ' — **DUPLICATE OPENINGS**: pairs replayed the same game, so they are not independent observations' : ''),
    `- pairs: ${metrics.pairsCompleted}/${metrics.pairs}, games: ${metrics.games}/${metrics.gamesScheduled} (missing ${metrics.missingGames}, failed ${metrics.failures})`,
    `- A record (W/D/L): ${metrics.wins}/${metrics.draws}/${metrics.losses}`,
    `- adjudicationRate: ${(metrics.adjudicationRate * 100).toFixed(2)}%${metrics.adjudicationRate > 0.01 ? ' — **VOIDED** (> 1%, SU addendum 2)' : ''}`,
    metrics.voidReason === null ? null : `- **VOID** ${metrics.voidReason}`,
    `- illegalActions: ${metrics.illegalActions}, replicaDivergences: ${metrics.replicaDivergences}, timingAnomalies: ${metrics.timingAnomalies}`,
    // Gate 0 item 6: the six kinds, always printed, because "0 of each" is the
    // claim the gate needs stated rather than inferred from an absent line.
    `- engine fallbacks (Gate 0 item 6, must be 0): ${
      metrics.fallbacksRecorded
        ? `${metrics.fallbackTotal} total` +
          (metrics.fallbackTotal === 0
            ? ''
            : ` — ${describeFallbacks(metrics.fallbacks)} — **VOID**: a fallback means the game was partly V2 vs V2`)
        : 'NOT RECORDED (every row predates GameRow.fallbacks) — **VOID**: the gate cannot be shown to hold'
    }`,
    `  - ${FALLBACK_KINDS.map(k => `${k} ${metrics.fallbacks[k]}`).join(', ')}`,
    `- bothSeatsPlayed: ${metrics.bothSeatsPlayed}, seatMirrored: ${metrics.seatMirrored}`,
    metrics.eloDetail
      ? `- Elo (A vs B): ${metrics.elo.toFixed(1)} [${metrics.eloLo.toFixed(1)}, ${metrics.eloHi.toFixed(1)}],` +
        ` LOS ${(metrics.los * 100).toFixed(1)}%, n = ${metrics.eloDetail.n} pairs / ${metrics.eloDetail.games} games` +
        (metrics.eloDetail.degenerate || metrics.eloDetail.regularized ? ' **(degenerate sample, regularized - descriptive only)**' : '')
      : '- Elo: n/a (no pairs)',
    metrics.sprt ? `- SPRT: elo0=${metrics.sprt.elo0} elo1=${metrics.sprt.elo1} alpha=${metrics.sprt.alpha} beta=${metrics.sprt.beta} bounds=[${metrics.sprt.lowerBound.toFixed(4)}, ${metrics.sprt.upperBound.toFixed(4)}], minPairs=${metrics.sprt.minPairs}` : '- SPRT: not requested',
    metrics.sprtSequential
      ? `- SPRT (sequential, pairIndex order — the run's decision): **${metrics.sprtSequential.decision}**` +
        ` at pair ${metrics.sprtSequential.decidedAtPair ?? 'n/a'} of ${metrics.sprtSequential.trace.length} checked, final LLR=${metrics.sprtSequential.finalLlr.toFixed(4)}`
      : '- SPRT (sequential): not requested',
    metrics.sprt ? `- SPRT (batch, all pairs at once): ${metrics.sprt.decision}, LLR=${metrics.sprt.llr.toFixed(4)}` : null,
    `- meanTurnMs: a=${metrics.meanTurnMs.a.toFixed(1)} b=${metrics.meanTurnMs.b.toFixed(1)}`,
    `- loadAvgMean (1-min, per game, start and end): ` +
      `${metrics.loadAvgMean === null ? 'not recorded (run predates the per-game samples)' : metrics.loadAvgMean.toFixed(2)}`,
    '',
    '## Per-engine turn timing (AMENDMENTS-DECIDED A4)',
    '',
    `Allowance: ${metrics.work.startsWith('wall:') ? metrics.work : 'none (fixed work has no clock)'}.`,
    `Tolerance: ${metrics.overrunTolerance.spec}, ${OVERRUN_TOLERANCE_CITATION}` +
      `${metrics.timing.a.toleranceMs === null ? '' : ` = ${metrics.timing.a.toleranceMs.toFixed(0)} ms at this allowance`}.` +
      ' overAllowance counts any ms past the allowance; overruns counts the turns past the tolerance;' +
      ` overrunRate = overruns / turns, and above ${(OVERRUN_RATE_VOID_THRESHOLD * 100).toFixed(0)}% for either arm the` +
      ' row is VOID (AMENDMENTS-DECIDED A14).',
    '',
    '| engine | turns | p95TurnMs | maxTurnMs | overAllowance | overruns | overrunRate | budgetExhausted | reSearches |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...(['a', 'b'] as const).map(k => {
      const t = metrics.timing[k];
      const num = (v: number): string => (Number.isNaN(v) ? 'n/a' : v.toFixed(0));
      const opt = (v: number | null): string => (v === null ? 'n/a' : String(v));
      const rate = t.overrunRate === null ? 'n/a' : `${(t.overrunRate * 100).toFixed(2)}%`;
      return `| ${k === 'a' ? metrics.a : metrics.b} | ${t.turns} | ${num(t.p95TurnMs)} | ${num(t.maxTurnMs)} | ${t.overAllowance} | ${t.overruns} | ${rate} | ${opt(t.budgetExhausted)} | ${opt(t.reSearches)} |`;
    }),
    '',
    '## How the search stopped (AMENDMENTS-DECIDED A16)',
    '',
    'abortedSearches: searches the engine abandoned on its watchdog rather than on its work rung —' +
      " under A11 that watchdog is the turn's remaining allowance, so this counts the moves the CLOCK chose." +
      ' abortRate = abortedSearches / searches. firstSearchAborted: games whose FIRST search was one of them' +
      ' (the cold profile, still INITIAL_UNITS_PER_MS, has measured nothing yet). emptyPlans: searches that' +
      ' returned no actions, where the adapter ends the phase through phaseEndAction (A10).' +
      ' Counted PER SEAT since E1.5 (PlayerGameStats.hardTiming), so a Hard-vs-Hard row attributes them per' +
      ' arm; older records fall back to the process-wide counters, which only a run with one hard@ arm can' +
      ' own. n/a means neither source says anything about this arm — never that the count was zero.',
    '',
    '| engine | searches | abortedSearches | abortRate | firstSearchAborted | emptyPlans |',
    '| --- | --- | --- | --- | --- | --- |',
    ...(['a', 'b'] as const).map(k => {
      const t = metrics.timing[k];
      const opt = (v: number | null): string => (v === null ? 'n/a' : String(v));
      const rate = t.abortRate === null ? 'n/a' : `${(t.abortRate * 100).toFixed(2)}%`;
      return `| ${k === 'a' ? metrics.a : metrics.b} | ${opt(t.searches)} | ${opt(t.abortedSearches)} | ${rate} | ${opt(t.firstSearchAborted)} | ${opt(t.emptyPlans)} |`;
    }),
    '',
    '## Per-handicap strata',
    '',
    '| handicap | pairs | games | score (A) | W/D/L | Elo |',
    '| --- | --- | --- | --- | --- | --- |',
    ...metrics.strata.map(s =>
      `| ${s.handicap} | ${s.pairs}/${s.pairsScheduled} | ${s.games} | ${Number.isNaN(s.score) ? 'n/a' : s.score.toFixed(3)} | ${s.wins}/${s.draws}/${s.losses} | ${s.elo ? s.elo.elo.toFixed(1) : 'n/a'} |`,
    ),
    '',
  ];
  return lines.filter((l): l is string => l !== null).join('\n');
}

function writeSummary(outDir: string, metrics: RunMetrics): void {
  fs.writeFileSync(path.join(outDir, 'summary.md'), summaryMarkdown(metrics));
}

/**
 * Watches the shards' pair rows while they play and, once the sequential SPRT
 * crosses a bound, writes `sprt-stop.json` so no shard starts another pair
 * (`worker.ts`). The test is evaluated over the CONTIGUOUS prefix of completed
 * pairs in pairIndex order: shards finish out of step, and a checkpoint
 * sequence with holes in it is not a prefix of the sequence the final artifact
 * reports, so a decision taken on one would not be the decision the protocol
 * predeclared.
 *
 * The stop is best-effort by construction — a shard checks between pairs, so
 * games already under way still finish — and it is never what decides the run:
 * the verdict in `metrics.json` is recomputed from the rows that actually
 * landed.
 */
function startSprtStopWatcher(opts: {
  shardsDir: string;
  schedule: readonly PairAssignment[];
  priorPairs: readonly PairRow[];
  shardCount: number;
  params: SprtParams;
  pollMs?: number;
}): { stop(): void; signal(): SprtStopSignal | null } {
  let signal: SprtStopSignal | null = null;
  const check = (): void => {
    if (signal !== null) return;
    let rows: PairRow[];
    try {
      rows = [...opts.priorPairs, ...readShardRows<PairRow>(opts.shardsDir, 'pairs', opts.shardCount)];
    } catch {
      return; // a row mid-write: try again on the next tick
    }
    const done = new Map(rows.map(p => [p.pairId, p.scoreA]));
    const prefix: number[] = [];
    for (const p of [...opts.schedule].sort((x, y) => x.pairIndex - y.pairIndex)) {
      const score = done.get(p.pairId);
      if (score === undefined) break;
      prefix.push(score);
    }
    const result = sprtSequential(prefix, opts.params);
    if (result.decision === 'continue' || result.decidedAtPair === null) return;
    signal = { decision: result.decision, decidedAtPair: result.decidedAtPair, minPairs: result.minPairs, at: new Date().toISOString() };
    fs.writeFileSync(path.join(opts.shardsDir, SPRT_STOP_FILE), JSON.stringify(signal, null, 2) + '\n');
  };
  const timer = setInterval(check, opts.pollMs ?? 500);
  timer.unref?.(); // never keeps the process alive on its own
  return {
    stop: () => clearInterval(timer),
    signal: () => signal,
  };
}

export interface LadderRunResult {
  status: 'complete' | 'incomplete';
  metrics: RunMetrics;
  manifest: RunManifest;
  outDir: string;
  failures: FailureRow[];
}

/**
 * The whole run, minus argv parsing and process exit — the entry point tests
 * drive. Writes every artifact before it reports a failure, so nothing a run
 * produced is ever lost to a later error.
 */
export async function runLadder(args: CliArgs): Promise<LadderRunResult> {
  // Checked again here, not only in `parseArgs`: `runLadder` is the entry point
  // a script or a test can reach with a hand-built `CliArgs`, and a schedule of
  // duplicate pairs cannot be repaired after the games are played.
  if (!args.allowInitialOnly) {
    const refusal = pairIndependenceRefusal(args);
    if (refusal !== null) throw new Error(refusal);
  }
  if (!args.allowOpeningReuse) {
    const refusal = openingCapacityRefusal(args);
    if (refusal !== null) throw new Error(refusal);
  }
  const startedAtMs = Date.now();
  fs.mkdirSync(args.out, { recursive: true });
  const shardsDir = path.join(args.out, '.shards');
  const replaysDir = path.join(args.out, 'replays');
  const schedule = buildSchedule(args);
  const effectiveShards = Math.max(1, Math.min(args.shards, args.pairs));

  // A resume must go back into the SAME experiment. Checked before the
  // manifest is rewritten, so a refused resume leaves the prior run's
  // artifacts exactly as they were.
  if (args.resume) {
    const priorManifestPath = path.join(args.out, 'manifest.json');
    if (fs.existsSync(priorManifestPath)) {
      const priorManifest = JSON.parse(fs.readFileSync(priorManifestPath, 'utf8')) as RunManifest;
      const mismatches = resumeIdentityMismatches(args, priorManifest);
      if (mismatches.length > 0) {
        throw new Error(
          `hard:ladder: refusing to --resume into ${args.out}: its manifest describes a different experiment ` +
            `(${mismatches.join('; ')}). Those pair rows were produced under other conditions; pooling them would ` +
            'mix two populations into one Elo and one SPRT. Use a fresh --out, or rerun without --resume.',
        );
      }
    }
  }

  const prior = args.resume
    ? planResume(schedule, readJsonl<GameRow>(path.join(args.out, 'games.jsonl')), readJsonl<PairRow>(path.join(args.out, 'pairs.jsonl')))
    : { completedPairIds: [], keptGames: [], keptPairs: [], droppedGames: 0 };

  const manifest = buildManifest(args, schedule, prior.completedPairIds);
  writeManifest(args.out, manifest); // status: "running", BEFORE the first game

  // Hoisted so the outer catch can report the failure rows this attempt
  // actually produced instead of an empty list (null = the run died before the
  // merge, in which case `failuresForManifest` falls back to what is on disk).
  let mergedFailures: FailureRow[] | null = null;
  const failuresPath = path.join(args.out, 'failures.jsonl');

  const finalize = (status: RunManifest['status'], metrics: RunMetrics | null, failures: FailureRow[], error: string | null): void => {
    manifest.status = status;
    manifest.finishedAt = new Date().toISOString();
    manifest.wallMs = Date.now() - startedAtMs;
    manifest.counts = {
      scheduledPairs: schedule.length,
      completedPairs: metrics?.pairsCompleted ?? 0,
      games: metrics?.games ?? 0,
      failures: failures.length,
      resumedPairs: prior.completedPairIds.length,
    };
    manifest.voided = metrics?.voided ?? null;
    manifest.voidReason = metrics?.voidReason ?? null;
    manifest.error = error;
    writeManifest(args.out, manifest);
  };

  try {
    // The previous attempt's failure rows are about to be superseded by this
    // attempt's; append them to a running log first so a resume never erases
    // the record of what went wrong (EPIC-PLAN E0.4: nothing silently dropped).
    if (args.resume && fs.existsSync(failuresPath)) {
      const previous = fs.readFileSync(failuresPath, 'utf8');
      if (previous.trim() !== '') fs.appendFileSync(path.join(args.out, 'failures-superseded.jsonl'), previous);
    }
    // The previous attempt's shard files would otherwise be merged again; the
    // merged `games.jsonl` above already carries everything they held.
    fs.rmSync(shardsDir, { recursive: true, force: true });
    fs.mkdirSync(shardsDir, { recursive: true });
    const shardConfig: ShardConfig = {
      openings: args.openings,
      replays: args.replays,
      replaysDir,
      completedPairIds: prior.completedPairIds,
    };
    fs.writeFileSync(path.join(shardsDir, SHARD_CONFIG_FILE), JSON.stringify(shardConfig) + '\n');

    const stopWatcher = args.sprt
      ? startSprtStopWatcher({
          shardsDir,
          schedule,
          priorPairs: prior.keptPairs,
          shardCount: effectiveShards,
          params: args.sprt,
        })
      : null;

    let shardError: string | null = null;
    try {
      await runSharded({
        a: args.a,
        b: args.b,
        work: args.work,
        handicaps: args.handicaps,
        seed: args.seed,
        pairs: args.pairs,
        shardCount: args.shards,
        legality: args.legality,
        out: shardsDir,
      });
    } catch (err) {
      // A dead shard must not discard what the others finished (EPIC-PLAN E0.4).
      shardError = err instanceof Error ? (err.stack ?? err.message) : String(err);
    } finally {
      stopWatcher?.stop();
    }
    const stopSignal = stopWatcher?.signal() ?? null;

    if (shardError !== null) {
      // `runSharded` rejected the moment ONE shard exited non-zero; the others
      // are still playing and still writing. Merging now would report their
      // work as missing, so wait until every shard is finished or gone.
      shardError = `${shardError}\n${describeSettle(await awaitShardsSettled(shardsDir, effectiveShards))}`;
    }

    const newGames = readShardRows<GameRow>(shardsDir, 'games', effectiveShards);
    const newPairs = readShardRows<PairRow>(shardsDir, 'pairs', effectiveShards);
    const failures = readShardRows<FailureRow>(shardsDir, 'failures', effectiveShards);
    mergedFailures = failures;

    const games = [...prior.keptGames, ...newGames];
    const pairs = [...prior.keptPairs, ...newPairs];

    writeJsonl(path.join(args.out, 'games.jsonl'), games);
    writeJsonl(path.join(args.out, 'pairs.jsonl'), pairs);
    writeJsonl(failuresPath, failures);

    assertNoDuplicateGames(games);

    const metrics = computeMetrics(args, games, pairs, failures);
    // A run the SPRT stopped is not a broken run: every pair it started is on
    // disk in both orientations, and the pairs it never launched were not
    // supposed to be played. It is only "complete" when nothing else is wrong.
    const stoppedCleanly =
      stopSignal !== null &&
      failures.length === 0 &&
      metrics.unattributedGames === 0 &&
      metrics.games === metrics.pairsCompleted * 2;
    const status: 'complete' | 'incomplete' =
      shardError === null && (metrics.status === 'complete' || stoppedCleanly) ? 'complete' : 'incomplete';
    const reported: RunMetrics = { ...metrics, status };
    manifest.sprtStop = reported.sprtSequential === null
      ? null
      : {
          decision: reported.sprtSequential.decision,
          decidedAtPair: reported.sprtSequential.decidedAtPair,
          minPairs: reported.sprtSequential.minPairs,
          earlyStop: stopSignal !== null,
          signalledAtPair: stopSignal?.decidedAtPair ?? null,
          pairsPlayedBeyondDecision:
            reported.sprtSequential.decidedAtPair === null ? 0 : Math.max(0, reported.pairsCompleted - reported.sprtSequential.decidedAtPair),
        };

    if (reported.sprt) {
      // Both statistics over the same pairs: the sequential one is the verdict
      // (`metrics.decision`), the batch one is reported beside it.
      fs.writeFileSync(
        path.join(args.out, 'sprt.json'),
        JSON.stringify(
          {
            checkpointOrder:
              'pairIndex: the sequential test checks the completed pairs one at a time in ascending pairIndex, ' +
              'the order fixed by --pairs and --seed before the run started, never the order the shards finished in',
            decision: reported.sprtSequential?.decision ?? null,
            sequential: reported.sprtSequential,
            batch: reported.sprt,
            stop: manifest.sprtStop,
          },
          null,
          2,
        ) + '\n',
      );
    }
    if (reported.eloDetail) fs.writeFileSync(path.join(args.out, 'elo.json'), JSON.stringify(reported.eloDetail, null, 2) + '\n');
    writeSummary(args.out, reported);
    fs.writeFileSync(path.join(args.out, 'metrics.json'), JSON.stringify(reported, null, 2) + '\n');

    finalize(status, reported, failures, shardError);
    // `.shards` is forensic evidence for anything that went wrong; only a clean run clears it.
    if (status === 'complete') fs.rmSync(shardsDir, { recursive: true, force: true });
    return { status, metrics: reported, manifest, outDir: args.out, failures };
  } catch (err) {
    finalize('incomplete', null, failuresForManifest(mergedFailures, failuresPath), err instanceof Error ? (err.stack ?? err.message) : String(err));
    throw err;
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const result = await runLadder(args);
  console.log(`hard:ladder: wrote ${result.outDir} (${result.status})`);
  console.log(JSON.stringify(result.metrics));
  if (result.status !== 'complete') {
    console.error(
      `hard:ladder: run INCOMPLETE — ${result.failures.length} failed game(s), ` +
        `${result.metrics.pairsCompleted}/${result.metrics.pairs} pairs completed. ` +
        'Artifacts (including failures.jsonl and .shards/) were written; rerun with --resume to finish.',
    );
    process.exitCode = 1;
  }
}

const INVOKED_DIRECTLY =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (INVOKED_DIRECTLY) {
  main().catch(err => {
    console.error(`hard:ladder: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
    process.exitCode = 1;
  });
}
