/**
 * `npm run hard:fuzz -- --actions <n> --seed <n>`
 *                      `[--surfaces transition,legality,arrival,prover,gate-preservation]`
 *                      `[--legality-every <n>] [--plies <n>] [--arrival-cases <n>] [--cases <n>]`
 *                      `[--out <path>] [--sample <n> --sample-out <path>] [--no-repro]`
 * (DESIGN §7.3, §5.9).
 *
 * ## Every surface runs, and every divergence fails
 *
 * `transition`, `legality`, `arrival`, `prover` and `gate-preservation` are ALL
 * on by default and all measure the Phasing replica.
 *
 *   - `transition` / `legality` walk seeded Phasing games and compare every
 *     action (`fuzz/differential.ts runFuzz`);
 *   - `arrival` builds mid-game positions with commitments on both sides,
 *     disrupts some of them, and compares the hand-off (`runArrivalSurface`);
 *   - `prover` compares `tactics/prover.ts homeVerdict` against
 *     `analyzeHomeDefense` — verdict, NODE COUNT and method — and replays every
 *     `homeWitness` line through canonical `applyAction`;
 *   - `gate-preservation` plays real games and asserts that `make`'s gate
 *     (`needsProof`) never changes an adjudicated result.
 *
 * M2 round 4 ported the packed prover to Phasing's ACT-ONLY home defence, so the
 * last two surfaces no longer model Standard and are no longer skipped: the
 * `--allow-standard-surfaces` opt-in and the `--allow-known-prover-gap`
 * mate-verdict exemption are both GONE. Any divergence of any kind fails the
 * run. See `docs/hard-ai/phasing/M2-STATUS.md`.
 *
 * `prover` and `gate-preservation` keep their own artifact shapes when either is
 * the ONLY requested surface (top level, and `gatePreservation` respectively),
 * because the M10 gate chain in `lab/hard-ai/verify/gates.ts` invokes them that
 * way and relies on the sibling merge. In a combined run they nest under
 * `prover` / `gatePreservation`.
 *
 * Writes the metrics object `lab/hard-ai/verify/gates.ts` reads for the gate and,
 * on any divergence, self-contained reproducers to
 * `lab/results/hard-ai-fuzz-<YYYY-MM-DD>/{divergence,arrival,prover-divergence,gate-divergence}-<n>.json`
 * (seed, game, ply, the action prefix, the rules block and both states), then
 * exits non-zero.
 *
 * `--resign-rate <r>` is the fraction of plies on which RESIGN is offered to the
 * walker (default 0.002). It is drawn from a stream of its own, so `--resign-rate 0`
 * replays a seed bit-identically to a run taken before RESIGN was injectable —
 * which is how the seeds of earlier converger rounds are re-run as true repros.
 *
 * `--sample N --sample-out <path>` additionally writes N macro-node positions in
 * `muju-position-v1` form, stratified by turn number, each with its `rules`
 * block — that is how `lab/hard-ai/positions/fuzz-1000.jsonl` is produced.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { runArrivalSurface, runFuzz, type Surface } from './differential';
import { runGatePreservation, runProverSurface } from './prover-surface';
import { PROOF_NODES } from '../../../src/ai/hard/tactics/prover';
import { writePositions } from '../positions/corpus';

/**
 * Below this many gate actions a run is too short to expect an order-permuted
 * prover comparison; at 20,000 the observed rate is ~1,800. See
 * `ProverOrderCounters.orderPermuted`.
 */
const ORDER_PERMUTED_EXPECTED_ACTIONS = 4000;

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');
const DEFAULT_OUT = path.resolve(REPO_ROOT, 'lab/results/hard-ai-verify/fuzz.json');

type AnySurface = Surface | 'prover' | 'gate-preservation';

interface Args {
  seed: number;
  actions: number;
  cases: number;
  arrivalCases: number;
  surfaces: Set<AnySurface>;
  legalityEvery: number;
  resignRate: number;
  plies: number;
  out: string;
  sample: number;
  sampleOut: string | null;
  repro: boolean;
}

const KNOWN_SURFACES: readonly string[] = ['transition', 'legality', 'arrival', 'prover', 'gate-preservation'];
/** Actions below which a run is too short to require a refund (see the gate). */
const REFUND_EXPECTED_ACTIONS = 4000;
/** Arrival cases below which a run is too short to require both outcomes. */
const BOTH_OUTCOMES_EXPECTED_CASES = 25;

