/**
 * `npm run hard:perft -- --freeze | --check [--out <path>] [--engine canonical|replica]`
 * (DESIGN §7.2). Freezes/checks three "initial" numbers plus one `perftActions`
 * regression number per authored fixture (depth chosen per-fixture so the whole
 * run finishes well under the M1 gate's 3-minute budget).
 *
 * `--engine replica` (M5) re-derives every number through the packed replica
 * (`perftReplica`, `src/ai/hard/verify/perft.ts`) and checks it against the
 * SAME frozen fixtures the canonical engine produced, which is the M5 gate's
 * differential: the frozen file IS the canonical answer, so running both
 * engines in one process would only double the work.
 *
 * `--out <dir>/<group>-<label>.json` also folds any sibling
 * `<dir>/<group>-<other>.json` artifact into the written file under
 * `{[other]: ...}`, and nests its own metrics under `perft`. That is the same
 * naming-convention merge `verify/determinism.ts siblingMerges` uses, and it
 * is what lets the M5 gate row — whose chain writes `M5-fuzz.json` and
 * `M5-perft.json` — name a single `artifact` for its criterion to read.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createInitialGameState } from '../../../src/game/board';
import { perftActions, perftMidStates, perftTurns, enumerateTurn, perftReplica } from '../../../src/ai/hard/verify/perft';
import { readPositions } from '../positions/corpus';

const OPENINGS_PATH = path.resolve(import.meta.dirname, '../positions/openings.jsonl');

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');
const FIXTURES_PATH = path.resolve(import.meta.dirname, 'fixtures.json');
const AUTHORED_PATH = path.resolve(import.meta.dirname, '../positions/authored.jsonl');
const DEFAULT_OUT = path.resolve(REPO_ROOT, 'lab/results/hard-ai-verify/perft.json');

interface FixtureRecord {
  id: string;
  depth: number;
  actions: number;
  midStates: number;
  endPositions: number;
}

interface FixturesFile {
  schema: 'muju-perft-fixtures-v1';
  initial: { maxActions: number; actions: number; midStates: number; turns: number };
  fixtures: FixtureRecord[];
}

interface Args {
  mode: 'freeze' | 'check';
  out: string;
  engine: 'canonical' | 'replica';
}

function parseArgs(argv: string[]): Args {
  let mode: Args['mode'] | null = null;
  let out = DEFAULT_OUT;
  let engine: Args['engine'] = 'canonical';
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--freeze') mode = 'freeze';
    else if (a === '--check') mode = 'check';
    else if (a === '--out') out = path.resolve(REPO_ROOT, argv[++i]);
    else if (a === '--engine') engine = argv[++i] as Args['engine'];
    else throw new Error(`hard:perft: unrecognised argument "${a}"`);
  }
  if (!mode) throw new Error('hard:perft: pass --freeze or --check');
  return { mode, out, engine };
}

function computeInitial(engine: Args['engine']): FixturesFile['initial'] {
  const initial = createInitialGameState();
  if (engine === 'replica') {
    const r = perftReplica(initial, 4);
    return { maxActions: 4, actions: r.sequences, midStates: r.midStates, turns: r.endPositions };
  }
  return {
    maxActions: 4,
    actions: perftActions(initial, 4),
    midStates: perftMidStates(initial),
    turns: perftTurns(initial),
  };
}

function computeFixtures(engine: Args['engine']): FixtureRecord[] {
  const positions = readPositions(AUTHORED_PATH);
  return positions.map(p => {
    const depth = p.depth ?? 4;
    const r = engine === 'replica' ? perftReplica(p.state, depth) : enumerateTurn(p.state, depth);
    return { id: p.id, depth, actions: r.sequences, midStates: r.midStates, endPositions: r.endPositions };
  });
}

/**
 * Folds sibling `<group>-<label>.json` artifacts of `outPath` into one object
 * under `{[label]: contents}`. An `--out` with no `-` in its stem (M1's
 * `M1.json`) has no group and merges nothing.
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

function freeze(): void {
  const file: FixturesFile = { schema: 'muju-perft-fixtures-v1', initial: computeInitial('canonical'), fixtures: computeFixtures('canonical') };
  fs.mkdirSync(path.dirname(FIXTURES_PATH), { recursive: true });
  fs.writeFileSync(FIXTURES_PATH, JSON.stringify(file, null, 2) + '\n');
  console.log(`hard:perft --freeze: wrote ${FIXTURES_PATH}`);
  console.log(JSON.stringify(file.initial));
}

function gitRevision(): string | null {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function check(out: string, engine: Args['engine']): void {
  if (!fs.existsSync(FIXTURES_PATH)) {
    throw new Error(`hard:perft --check: no frozen fixtures at ${FIXTURES_PATH}; run --freeze first`);
  }
  const frozen = JSON.parse(fs.readFileSync(FIXTURES_PATH, 'utf8')) as FixturesFile;
  const initial = computeInitial(engine);
  const fixtures = computeFixtures(engine);

  const mismatches: Array<{ id: string; field: string; expected: number; actual: number }> = [];
  if (initial.actions !== frozen.initial.actions) mismatches.push({ id: 'initial', field: 'actions', expected: frozen.initial.actions, actual: initial.actions });
  if (initial.midStates !== frozen.initial.midStates) mismatches.push({ id: 'initial', field: 'midStates', expected: frozen.initial.midStates, actual: initial.midStates });
  if (initial.turns !== frozen.initial.turns) mismatches.push({ id: 'initial', field: 'turns', expected: frozen.initial.turns, actual: initial.turns });

  const frozenById = new Map(frozen.fixtures.map(f => [f.id, f]));
  for (const f of fixtures) {
    const expected = frozenById.get(f.id);
    if (!expected) {
      mismatches.push({ id: f.id, field: 'missing-from-frozen-set', expected: -1, actual: -1 });
      continue;
    }
    if (expected.depth !== f.depth) mismatches.push({ id: f.id, field: 'depth', expected: expected.depth, actual: f.depth });
    if (expected.actions !== f.actions) mismatches.push({ id: f.id, field: 'actions', expected: expected.actions, actual: f.actions });
    if (expected.midStates !== f.midStates) mismatches.push({ id: f.id, field: 'midStates', expected: expected.midStates, actual: f.midStates });
    if (expected.endPositions !== f.endPositions) mismatches.push({ id: f.id, field: 'endPositions', expected: expected.endPositions, actual: f.endPositions });
  }
  for (const id of frozenById.keys()) {
    if (!fixtures.some(f => f.id === id)) mismatches.push({ id, field: 'missing-from-current-set', expected: -1, actual: -1 });
  }

  const metrics = {
    perftActions_initial_4: initial.actions,
    perftMidStates_initial: initial.midStates,
    perftTurns_initial: initial.turns,
    fixturesChecked: fixtures.length,
    fixturesMismatch: mismatches.length,
    mismatches,
    /** Position-corpus sanity number (DESIGN §7.2/§7.5): the 797 census end
     * positions `openings.jsonl` holds, read here since this tool already
     * owns `positions/corpus.ts`. Used by the M1 gate criterion. */
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
  if (mismatches.length > 0) process.exitCode = 1;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (args.mode === 'freeze') {
    if (args.engine === 'replica') throw new Error('hard:perft --freeze: fixtures are frozen from the canonical engine only');
    freeze();
  } else {
    check(args.out, args.engine);
  }
}

main();
