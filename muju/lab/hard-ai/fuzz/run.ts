/**
 * `npm run hard:fuzz -- --actions <n> --seed <n> [--surfaces transition,legality,arrival]
 *                      [--legality-every <n>] [--plies <n>] [--arrival-cases <n>]
 *                      [--out <path>] [--sample <n> --sample-out <path>] [--no-repro]
 *                      [--allow-known-prover-gap]`
 * `npm run hard:fuzz -- --surfaces prover --cases <n> --seed <n> --out <path> --allow-standard-surfaces`
 * `npm run hard:fuzz -- --surfaces gate-preservation --actions <n> --seed <n> --out <path> --allow-standard-surfaces`
 * (DESIGN §7.3, §5.9).
 *
 * ## M2: the Standard-only surfaces are skipped by default
 *
 * `prover` compares `homeVerdict` against `analyzeHomeDefense`, and
 * `gate-preservation` compares adjudicated results over played games; both live
 * in `fuzz/prover-surface.ts` and both still model STANDARD, because
 * `tactics/prover.ts` is not ported until M4. Running them against the
 * Phasing-only replica would report a wall of divergences that say nothing about
 * M2. They are therefore SKIPPED by default with a loud log line and a
 * `skipped: true` artifact; `--allow-standard-surfaces` runs them anyway for
 * whoever is doing the M4 port.
 *
 * ## The action-driven surfaces
 *
 * `transition`, `legality` and `arrival` all measure the Phasing replica.
 * `transition` and `legality` walk seeded Phasing games and compare every action
 * (`fuzz/differential.ts runFuzz`); `arrival` builds mid-game positions with
 * commitments on both sides, disrupts some of them, and compares the hand-off
 * (`runArrivalSurface`). They share one artifact: `arrival` nests its metrics
 * under `arrival`.
 *
 * Writes the metrics object `lab/hard-ai/verify/gates.ts` reads for the gate and,
 * on any divergence, self-contained reproducers to
 * `lab/results/hard-ai-fuzz-<YYYY-MM-DD>/{divergence,arrival}-<n>.json` (seed,
 * game, ply, the action prefix, the rules block and both states), then exits
 * non-zero.
 *
 * ## `--allow-known-prover-gap`
 *
 * M2 knowingly carries TWO divergence classes, both inside `tactics/prover.ts`,
 * which design item H places out of scope and which still models STANDARD home
 * defence. They fail in opposite directions: `overclaim-broke-defender` (the
 * bound, UNSOUND — the replica claims a mate against a defender that cannot
 * afford its rent) and `underclaim-standard-rescue` (the search — Standard's
 * rescue may promote and may keep part of the army, so the prover misses a mate
 * the canonical engine awards). Both are documented in
 * `docs/hard-ai/phasing/M2-STATUS.md` §2 and pinned by
 * `tests/ai/hard/phasing-prover-{debt,underclaim}.test.ts`.
 *
 * `differential.ts`'s `classifyKnownProverGap` recognises each narrowly — same
 * position in every other field, the verdicts differing in that specific
 * direction, and the defender actually holding the Standard-only resource that
 * explains it — and the metrics split `divergences` into
 * `proverOverclaimDivergences`, `proverUnderclaimDivergences` and
 * `unclassifiedDivergences`.
 *
 * By default BOTH fail the run, exactly as before. `--allow-known-prover-gap`
 * tolerates the classified ones (loudly, naming the fix milestone) so that a
 * long M2 sweep can still assert "no NEW divergence class". It never tolerates
 * `unclassifiedDivergences`.
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
import { writePositions } from '../positions/corpus';

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
  plies: number;
  out: string;
  sample: number;
  sampleOut: string | null;
  repro: boolean;
  allowStandardSurfaces: boolean;
  allowKnownProverGap: boolean;
}

const KNOWN_SURFACES: readonly string[] = ['transition', 'legality', 'arrival', 'prover', 'gate-preservation'];
/** Surfaces that have their own driver and cannot be mixed with the others. */
const STANDALONE_SURFACES: readonly string[] = ['prover', 'gate-preservation'];
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
    surfaces: new Set<AnySurface>(['transition', 'legality', 'arrival']),
    legalityEvery: 8,
    plies: 500,
    out: DEFAULT_OUT,
    sample: 0,
    sampleOut: null,
    repro: true,
    allowStandardSurfaces: false,
    allowKnownProverGap: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--seed') args.seed = Number(argv[++i]);
    else if (a === '--actions') args.actions = Number(argv[++i]);
    else if (a === '--cases') args.cases = Number(argv[++i]);
    else if (a === '--arrival-cases') args.arrivalCases = Number(argv[++i]);
    else if (a === '--plies') args.plies = Number(argv[++i]);
    else if (a === '--legality-every') args.legalityEvery = Number(argv[++i]);
    else if (a === '--out') args.out = path.resolve(REPO_ROOT, argv[++i]);
    else if (a === '--sample') args.sample = Number(argv[++i]);
    else if (a === '--sample-out') args.sampleOut = path.resolve(REPO_ROOT, argv[++i]);
    else if (a === '--no-repro') args.repro = false;
    else if (a === '--allow-standard-surfaces') args.allowStandardSurfaces = true;
    else if (a === '--allow-known-prover-gap') args.allowKnownProverGap = true;
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
  if (!Number.isInteger(args.arrivalCases) || args.arrivalCases <= 0) throw new Error('hard:fuzz: --arrival-cases must be a positive integer');
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
  const artifact = { ...siblingMerges(outPath), ...metrics, git: gitRevision(), node: process.version, at: new Date().toISOString() };
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(artifact, null, 2) + '\n');
  console.log(`hard:fuzz: wrote ${outPath}`);
}

