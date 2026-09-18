/**
 * `--reclassify`: re-decide an existing analysis under the current rules
 * WITHOUT re-running a single search.
 *
 * The adviser is the expensive part of an analysis — three whole-turn searches
 * per turn at 1,600,000 work units, about 50 s of one core — and all of it is
 * already in the saved per-game JSON: the adviser's plan and end key, its
 * assessment of the played turn and of its own best turn, the refutation's end
 * key, the production engine's root score, and the recorded timings. What a
 * rule change needs on top of that is GENERATION, which costs milliseconds.
 *
 * So this mode reads a saved artifact, rebuilds the game from its replay
 * (canonical reconstruction, no search), regenerates the candidate lists at
 * each reply node with the matched configuration, and re-runs the
 * classification. The saved search numbers are copied through untouched.
 *
 * WHAT THE v1 ARTIFACTS LACK. `reply.inCheapReplyList` / `reply.cheapReplyCount`
 * were built from `cfg.genInterior` (K=16) while the refutation they were tested
 * against came from a ROOT search (`cfg.gen`, K=24) — so ranks 17-24 were
 * "absent" by construction and the field cannot be repaired by arithmetic. The
 * v2 record adds `reply.inRootGenList` / `rootGenCount` (the matched test, the
 * only one the classification uses) and keeps `inInteriorGenList` /
 * `interiorGenCount` as evidence. Both are regenerated here from the replay, so
 * a v1 artifact reclassifies completely; nothing else was missing.
 *
 * WHAT IT CANNOT REPAIR. A game that failed RECONSTRUCTION has no artifact at
 * all — there is nothing to reclassify. Those need a real re-analysis with
 * adviser searches, and this mode lists them rather than pretending otherwise.
 *
 * Output goes to a directory of its own and never overwrites its input.
 */
import fs from 'node:fs';
import path from 'node:path';
import { CandidateLister, defaultEngineFactory, resolveHardConfig, type EngineFactory } from './engine';
import {
  buildExposure,
  classifyFirst,
  classifyLargest,
  CLASS_RULES,
  DEFAULT_SWING_CC,
  type AnalysisResult,
  type LossClass,
  type TurnExposure,
  type TurnRow,
} from './analyze';
import { hardProfileOf, loadReplay, reconstruct, withMatchRules, ReplayMismatch } from './replay';
import { histogram, renderMarkdown } from './report';

/** A saved artifact of either schema; the v1 reply fields are optional. */
type SavedTurn = TurnRow & {
  reply: TurnRow['reply'] & { inCheapReplyList?: boolean; cheapReplyCount?: number };
};
type SavedAnalysis = Omit<AnalysisResult, 'schema' | 'turns'> & { schema: string; turns: SavedTurn[] };

export const RECLASSIFIABLE_SCHEMAS = ['muju-hard-analyze-v1', 'muju-hard-analyze-v2'];

export interface ReclassifiedGame {
  fileId: string;
  side: string;
  result: string;
  before: { first: LossClass; largest: LossClass; firstTurn: number | null; largestTurn: number | null };
  after: { first: LossClass; largest: LossClass; firstTurn: number | null; largestTurn: number | null };
  /** Turns whose class-relevant reply fields changed under the matched test. */
  replyFieldsChanged: number;
}

export interface ReclassifySummary {
  schema: 'muju-hard-reclassify-v1';
  source: string;
  out: string;
  swingCc: number;
  reclassified: number;
  failed: Array<{ file: string; error: string }>;
  beforeFirstHistogram: Record<string, number>;
  afterFirstHistogram: Record<string, number>;
  beforeLargestHistogram: Record<string, number>;
  afterLargestHistogram: Record<string, number>;
  games: ReclassifiedGame[];
  /** Present when the run's `replays/` directory is found next to the analysis. */
  reconstruction: ReconstructionCheck | null;
  /** Production searches run with the root instrument on (`--rerun-root`); 0 otherwise. */
  rootSearches: number;
  classRules: Record<LossClass, string>;
  wallMs: number;
  at: string;
}

