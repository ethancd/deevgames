/**
 * `npm run hard:perft -- --freeze | --check [--out <path>] [--engine canonical|replica]
 *                        [--describe]`
 * (DESIGN §7.2). Freezes/checks the PHASING macro-turn perft numbers: one
 * initial-position triple plus three numbers per authored fixture, at per-fixture
 * caps chosen so the whole run finishes well inside the 3-minute gate budget.
 *
 * `--engine replica` re-derives every Phasing number through the packed replica
 * (`perftReplica`, `src/ai/hard/verify/perft.ts`) and checks it against the SAME
 * frozen fixtures the canonical engine produced, which is the replica-parity
 * differential: the frozen file IS the canonical answer, so running both engines
 * in one process would only double the work.
 *
 * ## What is frozen, and by whom
 *
 * Fixtures are RECIPES (`phasing-fixtures.ts`): a seed, a rules block and a
 * predicate, replayed through the canonical engine. Each entry therefore freezes
 * a `digest` of the built position as well as its node counts, and `--check`
 * compares the digest FIRST so a drifted recipe reports as a drifted position
 * rather than as a perft regression.
 *
 * `--freeze` writes the CANONICAL numbers (the canonical engine is the oracle
 * and already implements Phasing). The M2 integrator re-runs
 * `--check --engine replica` and only then treats the numbers as agreed; until
 * that has happened `fixtures.json` carries `"replicaAgreed": false`.
 *
 * ## The Standard triple
 *
 * `perftActions_initial_4 = 14959`, `perftMidStates_initial = 1053` and
 * `perftTurns_initial = 797` are facts about the CANONICAL engine's Standard
 * initial position and are still checked under `--engine canonical`, which keeps
 * the M1 gate row meaningful. The replica is Phasing-only (design item A: `pack`
 * throws `PackError` for any non-Phasing state), so under `--engine replica`
 * they are reported as `null` with `standardTriple: 'skipped-phasing-replica'`
 * instead of being faked.
 *
 * `--out <dir>/<group>-<label>.json` also folds any sibling
 * `<dir>/<group>-<other>.json` artifact into the written file under
 * `{[other]: ...}`, and nests its own metrics under `perft`. That is the same
 * naming-convention merge `verify/determinism.ts siblingMerges` uses, and it is
 * what lets a gate row whose chain writes two artifacts name a single one for
 * its criterion to read.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createInitialGameState } from '../../../src/game/board';
import {
  enumerateTurn,
  perftActions,
  perftMidStates,
  perftReplica,
  perftTurns,
  type PerftLimits,
  type PerftResult,
} from '../../../src/ai/hard/verify/perft';
import { readPositions } from '../positions/corpus';
import { PHASING_FIXTURES, buildFixture, describeFixture, type BuiltFixture } from './phasing-fixtures';

const OPENINGS_PATH = path.resolve(import.meta.dirname, '../positions/openings.jsonl');

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');
const FIXTURES_PATH = path.resolve(import.meta.dirname, 'fixtures.json');
const DEFAULT_OUT = path.resolve(REPO_ROOT, 'lab/results/hard-ai-verify/perft.json');

/** The Phasing initial position, enumerated with no Prepare commitments: the
 * Act tree is then exactly Standard's, each sequence extended by
 * END_ACTION_PHASE and END_PLACE_PHASE, which makes the number easy to reason
 * about (and cheap). Prepare branching is covered by the fixtures. */
const INITIAL_LIMITS: PerftLimits = { act: 4, prepare: 0 };

interface FixtureRecord {
  id: string;
  digest: string;
  limits: PerftLimits;
  actions: number;
  midStates: number;
  endPositions: number;
}

interface InitialRecord {
  limits: PerftLimits;
  actions: number;
  midStates: number;
  turns: number;
}

interface FixturesFile {
  schema: 'muju-perft-fixtures-v2';
  ruleset: 'phasing';
  /** False until the integrator has seen `--check --engine replica` agree. */
  replicaAgreed: boolean;
  /** The canonical Standard triple, kept for the M1 gate row. */
  standardInitial: { maxActions: number; actions: number; midStates: number; turns: number };
  initial: InitialRecord;
  fixtures: FixtureRecord[];
}

interface Args {
  mode: 'freeze' | 'check';
  out: string;
  engine: 'canonical' | 'replica';
  describe: boolean;
}

function parseArgs(argv: string[]): Args {
  let mode: Args['mode'] | null = null;
  let out = DEFAULT_OUT;
  let engine: Args['engine'] = 'canonical';
  let describe = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--freeze') mode = 'freeze';
    else if (a === '--check') mode = 'check';
    else if (a === '--describe') describe = true;
    else if (a === '--out') out = path.resolve(REPO_ROOT, argv[++i]);
    else if (a === '--engine') {
      engine = argv[++i] as Args['engine'];
      if (engine !== 'canonical' && engine !== 'replica') throw new Error('hard:perft: --engine takes canonical|replica');
    } else throw new Error(`hard:perft: unrecognised argument "${a}"`);
  }
  if (!mode) throw new Error('hard:perft: pass --freeze or --check');
  return { mode, out, engine, describe };
}

