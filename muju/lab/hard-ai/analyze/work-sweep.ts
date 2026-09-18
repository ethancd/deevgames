/**
 * The work sweep: at what work rung does the engine start choosing the turn
 * the adviser would have played?
 *
 * WHY. The E2 split (`ANALYZE.md` §"E2 addendum") found that on the 14 E1.1
 * losses the root searched its ENTIRE candidate list every time — nothing was
 * discarded — and that at a fixed 400,000 units the engine scored the
 * adviser's best turn above the played turn in nine of them, choosing it
 * outright in six. That is a statement about the re-run, not about the seat:
 * the seat played under `wall:3000` at whatever rung `chooseWork` picked. This
 * sweep asks the question the split cannot: how much work does the engine
 * actually need to find the better turn, and is that inside what the seat's
 * allowance could have bought?
 *
 * WHAT IT RUNS. For each analysed turn, the PRODUCTION engine at each rung of
 * `SWEEP_WORKS`, with the root instrument on. No adviser search is re-run for
 * the two turns the artifact already scored (the played turn and the adviser's
 * best); a rung that picks some THIRD turn costs one adviser search, cached by
 * end key, because "did the engine find something as good" cannot be answered
 * without scoring what it found.
 *
 * WHAT FLIP WORK MEANS. The lowest rung at which the engine's choice is either
 * the adviser's own best turn or a turn the adviser scores within
 * `FLIP_TOLERANCE_CC` of its best. "Never flipped" means no rung up to the top
 * of the sweep did so; it does not mean no rung ever would.
 *
 * ONE ENGINE PER SEARCH. The first cut of this sweep built one production
 * engine and reused it across every work level and every turn, ascending. The
 * transposition table is therefore warm from the previous rungs when the next
 * one runs, so a "flip at 283,000 units" was a flip at a cumulative several
 * hundred thousand with a warmed table, and lane 1 reproduced a disagreement
 * with a fresh fixed-work search on exactly that row. A fixed-work search is
 * supposed to be a function of position and work alone, which is the contract
 * the rest of the lab relies on, so `mode: 'fresh'` builds a NEW engine for
 * every (turn, work) search. `mode: 'game-warm'` deliberately does the
 * opposite in a stated way: it warms a fresh engine on the seat's OWN earlier
 * turns of the same game before the target search, because real play has a
 * warm table. Fresh and game-warm bracket what the seat saw.
 *
 * WHICH ENGINE SEARCHES. By default the PRODUCTION engine is the one the
 * artifact was analysed with (`config.engineLabel`, `hard@desktop` for every
 * E1.1 loss), and that default path is untouched: same config object, same
 * factory calls, same rungs, so the numbers are comparable with E2's sweep
 * byte for byte. `--engine hard@<label>` (E3.2 lane 10) swaps ONLY the
 * production engine — for `hard@ablate:eval-no-safety`, the arm whose leaf
 * weights E3.2 is pricing. The ADVISER is deliberately not swapped: it is the
 * yardstick a flip is measured against (`adviserBestDeepCc` in the artifact
 * was produced by the champion's adviser), so moving it would move the
 * question. A rung under `--engine` therefore answers "does THIS engine's
 * search choose the turn the CHAMPION'S adviser preferred", which is the only
 * form in which the arm's rungs and the champion's rungs can be compared.
 *
 * WHAT IT CANNOT SAY. The rungs are fixed work; the seat ran a wall clock with
 * `chooseWork`'s ×2 quantisation and its own measured units-per-millisecond.
 * `impliedWork` below is the seat's own wall time at `UNITS_PER_MS`, a
 * back-of-envelope conversion and not a measurement of what the seat searched.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyPlan, deepScore, type AnalysisResult, type TurnRow } from './analyze';
import { PositionReader, defaultEngineFactory, resolveHardConfig, type AdviserEngine, type EngineFactory } from './engine';
import { hardProfileOf, loadReplay, reconstruct, withMatchRules } from './replay';
import type { HardConfig } from '../../../src/ai/hard/config';

/**
 * `hard@<label>` -> the full config that label plays with, through
 * `resolveHardConfig`, i.e. through `bots/hard.ts hardEnginePatch`: the only
 * path that substitutes `DEFAULT_WEIGHTS` for `DESKTOP`'s version-0
 * placeholder and the only one that understands `ablate:<arm>` (E0's I2
 * lesson). The version assertion is that lesson written down.
 */
