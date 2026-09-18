/**
 * E3.1 lane 4 — `lab/hard-ai/audit/eval-audit.ts`.
 *
 * Three things are pinned here and nothing else:
 *
 *   1. SIDE-SWAP ANTISYMMETRY on a hand-built asymmetric position. `extract`
 *      writes `f(me) − f(them)` (DESIGN §5.12.1), so every one of the 58
 *      features must negate when the root changes seats. The fixture is
 *      deliberately lopsided — two white units against one black one, unequal
 *      banks — so a vector of zeroes cannot pass the check vacuously, and the
 *      test asserts that too.
 *   2. THE GROUP SUMS PARTITION THE SCORE. `eval-groups.ts` (coordinator-owned)
 *      claims every feature sits in exactly one of five groups; the five sums
 *      and the three stage sums must therefore each add up to `full()`'s
 *      return, position by position.
 *   3. A CLI SMOKE on five positions into a temp directory: `main` writes the
 *      four artifacts and `summary.json` reports what it measured. `main` is
 *      called in-process rather than spawned: the argument vector, the loader,
 *      the measurement and the writer are the same code either way, and a `tsx`
 *      child costs a second per case for nothing.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { GameState, PlayerId, Unit } from '../../src/game/types';
import { createInitialGameState } from '../../src/game/board';
import { createUnitFromDefinition } from '../../src/game/building';
import { FEATURE_COUNT, FEATURE_NAMES, STAGE_OF } from '../../src/ai/hard/eval/features';
import { DEFAULT_WEIGHTS } from '../../src/ai/hard/eval/weights';
import { EVAL_GROUP_NAMES } from '../../lab/hard-ai/audit/eval-groups';
import { loadPositionFile, type AuditItem } from '../../lab/hard-ai/audit/eval-corpus';
import { main, measure, newCtx, parseArgs, runAudit } from '../../lab/hard-ai/audit/eval-audit';
import { DEFAULT_RULES } from '../../lab/hard-ai/positions/corpus';

const REPO = path.resolve(__dirname, '../..');
const ECONOMY = path.join(REPO, 'lab/hard-ai/positions/economy.jsonl');

const tmpDirs: string[] = [];
function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'muju-eval-audit-'));
  tmpDirs.push(dir);
  return dir;
}
afterAll(() => {
  for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
});

let seq = 0;
function unit(defId: string, owner: PlayerId, x: number, y: number): Unit {
  const u = createUnitFromDefinition(defId, owner, { x, y }, `ea-${owner}-${defId}-${seq++}`);
  return { ...u, placedThisTurn: false, promotedThisPlacement: false, canActThisTurn: true };
}

/** Lopsided on purpose: material, bank, rent and geometry all differ by side. */
function lopsidedState(): GameState {
  const base = createInitialGameState();
  const units: Unit[] = [
    unit('fire_2', 'white', 2, 2),
    unit('water_1', 'white', 4, 3),
    unit('plant_1', 'black', 7, 7),
  ];
  return {
    ...base,
    board: { ...base.board, units },
    turn: { ...base.turn, currentPlayer: 'white', turnNumber: 5, phase: 'action', actionsRemaining: 4 },
    players: {
      white: { ...base.players.white, resources: 11 },
      black: { ...base.players.black, resources: 2 },
    },
  };
}

function lopsidedItem(): AuditItem {
  return {
    id: 'lopsided-white-to-move',
    source: '(test fixture)',
    kind: 'position',
    bucket: 'corpus',
    rules: DEFAULT_RULES,
    state: lopsidedState(),
    tags: [],
  };
}

describe('eval-audit: side-swap antisymmetry', () => {
  it('negates every one of the 58 features when the root changes seats', () => {
    const rec = measure(newCtx(), lopsidedItem());
    expect(rec.side).toBe(0);
    // Not vacuous: the fixture moves a good number of features off zero.
    const nonzero = rec.f.filter(v => v !== 0).length;
    expect(nonzero).toBeGreaterThan(10);
    expect(rec.sideSwapBad.map(i => FEATURE_NAMES[i])).toEqual([]);
    expect(rec.scoreOther).toBe(-rec.score);
  });

  it('leaves the feature vector unchanged under a 180-degree rotation with the seats swapped', () => {
    const rec = measure(newCtx(), lopsidedItem());
    expect(rec.rot180Bad).not.toBeNull();
    expect((rec.rot180Bad ?? []).map(i => FEATURE_NAMES[i])).toEqual([]);
  });
});