export interface ReconstructionCheck {
  replaysDir: string;
  total: number;
  reconstructs: number;
  fails: Array<{ file: string; error: string }>;
  /** Replays with no artifact in the source analysis directory. */
  missingArtifact: string[];
}

function readAnalysis(file: string): SavedAnalysis {
  const saved = JSON.parse(fs.readFileSync(file, 'utf8')) as SavedAnalysis;
  if (!RECLASSIFIABLE_SCHEMAS.includes(saved.schema)) {
    throw new Error(`${path.basename(file)}: schema ${String(saved.schema)} is not one of ${RECLASSIFIABLE_SCHEMAS.join(', ')}`);
  }
  if (!Array.isArray(saved.turns)) throw new Error(`${path.basename(file)}: no turns array`);
  return saved;
}

/**
 * Recomputes one saved analysis. Every search-derived number is carried over
 * verbatim; only the reply-node membership fields and the classification are
 * recomputed.
 */
export function reclassifyOne(
  saved: SavedAnalysis,
  swingCc: number,
  /** `--rerun-root` output: exposure by turn number, from `rerunRootExposure`. */
  exposures: ReadonlyMap<number, TurnExposure> = new Map(),
): { result: AnalysisResult; replyFieldsChanged: number } {
  const profile = hardProfileOf(saved.config.engineLabel);
  if (profile === null) throw new Error(`cannot resolve a hard profile from ${saved.config.engineLabel}`);
  const config = resolveHardConfig(profile);

  const replay = loadReplay(saved.replay);
  const recon = reconstruct(replay);
  const seatTurns = recon.bySide[saved.side];
  if (seatTurns.length < saved.turns.length) {
    throw new Error(
      `reconstruction yields ${seatTurns.length} turns for ${saved.side} but the artifact has ${saved.turns.length}; the replay and the artifact do not match`,
    );
  }

  let replyFieldsChanged = 0;
  const turns: TurnRow[] = withMatchRules(replay.options, () => {
    const rootGen = new CandidateLister(config.gen, config.weights);
    const interiorGen = new CandidateLister(config.genInterior, config.weights);
    return saved.turns.map((row, i) => {
      const turn = seatTurns[i];
      if (turn.turnNumber !== row.turnNumber) {
        throw new Error(`turn ${i}: the artifact records turn ${row.turnNumber}, the reconstruction turn ${turn.turnNumber}`);
      }
      const key = row.reply.refutationKey;
      const terminal = turn.endState.phase === 'victory';
      const rootList = terminal ? null : rootGen.list(turn.endState, 0);
      const interiorList = terminal ? null : interiorGen.list(turn.endState, 1);
      const inRootGenList = key === null || rootList === null ? null : rootList.set.has(key);
      const inInteriorGenList = key === null || interiorList === null ? null : interiorList.set.has(key);
      const before = row.reply.inRootGenList ?? null;
      if (before !== inRootGenList) replyFieldsChanged++;
      return {
        ...row,
        reply: {
          refutationKey: key,
          inRootGenList,
          rootGenCount: rootList?.keys.length ?? 0,
          inInteriorGenList,
          interiorGenCount: interiorList?.keys.length ?? 0,
        },
        // A row the caller re-ran the root for gets the fresh exposure; every
        // other row keeps whatever it had (null on a pre-E2 artifact).
        exposure: exposures.get(row.turnNumber) ?? row.exposure ?? null,
      };
    });
  });

  const result: AnalysisResult = {
    ...saved,
    schema: 'muju-hard-analyze-v2',
    config: { ...saved.config, swingCc },
    reconstruction: { plies: recon.plies, winner: recon.winner, turnsAnalysed: turns.length, notes: recon.notes },
    turns,
    firstConsequential: classifyFirst(turns, swingCc),
    largestSwing: classifyLargest(turns, swingCc),
    classRules: CLASS_RULES,
    at: new Date().toISOString(),
  };
  return { result, replyFieldsChanged };
}