export function resolveEngineLabel(engine: string): HardConfig {
  const label = engine.startsWith('hard@') ? engine.slice('hard@'.length) : engine;
  const config = resolveHardConfig(label);
  if (config.weights === undefined || config.weights.version === 0) {
    throw new Error(`work-sweep: ${engine} resolved placeholder weights (version 0); refusing to sweep`);
  }
  return config;
}

/**
 * `search/time.ts WORK_LADDER` is ×2 quantised (25k, 50k, 100k, 200k, 400k,
 * 800k, 1.6M, 3.2M). 283k and 566k are the ×√2 midpoints between the three
 * rungs a `wall:3000` seat lands on, so a flip between 200k and 400k can be
 * placed on one side or the other of a rung the ladder does not currently have.
 */
export const SWEEP_WORKS: readonly number[] = [100_000, 200_000, 283_000, 400_000, 566_000, 800_000];

/** How close to the adviser's own best a choice has to be to count as a flip. */
export const FLIP_TOLERANCE_CC = 300;

/**
 * Units per millisecond used to convert the seat's wall time into work. The
 * engine starts every fresh profile at 200 and measures from there; 100 is the
 * coordinator's estimate for this box under `wall:3000`. Both are reported.
 */
export const UNITS_PER_MS = 100;
/** Work per warming search in `game-warm`; an assumption, not a record. */
export const DEFAULT_WARM_WORK = 200_000;
export const FRESH_PROFILE_UNITS_PER_MS = 200;

export interface SweepRung {
  work: number;
  chosenEndKey: string;
  chosenIsAdviserBest: boolean;
  chosenIsPlayed: boolean;
  /** The adviser's value of the turn this rung chose, from the seat's view. Null when it could not be scored. */
  chosenDeepCc: number | null;
  /** `chosenDeepCc` within `FLIP_TOLERANCE_CC` of the adviser's own best. */
  withinTolerance: boolean;
  candidateSource: string | null;
  candidates: number;
  searched: number;
  depth: number;
  wallMs: number;
  /** Searches run to warm this engine before the measured one (`game-warm`). */
  warmSearches: number;
}

export interface SweepTurn {
  fileId: string;
  side: string;
  turnNumber: number;
  /** `first` (the first consequential turn) or `largest` (the largest-swing turn). */
  role: string;
  klass: string;
  adviserEndKey: string;
  playedEndKey: string | null;
  adviserBestDeepCc: number;
  playedDeepCc: number;
  swingCc: number;
  /** The seat's own wall time on this turn, from the replay's `players[side].turnMs`. */
  seatTurnMs: number | null;
  budgetMs: number | null;
  impliedWork: number | null;
  impliedWorkFresh: number | null;
  /** Lowest rung whose choice is the adviser's best or within tolerance of it; null when none did. */
  flipWork: number | null;
  /** Any rung reproduced the turn the seat actually played. */
  reproducedAtAnyRung: boolean;
  rungs: SweepRung[];
}

export interface SweepReport {
  schema: 'muju-hard-work-sweep-v1';
  source: string;
  /**
   * The engine label the PRODUCTION searches ran under. `null` means the
   * default: whatever each artifact's own `config.engineLabel` resolves to,
   * which is what every sweep before E3.2 did.
   */
  engine: string | null;
  /** `Weights.label` the production engine played with; `null` on the default path. */
  engineWeightsLabel: string | null;
  /** How each measured search was set up. */
  mode: SweepMode;
  warmWork: number | null;
  works: readonly number[];
  toleranceCc: number;
  unitsPerMs: number;
  turns: SweepTurn[];
  /** Flip work -> turns; the key `never` counts the turns no rung flipped. */
  flipHistogram: Array<{ work: number | null; turns: number }>;
  flippedAtOrBelow400k: number;
  neverFlipped: number;
  adviserSearches: number;
  productionSearches: number;
  wallMs: number;
  at: string;
}

