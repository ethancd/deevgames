// @vitest-environment node
/**
 * STRATEGOS W1.7 (plan `~/.claude/plans/can-you-respond-to-piped-book.md`,
 * Part B.2 step W1.7): `gen/actionsearch.ts ActionSearch.dfs` skips
 * generating an ATTACK whose packed power against its target is exactly 0,
 * under `SearchFix.pruneZeroDamage`. `isZeroPowerAttack`'s own doc comment
 * carries the soundness argument (why dropping such an action can never
 * remove a reachable end position); this file is the acceptance test for
 * that argument, on three kinds of evidence:
 *
 *   1. authored fixtures (`lab/hard-ai/positions/zero-damage.jsonl`, built by
 *      `lab/hard-ai/positions/generate-zero-damage.ts`) with a genuine
 *      zero-power attacker/defender pair, by two different derivations (a
 *      zero BASE attack stat, and an elemental DISADVANTAGE clamp) — pruned
 *      end-position set equals the naive (unbounded, unordered, no-TT) set,
 *      and the pruned search visits fewer nodes;
 *   2. a PAIRED fixture in the same file whose only changed fact is the
 *      defender's element, making the power 1 instead of 0 — proving the
 *      condition really is `power === 0` and not `power < effectiveDef`: this
 *      one must NOT be pruned (same node count as unpruned);
 *   3. `lab/hard-ai/positions/p4-determinism.jsonl` (W1.11's determinism
 *      corpus, real Phasing Act roots from replayed openings, 3 to 20 own
 *      units) — broad soundness on positions nobody hand-picked for this
 *      flag. None of the 24 rows happens to contain an adjacent zero-power
 *      pair (checked separately), so this corpus tests set EQUALITY, not the
 *      node-count reduction; (1) already covers that.
 *
 * A fourth check pins the OTHER half of the flag's contract: with
 * `pruneZeroDamage` never turned on, `dfs` must be exactly today's code —
 * checked by comparing a pristine `ActionSearch` against one that toggled the
 * flag on and back off, field-by-field over every kept `Turn`.
 */
import { describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import { ACTIONS_PER_TURN, Replica, allocState } from '../../../src/ai/hard/core/state';
import { Scratch } from '../../../src/ai/hard/core/bits';
import { Result, type PackedState } from '../../../src/ai/hard/types';
import { ActionSearch, UNLIMITED_WORK, neutralTables } from '../../../src/ai/hard/gen/actionsearch';
import { TurnPool, type Turn } from '../../../src/ai/hard/gen/turn';
import { readPositions, type StoredPosition } from '../../../lab/hard-ai/positions/corpus';
import type { GameState } from '../../../src/game/types';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');
const ZERO_DAMAGE_PATH = path.resolve(REPO_ROOT, 'lab/hard-ai/positions/zero-damage.jsonl');
const P4_DETERMINISM_PATH = path.resolve(REPO_ROOT, 'lab/hard-ai/positions/p4-determinism.jsonl');

// Some p4-determinism rows carry up to 20 own units, so the budget-lowering
// loop below (§ corpus soundness) can spend a few real seconds finding the
// action budget whose naive tree fits, ESPECIALLY on this shared box's other
// four lanes' worth of CPU contention; `hard:test`'s own default is 5 s.
vi.setConfig({ testTimeout: 60_000 });

/** Larger than any node's action list — C1 alone decides pruning, never width. */
const UNBOUNDED = new Int32Array([1 << 24, 1 << 24, 1 << 24, 1 << 24]);
/** The zero-damage fixtures are 4 units, depth <= 4: comfortably exhaustive at
 * this budget with room to spare. The corpus positions are not (up to 20 own
 * units), so `NAIVE_NODE_BUDGET` doubles as their budget-lowering step's own
 * per-attempt cap (`oracles/canonical-check.ts`'s pattern) — kept modest so a
 * budget that does not fit fails FAST rather than spending real seconds
 * proving it, since the loop tries every budget from `ACTIONS_PER_TURN` down. */
const NAIVE_NODE_BUDGET = 200_000;

function keyOf(lo: number, hi: number): string {
  return `${(hi >>> 0).toString(16).padStart(8, '0')}${(lo >>> 0).toString(16).padStart(8, '0')}`;
}

function newSearch(rep: Replica, ttBits = 0, keep = 0): ActionSearch {
  return new ActionSearch(rep, { widths: UNBOUNDED, keep, ttBits }, new TurnPool(Math.max(1, keep)), new Scratch(1, 1, 1, 1));
}

interface Prepared {
  rep: Replica;
  p: PackedState;
}

/** Packs `state` and asserts it is already a live, upkeep-clear action-phase
 * root — true of every row in both fixture files (the zero-damage generator
 * sets `turn.phase: 'action'` directly; the p4-determinism corpus is
 * documented as "the state right after an END_PLACE_PHASE hand-off"). */
function prepare(state: GameState): Prepared {
  const rep = new Replica();
  const p = rep.pack(state, allocState());
  expect(p.result).toBe(Result.ONGOING);
  expect(p.upkeepPending).toBe(0);
  expect(p.phase).toBe(1);
  return { rep, p };
}

/** The true, ground-truth end-position set: every legal sequence, no
 * ordering, no widening, no TT — never touches `pruneZeroDamage` (the search
 * class itself never looks at the flag inside `naive()`; see `dfs`'s own
 * doc). Returns `null` if `maxCalls` was not enough (a caller bug for these
 * fixtures, a real possibility for the corpus, hence the separate budget-
 * fitting helper below for that case). */
function naiveEndSet(prepared: Prepared, maxCalls: number): Set<string> | null {
  const search = newSearch(prepared.rep);
  const keys = new Set<string>();
  const n = search.enumerateAll(prepared.p, new Int32Array(0), 0, (lo, hi) => keys.add(keyOf(lo, hi)), maxCalls);
  return n >= 0 ? keys : null;
}

/** The canonical, ordered search — unbounded width, TT off, so C1 is the only
 * live rule besides the prune under test. */
function canonicalRun(prepared: Prepared, pruneZeroDamage: boolean, keep = 0): { keys: Set<string>; search: ActionSearch; out: Turn[] } {
  const search = newSearch(prepared.rep, 0, keep);
  if (pruneZeroDamage) search.setPruneZeroDamage(true);
  const keys = new Set<string>();
  const out: Turn[] = [];
  search.setEndObserver((lo, hi) => keys.add(keyOf(lo, hi)));
  search.run(prepared.p, neutralTables(), new Int32Array(0), 0, -1, () => 0, UNLIMITED_WORK, 0, out);
  search.setEndObserver(null);
  return { keys, search, out };
}

function sortedKeys(keys: ReadonlySet<string>): string[] {
  return [...keys].sort();
}

function findRow(rows: readonly StoredPosition[], id: string): GameState {
  const row = rows.find(r => r.id === id);
  if (row === undefined) throw new Error(`zero-damage-prune.test: missing fixture row "${id}"`);
  return row.state;
}

describe('zero-power attack pairs (lab/hard-ai/positions/zero-damage.jsonl)', () => {
  const rows = readPositions(ZERO_DAMAGE_PATH);

  it('has the three rows this test relies on', () => {
    expect(rows.map(r => r.id).sort()).toEqual(
      ['zd-disadvantage-metal-fire', 'zd-neutral-plant-metal', 'zd-paired-power1-plant-water'].sort(),
    );
  });

  it.each([
    ['zd-neutral-plant-metal', 'plant_1 (atk 0) vs metal_1: neutral modifier clamps power to 0 from the base stat'],
    ['zd-disadvantage-metal-fire', 'metal_1 (atk 1) vs fire_1: elemental disadvantage (-1) clamps power to 0'],
  ] as const)('%s: pruned end set equals naive, with strictly fewer dfs nodes (%s)', (id, _why) => {
    const prepared = prepare(findRow(rows, id));
    const naive = naiveEndSet(prepared, NAIVE_NODE_BUDGET);
    expect(naive, `${id}: naive enumeration exceeded ${NAIVE_NODE_BUDGET} calls`).not.toBeNull();
    const unpruned = canonicalRun(prepared, false);
    const pruned = canonicalRun(prepared, true);
    expect(sortedKeys(unpruned.keys)).toEqual(sortedKeys(naive as Set<string>));
    expect(sortedKeys(pruned.keys)).toEqual(sortedKeys(naive as Set<string>));
    expect(pruned.search.nodes).toBeLessThan(unpruned.search.nodes);
  });

  it('a paired fixture where the pair power is 1 instead of 0 is NOT pruned', () => {
    // Same attacker (plant_1) as zd-neutral-plant-metal; only the defender's
    // element changed (metal -> water), flipping the modifier from neutral
    // to advantage: power = max(0, 0 + 1) = 1. `isZeroPowerAttack`'s
    // condition is `power === 0`, never `power < effectiveDef`, so this ATTACK
    // (a real, damage-dealing chip hit) must survive the prune untouched.
    const prepared = prepare(findRow(rows, 'zd-paired-power1-plant-water'));
    const naive = naiveEndSet(prepared, NAIVE_NODE_BUDGET);
    expect(naive).not.toBeNull();
    const unpruned = canonicalRun(prepared, false);
    const pruned = canonicalRun(prepared, true);
    expect(sortedKeys(unpruned.keys)).toEqual(sortedKeys(naive as Set<string>));
    expect(sortedKeys(pruned.keys)).toEqual(sortedKeys(naive as Set<string>));
    // Not merely "same end set" (that would also hold for a sound prune that
    // fired) — same NODE COUNT: nothing was skipped at all.
    expect(pruned.search.nodes).toBe(unpruned.search.nodes);
    expect(pruned.search.visits).toBe(unpruned.search.visits);
  });
});

describe('flag absent is the champion, byte-identical', () => {
  it('a pristine ActionSearch and one that toggled pruneZeroDamage on and back off emit identical Turn lists', () => {
    const rows = readPositions(ZERO_DAMAGE_PATH);
    const prepared = prepare(findRow(rows, 'zd-neutral-plant-metal'));

    const pristine = newSearch(prepared.rep, 0, 8);
    const outA: Turn[] = [];
    const nA = pristine.run(prepared.p, neutralTables(), new Int32Array(0), 0, -1, p => p.materialCc[0] - p.materialCc[1], UNLIMITED_WORK, 0, outA);

    const toggled = newSearch(prepared.rep, 0, 8);
    toggled.setPruneZeroDamage(true);
    toggled.setPruneZeroDamage(false);
    const outB: Turn[] = [];
    const nB = toggled.run(prepared.p, neutralTables(), new Int32Array(0), 0, -1, p => p.materialCc[0] - p.materialCc[1], UNLIMITED_WORK, 0, outB);

    expect(nB).toBe(nA);
    expect(toggled.nodes).toBe(pristine.nodes);
    expect(toggled.visits).toBe(pristine.visits);
    for (let i = 0; i < nA; i++) {
      const a = outA[i], b = outB[i];
      expect(b.count, `turn ${i} count`).toBe(a.count);
      expect([...b.actions.slice(0, b.count)], `turn ${i} actions`).toEqual([...a.actions.slice(0, a.count)]);
      expect(b.endLo, `turn ${i} endLo`).toBe(a.endLo);
      expect(b.endHi, `turn ${i} endHi`).toBe(a.endHi);
      expect(b.sig, `turn ${i} sig`).toBe(a.sig);
      expect(b.flags, `turn ${i} flags`).toBe(a.flags);
      expect(b.gainCc, `turn ${i} gainCc`).toBe(a.gainCc);
      expect(b.place, `turn ${i} place`).toBe(a.place);
    }
  });
});

describe('corpus soundness (lab/hard-ai/positions/p4-determinism.jsonl)', () => {
  const rows = readPositions(P4_DETERMINISM_PATH);

  it('has rows to check', () => {
    expect(rows.length).toBeGreaterThan(0);
  });

  it.each(rows.map(r => [r.id] as const))(
    '%s: pruned end set equals naive at the largest action budget that fits the node bound',
    id => {
      const row = rows.find(r => r.id === id);
      if (row === undefined) throw new Error(`missing row ${id}`);
      const prepared = prepare(row.state);
      const naiveSearch = newSearch(prepared.rep);

      // Mirrors `oracles/canonical-check.ts`'s own strategy: the naive tree
      // at a real mid-game action budget is intractable (root branching runs
      // to hundreds with multi-action moves), so lower `p.actions` — a
      // perfectly ordinary mid-turn state — until the naive walk fits, then
      // compare BOTH searches at that same (possibly reduced) budget.
      let budget = Math.min(prepared.p.actions, ACTIONS_PER_TURN);
      let naiveKeys: Set<string> | null = null;
      for (; budget >= 1; budget--) {
        if (prepared.p.actions !== budget) {
          prepared.p.actions = budget;
          prepared.rep.rehash(prepared.p);
        }
        const keys = new Set<string>();
        const n = naiveSearch.enumerateAll(prepared.p, new Int32Array(0), 0, (lo, hi) => keys.add(keyOf(lo, hi)), NAIVE_NODE_BUDGET);
        if (n >= 0) {
          naiveKeys = keys;
          break;
        }
      }
      expect(naiveKeys, `${id}: no action budget fit ${NAIVE_NODE_BUDGET} naive calls`).not.toBeNull();

      const pruned = canonicalRun(prepared, true);
      expect(sortedKeys(pruned.keys), id).toEqual(sortedKeys(naiveKeys as Set<string>));
    },
  );
});
