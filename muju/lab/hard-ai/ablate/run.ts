/**
 * `npm run hard:ablate` — the E1.3 controlled-ablation diagnostic runner
 * (EPIC-PLAN §4 E1.3, §5 campaign 3).
 *
 * Campaign 3 is two halves. This file is the FIRST: "use tractable positions at
 * generous diagnostic budgets to locate quality loss". It runs the recall
 * instrument (`lab/hard-ai/recall/run.ts`) once per arm of
 * `lab/hard-ai/ablate/arms.ts`, writes one artifact per arm, and prints one
 * comparison table. The second half — "then equal-time matches to price the
 * improvement" — is `--print-ladder`, which emits the exact `hard:ladder`
 * commands and runs nothing.
 *
 * THE REFERENCE IS SELECTIVE. Every artifact and the table itself carry the
 * label. `generateReference` is K=2000 under a 120,000-node cap with widths
 * `[40,16,8,4]` and 200 place plans — wide, but neither exhaustive nor a
 * K=96 enumeration (EPIC-PLAN §2's finding, first owned here). So a `top1` of
 * 1.0 means "the cheap list held what THIS reference's depth-2 pass preferred",
 * not "the generator missed nothing": a family neither generator can express
 * (E2.1's multi-promotion case) is invisible to every number below. Read the
 * arms against each other, never a single arm against an absolute target.
 *
 * THE CORPUS. `--corpus derived` (the default) concatenates, in this order:
 *
 *   1. `positions/authored.jsonl`  — the hand-made cases, home race included
 *   2. `positions/tactics.jsonl`   — the kill/threat puzzles
 *   3. `positions/economy.jsonl`   — the purchase/promotion puzzles
 *   4. the first-consequential position of every `*.json` under
 *      `lab/results/hard-ai-e1/e1.1-diag/analysis/` (`--diag-dir`), when that
 *      directory exists: the exact state the hard seat searched from on the
 *      turn `hard:analyze` classified, reconstructed from the replay the
 *      analysis names
 *   5. a deterministic head slice of `positions/fuzz-1000.jsonl` (`--reply-tail`)
 *
 * 1-4 are the ROOT items and 5 is the REPLY tail, because the recall
 * instrument takes root items from the head of a corpus and reply items from
 * its tail (`recall/run.ts buildWorkList`). The split is not cosmetic: a reply
 * item is measured at the node the generator's own best turn LEAVES, and the
 * authored/tactics/economy positions are puzzles whose best turn ends the game
 * or the phase, so they produce no reply node at all (measured: 0 of 4 on
 * `tactics.jsonl` and `economy.jsonl`, every one noted "no playable cheap turn
 * to reach a reply node"). `fuzz-1000.jsonl` holds reachable mid-game states
 * and produces them reliably. `--positions` therefore defaults to exactly the
 * number of head positions, so the two strata never overlap.
 *
 * HEAVY QUEUE. Each arm is one child process and each child holds one of
 * `ladder/heavy.ts`'s two global slots for its whole run, re-stamped with the
 * child's pid (`reassignSlot`) exactly as `ladder/shard.ts` does. Arms run one
 * at a time: the comparison is between arms, so a wall time measured while a
 * sibling arm saturates the box would be worthless. `--no-heavy` skips the
 * queue and is for tests and for the small plumbing smoke only.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { acquireHeavySlot, reassignSlot, type ReleaseSlot } from '../ladder/heavy';
import { loadReplay, reconstruct } from '../analyze/replay';
import { readPositions, writePositions, type RulesBlock, type StoredPosition } from '../positions/corpus';
import { ARMS, armEngineName, armLadderSeed, armNames, findArm, requireArm, type AblationArm } from './arms';
import type { MatchOptions } from '../../harness/types';
import type { GameState, PlayerId } from '../../../src/game/types';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');
const POSITIONS_DIR = path.resolve(import.meta.dirname, '../positions');
const RECALL = path.resolve(import.meta.dirname, '../recall/run.ts');

/** Where `hard:analyze` writes the E1.1 diagnostic analyses (EPIC-PLAN E1.1). */
export const DEFAULT_DIAG_DIR = 'lab/results/hard-ai-e1/e1.1-diag/analysis';
export const DEFAULT_OUT_DIR = 'lab/results/hard-ai-e1/ablate';
/** Validation stratum (`ladder/openings/ALLOCATION.md`): equal-time contests only. */
export const LADDER_OPENINGS = 'lab/hard-ai/ladder/openings/e1-val.jsonl';
export const LADDER_WORK = 'wall:3000';
export const LADDER_HANDICAPS = '0,3';
/** 16 pairs per handicap over two handicaps; `pairing.ts` consumes 16 of `e1-val`'s 32 openings. */
export const LADDER_PAIRS_PER_HANDICAP = 16;

