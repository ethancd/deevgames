/**
 * Upkeep keep-sets (DESIGN §4.13 `gen/upkeep.ts`, §5.10).
 *
 * When a turn opens with `upkeepPending`, its FIRST action is `PAY_UPKEEP` and
 * the choice it carries — which rent-bearing bodies to keep — is a searched
 * root branch, not a static rank (MF; DESIGN §5.10). `genKeepSets` produces the
 * branch list.
 *
 * **Candidates** reproduce `upkeepActions` (`upkeep.ts:34-55`) exactly:
 *   - tier-1 bodies pay no rent and can never be released
 *     (`settleUpkeep`/`isUpkeepSelectionLegal`), so they are in EVERY set and
 *     are not choices;
 *   - with at most `MAX_RENT_UNITS` rent-bearing bodies, every affordable
 *     subset is enumerated, keep-first, in the canonical order;
 *   - above that, the empty set plus the four greedy orderings (by `cost`,
 *     `defense`, `attack`, `mining`, descending, ties by square) — the exact
 *     fallback the canonical engine uses.
 *
 * **Ranking** is DESIGN §5.10's, and is the one place this module is RICHER
 * than `Replica.genKeepSets` (`core/state.ts`, M5): `core` cannot see
 * `NodeTables`, so the replica's own ranking stops at "rescuer adjacent to my
 * corner, unblocked anchor, `material − RENT_PV × upkeep`". Here the third
 * clause of §5.10 — "every attacker in `killNow[me]`" — is available and
 * applied. The two enumerate the same SETS; they may order them differently,
 * and neither order is a contract — a `PAY_UPKEEP` carries an index into the
 * table the same call produced (`paA`), never into the other module's.
 *
 * The ranking is applied UNCONDITIONALLY, not only when the 64-set cap binds:
 * `KeepSetTable` holds at most `KEEP_SET_CAPACITY` (64) entries, which is
 * §5.10's root cap, and interior nodes take a PREFIX of the ranked list
 * (`gen/generate.ts INTERIOR_KEEP_SETS`), so entry 0 must be the best-ranked
 * set at every candidate count.
 */
import { CC, DEAD, MAX_SLOTS, NO_SLOT, Result, type PackedState, type Side, type Slot } from '../types';
import { bbHas } from '../core/bits';
import { ADJ_LIST, CORNER } from '../core/tables';
import { activeCatalog, powerIndex, type Catalog } from '../core/catalog';
import { KEEP_SET_CAPACITY, keepSetAdd, keepSetReset, type KeepSetTable } from '../core/action';
import { ACTIONS_PER_TURN } from '../core/state';
import { moveCost } from '../core/movement';
import { RENT_PV } from '../core/income';
import type { NodeTables } from '../tables/context';

/** `upkeep.ts:37` — above this the canonical engine switches to greedy sets. */
export const MAX_RENT_UNITS = 12;
/** Exact enumeration writes at most `2^MAX_RENT_UNITS` subsets. */
const MAX_KEEP_CANDIDATES = 1 << MAX_RENT_UNITS;
const KEEP_WORDS = MAX_SLOTS >>> 5;

/** §5.10's ranking tiers, spaced so a higher clause always dominates the lower
 * ones: the residual `material − RENT_PV × upkeep` term is bounded by
 * `17 × CC` per body over at most `MAX_SLOTS` bodies. */
const RANK_RESCUER = 8_000_000;
const RANK_ANCHOR = 4_000_000;
const RANK_ATTACKER = 2_000_000;

const KEEP_BUF = new Uint32Array(MAX_KEEP_CANDIDATES * KEEP_WORDS);
const KEEP_WORK = new Uint32Array(KEEP_WORDS);
const KEEP_BASE = new Uint32Array(KEEP_WORDS);
const KEEP_SCORE = new Int32Array(MAX_KEEP_CANDIDATES);
const KEEP_TAKEN = new Uint8Array(MAX_KEEP_CANDIDATES);
const KEEP_CHOSEN = new Int32Array(KEEP_SET_CAPACITY);
const RENT_SLOT = new Int32Array(MAX_SLOTS);
const RENT_COST = new Int32Array(MAX_SLOTS);
const RENT_ORDER = new Int32Array(MAX_SLOTS);
const RENT_PRIORITY = new Int32Array(MAX_SLOTS);

function bitSet(words: Uint32Array, base: number, slot: Slot): void {
  words[base + (slot >>> 5)] |= 1 << (slot & 31);
}

