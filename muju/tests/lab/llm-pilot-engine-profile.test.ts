// @vitest-environment node
/**
 * STRATEGOS W1.14 (plan `~/.claude/plans/can-you-respond-to-piped-book.md`, "Then Ethan runs LLM
 * wave 2 against it"): per-game engine profile, resolved from wave.json at schedule-load time,
 * before any room is created. Own campaign dir (mkdtempSync, like llm-pilot-dispatch.test.ts) so
 * writing a wave.json here never touches a real campaign under outputs/.
 */
import { describe, expect, it, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.MUJU_PILOT_CAMPAIGN_DIR = mkdtempSync(join(tmpdir(), 'muju-llm-pilot-engine-profile-'));

const { loadTickets, waveEngineDefault, buildSchedule, waveJsonPath, syncSchedule, engineConfigPath, gameDir, readJson } = await import('../../tools/llm-pilot/pilot');
const { prepareGame } = await import('../../tools/llm-pilot/dispatch');
const { seatConfigSchema } = await import('../../tools/engine-seat/config');

const okTicket = { id: 'ST01', model: 'sonnet', blackCrystalHandicap: 3, toolTier: 'bare', effort: 'low' } as const;
function writeWave(wave: unknown): void { writeFileSync(waveJsonPath(), JSON.stringify(wave, null, 2)); }
const originalFetch = globalThis.fetch;
afterEach(() => { rmSync(waveJsonPath(), { force: true }); globalThis.fetch = originalFetch; });

describe('wave-level engine profile default (wave.json top-level "engine": { "profile": … })', () => {
  it('is undefined with no wave.json, and with a wave.json that sets none', () => {
    expect(waveEngineDefault()).toBeUndefined();
    writeWave({ tickets: [okTicket] });
    expect(waveEngineDefault()).toBeUndefined();
  });
  it('reads a valid wave-level default', () => {
    writeWave({ tickets: [okTicket], engine: { profile: 'strategos' } });
    expect(waveEngineDefault()).toBe('strategos');
  });
  it('refuses an unknown wave-level default at load time (before any room is created)', () => {
    writeWave({ tickets: [okTicket], engine: { profile: 'nonsense' } });
    expect(() => waveEngineDefault()).toThrow(/unknown label/);
  });
  it('refuses "env" as a wave-level default, same rule as a ticket\'s own field', () => {
    writeWave({ tickets: [okTicket], engine: { profile: 'env' } });
    expect(() => waveEngineDefault()).toThrow(/refused/);
  });
  it('refuses an empty wave-level profile and a non-object "engine" rather than silently running desktop', () => {
    writeWave({ tickets: [okTicket], engine: { profile: '' } });
    expect(() => waveEngineDefault()).toThrow(/non-empty string/);
    writeWave({ tickets: [okTicket], engine: 'strategos' });
    expect(() => waveEngineDefault()).toThrow(/must be an object/);
    expect(() => buildSchedule()).toThrow(/must be an object/);
  });
});

describe('loadTickets refuses a bad ticket-level engineProfile at load time', () => {
  it('refuses an unknown label', () => {
    writeWave({ tickets: [{ ...okTicket, engineProfile: 'nonsense' }] });
    expect(() => loadTickets()).toThrow(/unknown label/);
  });
  it('refuses "env"', () => {
    writeWave({ tickets: [{ ...okTicket, engineProfile: 'env' }] });
    expect(() => loadTickets()).toThrow(/refused/);
  });
});

describe('buildSchedule() (no args) applies the wave-level default to every ticket that sets none', () => {
  it('a ticket with its own engineProfile keeps it; a ticket with none gets the wave default', () => {
    writeWave({
      tickets: [{ ...okTicket, legs: ['W'] }, { ...okTicket, id: 'ST02', legs: ['W'], engineProfile: 'phone' }],
      engine: { profile: 'strategos' },
    });
    const schedule = buildSchedule();
    expect(schedule.games.find(g => g.gameId === 'ST01-W')!.engineProfile).toBe('strategos');
    expect(schedule.games.find(g => g.gameId === 'ST02-W')!.engineProfile).toBe('phone');
  });
});

describe('syncSchedule (what the dispatcher runs every tick) and the wave-level default', () => {
  it('a pending game takes a newly set wave default; a started game keeps the profile it started with', () => {
    writeWave({ tickets: [{ ...okTicket, id: 'SY01' }] });
    const first = syncSchedule(undefined, loadTickets(), () => 'pending').schedule;
    expect(first.games.map(g => g.engineProfile)).toEqual([undefined, undefined]);
    writeWave({ tickets: [{ ...okTicket, id: 'SY01' }], engine: { profile: 'strategos' } });
    const { schedule, changes } = syncSchedule(first, loadTickets(), id => (id === 'SY01-W' ? 'live' : 'pending'));
    expect(schedule.games.find(g => g.gameId === 'SY01-W')!.engineProfile).toBeUndefined();
    expect(schedule.games.find(g => g.gameId === 'SY01-B')!.engineProfile).toBe('strategos');
    expect(changes).toEqual([expect.stringMatching(/^changed SY01-B: .*"engineProfile":"strategos"/)]);
  });
});

/** A stand-in for the live room server: records every room-create body and answers create/join. */
function stubRoomServer(): Array<Record<string, unknown>> {
  const created: Array<Record<string, unknown>> = [];
  const reply = (value: unknown) => new Response(JSON.stringify(value), { status: 200, headers: { 'Content-Type': 'application/json' } });
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(input)).pathname;
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    if (path === '/api/muju/rooms') {
      const id = (created.length + 1).toString(16).padStart(32, '0');
      created.push(body);
      return reply({ room: { id, timeControl: body.timeControl }, credentials: { roomId: id, player: body.side, token: 'e'.repeat(32) }, inviteCode: 'invite' });
    }
    const join = /^\/api\/muju\/rooms\/([a-f0-9]{32})\/join$/.exec(path);
    if (join) return reply({ room: { id: join[1] }, credentials: { roomId: join[1], player: 'black', token: 'p'.repeat(32) } });
    throw new Error(`unexpected request to ${path}`);
  }) as typeof fetch;
  return created;
}

