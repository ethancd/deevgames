import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  PHASING_AI_LOG_PREFIX, PHASING_AI_QUERY_PARAM, PHASING_AI_STORAGE_KEY,
  PHASING_PREVIEW_BADGE, readPhasingAiPreview,
} from '../../src/ai/phasingPreview';
import { createInitialGameState } from '../../src/game/board';
import { applyAction } from '../../src/ai/simulate';
import {
  PREPARE_RESERVE_DIVISOR, fallbackDecisionsRemaining, prepareReserveMs,
  segmentsAfter, turnSearchAllowance,
} from '../../src/ai/turnFunding';
import type { GameState } from '../../src/game/types';

/**
 * THE OPT-IN, and the funding arithmetic it makes reachable.
 *
 * The opt-in is the whole safety story of the preview: DEFAULT OFF, two
 * spellings, nothing else. Every assertion below that says "off" is an
 * assertion that a normal player's build is byte for byte what it was.
 */
beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, '', '/muju/');
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

it('is off by default, and says nothing', () => {
  expect(readPhasingAiPreview()).toBe(false);
  expect(console.warn).not.toHaveBeenCalled();
});

it('turns on from ?phasingAi=1, and persists so the query is not needed again', () => {
  window.history.replaceState({}, '', `/muju/?${PHASING_AI_QUERY_PARAM}=1`);
  expect(readPhasingAiPreview()).toBe(true);
  expect(localStorage.getItem(PHASING_AI_STORAGE_KEY)).toBe('1');
  window.history.replaceState({}, '', '/muju/');
  expect(readPhasingAiPreview()).toBe(true);
});

it('turns on from localStorage["muju.phasingAi"] === "1"', () => {
  localStorage.setItem(PHASING_AI_STORAGE_KEY, '1');
  expect(readPhasingAiPreview()).toBe(true);
});

it('?phasingAi=0 turns it off AND clears the stored flag', () => {
  localStorage.setItem(PHASING_AI_STORAGE_KEY, '1');
  window.history.replaceState({}, '', `/muju/?${PHASING_AI_QUERY_PARAM}=0`);
  expect(readPhasingAiPreview()).toBe(false);
  expect(localStorage.getItem(PHASING_AI_STORAGE_KEY)).toBeNull();
  // And it stays off once the query string is gone.
  window.history.replaceState({}, '', '/muju/');
  expect(readPhasingAiPreview()).toBe(false);
});

it('treats any other value as no instruction at all, and leaves storage alone', () => {
  for (const value of ['true', 'yes', '', '2', 'on', 'off']) {
    localStorage.setItem(PHASING_AI_STORAGE_KEY, 'sentinel');
    window.history.replaceState({}, '', `/muju/?${PHASING_AI_QUERY_PARAM}=${value}`);
    expect(readPhasingAiPreview()).toBe(false);
    expect(localStorage.getItem(PHASING_AI_STORAGE_KEY)).toBe('sentinel');
  }
});

it('warns once, with the preview prefix and no strength guarantee, only when it is on', () => {
  expect(readPhasingAiPreview()).toBe(false);
  expect(console.warn).not.toHaveBeenCalled();
  window.history.replaceState({}, '', `/muju/?${PHASING_AI_QUERY_PARAM}=1`);
  expect(readPhasingAiPreview()).toBe(true);
  const lines = vi.mocked(console.warn).mock.calls.map(call => String(call[0]));
  expect(lines).toHaveLength(1);
  expect(lines[0].startsWith(PHASING_AI_LOG_PREFIX)).toBe(true);
  expect(lines[0]).toContain('UNRELEASED PREVIEW');
  expect(lines[0]).toContain('NO STRENGTH GUARANTEE');
});

it('stays off rather than throwing when site data is blocked', () => {
  const blocked = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('SecurityError'); });
  const blockedSet = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('SecurityError'); });
  expect(readPhasingAiPreview()).toBe(false);
  // The query string still governs the page it is on, storage or no storage.
  window.history.replaceState({}, '', `/muju/?${PHASING_AI_QUERY_PARAM}=1`);
  expect(readPhasingAiPreview()).toBe(true);
  blocked.mockRestore(); blockedSet.mockRestore();
});

