// @vitest-environment node
/**
 * E3.2 B6 — `HardConfig.evalFix.approachTieOrder`, the attack-square tie order
 * of `src/ai/hard/tables/approach.ts` (`docs/hard-ai/e3/E3.2-CORRECTNESS-B6.md`,
 * proposed as `amendments/lane12.md` A2).
 *
 * `classifyFrom` walks the target's empty neighbours in ASCENDING SQUARE INDEX
 * and keeps the first candidate of any pair that ties on `cost` and on `cls`.
 * The board's own symmetry maps `s -> 99 - s`, which reverses that order, so
 * the two spellings of one position can settle on two different attack squares
 * — and `retreats` is `|reach(attackSquare, speed, 1) \ strike[defender]|`, a
 * quantity of the SQUARE. The flag breaks the tie in the ATTACKER's own
 * corner-relative frame (`q` for White, `99 - q` for Black), the order
 * `tables/economy.ts bestRelocationTarget` already uses under B2.
 *
 * Three things are pinned here.
 *
 * 1. THE CHAMPION DOES NOT MOVE: with the block absent, `null`, `{}` or
 *    `{approachTieOrder: false}`, `buildTables` produces byte-identical
 *    `approach` and `retreats` tables. The code path is the same one the
 *    champion always took — `tieFix` is `false`, the `else if` arm is never
 *    entered, and the winning branch's one extra assignment is itself gated.
 * 2. THE FLAG MOVES `retreats` ONLY WHERE A TIE EXISTS. The tie is detected
 *    independently below, from the same enumeration `classifyFrom` performs
 *    (the target's neighbours that are empty or the attacker's own, costed
 *    `ceil(dist/speed)` off the same distance field), over every enemy
 *    attacker — existing units in both forms and every affordable tier-1
 *    purchase from the spawn mask.
 * 3. THE MECHANISM on `fuzz-5150-4-132` is the attack square and not the masks:
 *    one lethal attacker in each spelling, at mirrored squares, same class and
 *    same cost, two different `retreats`.
 */
import { describe, expect, it, vi } from 'vitest';
import type { EvalFix } from '../../../src/ai/hard/config';
import { Replica } from '../../../src/ai/hard/core/state';
import { Scratch, bbHas, bbIsEmpty } from '../../../src/ai/hard/core/bits';
import { activeCatalog } from '../../../src/ai/hard/core/catalog';
import { newSpawnInfo, spawnInfo } from '../../../src/ai/hard/core/spawn';
import { ADJ } from '../../../src/ai/hard/core/tables';
import { allocTables, buildTables, type NodeTables } from '../../../src/ai/hard/tables/context';
import { Approach, classifyApproach } from '../../../src/ai/hard/tables/approach';
import { DEAD, MAX_SLOTS, NO_SLOT, type PackedState, type Side } from '../../../src/ai/hard/types';
import { mirror180, readPositions, type StoredPosition } from '../../../lab/hard-ai/positions/corpus';
import path from 'node:path';

// E0.5 timeout budget: the corpus scan below builds two table sets per position
// over 250 stored positions (~12 s on an M2 Max); 60 s is this file's ceiling.
vi.setConfig({ testTimeout: 60_000 });

const replica = new Replica();
const SC = new Scratch(4, 8, 8, 8);

const FUZZ = path.resolve(import.meta.dirname, '../../../lab/hard-ai/positions/fuzz-1000.jsonl');
let fuzzCache: StoredPosition[] | null = null;
function fuzz(): StoredPosition[] {
  if (fuzzCache === null) fuzzCache = readPositions(FUZZ);
  return fuzzCache;
}
function fuzzPosition(id: string): StoredPosition {
  const got = fuzz().find(p => p.id === id);
  if (got === undefined) throw new Error(`fuzz-1000.jsonl has no position ${id}`);
  return got;
}

const ON: EvalFix = { approachTieOrder: true };

function tablesFor(p: PackedState, fix: EvalFix | null): NodeTables {
  const t = allocTables();
  t.evalFix = fix;
  return buildTables(p, SC, 0, 2, t);
}

/**
 * The number of candidate attack squares that tie on the CHEAPEST cost, for one
 * (attacker distance field, speed) against one target square. This is
 * `classifyFrom`'s own candidate set — `ADJ[targetSq]` minus the occupancy,
 * plus the attacker's own square when it is already adjacent — costed with the
 * same `ceil(dist/speed)`. The class filter and the action budget are
 * deliberately NOT applied: both can only shrink the candidate set, so a slot
 * this function calls tie-free is tie-free under the real predicate too.
 */
function minCostTies(p: PackedState, dist: Int8Array, attackerSq: number, speed: number, targetSq: number): number {
  let best = -1;
  let n = 0;
  for (let q = 0; q < 100; q++) {
    if (!bbHas(ADJ[targetSq], q)) continue;
    if (p.pieceAt[q] !== NO_SLOT && q !== attackerSq) continue;
    const d = dist[q];
    if (d < 0) continue;
    const cost = d === 0 ? 0 : ((d + speed - 1) / speed) | 0;
    if (best < 0 || cost < best) {
      best = cost;
      n = 1;
    } else if (cost === best) {
      n++;
    }
  }
  return n;
}

