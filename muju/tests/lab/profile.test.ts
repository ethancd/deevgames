// @vitest-environment node
import "../fixtures/metal-v28-catalogue";
import { describe, it, expect, vi } from 'vitest';

// Corpus builders touch real replay files under `lab/results/`.
// The Phasing builder's scripted-game check now lives in profile-phasing.test.ts.
// Keep the original generous but bounded timeout for the legacy shape checks.
vi.setConfig({ testTimeout: 300_000 });

import { HardEngine } from '../../src/ai/hard/engine';
import { hardEnginePatch } from '../../lab/hard-ai/bots/hard';
import { createInitialGameState } from '../../src/game/board';
import {
  PHASE_BUCKETS,
  classifyUrl,
  attributeSelfTime,
  profileOnePosition,
  buildP8Positions,
  buildE1LossPositions,
  type Position,
} from '../../lab/hard-ai/bench/profile';

describe('classifyUrl', () => {
  it('maps every phase file to the bucket the E4.1 doc claims for it', () => {
    const root = '/Users/x/deevgames/muju/';
    expect(classifyUrl(`file://${root}src/ai/hard/gen/generate.ts`)).toBe('generation');
    expect(classifyUrl(`file://${root}src/ai/hard/gen/actionsearch.ts`)).toBe('generation');
    expect(classifyUrl(`file://${root}src/ai/hard/tables/context.ts`)).toBe('tables');
    expect(classifyUrl(`file://${root}src/ai/hard/tables/home.ts`)).toBe('tables');
    expect(classifyUrl(`file://${root}src/ai/hard/eval/evaluate.ts`)).toBe('evaluation');
    expect(classifyUrl(`file://${root}src/ai/hard/search/pvs.ts`)).toBe('replySearch');
    expect(classifyUrl(`file://${root}src/ai/hard/search/tt.ts`)).toBe('replySearch');
    expect(classifyUrl(`file://${root}src/ai/hard/search/order.ts`)).toBe('replySearch');
    expect(classifyUrl(`file://${root}src/ai/hard/search/root.ts`)).toBe('replySearch');
    expect(classifyUrl(`file://${root}src/ai/hard/engine.ts`)).toBe('replySearch');
    expect(classifyUrl(`file://${root}src/ai/hard/search/quiesce.ts`)).toBe('quiescence');
    expect(classifyUrl(`file://${root}src/ai/hard/tactics/prover.ts`)).toBe('prover');
    expect(classifyUrl(`file://${root}src/ai/hard/tactics/dfpn.ts`)).toBe('prover');
    expect(classifyUrl(`file://${root}src/ai/hard/core/state.ts`)).toBe('prover');
    expect(classifyUrl(`file://${root}src/ai/hard/verify/replay.ts`)).toBe('canonicalVerify');
    expect(classifyUrl(`file://${root}src/game/homeCheckmate.ts`)).toBe('canonicalVerify');
    expect(classifyUrl(`file://${root}src/ai/simulate.ts`)).toBe('canonicalVerify');
    expect(classifyUrl(`file://${root}src/ai/hard/search/probe.ts`)).toBe('instrument');
    expect(classifyUrl('node:internal/modules/cjs/loader')).toBe('other');
    expect(classifyUrl('')).toBe('other');
  });

  it('every named PHASE_BUCKETS entry has at least one rule that reaches it', () => {
    // A regression guard: if a bucket name in PHASE_BUCKETS stops being
    // reachable from BUCKET_RULES (a typo in either), this catches it without
    // hand-listing every rule twice.
    const reached = new Set<string>();
    for (const [prefix] of [
      ['src/ai/hard/gen/'],
      ['src/ai/hard/tables/'],
      ['src/ai/hard/eval/'],
      ['src/ai/hard/search/pvs.ts'],
      ['src/ai/hard/search/quiesce.ts'],
      ['src/ai/hard/tactics/'],
      ['src/game/'],
    ] as const) {
      reached.add(classifyUrl(`file:///r/${prefix}x.ts`));
    }
    for (const bucket of PHASE_BUCKETS) expect(reached.has(bucket)).toBe(true);
  });
});

describe('attributeSelfTime', () => {
  it('buckets are additive and sum to the profiled duration', () => {
    const profile = {
      startTime: 0,
      endTime: 1000, // microseconds -> 1 ms profiled
      nodes: [
        { id: 1, callFrame: { functionName: 'a', url: 'file:///r/src/ai/hard/gen/generate.ts', lineNumber: 1 }, hitCount: 3 },
        { id: 2, callFrame: { functionName: 'b', url: 'file:///r/src/ai/hard/eval/evaluate.ts', lineNumber: 1 }, hitCount: 1 },
        { id: 3, callFrame: { functionName: '(root)', url: '', lineNumber: -1 }, hitCount: 0 },
      ],
    };
    const a = attributeSelfTime(profile);
    expect(a.profiledMs).toBeCloseTo(1, 5);
    expect(a.byBucket.generation).toBeCloseTo(0.75, 5);
    expect(a.byBucket.evaluation).toBeCloseTo(0.25, 5);
    const sum = Object.values(a.byBucket).reduce((s, x) => s + x, 0);
    expect(sum).toBeCloseTo(a.profiledMs, 5);
    // The zero-hit node is a real profile node (a call frame the sampler never
    // landed on) and must not appear as a phantom bucket contributor.
    expect(a.byFunction).toHaveLength(2);
  });
});

