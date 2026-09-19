// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createInitialGameState } from '../../src/game/board';
import { applyAction } from '../../src/ai/simulate';
import { phaseEndAction } from '../../src/game/legality';
import { checkInvariants } from '../../lab/harness/invariants';
import { buildView, playGame, adjudicationScore } from '../../lab/harness/runner';
import { legalActions } from '../../lab/harness/legal';
import { createBot } from '../../lab/harness/bots';
import { safeCommitSquares, disruptedByMove, withPassiveEconomy } from '../../lab/harness/bots/bot-utils';
import { HARNESS_RULES_VERSION, type ScriptedBot } from '../../lab/harness/types';
import { INACTIVITY_LIMIT, INACTIVITY_WARNING } from '../../src/game/inactivity';
import type { GameState } from '../../src/game/types';

const initial = () => createInitialGameState(undefined, undefined, 3, 'phasing');
const end = (s: GameState) => applyAction(s, phaseEndAction(s));
const pass: ScriptedBot = { name: 'Pass', kind: 'scripted', chooseAction: () => null };
function committed() {
  const prepare = end(initial());
  const buy = legalActions(prepare, 'white').find(a => a.type === 'BUY_UNIT')!;
  return { prepare, buy, state: applyAction(prepare, buy) };
}

describe('Phasing measurement substrate', () => {
  /**
   * The draw clock, measured through the harness end to end instead of read
   * off the constant. Two bots that pass every phase never remove a unit, so
   * nothing ever resets the clock and the game must end in an inactivity draw
   * exactly `INACTIVITY_LIMIT` hand-offs in.
   *
   * The counts are DERIVED from the limit rather than copied beside it. A
   * passed turn is two decisions (`END_ACTION_PHASE` then `END_PLACE_PHASE`)
   * and exactly one hand-off, so a quiet game is `limit` completed turns and
   * `2 * limit` recorded plies. Amendment A4 (2026-09-19) moved the limit from
   * 10 to 20 and this test moves with it — while still failing if the harness
   * stops counting hand-offs, starts counting a phase end as one, or ends the
   * game anywhere other than the limit.
   */
  it('counts a complete turn only after Prepare; mines once and draws after INACTIVITY_LIMIT complete quiet turns', async () => {
    // The rule this test is the harness half of (A4): twenty plies to the draw,
    // warned three plies earlier. Pinned so a silent edit to either constant
    // fails here as well as in the game's own tests.
    expect(INACTIVITY_LIMIT).toBe(20);
    expect(INACTIVITY_WARNING).toBe(INACTIVITY_LIMIT - 3);
    const controls: string[] = [];
    const { record, replay } = await playGame({ bots: { white: pass, black: pass }, seed: 1, runId: 'test', engineHash: 'test',
      options: { recordReplay: true }, onAction(before, after, action) {
        controls.push(action.type);
        if (action.type === 'END_ACTION_PHASE') {
          expect(after.turn.currentPlayer).toBe(before.turn.currentPlayer);
          expect(after.turn.actionsRemaining).toBe(0);
          expect(after.inactivityPlies).toBe(before.inactivityPlies);
        } else {
          expect(after.lastIncome).toBe(before.lastIncome);
        }
      } });
    expect(controls).toEqual(Array.from({ length: INACTIVITY_LIMIT }, () => ['END_ACTION_PHASE', 'END_PLACE_PHASE']).flat());
    expect(record.completedTurns).toBe(INACTIVITY_LIMIT);
    expect(record.plies).toBe(2 * INACTIVITY_LIMIT);
    expect(record.inactivityDraw).toBe(true);
    expect(record.maxInactivityPlies).toBe(INACTIVITY_LIMIT);
    expect(record.incomeCurve).toHaveLength(INACTIVITY_LIMIT);
    expect(record.rulesVersion).toBe(HARNESS_RULES_VERSION);
    expect(record.rulesVersion).toBe('muju-phasing-2');
    expect(replay!.steps[0].phase).toBe('action');
  });

  it('rejects Standard openings rather than silently reinterpreting them', async () => {
    await expect(playGame({ bots: { white: pass, black: pass }, seed: 1, runId: 'test', engineHash: 'test',
      initialState: createInitialGameState() })).rejects.toThrow(/non-Phasing/);
  });

  it('tracks paid escrow, public commitments and exact refunds without treating them as mining', () => {
    const { prepare, state } = committed();
    const summon = state.pendingSummons![0];
    expect(state.board.units).toEqual(prepare.board.units);
    expect(state.lastIncome).toBe(prepare.lastIncome);
    expect(adjudicationScore(state, 'white')).toBe(adjudicationScore(prepare, 'white'));
    expect(buildView(state, 'black').pendingSummons).toEqual(state.pendingSummons);
    checkInvariants(state, 'committed');
    const inflated = { ...state, players: { ...state.players, white: { ...state.players.white, resources: state.players.white.resourcesGained } } };
    expect(() => checkInvariants(inflated, 'double counted')).toThrow(/bank \+ pending/);
    let disrupted = end(state);
    const enemy = disrupted.board.units.find(u => u.owner === 'black')!;
    disrupted = { ...disrupted, board: { ...disrupted.board, units: disrupted.board.units.map(u => u.id === enemy.id ? { ...u, position: summon.position } : u) } };
    const refunded = end(end(disrupted));
    expect(refunded.pendingSummons).toHaveLength(0);
    expect(refunded.players.white.resources).toBe(state.players.white.resources + summon.cost);
    expect(refunded.players.white.resourcesGained).toBe(state.players.white.resourcesGained);
    checkInvariants(refunded, 'refunded');
    expect(refunded.lastSummoning?.disrupted).toHaveLength(1);
  });

  it('arrivals wait for the owner next Act and receive actions; Prepare never retains Act budget', () => {
    const { state } = committed();
    const arrived = end(end(end(state)));
    expect(arrived.turn.currentPlayer).toBe('white');
    expect(arrived.turn.phase).toBe('action');
    expect(arrived.board.units).toHaveLength(state.board.units.length + 1);
    expect(arrived.board.units.at(-1)?.canActThisTurn).toBe(true);
    checkInvariants(arrived, 'arrival');
    expect(() => checkInvariants({ ...state, turn: { ...state.turn, actionsRemaining: 1 } }, 'bad Prepare')).toThrow(/Prepare/);
  });

  it('caps full rounds after both Prepare phases, and marks even tied adjudications', async () => {
    const { record } = await playGame({ bots: { white: pass, black: pass }, seed: 1, runId: 'test', engineHash: 'test',
      options: { maxTurns: 1 } });
    expect(record.completedTurns).toBe(2);
    expect(record.plies).toBe(4);
    expect(record.turns).toBe(2);
    expect(record.adjudicated).toBe(true);
    expect(record.capReason).toBe('round-cap');
    expect(record.adjudicationFormula).toBe('material+bank+pending-cost');
  });

  it('counts BUY commitments directly instead of taking the last board unit as the purchase', async () => {
    const { record, replay } = await playGame({ bots: { white: createBot('Rush'), black: createBot('Rush') }, seed: 9,
      runId: 'test', engineHash: 'test', options: { maxTurns: 2, recordReplay: true } });
    for (const p of ['white', 'black'] as const) {
      expect(record.players[p].tierUsage[1]).toBe(record.purchases.filter(b => b.player === p).length);
    }
    expect(replay!.steps.some(s => s.pendingSummons!.length > 0)).toBe(true);
  });

  it('discounts delayed purchases and prefers commitments beyond enemy next-turn reach', () => {
    const { prepare, buy } = committed();
    const view = buildView(prepare, 'white');
    expect(buy.type).toBe('BUY_UNIT');
    expect(safeCommitSquares(view).size).toBeGreaterThan(0);
    expect(withPassiveEconomy(view, buy, 300)).toBeLessThan(300 + 15 * 3);
  });

  it('recognizes square occupation and rectangle intrusion that void enemy summons', () => {
    const { state } = committed();
    const enemyTurn = end(state);
    const mover = enemyTurn.board.units.find(u => u.owner === 'black')!;
    const summon = state.pendingSummons![0];
    expect(disruptedByMove(buildView(enemyTurn, 'black'), { type: 'MOVE', unitId: mover.id, to: summon.position })).toBe(1);
  });
  it('distinguishes safe support from reachable support, retaining alternative anchors', () => {
    const base = initial();
    const white = base.board.units.find(u => u.owner === 'white')!;
    const black = base.board.units.find(u => u.owner === 'black')!;
    const state: GameState = { ...base, board: { ...base.board, units: [
      { ...white, id: 'wide', definitionId: 'fire_1', position: { x: 4, y: 4 } },
      { ...white, id: 'narrow', definitionId: 'fire_1', position: { x: 2, y: 0 } },
      { ...black, id: 'enemy', definitionId: 'lightning_1', position: { x: 9, y: 9 } },
    ] }, pendingSummons: [{ id: 'pending', owner: 'white', definitionId: 'fire_1', cost: 1, position: { x: 1, y: 0 } }] };
    const safe = safeCommitSquares(buildView(state, 'white'));
    expect(safe.has('1,0')).toBe(true);
    expect(safe.has('3,3')).toBe(false);
    const view = buildView(state, 'black');
    expect(disruptedByMove(view, { type: 'MOVE', unitId: 'enemy', to: { x: 1, y: 1 } })).toBe(0);
    expect(disruptedByMove(view, { type: 'MOVE', unitId: 'enemy', to: { x: 0, y: 0 } })).toBe(1);
    expect(disruptedByMove(view, { type: 'MOVE', unitId: 'enemy', to: { x: 1, y: 0 } })).toBe(1);
  });

});
