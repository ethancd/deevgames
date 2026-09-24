// @vitest-environment node
/**
 * Small-N acceptance copy of `lab/hard-ai/oracles/clock-ledger.ts` (plan
 * W1.3): calls `runClockLedgerOracle` in-process, the way
 * `tests/ai/hard/phasing-economy.test.ts` calls `canonicalPhasingEconomy`
 * directly rather than shelling out to a CLI. `trials: 80` × 2 modes, with
 * 20 crystals added to both banks on every other root so `U`'s investment
 * term is actually exercised, measured at about a second; the CLI at 600
 * trials (`node --import tsx lab/hard-ai/oracles/clock-ledger.ts --trials=600
 * --seed=7 --bank-bonus=20`, and `--seed=11 --bank-bonus=60`) found zero
 * violations over ~1,190 completed kill-free playouts each (review, W1.3).
 */
import { describe, expect, it, vi } from 'vitest';
import { runClockLedgerOracle } from '../../lab/hard-ai/oracles/clock-ledger';

vi.setConfig({ testTimeout: 10_000 });

describe('clock-ledger oracle: U is never exceeded by a kill-free continuation', () => {
  it('random and greedy-mining playouts from 80 sampled roots stay at or below U', () => {
    const report = runClockLedgerOracle({ trials: 80, seed: 2026098, modes: ['random', 'greedy'], bankBonus: 20 });
    expect(report.violations).toEqual([]);
    // Not vacuous: most roots actually produce at least one genuine
    // kill-free-to-the-clock's-end sample worth checking...
    expect(report.rootsSampled).toBeGreaterThan(60);
    expect(report.playoutsCompletedKillFree).toBeGreaterThan(report.rootsSampled);
    // ...and U is tight enough that play actually approaches it somewhere. A
    // bound hundreds of crystals wide (the pre-review catalogue-wide form)
    // passes the violation check for free and fails this.
    expect(report.tightestRatio).toBeGreaterThan(0.5);
    expect(report.tightestRatio).toBeLessThanOrEqual(1);
  });

  it('is deterministic: the same seed reproduces the same counts', () => {
    const a = runClockLedgerOracle({ trials: 40, seed: 99, modes: ['random', 'greedy'], bankBonus: 20 });
    const b = runClockLedgerOracle({ trials: 40, seed: 99, modes: ['random', 'greedy'], bankBonus: 20 });
    expect(b).toEqual(a);
  });
});
