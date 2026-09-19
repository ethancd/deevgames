// @vitest-environment node
/**
 * `verify/replay.ts` (DESIGN §4.17, §1 step 4): nothing the search chooses
 * reaches the UI or the ladder until the CANONICAL engine has accepted it,
 * action by action, and agreed about where the turn ended.
 *
 * Three things have to hold, and each has a test:
 *   - a turn the search really generated replays cleanly and its `Kpos` matches;
 *   - a turn whose actions the canonical engine refuses is TRUNCATED at the
 *     first refusal, with `divergedAt` naming it — never dispatched whole;
 *   - a turn whose actions are all legal but whose recorded end position is
 *     wrong is caught by the `Kpos` comparison, which is the only check that
 *     can see a make/unmake or income divergence.
 */
import { describe, expect, it, vi } from 'vitest';
import { createInitialGameState } from '../../../src/game/board';
import { applyAction } from '../../../src/ai/simulate';
import { isLegalAction } from '../../../src/game/legality';
import { AKind, paMake } from '../../../src/ai/hard/core/action';
import { verifyTurn } from '../../../src/ai/hard/verify/replay';
import { HardEngine } from '../../../src/ai/hard/engine';
import { candidates, prepare } from './search-fixture';
import { buildState } from './game-fixture';

// E0.5 timeout budget: slowest test 11.8 s in the 2026-09-15 survey (M2 Max, load ~5, maxWorkers 2); 60 s is this file's explicit ceiling.
vi.setConfig({ testTimeout: 60_000 });

describe('verifyTurn', () => {
  it('verifies every candidate the generator produced on the initial position', () => {
    const state = createInitialGameState(undefined, 4, 0, 'phasing');
    const prepared = prepare(state, 400_000);
    const { turns, n } = candidates(prepared);
    expect(n).toBeGreaterThan(4);
    for (let i = 0; i < n; i++) {
      const check = verifyTurn(prepared.ctx.rep, state, prepared.p, turns[i], prepared.ctx.keep[0]);
      expect(check.divergedAt).toBe(-1);
      expect(check.verified).toBe(true);
      expect(check.actions.length).toBe(turns[i].count);
      expect(check.reason).toBeUndefined();
    }
  }, 60_000); // explicit per-test budget; see the E0.5 timeout note at the top of this file

  it('every verified action is one `isLegalAction` accepts at the moment it is dispatched', () => {
    const state = createInitialGameState(undefined, 4, 0, 'phasing');
    const prepared = prepare(state, 400_000);
    const { turns } = candidates(prepared);
    const check = verifyTurn(prepared.ctx.rep, state, prepared.p, turns[0], prepared.ctx.keep[0]);
    let current = state;
    for (const action of check.actions) {
      expect(isLegalAction(current, action)).toBe(true);
      current = applyAction(current, action);
    }
  }, 60_000); // explicit per-test budget; see the E0.5 timeout note at the top of this file

  it('truncates at the first action the canonical engine refuses', () => {
    const state = createInitialGameState(undefined, 4, 0, 'phasing');
    const prepared = prepare(state, 400_000);
    const { turns } = candidates(prepared);
    const tampered = { ...turns[0], actions: Int32Array.from(turns[0].actions), count: turns[0].count };
    // Splice an impossible action in at index 1: an ATTACK on an empty square
    // in the middle of the board. It DECODES (the attacker exists), so the
    // rejection has to come from `isLegalAction`, which is the path the UI
    // takes too.
    expect(tampered.count).toBeGreaterThan(1);
    tampered.actions[1] = paMake(AKind.ATTACK, 0, 55, 0);
    const check = verifyTurn(prepared.ctx.rep, state, prepared.p, tampered, prepared.ctx.keep[0]);
    expect(check.verified).toBe(false);
    expect(check.divergedAt).toBe(1);
    expect(check.actions.length).toBe(1);
    expect(check.reason).toMatch(/isLegalAction rejected ATTACK/);
  }, 60_000); // explicit per-test budget; see the E0.5 timeout note at the top of this file

  it('catches a wrong end position even when every action is legal', () => {
    const state = createInitialGameState(undefined, 4, 0, 'phasing');
    const prepared = prepare(state, 400_000);
    const { turns } = candidates(prepared);
    const lying = { ...turns[0], endLo: (turns[0].endLo ^ 0x5a5a5a5a) >>> 0 };
    const check = verifyTurn(prepared.ctx.rep, state, prepared.p, lying, prepared.ctx.keep[0]);
    expect(check.verified).toBe(false);
    expect(check.divergedAt).toBe(-1);
    expect(check.reason).toMatch(/Kpos mismatch/);
    // The prefix is still the whole legal line: truncation is about legality,
    // not about the hash.
    expect(check.actions.length).toBe(turns[0].count);
  }, 60_000); // explicit per-test budget; see the E0.5 timeout note at the top of this file

  it('the engine never returns an action the canonical engine refuses', async () => {
    const state = buildState({
      current: 'white',
      phase: 'place',
      actions: 4,
      white: 9,
      black: 5,
      units: [
        { def: 'fire_1', owner: 'white', x: 1, y: 1 },
        { def: 'water_1', owner: 'white', x: 2, y: 2 },
        { def: 'plant_1', owner: 'black', x: 7, y: 7 },
      ],
    });
    const engine = new HardEngine();
    const result = await engine.searchTurn(state, { work: 200_000 });
    expect(result.actions.length).toBeGreaterThan(0);
    expect(result.stats.replicaDivergences).toBe(0);
    let current = state;
    for (const action of result.actions) {
      expect(isLegalAction(current, action)).toBe(true);
      const next = applyAction(current, action);
      expect(next).not.toBe(current);
      current = next;
    }
    // The turn really ended: either the game is over or the seat changed.
    expect(current.phase !== 'playing' || current.turn.currentPlayer !== 'white').toBe(true);
  }, 60_000); // explicit per-test budget; see the E0.5 timeout note at the top of this file
});