/** The M2 skip for a surface that still models Standard. */
function skipStandardSurface(name: string, out: string): void {
  console.log('');
  console.log('*'.repeat(78));
  console.log(`hard:fuzz: SKIPPING the "${name}" surface.`);
  console.log('  It compares the replica against a STANDARD model (tactics/prover.ts mirrors');
  console.log('  analyzeHomeDefense and is not ported to Phasing until M4), while the replica');
  console.log('  is now PHASING-ONLY. Running it here would report divergences that say');
  console.log('  nothing about M2.');
  console.log('  Re-enable with: npm run hard:fuzz -- --surfaces ' + name + ' --allow-standard-surfaces');
  console.log('*'.repeat(78));
  console.log('');
  write(out, { surface: name, skipped: true, skipReason: 'standard-only-surface-pending-M4', ruleset: 'phasing' });
}

/** DESIGN §7.3's third surface: `homeVerdict` vs `analyzeHomeDefense`. */
function runProverMain(args: Args, reproDir: string | null): void {
  if (!args.allowStandardSurfaces) {
    skipStandardSurface('prover', args.out);
    return;
  }
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
  if (!args.allowStandardSurfaces) {
    skipStandardSurface('gate-preservation', args.out);
    return;
  }
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

  const walkSurfaces = new Set<Surface>([...args.surfaces].filter(s => s === 'transition' || s === 'legality') as Surface[]);
  let metrics: Record<string, unknown> = {};
  let failed = false;

  if (walkSurfaces.size > 0) {
    const { metrics: walk, samples } = runFuzz({
      seed: args.seed,
      actions: args.actions,
      surfaces: walkSurfaces,
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

    metrics = { ...(walk as unknown as Record<string, unknown>) };
    console.log(
      JSON.stringify({
        actions: walk.actions,
        games: walk.games,
        divergences: walk.divergences,
        knownProverGapDivergences: walk.knownProverGapDivergences,
        proverOverclaimDivergences: walk.proverOverclaimDivergences,
        proverUnderclaimDivergences: walk.proverUnderclaimDivergences,
        unclassifiedDivergences: walk.unclassifiedDivergences,
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
        elapsedMs: walk.elapsedMs,
      }),
    );

    // A divergence fails the run. The ONE exception is opt-in and narrow:
    // `--allow-known-prover-gap` tolerates divergences that
    // `classifyKnownProverGap` recognised as the documented M4 prover debt
    // (M2-STATUS.md §2), and never tolerates `unclassifiedDivergences`, so a NEW
    // divergence class still fails even under the flag. Without the flag the
    // gate is exactly as strict as it was.
    if (walk.unclassifiedDivergences > 0) {
      console.error(
        `hard:fuzz: ${walk.unclassifiedDivergences} UNCLASSIFIED transition divergence(s) — not the known M4 prover debt`,
      );
      failed = true;
    }
    if (walk.knownProverGapDivergences > 0) {
      const verdict = args.allowKnownProverGap ? 'TOLERATED by --allow-known-prover-gap' : 'FAILING this run';
      console.error('');
      console.error('!'.repeat(78));
      console.error(
        `hard:fuzz: ${walk.knownProverGapDivergences} divergence(s) matched the KNOWN M4 prover debt — ${verdict}.`,
      );
      console.error('  tactics/prover.ts still models STANDARD home defence, in both directions:');
      console.error(
        `  - ${walk.proverOverclaimDivergences} overclaim-broke-defender (UNSOUND): the bound passes`,
      );
      console.error('    `preparing: true` (prover.ts:418, 720, 738), so a defender that cannot afford');
      console.error('    its rent is treated as having no army and the replica claims a mate the');
      console.error('    canonical engine refutes. Pinned: tests/ai/hard/phasing-prover-debt.test.ts');
      console.error(
        `  - ${walk.proverUnderclaimDivergences} underclaim-standard-rescue: Standard's rescue may promote`,
      );
      console.error('    and may keep part of the army (homeCheckmate.ts:140-160), which Phasing forbids,');
      console.error('    so the prover finds defences that do not exist and misses a mate canonical');
      console.error('    awards. Pinned: tests/ai/hard/phasing-prover-underclaim.test.ts');
      console.error('  Fix: M4, both halves together.');
      console.error('  Documented: docs/hard-ai/phasing/M2-STATUS.md §2.');
      console.error('!'.repeat(78));
      console.error('');
      if (!args.allowKnownProverGap) failed = true;
    }

    failed =
      failed ||
      walk.legalitySetMismatches > 0 ||
      walk.pendingLegalityMismatches > 0 ||
      walk.unmakeMismatches > 0 ||
      walk.rehashMismatches > 0 ||
      walk.roundTripMismatches > 0 ||
      walk.invariantViolations > 0;

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
      arrival.survivorMismatches > 0;
    if (arrival.cases >= BOTH_OUTCOMES_EXPECTED_CASES && (arrival.casesWithArrival === 0 || arrival.casesWithRefund === 0)) {
      console.error(
        `hard:fuzz: arrival surface produced no ${arrival.casesWithArrival === 0 ? 'arrivals' : 'refunds'} ` +
          `(cases ${arrival.cases}, skipped ${arrival.skipped}); the intrusions are not reaching the plane`,
      );
      failed = true;
    }
  }

  write(args.out, metrics);
  if (failed) process.exitCode = 1;
}

main();