/**
 * `--rerun-root`: the ONLY search this module ever runs.
 *
 * The adviser numbers — three whole-turn searches per turn at 1,600,000 units —
 * are already in the artifact and are read, never redone. What a pre-E2
 * artifact lacks is the root's candidate list, which cannot be derived from
 * anything saved: it needs the production engine to run again with
 * `expose: true`. So this re-runs the production engine at the artifact's own
 * `config.productionWork` (400,000 units, the same search that produced
 * `engine.scoreCc`) at the FLAGGED turns only — the first-consequential turn
 * and the largest-swing turn, the two whose class can move — and nothing else.
 *
 * Cost: two searches per game at most, at the ladder rung.
 *
 * The seat played under a wall clock; this is fixed work. `searched` is what
 * THIS re-run searched.
 */
export async function rerunRootExposure(
  saved: SavedAnalysis,
  turnNumbers: ReadonlySet<number>,
  opts: { engineFactory?: EngineFactory } = {},
): Promise<{ exposures: Map<number, TurnExposure>; searches: number }> {
  const exposures = new Map<number, TurnExposure>();
  if (turnNumbers.size === 0) return { exposures, searches: 0 };
  const profile = hardProfileOf(saved.config.engineLabel);
  if (profile === null) throw new Error(`cannot resolve a hard profile from ${saved.config.engineLabel}`);
  const config = resolveHardConfig(profile);
  const work = saved.config.productionWork;
  const factory = opts.engineFactory ?? defaultEngineFactory;

  const replay = loadReplay(saved.replay);
  const recon = reconstruct(replay);
  const seatTurns = recon.bySide[saved.side];
  let searches = 0;
  await withMatchRules(replay.options, async () => {
    const production = factory({ ...config }, 'production');
    for (const row of saved.turns) {
      if (!turnNumbers.has(row.turnNumber)) continue;
      const turn = seatTurns.find(t => t.turnNumber === row.turnNumber);
      if (turn === undefined) continue;
      const result = await production.searchTurn(turn.startState, { work, expose: true });
      searches++;
      const exposure = buildExposure(result, row.adviser.endKey, row.played.endKey);
      if (exposure !== null) exposures.set(row.turnNumber, exposure);
    }
  });
  return { exposures, searches };
}

/** The turns `--rerun-root` re-runs: the two the classification can turn on. */
export function flaggedTurns(saved: SavedAnalysis): Set<number> {
  const out = new Set<number>();
  if (saved.firstConsequential.turn !== null) out.add(saved.firstConsequential.turn);
  if (saved.largestSwing.turn !== null) out.add(saved.largestSwing.turn);
  return out;
}

/** Rebuilds every replay in `replaysDir` (no searches) and reports which ones
 * the current reconstruction accepts. This is how "failed before vs after" is
 * answered without re-running a single adviser search. */
export function checkReconstruction(replaysDir: string, artifactIds: ReadonlySet<string>): ReconstructionCheck {
  const files = fs.readdirSync(replaysDir).filter(f => f.endsWith('.json')).sort();
  const fails: ReconstructionCheck['fails'] = [];
  const missingArtifact: string[] = [];
  let reconstructs = 0;
  for (const file of files) {
    const id = file.replace(/\.json$/i, '');
    try {
      reconstruct(loadReplay(path.join(replaysDir, file)));
      reconstructs++;
      if (!artifactIds.has(id)) missingArtifact.push(file);
    } catch (err) {
      fails.push({ file, error: err instanceof ReplayMismatch || err instanceof Error ? err.message : String(err) });
    }
  }
  return { replaysDir, total: files.length, reconstructs, fails, missingArtifact };
}

export interface ReclassifyOptions {
  out: string;
  swingCc?: number;
  /** Re-run the production engine with `expose: true` at the flagged turns. */
  rerunRoot?: boolean;
  engineFactory?: EngineFactory;
  /** Called after each game, for progress on a run that takes minutes. */
  onGame?: (fileId: string, searches: number) => void;
}

interface Buckets {
  games: ReclassifiedGame[];
  beforeFirst: LossClass[];
  afterFirst: LossClass[];
  beforeLargest: LossClass[];
  afterLargest: LossClass[];
  artifactIds: Set<string>;
  failed: ReclassifySummary['failed'];
}