function parseArgs(argv: string[]): Args {
  const args: Args = {
    seed: 1,
    actions: 100_000,
    cases: 20_000,
    arrivalCases: 400,
    surfaces: new Set<AnySurface>(['transition', 'legality', 'arrival', 'prover', 'gate-preservation']),
    legalityEvery: 8,
    resignRate: 0.002,
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
    else if (a === '--arrival-cases') args.arrivalCases = Number(argv[++i]);
    else if (a === '--plies') args.plies = Number(argv[++i]);
    else if (a === '--legality-every') args.legalityEvery = Number(argv[++i]);
    else if (a === '--resign-rate') args.resignRate = Number(argv[++i]);
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
      args.surfaces = new Set(list as AnySurface[]);
    } else throw new Error(`hard:fuzz: unrecognised argument "${a}"`);
  }
  if (!Number.isInteger(args.actions) || args.actions <= 0) throw new Error('hard:fuzz: --actions must be a positive integer');
  if (!Number.isInteger(args.cases) || args.cases <= 0) throw new Error('hard:fuzz: --cases must be a positive integer');
  if (!Number.isInteger(args.arrivalCases) || args.arrivalCases <= 0) throw new Error('hard:fuzz: --arrival-cases must be a positive integer');
  if (!Number.isInteger(args.legalityEvery) || args.legalityEvery <= 0) throw new Error('hard:fuzz: --legality-every must be a positive integer');
  if (!(args.resignRate >= 0 && args.resignRate <= 1)) throw new Error('hard:fuzz: --resign-rate must be between 0 and 1');
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
 * How many tracked files differ from `git` above. An artifact that records only
 * the commit is MISLEADING when the run was made from a working tree — which is
 * how every converger round runs — because the commit does not contain the code
 * that produced the numbers. Round 5 found the checked-in `fuzz.json` was an
 * older failing run with no way to tell from the file itself.
 */
