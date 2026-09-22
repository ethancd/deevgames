// @vitest-environment node
import { expect, it } from 'vitest';
import { Replica } from '../../../src/ai/hard/core/state';
import { AKind, paKind } from '../../../src/ai/hard/core/action';
import { Scratch } from '../../../src/ai/hard/core/bits';
import { allocTables } from '../../../src/ai/hard/tables/context';
import { Approach, classifyApproach } from '../../../src/ai/hard/tables/approach';
import { nearestOwner, UNREACHABLE } from '../../../src/ai/hard/tables/threat';
import { buildState } from './game-fixture';
it.each([1, 2])('Hard AI handles stationary Poṉ at distance %s', distance => {
  const state = buildState({ current: 'white', phase: 'action', actions: 4, units: [
    { def: 'metal_1', owner: 'white', x: 2, y: 2 },
    { def: 'water_1', owner: 'black', x: 2, y: 2 + distance },
    { def: 'plant_1', owner: 'black', x: 8, y: 8 },
  ] });
  const replica = new Replica(), p = replica.pack(state), actions = new Int32Array(4096);
  const count = replica.genActions(p, actions);
  expect([...actions.slice(0, count)].some(a => paKind(a) === AKind.MOVE)).toBe(false);
  expect([...actions.slice(0, count)].some(a => paKind(a) === AKind.ATTACK)).toBe(distance === 1);
  const tables = allocTables(), scratch = new Scratch(4, 64, 16);
  const result = classifyApproach(p, tables, 22, 0, p.pieceAt[22 + distance * 10], scratch, 0);
  expect(result.cls).toBe(distance === 1 ? Approach.STRAND : Approach.NONE);
  expect(result.retreats).toBe(0);
  const slots = new Uint8Array(100), costs = new Uint8Array(100);
  nearestOwner(p, 0, tables, slots, costs);
  expect(costs[22]).toBe(0);
  expect(costs[23]).toBe(UNREACHABLE);
});