/** True when NO enemy attacker of slot `v` has two equally cheap attack squares. */
function tieFree(p: PackedState, t: NodeTables, v: number): boolean {
  const cat = activeCatalog();
  const defender = p.owner[v] as Side;
  const attacker = (1 - defender) as Side;
  const targetSq = p.sq[v];
  for (let a = 0; a < MAX_SLOTS; a++) {
    if (p.sq[a] === DEAD || p.owner[a] !== attacker) continue;
    const existing = p.defId[a];
    const promoted = cat.nextDef[existing];
    const forms = promoted >= 0 ? [existing, promoted] : [existing];
    for (const def of forms) {
      const speed = cat.spd[def];
      if (speed < 1) continue;
      if (minCostTies(p, t.dist.get(p, p.sq[a]), p.sq[a], speed, targetSq) > 1) return false;
    }
  }
  const info = newSpawnInfo();
  spawnInfo(p, attacker, info);
  if (!bbIsEmpty(info.legal)) {
    const buyDist = new Int8Array(100);
    t.dist.multi(p, info.legal, buyDist);
    for (let i = 0; i < cat.tier1.length; i++) {
      const def = cat.tier1[i];
      if (cat.cost[def] > p.bank[attacker]) continue;
      const speed = cat.spd[def];
      if (speed < 1) continue;
      if (minCostTies(p, buyDist, -1, speed, targetSq) > 1) return false;
    }
  }
  return true;
}

describe('B6 — the flag is absent by default and the champion path is unchanged', () => {
  it('`null`, `{}` and `{approachTieOrder: false}` give the champion\'s approach tables', () => {
    for (const item of fuzz().slice(0, 40)) {
      const p = replica.pack(item.state);
      const base = tablesFor(p, null);
      const cls = Uint8Array.from(base.approach);
      const ret = Uint8Array.from(base.retreats);
      for (const fix of [{}, { approachTieOrder: false }, { inv3RetreatConjunct: true, approachTieOrder: false }]) {
        const t = tablesFor(p, fix as EvalFix);
        expect([...t.approach], `${item.id} class`).toEqual([...cls]);
        expect([...t.retreats], `${item.id} retreats`).toEqual([...ret]);
      }
    }
  });

  it('the flag moves `retreats` and never `approach`', () => {
    // `cls` and `d` are equal by construction in the tie the flag re-breaks, so
    // the class table cannot move; only the retreat count of the chosen square.
    for (const id of ['fuzz-5150-4-132', 'fuzz-5150-1525-94', 'fuzz-5150-263-483']) {
      const p = replica.pack(fuzzPosition(id).state);
      const off = tablesFor(p, null);
      const cls = Uint8Array.from(off.approach);
      const on = tablesFor(p, ON);
      expect([...on.approach], id).toEqual([...cls]);
    }
  });
});

describe('B6 — `retreats` moves only where an attack-square tie exists', () => {
  it('is unchanged at every tie-free slot (fuzz-1000, first 250 positions)', () => {
    let slots = 0;
    let tieFreeSlots = 0;
    let moved = 0;
    for (const item of fuzz().slice(0, 250)) {
      const p = replica.pack(item.state);
      const off = tablesFor(p, null);
      const retreatsOff = Uint8Array.from(off.retreats);
      const on = tablesFor(p, ON);
      for (let v = 0; v < MAX_SLOTS; v++) {
        if (p.sq[v] === DEAD) continue;
        if (off.approach[v] === Approach.NONE) continue;
        slots++;
        if (retreatsOff[v] !== on.retreats[v]) moved++;
        if (!tieFree(p, off, v)) continue;
        tieFreeSlots++;
        expect(on.retreats[v], `${item.id} slot ${v}`).toBe(retreatsOff[v]);
      }
    }
    // Sample sizes, so the assertion above is not vacuous. Whole-corpus numbers
    // (`E3.2-CORRECTNESS-B6.md` §3): 7,137 slots, 650 tie-free, 4 moved.
    expect(slots).toBeGreaterThan(1_000);
    expect(tieFreeSlots).toBeGreaterThan(100);
    expect(moved).toBeLessThan(slots / 100);
  });
});

describe('B6 — the mechanism on fuzz-5150-4-132 is the attack square', () => {
  /**
   * Judge 4. The victim is slot 1, a body at square 1 in the position and at
   * square 98 in its rot180 + seat-swap mirror; the one lethal attacker sits at
   * square 43 and at square 56. `classifyApproach` returns the same class and
   * the same cost for both, so the two spellings agree about everything the
   * approach table reports EXCEPT the retreat count of the square each picked.
   */
  const state = () => fuzzPosition('fuzz-5150-4-132').state;

  it('one attacker, mirrored squares, same class and cost, two retreat counts', () => {
    const p = replica.pack(state());
    const q = replica.pack(mirror180(state()));
    const tp = tablesFor(p, null);
    const tq = tablesFor(q, null);
    expect(p.sq[1]).toBe(1);
    expect(q.sq[1]).toBe(98);

    const a = classifyApproach(p, tp, 43, activeCatalog().spd[p.defId[3]], 1, SC, 0);
    const b = classifyApproach(q, tq, 56, activeCatalog().spd[q.defId[3]], 1, SC, 0);
    expect(a.cls).toBe(Approach.RETREAT);
    expect(b.cls).toBe(Approach.RETREAT);
    expect(a.d).toBe(2);
    expect(b.d).toBe(2);
    expect(a.retreats).toBe(0);
    expect(b.retreats).toBe(1);
  });

  it('the flag makes the two spellings agree, and B4 then reads the same bit', () => {
    const p = replica.pack(state());
    const q = replica.pack(mirror180(state()));
    expect(tablesFor(p, null).retreats[1]).toBe(0);
    expect(tablesFor(q, null).retreats[1]).toBe(1);
    expect(tablesFor(p, ON).retreats[1]).toBe(1);
    expect(tablesFor(q, ON).retreats[1]).toBe(1);
  });
});