const HEAD_CORPORA = ['authored.jsonl', 'tactics.jsonl', 'economy.jsonl'] as const;

export interface AblateArgs {
  arms: string[];
  corpus: string;
  positions: number | null;
  replyPositions: number;
  replyTail: number;
  deep: number;
  shards: number;
  diagDir: string;
  outDir: string;
  heavy: boolean;
  heavyTimeoutMin: number;
  printLadder: boolean;
}

export function parseArgs(argv: string[]): AblateArgs {
  const args: AblateArgs = {
    arms: armNames(),
    corpus: 'derived',
    positions: null,
    replyPositions: 40,
    replyTail: 60,
    deep: 2000,
    shards: 1,
    diagDir: DEFAULT_DIAG_DIR,
    outDir: DEFAULT_OUT_DIR,
    heavy: true,
    heavyTimeoutMin: 60,
    printLadder: false,
  };
  const next = (v: string | undefined, flag: string): string => {
    if (v === undefined) throw new Error(`hard:ablate: ${flag} needs a value`);
    return v;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--arms') args.arms = next(argv[++i], a).split(',').map(s => s.trim()).filter(s => s !== '');
    else if (a === '--corpus') args.corpus = next(argv[++i], a);
    else if (a === '--positions') args.positions = Number(next(argv[++i], a));
    else if (a === '--reply-positions') args.replyPositions = Number(next(argv[++i], a));
    else if (a === '--reply-tail') args.replyTail = Number(next(argv[++i], a));
    else if (a === '--deep') args.deep = Number(next(argv[++i], a));
    else if (a === '--shards') args.shards = Number(next(argv[++i], a));
    else if (a === '--diag-dir') args.diagDir = next(argv[++i], a);
    else if (a === '--out-dir') args.outDir = next(argv[++i], a);
    else if (a === '--no-heavy') args.heavy = false;
    else if (a === '--heavy-timeout-min') args.heavyTimeoutMin = Number(next(argv[++i], a));
    else if (a === '--print-ladder') args.printLadder = true;
    else throw new Error(`hard:ablate: unrecognised argument "${a}"`);
  }
  for (const name of args.arms) requireArm(name); // fail before any work
  if (args.heavy && args.shards > 1) {
    // One arm holds ONE of `heavy.ts`'s two slots. `recall/run.ts --shards n`
    // spawns n CPU-burning children under that single slot, which is exactly
    // the over-subscription the queue exists to prevent
    // (POSTMORTEM-2026-09-15 §6). Sharding is allowed only with the queue off,
    // i.e. when the operator is accounting for the load themselves.
    throw new Error('hard:ablate: --shards > 1 needs --no-heavy; one arm holds one heavy slot and would run --shards children under it');
  }
  return args;
}

// --- the derived corpus -------------------------------------------------------

export interface CorpusSource {
  source: string;
  positions: number;
  stratum: 'root' | 'reply-tail';
  note?: string;
}

