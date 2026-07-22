import { describe, expect, it } from 'vitest';
import type { Intent, TileType, WorldState } from '../core/types';
import { resolveDisplayDest, resolveDisplayPath } from './path';

function makeWorld(overrides?: Partial<WorldState>): WorldState {
  const width = 10;
  const height = 10;
  const tiles: TileType[] = new Array(width * height).fill('grass');
  return {
    seed: 1,
    tick: 0,
    width,
    height,
    tiles,
    denPos: { x: 1, y: 1 },
    deadwood: [],
    sunpatches: [],
    wolf: { pos: { x: 8, y: 8 }, state: 'PATROL', stateTicks: 0 },
    weather: 'clear',
    ember: { pos: { x: 5, y: 5 } },
    ...overrides,
  };
}

function intent(skill: Intent['skill'], params: Record<string, unknown>): Intent {
  return { goal: '', skill, params, interruptConditions: [] };
}

describe('resolveDisplayDest', () => {
  it('returns null when there is no active intent', () => {
    expect(resolveDisplayDest(makeWorld(), null)).toBeNull();
  });

  it('returns null for skills with no route (e.g. rest, wait)', () => {
    expect(resolveDisplayDest(makeWorld(), intent('wait', {}))).toBeNull();
    expect(resolveDisplayDest(makeWorld(), intent('rest', { duration: 10 }))).toBeNull();
  });

  it('move_to resolves to params.dest', () => {
    const dest = resolveDisplayDest(makeWorld(), intent('move_to', { dest: { x: 3, y: 4 } }));
    expect(dest).toEqual({ x: 3, y: 4 });
  });

  it('move_to with malformed params.dest resolves to null (no crash)', () => {
    expect(resolveDisplayDest(makeWorld(), intent('move_to', {}))).toBeNull();
    expect(resolveDisplayDest(makeWorld(), intent('move_to', { dest: 'nope' }))).toBeNull();
  });

  it('shelter resolves to the den', () => {
    const dest = resolveDisplayDest(makeWorld(), intent('shelter', {}));
    expect(dest).toEqual({ x: 1, y: 1 });
  });

  it('flee projects a display-only point away from params.from', () => {
    const world = makeWorld({ ember: { pos: { x: 5, y: 5 } } });
    const dest = resolveDisplayDest(world, intent('flee', { from: { x: 5, y: 8 } }));
    expect(dest).not.toBeNull();
    // fleeing away from a point south of the ember should move it north
    expect(dest!.y).toBeLessThan(5);
  });
});

describe('resolveDisplayPath', () => {
  it('returns [] when there is nothing to show', () => {
    expect(resolveDisplayPath(makeWorld(), null)).toEqual([]);
  });

  it('returns a real findPath route for move_to', () => {
    const world = makeWorld();
    const path = resolveDisplayPath(world, intent('move_to', { dest: { x: 5, y: 1 } }));
    expect(path.length).toBeGreaterThan(0);
    expect(path[path.length - 1]).toEqual({ x: 5, y: 1 });
  });

  it('returns [] when already at the destination', () => {
    const world = makeWorld({ ember: { pos: { x: 1, y: 1 } } });
    expect(resolveDisplayPath(world, intent('shelter', {}))).toEqual([]);
  });
});