/** Reclassifies one saved artifact, writes its two output files and records the before/after. */
function emitOne(
  dir: string,
  file: string,
  swingCc: number,
  exposures: ReadonlyMap<number, TurnExposure>,
  out: string,
  b: Buckets,
): void {
  try {
    const saved = readAnalysis(path.join(dir, file));
    b.artifactIds.add(saved.fileId);
    const { result, replyFieldsChanged } = reclassifyOne(saved, swingCc, exposures);
    fs.writeFileSync(path.join(out, `${result.fileId}.json`), `${JSON.stringify(result, null, 2)}\n`);
    fs.writeFileSync(path.join(out, `${result.fileId}.md`), renderMarkdown(result));
    b.beforeFirst.push(saved.firstConsequential.klass);
    b.afterFirst.push(result.firstConsequential.klass);
    b.beforeLargest.push(saved.largestSwing.klass);
    b.afterLargest.push(result.largestSwing.klass);
    b.games.push({
      fileId: result.fileId,
      side: result.side,
      result: result.outcome.sideResult,
      before: {
        first: saved.firstConsequential.klass,
        largest: saved.largestSwing.klass,
        firstTurn: saved.firstConsequential.turn,
        largestTurn: saved.largestSwing.turn,
      },
      after: {
        first: result.firstConsequential.klass,
        largest: result.largestSwing.klass,
        firstTurn: result.firstConsequential.turn,
        largestTurn: result.largestSwing.turn,
      },
      replyFieldsChanged,
    });
  } catch (err) {
    b.failed.push({ file, error: err instanceof Error ? err.message : String(err) });
  }
}

/**
 * `--reclassify --rerun-root`. Identical to `reclassifyDirectory` except that
 * each game's flagged turns get a fresh production search with the root
 * instrument on before the classification runs, which is what makes the
 * discarded/misjudged split available on an artifact written before E2.
 */
export async function reclassifyDirectoryWithRoot(source: string, opts: ReclassifyOptions): Promise<ReclassifySummary> {
  const prepared = prepare(source, opts);
  let searches = 0;
  for (const file of prepared.files) {
    let exposures: Map<number, TurnExposure> = new Map();
    try {
      const saved = readAnalysis(path.join(prepared.dir, file));
      const run = await rerunRootExposure(saved, flaggedTurns(saved), { engineFactory: opts.engineFactory });
      exposures = run.exposures;
      searches += run.searches;
      opts.onGame?.(saved.fileId, run.searches);
    } catch (err) {
      prepared.buckets.failed.push({ file, error: err instanceof Error ? err.message : String(err) });
      continue;
    }
    emitOne(prepared.dir, file, prepared.swingCc, exposures, opts.out, prepared.buckets);
  }
  return finish(source, opts, prepared, searches);
}

interface Prepared {
  startedAt: number;
  swingCc: number;
  dir: string;
  files: string[];
  buckets: Buckets;
}

/** Shared set-up: resolve the input files, refuse to overwrite the input, make the output directory. */
function prepare(source: string, opts: ReclassifyOptions): Prepared {
  const startedAt = Date.now();
  const swingCc = opts.swingCc ?? DEFAULT_SWING_CC;
  const stat = fs.statSync(source);
  const dir = stat.isDirectory() ? source : path.dirname(source);
  const files = stat.isDirectory()
    ? fs.readdirSync(source).filter(f => f.endsWith('.json') && f !== 'summary.json').sort()
    : [path.basename(source)];

  if (path.resolve(opts.out) === path.resolve(dir)) {
    throw new Error(`--reclassify refuses to write into its own input directory (${dir}); pass a different --out`);
  }
  fs.mkdirSync(opts.out, { recursive: true });

  return {
    startedAt,
    swingCc,
    dir,
    files,
    buckets: { games: [], beforeFirst: [], afterFirst: [], beforeLargest: [], afterLargest: [], artifactIds: new Set(), failed: [] },
  };
}

