// @vitest-environment node
import { describe, expect, it, vi, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.MUJU_PILOT_CAMPAIGN_DIR = mkdtempSync(join(tmpdir(), 'muju-llm-pilot-dispatch-'));

const { productionRulesId, assertProductionRulesGate, buildEngineConfig, siteHealthOk } = await import('../../tools/llm-pilot/dispatch');
const { PHASING_RULES_VERSION } = await import('../../server/rooms');
const { llmSeatFor, engineSeatFor, gameId } = await import('../../tools/llm-pilot/pilot');

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; vi.restoreAllMocks(); });

function stubMcpRulesResponse(revision: string | undefined, ok = true) {
  globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
    result: revision === undefined ? {} : { structuredContent: { ruleset: { revision } } },
  }), { status: ok ? 200 : 500 })) as unknown as typeof fetch;
}

describe('launch gate (SPEC.md: uncapped Cleave must be in production first)', () => {
  it('reads the ruleset revision from a live /mcp muju_rules call', async () => {
    stubMcpRulesResponse('muju-phasing-3');
    await expect(productionRulesId()).resolves.toBe('muju-phasing-3');
  });
  it('opens when production matches this checkout\'s pinned PHASING_RULES_VERSION', async () => {
    stubMcpRulesResponse(PHASING_RULES_VERSION);
    await expect(assertProductionRulesGate()).resolves.toBeUndefined();
  });
  it('refuses to admit when production is on a different rules revision', async () => {
    stubMcpRulesResponse('muju-phasing-2');
    await expect(assertProductionRulesGate()).rejects.toThrow(/Launch gate closed/);
  });
  it('throws a clear error when the probe returns no ruleset revision at all', async () => {
    stubMcpRulesResponse(undefined);
    await expect(productionRulesId()).rejects.toThrow(/no ruleset.revision/);
  });
});

describe('engine-seat config seam (Component A)', () => {
  it('writes a "pinned" contract with the pilot\'s clocks/policy/handicap and never the M7-passed literal', () => {
    const game = { gameId: gameId('P02', 'W'), pairId: 'P02' as const, model: 'sonnet' as const, toolTier: 'bare' as const,
      effort: 'low' as const, blackCrystalHandicap: 2, llmSeat: llmSeatFor('W'), engineSeat: engineSeatFor('W') };
    const config = buildEngineConfig(game, 'a'.repeat(32), { player: 'black', token: 'x'.repeat(32) }) as Record<string, unknown>;
    expect(config.mode).toBe('pinned');
    expect(config.phasingHardReadiness).toBeUndefined();
    expect((config.researchReadiness as Record<string, unknown>)?.kind).toBe('research');
    expect(config.expectedHandicap).toBe(2);
    expect(config.expectedTimeControl).toEqual({ delaySeconds: 600, bankSeconds: 3600 });
  });
});

describe('siteHealthOk', () => {
  it('is healthy with no samples yet', () => {
    expect(siteHealthOk([]).ok).toBe(true);
  });
  it('throttles admission once recent 429/5xx rate is high', () => {
    const samples = Array.from({ length: 20 }, (_, i) => ({ at: '', status: i < 10 ? 429 : 200, latencyMs: 100 }));
    expect(siteHealthOk(samples).ok).toBe(false);
  });
  it('throttles admission once p95 latency is high', () => {
    const samples = Array.from({ length: 16 }, () => ({ at: '', status: 200, latencyMs: 50 }))
      .concat(Array.from({ length: 4 }, () => ({ at: '', status: 200, latencyMs: 9000 })));
    expect(siteHealthOk(samples, { p95LatencyMsThreshold: 5000 }).ok).toBe(false);
  });
});