describe('eval-audit: the sums add up', () => {
  const ctx = newCtx();
  const items = loadPositionFile(ECONOMY).slice(0, 20);

  it('reads the economy corpus', () => {
    expect(items.length).toBe(20);
  });

  it('partitions full() into the five eval-groups and the three stages', () => {
    for (const item of items) {
      const rec = measure(ctx, item);
      let groups = 0;
      for (const g of EVAL_GROUP_NAMES) groups += rec.groupSums[g];
      expect(`${item.id}:${groups}`).toBe(`${item.id}:${rec.score}`);
      const stages = rec.stageSums[0] + rec.stageSums[1] + rec.stageSums[2];
      expect(`${item.id}:${stages}`).toBe(`${item.id}:${rec.score}`);
      expect(`${item.id}:${rec.sumWf}`).toBe(`${item.id}:${rec.score}`);
    }
  });

  it('agrees with the evaluator’s own stage returns, material block included', () => {
    for (const item of items) {
      const rec = measure(ctx, item);
      const staged = rec.stageReturns[0] + rec.stageReturns[1] + rec.stageReturns[2];
      expect(`${item.id}:${staged}`).toBe(`${item.id}:${rec.score}`);
      // `stage0` scores Material from the 18 `w.material` params, `extract`
      // writes the catalogue prior; with DEFAULT_WEIGHTS the two agree exactly.
      expect(`${item.id}:${rec.materialResidual}`).toBe(`${item.id}:0`);
    }
  });

  it('weights every feature the same way the artifact reports it', () => {
    const rec = measure(ctx, items[0]);
    for (let i = 0; i < FEATURE_COUNT; i++) {
      expect(rec.c[i]).toBe(DEFAULT_WEIGHTS.w[i] * rec.f[i]);
      expect(STAGE_OF[i]).toBeLessThanOrEqual(2);
    }
  });
});

describe('eval-audit: CLI', () => {
  it('rejects a call with no input and a call with no --out', () => {
    expect(() => parseArgs(['--out', 'x'])).toThrow(/at least one/);
    expect(() => parseArgs(['--positions', ECONOMY])).toThrow(/--out/);
    expect(() => parseArgs(['--positions'])).toThrow(/needs a value/);
    expect(() => parseArgs(['--nope'])).toThrow(/unknown argument/);
  });

  it('names the corpus after the last segment of --out when none is given', () => {
    const args = parseArgs(['--positions', ECONOMY, '--out', '/tmp/whatever/openings']);
    expect(args.corpus).toBe('openings');
    expect(args.limit).toBe(500);
    expect(args.reps).toBe(5);
  });

  it('writes summary.json, summary.md, features.jsonl and violations.json for five positions', () => {
    const dir = tmpDir();
    const five = path.join(dir, 'five.jsonl');
    const lines = fs.readFileSync(ECONOMY, 'utf8').split('\n').filter(l => l.trim().length > 0).slice(0, 5);
    fs.writeFileSync(five, lines.join('\n') + '\n');
    const out = path.join(dir, 'eval-audit', 'five');

    main(['--positions', five, '--out', out, '--reps', '1', '--limit', '3', '--corpus', 'five']);

    expect(fs.readdirSync(out).sort()).toEqual(['features.jsonl', 'summary.json', 'summary.md', 'violations.json']);
    const summary = JSON.parse(fs.readFileSync(path.join(out, 'summary.json'), 'utf8')) as Record<string, unknown>;
    expect(summary.positionsMeasured).toBe(5);
    expect(summary.positionsSkipped).toBe(0);
    expect(summary.corpus).toBe('five');
    expect((summary.weights as { version: number }).version).not.toBe(0);
    expect((summary.features as unknown[]).length).toBe(FEATURE_COUNT);
    expect((summary.groups as unknown[]).length).toBe(EVAL_GROUP_NAMES.length);

    // `--limit 3` caps the per-position vectors, not the measurement.
    const rows = fs.readFileSync(path.join(out, 'features.jsonl'), 'utf8').trim().split('\n');
    expect(rows.length).toBe(3);
    const first = JSON.parse(rows[0]) as { f: number[]; c: number[] };
    expect(first.f.length).toBe(FEATURE_COUNT);
    expect(first.c.length).toBe(FEATURE_COUNT);

    const md = fs.readFileSync(path.join(out, 'summary.md'), 'utf8');
    expect(md).toContain('# hard:eval-audit — five');
    expect(md).toContain('## Features that never fire');

    const violations = JSON.parse(fs.readFileSync(path.join(out, 'violations.json'), 'utf8')) as {
      sideSwap: { checked: number };
      scoreIdentity: { mismatches: number };
    };
    expect(violations.sideSwap.checked).toBe(5);
    expect(violations.scoreIdentity.mismatches).toBe(0);
  });

  it('reports the loss roots of an exam file as their own bucket', () => {
    const dir = tmpDir();
    const cases = path.join(REPO, 'lab/hard-ai/exam/cases/dev.jsonl');
    const lines = fs.readFileSync(cases, 'utf8').split('\n').filter(l => l.trim().length > 0);
    const loss = lines.filter(l => (JSON.parse(l) as { source: { kind: string } }).source.kind === 'loss').slice(0, 2);
    const authored = lines.filter(l => (JSON.parse(l) as { source: { kind: string } }).source.kind !== 'loss').slice(0, 2);
    const file = path.join(dir, 'mixed.jsonl');
    fs.writeFileSync(file, [...loss, ...authored].join('\n') + '\n');

    const result = runAudit(parseArgs(['--exam', file, '--out', path.join(dir, 'x'), '--reps', '1']));
    expect(result.summary.positionsMeasured).toBe(4);
    expect(result.summary.buckets).toEqual({ 'loss-root': 2, authored: 2 });
    expect((result.summary.lossRoots as { n: number }).n).toBe(2);
  });
});