/** Shared tail: the reconstruction check, the summary and its two files. */
function finish(source: string, opts: ReclassifyOptions, p: Prepared, rootSearches: number): ReclassifySummary {
  // `<runDir>/replays` sits one level above an `analysis/` directory.
  const replaysDir = path.join(path.dirname(p.dir), 'replays');
  const reconstruction = fs.existsSync(replaysDir) ? checkReconstruction(replaysDir, p.buckets.artifactIds) : null;

  const summary: ReclassifySummary = {
    schema: 'muju-hard-reclassify-v1',
    source: path.resolve(source),
    out: path.resolve(opts.out),
    swingCc: p.swingCc,
    reclassified: p.buckets.games.length,
    failed: p.buckets.failed,
    beforeFirstHistogram: histogram(p.buckets.beforeFirst),
    afterFirstHistogram: histogram(p.buckets.afterFirst),
    beforeLargestHistogram: histogram(p.buckets.beforeLargest),
    afterLargestHistogram: histogram(p.buckets.afterLargest),
    games: p.buckets.games,
    reconstruction,
    rootSearches,
    classRules: CLASS_RULES,
    wallMs: Date.now() - p.startedAt,
    at: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(opts.out, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  fs.writeFileSync(path.join(opts.out, 'summary.md'), renderReclassifyMarkdown(summary));
  return summary;
}

export function reclassifyDirectory(source: string, opts: ReclassifyOptions): ReclassifySummary {
  const prepared = prepare(source, opts);
  for (const file of prepared.files) emitOne(prepared.dir, file, prepared.swingCc, new Map(), opts.out, prepared.buckets);
  return finish(source, opts, prepared, 0);
}

function histoTable(before: Record<string, number>, after: Record<string, number>): string[] {
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  const lines = ['| class | before | after |', '| --- | ---: | ---: |'];
  for (const k of keys) lines.push(`| ${k} | ${before[k] ?? 0} | ${after[k] ?? 0} |`);
  return lines;
}

export function renderReclassifyMarkdown(s: ReclassifySummary): string {
  const lines: string[] = [];
  lines.push(`# Reclassification — ${s.source}`);
  lines.push('');
  lines.push(
    `${s.reclassified} saved analysis/analyses re-decided under the current rules at a ${s.swingCc.toLocaleString('en-US')} cc threshold. ` +
      '**No search was re-run**: every adviser number is carried over from the saved artifact and only the reply-node candidate lists were regenerated.',
  );
  lines.push('');
  lines.push('## First consequential decision');
  lines.push('');
  lines.push(...histoTable(s.beforeFirstHistogram, s.afterFirstHistogram));
  lines.push('');
  lines.push('## Largest-swing turn');
  lines.push('');
  lines.push(...histoTable(s.beforeLargestHistogram, s.afterLargestHistogram));
  lines.push('');
  lines.push('## Games');
  lines.push('');
  lines.push('| game | seat | result | first before | first after | largest before | largest after | reply fields changed |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | ---: |');
  for (const g of s.games) {
    lines.push(
      `| ${g.fileId} | ${g.side} | ${g.result} | ${g.before.first} (t${g.before.firstTurn ?? '—'}) | ${g.after.first} (t${g.after.firstTurn ?? '—'}) | ${g.before.largest} | ${g.after.largest} | ${g.replyFieldsChanged} |`,
    );
  }
  if (s.reconstruction !== null) {
    const r = s.reconstruction;
    lines.push('');
    lines.push('## Reconstruction check');
    lines.push('');
    lines.push(`${r.reconstructs} of ${r.total} replays in \`${r.replaysDir}\` reconstruct under the current code.`);
    if (r.missingArtifact.length > 0) {
      lines.push('');
      lines.push(
        'These reconstruct but have no saved analysis, so they cannot be reclassified — they need a real re-analysis with adviser searches:',
      );
      lines.push('');
      for (const f of r.missingArtifact) lines.push(`- ${f}`);
    }
    if (r.fails.length > 0) {
      lines.push('');
      lines.push('These still fail reconstruction:');
      lines.push('');
      for (const f of r.fails) lines.push(`- ${f.file}: ${f.error}`);
    }
  }
  if (s.failed.length > 0) {
    lines.push('');
    lines.push('## Failed to reclassify');
    lines.push('');
    for (const f of s.failed) lines.push(`- ${f.file}: ${f.error}`);
  }
  lines.push('');
  lines.push(`_${s.wallMs} ms; written to \`${s.out}\`, which is never the input directory._`);
  lines.push('');
  return lines.join('\n');
}