function gitDirtyFiles(): number | null {
  try {
    const out = execFileSync('git', ['status', '--porcelain'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
    return out === '' ? 0 : out.split('\n').length;
  } catch {
    return null;
  }
}

/**
 * Sibling artifacts of the same gate merge into one file, the way
 * `perft/run.ts` and `verify/determinism.ts` do it: writing
 * `<dir>/M10-gate.json` folds `<dir>/M10-prover.json` in under `prover`, so a
 * gate row whose chain writes two artifacts can still name a single one for its
 * criterion to read.
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
  const dirty = gitDirtyFiles();
  const artifact = {
    ...siblingMerges(outPath),
    ...metrics,
    git: gitRevision(),
    gitDirtyFiles: dirty,
    treeMatchesCommit: dirty === 0,
    node: process.version,
    at: new Date().toISOString(),
  };
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(artifact, null, 2) + '\n');
  console.log(`hard:fuzz: wrote ${outPath}`);
}

/** DESIGN §7.3's third surface: `homeVerdict` vs `analyzeHomeDefense`. */
function proverSurface(args: Args, reproDir: string | null): { metrics: Record<string, unknown>; failed: boolean } {
  const metrics = runProverSurface({ seed: args.seed, cases: args.cases, reproDir });
  console.log(JSON.stringify(metrics));
  const failed =
    metrics.fixtureCases !== 28 ||
    metrics.fixtureMismatch > 0 ||
    metrics.fuzzVerdictMismatch > 0 ||
    metrics.nodeMismatch > 0 ||
    metrics.witnessIllegal > 0 ||
    metrics.witnessNotRemoved > 0 ||
    !metrics.clockFixtureOk;
  if (failed) {
    console.error(
      `hard:fuzz: prover surface FAILED (fixtureMismatch ${metrics.fixtureMismatch}, ` +
        `fuzzVerdictMismatch ${metrics.fuzzVerdictMismatch}, nodeMismatch ${metrics.nodeMismatch}, ` +
        `witnessIllegal ${metrics.witnessIllegal}, witnessNotRemoved ${metrics.witnessNotRemoved}, ` +
        `clockFixtureOk ${metrics.clockFixtureOk})`,
    );
  }
  return { metrics: metrics as unknown as Record<string, unknown>, failed };
}

/** DESIGN §5.9 (c): the gated replica's verdict equals the ungated canonical's. */
function gateSurface(args: Args, reproDir: string | null): { metrics: Record<string, unknown>; failed: boolean } {
  const metrics = runGatePreservation({ seed: args.seed, actions: args.actions, plies: args.plies, reproDir });
  console.log(JSON.stringify(metrics));
  const failed =
    metrics.mismatches > 0 ||
    metrics.actions < args.actions ||
    metrics.proofsCompared === 0 ||
    metrics.incrementalProverVerdictMismatches > 0 ||
    metrics.incrementalProverNodeMismatches > 0 ||
    metrics.freshPackProverMismatches > 0 ||
    metrics.proverOrderInvarianceViolations > 0 ||
    (metrics.proverOrderPermuted === 0 && args.actions >= ORDER_PERMUTED_EXPECTED_ACTIONS);
  if (failed) {
    console.error(
      `hard:fuzz: gate-preservation FAILED (mismatches ${metrics.mismatches}, ` +
        `actions ${metrics.actions}/${args.actions}, proofsCompared ${metrics.proofsCompared}, ` +
        `incrementalProverVerdictMismatches ${metrics.incrementalProverVerdictMismatches}, ` +
        `incrementalProverNodeMismatches ${metrics.incrementalProverNodeMismatches}, ` +
        `freshPackProverMismatches ${metrics.freshPackProverMismatches})`,
    );
  }
  // COVERAGE, and it is a failure condition: zero order-permuted comparisons
  // would mean this surface never built a state whose slot order differs from
  // canonical order, which is the exact shape 28.55M actions of round-4 fuzz
  // walked past. A zero mismatch count is only worth reading beside it.
  if (metrics.proverOrderPermuted === 0 && args.actions >= ORDER_PERMUTED_EXPECTED_ACTIONS) {
    console.error(
      `hard:fuzz: gate-preservation made ${metrics.incrementalProverCases} prover comparisons but NONE on an ` +
        'order-permuted state; the incremental prover surface is vacuous for this run',
    );
  }
  // The order-exposure line. Reported ALWAYS, pass or fail: a capped gate proof
  // is the only route by which candidate order could have changed an adjudicated
  // result, so "0" here is what makes the rest of the zeros mean what they claim.
  console.error(
    `hard:fuzz: gate-preservation order exposure — gateProverCapHits ${metrics.gateProverCapHits}, ` +
      `proverMaxNodes ${metrics.proverMaxNodes} of ${PROOF_NODES} over ${metrics.proverPositions} positions`,
  );
  return { metrics: metrics as unknown as Record<string, unknown>, failed };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const reproDir = args.repro ? path.resolve(REPO_ROOT, `lab/results/hard-ai-fuzz-${today()}`) : null;

  // The M10 gate chain (`lab/hard-ai/verify/gates.ts`) asks for each standalone
  // surface on its own and reads the artifact at the shape that produced: the
  // prover surface at TOP LEVEL, the gate surface under `gatePreservation`, with
  // the sibling merge folding the first into the second. Preserve exactly that
  // when one of them is the only surface requested.
  if (args.surfaces.size === 1 && args.surfaces.has('prover')) {
    const { metrics, failed } = proverSurface(args, reproDir);
    write(args.out, metrics);
    if (failed) process.exitCode = 1;
    return;
  }
  if (args.surfaces.size === 1 && args.surfaces.has('gate-preservation')) {
    const { metrics, failed } = gateSurface(args, reproDir);
    write(args.out, { gatePreservation: metrics });
    if (failed) process.exitCode = 1;
    return;
  }

  const walkSurfaces = new Set<Surface>([...args.surfaces].filter(s => s === 'transition' || s === 'legality') as Surface[]);
  let metrics: Record<string, unknown> = {};
  let failed = false;

  if (walkSurfaces.size > 0) {
    const { metrics: walk, samples } = runFuzz({
      seed: args.seed,
      actions: args.actions,
      surfaces: walkSurfaces,
      legalityEvery: args.legalityEvery,
      resignRate: args.resignRate,
      plies: args.plies,
      reproDir,
      sample: args.sample,
    });

    if (args.sampleOut !== null) {
      fs.mkdirSync(path.dirname(args.sampleOut), { recursive: true });
      writePositions(args.sampleOut, samples);
      console.log(`hard:fuzz --sample: wrote ${samples.length} positions to ${args.sampleOut}`);
    }

    metrics = { ...(walk as unknown as Record<string, unknown>) };
    console.log(
      JSON.stringify({
        actions: walk.actions,
        games: walk.games,
        divergences: walk.divergences,
        legalitySetMismatches: walk.legalitySetMismatches,
        pendingLegalityMismatches: walk.pendingLegalityMismatches,
        unmakeMismatches: walk.unmakeMismatches,
        rehashMismatches: walk.rehashMismatches,
        roundTripMismatches: walk.roundTripMismatches,
        invariantViolations: walk.invariantViolations,
        buys: walk.buys,
        arrivals: walk.arrivals,
        refunds: walk.refunds,
        arrivalRefundGameFraction: walk.arrivalRefundGameFraction,
        terminals: walk.terminals,
        elapsedMs: walk.elapsedMs,
      }),
    );

    // ANY divergence fails the run. Round 4 ported `tactics/prover.ts` to
    // Phasing, so the `--allow-known-prover-gap` exemption and the
    // `classifyKnownProverGap` classifier it rested on are both gone: there is no
    // longer a divergence class this milestone knowingly carries, and a mate
    // verdict split is a failure like any other field.
    if (walk.divergences > 0) {
      console.error('');
      console.error('!'.repeat(78));
      console.error(`hard:fuzz: ${walk.divergences} transition divergence(s) — the replica disagrees with canonical.`);
      console.error('  Reproducers (seed, game, ply, prefix, both states) are in the repro directory.');
      console.error('  The canonical engine is the oracle: docs/PHASING-2026-09-16.md and');
      console.error('  src/game/{turn,summoning,legality,homeCheckmate}.ts.');
      console.error('!'.repeat(78));
      console.error('');
      failed = true;
    }

    failed =
      failed ||
      walk.legalitySetMismatches > 0 ||
      walk.pendingLegalityMismatches > 0 ||
      walk.unmakeMismatches > 0 ||
      walk.rehashMismatches > 0 ||
      walk.roundTripMismatches > 0 ||
      walk.invariantViolations > 0 ||
      // THE INCREMENTAL PROVER SURFACE (round 6). The prover surface proper packs
      // every case fresh, which restores canonical `board.units` order by
      // construction and is why it could not see the arrival-order defect. These
      // comparisons run on the state the walk actually built.
      walk.incrementalProverVerdictMismatches > 0 ||
      walk.incrementalProverNodeMismatches > 0 ||
      walk.freshPackProverMismatches > 0 ||
      walk.proverOrderInvarianceViolations > 0;
    if (walk.gateProverCapHits > 0) {
      console.error(
        `hard:fuzz: ${walk.gateProverCapHits} gate proof(s) inside make() ended AT the ${PROOF_NODES}-node cap. ` +
          'A capped proof is the only way candidate ORDER can change a prover answer (M2-STATUS §2.6); ' +
          'this run needs its examples inspected before its zeros are read as order-independence.',
      );
    }

    // A Phasing walk that never committed a summon, or never saw one arrive,
    // has not exercised anything Phasing-specific: fail rather than report a
    // green run (DESIGN §7.3 coverage, M2 item 4). A REFUND needs a commitment
    // to be disrupted between payment and arrival, which the observed rate puts
    // at roughly 4 per 1,000 actions, so it is only required of a run long
    // enough to expect several.
    if (walk.buys === 0 || walk.arrivals === 0) {
      console.error(
        `hard:fuzz: commitment coverage is empty (buys ${walk.buys}, arrivals ${walk.arrivals}); ` +
          'the walker never exercised the pending-summon plane',
      );
      failed = true;
    } else if (walk.refunds === 0 && args.actions >= REFUND_EXPECTED_ACTIONS) {
      console.error(
        `hard:fuzz: ${walk.actions} actions produced no refund; disruption between payment and arrival is untested`,
      );
      failed = true;
    }
  }

  if (args.surfaces.has('arrival')) {
    const arrival = runArrivalSurface({ seed: args.seed, cases: args.arrivalCases, plies: 120, reproDir });
    metrics = { ...metrics, arrival };
    console.log(JSON.stringify({ arrival }));
    failed =
      failed ||
      arrival.transitionMismatches > 0 ||
      arrival.unmakeMismatches > 0 ||
      arrival.rehashMismatches > 0 ||
      arrival.roundTripMismatches > 0 ||
      arrival.arrivalFlagMismatches > 0 ||
      arrival.refundBankMismatches > 0 ||
      arrival.planeNotClearedMismatches > 0 ||
      arrival.survivorMismatches > 0 ||
      arrival.incrementalProverMismatches > 0;
    if (arrival.cases >= BOTH_OUTCOMES_EXPECTED_CASES && (arrival.casesWithArrival === 0 || arrival.casesWithRefund === 0)) {
      console.error(
        `hard:fuzz: arrival surface produced no ${arrival.casesWithArrival === 0 ? 'arrivals' : 'refunds'} ` +
          `(cases ${arrival.cases}, skipped ${arrival.skipped}); the intrusions are not reaching the plane`,
      );
      failed = true;
    }
  }

  if (args.surfaces.has('prover')) {
    const prover = proverSurface(args, reproDir);
    metrics = { ...metrics, prover: prover.metrics };
    failed = failed || prover.failed;
  }

  if (args.surfaces.has('gate-preservation')) {
    const gate = gateSurface(args, reproDir);
    metrics = { ...metrics, gatePreservation: gate.metrics };
    failed = failed || gate.failed;
  }

  write(args.out, metrics);
  if (failed) process.exitCode = 1;
}

main();
