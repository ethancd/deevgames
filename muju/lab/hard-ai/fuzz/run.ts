/**
 * `npm run hard:fuzz -- --actions <n> --seed <n> [--surfaces transition,legality]
 *                      [--legality-every <n>] [--plies <n>] [--out <path>]
 *                      [--sample <n> --sample-out <path>] [--no-repro]`
 * `npm run hard:fuzz -- --surfaces prover --cases <n> --seed <n> --out <path>`
 * `npm run hard:fuzz -- --surfaces gate-preservation --actions <n> --seed <n> --out <path>`
 * (DESIGN §7.3, §5.9).
 *
 * The three action-driven surfaces of DESIGN §7.3 do not all compare the same
 * KIND of thing, so they do not all share one driver. `transition` and
 * `legality` walk seeded games and compare every action (`fuzz/differential.ts`,
 * M5). `prover` compares a VERDICT on synthesised occupier positions, and
 * M10's gate-preservation proof compares only the adjudicated `result`/`reason`
 * over played games; both live in `fuzz/prover-surface.ts` and are selected by
 * naming them alone in `--surfaces`. Mixing them in one run is rejected rather
 * than silently producing a metrics object whose fields come from two
 * different populations.
 *
 * Writes the metrics object `lab/hard-ai/verify/gates.ts` reads for the M5 gate
 * and, on any divergence, self-contained reproducers to
 * `lab/results/hard-ai-fuzz-<YYYY-MM-DD>/divergence-<n>.json` (seed, game, ply,
 * the action prefix, the rules block and both states), then exits non-zero.
 *
 * `--sample N --sample-out <path>` additionally writes N macro-node positions
 * in `muju-position-v1` form, stratified by turn number, each with its `rules`
 * block — that is how `lab/hard-ai/positions/fuzz-1000.jsonl` is produced.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { runFuzz, type Surface } from './differential';
import { runGatePreservation, runProverSurface } from './prover-surface';
import { writePositions } from '../positions/corpus';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');
const DEFAULT_OUT = path.resolve(REPO_ROOT, 'lab/results/hard-ai-verify/fuzz.json');

type AnySurface = Surface | 'prover' | 'gate-preservation';

interface Args {
  seed: number;
  actions: number;
  cases: number;
  surfaces: Set<AnySurface>;
  legalityEvery: number;
  plies: number;
  out: string;
  sample: number;
  sampleOut: string | null;
  repro: boolean;
}

const KNOWN_SURFACES: readonly string[] = ['transition', 'legality', 'prover', 'gate-preservation'];
/** Surfaces that have their own driver and cannot be mixed with the others. */
const STANDALONE_SURFACES: readonly string[] = ['prover', 'gate-preservation'];

function parseArgs(argv: string[]): Args {
  const args: Args = {
    seed: 1,
    actions: 100_000,
    cases: 20_000,
    surfaces: new Set<AnySurface>(['transition', 'legality']),
    legalityEvery: 8,
    plies: 500,
    out: DEFAULT_OUT,
    sample: 0,
    sampleOut: null,
    repro: true,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--seed') args.seed = Number(argv[++i]);
    else if (a === '--actions') args.actions = Number(argv[++i]);
    else if (a === '--cases') args.cases = Number(argv[++i]);
    else if (a === '--plies') args.plies = Number(argv[++i]);
    else if (a === '--legality-every') args.legalityEvery = Number(argv[++i]);
    else if (a === '--out') args.out = path.resolve(REPO_ROOT, argv[++i]);
    else if (a === '--sample') args.sample = Number(argv[++i]);
    else if (a === '--sample-out') args.sampleOut = path.resolve(REPO_ROOT, argv[++i]);
    else if (a === '--no-repro') args.repro = false;
    else if (a === '--surfaces') {
      const list = argv[++i].split(',').map(s => s.trim()).filter(Boolean);
      for (const s of list) {
        if (!KNOWN_SURFACES.includes(s)) {
          throw new Error(`hard:fuzz: surface "${s}" is not implemented yet (have: ${KNOWN_SURFACES.join(', ')})`);
        }
      }
      const standalone = list.filter(s => STANDALONE_SURFACES.includes(s));
      if (standalone.length > 0 && list.length > 1) {
        throw new Error(`hard:fuzz: surface "${standalone[0]}" has its own driver and cannot be combined with ${list.filter(s => s !== standalone[0]).join(', ')}`);
      }
      args.surfaces = new Set(list as AnySurface[]);
    } else throw new Error(`hard:fuzz: unrecognised argument "${a}"`);
  }
  if (!Number.isInteger(args.actions) || args.actions <= 0) throw new Error('hard:fuzz: --actions must be a positive integer');
  if (!Number.isInteger(args.cases) || args.cases <= 0) throw new Error('hard:fuzz: --cases must be a positive integer');
  if (!Number.isInteger(args.legalityEvery) || args.legalityEvery <= 0) throw new Error('hard:fuzz: --legality-every must be a positive integer');
  if (args.sample > 0 && args.sampleOut === null) throw new Error('hard:fuzz: --sample requires --sample-out');
  return args;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function gitRevision(): string | null {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

/**
 * Sibling artifacts of the same gate merge into one file, the way
 * `perft/run.ts` and `verify/determinism.ts` do it: writing
 * `<dir>/M10-gate.json` folds `<dir>/M10-prover.json` in under `prover`, so a
 * gate row whose chain writes two artifacts can still name a single one for
 * its criterion to read.
 */
function siblingMerges(outPath: string): Record<string, unknown> {
  const dir = path.dirname(outPath);
  const stem = path.basename(outPath, '.json');
  const cut = stem.lastIndexOf('-');
  const merged: Record<string, unknown> = {};
  if (cut <= 0 || !fs.existsSync(dir)) return merged;
  const group = stem.slice(0, cut);
  const siblings = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isFile() && e.name.startsWith(`${group}-`) && e.name.endsWith('.json'))
    .map(e => ({ name: e.name, label: e.name.slice(group.length + 1, e.name.length - 5) }));
  // A sibling written by an earlier step of the same chain already carries its
  // own merged view of this group, so copying it verbatim would nest the group
  // inside itself once per run. Strip every group label out of what is read
  // back: the merge is one level deep, always.
  const labels = new Set(siblings.map(s => s.label));
  for (const sibling of siblings) {
    if (sibling.label === stem.slice(cut + 1)) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(dir, sibling.name), 'utf8')) as Record<string, unknown>;
      for (const label of labels) delete parsed[label];
      merged[sibling.label] = parsed;
    } catch {
      // malformed sibling artifact; skip rather than fail this tool's own run
    }
  }
  return merged;
}