export type SweepMode = 'fresh' | 'game-warm';

interface SweepOptions {
  works?: readonly number[];
  /**
   * `fresh` (default): a new engine per (turn, work) search, so each number is
   * a function of position and work alone. `game-warm`: a new engine per
   * search, warmed first by searching the seat's own earlier turns of the same
   * game at `warmWork`.
   */
  mode?: SweepMode;
  /**
   * Work per warming search in `game-warm`. The replays predate lane 1's
   * per-turn instrument, so the rung the seat actually used at each earlier
   * turn is NOT recorded; 200,000 is an assumption, stated as one.
   */
  warmWork?: number;
  engineFactory?: EngineFactory;
  /**
   * `hard@<label>` for the PRODUCTION searches only; the adviser keeps the
   * artifact's own engine so `adviserBestDeepCc` stays the yardstick. Omit for
   * the default path.
   */
  engine?: string | null;
  /** Sweep the largest-swing turn as well, when it is a different turn. */
  includeLargest?: boolean;
  onTurn?: (fileId: string, turnNumber: number, flipWork: number | null) => void;
}

/** The turns of one artifact this sweep covers, with the role that put them in. */
export function sweepTargets(saved: AnalysisResult, includeLargest: boolean): Array<{ turn: number; role: string }> {
  const out: Array<{ turn: number; role: string }> = [];
  if (saved.firstConsequential.turn !== null) out.push({ turn: saved.firstConsequential.turn, role: 'first' });
  if (includeLargest && saved.largestSwing.turn !== null && saved.largestSwing.turn !== saved.firstConsequential.turn) {
    out.push({ turn: saved.largestSwing.turn, role: 'largest' });
  }
  return out;
}

/** The lowest rung that chose the adviser's best turn or something within tolerance of it. */
export function flipWorkOf(rungs: readonly SweepRung[]): number | null {
  for (const r of [...rungs].sort((a, b) => a.work - b.work)) {
    if (r.chosenIsAdviserBest || r.withinTolerance) return r.work;
  }
  return null;
}

