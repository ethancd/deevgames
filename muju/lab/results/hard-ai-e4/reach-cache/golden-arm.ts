/**
 * E4.3 candidate C (lane 8): the OUTPUT-IDENTITY proof for
 * `hard@ablate:search-reach-cache`.
 *
 * `node --import tsx lab/results/hard-ai-e4/reach-cache/golden-arm.ts
 *   [--arm hard@ablate:search-reach-cache] [--states <frozen.json>]
 *   [--ref <golden.json>] [--out <file>]`
 *
 * The candidate is a pure optimisation, so its bar is not "no regression" but
 * EQUALITY: the same 24 positions × 2 rungs `lab/hard-ai/verify/cross-commit.ts`
 * runs, searched with the arm's configuration, must produce the champion's own
 * golden rows on `scoreCc`, `depth`, `work`, `nodes`, `endKey` and `source`,
 * keyed by `positionId` + `rung`. One differing row would mean the memo
 * returned something the BFS it replaced would not have, and the candidate
 * would be dead rather than slow.
 *
 * The positions are the FROZEN states `cross-commit.ts --states-out` wrote in
 * the same session as the reference rows (`states.json` beside this file), read
 * back exactly as `--states-in` reads them — the E4 plan's rule that a golden
 * compares searches and never position-building code, and the reason this file
 * does not import `cross-commit.ts` at run time (that module runs its own
 * `main()` on import; only its row TYPE is imported here, which erases). The
 * one thing that differs from the reference run is the engine:
 * `hardEnginePatch(arm)` instead of a bare `new HardEngine()`, with a FRESH
 * engine per search so no transposition table, ordering history or memo carries
 * between rows. The memo's own hit counters are NOT read here — a memo that
 * never hit would also pass this test, which is the point: identity is proved
 * separately from usefulness.
 */
import fs from 'node:fs';
import path from 'node:path';
import { HardEngine } from '../../../../src/ai/hard/engine';
import { withMatchRules } from '../../../hard-ai/analyze/replay';
import type { GoldenRow } from '../../../hard-ai/verify/cross-commit';
import { hardEnginePatch } from '../../../hard-ai/bots/hard';
import { resolvedConfigHash } from '../../../hard-ai/ladder/identity';
import type { GameState } from '../../../../src/game/types';
import type { MatchOptions } from '../../../harness/types';

const REPO = path.resolve(import.meta.dirname, '../../../..');
const RUNGS: readonly number[] = [100_000, 400_000];
const FIELDS = ['scoreCc', 'depth', 'work', 'nodes', 'endKey', 'source'] as const;
const DEFAULT_REF = 'lab/results/hard-ai-e3/correct/cross-commit/rows-head-c73204dd.json';
const DEFAULT_STATES = 'lab/results/hard-ai-e4/reach-cache/states.json';

interface Target {
  id: string;
  state: GameState;
  options: MatchOptions | null;
}

async function run(target: Target, patch: Record<string, unknown>): Promise<GoldenRow[]> {
  const rows: GoldenRow[] = [];
  for (const rung of RUNGS) {
    const engine = new HardEngine(patch);
    const r = await engine.searchTurn(target.state, { work: rung });
    rows.push({
      positionId: target.id,
      rung,
      actions: JSON.stringify(r.actions),
      scoreCc: r.scoreCc,
      depth: r.depth,
      work: r.work,
      nodes: r.stats.nodes,
      endKey: r.endKey,
      source: r.source,
    });
  }
  return rows;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const flag = (name: string): string | null => {
    const at = args.indexOf(name);
    return at >= 0 ? (args[at + 1] ?? null) : null;
  };
  const arm = flag('--arm') ?? 'hard@ablate:search-reach-cache';
  const refPath = path.resolve(REPO, flag('--ref') ?? DEFAULT_REF);
  const statesPath = path.resolve(REPO, flag('--states') ?? DEFAULT_STATES);
  const out = flag('--out');

  const patch = hardEnginePatch(arm.replace(/^hard@/, '')) as unknown as Record<string, unknown>;
  const targets = JSON.parse(fs.readFileSync(statesPath, 'utf8')) as Target[];
  const startedAt = Date.now();
  const rows: GoldenRow[] = [];
  for (const t of targets) {
    const got = t.options === null ? await run(t, patch) : await withMatchRules(t.options, async () => run(t, patch));
    rows.push(...got);
  }

  const ref = JSON.parse(fs.readFileSync(refPath, 'utf8')) as { rows: GoldenRow[] };
  const byKey = new Map(ref.rows.map(r => [`${r.positionId}|${r.rung}`, r]));
  const differing: Array<{ key: string; fields: string[] }> = [];
  let identical = 0;
  for (const r of rows) {
    const key = `${r.positionId}|${r.rung}`;
    const want = byKey.get(key);
    if (want === undefined) {
      differing.push({ key, fields: ['MISSING FROM REFERENCE'] });
      continue;
    }
    const fields = FIELDS.filter(f => r[f] !== want[f]);
    if (fields.length === 0) identical++;
    else differing.push({ key, fields: [...fields] });
  }

  const artifact = {
    schema: 'muju-hard-ai-e4-reach-cache-golden-v1',
    arm,
    armConfigHash: resolvedConfigHash(arm, { mode: 'fixed', units: 100_000 }),
    championConfigHash: resolvedConfigHash('hard@desktop', { mode: 'wall', ms: 3000 }),
    reference: path.relative(REPO, refPath),
    states: path.relative(REPO, statesPath),
    fields: [...FIELDS],
    positions: targets.length,
    rungs: [...RUNGS],
    identical,
    compared: rows.length,
    differing,
    elapsedMs: Date.now() - startedAt,
    at: new Date().toISOString(),
    rows,
  };
  const text = `${JSON.stringify(artifact, null, 1)}\n`;
  if (out === null) process.stdout.write(text);
  else {
    fs.mkdirSync(path.dirname(path.resolve(REPO, out)), { recursive: true });
    fs.writeFileSync(path.resolve(REPO, out), text);
  }
  console.log(`${arm}: ${identical}/${rows.length} rows identical to ${path.relative(REPO, refPath)} on ${FIELDS.join(', ')}`);
  if (differing.length > 0) {
    console.log(JSON.stringify(differing, null, 1));
    process.exitCode = 1;
  }
}

void main();
