// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createInitialGameState } from '../../src/game/board';
import { phaseEndAction } from '../../src/game/legality';
import { applyAction } from '../../src/ai/simulate';
import { defaultUpkeepAction } from '../../src/game/upkeep';
import { instantiateTactics, type TacticalSolver } from '../../src/ai/wasm/kernel';
import { createGateBot, workSlice, type Searcher } from '../../lab/ai/gate1-bot';
import { schedule, summarize, type Entry, type Mode } from '../../lab/ai/gate1-report';
import { parseArgs, resolvedConfigs, runTask } from '../../lab/ai/gate1';
import { DEFAULT_MATCH_OPTIONS, type GameRecord } from '../../lab/harness/types';

let solver: TacticalSolver;
beforeAll(async () => { solver = await instantiateTactics(readFileSync('src/ai/wasm/tactics.wasm')); });
const initial = () => createInitialGameState(undefined, 4, 0, 'phasing');
const bands = JSON.parse(readFileSync('lab/harness/results/p1-scripted-2026-09-18/sanity-bands.json', 'utf8'));
const refs = { Rush: 458.45121427129516, Expand: null, Balanced: null };

function synthetic(mode: Mode): Entry[] {
  return schedule(mode).map(task => ({ task, identityHash: 'identity', record: {
    ...({} as GameRecord), rulesVersion: 'muju-phasing-1', seed: task.seed, handicap: task.handicap,
    winner: task.hardSeat, completedTurns: 20, winType: 'home-checkmate',
    options: { ...DEFAULT_MATCH_OPTIONS }, anomalies: [], invariantViolation: null,
    adjudicated: false, inactivityDraw: false,
    players: Object.fromEntries((['white', 'black'] as const).map(seat => [seat, {
      bot: seat === task.hardSeat ? 'aiv2-hard' : task.opponent, illegalActions: 0, unitsPlaced: 10,
    }])) as GameRecord['players'],
  } }));
}

describe('allocation and reporting', () => {
  it('fixes 16 pilot and 1,024 full games with two seats sharing each pair seed', () => {
    expect(schedule('pilot')).toHaveLength(16);
    const full = schedule('full');
    expect(full).toHaveLength(1024);
    expect(new Set(full.map(t => t.id)).size).toBe(1024);
    for (let i = 0; i < full.length; i += 2) {
      expect(full[i].seed).toBe(full[i + 1].seed);
      expect(full[i].pairId).toBe(full[i + 1].pairId);
      expect([full[i].hardSeat, full[i + 1].hardSeat]).toEqual(['white', 'black']);
    }
    expect(new Set(full.map(t => t.seed)).size).toBe(512);
    expect(schedule('pilot').some(t => full.some(f => f.seed === t.seed))).toBe(false);
  });
  it('cannot pass on a pilot, missing historical margins, or an unadopted proposal', () => {
    const full = summarize(synthetic('full'), 'full', 'identity', bands, refs);
    expect(full.errors).toEqual([]);
    expect(full.gate1).toBe('blocked-unadopted-amendment');
    expect(full.missingHistoricalReferences).toEqual(['Expand', 'Balanced']);
    expect(full.rows.every(r => r.strengthMet)).toBe(true);
    expect(full.rows.filter(r => r.opponent === 'Expand').every(r => r.historical === 'blocked-missing-reference')).toBe(true);
    expect(summarize(synthetic('pilot'), 'pilot', 'identity', bands, refs).gate1).toBe('pilot-ineligible');
  });
  it.each(['missing', 'duplicate', 'identity', 'seed', 'seat', 'illegal', 'invariant', 'anomaly'] as const)
  ('voids a row with %s evidence', kind => {
    const entries = synthetic('pilot');
    if (kind === 'missing') entries.pop();
    if (kind === 'duplicate') entries.push(entries[0]);
    if (kind === 'identity') entries[0].identityHash = 'other';
    if (kind === 'seed') entries[0].record.seed++;
    if (kind === 'seat') entries[0].record.players.white.bot = 'aiv2-medium';
    if (kind === 'illegal') entries[0].record.players.black.illegalActions++;
    if (kind === 'invariant') entries[0].record.invariantViolation = 'bad';
    if (kind === 'anomaly') entries[0].record.anomalies.push('no-op');
    expect(summarize(entries, 'pilot', 'identity', bands, refs).gate1).toBe('invalid');
  });
  it('checks purchase, inactivity, adjudication and score per handicap, not pooled', () => {
    const entries = synthetic('full');
    for (const e of entries.filter(e => e.task.opponent === 'Rush' && e.task.handicap === 3)) {
      e.record.players[e.task.hardSeat].unitsPlaced = 0;
      e.record.inactivityDraw = true; e.record.winner = null; e.record.adjudicated = true;
    }
    const rows = summarize(entries, 'full', 'identity', bands, refs).rows;
    expect(rows[0].behavioralBandsMet).toBe(true);
    expect(rows[1].behavioralBandsMet).toBe(false);
    expect(rows[1].strengthMet).toBe(false);
    expect(rows[1].adjudicationMet).toBe(false);
    expect(rows[1].elo.n).toBe(64); // Pair, not game, is the sampling unit.
    expect(rows[6].behavioralBandsMet).toBeNull();
  });
  it('rejects ambiguous CLI options and defaults to pilot', () => {
    expect(parseArgs(['--plan']).mode).toBe('pilot');
    for (const args of [[], ['--mode', 'wall'], ['--out'], ['--plan', '--plan'], ['--pairs', '2']]) {
      expect(() => parseArgs(args)).toThrow();
    }
  });
});

