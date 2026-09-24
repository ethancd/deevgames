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

const { loadTickets, waveEngineDefault, buildSchedule, waveJsonPath } = await import('../../tools/llm-pilot/pilot');

const okTicket = { id: 'ST01', model: 'sonnet', blackCrystalHandicap: 3, toolTier: 'bare', effort: 'low' } as const;
function writeWave(wave: unknown): void { writeFileSync(waveJsonPath(), JSON.stringify(wave, null, 2)); }
afterEach(() => { rmSync(waveJsonPath(), { force: true }); });

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
