// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  ALL_GAME_IDS, MODEL_FAMILY, PILOT_TABLE, activeCount, admissionTrace, allSettled, buildSchedule,
  gameId, llmDisplayName, llmSeatFor, engineSeatFor, nextAdmissible, pairById, parseGameId, syncSchedule, validateTickets,
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
  const pilot = buildSchedule(PILOT_TABLE).games;
  const luna = pilot.filter(g => MODEL_FAMILY[g.model] === 'codex');
  const sonnet = pilot.filter(g => MODEL_FAMILY[g.model] === 'claude');
  it('initially admits the first pair of each family (P01 Luna, P02 Sonnet)', () => {
    const snapshot: StatusSnapshot = {};
    expect(nextAdmissible(luna, snapshot)).toBe('P01-W');
    expect(nextAdmissible(sonnet, snapshot)).toBe('P02-W');
  });
  it('prioritizes a started pair\'s remaining leg over a fresh pair', () => {
    expect(nextAdmissible(luna, { 'P01-W': 'live' })).toBe('P01-B');
  });
  it('moves to the next pair once both legs of the current one are active/settled', () => {
    expect(nextAdmissible(luna, { 'P01-W': 'finished', 'P01-B': 'live' })).toBe('P03-W');
  });
  it('returns null once every game in the queue is active or settled', () => {
    const snapshot = Object.fromEntries(luna.map(g => [g.gameId, 'finished'])) as StatusSnapshot;
    expect(nextAdmissible(luna, snapshot)).toBeNull();
  });
  it('counts only active (not settled) games', () => {
    const snapshot: StatusSnapshot = { 'P01-W': 'live', 'P01-B': 'preparing', 'P02-W': 'finished' };
    expect(activeCount(luna, snapshot)).toBe(2);
    expect(activeCount(sonnet, snapshot)).toBe(0);
  });
  it('skips held games and honours single-leg tickets and leg order', () => {
    const games = buildSchedule([
      { id: 'AS01', model: 'astra', blackCrystalHandicap: 6, toolTier: 'centaur', effort: 'high', legs: ['W'], hold: 'brief pending' },
      { id: 'SO01', model: 'sol', blackCrystalHandicap: 5, toolTier: 'harnessed', effort: 'medium', legs: ['B', 'W'] },
    ]).games;
    expect(games.map(g => g.gameId)).toEqual(['AS01-W', 'SO01-B', 'SO01-W']);
    expect(nextAdmissible(games, {})).toBe('SO01-B');
    expect(nextAdmissible(games, { 'SO01-B': 'live' })).toBe('SO01-W');
    expect(nextAdmissible(games, { 'SO01-B': 'live', 'SO01-W': 'live' })).toBeNull();
  });
  it('admissionTrace alternates families one game at a time', () => {
    const trace = admissionTrace(buildSchedule(PILOT_TABLE));
    expect(trace.slice(0, 4)).toEqual(['P01-W', 'P02-W', 'P01-B', 'P02-B']);
    expect(trace).toHaveLength(16);
  });
  it('allSettled is false until every game is finished/failed/interrupted', () => {
    const snapshot: StatusSnapshot = Object.fromEntries(ALL_GAME_IDS.map(id => [id, 'finished'])) as StatusSnapshot;
    expect(allSettled(snapshot)).toBe(true);
    snapshot['P08-B'] = 'live';
    expect(allSettled(snapshot)).toBe(false);
  });
});

describe('buildSchedule', () => {
  it('produces 16 pilot games whose llmSeat/engineSeat are always opposite', () => {
    const schedule = buildSchedule(PILOT_TABLE);
    expect(schedule.games).toHaveLength(16);
    for (const g of schedule.games) expect(g.llmSeat).not.toBe(g.engineSeat);
  });
  it('carries a ticket\'s brief and clock onto its games', () => {
    const [game] = buildSchedule([{ id: 'FB01', model: 'fable', blackCrystalHandicap: 6, toolTier: 'centaur', effort: 'high', legs: ['B'], brief: 'probe it', clock: '120/1800' }]).games;
    expect(game).toMatchObject({ gameId: 'FB01-B', llmSeat: 'black', brief: 'probe it', timeControl: { delaySeconds: 120, bankSeconds: 1800 } });
  });
});

describe('validateTickets', () => {
  it('rejects ids with dashes, duplicates, unknown models, bad handicaps and bad legs', () => {
    const ok = { id: 'LU01', model: 'luna', blackCrystalHandicap: 3, toolTier: 'bare', effort: 'low' } as const;
    expect(() => validateTickets([ok])).not.toThrow();
    expect(() => validateTickets([{ ...ok, id: 'LU-01' }])).toThrow(/letters/);
    expect(() => validateTickets([ok, ok])).toThrow(/Duplicate/);
    expect(() => validateTickets([{ ...ok, model: 'gpt-6-luna' as never }])).toThrow(/unknown model/);
    expect(() => validateTickets([{ ...ok, blackCrystalHandicap: 99 }])).toThrow(/handicap/);
    expect(() => validateTickets([{ ...ok, legs: [] }])).toThrow(/legs/);
  });
});

describe('syncSchedule', () => {
  const ticket = { id: 'LU01', model: 'luna', blackCrystalHandicap: 3, toolTier: 'bare', effort: 'low', brief: 'old' } as const;
  it('freezes started games, updates pending ones, and records each change', () => {
    const saved = buildSchedule([ticket]);
    const states: Record<string, 'pending' | 'live'> = { 'LU01-W': 'live', 'LU01-B': 'pending' };
    const { schedule, changes } = syncSchedule(saved, [{ ...ticket, brief: 'new' }], id => states[id] ?? 'pending');
    expect(schedule.games.find(g => g.gameId === 'LU01-W')!.brief).toBe('old');
    expect(schedule.games.find(g => g.gameId === 'LU01-B')!.brief).toBe('new');
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatch(/^changed LU01-B/);
  });
  it('drops removed pending games but never a started one', () => {
    const saved = buildSchedule([ticket]);
    const { schedule, changes } = syncSchedule(saved, [], id => (id === 'LU01-W' ? 'live' : 'pending'));
    expect(schedule.games.map(g => g.gameId)).toEqual(['LU01-W']);
    expect(changes).toEqual(['removed pending LU01-B']);
  });
});

describe('display names for every wave-1 model', () => {
  it('matches the owner\'s title-case table', () => {
    expect(llmDisplayName('sol', 'medium')).toBe('Sol 6 Medium');
    expect(llmDisplayName('opus', 'high')).toBe('Opus 5.5 High');
    expect(llmDisplayName('astra', 'high')).toBe('Astra 6 High');
    expect(llmDisplayName('fable', 'high')).toBe('Fable 5.1 High');
  });
});

describe('parseClock', () => {
  it('reads "delay/bank" within server limits and rejects anything else', async () => {
    const { parseClock } = await import('../../tools/llm-pilot/pilot');
    expect(parseClock(undefined)).toBeUndefined();
    expect(parseClock('60/1800')).toEqual({ delaySeconds: 60, bankSeconds: 1800 });
    expect(() => parseClock('60m/30m')).toThrow();
    expect(() => parseClock('900/1800')).toThrow();
  });
});