describe('GPT quota admission (ChatGPT subscription only, no paid credits)', () => {
  it('admits with headroom, holds at the cap, and halts if the credits balance moves', async () => {
    const { gptQuotaDecision } = await import('../../tools/llm-pilot/dispatch');
    const base = { primary: { used_percent: 1 }, credits: { balance: '100.0' } };
    expect(gptQuotaDecision(undefined, undefined).ok).toBe(true);
    expect(gptQuotaDecision({ primary: { used_percent: 40 }, credits: { balance: '100.0' } }, base).ok).toBe(true);
    expect(gptQuotaDecision({ primary: { used_percent: 70 }, credits: { balance: '100.0' } }, base, 70).ok).toBe(false);
    expect(gptQuotaDecision({ primary: { used_percent: 5 }, credits: { balance: '99.5' } }, base).detail).toMatch(/credits balance changed/);
    expect(gptQuotaDecision({ primary: { used_percent: 5 }, rate_limit_reached_type: 'primary' }, base).ok).toBe(false);
  });
});

describe('classifyResult (review fix: engine/provider failures must not look like a fair win/loss)', () => {
  it('marks a "win" as engine-failure when it came from the ENGINE\'s own clock timing out', async () => {
    const { classifyResult } = await import('../../tools/llm-pilot/dispatch');
    const game = { gameId: gameId('P01', 'W'), pairId: 'P01' as const, model: 'luna' as const, toolTier: 'bare' as const,
      effort: 'low' as const, blackCrystalHandicap: 1, llmSeat: llmSeatFor('W'), engineSeat: engineSeatFor('W') };
    const room = { state: { phase: 'victory', winner: 'white', victoryReason: 'timeout' } } as never;
    const player = { outcome: 'completed' } as never;
    expect(classifyResult('win', room, game, false, player)).toBe('engine-failure');
  });
  it('marks a "win" as engine-failure whenever the engine spent its whole restart budget, even without a timeout reason', async () => {
    const { classifyResult } = await import('../../tools/llm-pilot/dispatch');
    const game = { gameId: gameId('P01', 'W'), pairId: 'P01' as const, model: 'luna' as const, toolTier: 'bare' as const,
      effort: 'low' as const, blackCrystalHandicap: 1, llmSeat: llmSeatFor('W'), engineSeat: engineSeatFor('W') };
    const room = { state: { phase: 'victory', winner: 'white', victoryReason: 'elimination' } } as never;
    const player = { outcome: 'completed' } as never;
    expect(classifyResult('win', room, game, true, player)).toBe('engine-failure');
  });
  it('marks a "loss" as provider-failure when it came from the LLM\'s own clock timing out under a failed player harness', async () => {
    const { classifyResult } = await import('../../tools/llm-pilot/dispatch');
    const game = { gameId: gameId('P01', 'W'), pairId: 'P01' as const, model: 'luna' as const, toolTier: 'bare' as const,
      effort: 'low' as const, blackCrystalHandicap: 1, llmSeat: llmSeatFor('W'), engineSeat: engineSeatFor('W') };
    const room = { state: { phase: 'victory', winner: 'black', victoryReason: 'timeout' } } as never;
    const player = { outcome: 'failed' } as never;
    expect(classifyResult('loss', room, game, false, player)).toBe('provider-failure');
  });
  it('leaves a genuine win/loss/draw alone', async () => {
    const { classifyResult } = await import('../../tools/llm-pilot/dispatch');
    const game = { gameId: gameId('P01', 'W'), pairId: 'P01' as const, model: 'luna' as const, toolTier: 'bare' as const,
      effort: 'low' as const, blackCrystalHandicap: 1, llmSeat: llmSeatFor('W'), engineSeat: engineSeatFor('W') };
    const room = { state: { phase: 'victory', winner: 'white', victoryReason: 'elimination' } } as never;
    const player = { outcome: 'completed' } as never;
    expect(classifyResult('win', room, game, false, player)).toBe('win');
    // A real loss on the engine's timeout (LLM's own bank ran out) is a fair result, not a failure.
    const lossRoom = { state: { phase: 'victory', winner: 'black', victoryReason: 'timeout' } } as never;
    expect(classifyResult('loss', lossRoom, game, false, player)).toBe('loss');
  });
});

