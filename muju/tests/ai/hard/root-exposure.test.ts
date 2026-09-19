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
import { createInitialGameState } from '../../../src/game/board';
import type { GameState } from '../../../src/game/types';
import { HardEngine } from '../../../src/ai/hard/engine';
import type { RootResult } from '../../../src/ai/hard/search/root';
import { PLY1_MAX_KEYS } from '../../../src/ai/hard/search/probe';
import { buildState } from './game-fixture';
import { applyAction } from '../../../src/ai/simulate';
import { isLegalAction } from '../../../src/game/legality';
import { Replica } from '../../../src/ai/hard/core/state';
import { DESKTOP } from '../../../src/ai/hard/config';

// E0.5 timeout budget: this file's searches are one 25,000-unit rung each,
// measured at well under a second apiece; 120 s is its explicit ceiling.
vi.setConfig({ testTimeout: 120_000 });

/** Eight explicitly authored Phasing states, no historical corpus conversion. */
const distant = [
  { def: 'water_1', owner: 'white' as const, x: 2, y: 2, id: 'white' },
  { def: 'plant_1', owner: 'black' as const, x: 8, y: 8, id: 'black' },
];
const partialBase = buildState({ units: distant, current: 'white', phase: 'action', turnNumber: 5 });
const partial = applyAction(partialBase, { type: 'MOVE', unitId: 'white', to: { x: 2, y: 3 } });
if (partial === partialBase || partial.turn.phase !== 'action') throw new Error('Partial-Act fixture must be a legal canonical prefix');
const CASES: { id: string; state: GameState }[] = [
  { id: 'initial-phasing-act', state: createInitialGameState(undefined, 4, 0, 'phasing') },
  { id: 'canonical-partial-act', state: partial },
  { id: 'quiet-prepare', state: buildState({ units: distant, phase: 'place', actions: 0, turnNumber: 5 }) },
  { id: 'upkeep-choice-prepare', state: buildState({ units: [
      { def: 'water_2', owner: 'white', x: 2, y: 2, id: 'rent' },
      { def: 'fire_1', owner: 'white', x: 1, y: 1, id: 'free' },
      distant[1],
    ], phase: 'place', actions: 0, white: 1, upkeepPending: true,
    reviewUpkeep: { white: true, black: false }, turnNumber: 5 }) },
  { id: 'opponent-pending-act', state: buildState({ units: distant, phase: 'action', turnNumber: 5,
    pendingSummons: [{ def: 'fire_1', owner: 'black', x: 9, y: 8, id: 'black-paid' }] }) },
  { id: 'own-pending-prepare', state: buildState({ units: distant, phase: 'place', actions: 0, turnNumber: 5,
    pendingSummons: [{ def: 'fire_1', owner: 'white', x: 1, y: 1, id: 'white-paid' }] }) },
  { id: 'occupied-opponent-commitment', state: buildState({ units: [
      { def: 'fire_1', owner: 'white', x: 9, y: 8, id: 'intruder' }, distant[0], distant[1],
    ], phase: 'action', actions: 1, turnNumber: 5,
    pendingSummons: [{ def: 'fire_1', owner: 'black', x: 9, y: 8, id: 'blocked-paid' }] }) },
  { id: 'live-home-rescue-act', state: buildState({ units: [
      { def: 'plant_1', owner: 'black', x: 0, y: 0, id: 'invader' },
      { def: 'fire_1', owner: 'white', x: 1, y: 0, id: 'rescuer' },
      { def: 'water_1', owner: 'white', x: 1, y: 1, id: 'support' }, distant[1],
    ], phase: 'action', turnNumber: 5 }) },
];

const WORK = 25_000;

/** No fallback/empty result may make on/off equality pass vacuously. */
function replayResult(state: GameState, result: RootResult): GameState {
  expect(result.fallback).toBeUndefined();
  expect(result.actions.length).toBeGreaterThan(0);
  expect(result.actions.length).toBeLessThanOrEqual(24);
  let current = state;
  for (const action of result.actions) {
    expect(current.phase).toBe('playing');
    expect(current.turn.currentPlayer).toBe(state.turn.currentPlayer);
    expect(isLegalAction(current, action)).toBe(true);
    const next = applyAction(current, action);
    expect(next).not.toBe(current);
    current = next;
  }
  if (current.phase === 'playing') {
    expect(current.turn.currentPlayer).not.toBe(state.turn.currentPlayer);
    expect(current.turn.phase).toBe('action');
    expect(current.turn.actionsRemaining).toBe(4);
    expect(current.upkeepPending).toBe(false);
  } else expect(current.phase).toBe('victory');
  const end = new Replica().pack(current);
  const key = (end.kposHi >>> 0).toString(16).padStart(8, '0') + (end.kposLo >>> 0).toString(16).padStart(8, '0');
  expect(result.endKey).toBe(key);
  return current;
}