export interface DerivedCorpus {
  path: string;
  sources: CorpusSource[];
  /** Head positions — the root stratum; `--positions` defaults to this. */
  headCount: number;
  tailCount: number;
  sha256: string;
  notes: string[];
}

/** `MatchOptions` -> the `rules` block a stored position carries. */
export function rulesFromOptions(options: MatchOptions, state: GameState): RulesBlock {
  return {
    elementGraph: options.elementGraph,
    upkeep: options.upkeep ?? 'shipped',
    inactivityRule: options.inactivityRule ?? 'on',
    victoryRule: options.victoryRule ?? state.victoryRule ?? 'home-or-elimination',
    handicap: options.blackCrystalHandicap ?? 0,
    combatHandicap: { white: options.handicap.white, black: options.handicap.black },
  };
}

interface AnalysisFile {
  schema?: string;
  fileId?: string;
  side?: PlayerId;
  replay?: string;
  firstConsequential?: { turn?: number; seatTurnIndex?: number; klass?: string } | null;
}

/**
 * The first-consequential position of every analysis under `dir`.
 *
 * `muju-hard-analyze-v1` records the CLASSIFICATION, not the state — so the
 * position is recovered the only honest way: load the replay the analysis
 * names, reconstruct it through the canonical engine (`analyze/replay.ts`,
 * which refuses a replay that no longer reproduces itself), and take the
 * `startState` of the seat turn the classification points at. A file that
 * cannot be read, has no `firstConsequential`, or whose replay has moved is
 * SKIPPED with a note: a missing diagnostic must not take the ablation run
 * down with it.
 */