function write(outPath: string, metrics: Record<string, unknown>): void {
  const artifact = { ...siblingMerges(outPath), ...metrics, git: gitRevision(), node: process.version, at: new Date().toISOString() };
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(artifact, null, 2) + '\n');
  console.log(`hard:fuzz: wrote ${outPath}`);
}

/** DESIGN §7.3's third surface: `homeVerdict` vs `analyzeHomeDefense`. */
function runProverMain(args: Args, reproDir: string | null): void {
  const metrics = runProverSurface({ seed: args.seed, cases: args.cases, reproDir });
  write(args.out, metrics as unknown as Record<string, unknown>);
  console.log(JSON.stringify(metrics));
  if (
    metrics.fixtureCases !== 28 ||
    metrics.fixtureMismatch > 0 ||
    metrics.fuzzVerdictMismatch > 0 ||
    metrics.nodeMismatch > 0 ||
    metrics.witnessIllegal > 0 ||
    metrics.witnessNotRemoved > 0 ||
    !metrics.clockFixtureOk
  ) {
    process.exitCode = 1;
  }
}

/** DESIGN §5.9 (c): the gated replica's verdict equals the ungated canonical's. */
function runGateMain(args: Args, reproDir: string | null): void {
  const metrics = runGatePreservation({ seed: args.seed, actions: args.actions, plies: args.plies, reproDir });
  write(args.out, { gatePreservation: metrics });
  console.log(JSON.stringify(metrics));
  if (metrics.mismatches > 0 || metrics.actions < args.actions || metrics.proofsCompared === 0) process.exitCode = 1;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const reproDir = args.repro ? path.resolve(REPO_ROOT, `lab/results/hard-ai-fuzz-${today()}`) : null;

  if (args.surfaces.has('prover')) {
    runProverMain(args, reproDir);
    return;
  }
  if (args.surfaces.has('gate-preservation')) {
    runGateMain(args, reproDir);
    return;
  }

  const { metrics, samples } = runFuzz({
    seed: args.seed,
    actions: args.actions,
    surfaces: args.surfaces as ReadonlySet<Surface>,
    legalityEvery: args.legalityEvery,
    plies: args.plies,
    reproDir,
    sample: args.sample,
  });

  if (args.sampleOut !== null) {
    fs.mkdirSync(path.dirname(args.sampleOut), { recursive: true });
    writePositions(args.sampleOut, samples);
    console.log(`hard:fuzz --sample: wrote ${samples.length} positions to ${args.sampleOut}`);
  }

  write(args.out, metrics as unknown as Record<string, unknown>);
  console.log(
    JSON.stringify({
      actions: metrics.actions,
      games: metrics.games,
      divergences: metrics.divergences,
      legalitySetMismatches: metrics.legalitySetMismatches,
      unmakeMismatches: metrics.unmakeMismatches,
      rehashMismatches: metrics.rehashMismatches,
      invariantViolations: metrics.invariantViolations,
      canActClearedGames: metrics.canActClearedGames,
      reviewUpkeepGames: metrics.reviewUpkeepGames,
      eliminationRuleGames: metrics.eliminationRuleGames,
      elapsedMs: metrics.elapsedMs,
    }),
  );

  const failed =
    metrics.divergences > 0 ||
    metrics.legalitySetMismatches > 0 ||
    metrics.unmakeMismatches > 0 ||
    metrics.rehashMismatches > 0 ||
    metrics.invariantViolations > 0;
  if (failed) process.exitCode = 1;
}

main();
