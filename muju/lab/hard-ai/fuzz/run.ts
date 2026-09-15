/**
 * `npm run hard:fuzz -- --actions <n> --seed <n> [--surfaces transition,legality]
 *                      [--legality-every <n>] [--plies <n>] [--out <path>]
 *                      [--sample <n> --sample-out <path>] [--no-repro]`
 * (DESIGN §7.3).
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
import { writePositions } from '../positions/corpus';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');
const DEFAULT_OUT = path.resolve(REPO_ROOT, 'lab/results/hard-ai-verify/fuzz.json');

interface Args {
  seed: number;
  actions: number;
  surfaces: Set<Surface>;
  legalityEvery: number;
  plies: number;
  out: string;
  sample: number;
  sampleOut: string | null;
  repro: boolean;
}

const KNOWN_SURFACES: readonly string[] = ['transition', 'legality'];

function parseArgs(argv: string[]): Args {
  const args: Args = {
    seed: 1,
    actions: 100_000,
    surfaces: new Set<Surface>(['transition', 'legality']),
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
      args.surfaces = new Set(list as Surface[]);
    } else throw new Error(`hard:fuzz: unrecognised argument "${a}"`);
  }
  if (!Number.isInteger(args.actions) || args.actions <= 0) throw new Error('hard:fuzz: --actions must be a positive integer');
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

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const reproDir = args.repro ? path.resolve(REPO_ROOT, `lab/results/hard-ai-fuzz-${today()}`) : null;

  const { metrics, samples } = runFuzz({
    seed: args.seed,
    actions: args.actions,
    surfaces: args.surfaces,
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

  const artifact = { ...metrics, git: gitRevision(), node: process.version, at: new Date().toISOString() };
  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, JSON.stringify(artifact, null, 2) + '\n');
  console.log(`hard:fuzz: wrote ${args.out}`);
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
