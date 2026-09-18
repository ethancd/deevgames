// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { AnalysisService } from '../../server/analysis';
import { economyForecast } from '../../server/analysis/economy';
import { simulateSequence, tacticalKey, turnFor, WorkBudget } from '../../server/analysis/core';
import { singleThreats, searchTurn } from '../../server/analysis/tactics';
import { analysisSchema, topics } from '../../server/analysis/schema';
import { reach, spawnGeometry } from '../../server/analysis/geometry';
import { applyAction } from '../../src/ai/simulate';
import { piece, position, snapshot } from '../fixtures/analysis';
import type { GameState } from '../../src/game/types';

const phasing = (...args: Parameters<typeof position>): GameState => ({ ...position(...args), ruleset: 'phasing', pendingSummons: [] });
const budget = () => new WorkBudget(20000, 10000);
const query = (s: GameState, extra: object = {}) => ({ roomId: snapshot(s).id, expectedRevision: 1, player: 'white', topics: ['economy'], ...extra });

describe('Phasing analysis models', () => {
  it('hands off once from Act, credits outgoing harvest/upkeep, resolves arrivals/refunds and heals only the incoming army', () => {
    const s = phasing([piece('w', 'water_2', 'white', 2, 2), piece('b', 'fire_2', 'black', 6, 6)], 0);
    s.board.units.forEach(u => { u.damageTaken = 1; });
    s.pendingSummons = [
      { id: 'arrive', owner: 'black', definitionId: 'water_1', position: { x: 7, y: 7 }, cost: 4 },
      { id: 'refund', owner: 'black', definitionId: 'fire_1', position: { x: 6, y: 6 }, cost: 3 },
    ];
    const before = structuredClone(s), model = turnFor(s, 'black');
    expect(model.setupActions.map(a => a.type)).toEqual(['END_ACTION_PHASE', 'END_PLACE_PHASE']);
    expect(model.state.turn).toMatchObject({ currentPlayer: 'black', phase: 'action', actionsRemaining: 4 });
    expect(model.state.players.white.resources).toBe(1);
    expect(model.state.players.black.resources).toBe(3);
    expect(model.state.board.units.find(u => u.id === 'arrive')).toMatchObject({ canActThisTurn: true, placedThisTurn: false });
    expect(model.state.board.units.find(u => u.id === 'b')!.damageTaken).toBe(0);
    expect(model.state.board.units.find(u => u.id === 'w')!.damageTaken).toBe(1);
    expect(model.state.pendingSummons).toEqual([]);
    expect(s).toEqual(before);
    const prepare = applyAction(s, { type: 'END_ACTION_PHASE' });
    expect(turnFor(prepare, 'black').setupActions.map(a => a.type)).toEqual(['END_PLACE_PHASE']);
    expect(turnFor(prepare, 'black').state.players.white.resources).toBe(1);
  });
  it('models pending upkeep without crossing into the incoming action phase', () => {
    const s = phasing([piece('w', 'fire_2', 'white', 3, 0), piece('free', 'lightning_1', 'white', 2, 0), piece('b', 'fire_1', 'black', 8, 8)]);
    const prepared = applyAction(s, { type: 'END_ACTION_PHASE' });
    expect(prepared.upkeepPending).toBe(true);
    const model = turnFor(prepared, 'black');
    expect(model.setupActions.map(a => a.type)).toEqual(['PAY_UPKEEP', 'END_PLACE_PHASE']);
    expect(model.state.board.units.some(u => u.id === 'w')).toBe(false);
    expect(model.state.turn.currentPlayer).toBe('black');
    expect(model.state.lastIncome!.player).toBe('white');
  });
  it('forecasts separate harvest-before-upkeep balances and stops at insolvency', () => {
    const s = phasing([piece('miner', 'plant_3', 'white', 2, 2), piece('b', 'plant_1', 'black', 8, 8)]);
    s.board.cells[2][2].resourceLayers = 6;
    const f = economyForecast(s);
    expect(f.checkpoints.filter(c => c.player === 'white').slice(0, 2)).toEqual([
      { player: 'white', turn: 1, kind: 'harvest', amount: 6, treasury: 6 },
      { player: 'white', turn: 1, kind: 'upkeep', amount: 2, treasury: 4 },
    ]);
    expect(f.failure).toMatchObject({ player: 'white', afterOwnHarvests: 4, due: 2, treasury: 0 });
    const prepare = applyAction(s, { type: 'END_ACTION_PHASE' });
    expect(economyForecast(prepare).checkpoints[0].player).toBe('black');
    s.inactivityRule = 'on'; s.inactivityPlies = 9;
    expect(economyForecast(s).stop).toBe('terminal:inactivity');
  });
  it('includes future arrivals and refunds in the financial forecast, without new purchases', () => {
    const s = phasing([piece('w', 'fire_1', 'white', 1, 1), piece('b', 'plant_1', 'black', 8, 8)]);
    s.pendingSummons = [
      { id: 'arrive', owner: 'black', definitionId: 'water_1', position: { x: 9, y: 8 }, cost: 4 },
      { id: 'refund', owner: 'black', definitionId: 'fire_1', position: { x: 8, y: 8 }, cost: 3 },
    ];
    const f = economyForecast(s, 1);
    expect(f.checkpoints.filter(c => c.player === 'black')).toMatchObject([
      { kind: 'summon_refund', amount: 3, treasury: 3 },
      { kind: 'harvest', amount: 5, treasury: 8 },
      { kind: 'upkeep', amount: 0, treasury: 8 },
    ]);
  });
  it('uses actual arrived attackers, never promotes or buys an immediate attacker during Prepare', () => {
    const s = phasing([piece('w', 'fire_1', 'white', 3, 3), piece('b', 'plant_3', 'black', 3, 4), piece('spare', 'plant_1', 'black', 8, 8)], 20);
    expect(singleThreats(s, 'b', ['promotion', 'purchase'], budget()).lines).toEqual([]);
    const prepare = applyAction(s, { type: 'END_ACTION_PHASE' });
    expect(singleThreats(prepare, 'b', ['existing', 'combined', 'promotion', 'purchase'], budget()).lines).toEqual([]);
    expect(searchTurn(prepare, budget(), { targetId: 'b', categories: ['combined'] }).proof).toBe('proven_impossible');
    expect(reach(prepare, analysisSchema.parse(query(prepare, { topics: ['reach'] })))[0].actions).toBe(0);
    const incoming = phasing([piece('w', 'plant_1', 'white', 4, 4), piece('b', 'plant_1', 'black', 5, 3)]);
    incoming.pendingSummons = [{ id: 'arrival', owner: 'black', definitionId: 'fire_1', position: { x: 5, y: 4 }, cost: 3 }];
    const reply = turnFor(incoming, 'black').state;
    const line = singleThreats(reply, 'w', ['existing'], budget()).lines.find(l => l.lethal)!;
    expect(line.attackerId).toBe('arrival');
    expect(simulateSequence(reply, line.actions).state.board.units.some(u => u.id === 'w')).toBe(false);
  });
  it('reports commitment geometry without treating pending summons as units or anchors', () => {
    const s = phasing([piece('w', 'plant_1', 'white', 2, 2), piece('b', 'plant_1', 'black', 8, 8)]);
    s.pendingSummons = [{ id: 'pending', owner: 'white', definitionId: 'fire_1', position: { x: 0, y: 0 }, cost: 3 }];
    const g = spawnGeometry(s, 'white');
    expect(g.pendingSummons[0]).toMatchObject({ square: 'A1', validOnCurrentBoard: true });
    expect(g.anchors.map(a => a.id)).toEqual(['w']);
    expect(g.purchaseSquares).not.toContain('A1');
    expect(tacticalKey(s)).not.toBe(tacticalKey({ ...s, pendingSummons: [] }));
  });
  it('defers an action-phase home proof until the invader survives outgoing upkeep', () => {
    const s = phasing([piece('invader', 'metal_3', 'white', 9, 9), piece('w', 'plant_1', 'white', 1, 1), piece('b', 'plant_1', 'black', 8, 8)]);
    const result = new AnalysisService().analyze(snapshot(s), query(s, { topics: ['checkmate'] }));
    expect(result.sections.checkmate).toMatchObject({ result: 'unknown' });
  });
  it('serves every topic and briefing for both Phasing phases without changing the source board', () => {
    const initial = phasing([piece('w', 'fire_1', 'white', 3, 3), piece('b', 'plant_1', 'black', 3, 4), piece('spare', 'plant_1', 'black', 8, 8)], 10);
    for (const s of [initial, applyAction(initial, { type: 'END_ACTION_PHASE' })]) {
      const before = structuredClone(s), service = new AnalysisService();
      const result = service.analyze(snapshot(s), query(s, { topics: [...topics], detail: 'full', replies: false, searchBudget: { maxMs: 750 } }));
      expect(result).toMatchObject({ ruleset: 'phasing', supported: true });
      expect(Object.keys(result.sections)).toEqual(expect.arrayContaining([...topics]));
      expect(service.briefing(snapshot(s), 'white')).toMatchObject({ ruleset: 'phasing', supported: true });
      expect(s).toEqual(before);
    }
  });
});