describe('the dispatcher path end to end: wave.json -> syncSchedule -> prepareGame -> room, engine-seat config, manifest', () => {
  it('a wave-default strategos game reaches the seat as strategos; a ticket that opts back out stays desktop', async () => {
    writeWave({ tickets: [{ ...okTicket, id: 'SG01', legs: ['B'] }, { ...okTicket, id: 'DT01', legs: ['B'], engineProfile: 'desktop' }],
      engine: { profile: 'strategos' } });
    const { schedule } = syncSchedule(undefined, loadTickets(), () => 'pending');
    const created = stubRoomServer();
    for (const game of schedule.games) await prepareGame(game, 1);
    // The name the room shows the LLM for its opponent.
    expect(created.map(body => body.name)).toEqual(['Hard (strategos)', 'Hard']);
    const configOf = (id: string) => readJson<Record<string, unknown>>(engineConfigPath(id as never))!;
    const engineOf = (id: string) => readJson<{ engine: Record<string, unknown> }>(`${gameDir(id as never)}/manifest.json`)!.engine;
    // Parsed by the engine seat's own schema, exactly as tools/engine-seat/main.ts reads the file.
    expect(configOf('SG01-B').profile).toBe('strategos');
    expect(seatConfigSchema.parse(configOf('SG01-B')).profile).toBe('strategos');
    expect(engineOf('SG01-B')).toMatchObject({ name: 'Hard (strategos)', profile: 'strategos' });
    expect('profile' in configOf('DT01-B')).toBe(false);
    expect(seatConfigSchema.parse(configOf('DT01-B')).profile).toBe('desktop');
    expect(engineOf('DT01-B')).toMatchObject({ name: 'Hard', profile: 'desktop' });
  });
});