export function firstConsequentialPositions(dir: string, notes: string[]): StoredPosition[] {
  const abs = path.isAbsolute(dir) ? dir : path.resolve(REPO_ROOT, dir);
  if (!fs.existsSync(abs)) {
    notes.push(`no E1.1 diagnostic analyses at ${dir} (first-consequential stratum empty)`);
    return [];
  }
  const out: StoredPosition[] = [];
  for (const file of fs.readdirSync(abs).filter(f => f.endsWith('.json')).sort()) {
    const full = path.join(abs, file);
    try {
      const parsed = JSON.parse(fs.readFileSync(full, 'utf8')) as AnalysisFile;
      if (parsed.schema !== 'muju-hard-analyze-v1') {
        notes.push(`${file}: schema ${String(parsed.schema)}, not muju-hard-analyze-v1`);
        continue;
      }
      const first = parsed.firstConsequential;
      if (first === null || first === undefined || first.seatTurnIndex === undefined) {
        notes.push(`${file}: no firstConsequential turn`);
        continue;
      }
      const side = parsed.side;
      if (side !== 'white' && side !== 'black') {
        notes.push(`${file}: no analysed side`);
        continue;
      }
      if (parsed.replay === undefined) {
        notes.push(`${file}: no replay path`);
        continue;
      }
      const replayPath = path.isAbsolute(parsed.replay) ? parsed.replay : path.resolve(REPO_ROOT, parsed.replay);
      if (!fs.existsSync(replayPath)) {
        notes.push(`${file}: replay ${parsed.replay} is gone`);
        continue;
      }
      const replay = loadReplay(replayPath);
      const turn = reconstruct(replay).bySide[side].find(t => t.seatTurnIndex === first.seatTurnIndex);
      if (turn === undefined) {
        notes.push(`${file}: seat turn ${String(first.seatTurnIndex)} not in the reconstruction`);
        continue;
      }
      out.push({
        schema: 'muju-position-v1',
        id: `diag-${parsed.fileId ?? path.basename(file, '.json')}-t${String(first.turn ?? turn.turnNumber)}`,
        tags: ['e1.1-diag', 'first-consequential', first.klass ?? 'unclassified'],
        rationale: `first consequential decision (${first.klass ?? 'unclassified'}) of ${parsed.fileId ?? file}, ${side} seat turn ${String(first.seatTurnIndex)}`,
        rules: rulesFromOptions(replay.options, turn.startState),
        state: turn.startState,
      });
    } catch (err) {
      notes.push(`${file}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return out;
}

export function buildDerivedCorpus(args: AblateArgs, outFile: string): DerivedCorpus {
  const notes: string[] = [];
  const sources: CorpusSource[] = [];
  const head: StoredPosition[] = [];
  for (const name of HEAD_CORPORA) {
    const rows = readPositions(path.join(POSITIONS_DIR, name)).filter(p => p.state.phase === 'playing');
    head.push(...rows);
    sources.push({ source: `positions/${name}`, positions: rows.length, stratum: 'root' });
  }
  const diag = firstConsequentialPositions(args.diagDir, notes);
  head.push(...diag);
  sources.push({
    source: args.diagDir,
    positions: diag.length,
    stratum: 'root',
    note: 'first consequential decision of each E1.1 analysis, reconstructed from its replay',
  });

  const fuzz = readPositions(path.join(POSITIONS_DIR, 'fuzz-1000.jsonl'))
    .filter(p => p.state.phase === 'playing')
    .slice(0, Math.max(0, args.replyTail));
  sources.push({
    source: 'positions/fuzz-1000.jsonl',
    positions: fuzz.length,
    stratum: 'reply-tail',
    note: 'reachable mid-game states; the authored/tactics/economy puzzles leave no playable reply node',
  });

  // Ids must be unique inside one corpus file; the four sources are independent.
  const seen = new Set<string>();
  const all = [...head, ...fuzz].map(p => {
    let id = p.id;
    for (let n = 2; seen.has(id); n++) id = `${p.id}#${n}`;
    seen.add(id);
    return id === p.id ? p : { ...p, id };
  });
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  writePositions(outFile, all);
  return {
    path: outFile,
    sources,
    headCount: head.length,
    tailCount: fuzz.length,
    sha256: createHash('sha256').update(fs.readFileSync(outFile)).digest('hex'),
    notes,
  };
}

// --- one arm ------------------------------------------------------------------

export interface ArmRun {
  arm: string;
  factor: string;
  change: string;
  engine: string;
  configHash: string;
  wallMs: number;
  artifact: string;
  /** The recall artifact, verbatim. */
  metrics: Record<string, unknown>;
}

function recallArgs(args: AblateArgs, arm: string, corpusPath: string, positions: number, out: string): string[] {
  return [
    '--import', 'tsx', RECALL,
    '--corpus', corpusPath,
    '--positions', String(positions),
    '--reply-positions', String(args.replyPositions),
    '--deep', String(args.deep),
    '--shards', String(args.shards),
    '--arm', arm,
    '--reply-node-gen', 'interior',
    '--out', path.relative(REPO_ROOT, out),
  ];
}

function spawnRecall(argv: string[], onSpawn?: (pid: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, argv, { cwd: REPO_ROOT, stdio: ['ignore', 'ignore', 'pipe'] });
    if (child.pid !== undefined && onSpawn) onSpawn(child.pid);
    let stderr = '';
    child.stderr.on('data', d => {
      stderr += String(d);
    });
    child.on('error', reject);
    child.on('exit', code => {
      if (code === 0) resolve();
      else reject(new Error(`hard:ablate: recall exited ${String(code)}:\n${stderr.slice(-4000)}`));
    });
  });
}

