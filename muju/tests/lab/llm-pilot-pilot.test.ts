// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  ALL_GAME_IDS, PILOT_TABLE, activeCountFor, admissionTrace, allSettled, buildSchedule,
  gameId, llmDisplayName, llmSeatFor, engineSeatFor, nextAdmissible, pairById, parseGameId,
  type StatusSnapshot,
} from '../../tools/llm-pilot/pilot';

describe('pilot table', () => {
  it('has 8 pairs, 2 legs each, 16 games total, matching the pilot prompt table', () => {
    expect(PILOT_TABLE).toHaveLength(8);
    expect(ALL_GAME_IDS).toHaveLength(16);
    expect(new Set(ALL_GAME_IDS).size).toBe(16);
  });
  it('keeps the same crystal handicap on both legs of a pair — only the LLM seat changes', () => {
    for (const pair of PILOT_TABLE) {
      expect(llmSeatFor('W')).toBe('white');
      expect(llmSeatFor('B')).toBe('black');
      expect(engineSeatFor('W')).toBe('black');
      expect(engineSeatFor('B')).toBe('white');
      expect(pairById(pair.id).blackCrystalHandicap).toBe(pair.blackCrystalHandicap);
    }
  });
  it('parses game ids back to their pair and leg', () => {
    expect(parseGameId(gameId('P03', 'B'))).toEqual({ pairId: 'P03', leg: 'B' });
  });
  it('builds display names under the 40-char room limit', () => {
    expect(llmDisplayName('sonnet', 'low')).toBe('Sonnet 5 Low');
    expect(llmDisplayName('luna', 'high')).toBe('Luna 6 High');
  });
});

describe('admission ordering', () => {
  it('initially admits both legs of the first pair for each model (P01 Luna, P02 Sonnet)', () => {
    const snapshot: StatusSnapshot = {};
    expect(nextAdmissible('luna', snapshot)).toBe('P01-W');
    expect(nextAdmissible('sonnet', snapshot)).toBe('P02-W');
  });
  it('prioritizes a started pair\'s remaining leg over a fresh pair', () => {
    const snapshot: StatusSnapshot = { 'P01-W': 'live' };
    expect(nextAdmissible('luna', snapshot)).toBe('P01-B');
  });
  it('moves to the next pair once both legs of the current one are active/settled', () => {
    const snapshot: StatusSnapshot = { 'P01-W': 'finished', 'P01-B': 'live' };
    expect(nextAdmissible('luna', snapshot)).toBe('P03-W');
  });
  it('returns null once every game for a model is active or settled', () => {
    const snapshot: StatusSnapshot = Object.fromEntries(
      PILOT_TABLE.filter(p => p.model === 'luna').flatMap(p => [[gameId(p.id, 'W'), 'finished'], [gameId(p.id, 'B'), 'finished']]),
    ) as StatusSnapshot;
    expect(nextAdmissible('luna', snapshot)).toBeNull();
  });
  it('respects two-per-model concurrency counting only active (not settled) games', () => {
    const snapshot: StatusSnapshot = { 'P01-W': 'live', 'P01-B': 'preparing', 'P02-W': 'finished' };
    expect(activeCountFor('luna', snapshot)).toBe(2);
    expect(activeCountFor('sonnet', snapshot)).toBe(0);
  });
  it('admissionTrace interleaves models per tick, each draining its own pair-then-leg priority', () => {
    // One admission per model per simulated tick: luna, sonnet, luna, sonnet, ...
    const trace = admissionTrace();
    expect(trace.slice(0, 4)).toEqual(['P01-W', 'P02-W', 'P01-B', 'P02-B']);
    expect(trace).toHaveLength(16);
    expect(trace.filter((_, i) => i % 2 === 0).every(id => id.startsWith('P0') && ['P01', 'P03', 'P05', 'P07'].includes(id.slice(0, 3)))).toBe(true);
  });
  it('allSettled is false until every one of the 16 games is finished/failed/interrupted', () => {
    const snapshot: StatusSnapshot = Object.fromEntries(ALL_GAME_IDS.map(id => [id, 'finished'])) as StatusSnapshot;
    expect(allSettled(snapshot)).toBe(true);
    snapshot['P08-B'] = 'live';
    expect(allSettled(snapshot)).toBe(false);
  });
});

describe('buildSchedule', () => {
  it('produces 16 games whose llmSeat/engineSeat are always opposite', () => {
    const schedule = buildSchedule();
    expect(schedule.games).toHaveLength(16);
    for (const g of schedule.games) expect(g.llmSeat).not.toBe(g.engineSeat);
  });
});
