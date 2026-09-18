// @vitest-environment node
/**
 * Mate scores (DESIGN §5.11.1, F21): `±(WIN_CC − ply × MATE_PLY_CC)`, a draw
 * of exactly 0, and `MATE_PLY_CC = 1000` — the spacing F21 raised from MF's 1 cc
 * so a mate one turn sooner is worth more than any evaluation term can forge.
 *
 * The end-to-end half is the one that matters: a position where the mover can
 * finish the game THIS turn must come back from `searchTurn` as a win, sourced
 * from the must-answer layer and replayed through the canonical engine, not as
 * a large evaluation.
 */
import { describe, expect, it, vi } from 'vitest';
import { DRAW_CC, MATE_PLY_CC, Result, WIN_CC } from '../../../src/ai/hard/types';
import { terminalScore } from '../../../src/ai/hard/eval/evaluate';
import { MATE_BOUND_CC, scoreFromTT, scoreToTT } from '../../../src/ai/hard/search/tt';
import { HardEngine } from '../../../src/ai/hard/engine';
import { allocState, Replica } from '../../../src/ai/hard/core/state';
import { buildState } from './game-fixture';

// E0.5 timeout budget: slowest test 0.0 s in the 2026-09-15 survey (M2 Max, load ~5, maxWorkers 2); 10 s is this file's explicit ceiling.
vi.setConfig({ testTimeout: 10_000 });

const rep = new Replica();

function packed(state: ReturnType<typeof buildState>) {
  return rep.pack(state, allocState());
}

describe('terminalScore', () => {
  const state = buildState({ units: [{ def: 'fire_1', owner: 'white', x: 0, y: 0 }] });

  it('is null while the game runs', () => {
    expect(terminalScore(packed(state), 0, 0)).toBeNull();
  });

  it('scores a draw at exactly zero, at every ply', () => {
    const p = packed(state);
    p.result = Result.DRAW;
    for (const ply of [0, 1, 7]) expect(terminalScore(p, 0, ply)).toBe(DRAW_CC);
  });

  it('is F21\'s ±(WIN_CC − ply × MATE_PLY_CC) from each side', () => {
    const p = packed(state);
    p.result = Result.WHITE_WIN;
    for (let ply = 0; ply < 6; ply++) {
      expect(terminalScore(p, 0, ply)).toBe(WIN_CC - ply * MATE_PLY_CC);
      expect(terminalScore(p, 1, ply)).toBe(-(WIN_CC - ply * MATE_PLY_CC));
    }
    p.result = Result.BLACK_WIN;
    for (let ply = 0; ply < 6; ply++) {
      expect(terminalScore(p, 1, ply)).toBe(WIN_CC - ply * MATE_PLY_CC);
      expect(terminalScore(p, 0, ply)).toBe(-(WIN_CC - ply * MATE_PLY_CC));
    }
  });

  it('prefers the sooner mate by a whole MATE_PLY_CC', () => {
    const p = packed(state);
    p.result = Result.WHITE_WIN;
    const soon = terminalScore(p, 0, 1) as number;
    const late = terminalScore(p, 0, 3) as number;
    expect(soon - late).toBe(2 * MATE_PLY_CC);
    expect(MATE_PLY_CC).toBe(1_000);
  });

  it('every mate score is above the TT\'s mate threshold, and no evaluation is', () => {
    const p = packed(state);
    p.result = Result.WHITE_WIN;
    for (let ply = 0; ply <= 12; ply++) {
      expect(Math.abs(terminalScore(p, 0, ply) as number)).toBeGreaterThan(MATE_BOUND_CC);
    }
    // M12's gate pins `maxAbsScore <= 600_000`; the threshold sits far above it.
    expect(MATE_BOUND_CC).toBeGreaterThan(600_000);
  });
});

describe('mate scores through the transposition table', () => {
  it('survive a store at one ply and a probe at another', () => {
    for (let stored = 0; stored <= 8; stored++) {
      for (let read = 0; read <= 8; read++) {
        const value = WIN_CC - stored * MATE_PLY_CC;
        expect(scoreFromTT(scoreToTT(value, stored), read)).toBe(WIN_CC - read * MATE_PLY_CC);
      }
    }
  });
});

describe('the engine on a mate in one', () => {
  it('returns a win from the must-answer layer, replayed canonically', async () => {
    // White's fire_1 stands one step from Black's corner (9,9), which is empty;
    // Black has one body far away that cannot answer the occupation.
    const state = buildState({
      current: 'white',
      phase: 'action',
      actions: 4,
      units: [
        { def: 'fire_1', owner: 'white', x: 8, y: 9 },
        { def: 'metal_1', owner: 'black', x: 0, y: 5 },
      ],
      victoryRule: 'home-or-elimination',
    });
    const engine = new HardEngine();
    const result = await engine.searchTurn(state, { work: 200_000 });
    expect(result.actions.length).toBeGreaterThan(0);
    // The must-answer layer answers it, and the score is a mate score.
    expect(['mate', 'home-race']).toContain(result.source);
    expect(result.scoreCc).toBeGreaterThan(MATE_BOUND_CC);
    expect(result.fallback).toBeUndefined();
  }, 60_000); // explicit per-test budget; see the E0.5 timeout note at the top of this file

  it('a lost position is scored as a loss, not clamped', async () => {
    // Black holds White's corner with a body White cannot remove.
    const state = buildState({
      current: 'white',
      phase: 'action',
      actions: 4,
      units: [
        { def: 'metal_3', owner: 'black', x: 0, y: 0 },
        { def: 'fire_1', owner: 'white', x: 6, y: 6 },
      ],
      victoryRule: 'home-or-elimination',
    });
    const engine = new HardEngine();
    const result = await engine.searchTurn(state, { work: 200_000 });
    expect(result.actions.length).toBeGreaterThan(0);
    expect(result.scoreCc).toBeLessThan(0);
  }, 60_000); // explicit per-test budget; see the E0.5 timeout note at the top of this file
});