export async function runArm(
  args: AblateArgs,
  arm: AblationArm,
  corpusPath: string,
  positions: number,
  deps: {
    spawn?: (argv: string[], onSpawn?: (pid: number) => void) => Promise<void>;
    acquireSlot?: (label: string) => Promise<ReleaseSlot>;
    reassign?: (release: ReleaseSlot, pid: number) => boolean;
  } = {},
): Promise<ArmRun> {
  const out = path.resolve(REPO_ROOT, args.outDir, arm.name, 'recall.json');
  const argv = recallArgs(args, arm.name, corpusPath, positions, out);
  const run = deps.spawn ?? spawnRecall;
  const startedAt = Date.now();
  if (args.heavy) {
    const acquire = deps.acquireSlot ?? ((label: string) => acquireHeavySlot(label, { timeoutMs: args.heavyTimeoutMin * 60_000 }));
    const reassign = deps.reassign ?? reassignSlot;
    const release = await acquire(`hard:ablate ${arm.name}`);
    try {
      await run(argv, pid => {
        reassign(release, pid);
      });
    } finally {
      release();
    }
  } else {
    await run(argv);
  }
  const wallMs = Date.now() - startedAt;
  const metrics = JSON.parse(fs.readFileSync(out, 'utf8')) as Record<string, unknown>;
  return {
    arm: arm.name,
    factor: arm.factor,
    change: arm.change,
    engine: armEngineName(arm.name),
    configHash: arm.configHash,
    wallMs,
    artifact: path.relative(REPO_ROOT, out),
    metrics,
  };
}

// --- the comparison table -----------------------------------------------------

export const SELECTIVE_REFERENCE_LABEL =
  'reference: SELECTIVE (generateReference K=2000 under a 120,000-node cap, widths [40,16,8,4], 200 place plans) — not exhaustive; shared blind spots are invisible (EPIC-PLAN §2)';

export interface ComparisonRow {
  arm: string;
  factor: string;
  change: string;
  top1: number;
  top3: number;
  top1Share: number;
  regretP50: number;
  regretP90: number;
  ceilingTop1: number;
  replyTop1: number;
  illegalTurns: number;
  emptyLists: number;
  positions: number;
  replyPositions: number;
  wallMs: number;
  configHash: string;
}

function num(metrics: Record<string, unknown>, key: string): number {
  const v = metrics[key];
  return typeof v === 'number' ? v : 0;
}

export function comparisonRow(run: ArmRun): ComparisonRow {
  return {
    arm: run.arm,
    factor: run.factor,
    change: run.change,
    top1: num(run.metrics, 'top1'),
    top3: num(run.metrics, 'top3'),
    top1Share: num(run.metrics, 'top1Share'),
    regretP50: num(run.metrics, 'regret_p50'),
    regretP90: num(run.metrics, 'regret_p90'),
    ceilingTop1: num(run.metrics, 'ceilingTop1'),
    replyTop1: num(run.metrics, 'replyTop1'),
    illegalTurns: num(run.metrics, 'illegalTurns'),
    emptyLists: num(run.metrics, 'emptyLists'),
    positions: num(run.metrics, 'positions'),
    replyPositions: num(run.metrics, 'replyPositions'),
    wallMs: run.wallMs,
    configHash: run.configHash,
  };
}

const COLUMNS: { head: string; of: (r: ComparisonRow) => string }[] = [
  { head: 'arm', of: r => r.arm },
  { head: 'factor', of: r => r.factor },
  { head: 'top1', of: r => r.top1.toFixed(4) },
  { head: 'top3', of: r => r.top3.toFixed(4) },
  { head: 'top1Share', of: r => r.top1Share.toFixed(4) },
  { head: 'ceilTop1', of: r => r.ceilingTop1.toFixed(4) },
  { head: 'regretP50', of: r => String(r.regretP50) },
  { head: 'regretP90', of: r => String(r.regretP90) },
  { head: 'replyTop1', of: r => r.replyTop1.toFixed(4) },
  { head: 'illegal', of: r => String(r.illegalTurns) },
  { head: 'empty', of: r => String(r.emptyLists) },
  { head: 'pos', of: r => `${r.positions}+${r.replyPositions}` },
  { head: 'wall s', of: r => (r.wallMs / 1000).toFixed(1) },
  { head: 'configHash', of: r => r.configHash.slice(0, 12) },
];