describe('turnsFromHistory (review fix: staged commits never pass through actions.jsonl)', () => {
  it('counts distinct turnNumbers for the given seat, ignoring the other seat and duplicate entries within one turn', async () => {
    const { turnsFromHistory } = await import('../../tools/llm-pilot/dispatch');
    const entries = [
      { revision: 1, player: 'white' as const, turnNumber: 1 },
      { revision: 2, player: 'black' as const, turnNumber: 1 },
      { revision: 3, player: 'white' as const, turnNumber: 2 },
      { revision: 4, player: 'white' as const, turnNumber: 2 }, // a staged batch can fire as several history entries in one turn
      { revision: 5, player: 'black' as const, turnNumber: 2 },
    ];
    expect(turnsFromHistory(entries, 'white')).toBe(2);
    expect(turnsFromHistory(entries, 'black')).toBe(2);
  });
});

describe('site health ignores long-poll latency', () => {
  it('a 25s /changes long-poll is not degradation; a 25s room read is', async () => {
    const { siteHealthOk } = await import('../../tools/llm-pilot/dispatch');
    const at = new Date().toISOString();
    const polls = Array.from({ length: 10 }, () => ({ at, status: 200, latencyMs: 25_000, path: '/r/changes?afterRevision=3' }));
    expect(siteHealthOk([...polls, { at, status: 200, latencyMs: 300, path: '/r' }]).ok).toBe(true);
    expect(siteHealthOk(polls.map(p => ({ ...p, path: '/r' }))).ok).toBe(false);
  });
});

describe('Claude quota admission (claude.ai subscription headroom)', () => {
  it('admits with headroom, holds at the cap, on a non-allowed status, or on overage', async () => {
    const { claudeQuotaDecision } = await import('../../tools/llm-pilot/dispatch');
    const windows = (five: number, seven: number) => ({ five_hour: { utilization: five }, seven_day: { utilization: seven } });
    expect(claudeQuotaDecision(undefined).ok).toBe(true);
    expect(claudeQuotaDecision({ status: 'allowed_warning', unifiedWindows: windows(0.4, 0.56) }, 0.85).ok).toBe(true);
    expect(claudeQuotaDecision({ status: 'allowed', unifiedWindows: windows(0.4, 0.86) }, 0.85).ok).toBe(false);
    expect(claudeQuotaDecision({ status: 'allowed', unifiedWindows: windows(0.9, 0.5) }, 0.85).ok).toBe(false);
    expect(claudeQuotaDecision({ status: 'rejected', unifiedWindows: windows(0.1, 0.1) }, 0.85).ok).toBe(false);
    expect(claudeQuotaDecision({ status: 'allowed', isUsingOverage: true }, 0.85).ok).toBe(false);
  });
});

describe('timeoutDuringOutage (outages are pauses, never results)', () => {
  it('labels a clock-decided game with a network failure inside the losing turn\'s span, and nothing else', async () => {
    const { timeoutDuringOutage } = await import('../../tools/llm-pilot/dispatch');
    const clock = { delaySeconds: 60, bankSeconds: 1800 };
    const endedAt = Date.parse('2026-09-24T03:00:00Z');
    const room = (reason: string) => ({ updatedAt: new Date(endedAt).toISOString(), state: { victoryReason: reason } }) as never;
    const during = [{ at: new Date(endedAt - 20 * 60_000).toISOString() }];
    const longBefore = [{ at: new Date(endedAt - 3 * 60 * 60_000).toISOString() }];
    expect(timeoutDuringOutage(room('timeout'), clock, during)).toBe(true);
    expect(timeoutDuringOutage(room('timeout'), clock, longBefore)).toBe(false);
    expect(timeoutDuringOutage(room('elimination'), clock, during)).toBe(false);
  });
});

describe('gptQuotaDecision credits tripwire', () => {
  it('halts on any change in the credits balance, up or down', async () => {
    const { gptQuotaDecision } = await import('../../tools/llm-pilot/dispatch');
    const at = (balance: string) => ({ primary: { used_percent: 3 }, credits: { balance } });
    expect(gptQuotaDecision(at('1022.85'), at('1022.85')).ok).toBe(true);
    expect(gptQuotaDecision(at('1021.00'), at('1022.85')).ok).toBe(false);
    expect(gptQuotaDecision(at('1030.00'), at('1022.85')).ok).toBe(false);
  });
});