function bitHas(words: Uint32Array, base: number, slot: Slot): boolean {
  return (words[base + (slot >>> 5)] & (1 << (slot & 31))) !== 0;
}

/**
 * Keep-first DFS over the rent-bearing bodies, mirroring `upkeepActions`'s
 * `visit` (`upkeep.ts:39-44`): at each body the KEEP branch is taken first when
 * the remaining cash allows it, then the RELEASE branch.
 */
function enumerateSubsets(rentCount: number, cash: number): number {
  let written = 0;
  KEEP_WORK.fill(0);
  const visit = (i: number, left: number): void => {
    if (written >= MAX_KEEP_CANDIDATES) return;
    if (i === rentCount) {
      const dst = written * KEEP_WORDS;
      for (let w = 0; w < KEEP_WORDS; w++) KEEP_BUF[dst + w] = KEEP_WORK[w];
      written++;
      return;
    }
    const slot = RENT_SLOT[i];
    const rent = RENT_COST[i];
    if (rent <= left) {
      bitSet(KEEP_WORK, 0, slot);
      visit(i + 1, left - rent);
      KEEP_WORK[slot >>> 5] &= ~(1 << (slot & 31));
    }
    visit(i + 1, left);
  };
  visit(0, cash);
  return written;
}

/** The `> MAX_RENT_UNITS` branch: the empty set plus four greedy orderings. */
function greedySubsets(p: PackedState, cat: Catalog, rentCount: number, cash: number): number {
  for (let w = 0; w < KEEP_WORDS; w++) KEEP_BUF[w] = 0;
  let written = 1;
  // `upkeep.ts:47` — `cost`, `defense`, `attack`, `mining`, in that order.
  for (let key = 0; key < 4; key++) {
    for (let i = 0; i < rentCount; i++) RENT_ORDER[i] = i;
    const rank = (i: number): number => {
      const def = p.defId[RENT_SLOT[i]];
      switch (key) {
        case 0:
          return cat.cost[def];
        case 1:
          return cat.def[def];
        case 2:
          return cat.atk[def];
        default:
          return cat.mine[def];
      }
    };
    // Descending by the stat, then by square ascending (y then x = square order).
    for (let i = 1; i < rentCount; i++) {
      const v = RENT_ORDER[i];
      let j = i - 1;
      while (j >= 0) {
        const other = RENT_ORDER[j];
        const cmp = rank(v) - rank(other) || p.sq[RENT_SLOT[other]] - p.sq[RENT_SLOT[v]];
        if (cmp <= 0) break;
        RENT_ORDER[j + 1] = other;
        j--;
      }
      RENT_ORDER[j + 1] = v;
    }
    const dst = written * KEEP_WORDS;
    for (let w = 0; w < KEEP_WORDS; w++) KEEP_BUF[dst + w] = 0;
    let left = cash;
    for (let k = 0; k < rentCount; k++) {
      const i = RENT_ORDER[k];
      if (RENT_COST[i] <= left) {
        bitSet(KEEP_BUF, dst, RENT_SLOT[i]);
        left -= RENT_COST[i];
      }
    }
    written++;
  }
  return written;
}

/**
 * Is `slot` an attacker in `killNow[side]` — can it reach and strike a body the
 * side can already remove this turn?
 *
 * `KillTable` records WHICH targets fall, not which bodies do the falling
 * (DESIGN §4.11), and `minActionsToKill` — the call that would name the
 * attackers — needs a `Scratch`/`ply` pair DESIGN §4.13's `genKeepSets`
 * signature does not carry. This reads the same fact off the table's
 * `killableNow` mask plus reachability, which is exactly the question §5.10
 * asks. See DEVIATIONS under M13.
 */
function isKillNowAttacker(p: PackedState, t: NodeTables, cat: Catalog, side: Side, slot: Slot): boolean {
  const killable = t.killNow[side].killableNow;
  const from = p.sq[slot];
  const def = p.defId[slot];
  for (let victim = 0; victim < MAX_SLOTS; victim++) {
    const vs = p.sq[victim];
    if (vs === DEAD || p.owner[victim] === side) continue;
    if (!bbHas(killable, vs)) continue;
    if (cat.power[powerIndex(side, def, p.defId[victim])] <= 0) continue;
    const base = vs * 4;
    for (let k = 0; k < 4; k++) {
      const q = ADJ_LIST[base + k];
      if (q < 0) continue;
      if (q === from) return true;
      if (p.pieceAt[q] !== NO_SLOT) continue;
      const cost = moveCost(t.dist.get(p, from), q, cat.spd[def]);
      if (cost > 0 && cost <= ACTIONS_PER_TURN - 1) return true;
    }
  }
  return false;
}