/** A markdown table, with the reference's selectivity stated under it. */
export function formatComparison(rows: readonly ComparisonRow[]): string {
  const cells = [COLUMNS.map(c => c.head), ...rows.map(r => COLUMNS.map(c => c.of(r)))];
  const widths = COLUMNS.map((_, i) => Math.max(...cells.map(row => row[i].length)));
  const line = (row: string[]): string => `| ${row.map((v, i) => v.padEnd(widths[i])).join(' | ')} |`;
  const out = [line(cells[0]), `| ${widths.map(w => '-'.repeat(w)).join(' | ')} |`, ...cells.slice(1).map(line)];
  out.push('');
  out.push(SELECTIVE_REFERENCE_LABEL);
  // A13-2 (`docs/hard-ai/e3/amendments/lane13.md`). Since lane 13's A8 / L5-A1
  // fix a `weights` or `evalFix` arm moves every recall column, root and reply
  // — but it also moves the yardstick, because the depth-2 leaves the columns
  // are scored against are scored by the ARM's evaluator, not by `base`'s. Two
  // generator arms are ranked against one fixed truth; two of these are not.
  const armScored = rows.filter(r => {
    const factor = findArm(r.arm)?.factor;
    return factor === 'weights' || factor === 'evalFix';
  });
  if (armScored.length > 0) {
    out.push(
      `${armScored.map(r => r.arm).join(', ')}: every column moves (root and reply), but these arms also ` +
        'score the depth-2 leaves with their own evaluator, so two of them are not ranked against one fixed ' +
        'yardstick the way two generator arms are — read each against base, never against each other',
    );
  }
  const missing = rows.filter(r => r.replyPositions === 0);
  if (missing.length > 0) {
    out.push(`no reply node was reached for: ${missing.map(r => r.arm).join(', ')} — replyTop1 is 0 by absence, not by failure`);
  }
  // An arm the instrument cannot see cannot move a ROOT number. Two kinds
  // reach here: an INTERIOR-only arm (no root item is generated with
  // `genInterior`), whose column is `replyTop1`; and a non-generator arm such
  // as E1.5's `calib`, which moves time allocation and is invisible to a
  // fixed-work recall item everywhere, whose evidence is its equal-time ladder
  // row and not this table. Identical root columns are the expected result in
  // both cases, not a wiring bug. A `weights` or `evalFix` arm is NOT one of
  // these kinds any more (A13-1): it carries `rootDiagnostic: true` and gets
  // the sentence above instead.
  const interiorOnly = rows.filter(r => !(findArm(r.arm)?.rootDiagnostic ?? true));
  if (interiorOnly.length > 0) {
    out.push(
      `root columns are base's by construction for: ${interiorOnly.map(r => r.arm).join(', ')} ` +
        '— the arm moves no ROOT generator knob; read replyTop1 for an interior arm, ' +
        'and the equal-time ladder row for one that moves no generator at all',
    );
  }
  return out.join('\n');
}

// --- the equal-time pricing plan ----------------------------------------------

/** One arm's equal-time `hard:ladder` command, as a single shell line. */
export function ladderCommand(armName: string, outDir: string = DEFAULT_OUT_DIR): string {
  const pairs = LADDER_PAIRS_PER_HANDICAP * LADDER_HANDICAPS.split(',').length;
  return [
    'node --import tsx lab/hard-ai/ladder/run.ts',
    `  --a ${armEngineName(armName)} --b hard@desktop`,
    `  --work ${LADDER_WORK} --handicaps ${LADDER_HANDICAPS} --pairs ${pairs}`,
    `  --seed ${armLadderSeed(armName)} --shards 2 --legality strict`,
    `  --openings ${LADDER_OPENINGS}`,
    `  --out ${outDir}/${armName}/ladder`,
  ].join(' \\\n');
}

