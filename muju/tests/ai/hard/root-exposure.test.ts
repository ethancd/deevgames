// @vitest-environment node
/**
 * The root instrument (E2 lane 1, `src/ai/hard/search/probe.ts`).
 *
 * Three things have to be true before an analyser may believe a word of it:
 *
 *   1 BYTE IDENTITY. With the instrument on, a fixed-work search returns the
 *     same `actions`, `scoreCc`, `depth`, `work`, `stats.nodes` and `endKey`
 *     it returns with it off — on real positions, and with the same engine
 *     before, during and after, so the instrument leaves no residue either.
 *   2 INTERNAL CONSISTENCY. Every candidate the root SEARCHED carries a
 *     score and every candidate it did not carries `null`; the chosen
 *     candidate's score is the score the search returned.
 *   3 COMPLETENESS. The published list is the whole list the generator
 *     returned for that iteration — not a prefix, not the searched subset.
 *
 * It also pins the ply-1 finding the trace exists to settle: the opponent's
 * reply node never uses the ROOT generator (`search/pvs.ts generateAt`'s
 * `ply === 0 ? s.gen : s.genInterior`, and `search/quiesce.ts`'s explicit
 * `s.genQuiesce`).
 */
import { describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import { createInitialGameState } from '../../../src/game/board';
import type { GameState } from '../../../src/game/types';
import { HardEngine } from '../../../src/ai/hard/engine';
import type { RootResult } from '../../../src/ai/hard/search/root';
import { PLY1_MAX_KEYS } from '../../../src/ai/hard/search/probe';
import { readPositions } from '../../../lab/hard-ai/positions/corpus';

// E0.5 timeout budget: this file's searches are one 25,000-unit rung each,
// measured at well under a second apiece; 120 s is its explicit ceiling.
vi.setConfig({ testTimeout: 120_000 });

const POSITIONS_DIR = path.resolve(__dirname, '../../../lab/hard-ai/positions');

/** Eight real positions: the opening, four authored fixtures and three
 * generated openings. All carry the corpus's default rules block. */
const CASES: { id: string; state: GameState }[] = (() => {
  const authored = readPositions(path.join(POSITIONS_DIR, 'authored.jsonl'));
  const openings = readPositions(path.join(POSITIONS_DIR, 'openings.jsonl'));
  const out: { id: string; state: GameState }[] = [{ id: 'initial', state: createInitialGameState() }];
  for (const p of authored.slice(0, 4)) out.push({ id: p.id, state: p.state });
  for (const p of [openings[0], openings[40], openings[200]]) out.push({ id: p.id, state: p.state });
  return out;
})();

const WORK = 25_000;

interface Summary {
  actions: string;
  scoreCc: number;
  depth: number;
  work: number;
  nodes: number;
  endKey: string;
}

function summarise(r: RootResult): Summary {
  return {
    actions: JSON.stringify(r.actions),
    scoreCc: r.scoreCc,
    depth: r.depth,
    work: r.work,
    nodes: r.stats.nodes,
    endKey: r.endKey,
  };
}

describe('the instrument is off by default and changes nothing when on', () => {
  it.each(CASES)('$id: on and off agree, and the engine is unchanged after', async ({ state }) => {
    const engine = new HardEngine();
    const before = await engine.searchTurn(state, { work: WORK });
    expect(before.candidates).toBeUndefined();
    expect(before.rootTrace).toBeUndefined();
    expect(before.ply1).toBeUndefined();

    const on = await engine.searchTurn(state, { work: WORK, expose: true, ply1Trace: true });
    const after = await engine.searchTurn(state, { work: WORK });

    expect(summarise(on)).toEqual(summarise(before));
    expect(summarise(after)).toEqual(summarise(before));
    // The probe is torn down with the call that installed it.
    expect(engine.ctx.probe).toBeNull();
    expect(after.candidates).toBeUndefined();
  });

  it('a fresh engine agrees with an instrumented one', async () => {
    const plain = await new HardEngine().searchTurn(CASES[0].state, { work: WORK });
    const instrumented = await new HardEngine().searchTurn(CASES[0].state, { work: WORK, expose: true });
    expect(summarise(instrumented)).toEqual(summarise(plain));
    expect(instrumented.ply1).toBeUndefined();
  });
});

describe('what the instrument reports', () => {
  it.each(CASES)('$id: searched candidates carry scores, unsearched carry null', async ({ state }) => {
    const r = await new HardEngine().searchTurn(state, { work: WORK, expose: true, ply1Trace: true });
    const candidates = r.candidates;
    expect(candidates).toBeDefined();
    if (candidates === undefined) return;
    expect(candidates.length).toBeGreaterThan(0);

    for (const c of candidates) {
      if (c.searched) expect(c.scoreCc).not.toBeNull();
      else expect(c.scoreCc).toBeNull();
      expect(c.endKey).toMatch(/^[0-9a-f]{16}$/);
      expect(Number.isFinite(c.genRankCc)).toBe(true);
    }
    // Indices are the position in the list the root walked.
    expect(candidates.map(c => c.index)).toEqual(candidates.map((_, i) => i));
    // Exactly one chosen candidate, and it is the move that was returned.
    const chosen = candidates.filter(c => c.chosen);
    expect(chosen.length).toBe(1);
    expect(chosen[0].endKey).toBe(r.endKey);
  });

  it.each(CASES)('$id: the chosen candidate scores what the search returned', async ({ state }) => {
    const r = await new HardEngine().searchTurn(state, { work: WORK, expose: true });
    const candidates = r.candidates ?? [];
    const chosen = candidates.find(c => c.chosen);
    expect(chosen).toBeDefined();
    if (chosen === undefined) return;
    if (r.candidateSource !== 'completed-depth') return;
    expect(chosen.searched).toBe(true);
    expect(chosen.scoreCc).toBe(r.scoreCc);
  });

  it.each(CASES)('$id: the list is the whole list the generator returned', async ({ state }) => {
    const r = await new HardEngine().searchTurn(state, { work: WORK, expose: true });
    const candidates = r.candidates ?? [];
    const trace = r.rootTrace ?? [];
    // A root that answered before iterative deepening — the must-answer scan,
    // the book probe, the `pickUnsearched` salvage — ran no iteration and so
    // has no trace; its list is the generator's, unsearched.
    if (r.candidateSource === 'generator-list') {
      expect(trace.length).toBe(0);
      expect(candidates.every(c => !c.searched)).toBe(true);
    } else {
      expect(trace.length).toBeGreaterThan(0);
    }
    for (const row of trace) {
      expect(row.searched).toBeLessThanOrEqual(row.n);
      expect(row.cutoffAt).toBeGreaterThanOrEqual(-1);
      expect(row.cutoffAt).toBeLessThan(row.n);
    }
    // The published list belongs to one of the traced iterations; for the
    // normal answer it is the last COMPLETED one.
    if (r.candidateSource === 'completed-depth') {
      const completed = trace.filter(row => row.completed && row.n > 0);
      expect(completed.length).toBeGreaterThan(0);
      const last = completed[completed.length - 1];
      expect(candidates.length).toBe(last.n);
      expect(candidates.filter(c => c.searched).length).toBe(last.searched);
      // A list stops being searched only at a beta cutoff or a truncation.
      if (last.cutoffAt < 0 && !last.truncated) {
        expect(last.searched).toBeGreaterThan(0);
      }
    }
    // End keys are unique, so the analyser can match on them.
    expect(new Set(candidates.map(c => c.endKey)).size).toBe(candidates.length);
  });
});

describe('the ply-1 trace', () => {
  it.each(CASES)('$id: the reply node never uses the root generator', async ({ state }) => {
    const r = await new HardEngine().searchTurn(state, { work: WORK, expose: true, ply1Trace: true });
    const ply1 = r.ply1 ?? [];
    const candidates = r.candidates ?? [];
    // Something was searched, so something generated at ply 1 — unless every
    // root candidate ended the game on the spot.
    for (const node of ply1) {
      expect(node.generator).not.toBe('root');
      expect(node.generators).not.toContain('root');
      expect(candidates[node.rootIndex].searched).toBe(true);
      expect(node.endKeys.length).toBeLessThanOrEqual(PLY1_MAX_KEYS);
      expect(node.endKeys.length).toBeLessThanOrEqual(node.n);
      expect(node.generations).toBeGreaterThan(0);
      for (const k of node.endKeys) expect(k).toMatch(/^[0-9a-f]{16}$/);
      // Fixed work reads no clock, so no generation is ever cut by `stop()`.
      expect(node.cut).toBe(false);
    }
  });

  it('a depth-1 root sees the QUIESCE list at ply 1, a deeper one the interior list', async () => {
    // A root iteration of depth 1 calls `pvs` at ply 1 with depth 0, which is
    // `quiesce` — and `quiesce` generates only where the node has tactical
    // potential, so a quiet position reports no ply-1 node at all. The
    // `promotion-kill` fixture at 4,000 units is a depth-1 answer whose
    // children ARE tactical, which is where the quiesce list shows up.
    const authored = readPositions(path.join(POSITIONS_DIR, 'authored.jsonl'));
    const tactical = authored.find(p => p.id === 'promotion-kill');
    expect(tactical).toBeDefined();
    if (tactical === undefined) return;
    const shallow = await new HardEngine().searchTurn(tactical.state, {
      work: 4_000,
      expose: true,
      ply1Trace: true,
    });
    const deep = await new HardEngine().searchTurn(CASES[0].state, {
      work: 400_000,
      expose: true,
      ply1Trace: true,
    });
    const generators = (r: RootResult): Set<string> => new Set((r.ply1 ?? []).map(n => n.generator));
    expect(shallow.depth).toBe(1);
    expect([...generators(shallow)]).toEqual(['quiesce']);
    expect(deep.depth).toBeGreaterThan(1);
    expect([...generators(deep)]).toEqual(['interior']);
  });
});