function phasingInitial(): ReturnType<typeof createInitialGameState> {
  return createInitialGameState(undefined, 4, 0, 'phasing');
}

function run(state: ReturnType<typeof createInitialGameState>, limits: PerftLimits, engine: Args['engine']): PerftResult {
  return engine === 'replica' ? perftReplica(state, limits) : enumerateTurn(state, limits);
}

function computeInitial(engine: Args['engine']): InitialRecord {
  const r = run(phasingInitial(), INITIAL_LIMITS, engine);
  return { limits: INITIAL_LIMITS, actions: r.sequences, midStates: r.midStates, turns: r.endPositions };
}

/** The Standard triple: canonical engine only (see the module comment). */
function computeStandardInitial(): FixturesFile['standardInitial'] {
  const initial = createInitialGameState();
  const limits: PerftLimits = { act: 4, prepare: 0 };
  return {
    maxActions: 4,
    actions: perftActions(initial, limits),
    midStates: perftMidStates(initial, limits),
    turns: perftTurns(initial, limits),
  };
}

function buildAll(): BuiltFixture[] {
  return PHASING_FIXTURES.map(buildFixture);
}

function computeFixtures(built: readonly BuiltFixture[], engine: Args['engine']): FixtureRecord[] {
  return built.map(b => {
    const r = run(b.state, b.spec.limits, engine);
    return {
      id: b.spec.id,
      digest: b.digest,
      limits: b.spec.limits,
      actions: r.sequences,
      midStates: r.midStates,
      endPositions: r.endPositions,
    };
  });
}

/**
 * Folds sibling `<group>-<label>.json` artifacts of `outPath` into one object
 * under `{[label]: contents}`. An `--out` with no `-` in its stem has no group
 * and merges nothing.
 */
function siblingMerges(outPath: string): Record<string, unknown> {
  const dir = path.dirname(outPath);
  const stem = path.basename(outPath, '.json');
  const cut = stem.lastIndexOf('-');
  const merged: Record<string, unknown> = {};
  if (cut <= 0 || !fs.existsSync(dir)) return merged;
  const group = stem.slice(0, cut);
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.startsWith(`${group}-`) || !entry.name.endsWith('.json')) continue;
    const label = entry.name.slice(group.length + 1, entry.name.length - 5);
    if (label === stem.slice(cut + 1)) continue;
    try {
      merged[label] = JSON.parse(fs.readFileSync(path.join(dir, entry.name), 'utf8'));
    } catch {
      // malformed sibling artifact; skip rather than fail this tool's own check
    }
  }
  return merged;
}

function freeze(describe: boolean): void {
  const built = buildAll();
  const file: FixturesFile = {
    schema: 'muju-perft-fixtures-v2',
    ruleset: 'phasing',
    replicaAgreed: false,
    standardInitial: computeStandardInitial(),
    initial: computeInitial('canonical'),
    fixtures: computeFixtures(built, 'canonical'),
  };
  fs.mkdirSync(path.dirname(FIXTURES_PATH), { recursive: true });
  fs.writeFileSync(FIXTURES_PATH, JSON.stringify(file, null, 2) + '\n');
  console.log(`hard:perft --freeze: wrote ${FIXTURES_PATH}`);
  console.log(JSON.stringify(file.initial));
  if (describe) for (const b of built) console.log(JSON.stringify(describeFixture(b)));
}

