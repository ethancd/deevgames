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
 *      flag. No root has an adjacent zero-power pair, but units walk into
 *      one mid-turn: at the lowered budgets below the prune fires on
 *      `p4-det-014` and `p4-det-022`, and the last test in that block fails
 *      if no row fires any more (the corpus would then prove nothing);
 *   4. seeded random contact positions biased towards zero-power attackers,
 *      with kills, cleave continuations, chip damage and home-corner contact
 *      mixed in, checked with the turn TT off and on — the positions a
 *      subtle hole in the "superset" half of the argument would show up in.
 *
 * Plus one packable-but-unreachable row (a victim already at effective
 * defence 0, where a zero-power hit KILLS) for the prune's non-lethal guard.
 *
 * Three more checks pin the rest of the flag's contract:
 *
 *   - under a BINDING width (the shipped `6, 4, 3, 2` and a `2, 1, 1, 1`
 *     beam), a dropped attack never holds a beam slot: the pruned root
 *     explores as many real candidates as the unpruned root explored in all,
 *     keeping every real one the unpruned root had (review of W1.7: the first
 *     cut dropped the attack AFTER the width cut and left the slot empty);
 *   - `engine.ts` wires the flag through `gen/generate.ts` to every
 *     generator the engine owns, the reference generator included: with it,
 *     no emitted turn contains a zero-power ATTACK (judged by replaying the
 *     turn through `src/game` and `calculateAttackPower`, not by the packed
 *     table the prune reads); without it, the same position emits one;
 *   - with `pruneZeroDamage` never turned on, `dfs` must be exactly today's
 *     code — a pristine `ActionSearch` against one that toggled the flag on
 *     and back off, field-by-field over every kept `Turn`. (The review of
 *     W1.7 also compared the flag-off output against `a54e9885`'s
 *     `actionsearch.ts` itself on all 27 rows of both files at three width
 *     shapes and two TT sizes: identical.)
 */
import { describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import { ACTIONS_PER_TURN, Replica, allocState } from '../../../src/ai/hard/core/state';
import { Scratch } from '../../../src/ai/hard/core/bits';
import { AKind, paA, paB, paKind } from '../../../src/ai/hard/core/action';
import { Result, type PackedState } from '../../../src/ai/hard/types';
import { ActionSearch, UNLIMITED_WORK, neutralTables } from '../../../src/ai/hard/gen/actionsearch';
import { referenceCapacity } from '../../../src/ai/hard/gen/generate';
import { TurnPool, type Turn } from '../../../src/ai/hard/gen/turn';
import type { HardConfig } from '../../../src/ai/hard/config';
import { generateAt } from '../../../src/ai/hard/search/pvs';
import { verifyTurn } from '../../../src/ai/hard/verify/replay';
import { applyAction } from '../../../src/ai/simulate';
import type { AIAction } from '../../../src/ai/types';
import { getUnitAt } from '../../../src/game/board';
import { calculateAttackPower } from '../../../src/game/combat';
import { getUnitDefinition } from '../../../src/game/units';
import { readPositions, type StoredPosition } from '../../../lab/hard-ai/positions/corpus';
import type { GameState } from '../../../src/game/types';
import { buildState } from './game-fixture';
import { prepare as prepareEngine } from './search-fixture';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');
const ZERO_DAMAGE_PATH = path.resolve(REPO_ROOT, 'lab/hard-ai/positions/zero-damage.jsonl');
const P4_DETERMINISM_PATH = path.resolve(REPO_ROOT, 'lab/hard-ai/positions/p4-determinism.jsonl');

// CHOICE (measured: the slowest single test, a 20-unit corpus row, takes about
// 5 s under vitest on an idle box, and this machine is shared with other
// lanes' suites; falsifier: a timeout here with the box idle). The repo floor
// is 10 s (`vitest.config.ts`).
vi.setConfig({ testTimeout: 60_000 });

/** DERIVED (larger than any node's action list, `4 + 128 * 104`, as
 * `oracles/canonical-check.ts UNBOUNDED_WIDTH`) — C1 alone decides pruning,
 * never width. */
const UNBOUNDED = new Int32Array([1 << 24, 1 << 24, 1 << 24, 1 << 24]);
/** CHOICE (the four-unit fixtures fit with room to spare; for the corpus it is
 * the budget-lowering step's per-attempt cap, `oracles/canonical-check.ts`'s
 * pattern, kept modest so a budget that does not fit fails fast; falsifier:
 * the "no action budget fit" assertions). */
const NAIVE_NODE_BUDGET = 200_000;

function keyOf(lo: number, hi: number): string {
  return `${hi >>> 0}:${lo >>> 0}`;
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

/**
 * `oracles/canonical-check.ts`'s strategy for positions whose naive tree is
 * intractable at a full Act (root branching runs to hundreds with
 * multi-action moves): lower `p.actions` — a perfectly ordinary mid-turn
 * state — until the naive walk fits `maxCalls`, and return its end
 * set at that budget, leaving `prepared.p` there so the searches under test
 * run at the same budget.
 */
function naiveAtLargestBudget(prepared: Prepared, maxCalls = NAIVE_NODE_BUDGET): Set<string> | null {
  for (let budget = Math.min(prepared.p.actions, ACTIONS_PER_TURN); budget >= 1; budget--) {
    if (prepared.p.actions !== budget) {
      prepared.p.actions = budget;
      prepared.rep.rehash(prepared.p);
    }
    const keys = naiveEndSet(prepared, maxCalls);
    if (keys !== null) return keys;
  }
  return null;
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

/**
 * End-set equality with a failure that names the difference (its size and the
 * first few keys each way) rather than diffing two sorted arrays of up to
 * ~18,000 keys, which vitest's deep equality makes the slowest step here.
 */
function expectSameEnds(actual: ReadonlySet<string>, expected: ReadonlySet<string> | null, label = ''): void {
  expect(expected, `${label}: no ground-truth set`).not.toBeNull();
  const want = expected as ReadonlySet<string>;
  const missing: string[] = [];
  const extra: string[] = [];
  for (const k of want) if (!actual.has(k)) missing.push(k);
  for (const k of actual) if (!want.has(k)) extra.push(k);
  expect({ missing: missing.length, extra: extra.length, firstMissing: missing.slice(0, 5), firstExtra: extra.slice(0, 5) }, label)
    .toEqual({ missing: 0, extra: 0, firstMissing: [], firstExtra: [] });
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
    expectSameEnds(unpruned.keys, naive);
    expectSameEnds(pruned.keys, naive);
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
    expectSameEnds(unpruned.keys, naive);
    expectSameEnds(pruned.keys, naive);
    // Not merely "same end set" (that would also hold for a sound prune that
    // fired) — same NODE COUNT: nothing was skipped at all.
    expect(pruned.search.nodes).toBe(unpruned.search.nodes);
    expect(pruned.search.visits).toBe(unpruned.search.visits);
  });

  it('a zero-power hit on a victim at effective defence 0 is a KILL and is never pruned', () => {
    // Not reachable in play (every defence is >= 1 and the victim's side
    // healed at its own turn start), but `pack` accepts it: metal_1 (defence
    // 3) already carries 3 damage, so plant_1's 0-power hit satisfies
    // `makeAttack`'s `power >= effectiveDef` and REMOVES it. The prune's
    // `effectiveDef > 0` guard must keep it; without the guard the pruned
    // search loses every end position after that kill (113 of 336 here).
    const prepared = prepare(buildState({ units: [
      { def: 'plant_1', owner: 'white', x: 4, y: 4 },
      { def: 'metal_1', owner: 'black', x: 4, y: 5, damage: 3 },
      { def: 'water_1', owner: 'white', x: 1, y: 1 },
      { def: 'shadow_1', owner: 'black', x: 8, y: 8 },
    ] }));
    const naive = naiveEndSet(prepared, NAIVE_NODE_BUDGET);
    expect(naive).not.toBeNull();
    const pruned = canonicalRun(prepared, true);
    expectSameEnds(pruned.keys, naive);
  });
});

