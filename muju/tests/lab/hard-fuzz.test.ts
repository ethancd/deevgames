// @vitest-environment node
/**
 * Unit-level cover for the Phasing differential fuzzer
 * (`lab/hard-ai/fuzz/differential.ts`, M2). `npm run hard:fuzz` runs it at
 * 100,000 actions; this file runs the same code at a tiny budget so a broken
 * SURFACE (rather than a broken replica) is caught by `npm test`.
 *
 * Two things are asserted, because either alone is worthless:
 *   1. the surfaces report no divergence against the canonical engine, and
 *   2. they actually reached the Phasing-specific state — commitments bought,
 *      summons arrived, costs refunded, both planes non-empty at once. A fuzzer
 *      that never buys proves nothing, so "zero mismatches" is only meaningful
 *      next to non-zero coverage counters.
 */
import { describe, expect, it, vi } from 'vitest';
import { runArrivalSurface, runFuzz, type Surface } from '../../lab/hard-ai/fuzz/differential';

vi.setConfig({ testTimeout: 60_000 });

const SURFACES: ReadonlySet<Surface> = new Set<Surface>(['transition', 'legality']);

describe('differential fuzzer: transition + legality surfaces (Phasing)', () => {
  const metrics = runFuzz({
    seed: 4242,
    actions: 4000,
    surfaces: SURFACES,
    legalityEvery: 4,
    resignRate: 0.01,
    plies: 500,
    reproDir: null,
    sample: 0,
  }).metrics;

  it('walks Phasing games and applies the whole action budget', () => {
    expect(metrics.ruleset).toBe('phasing');
    expect(metrics.actions).toBe(4000);
    expect(metrics.games).toBeGreaterThan(2);
    expect(metrics.legalityChecks).toBeGreaterThan(100);
  });

  it('reports no divergence on any compared field', () => {
    expect(metrics.divergences).toBe(0);
    expect(metrics.legalitySetMismatches).toBe(0);
    expect(metrics.pendingLegalityMismatches).toBe(0);
    expect(metrics.unmakeMismatches).toBe(0);
    expect(metrics.rehashMismatches).toBe(0);
    expect(metrics.roundTripMismatches).toBe(0);
    expect(metrics.invariantViolations).toBe(0);
  });

  it('actually exercised commitments: buys, arrivals, refunds and both planes at once', () => {
    expect(metrics.buys).toBeGreaterThan(20);
    expect(metrics.arrivals).toBeGreaterThan(20);
    expect(metrics.refunds).toBeGreaterThan(0);
    expect(metrics.gamesWithArrival).toBeGreaterThan(0);
    expect(metrics.gamesWithRefund).toBeGreaterThan(0);
    expect(metrics.arrivalRefundGameFraction).toBeGreaterThan(0);
    expect(metrics.bothSidesPendingPlies).toBeGreaterThan(0);
    // The commitment probes (BUY on an own commitment square; a commitment never
    // occupying a square) only run when the mover holds a commitment.
    expect(metrics.pendingLegalityChecks).toBeGreaterThan(0);
  });

  it('reaches several rules configurations and real terminals', () => {
    expect(metrics.handicapGames + metrics.eliminationRuleGames + metrics.reviewUpkeepGames).toBeGreaterThan(0);
    expect(Object.keys(metrics.terminals).length).toBeGreaterThan(0);
  });

  it('the terminal histogram names the ACTION that ended each game, and RESIGN fires', () => {
    // `terminals` is what a coverage claim about a terminal branch is checked
    // against, so its shape is pinned: `<reason>:<winner|draw>@<action>`. The action
    // suffix is the only thing that separates an elimination at an ATTACK from one
    // at the hand-off, which canonical gives the same `victoryReason`.
    for (const key of Object.keys(metrics.terminals)) {
      if (key === 'unfinished') continue;
      expect(key, key).toMatch(/^[a-z-]+:(white|black|draw)@[A-Z_]+$/);
    }
    // RESIGN is injected by the walk rather than generated, so a walk with a
    // non-zero `resignRate` must actually reach the resignation terminal.
    expect(Object.keys(metrics.terminals).some(k => k.endsWith('@RESIGN'))).toBe(true);
    expect(metrics.resignRate).toBe(0.01);
  });

  it('runs check() on every action only when the legality cadence is 1', () => {
    // The expensive `Replica.check` sweep is cadenced with the rehash sweep (every
    // 64 actions) unless `--legality-every 1` asks for the comparison on every
    // action, in which case it is part of it.
    const dense = runFuzz({
      seed: 909,
      actions: 400,
      surfaces: SURFACES,
      legalityEvery: 1,
      resignRate: 0,
      plies: 500,
      reproDir: null,
      sample: 0,
    }).metrics;
    expect(dense.stateChecks).toBe(dense.actions);
    expect(dense.divergences).toBe(0);
    expect(dense.rehashMismatches).toBe(0);

    const sparse = runFuzz({
      seed: 909,
      actions: 400,
      surfaces: SURFACES,
      legalityEvery: 8,
      resignRate: 0,
      plies: 500,
      reproDir: null,
      sample: 0,
    }).metrics;
    expect(sparse.stateChecks).toBeLessThan(sparse.actions / 32);
  });

  it('is deterministic for a given seed', () => {
    const again = runFuzz({
      seed: 4242,
      actions: 4000,
      surfaces: SURFACES,
      legalityEvery: 4,
      resignRate: 0.01,
      plies: 500,
      reproDir: null,
      sample: 0,
    }).metrics;
    expect({ ...again, elapsedMs: 0 }).toEqual({ ...metrics, elapsedMs: 0 });
  });
});

describe('differential fuzzer: arrival surface', () => {
  const metrics = runArrivalSurface({ seed: 99, cases: 120, plies: 120, reproDir: null });

  it('builds usable positions with commitments on both sides', () => {
    expect(metrics.cases).toBeGreaterThan(100);
    expect(metrics.withCommitments).toBeGreaterThan(80);
    expect(metrics.casesWithBothSidesPending).toBeGreaterThan(50);
    expect(Object.keys(metrics.intrusions).length).toBeGreaterThan(3);
  });

  it('produces both arrivals and refunds', () => {
    expect(metrics.casesWithArrival).toBeGreaterThan(10);
    expect(metrics.casesWithRefund).toBeGreaterThan(10);
    expect(metrics.casesWithBoth).toBeGreaterThan(0);
  });

  it('also covers the hand-off that ends the game before commitments resolve', () => {
    // `handOffTurn` runs the inactivity draw test and `startTurn` adjudicates
    // home occupation and elimination, all before `resolveSummons`; on those
    // hand-offs both planes must survive untouched.
    expect(metrics.terminalHandoffs).toBeGreaterThan(0);
  });

  it('agrees with the canonical hand-off on every compared field', () => {
    expect(metrics.transitionMismatches).toBe(0);
    expect(metrics.unmakeMismatches).toBe(0);
    expect(metrics.rehashMismatches).toBe(0);
    expect(metrics.roundTripMismatches).toBe(0);
    expect(metrics.arrivalFlagMismatches).toBe(0);
    expect(metrics.refundBankMismatches).toBe(0);
    expect(metrics.planeNotClearedMismatches).toBe(0);
    expect(metrics.survivorMismatches).toBe(0);
  });

  it('is deterministic for a given seed', () => {
    const again = runArrivalSurface({ seed: 99, cases: 120, plies: 120, reproDir: null });
    expect({ ...again, elapsedMs: 0 }).toEqual({ ...metrics, elapsedMs: 0 });
  });
});
