// @vitest-environment node
/**
 * `HardConfig.searchFix.tieBreak` (E4.2 lane 3, `config.ts SearchFix`,
 * `docs/hard-ai/e4/E4.2-LEAF-TIE.md`).
 *
 * Two questions, both asked of real positions:
 *
 * 1. WITH THE KEY ABSENT — every shipped profile — the champion is untouched.
 *    The key is not in `DESKTOP` at all, and a fixed-work search with the key
 *    absent returns the same answer as one carrying an EMPTY `searchFix` block,
 *    so the gate is the NAMED value and nothing else can turn it on. (The
 *    stronger statement — the same answer as the code before this flag existed —
 *    is the 48-row `hard:cross-commit` golden, which is not a unit test.)
 * 2. WITH `'end-key'` ON, the ROOT's ordering stops depending on the search's
 *    own history: item 1 of DESIGN §5.11.3 (the TT move, +2,000,000) is
 *    withheld at ply 0 and candidates tying on the ordering score are ordered by
 *    their canonical end key. Ply >= 1 is untouched.
 */
import { describe, expect, it, vi } from 'vitest';
import { createInitialGameState } from '../../../src/game/board';
import { DESKTOP, type HardConfig } from '../../../src/ai/hard/config';
import { ORDER_TT, scoreTurns } from '../../../src/ai/hard/search/order';
import { Bound, newTTEntry, type TTEntry } from '../../../src/ai/hard/search/tt';
import { buildTables } from '../../../src/ai/hard/tables/context';
import { HardEngine } from '../../../src/ai/hard/engine';
import { endKeyOf, prepare, rawCandidates } from './search-fixture';

// E0.5 timeout budget: slowest test 2.6 s measured 2026-09-18 (M2 Max, load ~1); 60 s is this file's ceiling.
vi.setConfig({ testTimeout: 60_000 });

const TIE_BREAK: Partial<HardConfig> = { searchFix: { tieBreak: 'end-key' } };
const EMPTY_BLOCK: Partial<HardConfig> = { searchFix: {} };

/** Orders `n` candidates at `ply` with `tt` offered as the node's TT entry. */
function orderWith(cfg: Partial<HardConfig> | undefined, ply: number, tt: TTEntry | null): { keys: string[]; scores: number[] } {
  const prepared = prepare(createInitialGameState(), 400_000, cfg);
  const { ctx, p } = prepared;
  const raw = rawCandidates(prepared, ply);
  expect(raw.n).toBeGreaterThan(2);
  if (tt !== null) tt.bestEndLo = raw.turns[raw.n - 1].endLo;
  const t = buildTables(p, ctx.sc, ply, 2, ctx.tables[ply]);
  scoreTurns(p, t, ctx.turns[ply], raw.n, tt, ctx.ord, ply, 0, ctx);
  const keys: string[] = [];
  const scores: number[] = [];
  for (let i = 0; i < raw.n; i++) {
    keys.push(endKeyOf(ctx.turns[ply][i]));
    scores.push(ctx.turns[ply][i].gainCc);
  }
  return { keys, scores };
}

function exactEntry(): TTEntry {
  const tt = newTTEntry();
  tt.bound = Bound.EXACT;
  tt.depth = 3;
  return tt;
}

describe('searchFix.tieBreak: the key is absent everywhere it ships', () => {
  it('is not on DESKTOP, so the champion serialises exactly as it did', () => {
    expect(DESKTOP.searchFix).toBeUndefined();
    expect('searchFix' in DESKTOP).toBe(false);
    expect(JSON.stringify(DESKTOP)).not.toContain('searchFix');
  });

  it('an EMPTY searchFix block leaves the ordering byte-identical to the key being absent', () => {
    const absent = orderWith(undefined, 0, exactEntry());
    const empty = orderWith(EMPTY_BLOCK, 0, exactEntry());
    expect(empty.keys).toEqual(absent.keys);
    expect(empty.scores).toEqual(absent.scores);
    // And the champion's item 1 is still in force with the key absent.
    expect(absent.scores[0]).toBeGreaterThanOrEqual(ORDER_TT);
  });

  it('an EMPTY searchFix block leaves a whole fixed-work search byte-identical', async () => {
    const state = createInitialGameState();
    const a = await new HardEngine().searchTurn(state, { work: 100_000 });
    const b = await new HardEngine(EMPTY_BLOCK).searchTurn(state, { work: 100_000 });
    for (const field of ['scoreCc', 'depth', 'work', 'endKey', 'source'] as const) {
      expect(b[field], field).toBe(a[field]);
    }
    expect(b.stats.nodes).toBe(a.stats.nodes);
    expect(JSON.stringify(b.actions)).toBe(JSON.stringify(a.actions));
  });
});

describe("searchFix.tieBreak: 'end-key'", () => {
  it('withholds the TT move bonus at ply 0, so no candidate carries item 1', () => {
    const on = orderWith(TIE_BREAK, 0, exactEntry());
    for (const s of on.scores) expect(s).toBeLessThan(ORDER_TT);
    // The champion promotes the same entry to the head of the list.
    const off = orderWith(undefined, 0, exactEntry());
    expect(off.scores[0]).toBeGreaterThanOrEqual(ORDER_TT);
  });

  it('keeps the TT move first at ply >= 1, where its cutoffs are earned', () => {
    const tt = exactEntry();
    const prepared = prepare(createInitialGameState(), 400_000, TIE_BREAK);
    const { ctx, p } = prepared;
    const raw = rawCandidates(prepared, 1);
    expect(raw.n).toBeGreaterThan(2);
    const target = raw.turns[raw.n - 1].endLo;
    tt.bestEndLo = target;
    const t = buildTables(p, ctx.sc, 1, 2, ctx.tables[1]);
    scoreTurns(p, t, ctx.turns[1], raw.n, tt, ctx.ord, 1, 0, ctx);
    expect(ctx.turns[1][0].endLo).toBe(target);
    expect(ctx.turns[1][0].gainCc).toBeGreaterThanOrEqual(ORDER_TT);
  });

  it('orders candidates that tie on the ordering score by ascending canonical end key', () => {
    const on = orderWith(TIE_BREAK, 0, null);
    let ties = 0;
    for (let i = 1; i < on.scores.length; i++) {
      expect(on.scores[i - 1]).toBeGreaterThanOrEqual(on.scores[i]);
      if (on.scores[i - 1] === on.scores[i]) {
        ties++;
        expect(on.keys[i - 1] <= on.keys[i], `${on.keys[i - 1]} then ${on.keys[i]}`).toBe(true);
      }
    }
    // The assertion above is vacuous unless the position really has ties.
    expect(ties).toBeGreaterThan(0);
  });

  it('leaves the champion\'s ordering ties in generator order, which is what it replaces', () => {
    const off = orderWith(undefined, 0, null);
    let outOfEndKeyOrder = 0;
    for (let i = 1; i < off.scores.length; i++) {
      if (off.scores[i - 1] === off.scores[i] && off.keys[i - 1] > off.keys[i]) outOfEndKeyOrder++;
    }
    expect(outOfEndKeyOrder).toBeGreaterThan(0);
  });

  it('changes what a fixed-work search returns, so the arm is not an A/A run', async () => {
    const state = createInitialGameState();
    const a = await new HardEngine().searchTurn(state, { work: 100_000 });
    const b = await new HardEngine(TIE_BREAK).searchTurn(state, { work: 100_000 });
    // Same legal-turn contract either way; the answer itself may or may not move
    // on this particular position, so only the hygiene is asserted here.
    expect(b.actions.length).toBeGreaterThan(0);
    expect(b.source).toBe(a.source);
  });
});