export function ladderPlan(armNamesToPrice: readonly string[], outDir: string = DEFAULT_OUT_DIR): string {
  const out: string[] = [
    '# E1.3 equal-time pricing plan (EPIC-PLAN §5 campaign 3, second half).',
    '#',
    `# ${LADDER_PAIRS_PER_HANDICAP} pairs per handicap at h0 and h3, ${LADDER_WORK} per turn, against hard@desktop,`,
    `# on the VALIDATION stratum (${LADDER_OPENINGS}; ladder/openings/ALLOCATION.md:`,
    '# "Drives champion/challenger equal-time contests in E2-E4. Never tuned against").',
    `# pairing.ts cycles handicaps fastest, so --pairs ${LADDER_PAIRS_PER_HANDICAP * 2} consumes`,
    `# ${LADDER_PAIRS_PER_HANDICAP} of e1-val.jsonl's 32 openings, each at both handicaps.`,
    '# Seeds are derived from the arm NAME (arms.ts#armLadderSeed), so re-ordering',
    '# or extending the registry never moves an existing arm\'s schedule.',
    '#',
    '# Each command holds two of the two global heavy slots (--shards 2): RUN THEM ONE AT A TIME.',
    '',
  ];
  for (const name of armNamesToPrice) {
    const arm = requireArm(name);
    out.push(`# ${name} — ${arm.change}`);
    if (arm.factor === 'none') out.push('# (A/A control against the identical engine; optional, and it costs a full row.)');
    out.push(ladderCommand(name, outDir));
    out.push('');
  }
  return out.join('\n');
}

// --- main ---------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.printLadder) {
    console.log(ladderPlan(args.arms));
    return;
  }
  const outDir = path.resolve(REPO_ROOT, args.outDir);
  fs.mkdirSync(outDir, { recursive: true });

  let corpusPath: string;
  let corpus: DerivedCorpus | null = null;
  if (args.corpus === 'derived') {
    corpus = buildDerivedCorpus(args, path.join(outDir, 'corpus', 'ablate-corpus.jsonl'));
    corpusPath = corpus.path;
    for (const note of corpus.notes) console.log(`corpus: ${note}`);
  } else {
    corpusPath = path.isAbsolute(args.corpus) ? args.corpus : path.join(POSITIONS_DIR, args.corpus);
  }
  const positions = args.positions ?? corpus?.headCount ?? 100;

  const runs: ArmRun[] = [];
  for (const name of args.arms) {
    const arm = requireArm(name);
    process.stdout.write(`ablate: ${name} (${arm.change}) ... `);
    const run = await runArm(args, arm, corpusPath, positions, {});
    runs.push(run);
    console.log(`${(run.wallMs / 1000).toFixed(1)} s`);
  }

  const rows = runs.map(comparisonRow);
  const table = formatComparison(rows);
  const summary = {
    schema: 'muju-hard-ablate-v1',
    at: new Date().toISOString(),
    reference: SELECTIVE_REFERENCE_LABEL,
    corpus: corpus ?? { path: corpusPath },
    budget: { positions, replyPositions: args.replyPositions, deep: args.deep, shards: args.shards, replyNodeGen: 'interior' },
    arms: runs.map(r => ({
      arm: r.arm,
      factor: r.factor,
      change: r.change,
      engine: r.engine,
      configHash: r.configHash,
      wallMs: r.wallMs,
      artifact: r.artifact,
    })),
    rows,
    ladderPlan: args.arms.map(name => ({ arm: name, seed: armLadderSeed(name), command: ladderCommand(name, args.outDir) })),
  };
  fs.writeFileSync(path.join(outDir, 'comparison.json'), JSON.stringify(summary, null, 2) + '\n');
  fs.writeFileSync(path.join(outDir, 'comparison.md'), table + '\n');
  console.log('');
  console.log(table);
  console.log('');
  console.log(`ablate: wrote ${path.relative(REPO_ROOT, path.join(outDir, 'comparison.json'))} and comparison.md`);
}

const invokedDirectly =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (invokedDirectly) void main();

export { ARMS };