describe('seeded random contact positions (naive vs pruned, TT off and on)', () => {
  // Units drawn in one 5x5 window so most of them start in contact; White
  // (to move) mostly from the attackers that have a zero-power matchup
  // (`plant_1` against anything but water/shadow; the attack-1 units against
  // their disadvantaged pair), Black from the whole catalogue with some
  // pre-set chip damage (always below its defence) and a random kill-clock
  // reading. That mixes zero-power hits with real kills, cleave continuations
  // (a kill re-arms the attacker, a later zero-power hit disarms it — the
  // "superset" half of the soundness argument) and home-corner contact.
  const ZERO_PRONE = ['plant_1', 'plant_1', 'plant_2', 'metal_1', 'metal_2', 'lightning_1'];
  const ANY = ['fire_1', 'fire_2', 'lightning_1', 'lightning_2', 'water_1', 'water_2', 'shadow_1', 'shadow_2',
    'plant_1', 'plant_2', 'metal_1', 'metal_2', 'fire_3', 'water_3', 'shadow_3', 'plant_3', 'metal_3', 'lightning_3'];
  // CHOICE (enough positions for kills, cleaves and zero-power hits to
  // co-occur, few enough to stay seconds inside `hard:test`; falsifier: the
  // "fired" tally below, and the review's 150-position run of the same
  // generator, which found no mismatch).
  const CASES = 12;
  const SEED = 7107; // CHOICE (any fixed seed; the positions are only a sample)
  /** CHOICE (a quarter of the corpus cap: a 3v3 contact tree is dense, and a
   * three-action budget still holds kill-then-hit sequences; falsifier: the
   * "fired" tally below). */
  const FUZZ_NAIVE_CALLS = 50_000;

  function contactPositions(): GameState[] {
    let seed = SEED;
    const rnd = (): number => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const pick = (xs: readonly string[]): string => xs[Math.floor(rnd() * xs.length)];
    const out: GameState[] = [];
    for (let c = 0; c < CASES; c++) {
      const nearCorner = rnd() < 0.3;
      const ox = nearCorner ? (rnd() < 0.5 ? 0 : 5) : Math.floor(rnd() * 6);
      const oy = nearCorner ? (rnd() < 0.5 ? 0 : 5) : Math.floor(rnd() * 6);
      const whites = 2 + Math.floor(rnd() * 2);
      const blacks = 2 + Math.floor(rnd() * 2);
      const used = new Set<number>();
      const units = [];
      for (let i = 0; i < whites + blacks; i++) {
        let x = 0, y = 0;
        do {
          x = ox + Math.floor(rnd() * 5);
          y = oy + Math.floor(rnd() * 5);
        } while (used.has(y * 10 + x));
        used.add(y * 10 + x);
        const white = i < whites;
        const def = white ? (rnd() < 0.8 ? pick(ZERO_PRONE) : pick(ANY)) : pick(ANY);
        const defence = getUnitDefinition(def).defense;
        const damage = !white && rnd() < 0.3 ? Math.floor(rnd() * defence) : 0;
        units.push({ def, owner: white ? 'white' as const : 'black' as const, x, y, damage });
      }
      out.push(buildState({ units, inactivityPlies: Math.floor(rnd() * 10), turnNumber: 3 }));
    }
    return out;
  }

  const fired: number[] = [];

  it.each(contactPositions().map((state, i) => [i, state] as const))('position %i: pruned end set equals naive', (i, state) => {
    const prepared = prepare(state);
    const naive = naiveAtLargestBudget(prepared, FUZZ_NAIVE_CALLS);
    expect(naive, `position ${i}: no action budget fit`).not.toBeNull();
    const pruned = canonicalRun(prepared, true);
    expectSameEnds(pruned.keys, naive);
    const withTt = newSearch(prepared.rep, 16);
    withTt.setPruneZeroDamage(true);
    const ttKeys = new Set<string>();
    withTt.setEndObserver((lo, hi) => ttKeys.add(keyOf(lo, hi)));
    withTt.run(prepared.p, neutralTables(), new Int32Array(0), 0, -1, () => 0, UNLIMITED_WORK, 0, []);
    expectSameEnds(ttKeys, naive);
    if (pruned.search.nodes < canonicalRun(prepared, false).search.nodes) fired.push(i);
  });

  it('the prune fired on most of these positions', () => {
    expect(fired.length).toBeGreaterThanOrEqual(CASES / 2);
  });
});