it('names the badge the mode screen shows', () => {
  expect(PHASING_PREVIEW_BADGE).toBe('Preview · unreleased AI');
});

/* ------------------------------------------------------------------------ *
 * ONE ALLOWANCE ACROSS A PHASING TURN (`src/ai/turnFunding.ts`).
 * ------------------------------------------------------------------------ */

/** Act → END_ACTION_PHASE lands the mover in Prepare, past mining and upkeep. */
function phasingPrepare(): GameState {
  return applyAction(createInitialGameState(undefined, 4, 0, 'phasing'), { type: 'END_ACTION_PHASE' });
}

it('counts the Phasing segments still to be searched after the current one', () => {
  const act = createInitialGameState(undefined, 4, 0, 'phasing');
  expect(act.turn.phase).toBe('action');
  expect(segmentsAfter(act)).toBe(2);                                   // upkeep + Prepare
  expect(segmentsAfter({ ...act, upkeepPending: true })).toBe(1);       // Prepare
  const prepare = phasingPrepare();
  expect(prepare.turn.phase).toBe('place');
  expect(segmentsAfter(prepare)).toBe(0);                               // last segment
});

it('reserves nothing at all under Standard, in either phase', () => {
  const standard = createInitialGameState();
  expect(segmentsAfter(standard)).toBe(0);
  expect(segmentsAfter({ ...standard, turn: { ...standard.turn, phase: 'place' } })).toBe(0);
  expect(segmentsAfter({ ...standard, upkeepPending: true })).toBe(0);
  expect(prepareReserveMs(standard, 30_000)).toBe(0);
  // …so a Standard search still asks for the whole remainder, exactly as the
  // hook's old `Math.max(MIN_TURN_SEARCH_MS, remainingCPU)` did.
  expect(turnSearchAllowance(standard, 12_345, 30_000, 1)).toBe(12_345);
  expect(turnSearchAllowance(standard, 0, 30_000, 1)).toBe(1);
});

it('leaves a floor for the later Phasing segments and gives the last one the whole remainder', () => {
  const budget = 8000, eighth = budget / PREPARE_RESERVE_DIVISOR;
  const act = createInitialGameState(undefined, 4, 0, 'phasing');
  // Act keeps three quarters of a full turn; the upkeep decision and Prepare
  // each keep an eighth it cannot touch.
  expect(turnSearchAllowance(act, budget, budget, 1)).toBe(budget - 2 * eighth);
  expect(turnSearchAllowance({ ...act, upkeepPending: true }, budget, budget, 1)).toBe(budget - eighth);
  expect(turnSearchAllowance(phasingPrepare(), budget, budget, 1)).toBe(budget);
});

it('never asks for more than the turn has left, and never for zero', () => {
  const act = createInitialGameState(undefined, 4, 0, 'phasing');
  for (const remaining of [0, 1, 50, 900, 3000]) {
    const asked = turnSearchAllowance(act, remaining, 3000, 1);
    expect(asked).toBeLessThanOrEqual(Math.max(1, remaining));
    expect(asked).toBeGreaterThanOrEqual(1);
  }
});

it('splits the per-action fallback by the decisions actually still to come', () => {
  const standard = createInitialGameState();
  // Standard is byte for byte what the hook computed inline before.
  expect(fallbackDecisionsRemaining({ ...standard, turn: { ...standard.turn, phase: 'action', actionsRemaining: 3 } })).toBe(3);
  expect(fallbackDecisionsRemaining({ ...standard, turn: { ...standard.turn, phase: 'action', actionsRemaining: 0 } })).toBe(1);
  expect(fallbackDecisionsRemaining({ ...standard, turn: { ...standard.turn, phase: 'place' } })).toBe(4);

  // Phasing counts the upkeep decision and Prepare as well, so ending Act can
  // never hand the whole remainder to the Act actions.
  const act = createInitialGameState(undefined, 4, 0, 'phasing');
  expect(fallbackDecisionsRemaining(act)).toBe(act.turn.actionsRemaining + 3);
  expect(fallbackDecisionsRemaining({ ...act, upkeepPending: true, turn: { ...act.turn, phase: 'place' } })).toBe(3);
  expect(fallbackDecisionsRemaining(phasingPrepare())).toBe(2);
});
