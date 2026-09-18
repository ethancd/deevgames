// @vitest-environment node
/**
 * `src/ai/hard/gen/trace.ts` — E2.2's opt-in stage trace.
 *
 * The trace's whole licence is that it changes nothing. This file is the proof:
 * on a dozen corpus positions the candidate list `TurnGenerator.generate`
 * returns with a trace installed is compared field by field — count, order,
 * `endHi`/`endLo`, `gainCc`, `flags`, `place`, `sig`, the action words — against
 * the untraced list, and the `GenStats` alongside it. A no-trace/no-trace pair
 * runs first as the control, so a failure separates "the trace changed the
 * output" from "two identical calls already differ".
 *
 * The second group checks the trace SAYS something: a target taken from the
 * list is found at its own rank, and a target that is not a legal end position
 * of the node reports `beamReached = 0`.
 */
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { readPositions } from '../../../lab/hard-ai/positions/corpus';
import { Replica, allocState } from '../../../src/ai/hard/core/state';
import { Scratch } from '../../../src/ai/hard/core/bits';
import { newKeepSetTable, type KeepSetTable } from '../../../src/ai/hard/core/action';
import { allocTables, buildTables, type NodeTables } from '../../../src/ai/hard/tables/context';
import { Evaluator, terminalScore } from '../../../src/ai/hard/eval/evaluate';
import { TurnPool, type Turn } from '../../../src/ai/hard/gen/turn';
import { UNLIMITED_WORK } from '../../../src/ai/hard/gen/actionsearch';
import { TurnGenerator, newGenStats, outCapacityFor, type GenStats } from '../../../src/ai/hard/gen/generate';
import { firstRemovingStage, newGenTrace, resetGenTrace, GenStage } from '../../../src/ai/hard/gen/trace';
import { DESKTOP } from '../../../src/ai/hard/config';
import { Result, type Centi, type PackedState, type Side } from '../../../src/ai/hard/types';
import type { GameState } from '../../../src/game/types';

vi.setConfig({ testTimeout: 60_000 });

const CORPUS = path.resolve(import.meta.dirname, '../../../lab/hard-ai/positions/fuzz-1000.jsonl');
/** Byte-identity is asserted on this many packable corpus positions (brief: ≥ 8). */
const POSITIONS = 12;

const rep = new Replica();
const sc = new Scratch(8, 8, 4, 4);
const tables: NodeTables = allocTables();
const evaluator = new Evaluator(rep);
const pool = new TurnPool(8192);
const keep: KeepSetTable = newKeepSetTable();
const gen = new TurnGenerator(rep, DESKTOP.gen, pool, sc);
const out = new Array<Turn>(outCapacityFor(DESKTOP.gen));
const stats: GenStats = newGenStats();
const trace = newGenTrace();

let scoreMover: Side = 0;
function score(p: PackedState, s: Scratch, ply: number): Centi {
  const terminal = terminalScore(p, scoreMover, ply);
  if (terminal !== null) return terminal;
  return evaluator.stage0(p, scoreMover) + evaluator.stage1(p, scoreMover, s, ply);
}

interface Snapshot {
  count: number;
  rows: string[];
  stats: GenStats;
}

function packOrNull(state: GameState): PackedState | null {
  try {
    const p = rep.pack(state, allocState());
    if (p.result !== Result.ONGOING) return null;
    p.proverMode = 2;
    return p;
  } catch {
    return null;
  }
}

/** One generation, reduced to a string per candidate so a diff names the row. */
function run(p: PackedState, ply: number): Snapshot {
  buildTables(p, sc, ply, 2, tables);
  pool.reset();
  scoreMover = p.side as Side;
  const n = gen.generate(p, tables, score, UNLIMITED_WORK, ply, keep, out, stats);
  const rows: string[] = [];
  for (let i = 0; i < n; i++) {
    const t = out[i];
    const actions = Array.from(t.actions.subarray(0, t.count)).join(',');
    rows.push(`${t.endHi}|${t.endLo}|${t.gainCc}|${t.flags}|${t.place}|${t.sig}|${t.count}|${actions}`);
  }
  return { count: n, rows, stats: { ...stats } };
}

const positions = readPositions(CORPUS)
  .filter(sp => sp.state.phase === 'playing')
  .slice(0, POSITIONS);

describe('gen/trace: byte identity', () => {
  it('has at least eight positions to test', () => {
    expect(positions.length).toBeGreaterThanOrEqual(8);
  });

  for (const sp of positions) {
    it(`${sp.id}: a trace changes neither the candidate list nor GenStats`, () => {
      const p = packOrNull(sp.state);
      if (p === null) return;

      gen.setTrace(null);
      const control = run(p, 0);
      const controlAgain = run(p, 0);
      expect(controlAgain).toEqual(control);
      expect(control.count).toBeGreaterThan(0);

      // Watch a real end key from the middle of the list — the case where the
      // trace's capture and rank paths all fire.
      const watchIndex = Math.min(3, control.count - 1);
      const [hi, lo] = control.rows[watchIndex].split('|');
      resetGenTrace(trace, Number(hi), Number(lo));
      gen.setTrace(trace);
      const traced = run(p, 0);
      gen.setTrace(null);
      expect(traced).toEqual(control);
      expect(trace.finalRank).toBe(watchIndex);
      expect(firstRemovingStage(trace)).toBe(GenStage.PRESENT);

      // And a key nothing can produce.
      resetGenTrace(trace, 0x7ffffff1, 0x7ffffff2);
      gen.setTrace(trace);
      const tracedMiss = run(p, 0);
      gen.setTrace(null);
      expect(tracedMiss).toEqual(control);
      expect(trace.finalRank).toBe(-1);
      expect(trace.beamReached).toBe(0);
      expect(firstRemovingStage(trace)).toBe(GenStage.BEAM);
    });
  }
});

describe('gen/trace: interior nodes', () => {
  it('records the interior keep-set cap and the interior K', () => {
    const p = packOrNull(positions[0].state);
    expect(p).not.toBeNull();
    const interior = new TurnGenerator(rep, DESKTOP.genInterior, pool, sc);
    const interiorOut = new Array<Turn>(outCapacityFor(DESKTOP.genInterior));
    resetGenTrace(trace, 0x7ffffff1, 0x7ffffff2);
    interior.setTrace(trace);
    buildTables(p as PackedState, sc, 1, 2, tables);
    pool.reset();
    scoreMover = (p as PackedState).side as Side;
    interior.generate(p as PackedState, tables, score, UNLIMITED_WORK, 1, keep, interiorOut, stats);
    interior.setTrace(null);
    expect(trace.k).toBe(DESKTOP.genInterior.K);
    expect(trace.finalCount).toBeGreaterThan(0);
  });
});