export async function sweepAnalysis(
  saved: AnalysisResult,
  opts: SweepOptions = {},
): Promise<{ turns: SweepTurn[]; adviserSearches: number; productionSearches: number; engineWeightsLabel: string | null }> {
  const works = opts.works ?? SWEEP_WORKS;
  const profile = hardProfileOf(saved.config.engineLabel);
  if (profile === null) throw new Error(`cannot resolve a hard profile from ${saved.config.engineLabel}`);
  const config = resolveHardConfig(profile);
  // The production engine. On the default path this IS `config` — the same
  // object identity the sweep has always passed — so nothing about the
  // default run moves.
  const productionConfig = opts.engine === undefined || opts.engine === null ? config : resolveEngineLabel(opts.engine);
  const engineWeightsLabel = opts.engine === undefined || opts.engine === null ? null : productionConfig.weights.label;
  const factory = opts.engineFactory ?? defaultEngineFactory;
  const replay = loadReplay(saved.replay);
  const recon = reconstruct(replay);
  const seatTurns = recon.bySide[saved.side];
  const targets = sweepTargets(saved, opts.includeLargest ?? false);

  let adviserSearches = 0;
  let productionSearches = 0;
  const turns: SweepTurn[] = [];

  const mode: SweepMode = opts.mode ?? 'fresh';
  const warmWork = opts.warmWork ?? DEFAULT_WARM_WORK;

  await withMatchRules(replay.options, async () => {
    const reader = new PositionReader();
    /**
     * A production engine for ONE measured search. In `game-warm` it first
     * searches the seat's earlier turns of this game, so the transposition
     * table holds what a seat playing the game would have put there.
     */
    const engineFor = async (targetTurnNumber: number): Promise<{ engine: AdviserEngine; warmSearches: number }> => {
      const engine = factory({ ...productionConfig }, 'production');
      if (mode !== 'game-warm') return { engine, warmSearches: 0 };
      let warmSearches = 0;
      for (const earlier of seatTurns) {
        if (earlier.turnNumber >= targetTurnNumber) break;
        await engine.searchTurn(earlier.startState, { work: warmWork });
        warmSearches++;
      }
      return { engine, warmSearches };
    };

    for (const target of targets) {
      const row: TurnRow | undefined = saved.turns.find(t => t.turnNumber === target.turn);
      const turn = seatTurns.find(t => t.turnNumber === target.turn);
      if (row === undefined || turn === undefined) continue;

      // Deep scores the artifact already paid for. A rung that picks one of
      // these two costs no adviser search.
      const deepByKey = new Map<string, number>();
      deepByKey.set(row.adviser.endKey, row.adviserBestDeepCc);
      if (row.played.endKey !== null) deepByKey.set(row.played.endKey, row.playedDeepCc);

      const rungs: SweepRung[] = [];
      for (const work of works) {
        const startedAt = Date.now();
        const { engine: production, warmSearches } = await engineFor(target.turn);
        productionSearches += 1 + warmSearches;
        const result = await production.searchTurn(turn.startState, { work, expose: true });
        let deep = deepByKey.get(result.endKey);
        if (deep === undefined) {
          const plan = applyPlan(turn.startState, result.actions);
          // A fresh adviser too: a deep score must not depend on what the
          // previous deep score left in the table.
          const scored = await deepScore(factory({ ...config }, 'adviser'), reader, plan.state, saved.side, saved.config.adviserWork);
          adviserSearches++;
          deep = scored.cc;
          deepByKey.set(result.endKey, deep);
        }
        rungs.push({
          work,
          chosenEndKey: result.endKey,
          chosenIsAdviserBest: result.endKey === row.adviser.endKey,
          chosenIsPlayed: row.played.endKey !== null && result.endKey === row.played.endKey,
          chosenDeepCc: deep,
          withinTolerance: deep >= row.adviserBestDeepCc - FLIP_TOLERANCE_CC,
          candidateSource: result.candidateSource ?? null,
          candidates: result.candidates?.length ?? 0,
          searched: result.candidates?.filter(c => c.searched).length ?? 0,
          depth: result.depth,
          wallMs: Date.now() - startedAt,
          warmSearches,
        });
      }

      const seatTurnMs = row.timing.turnMs;
      const flipWork = flipWorkOf(rungs);
      turns.push({
        fileId: saved.fileId,
        side: saved.side,
        turnNumber: target.turn,
        role: target.role,
        klass: (target.role === 'first' ? saved.firstConsequential : saved.largestSwing).klass,
        adviserEndKey: row.adviser.endKey,
        playedEndKey: row.played.endKey,
        adviserBestDeepCc: row.adviserBestDeepCc,
        playedDeepCc: row.playedDeepCc,
        swingCc: row.swingCc,
        seatTurnMs,
        budgetMs: row.timing.budgetMs,
        impliedWork: seatTurnMs === null ? null : Math.round(seatTurnMs * UNITS_PER_MS),
        impliedWorkFresh: seatTurnMs === null ? null : Math.round(seatTurnMs * FRESH_PROFILE_UNITS_PER_MS),
        flipWork,
        reproducedAtAnyRung: rungs.some(r => r.chosenIsPlayed),
        rungs,
      });
      opts.onTurn?.(saved.fileId, target.turn, flipWork);
    }
  });

  return { turns, adviserSearches, productionSearches, engineWeightsLabel };
}