describe('fixed-work adapter', () => {
  function fake() {
    const requests: number[] = [], deadlines: number[] = [];
    const engine: Searcher = {
      setSeed() {}, setTacticalSolver() {},
      setConfig(c) { requests.push(c.fixedWork!); },
      async findBestAction(state, deadline) {
        deadlines.push(deadline!);
        return { plan: { actions: [state.upkeepPending ? defaultUpkeepAction(state) : phaseEndAction(state)], score: 0 },
          nodesSearched: 0, timeMs: 999999, depth: 0,
          debug: { planCount: 1, topPlans: [], config: {
            mctsIterations: 1200, mctsTimeLimit: 3000, beamWidth: 50, outputPlans: 20, tacticalDepth: 2,
          } } };
      },
    };
    return { engine, requests, deadlines };
  }
  it('shares allowance across phases, reserves Prepare, and never calls wall mode on exhaustion', async () => {
    const f = fake(), seat = createGateBot('hard', solver, 7, () => f.engine);
    seat.bot.onGameStart('white', 1);
    let state = initial();
    const first = await seat.bot.nextAction(state, 'white');
    state = applyAction(state, first!);
    expect(state.turn.phase).toBe('place');
    await seat.bot.nextAction(state, 'white');
    expect(f.requests).toEqual([1, 3]); // No phase reset to 7.
    for (let i = 0; i < 10; i++) await seat.bot.nextAction(state, 'white');
    expect(f.requests.reduce((a, b) => a + b, 0)).toBe(7);
    expect(f.requests.every(n => n > 0)).toBe(true);
    expect(f.deadlines.every(n => n === Infinity)).toBe(true);
    expect(seat.decisions.at(-1)?.stopReason).toBe('allowance-completion');
    state.turn.turnNumber++;
    await seat.bot.nextAction(state, 'white');
    expect(f.requests.at(-1)).toBe(3); // Actual next turn resets the allowance.
  });
  it('allocates upkeep before interpreting the phase and rejects invalid budgets or states', async () => {
    const state = initial();
    state.upkeepPending = true;
    expect(workSlice(state, 12)).toBe(4);
    for (const n of [0, -1, 1.5, Infinity]) expect(() => createGateBot('hard', solver, n)).toThrow();
    const seat = createGateBot('hard', solver);
    seat.bot.onGameStart('white', 1);
    state.ruleset = 'standard';
    await expect(seat.bot.nextAction(state, 'white')).rejects.toThrow('Phasing');
  });
  it.each(['empty', 'illegal', 'throw', 'deadline'] as const)('fails closed on %s engine output', async kind => {
    const f = fake();
    f.engine.findBestAction = async () => {
      if (kind === 'throw') throw new Error('engine crashed');
      return { plan: { actions: kind === 'empty' ? [] : [{ type: 'END_PLACE_PHASE' }], score: 0 },
        nodesSearched: 0, timeMs: 0, depth: 0,
        debug: { planCount: 0, topPlans: [], config: { mctsIterations: 0, mctsTimeLimit: 0, beamWidth: 0, outputPlans: 0, tacticalDepth: 0 } },
        ...(kind === 'deadline' ? { stats: { iterations: 0, candidates: 0, simulations: 0, evaluations: 0,
          tacticalNodes: 0, turnBoundaries: 0, elapsedMs: 0, stopReason: 'deadline', backend: 'wasm' } as const } : {}) };
    };
    const seat = createGateBot('hard', solver, 7, () => f.engine);
    seat.bot.onGameStart('white', 1);
    await expect(seat.bot.nextAction(initial(), 'white')).rejects.toThrow();
  });
  it('repeats a real full game with identical fixed-work actions and obeys turn limits', async () => {
    const configs = await resolvedConfigs(solver), task = schedule('pilot')[0];
    const a = await runTask(task, solver, 'test', configs, 'test');
    const b = await runTask(task, solver, 'test', configs, 'test');
    expect(a.traceSha256).toBe(b.traceSha256);
    expect(a.record.winner).toBe(b.record.winner);
    expect(a.record.anomalies).toEqual([]);
    expect(a.record.invariantViolation).toBeNull();
    expect(a.record.adjudicated).toBe(false);
    const turns = new Map<number, number>();
    for (const row of a.telemetry.hard) turns.set(row.turn, (turns.get(row.turn) ?? 0) + row.requested);
    expect([...turns.values()].every(n => n <= 6000)).toBe(true);
    expect(a.telemetry.hard.some(d => d.phase === 'place' && d.requested > 0)).toBe(true);
    expect(a.record.players.white.unitsPlaced).toBeGreaterThan(0);
  }, 120000);
});