/** The src/game verdict on one packed ATTACK at a FRESHLY packed root, where
 * `pack` puts `board.units[i]` in slot `i`: independent of the packed
 * `power` table the prune itself reads. */
function isZeroPowerAtRoot(state: GameState, a: number): boolean {
  if (paKind(a) !== AKind.ATTACK) return false;
  const attacker = state.board.units[paA(a)];
  const square = paB(a);
  const defender = getUnitAt(state.board, { x: square % 10, y: Math.floor(square / 10) });
  if (attacker === undefined || defender === null) throw new Error('zero-damage-prune.test: ATTACK names no unit');
  return calculateAttackPower(attacker, defender) === 0;
}

describe('a dropped attack never holds a beam slot (binding widths)', () => {
  const rows = readPositions(ZERO_DAMAGE_PATH);
  /** Enough to keep every end the narrow beams below reach (at most ~80), so
   * the kept turns' first actions list every root candidate `dfs` explored. */
  const KEEP_ALL = 256; // CHOICE (covers every end these 4-unit rows reach; falsifier: the `n === ends` check below)

  /** The distinct first actions over every recorded end: the root's explored
   * candidates. `END_ACTION`-first turns are the root's own pass. */
  function rootCandidates(prepared: Prepared, widths: readonly number[], prune: boolean): Set<number> {
    const search = new ActionSearch(prepared.rep, { widths: Int32Array.from(widths), keep: KEEP_ALL, ttBits: 0 }, new TurnPool(KEEP_ALL), new Scratch(1, 1, 1, 1));
    if (prune) search.setPruneZeroDamage(true);
    const out: Turn[] = [];
    const n = search.run(prepared.p, neutralTables(), new Int32Array(0), 0, -1, () => 0, UNLIMITED_WORK, 0, out);
    expect(n, 'every end must be kept').toBe(search.ends);
    const firsts = new Set<number>();
    for (let i = 0; i < n; i++) if (paKind(out[i].actions[0]) !== AKind.END_ACTION) firsts.add(out[i].actions[0]);
    return firsts;
  }

  // DERIVED (`src/ai/hard/config.ts` DESKTOP shape `widths: [6, 4, 3, 2]`,
  // the beam `hard@strategos` inherits) and CHOICE (`2, 1, 1, 1`, the
  // narrowest beam that still branches at the root, as the P8 tests use;
  // falsifier: a root with at most `width` legal actions, which would make the
  // width non-binding — the `toBe(width)` assertion below catches it).
  it.each([
    ['zd-neutral-plant-metal', [6, 4, 3, 2]],
    ['zd-neutral-plant-metal', [2, 1, 1, 1]],
    ['zd-disadvantage-metal-fire', [6, 4, 3, 2]],
    ['zd-disadvantage-metal-fire', [2, 1, 1, 1]],
  ] as const)('%s at widths %j: the pruned root explores a full beam of real candidates', (id, widths) => {
    const state = findRow(rows, id);
    const unpruned = rootCandidates(prepare(state), widths, false);
    const pruned = rootCandidates(prepare(state), widths, true);
    // The fixture really exercises the beam: the width binds, and MVV-LVA
    // ranks the zero-power hit inside it.
    expect(unpruned.size).toBe(widths[0]);
    expect([...unpruned].some(a => isZeroPowerAtRoot(state, a))).toBe(true);
    // The prune frees that slot for the next real candidate instead of
    // leaving it empty, and loses none of the real ones.
    expect([...pruned].some(a => isZeroPowerAtRoot(state, a))).toBe(false);
    expect(pruned.size).toBe(widths[0]);
    for (const a of unpruned) if (!isZeroPowerAtRoot(state, a)) expect(pruned.has(a)).toBe(true);
  });

  it('the paired power-1 row explores the identical root beam with or without the prune', () => {
    const state = findRow(rows, 'zd-paired-power1-plant-water');
    for (const widths of [[6, 4, 3, 2], [2, 1, 1, 1]] as const) {
      expect([...rootCandidates(prepare(state), widths, true)].sort()).toEqual([...rootCandidates(prepare(state), widths, false)].sort());
    }
  });
});

