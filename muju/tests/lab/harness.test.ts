// @vitest-environment node
import { INITIAL_MAP_RESOURCES } from '../../src/game/resourceMap';
import { describe, it, expect } from 'vitest';
import { playGame } from '../../lab/harness/runner';
import { createBot, botNames } from '../../lab/harness/bots/index';
import { summarize } from '../../lab/harness/summary';
import { wilson } from '../../lab/harness/stats';
import type { GameRecord } from '../../lab/harness/types';

/**
 * Harness regression tests: the lab's measurement instrument must stay
 * deterministic, invariant-checked, and legality-enforcing. Scripted bots
 * only (fast); engine-bot behavior is covered by calibration runs (P3).
 */

async function run(white: string, black: string, seed: number): Promise<GameRecord> {
  const { record } = await playGame({
    bots: { white: createBot(white), black: createBot(black) },
    seed,
    engineHash: 'test',
    runId: 'test',
    options: { recordReplay: false },
  });
  return record;
}

describe('lab harness', () => {
  it('completes scripted games without invariant violations or anomalies', async () => {
    const scripted = ['Random', 'Greedy', 'Rush', 'Expand', 'Balanced', 'Turtle', 'Tier1Spam', 'MiningDenial', 'AntiRush'];
    for (const bot of scripted) {
      const record = await run(bot, 'Random', 1000 + scripted.indexOf(bot));
      expect(record.invariantViolation, `${bot}: invariant`).toBeNull();
      expect(record.winType).not.toBe('invariant-violation');
      expect(record.players.white.illegalActions, `${bot}: scripted bots cannot cheat`).toBe(0);
      expect(record.turns).toBeGreaterThan(0);
    }
  }, 60000);

  it('is deterministic per seed for scripted pairings', async () => {
    const a = await run('Rush', 'AntiRush', 777);
    const b = await run('Rush', 'AntiRush', 777);
    expect(a.winner).toBe(b.winner);
    expect(a.winType).toBe(b.winType);
    expect(a.turns).toBe(b.turns);
    expect(a.plies).toBe(b.plies);
    expect(a.players.white.unitsKilled).toBe(b.players.white.unitsKilled);
    expect(a.materialCurve).toEqual(b.materialCurve);
  }, 30000);

  it('records settled income, finite reserves and tier-one purchases without changing accounting', async () => {
    const record = await run('Balanced', 'Rush', 260909);
    expect(record.invariantViolation).toBeNull();
    expect(record.players.white.illegalActions + record.players.black.illegalActions).toBe(0);
    const totals = { white: 0, black: 0 };
    for (const sample of record.incomeCurve) {
      totals[sample.player] += sample.income;
      expect(sample.remaining + totals.white + totals.black).toBe(INITIAL_MAP_RESOURCES);
      expect(Object.values(sample.byTier).reduce((a, b) => a + b, 0)).toBe(sample.income);
      expect(Object.values(sample.byElement).reduce((a, b) => a + b, 0)).toBe(sample.income);
      expect(sample.bank).toBeGreaterThanOrEqual(0);
      expect(sample.tier1Share).toBeGreaterThanOrEqual(0);
      expect(sample.tier1Share).toBeLessThanOrEqual(1);
    }
    expect(record.incomeCurve.length).toBeGreaterThan(2);
    expect(record.purchases.length).toBeGreaterThan(0);
    expect(record.purchases.every(p => p.definitionId.endsWith('_1'))).toBe(true);
    expect(record.round90Exhaustion).toBe(record.incomeCurve.find(s => s.remaining <= 52)?.turn ?? null);
  });

  it('varies across seeds', async () => {
    const a = await run('Random', 'Random', 1);
    const b = await run('Random', 'Random', 2);
    expect(a.plies === b.plies && a.turns === b.turns && a.winner === b.winner).toBe(false);
  }, 30000);

  it('adjudicates capped games by material+stockpile', async () => {
    const { record } = await playGame({
      bots: { white: createBot('Turtle'), black: createBot('Turtle') },
      seed: 99,
      engineHash: 'test',
      runId: 'test',
      options: { maxTurns: 5, recordReplay: false },
    });
    expect(['adjudication', 'draw']).toContain(record.winType);
    expect(record.turns).toBeLessThanOrEqual(6);
  }, 30000);

  it('records replays with full snapshots', async () => {
    const { replay } = await playGame({
      bots: { white: createBot('Greedy'), black: createBot('Random') },
      seed: 5,
      engineHash: 'test',
      runId: 'test',
      options: { recordReplay: true },
    });
    expect(replay).not.toBeNull();
    expect(replay!.steps.length).toBeGreaterThan(2);
    expect(replay!.steps[0].action).toBeNull(); // initial position
    for (const step of replay!.steps) {
      expect(step.cells).toHaveLength(100);
      expect(step.res.white.r).toBeGreaterThanOrEqual(0);
    }
  }, 30000);

  it('summarizes pairings with Wilson CIs', async () => {
    const records = [await run('Greedy', 'Random', 1), await run('Random', 'Greedy', 2)];
    const rows = summarize(records);
    expect(rows).toHaveLength(1);
    expect(rows[0].games).toBe(2);
    expect(rows[0].gamesAasWhite + rows[0].gamesAasBlack).toBe(2);
  }, 30000);

  it('wilson interval behaves sanely', () => {
    const ci = wilson(50, 100);
    expect(ci.p).toBeCloseTo(0.5);
    expect(ci.lo).toBeGreaterThan(0.39);
    expect(ci.hi).toBeLessThan(0.61);
    expect(wilson(0, 0).p).toBeNaN();
  });

  it('exposes all ladder and probe bots in the registry', () => {
    const names = botNames();
    for (const required of ['Random', 'Greedy', 'Rush', 'Expand', 'Balanced', 'Turtle', 'Tier1Spam', 'MiningDenial', 'AntiRush', 'AIv2-hard-fast']) {
      expect(names).toContain(required);
    }
  });
});