// Bounded depth keeps these tests about instrumentation, independent of an
// accidental number of completed iterations at the old Standard work rung.
const makeEngine = (maxDepth = 2) => new HardEngine({ maxDepth, useExtensions: false, useDfpn: false });

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
    const engine = makeEngine();
    const before = await engine.searchTurn(state, { work: WORK });
    replayResult(state, before);
    expect(before.candidates).toBeUndefined();
    expect(before.rootTrace).toBeUndefined();
    expect(before.ply1).toBeUndefined();

    const on = await engine.searchTurn(state, { work: WORK, expose: true, ply1Trace: true });
    const after = await engine.searchTurn(state, { work: WORK });
    replayResult(state, on);
    replayResult(state, after);

    expect(summarise(on)).toEqual(summarise(before));
    expect(summarise(after)).toEqual(summarise(before));
    // The probe is torn down with the call that installed it.
    expect(engine.ctx.probe).toBeNull();
    expect(after.candidates).toBeUndefined();
  });

  it('a fresh engine agrees with an instrumented one', async () => {
    const plain = await makeEngine().searchTurn(CASES[0].state, { work: WORK });
    const instrumented = await makeEngine().searchTurn(CASES[0].state, { work: WORK, expose: true });
    replayResult(CASES[0].state, plain);
    replayResult(CASES[0].state, instrumented);
    expect(summarise(instrumented)).toEqual(summarise(plain));
    expect(instrumented.ply1).toBeUndefined();
  });
});

describe('what the instrument reports', () => {
  it.each(CASES)('$id: searched candidates carry scores, unsearched carry null', async ({ state }) => {
    const r = await makeEngine().searchTurn(state, { work: WORK, expose: true, ply1Trace: true });
    replayResult(state, r);
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
    const r = await makeEngine().searchTurn(state, { work: WORK, expose: true });
    replayResult(state, r);
    const candidates = r.candidates ?? [];
    const chosen = candidates.find(c => c.chosen);
    expect(chosen).toBeDefined();
    if (chosen === undefined) return;
    if (r.candidateSource !== 'completed-depth') return;
    expect(chosen.searched).toBe(true);
    expect(chosen.scoreCc).toBe(r.scoreCc);
  });

  it.each(CASES)('$id: the list is the whole list the generator returned', async ({ state }) => {
    const r = await makeEngine().searchTurn(state, { work: WORK, expose: true });
    replayResult(state, r);
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
    const r = await makeEngine().searchTurn(state, { work: WORK, expose: true, ply1Trace: true });
    const ply1 = r.ply1 ?? [];
    replayResult(state, r);
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

  it('depth-controlled completed roots exercise quiesce and interior reply generators', async () => {
    // A paid Metal-I arrives on Black's upcoming Act. Its POWER 2 against
    // Sjor makes that reply tactical without a new buy or a pre-Act promotion.
    const state = buildState({ phase: 'place', actions: 0, turnNumber: 5, units: [
      { def: 'water_1', owner: 'white', x: 4, y: 2, id: 'target' },
      { def: 'plant_1', owner: 'white', x: 0, y: 0, id: 'survivor' },
      { def: 'plant_1', owner: 'black', x: 3, y: 3, id: 'anchor' },
    ], pendingSummons: [{ def: 'metal_1', owner: 'black', x: 4, y: 3, id: 'paid' }] });
    const handoff = applyAction(state, { type: 'END_PLACE_PHASE' });
    expect(handoff.turn.currentPlayer).toBe('black');
    expect(handoff.board.units.some(u => u.id === 'paid')).toBe(true);
    expect(isLegalAction(handoff, { type: 'ATTACK', unitId: 'paid', targetPosition: { x: 4, y: 2 } })).toBe(true);
    const captured = applyAction(handoff, { type: 'ATTACK', unitId: 'paid', targetPosition: { x: 4, y: 2 } });
    expect(captured.board.units.some(u => u.id === 'target')).toBe(false);
    const engine = (maxDepth: number) => new HardEngine({ maxDepth, useExtensions: false, useDfpn: false,
      quiesce: { ...DESKTOP.quiesce, maxPly: 1 } });
    const shallow = await engine(1).searchTurn(state, { work: WORK, expose: true, ply1Trace: true });
    const deep = await engine(2).searchTurn(state, { work: 400_000, expose: true, ply1Trace: true });
    replayResult(state, shallow);
    replayResult(state, deep);
    expect(shallow.depth).toBe(1);
    expect(deep.depth).toBe(2);
    for (const result of [shallow, deep]) {
      expect(result.candidateSource).toBe('completed-depth');
      expect(result.rootTrace?.some(row => row.completed)).toBe(true);
      expect(result.ply1?.length).toBeGreaterThan(0);
      expect(result.ply1?.every(node => !node.generators.includes('root'))).toBe(true);
    }
    expect(shallow.ply1?.some(node => node.generator === 'quiesce')).toBe(true);
    expect(shallow.ply1?.every(node => !node.generators.includes('interior'))).toBe(true);
    expect(deep.ply1?.some(node => node.generator === 'interior')).toBe(true);
  });

  it('an own paid Prepare commitment remains pending through the opponent handoff', async () => {
    const state = CASES.find(c => c.id === 'own-pending-prepare')!.state;
    const result = await makeEngine(1).searchTurn(state, { work: WORK, expose: true });
    const end = replayResult(state, result);
    expect(end.board.units.some(u => u.id === 'white-paid')).toBe(false);
    expect(end.pendingSummons?.some(u => u.id === 'white-paid')).toBe(true);
    expect(result.candidates?.some(c => c.chosen && c.endKey === result.endKey)).toBe(true);
  });
});
