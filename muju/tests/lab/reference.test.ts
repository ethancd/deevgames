// @vitest-environment node
/**
 * `lab/hard-ai/verify/reference.ts` — E4.2's full-width reference search and the
 * three instruments the search safety audit runs beside it.
 *
 * What these pin, and why each one is load-bearing:
 *
 *   1. The reference is a REFERENCE: it reads the engine's own weights, refuses
 *      M4's placeholder vector, spends no rung, and returns the same numbers
 *      twice. A reference that drifts is not a reference.
 *   2. It is FULL WIDTH: every root candidate the generator emitted carries a
 *      value, none is skipped for being ranked low, and the optimal set is every
 *      candidate that ties the root value rather than the first one found.
 *   3. `kposSensitivity` measures the macro table's key identity. The rows it
 *      produces are the audit's own evidence, so the expectations here are the
 *      claim `core/zobrist.ts` makes, checked against the packer: side, upkeep
 *      and the clock move `Kpos`; phase and `actionsRemaining` do not;
 *      `progressThisTurn` moves neither key.
 *   4. `RecordingTT` observes without changing: what it logs is what the table
 *      stored, and a probe through it returns what a probe through the base
 *      class returns.
 *   5. `auditStoreLog` actually fires on a planted contradiction. A checker that
 *      only ever returns an empty list proves nothing about the search.
 *
 * The measured numbers below were taken at this commit on 2026-09-18 and are
 * stated with their position id, side and turn. They are pins, not thresholds:
 * a change to the generator, the evaluator or the weights is expected to move
 * them, and the test then says so rather than passing silently.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DESKTOP } from '../../src/ai/hard/config';
import { HardEngine } from '../../src/ai/hard/engine';
import { Bound, newTTEntry } from '../../src/ai/hard/search/tt';
import { hardEnginePatch } from '../../lab/hard-ai/bots/hard';
import {
  AUDIT_SETS,
  DEFAULT_WORK_LADDER,
  RecordingTT,
  applyRules,
  assertWeights,
  auditStoreLog,
  classify,
  kposSensitivity,
  loadAuditPositions,
  parseArgs,
  referenceSearch,
  type AuditPosition,
  type ComparisonRow,
} from '../../lab/hard-ai/verify/reference';

// A reference search at depth 2 on the first `e1-dev` opening costs ~20 ms and
// the production ladder sweep a few hundred; the ceiling is for the slowest box.
vi.setConfig({ testTimeout: 120_000 });

const envBackup: Record<string, string | undefined> = {};
let heavyDir = '';

beforeAll(() => {
  // Nothing here takes a heavy slot, but the lane's rule is that a test never
  // touches the real `~/.local/state/muju-heavy`, so the override is installed
  // regardless.
  envBackup.MUJU_HEAVY_DIR = process.env.MUJU_HEAVY_DIR;
  heavyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'muju-e42-'));
  process.env.MUJU_HEAVY_DIR = heavyDir;
});

afterAll(() => {
  if (envBackup.MUJU_HEAVY_DIR === undefined) delete process.env.MUJU_HEAVY_DIR;
  else process.env.MUJU_HEAVY_DIR = envBackup.MUJU_HEAVY_DIR;
  if (heavyDir.length > 0) fs.rmSync(heavyDir, { recursive: true, force: true });
});

function firstOf(set: string): AuditPosition {
  const positions = loadAuditPositions([set as (typeof AUDIT_SETS)[number]], 1);
  expect(positions.length).toBe(1);
  return positions[0];
}

describe('the CLI contract', () => {
  it('defaults to hard@desktop at depth 2 over every set with all four checks', () => {
    const opts = parseArgs([]);
    expect(opts.engineLabel).toBe('desktop');
    expect(opts.depth).toBe(2);
    expect(opts.sets).toEqual([...AUDIT_SETS]);
    expect(opts.checks).toEqual({ agreement: true, tt: true, kpos: true, switches: true });
    expect(opts.ladder).toEqual(DEFAULT_WORK_LADDER);
  });

  it('carries finer rungs than WORK_LADDER below 25,000', () => {
    // `hard@desktop` already completes depth 3 at the ladder's own first rung on
    // an early `e1-dev` position, so without these there is no rung that stops
    // at depth 2 and every row would be a depth mismatch.
    expect(DEFAULT_WORK_LADDER[0]).toBeLessThan(25_000);
    expect(DEFAULT_WORK_LADDER).toContain(25_000);
    for (let i = 1; i < DEFAULT_WORK_LADDER.length; i++) {
      expect(DEFAULT_WORK_LADDER[i]).toBeGreaterThan(DEFAULT_WORK_LADDER[i - 1]);
    }
  });

  it('refuses an unknown set, an unknown flag and a depth below 1', () => {
    expect(() => parseArgs(['--sets', 'no-such-set'])).toThrow(/unknown set/);
    expect(() => parseArgs(['--nonsense'])).toThrow(/unknown argument/);
    expect(() => parseArgs(['--depth', '0'])).toThrow(/bad --depth/);
  });
});

describe('the position sets cover what E4.2 names', () => {
  it('finds forced home defence, spawn strikes, upkeep, imminent draws and early e1-dev turns', () => {
    for (const set of AUDIT_SETS) {
      expect(loadAuditPositions([set], 3).length, `set ${set} is empty`).toBeGreaterThan(0);
    }
  });

  it('gives every position a unique id, a rules block and a playable state', () => {
    const all = loadAuditPositions(AUDIT_SETS, 3);
    const ids = new Set(all.map(p => p.id));
    expect(ids.size).toBe(all.length);
    for (const p of all) {
      expect(p.rules.elementGraph.length).toBeGreaterThan(0);
      expect(p.state.phase).not.toBe('victory');
      expect(p.source).toContain('#');
    }
  });

  it('the draw set is made of positions the inactivity clock can actually end', () => {
    for (const p of loadAuditPositions(['draw'], 6)) {
      expect(p.state.inactivityRule, `${p.id} has the draw rule off`).not.toBe('off');
      expect(p.state.inactivityPlies ?? 0, `${p.id} clock`).toBeGreaterThanOrEqual(7);
    }
  });

  it('the upkeep set opens on the authored upkeep node and carries the exam upkeep-elimination cases', () => {
    const ids = loadAuditPositions(['upkeep'], 6).map(p => p.id);
    expect(ids[0]).toBe('upkeep-upkeep-pending');
    expect(ids).toContain('upkeep-loss-g2-s5_0_2-A-white-t4');
    expect(ids).toContain('upkeep-loss-g4-s2_3_1-B-white-t2');
  });
});

describe('the reference search', () => {
  it('refuses an engine carrying M4\'s placeholder weight vector', () => {
    // `DESKTOP.weights` IS the placeholder (58 zeros, version 0); the engine
    // substitutes `DEFAULT_WEIGHTS` only when no `weights` field is passed, so
    // this is exactly the mistake `hardEnginePatch` exists to prevent.
    const placeholder = new HardEngine({ weights: DESKTOP.weights });
    expect(placeholder.config.weights.version).toBe(0);
    expect(() => assertWeights(placeholder)).toThrow(/placeholder weight vector/);
  });

  it('values every generated root candidate and reports the whole optimal set', () => {
    const pos = firstOf('e1dev');
    expect(pos.id).toBe('e1dev-e1-g3-s105');
    applyRules(pos.rules);
    const engine = new HardEngine(hardEnginePatch('desktop'));
    const ref = referenceSearch(engine, pos.state, {
      depth: 2,
      quiesceLeaves: true,
      nodeLimit: 200_000,
      census: true,
    });
    // Full width: a value for every candidate, and the optimal set is every
    // candidate that ties the root score — not the first one found.
    expect(ref.candidates.length).toBeGreaterThan(1);
    expect(ref.intractable).toBe(false);
    const searched = ref.candidates.filter(c => !c.illegal);
    expect(searched.length).toBe(ref.candidates.length);
    expect(Math.max(...searched.map(c => c.scoreCc))).toBe(ref.scoreCc);
    expect(ref.optimal).toEqual(searched.filter(c => c.scoreCc === ref.scoreCc).map(c => c.endKey));
    // Measured 2026-09-18 at this commit: e1dev-e1-g3-s105, white, turn 1,
    // phase action — 7 root candidates, one optimum, +337 cc at depth 2.
    expect(ref.candidates.length).toBe(7);
    expect(ref.scoreCc).toBe(337);
    expect(ref.optimal.length).toBe(1);
  });

  it('is deterministic and spends no rung the caller can see', () => {
    const pos = firstOf('e1dev');
    applyRules(pos.rules);
    const engine = new HardEngine(hardEnginePatch('desktop'));
    const opts = { depth: 2, quiesceLeaves: false, nodeLimit: 200_000, census: false } as const;
    const a = referenceSearch(engine, pos.state, opts);
    const b = referenceSearch(engine, pos.state, opts);
    expect(b.scoreCc).toBe(a.scoreCc);
    expect(b.nodes).toBe(a.nodes);
    expect(b.optimal).toEqual(a.optimal);
    // The engine is handed back with its table switched on, exactly as found.
    expect(engine.ctx.useTT).toBe(true);
  });

  it('agrees with the production search at the rung that reaches its depth', async () => {
    const pos = firstOf('e1dev');
    applyRules(pos.rules);
    const engine = new HardEngine(hardEnginePatch('desktop'));
    const ref = referenceSearch(engine, pos.state, {
      depth: 2,
      quiesceLeaves: true,
      nodeLimit: 200_000,
      census: false,
    });
    // 3,000 units completes depth 2 on this position (measured); the row the
    // audit files is this comparison, position by position.
    const prod = await engine.searchTurn(pos.state, { work: 3_000 });
    expect(prod.depth).toBe(2);
    expect(prod.source).toBe('search');
    expect(prod.scoreCc).toBe(ref.scoreCc);
    expect(ref.optimal).toContain(prod.endKey);
  });

  it('reports a position the node budget cut as intractable rather than as a value', () => {
    const pos = firstOf('e1dev');
    applyRules(pos.rules);
    const engine = new HardEngine(hardEnginePatch('desktop'));
    const cut = referenceSearch(engine, pos.state, { depth: 3, quiesceLeaves: false, nodeLimit: 4, census: false });
    expect(cut.intractable).toBe(true);
  });
});

describe('Kpos identity — what the macro table can and cannot tell apart', () => {
  it('separates side, upkeep and the clock, and does not separate phase or actionsRemaining', () => {
    const pos = firstOf('e1dev');
    applyRules(pos.rules);
    const engine = new HardEngine(hardEnginePatch('desktop'));
    const rows = kposSensitivity(engine, pos.state);
    const by = new Map(rows.map(r => [r.mutation, r]));

    for (const m of ['turn.currentPlayer swapped', 'upkeepPending toggled', 'inactivityPlies +1']) {
      const row = by.get(m);
      expect(row, m).toBeDefined();
      expect(row?.kposMoved, `${m} must move Kpos`).toBe(true);
    }

    // `Kturn = Kpos ⊕ phase ⊕ actions ⊕ atkCount ⊕ uflags` (core/zobrist.ts).
    // Both of these change the position the search is looking at and neither
    // moves the key the MACRO table is indexed by.
    for (const m of ['turn.phase place<->action', 'turn.actionsRemaining -1']) {
      const row = by.get(m);
      expect(row, m).toBeDefined();
      expect(row?.digestMoved, `${m} must change the position`).toBe(true);
      expect(row?.kposMoved, `${m} must NOT move Kpos`).toBe(false);
      expect(row?.kturnMoved, `${m} must move Kturn`).toBe(true);
    }

    // `progressThisTurn` gates the inactivity clock at the turn boundary and is
    // in NEITHER key. See `docs/hard-ai/e4/E4.2-SEARCH-AUDIT.md` finding 4.
    const progress = by.get('progressThisTurn toggled');
    expect(progress?.digestMoved).toBe(true);
    expect(progress?.kposMoved).toBe(false);
    expect(progress?.kturnMoved).toBe(false);
  });
});

describe('RecordingTT and the store log', () => {
  it('logs what it stores and hands back what the base class would', () => {
    const rec = new RecordingTT(12);
    const out = newTTEntry();
    expect(rec.probe(0x1234, 0x99, out)).toBe(false);
    rec.store(0x1234, 0x99, 500, 3, Bound.EXACT, 0xabcd, 0);
    expect(rec.probe(0x1234, 0x99, out)).toBe(true);
    expect(out.scoreCc).toBe(500);
    expect(out.depth).toBe(3);
    expect(out.bound).toBe(Bound.EXACT);
    expect(out.bestEndLo).toBe(0xabcd);
    expect(rec.stores.length).toBe(1);
    expect(rec.stores[0].scoreCc).toBe(500);
    expect(rec.probeLog.length).toBe(2);
    expect(rec.probeLog.map(p => p.hit)).toEqual([false, true]);
    // `probes` stays the base class's counter, not the log.
    expect(rec.probes).toBe(2);
  });

  it('is silent on a clean log', () => {
    const rec = new RecordingTT(12);
    rec.store(1, 1, 100, 2, Bound.EXACT, 0, 0);
    rec.store(2, 2, -100, 2, Bound.LOWER, 0, 0);
    expect(auditStoreLog(rec, 12)).toEqual([]);
  });

  it('catches a value published after a truncation', () => {
    const rec = new RecordingTT(12);
    rec.ctx = { truncated: true } as unknown as RecordingTT['ctx'];
    rec.store(7, 7, 42, 2, Bound.EXACT, 0, 0);
    const found = auditStoreLog(rec, 12);
    expect(found.map(f => f.kind)).toEqual(['store-while-truncated']);
  });

  it('catches two EXACT values for one key, depth, prover mode and ply', () => {
    const rec = new RecordingTT(12);
    rec.store(9, 9, 100, 2, Bound.EXACT, 0, 1);
    rec.store(9, 9, 250, 2, Bound.EXACT, 0, 1);
    expect(auditStoreLog(rec, 12).map(f => f.kind)).toContain('exact-disagreement');
  });

  it('catches a LOWER above an UPPER at the same key and depth', () => {
    const rec = new RecordingTT(12);
    rec.store(5, 5, 900, 2, Bound.LOWER, 0, 0);
    rec.store(5, 5, 100, 2, Bound.UPPER, 0, 0);
    const kinds = auditStoreLog(rec, 12).map(f => f.kind);
    expect(kinds).toContain('bound-contradiction');
  });

  it('catches two distinct keys that share a bucket and a keyHi', () => {
    // 12 bits of table is 2^10 buckets, so `lo` and `lo + 2^10` are the same
    // seat and `hi` alone cannot tell them apart.
    const rec = new RecordingTT(12);
    rec.store(3, 0x77, 10, 1, Bound.EXACT, 0, 0);
    rec.store(3 + 1024, 0x77, 20, 1, Bound.EXACT, 0, 0);
    expect(auditStoreLog(rec, 12).map(f => f.kind)).toContain('bucket-false-hit');
  });

  it('counts a cross-prover-mode pair without calling it a contradiction', () => {
    const rec = new RecordingTT(12);
    rec.store(11, 11, 100, 2, Bound.EXACT, 0, 0, false);
    rec.store(11, 11, 250, 2, Bound.EXACT, 0, 0, true);
    const kinds = auditStoreLog(rec, 12).map(f => f.kind);
    expect(kinds).toContain('cross-prover-mode');
    expect(kinds).not.toContain('exact-disagreement');
  });
});

describe('the disagreement classifier', () => {
  const base: ComparisonRow = {
    id: 'x', set: 'e1dev', source: 's', side: 'white', turn: 1, phase: 'action',
    upkeepPending: false, clock: 0, refDepth: 2, refStaticCc: 100, refQuiesceCc: 200,
    refNodes: 10, refCandidates: 3, refOptimal: ['k'], refOptimalCount: 1, intractable: false,
    prodWork: 3000, prodDepth: 2, prodScoreCc: 200, prodEndKey: 'k', prodSource: 'search',
    prodStopReason: 'work', prodTtHits: 0, prodIterations: 2, prodCompletedIterations: 2,
    prodTruncatedIterations: 0, prodCandidateSource: 'completed-depth', prodDepthScores: [],
    prodScoreAtRefDepthCc: 200, turnAgrees: true, scoreInBounds: true, scoreEqualsQuiesce: true,
    classification: 'agree', switches: null, note: '',
  };

  it('takes the must-answer layer before the depth, because a proof returns at depth 1', () => {
    expect(classify({ ...base, prodSource: 'mate', prodDepth: 1 }, 0, true, true, 0)).toBe('must-answer');
  });

  it('calls a matched depth with both agreements an agreement', () => {
    expect(classify(base, 0, false, true, 0)).toBe('agree');
  });

  it('names an in-bounds score that is not the quiescence one a stand-pat artifact', () => {
    const row = { ...base, scoreEqualsQuiesce: false, turnAgrees: false };
    expect(classify(row, 0, false, true, 0)).toBe('stand-pat');
  });

  it('separates a generator difference, a mate, a truncation and the table', () => {
    const out = { ...base, scoreInBounds: false, scoreEqualsQuiesce: false, turnAgrees: false };
    expect(classify(out, 0, false, false, 0)).toBe('generator-difference');
    expect(classify(out, 0, true, true, 0)).toBe('terminal-ordering');
    expect(classify(out, 0, false, true, 3)).toBe('truncation');
    expect(classify(out, 7, false, true, 0)).toBe('tt-identity');
    expect(classify(out, 0, false, true, 0)).toBe('pruning-artifact');
  });

  it('never reads a fixed-work stopReason as a truncation', () => {
    // Every fixed-work search ends `work`; reading that as truncation would
    // classify the whole corpus.
    expect(classify({ ...base, prodStopReason: 'work' }, 0, false, true, 0)).toBe('agree');
  });

  it('reports an intractable reference rather than a verdict', () => {
    expect(classify({ ...base, intractable: true }, 0, false, true, 0)).toBe('reference-intractable');
  });
});