describe('engine wiring: SearchFix.pruneZeroDamage reaches every generator the engine owns', () => {
  // The zd-neutral-plant-metal pair on the fixture helpers' board: White's
  // plant_1 (attack 0) next to Black's metal_1, one more unit each side.
  const contact = (): GameState => buildState({ units: [
    { def: 'plant_1', owner: 'white', x: 4, y: 4 },
    { def: 'metal_1', owner: 'black', x: 4, y: 5 },
    { def: 'water_1', owner: 'white', x: 1, y: 1 },
    { def: 'shadow_1', owner: 'black', x: 8, y: 8 },
  ] });

  /** Zero-power ATTACKs in `actions`, judged by `src/game` on the replayed state. */
  function zeroPowerHits(state: GameState, actions: readonly AIAction[]): number {
    let s = state;
    let hits = 0;
    for (const action of actions) {
      if (action.type === 'ATTACK') {
        const attacker = s.board.units.find(u => u.id === action.unitId);
        const defender = getUnitAt(s.board, action.targetPosition);
        if (attacker !== undefined && defender !== null && calculateAttackPower(attacker, defender) === 0) hits++;
      }
      s = applyAction(s, action);
    }
    return hits;
  }

  /** Per generator (`gen`, `genInterior`, `genQuiesce`, then `gen`'s reference
   * search): how many emitted turns hold a zero-power ATTACK. Every turn must
   * replay legally, so an empty or broken list cannot pass as "no hits". */
  function hitsPerGenerator(cfg: Partial<HardConfig>): number[] {
    const state = contact();
    const { ctx, p } = prepareEngine(state, 200_000, cfg);
    const counts: number[] = [];
    const tally = (turns: readonly Turn[], n: number): void => {
      expect(n).toBeGreaterThan(0);
      let withHit = 0;
      for (let i = 0; i < n; i++) {
        const check = verifyTurn(ctx.rep, state, p, turns[i], ctx.keep[0]);
        expect(check.verified, check.reason).toBe(true);
        if (zeroPowerHits(state, check.actions) > 0) withHit++;
      }
      counts.push(withHit);
    };
    for (const generator of [ctx.gen, ctx.genInterior, ctx.genQuiesce]) {
      ctx.truncated = false;
      tally(ctx.turns[0], generateAt(ctx, p, ctx.tables[0], 0, generator));
    }
    const refOut: Turn[] = new Array<Turn>(referenceCapacity());
    tally(refOut, ctx.gen.generateReference(p, ctx.tables[0], ctx.score, 0, ctx.keep[0], refOut));
    return counts;
  }

  it('flag absent: the same position emits zero-power ATTACKs (so the check below is not vacuous)', () => {
    expect(hitsPerGenerator({}).some(c => c > 0)).toBe(true);
  });

  it('flag on: no generator, reference included, emits a zero-power ATTACK', () => {
    expect(hitsPerGenerator({ searchFix: { pruneZeroDamage: true } })).toEqual([0, 0, 0, 0]);
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
  /** Rows on which the pruned search visited fewer nodes than the unpruned
   * one at the same budget — i.e. the prune actually fired somewhere in the
   * tree. Filled by the per-row tests, read by the last one. */
  const fired: string[] = [];

  it('has rows to check', () => {
    expect(rows.length).toBeGreaterThan(0);
  });

  it.each(rows.map(r => [r.id] as const))(
    '%s: pruned end set equals naive at the largest action budget that fits the node bound',
    id => {
      const row = rows.find(r => r.id === id);
      if (row === undefined) throw new Error(`missing row ${id}`);
      const prepared = prepare(row.state);
      const naiveKeys = naiveAtLargestBudget(prepared);
      expect(naiveKeys, `${id}: no action budget fit ${NAIVE_NODE_BUDGET} naive calls`).not.toBeNull();

      const pruned = canonicalRun(prepared, true);
      expectSameEnds(pruned.keys, naiveKeys, id);
      if (pruned.search.nodes < canonicalRun(prepared, false).search.nodes) fired.push(id);
    },
  );

  it('the prune fired on at least one corpus row (else the rows above prove nothing about it)', () => {
    expect(fired.length).toBeGreaterThan(0);
  });
});
