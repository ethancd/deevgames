import { describe, expect, it } from 'vitest';
import { createInitialGameState, createUnit } from '../../src/game/board';
import { applyAction, transitionWithoutCheckmate } from '../../src/ai/simulate';
import { isLegalAction } from '../../src/game/legality';
import { resolveSummons } from '../../src/game/summoning';
import { analyzeHomeDefense, resolveHomeCheckmate } from '../../src/game/homeCheckmate';
import { startTurn } from '../../src/game/turn';
import { describeTransition } from '../../src/game/moveHistory';
import type { GameState } from '../../src/game/types';
import { INACTIVITY_LIMIT } from '../../src/game/inactivity';
const initial = () => createInitialGameState(undefined, 4, 0, 'phasing');
const actEnd = (s: GameState) => applyAction(s, { type: 'END_ACTION_PHASE' });
const handoff = (s: GameState) => applyAction(s, { type: 'END_PLACE_PHASE' });
const buy = (s: GameState, x = 0, y = 0) => applyAction(s, { type: 'BUY_UNIT', definitionId: 'fire_1', position: { x, y } });
const turn = (s: GameState) => handoff(actEnd(s));

describe('Phasing ruleset', () => {
  it('leaves Standard timing unchanged and starts both Phasing players in Act even with a handicap', () => {
    const standard = createInitialGameState(undefined, 4, 5);
    expect(actEnd(standard).turn).toMatchObject({ currentPlayer: 'black', phase: 'place' });
    const s = createInitialGameState(undefined, 4, 20, 'phasing');
    expect(s.turn.phase).toBe('action');
    expect(turn(s).turn).toMatchObject({ currentPlayer: 'black', phase: 'action' });
  });
  it('mines exactly once, pays upkeep from that income, and waits for explicit preparation handoff', () => {
    const s = initial();
    s.board.units[0].definitionId = 'fire_2';
    const prepared = actEnd(s);
    expect(prepared.turn).toMatchObject({ currentPlayer: 'white', phase: 'place', actionsRemaining: 0 });
    expect(prepared.lastIncome!.total).toBeGreaterThan(0);
    expect(prepared.lastUpkeep).toMatchObject({ player: 'white', paid: 1 });
    expect(prepared.players.white.resources).toBe(prepared.lastIncome!.total - 1);
    expect(actEnd(prepared)).toBe(prepared);
    expect(prepared.inactivityPlies).toBe(0);
    const after = handoff(prepared);
    expect(after.players.white.resources).toBe(prepared.players.white.resources);
    expect(after.inactivityPlies).toBe(1);
    expect(after.turn.currentPlayer).toBe('black');
  });
  it('keeps summon cost and type public, cannot attack/move/promote a pending piece, and rejects duplicate own squares', () => {
    const ready = actEnd(initial()), pending = buy(ready);
    expect(pending.pendingSummons).toHaveLength(1);
    expect(pending.board.units).toEqual(ready.board.units);
    expect(pending.players.white.resources).toBe(ready.players.white.resources - 3);
    expect(pending.pendingSummons![0]).toMatchObject({ definitionId: 'fire_1', cost: 3, owner: 'white' });
    expect(buy(pending)).toBe(pending);
    const id = pending.pendingSummons![0].id;
    expect(isLegalAction(pending, { type: 'PROMOTE_UNIT', unitId: id })).toBe(false);
    expect(isLegalAction({ ...pending, turn: { ...pending.turn, phase: 'action', actionsRemaining: 4 } }, { type: 'MOVE', unitId: id, to: { x: 2, y: 0 } })).toBe(false);
    expect(describeTransition(ready, { type: 'BUY_UNIT', definitionId: 'fire_1', position: { x: 0, y: 0 } }, pending)[0].description).toContain('phasing');
  });
  it('arrives next own turn, acts immediately and promotes after mining on arrival turn', () => {
    let s = turn(handoff(buy(actEnd(initial()))));
    const arrival = s.lastSummoning!.summoned[0];
    expect(s.turn).toMatchObject({ currentPlayer: 'white', phase: 'action', turnNumber: 2 });
    expect(s.board.units.find(u => u.id === arrival.id)).toMatchObject({ canActThisTurn: true, placedThisTurn: false });
    const starter = s.board.units.find(u => u.owner === 'white' && u.position.x === 1 && u.position.y === 0)!;
    s = applyAction(s, { type: 'MOVE', unitId: starter.id, to: { x: 2, y: 0 } });
    expect(isLegalAction(s, { type: 'MOVE', unitId: arrival.id, to: { x: 1, y: 0 } })).toBe(true);
    expect(isLegalAction(s, { type: 'PROMOTE_UNIT', unitId: arrival.id })).toBe(false);
    s = actEnd(s);
    s = applyAction(s, { type: 'PROMOTE_UNIT', unitId: arrival.id });
    expect(s.board.units.find(u => u.id === arrival.id)?.definitionId).toBe('fire_2');
    expect(s.lastUpkeep!.paid).toBe(0);
    expect(isLegalAction(s, { type: 'PROMOTE_UNIT', unitId: arrival.id })).toBe(false);
    expect(s.lastIncome!.takes.find(t => t.unitId === arrival.id)?.definitionId).toBe('fire_1');
  });
  it('allows movement through and onto a pending square, then refunds occupation exactly once', () => {
    let s = buy(actEnd(initial()));
    const pending = s.pendingSummons![0];
    s.turn.phase = 'action'; s.turn.actionsRemaining = 4;
    const unit = s.board.units.find(u => u.owner === 'white' && u.definitionId === 'plant_1')!;
    expect(isLegalAction(s, { type: 'MOVE', unitId: unit.id, to: pending.position })).toBe(true);
    s = applyAction(s, { type: 'MOVE', unitId: unit.id, to: pending.position });
    const bank = s.players.white.resources;
    const resolved = resolveSummons(s, 'white');
    expect(resolved.players.white.resources).toBe(bank + 3);
    expect(resolved.lastSummoning!.disrupted).toHaveLength(1);
    expect(resolveSummons(resolved, 'white').players.white.resources).toBe(bank + 3);
  });
  it('refunds rectangle disruption, accepts alternative anchors, and checks every summon without arrival chaining', () => {
    const s = initial(); s.players.white.resources = 0;
    s.board.units = [createUnit('water_1', 'white', { x: 3, y: 3 }), createUnit('fire_1', 'white', { x: 4, y: 1 }), createUnit('water_1', 'black', { x: 2, y: 2 })];
    s.pendingSummons = [
      { id: 'safe', owner: 'white', definitionId: 'plant_1', cost: 5, position: { x: 3, y: 1 } },
      { id: 'blocked', owner: 'white', definitionId: 'fire_1', cost: 3, position: { x: 1, y: 3 } },
    ];
    const resolved = resolveSummons(s, 'white');
    expect(resolved.lastSummoning!.summoned.map(u => u.id)).toEqual(['safe']);
    expect(resolved.lastSummoning!.disrupted.map(u => u.id)).toEqual(['blocked']);
    expect(resolved.players.white.resources).toBe(3);
    // An unsupported promise never acts as an anchor for another promise.
    s.board.units = [createUnit('plant_1', 'white', { x: 0, y: 1 }), createUnit('water_1', 'black', { x: 9, y: 9 })];
    expect(resolveSummons(s, 'white').lastSummoning!.summoned).toHaveLength(0);
  });
  it('does not remember a temporary intrusion that has left before arrival', () => {
    const s = buy(actEnd(initial()));
    const enemy = s.board.units.find(u => u.owner === 'black')!;
    enemy.position = { x: 0, y: 0 };
    enemy.position = { x: 9, y: 8 };
    expect(resolveSummons(s, 'white').lastSummoning!.summoned).toHaveLength(1);
  });
  it('upkeep review occurs after mining and promotions cannot fund or precede that payment', () => {
    const s = initial(); s.reviewUpkeep = { white: true };
    s.board.units[0].definitionId = 'fire_2';
    const ready = actEnd(s);
    expect(ready.upkeepPending).toBe(true);
    expect(ready.players.white.resources).toBe(ready.lastIncome!.total);
    expect(buy(ready)).toBe(ready);
    const kept = ready.board.units.filter(u => u.owner === 'white' && u.definitionId !== 'fire_2').map(u => u.id);
    const paid = applyAction(ready, { type: 'PAY_UPKEEP', keepUnitIds: kept });
    expect(paid.turn.phase).toBe('place'); expect(paid.upkeepPending).toBe(false);
    expect(paid.board.units.some(u => u.definitionId === 'fire_2')).toBe(false);
  });
  it('does not postpone elimination for pending promises, or home victory for arrival checks', () => {
    const s = buy(actEnd(initial()));
    s.board.units = s.board.units.filter(u => u.owner === 'black');
    expect(startTurn(s, 'white')).toMatchObject({ phase: 'victory', winner: 'black' });
    const h = initial(); h.board.units[0].position = { x: 9, y: 9 };
    expect(startTurn(h, 'white')).toMatchObject({ phase: 'victory', winner: 'white', victoryReason: 'home-occupation' });
  });
  it('home rescue uses the current army without pre-action promotions or upkeep releases', () => {
    const s = initial(); s.players.black.resources = 100;
    s.board.units = [createUnit('metal_3', 'white', { x: 9, y: 9 }), createUnit('fire_1', 'black', { x: 8, y: 9 })];
    expect(analyzeHomeDefense(s, 'white', transitionWithoutCheckmate)).toBe('mate');
    // Promotion is not an action-phase escape hatch in this variant.
    expect(resolveHomeCheckmate(s, transitionWithoutCheckmate).phase).toBe('playing');
    const prepared = { ...s, turn: { ...s.turn, phase: 'place' as const } };
    expect(resolveHomeCheckmate(prepared, transitionWithoutCheckmate).victoryReason).toBe('home-checkmate');
  });
  it('resolves the quiet draw once, after preparation, and before next home/arrival checks', () => {
    const s = initial(); s.inactivityPlies = INACTIVITY_LIMIT - 1;
    const ready = actEnd(s); expect(ready.phase).toBe('playing');
    const after = handoff(buy(ready));
    expect(after).toMatchObject({ phase: 'victory', victoryReason: 'inactivity', inactivityPlies: INACTIVITY_LIMIT });
  });
});
