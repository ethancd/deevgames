import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createMicroGameState, MICRO_MAP, MICRO_RULES_REVISION } from '../../src/game/micro';
import { createInitialGameState, getUnitAt } from '../../src/game/board';
import { applyAction } from '../../src/ai/simulate';
import { isLegalAction } from '../../src/game/legality';
import { getValidMoves } from '../../src/game/movement';
import { saveGameState, loadGameState, clearGameState, MICRO_STORAGE_KEY } from '../../src/utils/persistence';
import type { GameState, Unit } from '../../src/game/types';

const unit = (id: string, definitionId: string, owner: 'white' | 'black', x: number, y: number): Unit => ({
  id, definitionId, owner, position: { x, y }, hasMoved: false, hasAttacked: false, lastAttackKilled: false,
  canActThisTurn: true, damageTaken: 0, attackedThisTurn: [],
});
const withUnits = (state: GameState, units: Unit[]): GameState => ({ ...state, board: { ...state.board, units } });
const endTurn = (s: GameState) => applyAction(applyAction(s, { type: 'END_ACTION_PHASE' }), { type: 'END_PLACE_PHASE' });

describe('MICRO MUJU (micro-muju-1)', () => {
  it('mirrors the checked-in map file exactly', () => {
    const source = JSON.parse(readFileSync(join(process.cwd(), 'src/game/maps/micro-muju-default.json'), 'utf8'));
    expect([...MICRO_MAP]).toEqual(source);
  });

  it('starts on the exact 6×6 map with the agreed opening, empty banks and two actions', () => {
    const s = createMicroGameState();
    expect(s.variant).toBe('micro');
    expect(s.rulesRevision).toBe(MICRO_RULES_REVISION);
    expect(s.board.cells).toHaveLength(6);
    expect(s.board.cells.flat().map(c => c.resourceLayers)).toEqual([...MICRO_MAP]);
    expect(MICRO_MAP.reduce((a, b) => a + b, 0)).toBe(112);
    expect(s.board.cells[0].map(c => c.resourceLayers)).toEqual([4, 4, 0, 0, 8, 8]); // A1–F1
    const at = (x: number, y: number) => { const u = getUnitAt(s.board, { x, y }); return u && `${u.owner}:${u.definitionId}`; };
    expect([at(1, 0), at(1, 1), at(0, 1)]).toEqual(['white:fire_1', 'white:water_1', 'white:plant_1']); // B1 B2 A2
    expect([at(4, 5), at(4, 4), at(5, 4)]).toEqual(['black:fire_1', 'black:water_1', 'black:plant_1']); // E6 E5 F5
    expect(s.players.white.resources + s.players.black.resources).toBe(0);
    expect(s.players.black.startCorner).toEqual({ x: 5, y: 5 });
    expect(s.turn).toMatchObject({ currentPlayer: 'white', phase: 'action', actionsRemaining: 2 });
  });

  it('keeps movement on the 6×6 board and spends two shared actions', () => {
    let s = withUnits(createMicroGameState(), [unit('w', 'fire_1', 'white', 4, 0), unit('b', 'plant_1', 'black', 0, 5)]);
    expect(getValidMoves(s.board.units[0], s.board).every(p => p.x < 6 && p.y < 6)).toBe(true);
    expect(isLegalAction(s, { type: 'MOVE', unitId: 'w', to: { x: 6, y: 0 } })).toBe(false);
    s = applyAction(s, { type: 'MOVE', unitId: 'w', to: { x: 5, y: 1 } });
    s = applyAction(s, { type: 'MOVE', unitId: 'w', to: { x: 5, y: 3 } });
    expect(s.turn.actionsRemaining).toBe(0);
    expect(isLegalAction(s, { type: 'MOVE', unitId: 'w', to: { x: 5, y: 4 } })).toBe(false);
  });

  it('allows one attack per piece per turn, even after a kill (no Cleave)', () => {
    // Hi (atk 2, +1 vs Plant) kills a Muju (def 3), then has another adjacent enemy.
    let s = withUnits(createMicroGameState(), [unit('w', 'fire_1', 'white', 2, 2), unit('b1', 'plant_1', 'black', 3, 2),
      unit('b2', 'plant_1', 'black', 2, 3), unit('b3', 'water_1', 'black', 5, 5)]);
    s = applyAction(s, { type: 'ATTACK', unitId: 'w', targetPosition: { x: 3, y: 2 } });
    expect(s.board.units.some(u => u.id === 'b1')).toBe(false);
    expect(s.turn.actionsRemaining).toBe(1);
    expect(isLegalAction(s, { type: 'ATTACK', unitId: 'w', targetPosition: { x: 2, y: 3 } })).toBe(false);
    // Moving is still allowed.
    expect(isLegalAction(s, { type: 'MOVE', unitId: 'w', to: { x: 1, y: 2 } })).toBe(true);
  });

  it('offers only Hi, Sjór and Muju, and no promotions, in the rules layer', () => {
    let s = createMicroGameState();
    s = applyAction(s, { type: 'END_ACTION_PHASE' });
    s = { ...s, players: { ...s.players, white: { ...s.players.white, resources: 50 } } };
    for (const id of ['lightning_1', 'shadow_1', 'metal_1']) expect(isLegalAction(s, { type: 'BUY_UNIT', definitionId: id, position: { x: 0, y: 0 } })).toBe(false);
    for (const id of ['fire_1', 'water_1', 'plant_1']) expect(isLegalAction(s, { type: 'BUY_UNIT', definitionId: id, position: { x: 0, y: 0 } })).toBe(true);
    const own = s.board.units.find(u => u.owner === 'white')!;
    expect(isLegalAction(s, { type: 'PROMOTE_UNIT', unitId: own.id })).toBe(false);
  });

  it('mines, summons at normal price and arrives next turn', () => {
    let s = createMicroGameState();
    s = applyAction(s, { type: 'END_ACTION_PHASE' });
    // Hi B1 (4, mines 1) + Sjór B2 (4, mines 2) + Muju A2 (4, mines 3).
    expect(s.players.white.resources).toBe(6);
    expect(s.board.cells[1][0].resourceLayers).toBe(1);
    s = applyAction(s, { type: 'BUY_UNIT', definitionId: 'fire_1', position: { x: 0, y: 0 } });
    expect(s.players.white.resources).toBe(3);
    expect(s.pendingSummons).toHaveLength(1);
    s = applyAction(s, { type: 'END_PLACE_PHASE' });
    s = endTurn(s); // Black passes
    expect(s.turn.currentPlayer).toBe('white');
    expect(getUnitAt(s.board, { x: 0, y: 0 })?.definitionId).toBe('fire_1');
    expect(s.pendingSummons).toHaveLength(0);
  });

  it('has no kill clock: many quiet turns do not end the game', () => {
    let s = createMicroGameState();
    for (let i = 0; i < 40; i++) s = endTurn(s);
    expect(s.phase).toBe('playing');
  });

  it('adjudicates home checkmate with Micro rules and no clock suppression', () => {
    // White Hi sits on F6; Black's only piece is a distant Muju (attack 0) that cannot remove it.
    let s = withUnits(createMicroGameState(), [unit('w', 'fire_1', 'white', 5, 4), unit('b', 'plant_1', 'black', 0, 5)]);
    s = { ...s, inactivityPlies: 9 }; // would suppress mate under Prime's kill clock
    s = applyAction(s, { type: 'MOVE', unitId: 'w', to: { x: 5, y: 5 } });
    s = applyAction(s, { type: 'END_ACTION_PHASE' });
    expect(s.phase).toBe('victory');
    expect(s.victoryReason).toBe('home-checkmate');
  });

  it('does not call checkmate when two actions allow a rescue', () => {
    let s = withUnits(createMicroGameState(), [unit('w', 'plant_1', 'white', 5, 4), unit('b', 'fire_1', 'black', 3, 5)]);
    s = applyAction(s, { type: 'MOVE', unitId: 'w', to: { x: 5, y: 5 } });
    s = applyAction(s, { type: 'END_ACTION_PHASE' });
    expect(s.phase).toBe('playing'); // Hi moves to E6 and attacks (2+1 ≥ 3)
  });

  it('prime is unchanged: 10×10, four actions, promotions legal', () => {
    const s = createInitialGameState(undefined, 4, 0, 'phasing');
    expect(s.variant).toBeUndefined();
    expect(s.board.cells).toHaveLength(10);
    expect(s.turn.actionsRemaining).toBe(4);
    expect(s.players.black.startCorner).toEqual({ x: 9, y: 9 });
  });

  describe('persistence', () => {
    beforeEach(() => localStorage.clear());
    it('saves Micro in its own slot without touching Prime’s save', () => {
      const prime = createInitialGameState(undefined, 4, 0, 'phasing');
      saveGameState(prime);
      const primeRaw = localStorage.getItem('elemental-tactics-save');
      const micro = applyAction(createMicroGameState(), { type: 'END_ACTION_PHASE' });
      saveGameState(micro);
      expect(localStorage.getItem('elemental-tactics-save')).toBe(primeRaw);
      expect(JSON.parse(localStorage.getItem(MICRO_STORAGE_KEY)!).rulesRevision).toBe(MICRO_RULES_REVISION);
      expect(loadGameState('micro')).toEqual(micro);
      expect(loadGameState()?.variant).toBeUndefined();
      clearGameState('micro');
      expect(localStorage.getItem('elemental-tactics-save')).toBe(primeRaw);
      expect(loadGameState('micro')).toBeNull();
    });
    it('refuses a Micro save carrying a non-Micro piece', () => {
      const micro = createMicroGameState();
      saveGameState({ ...micro, board: { ...micro.board, units: [...micro.board.units, unit('x', 'metal_1', 'white', 2, 2)] } });
      expect(loadGameState('micro')).toBeNull();
    });
  });
});
