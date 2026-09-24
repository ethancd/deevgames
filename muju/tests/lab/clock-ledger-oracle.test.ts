// @vitest-environment node
/**
 * Small-N acceptance copy of `lab/hard-ai/oracles/clock-ledger.ts` (plan
 * W1.3): calls `runClockLedgerOracle` in-process, the way
 * `tests/ai/hard/phasing-economy.test.ts` calls `canonicalPhasingEconomy`
 * directly rather than shelling out to a CLI. `trials: 80` × 2 modes was
 * measured at well under a second on this machine (the full CLI run at 600
 * trials — `node --import tsx lab/hard-ai/oracles/clock-ledger.ts
 * --trials=600 --seed=7` — took ~6s and found zero violations across 1,172
 * completed kill-free playouts), so this copy keeps the "a few seconds"
 * budget with headroom.
 */
import { describe, expect, it, vi } from 'vitest';
import { runClockLedgerOracle } from '../../lab/hard-ai/oracles/clock-ledger';

vi.setConfig({ testTimeout: 10_000 });

describe('clock-ledger oracle: U is never exceeded by a kill-free continuation', () => {
  it('random and greedy-mining playouts from 80 sampled roots stay at or below U', () => {
    const report = runClockLedgerOracle({ trials: 80, seed: 2026098, modes: ['random', 'greedy'] });
    expect(report.violations).toEqual([]);
    // Not vacuous: most roots actually produce at least one genuine
    // kill-free-to-the-clock's-end sample worth checking.
    expect(report.rootsSampled).toBeGreaterThan(60);
    expect(report.playoutsCompletedKillFree).toBeGreaterThan(report.rootsSampled);
  });

  it('is deterministic: the same seed reproduces the same counts', () => {
    const a = runClockLedgerOracle({ trials: 40, seed: 99, modes: ['random', 'greedy'] });
    const b = runClockLedgerOracle({ trials: 40, seed: 99, modes: ['random', 'greedy'] });
    expect(b).toEqual(a);
  });
});
