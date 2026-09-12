import { expect, it } from 'vitest';
import { applyAction } from '../src/ai/simulate';
import { createInitialGameState, createUnit } from '../src/game/board';
import { getMoveCost } from '../src/game/movement';
import { emptyRecording, expandReplayMoves, recordAction, type TurnReplay } from '../src/game/replay';

it.each([
  ['water_1', [1, 2, 3]],
  ['fire_1', [2, 3]],
  ['lightning_1', [3]],
] as const)('splits %s movement by actions spent, respecting its speed', (definitionId, columns) => {
  const before = createInitialGameState();
  const unit = createUnit(definitionId, 'white', { x: 0, y: 0 });
  before.board.units = [unit, createUnit('water_1', 'black', { x: 9, y: 9 })];
  const original = structuredClone(before);
  const action = { type: 'MOVE' as const, unitId: unit.id, to: { x: 3, y: 0 } };
  const after = applyAction(before, action);
  const frames = recordAction(emptyRecording(), before, action, after).current!.frames;
  expect(frames.map(f => f.position)).toEqual(columns.map(x => ({ x, y: 0 })));
  expect(frames).toHaveLength(before.turn.actionsRemaining - after.turn.actionsRemaining);
  expect(frames.at(-1)!.board).toBe(after.board);
  expect(before).toEqual(original);
});

it('uses legal paths around blockers and expands old replays without changing their snapshots', () => {
  const before = createInitialGameState();
  const unit = createUnit('fire_1', 'white', { x: 0, y: 0 });
  before.board.units = [unit, createUnit('water_1', 'white', { x: 2, y: 0 }), createUnit('water_1', 'black', { x: 9, y: 9 })];
  const action = { type: 'MOVE' as const, unitId: unit.id, to: { x: 4, y: 0 } };
  const after = applyAction(before, action);
  const legacy: TurnReplay = { player:'white',turnNumber:1,initialBoard:before.board,
    frames:[{board:after.board,action,label:'Hi moved to E1',position:action.to,unitId:unit.id}] };
  const original = structuredClone(legacy);
  const expanded = expandReplayMoves(legacy);
  expect(expanded.frames.map(f => f.position)).toEqual([{x:1,y:1},{x:3,y:1},{x:4,y:0}]);
  let board = before.board, from = unit.position;
  for (const frame of expanded.frames) {
    expect(getMoveCost(from, frame.position!, 2, board)).toBe(1);
    expect(frame.board.units.find(u => u.id === unit.id)!.position).toEqual(frame.position);
    from = frame.position!; board = frame.board;
  }
  expect(expanded.frames.at(-1)!.board).toBe(after.board);
  expect(expandReplayMoves(expanded)).toEqual(expanded);
  expect(legacy).toEqual(original);
});
