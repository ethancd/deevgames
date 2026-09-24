// @vitest-environment node
/**
 * The small-N copy of `lab/hard-ai/oracles/killeta.ts` (STRATEGOS W1.4): the
 * falsification oracle for `src/ai/hard/strategy/killeta.ts`'s lower bound.
 *
 * Three things are pinned, and the third is what makes the first two mean
 * anything:
 *
 *   1. EXHAUSTIVE SEARCH. On every authored small position, a search over
 *      every legal action of the first plies finds the earliest kill; it is
 *      never earlier than the bound, and on the authored cases it equals the
 *      hand-derived answer — the bound is TIGHT there (ply 1, ply 2, ply 3
 *      through a purchase), not merely sound.
 *   2. PLAYOUTS. Random and aggressive legal playouts from the dev-book
 *      openings, played-out prefixes and sparse boards never record a first
 *      kill before the bound, while recording many kills, many of them
 *      exactly on it.
 *   3. THE ORACLE CAN FAIL. The same two checks, handed a bound that is
 *      deliberately too high by one ply, report violations — so "zero
 *      violations" above is evidence, not an artefact of an oracle that cannot
 *      see an early kill.
 *
 * The CLI runs the same checks at scale: `node --import tsx
 * lab/hard-ai/oracles/killeta.ts --positions 2000 --playouts 16 --exhaustive`.
 */
import { describe, expect, it, vi } from 'vitest';
import { Replica } from '../../src/ai/hard/core/state';
import { seededRandom } from '../../src/ai/runtime';
import { killEta } from '../../src/ai/hard/strategy/killeta';
import {
  checkExhaustive,
  checkPlayouts,
  exhaustiveFirstKill,
  killEtaExhaustiveCases,
  openingStarts,
  playout,
  sampledStarts,
  sparseStarts,
} from '../../lab/hard-ai/oracles/killeta';

// Measured on an idle M2 Max: exhaustive cases ~1 s, playouts ~1 s; ~5 s each
// with four other lanes' full suites running (load 40). 90 s is this file's
// explicit ceiling for a loaded box.
vi.setConfig({ testTimeout: 90_000 });

const rep = new Replica();

describe('killeta oracle — exhaustive search on authored positions', () => {
  const cases = killEtaExhaustiveCases();

  it('the authored set covers every clause it names, both sides, and more than one searched depth', () => {
    expect(cases.length).toBeGreaterThanOrEqual(7);
    expect(new Set(cases.map(c => c.side)).size).toBe(2);
    expect(new Set(cases.map(c => c.maxPly)).size).toBeGreaterThanOrEqual(3);
  });

  it('no line kills before the bound, the bound is what each case was authored to give, and so is the search', () => {
    const m = checkExhaustive(cases);
    expect(m.truncated).toBe(0);
    expect(m.violations).toBe(0);
    for (let i = 0; i < cases.length; i++) {
      const row = m.rows[i];
      expect(row.bound, `${row.id} bound`).toBe(cases[i].expectBound);
      expect(row.exhaustive, `${row.id} exhaustive`).toBe(cases[i].expectExhaustive);
    }
    // Tight wherever a kill was inside the searched plies.
    expect(m.tight).toBe(cases.filter(c => c.expectExhaustive <= c.maxPly).length);
    expect(m.tight).toBeGreaterThanOrEqual(4);
  });

  it('a bound one ply too high is caught by the exhaustive search', () => {
    // The two cheapest tight cases (ply 1 and the ply-2 reply) are enough to
    // show the comparison fires; the full set already ran above.
    const cheap = cases.filter(c => c.id === 'adjacent-hit' || c.id === 'reply-closes');
    const m = checkExhaustive(cheap, (p, side) => killEta(p, side).plies + 1);
    expect(m.violations).toBe(2);
    expect(m.mismatches.map(x => [x.id, x.bound, x.firstKill])).toEqual([['adjacent-hit', 2, 1], ['reply-closes', 3, 2]]);
  });

  it('a search that stops one ply short cannot see the kill it is looking for', () => {
    const c = cases.find(x => x.id === 'reply-closes')!;
    expect(exhaustiveFirstKill(rep.pack(c.state), c.side, 1).ply).toBe(2); // "none within 1"
    expect(exhaustiveFirstKill(rep.pack(c.state), c.side, 2).ply).toBe(2); // found at 2
  });
});

describe('killeta oracle — playouts', () => {
  const openings = openingStarts();
  const starts = [...openings, ...sampledStarts(openings, 60, 7), ...sparseStarts(120, 7)];

  it('random and aggressive playouts never kill before the bound, and do kill, often exactly on it', () => {
    const m = checkPlayouts(starts, 4, 7);
    expect(m.positions).toBeGreaterThan(250);
    expect(m.violations).toBe(0);
    expect(m.mismatches).toEqual([]);
    expect(m.kills).toBeGreaterThan(500);
    expect(m.tightHits).toBeGreaterThan(200);
  });

  it('a bound one ply too high is caught by the playouts', () => {
    const m = checkPlayouts(starts.slice(0, 120), 4, 7, (p, side) => killEta(p, side).plies + 1);
    expect(m.violations).toBeGreaterThan(20);
  });

  it('the aggressive policy realises the authored first kills: ply 1, the reply at ply 2, the short approach at ply 3', () => {
    const cases = killEtaExhaustiveCases();
    const byId = (id: string) => rep.pack(cases.find(c => c.id === id)!.state);
    const both = ['aggressive', 'aggressive'] as const;
    expect(playout(rep, byId('adjacent-hit'), both, seededRandom(1)).firstKill[0]).toBe(1);
    expect(playout(rep, byId('reply-closes'), both, seededRandom(1)).firstKill[1]).toBe(2);
    expect(playout(rep, byId('one-square-short'), both, seededRandom(1)).firstKill[0]).toBe(3);
  });
});
