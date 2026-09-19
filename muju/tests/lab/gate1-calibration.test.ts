// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AIEngineV2 } from '../../src/ai/engine-v2';
import { SearchBudget } from '../../src/ai/runtime';
import { aiTurnBudgetMs } from '../../src/ai/turnTime';
import { instantiateTactics, type TacticalSolver } from '../../src/ai/wasm/kernel';
import {
  CALIBRATION_AMENDMENT, CALIBRATION_SCHEMA, QUICK_ALLOWANCE_MS, WorkMeter,
  loadCalibration, median, parseArgs, summarizeSamples, type TurnSample,
} from '../../lab/ai/gate1-calibrate';
import { gate1StartState, loadGate1Book } from '../../lab/ai/gate1-openings';

let solver: TacticalSolver;
beforeAll(async () => { solver = await instantiateTactics(readFileSync('src/ai/wasm/tactics.wasm')); });
const book = loadGate1Book();

const manifest = (overrides: Record<string, unknown> = {}) => ({
  schema: CALIBRATION_SCHEMA, amendment: CALIBRATION_AMENDMENT,
  book: { path: 'lab/hard-ai/ladder/openings/p1-dev.jsonl', sha256: 'x' },
  engines: {
    hard: { allowanceMs: 10000, pace: 'quick', ownTurns: 16, medianWorkPerTurn: 53155 },
    medium: { allowanceMs: 3000, pace: 'quick', ownTurns: 16, medianWorkPerTurn: 9000 },
  },
  budgets: { hard: 53155, medium: 9000 },
  ...overrides,
});
function write(value: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), 'gate1-calib-'));
  const path = join(dir, 'calibration.json');
  writeFileSync(path, JSON.stringify(value));
  return path;
}

describe('work meter', () => {
  it('counts exactly the units a fixed-work search is allowed to spend', async () => {
    // `fixedWork` caps the SAME counter the meter reads, so a work-bound search
    // must consume precisely its budget. This is what makes a median measured
    // in WALL mode usable as a fixed-work budget (A3 §3).
    const state = gate1StartState(book.openings[0], 0);
    for (const requested of [200, 900]) {
      const spent = await WorkMeter.around(async meter => {
        const engine = new AIEngineV2('hard');
        engine.setSeed(1); engine.setTacticalSolver(solver);
        engine.setConfig({ fixedWork: requested });
        const result = await engine.findBestAction(state, Infinity);
        expect(result.stats?.stopReason).toBe('work');
        return meter.read();
      });
      expect(spent).toBe(requested);
    }
  });

  it('restores the prototype afterwards and refuses to nest', async () => {
    const before = SearchBudget.prototype.spend;
    const meter = new WorkMeter();
    meter.install();
    expect(() => meter.install()).toThrow(/already installed/);
    meter.uninstall();
    expect(SearchBudget.prototype.spend).toBe(before);
    const budget = new SearchBudget(Infinity, 3);
    expect([budget.spend(), budget.spend(), budget.spend(), budget.spend()]).toEqual([true, true, true, false]);
  });

  it('measures wall-mode work per own turn at the shipped quick allowance', async () => {
    // The allowances A3 names are read from the shipped table, never retyped.
    expect(QUICK_ALLOWANCE_MS).toEqual({ hard: aiTurnBudgetMs('hard', 'quick'), medium: aiTurnBudgetMs('medium', 'quick') });
    expect(QUICK_ALLOWANCE_MS).toEqual({ hard: 10000, medium: 3000 });
    const state = gate1StartState(book.openings[0], 0);
    const spent = await WorkMeter.around(async meter => {
      const engine = new AIEngineV2('medium');
      engine.setSeed(1); engine.setTacticalSolver(solver);
      engine.setConfig({ fixedWork: 0, scaleToBudget: true }); // WALL mode
      const result = await engine.findBestAction(state, QUICK_ALLOWANCE_MS.medium);
      expect(result.stats?.stopReason).not.toBe('work');
      return meter.read();
    });
    // The whole point of the calibration: wall-mode work is far above the 3,000
    // units A1/A2 gave a medium seat for an ENTIRE turn.
    expect(spent).toBeGreaterThan(3000);
  }, 60000);
});

describe('calibration manifest', () => {
  it('summarizes a sample into the median the row will use as its budget', () => {
    const samples: TurnSample[] = [11, 3, 7, 5, 9].map((work, i) => ({
      difficulty: 'hard', opening: `p1-${i}`, handicap: 0, turn: i, seat: 'white',
      work, searchMs: work * 2, searches: 2,
    }));
    const summary = summarizeSamples(samples);
    expect(summary).toMatchObject({ ownTurns: 5, medianWorkPerTurn: 7, minWorkPerTurn: 3, maxWorkPerTurn: 11 });
    expect(median([1, 2, 3, 4])).toBe(3); // even sample: midpoint, rounded to an integer budget
    expect(() => median([])).toThrow();
  });

  it('accepts only a complete A3 calibration of both engines at their shipped pace', () => {
    const good = loadCalibration(write(manifest()));
    expect(good.budgets).toEqual({ hard: 53155, medium: 9000 });
    expect(good.sha256).toMatch(/^[0-9a-f]{64}$/);
    const broken: Record<string, unknown>[] = [
      manifest({ schema: 'something-else' }),
      manifest({ amendment: 'A2' }),
      manifest({ book: { path: 'lab/hard-ai/ladder/openings/p1-val.jsonl' } }),
      manifest({ engines: { hard: manifest().engines.hard } }),
      manifest({ engines: { ...manifest().engines, hard: { ...manifest().engines.hard, allowanceMs: 8000 } } }),
      manifest({ engines: { ...manifest().engines, medium: { ...manifest().engines.medium, pace: 'deep' } } }),
      manifest({ engines: { ...manifest().engines, hard: { ...manifest().engines.hard, ownTurns: 2 } } }),
      manifest({ budgets: { hard: 6000, medium: 3000 } }), // the withdrawn constants are not a calibration
      manifest({ budgets: { hard: 53155, medium: 0 } }),
    ];
    for (const value of broken) expect(() => loadCalibration(write(value))).toThrow();
  });

  it('requires an output directory and positive bounded sample sizes', () => {
    expect(parseArgs(['--out', 'x']).options.turnsPerEngine).toBeGreaterThan(0);
    for (const args of [[], ['--turns', '4'], ['--out', 'x', '--turns', '0'], ['--out', 'x', '--openings', '49'],
      ['--out', 'x', '--out', 'y'], ['--out', 'x', '--what', '1']]) {
      expect(() => parseArgs(args)).toThrow();
    }
  });
});