function gitRevision(): string | null {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

interface Mismatch {
  id: string;
  field: string;
  expected: number | string;
  actual: number | string;
}

function check(out: string, engine: Args['engine'], describe: boolean): void {
  if (!fs.existsSync(FIXTURES_PATH)) {
    throw new Error(`hard:perft --check: no frozen fixtures at ${FIXTURES_PATH}; run --freeze first`);
  }
  const frozen = JSON.parse(fs.readFileSync(FIXTURES_PATH, 'utf8')) as FixturesFile;
  if (frozen.schema !== 'muju-perft-fixtures-v2') {
    throw new Error(`hard:perft --check: ${FIXTURES_PATH} is schema ${String(frozen.schema)}; expected muju-perft-fixtures-v2`);
  }
  const mismatches: Mismatch[] = [];

  const built = buildAll();
  if (describe) for (const b of built) console.log(JSON.stringify(describeFixture(b)));

  // Positions first: a drifted recipe is a different question from a drifted count.
  const frozenById = new Map(frozen.fixtures.map(f => [f.id, f]));
  let digestMismatches = 0;
  for (const b of built) {
    const expected = frozenById.get(b.spec.id);
    if (!expected) continue;
    if (expected.digest !== b.digest) {
      mismatches.push({ id: b.spec.id, field: 'positionDigest', expected: expected.digest, actual: b.digest });
      digestMismatches++;
    }
  }

  const standardInitial = engine === 'canonical' ? computeStandardInitial() : null;
  if (standardInitial) {
    const s = frozen.standardInitial;
    if (standardInitial.actions !== s.actions) mismatches.push({ id: 'standard-initial', field: 'actions', expected: s.actions, actual: standardInitial.actions });
    if (standardInitial.midStates !== s.midStates) mismatches.push({ id: 'standard-initial', field: 'midStates', expected: s.midStates, actual: standardInitial.midStates });
    if (standardInitial.turns !== s.turns) mismatches.push({ id: 'standard-initial', field: 'turns', expected: s.turns, actual: standardInitial.turns });
  }

  const initial = computeInitial(engine);
  if (initial.actions !== frozen.initial.actions) mismatches.push({ id: 'phasing-initial', field: 'actions', expected: frozen.initial.actions, actual: initial.actions });
  if (initial.midStates !== frozen.initial.midStates) mismatches.push({ id: 'phasing-initial', field: 'midStates', expected: frozen.initial.midStates, actual: initial.midStates });
  if (initial.turns !== frozen.initial.turns) mismatches.push({ id: 'phasing-initial', field: 'turns', expected: frozen.initial.turns, actual: initial.turns });

  const fixtures = computeFixtures(built, engine);
  for (const f of fixtures) {
    const expected = frozenById.get(f.id);
    if (!expected) {
      mismatches.push({ id: f.id, field: 'missing-from-frozen-set', expected: -1, actual: -1 });
      continue;
    }
    if (expected.limits.act !== f.limits.act || expected.limits.prepare !== f.limits.prepare) {
      mismatches.push({
        id: f.id,
        field: 'limits',
        expected: `act${expected.limits.act}/prepare${expected.limits.prepare}`,
        actual: `act${f.limits.act}/prepare${f.limits.prepare}`,
      });
    }
    if (expected.actions !== f.actions) mismatches.push({ id: f.id, field: 'actions', expected: expected.actions, actual: f.actions });
    if (expected.midStates !== f.midStates) mismatches.push({ id: f.id, field: 'midStates', expected: expected.midStates, actual: f.midStates });
    if (expected.endPositions !== f.endPositions) mismatches.push({ id: f.id, field: 'endPositions', expected: expected.endPositions, actual: f.endPositions });
  }
  for (const id of frozenById.keys()) {
    if (!fixtures.some(f => f.id === id)) mismatches.push({ id, field: 'missing-from-current-set', expected: -1, actual: -1 });
  }

  const metrics = {
    ruleset: 'phasing' as const,
    /** Canonical Standard facts, kept for the M1 gate row; null under the
     * Phasing-only replica, which cannot pack a Standard state at all. */
    perftActions_initial_4: standardInitial ? standardInitial.actions : null,
    perftMidStates_initial: standardInitial ? standardInitial.midStates : null,
    perftTurns_initial: standardInitial ? standardInitial.turns : null,
    standardTriple: standardInitial ? 'checked' : 'skipped-phasing-replica',
    phasingActions_initial: initial.actions,
    phasingMidStates_initial: initial.midStates,
    phasingTurns_initial: initial.turns,
    phasingInitialLimits: INITIAL_LIMITS,
    fixturesChecked: fixtures.length,
    fixturesMismatch: mismatches.length,
    digestMismatches,
    replicaAgreed: frozen.replicaAgreed,
    mismatches,
    /** Position-corpus sanity number (DESIGN §7.2/§7.5): the 797 census end
     * positions `openings.jsonl` holds, read here since this tool already owns
     * `positions/corpus.ts`. Used by the M1 gate criterion. These openings are
     * STANDARD positions and are not part of the Phasing perft set. */
    openings: fs.existsSync(OPENINGS_PATH) ? readPositions(OPENINGS_PATH).length : 0,
    engine,
    git: gitRevision(),
    node: process.version,
    at: new Date().toISOString(),
  };

  fs.mkdirSync(path.dirname(out), { recursive: true });
  const merged = { ...metrics, perft: metrics, ...siblingMerges(out) };
  fs.writeFileSync(out, JSON.stringify(merged, null, 2) + '\n');
  console.log(`hard:perft --check: wrote ${out}`);
  console.log(JSON.stringify({ ...metrics, mismatches: mismatches.length }));
  if (engine === 'replica' && mismatches.length === 0 && !frozen.replicaAgreed) {
    // Deliberately a log line, not a write: recording agreement is the
    // integrator's call, and a --check that edits its own fixture file would
    // make a green run unreproducible.
    console.log(
      `hard:perft: the replica agreed with all ${fixtures.length} frozen fixtures and the Phasing initial triple. ` +
        `Set "replicaAgreed": true in ${FIXTURES_PATH} to record it.`,
    );
  }
  if (mismatches.length > 0) process.exitCode = 1;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (args.mode === 'freeze') {
    if (args.engine === 'replica') throw new Error('hard:perft --freeze: fixtures are frozen from the canonical engine only');
    freeze(args.describe);
  } else {
    check(args.out, args.engine, args.describe);
  }
}

main();