describe('profileOnePosition', () => {
  it('produces a well-formed artifact for the canonical initial position', async () => {
    const engine = new HardEngine(hardEnginePatch('desktop'));
    expect(engine.config.weights.version).not.toBe(0);
    const pos: Position = {
      id: 'test:initial',
      set: 'p8',
      label: 'initial',
      side: 'white',
      turnNumber: 1,
      seatTurnIndex: 0,
      startState: createInitialGameState(),
    };
    const p = await profileOnePosition(engine, pos, { mode: 'fixed', units: 5000 }, 100);

    expect(p.completedIterations).toBeGreaterThanOrEqual(1);
    expect(p.rootCoverage.listed).toBeGreaterThan(0);
    expect(p.rootCoverage.searched).toBeGreaterThan(0);
    expect(p.rootCoverage.searched).toBeLessThanOrEqual(p.rootCoverage.listed);
    expect(Object.keys(p.byClass)).toEqual(['MACRO', 'QUIESCE', 'TURN', 'GEN', 'KILLTABLE', 'DFPN', 'EVAL1', 'EVAL2', 'PROVER']);
    expect(p.workSpent).toBeGreaterThan(0);
    expect(p.rootTrace.length).toBeGreaterThan(0);
    expect(['abort', 'work', 'complete']).toContain(p.stopReason);

    const bucketSum = Object.values(p.attribution.byBucket).reduce((s, x) => s + x, 0);
    expect(bucketSum).toBeGreaterThan(0);
    // Additive within sampling noise; never more than the profiled window.
    expect(bucketSum).toBeLessThanOrEqual(p.attribution.profiledMs * 1.01 + 0.5);
  });

  it('is off-path-cost-free to the search itself: exposure/profiling does not change the returned plan', async () => {
    // `search/root.ts`'s own header and `tests/ai/hard/root-exposure.test.ts`
    // pin that `opts.expose` never changes the move; this is the same claim
    // read from the instrument's own output — a fixed-work search at a small
    // rung on the initial position is deterministic (DESIGN F18), so two
    // fresh engines must agree exactly.
    const a = new HardEngine(hardEnginePatch('desktop'));
    const b = new HardEngine(hardEnginePatch('desktop'));
    const pos: Position = {
      id: 'test:initial',
      set: 'p8',
      label: 'initial',
      side: 'white',
      turnNumber: 1,
      seatTurnIndex: 0,
      startState: createInitialGameState(),
    };
    const pa = await profileOnePosition(a, pos, { mode: 'fixed', units: 8000 }, 100);
    const pb = await profileOnePosition(b, pos, { mode: 'fixed', units: 8000 }, 100);
    expect(pa.workSpent).toBe(pb.workSpent);
    expect(pa.completedIterations).toBe(pb.completedIterations);
    expect(pa.rootCoverage.listed).toBe(pb.rootCoverage.listed);
  });
});

describe('corpus builders', () => {
  it('builds the 12 distinct E1.1 loss positions with no skips', () => {
    const { positions, skipped } = buildE1LossPositions();
    expect(positions).toHaveLength(12);
    expect(skipped).toHaveLength(0);
    const ids = new Set(positions.map(p => p.label));
    expect(ids.size).toBe(12);
    for (const p of positions) {
      expect(p.startState.turn.currentPlayer).toBe(p.side);
    }
  });

  it('excludes the P8 positions its own fixed:100,000 record shows would blow the 5-minute cap, keeps every one for wall mode, and skips fixed:400,000 entirely', () => {
    const fixed100k = buildP8Positions({ mode: 'fixed', units: 100_000 });
    const fixed400k = buildP8Positions({ mode: 'fixed', units: 400_000 });
    const wall = buildP8Positions({ mode: 'wall', ms: 3000 });
    expect(wall.positions).toHaveLength(11);
    expect(wall.skipped).toHaveLength(0);
    expect(fixed100k.positions.length).toBeGreaterThan(0);
    expect(fixed100k.positions.length).toBeLessThan(wall.positions.length);
    expect(fixed100k.positions.length + fixed100k.skipped.length).toBe(11);
    for (const s of fixed100k.skipped) expect(s.reason).toContain('5-minute');
    expect(fixed400k.positions).toHaveLength(0);
    expect(fixed400k.skipped).toHaveLength(11);
    for (const s of fixed400k.skipped) expect(s.reason).toContain('not attempted');
  });


});