export async function sweepDirectory(source: string, opts: SweepOptions & { out: string }): Promise<SweepReport> {
  const startedAt = Date.now();
  const files = fs
    .readdirSync(source)
    .filter(f => f.endsWith('.json') && f !== 'summary.json')
    .sort();
  const turns: SweepTurn[] = [];
  let adviserSearches = 0;
  let productionSearches = 0;
  let engineWeightsLabel: string | null = null;
  for (const file of files) {
    const saved = JSON.parse(fs.readFileSync(path.join(source, file), 'utf8')) as AnalysisResult;
    const one = await sweepAnalysis(saved, opts);
    turns.push(...one.turns);
    adviserSearches += one.adviserSearches;
    productionSearches += one.productionSearches;
    engineWeightsLabel = one.engineWeightsLabel;
  }

  const counts = new Map<number | null, number>();
  for (const t of turns) counts.set(t.flipWork, (counts.get(t.flipWork) ?? 0) + 1);
  const report: SweepReport = {
    schema: 'muju-hard-work-sweep-v1',
    source: path.resolve(source),
    engine: opts.engine ?? null,
    engineWeightsLabel,
    mode: opts.mode ?? 'fresh',
    warmWork: (opts.mode ?? 'fresh') === 'game-warm' ? (opts.warmWork ?? DEFAULT_WARM_WORK) : null,
    works: opts.works ?? SWEEP_WORKS,
    toleranceCc: FLIP_TOLERANCE_CC,
    unitsPerMs: UNITS_PER_MS,
    turns,
    flipHistogram: [...counts.entries()]
      .map(([work, n]) => ({ work, turns: n }))
      .sort((a, b) => (a.work ?? Infinity) - (b.work ?? Infinity)),
    flippedAtOrBelow400k: turns.filter(t => t.flipWork !== null && t.flipWork <= 400_000).length,
    neverFlipped: turns.filter(t => t.flipWork === null).length,
    adviserSearches,
    productionSearches,
    wallMs: Date.now() - startedAt,
    at: new Date().toISOString(),
  };
  fs.mkdirSync(opts.out, { recursive: true });
  fs.writeFileSync(path.join(opts.out, 'sweep.json'), `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(path.join(opts.out, 'sweep.md'), renderSweepMarkdown(report));
  return report;
}

function work(n: number | null): string {
  return n === null ? 'never' : `${Math.round(n / 1000)}k`;
}

export function renderSweepMarkdown(r: SweepReport): string {
  const lines: string[] = [];
  lines.push('# Work sweep — when does the engine choose the adviser’s turn?');
  lines.push('');
  lines.push(
    r.engine === null
      ? 'Production engine: each artifact’s own (`config.engineLabel`).'
      : `Production engine **\`${r.engine}\`** (weights \`${r.engineWeightsLabel ?? '?'}\`); the adviser that scores each chosen turn is unchanged, so "the adviser’s best" is still the champion’s adviser and the rungs are comparable with the default sweep.`,
  );
  lines.push('');
  lines.push(
    `Mode **${r.mode}**${r.warmWork === null ? ' (a new engine per measured search; no table carried between rungs or turns)' : ` (a new engine per measured search, first warmed on the seat's earlier turns of the same game at ${work(r.warmWork)} units each — an assumption, the rung the seat used is not recorded)`}.`,
  );
  lines.push('');
  lines.push(
    `${r.turns.length} turn(s) from \`${r.source}\`, each re-run at ${r.works.map(w => work(w)).join(', ')} units with the root instrument on. ` +
      `A turn "flips" at the lowest rung whose choice is the adviser's own best turn or one the adviser scores within ${r.toleranceCc} cc of its best.`,
  );
  lines.push('');
  lines.push(`${r.productionSearches} production searches and ${r.adviserSearches} adviser searches; ${Math.round(r.wallMs / 1000)} s of wall time.`);
  lines.push('');
  lines.push('## Flip work');
  lines.push('');
  lines.push('| flip work | turns |');
  lines.push('| --- | ---: |');
  for (const row of r.flipHistogram) lines.push(`| ${work(row.work)} | ${row.turns} |`);
  lines.push('');
  lines.push(`Flipped at or below 400k: ${r.flippedAtOrBelow400k} of ${r.turns.length}. Never flipped up to ${work(r.works[r.works.length - 1])}: ${r.neverFlipped}.`);
  lines.push('');
  lines.push('## Per turn');
  lines.push('');
  lines.push('| game | turn | class | flip work | seat ms | implied work @100/ms | @200/ms | played reproduced at any rung | chosen turn by rung |');
  lines.push('| --- | ---: | --- | ---: | ---: | ---: | ---: | :-: | --- |');
  for (const t of r.turns) {
    const byRung = t.rungs
      .map(x => `${work(x.work)}:${x.chosenIsAdviserBest ? 'A' : x.chosenIsPlayed ? 'P' : x.withinTolerance ? '~' : 'o'}`)
      .join(' ');
    lines.push(
      `| \`${t.fileId}\` | ${t.turnNumber} | ${t.klass} | ${work(t.flipWork)} | ${t.seatTurnMs ?? '—'} | ${t.impliedWork === null ? '—' : work(t.impliedWork)} | ${t.impliedWorkFresh === null ? '—' : work(t.impliedWorkFresh)} | ${t.reproducedAtAnyRung ? 'yes' : 'no'} | ${byRung} |`,
    );
  }
  lines.push('');
  lines.push('`A` = the adviser’s own best turn, `~` = within tolerance of it, `P` = the turn the seat played, `o` = neither.');
  lines.push('');
  lines.push(
    `The implied-work columns are the seat's own wall time at ${r.unitsPerMs} and at ${FRESH_PROFILE_UNITS_PER_MS} units per millisecond. ` +
      'They are a conversion, not a measurement: the seat ran `chooseWork` against its own measured rate with ×2 quantisation, and its turn time includes generation, verification and the prover, not only the root search.',
  );
  lines.push('');
  return lines.join('\n');
}

interface Cli { source: string; out: string; works: number[]; includeLargest: boolean; mode: SweepMode; warmWork: number; engine: string | null }

export function parseArgs(argv: readonly string[]): Cli {
  let source: string | null = null;
  let out: string | null = null;
  let works = [...SWEEP_WORKS];
  let includeLargest = false;
  let mode: SweepMode = 'fresh';
  let warmWork = DEFAULT_WARM_WORK;
  let engine: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];
    const need = (): string => {
      if (value === undefined) throw new Error(`work-sweep: ${flag} needs a value`);
      i++;
      return value;
    };
    switch (flag) {
      case '--out': out = need(); break;
      case '--works': works = need().split(',').map(Number); break;
      case '--include-largest': includeLargest = true; break;
      case '--mode': {
        const value2 = need();
        if (value2 !== 'fresh' && value2 !== 'game-warm') throw new Error('work-sweep: --mode must be fresh or game-warm');
        mode = value2;
        break;
      }
      case '--warm-work': warmWork = Number(need()); break;
      case '--engine': engine = need(); break;
      default:
        if (flag.startsWith('--')) throw new Error(`work-sweep: unknown flag ${flag}`);
        if (source !== null) throw new Error('work-sweep: pass one analysis directory');
        source = flag;
    }
  }
  if (source === null) throw new Error('work-sweep: pass the analysis directory holding the artifacts to sweep');
  if (out === null) throw new Error('work-sweep: --out <dir> is required');
  if (works.some(w => !Number.isFinite(w) || w <= 0)) throw new Error('work-sweep: --works must be positive numbers');
  if (!Number.isFinite(warmWork) || warmWork <= 0) throw new Error('work-sweep: --warm-work must be a positive number');
  return { source, out, works, includeLargest, mode, warmWork, engine };
}

async function main(argv: readonly string[]): Promise<void> {
  const cli = parseArgs(argv);
  const report = await sweepDirectory(cli.source, {
    out: cli.out,
    works: cli.works,
    includeLargest: cli.includeLargest,
    mode: cli.mode,
    warmWork: cli.warmWork,
    engine: cli.engine,
    onTurn: (fileId, turnNumber, flipWork) => console.error(`  ${fileId} turn ${turnNumber}: flip ${flipWork === null ? 'never' : `${flipWork}`}`),
  });
  console.log(`swept ${report.turns.length} turn(s); flip histogram ${JSON.stringify(report.flipHistogram)}`);
  console.log(`wrote ${path.join(cli.out, 'sweep.json')}`);
}

const invokedDirectly = process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) void main(process.argv.slice(2));