/** DESIGN §5.10's per-body keep priority. */
function rentPriority(p: PackedState, t: NodeTables, cat: Catalog, side: Side, slot: Slot): number {
  const s = p.sq[slot];
  const def = p.defId[slot];
  let priority = cat.cost[def] * CC - RENT_PV * cat.upkeep[def];
  const corner = CORNER[side];
  const base = corner * 4;
  for (let k = 0; k < 4; k++) {
    if (ADJ_LIST[base + k] === s) {
      priority += RANK_RESCUER;
      break;
    }
  }
  if (bbHas(t.spawn[side].anchors, s)) priority += RANK_ANCHOR;
  if (isKillNowAttacker(p, t, cat, side, slot)) priority += RANK_ATTACKER;
  return priority;
}

/**
 * DESIGN §4.13's `genKeepSets`. Fills `out` with the ranked keep-set
 * candidates — at most `KEEP_SET_CAPACITY` (64), best first — and returns how
 * many. Every set contains all of the side's rent-free (tier-1) bodies, which
 * `isUpkeepSelectionLegal` requires (`upkeep.ts:17-21`).
 *
 * Returns 0 on a position with no pending upkeep: there is no `PAY_UPKEEP` to
 * index, and `Replica.isLegal` answers only `RESIGN` there anyway.
 */
export function genKeepSets(p: PackedState, t: NodeTables, out: KeepSetTable): number {
  keepSetReset(out);
  if (p.result !== Result.ONGOING || p.upkeepPending !== 1 || p.phase !== 0) return 0;
  const side = p.side as Side;
  const cat = activeCatalog();
  const cash = p.bank[side];

  KEEP_BASE.fill(0);
  let rentCount = 0;
  for (let slot = 0; slot < MAX_SLOTS; slot++) {
    if (p.sq[slot] === DEAD || p.owner[slot] !== side) continue;
    const rent = cat.upkeep[p.defId[slot]];
    if (rent === 0) {
      bitSet(KEEP_BASE, 0, slot);
      continue;
    }
    RENT_SLOT[rentCount] = slot;
    RENT_COST[rentCount] = rent;
    rentCount++;
  }

  const candidates =
    rentCount <= MAX_RENT_UNITS ? enumerateSubsets(rentCount, cash) : greedySubsets(p, cat, rentCount, cash);
  if (candidates === 0) return 0;

  // §5.10's ranking is UNCONDITIONAL. `gen/generate.ts` takes a PREFIX of this
  // list at interior nodes (`INTERIOR_KEEP_SETS`), so entry 0 must be the
  // best-ranked set whether or not the 64-set cap binds; ranking only above the
  // cap would hand an interior node four DFS-adjacent sets — differing in the
  // last rent-bearing slot alone — instead of §5.10's four best.
  for (let i = 0; i < rentCount; i++) RENT_PRIORITY[i] = rentPriority(p, t, cat, side, RENT_SLOT[i]);
  for (let c = 0; c < candidates; c++) {
    const base = c * KEEP_WORDS;
    let score = 0;
    for (let i = 0; i < rentCount; i++) {
      if (bitHas(KEEP_BUF, base, RENT_SLOT[i])) score += RENT_PRIORITY[i];
    }
    KEEP_SCORE[c] = score;
  }
  const chosen = candidates < KEEP_SET_CAPACITY ? candidates : KEEP_SET_CAPACITY;
  KEEP_TAKEN.fill(0, 0, candidates);
  // Selection sort, best first: descending `KEEP_SCORE`, ties by ascending
  // candidate index (the keep-first DFS order `upkeep.ts` itself emits).
  for (let k = 0; k < chosen; k++) {
    let best = -1;
    for (let c = 0; c < candidates; c++) {
      if (KEEP_TAKEN[c] === 1) continue;
      if (best < 0 || KEEP_SCORE[c] > KEEP_SCORE[best]) best = c;
    }
    KEEP_TAKEN[best] = 1;
    KEEP_CHOSEN[k] = best;
  }

  for (let i = 0; i < chosen; i++) {
    const src = KEEP_CHOSEN[i] * KEEP_WORDS;
    for (let slot = 0; slot < MAX_SLOTS; slot++) {
      if (bitHas(KEEP_BUF, src, slot) || bitHas(KEEP_BASE, 0, slot)) keepSetAdd(out, i, slot);
    }
  }
  out.count = chosen;
  return chosen;
}
