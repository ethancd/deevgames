import { describe, expect, it } from 'vitest';
import { learnUrl, parseLearnRoute, sameRoute } from '../../src/learn/routing';

describe('Learn to Play deep links', () => {
  it('parses ?learn=1 as the map, ?learn=<id> as a puzzle, and nothing else', () => {
    expect(parseLearnRoute('')).toBeNull();
    expect(parseLearnRoute('?online=1')).toBeNull();
    expect(parseLearnRoute('?learn=')).toBeNull();
    expect(parseLearnRoute('?learn=1')).toEqual({ kind: 'map' });
    expect(parseLearnRoute('?learn=move-3')).toEqual({ kind: 'puzzle', id: 'move-3' });
    expect(parseLearnRoute('?learn=fx-mine&fixture=1')).toEqual({ kind: 'puzzle', id: 'fx-mine', fixture: true });
    expect(parseLearnRoute('?tutorial=1&learn=mine-2')).toEqual({ kind: 'puzzle', id: 'mine-2' });
  });

  it('builds URLs on the current path, dropping learn, fixture and tutorial but keeping other parameters', () => {
    const at = 'http://localhost/muju/?debug=1&learn=move-2&fixture=1&tutorial=1#x';
    expect(learnUrl(null, at)).toBe('/muju/?debug=1#x');
    expect(learnUrl({ kind: 'map' }, at)).toBe('/muju/?debug=1&learn=1#x');
    expect(learnUrl({ kind: 'puzzle', id: 'mine-4' }, at)).toBe('/muju/?debug=1&learn=mine-4#x');
    expect(learnUrl({ kind: 'puzzle', id: 'fx-reach', fixture: true }, 'http://localhost/muju/')).toBe('/muju/?learn=fx-reach&fixture=1');
    // Round trip.
    const route = { kind: 'puzzle' as const, id: 'attack-7' };
    expect(parseLearnRoute(new URL(learnUrl(route, 'http://localhost/muju/'), 'http://localhost').search)).toEqual(route);
  });

  it('compares routes by value', () => {
    expect(sameRoute(null, null)).toBe(true);
    expect(sameRoute({ kind: 'map' }, { kind: 'map' })).toBe(true);
    expect(sameRoute({ kind: 'map' }, null)).toBe(false);
    expect(sameRoute({ kind: 'puzzle', id: 'a' }, { kind: 'puzzle', id: 'a' })).toBe(true);
    expect(sameRoute({ kind: 'puzzle', id: 'a' }, { kind: 'puzzle', id: 'b' })).toBe(false);
    expect(sameRoute({ kind: 'puzzle', id: 'a' }, { kind: 'puzzle', id: 'a', fixture: true })).toBe(false);
  });
});
