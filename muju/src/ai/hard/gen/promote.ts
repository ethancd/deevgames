/**
 * Mission promotions (DESIGN §4.13 `gen/promote.ts`, §5.6, ET §3.4).
 *
 * A promotion is a Prepare action that turns a tier-`n` body into the
 * tier-`n+1` body of the same element for `promoCost` crystals
 * (`promotion.ts:9-23`), at most once per unit per Prepare phase and never on the
 * turn the unit was bought (`promotion.ts:44-58`). Both restrictions live in
 * `Replica.canPromote` and are honoured here by construction: this module only
 * ever proposes slots that `genPlace` would also emit.
 *
 * Phasing replaces DESIGN §5.6's immediate KILL with FORTIFY. The
 * remaining missions concern the next enemy reply or a later own Act:
 *
 *   FORTIFY  strengthen the occupier or a potential rescue-path blocker while
 *            our live unit occupies the enemy home; Replica decides mate;
 *   SURVIVE  the new `defense` leaves an enemy one-shot band (`killsInOne`);
 *   INCOME   a plant standing on a cell with `reserve ≥ 2 × newMine`;
 *   REACH    any speed upgrade, including stationary Metal I becoming mobile;
 *   ANCHOR   the deepest unblocked spawn anchor that the enemy can kill within
 *            a turn (`killActions ≤ 4`).
 *
 * **Accounting** (SU addendum 1). `scoreCc` is
 * `benefit + Δmaterial − crystals × CC − RENT_PV × Δupkeep`. The middle two
 * terms cancel exactly under the shipped price list — `promoCost` IS
 * `cost[next] − cost[def]` (`promotion.ts:9-23`) — so a promotion's real,
 * permanent cost is the RENT it starts paying, `RENT_PV = 422` cc per crystal
 * of upkeep per turn. Both terms are written out anyway so the accounting stays
 * correct under a lab price or upkeep variant (`setUpkeepVariant`), which
 * `core/catalog.ts` already tracks.
 *
 * Nothing here allocates: the caller owns the `PromoCandidate` records and the
 * per-slot working arrays are module-level.
 */
import {
  CC,
  DEAD,
  F_PLACED,
  F_PROMOTED,
  MAX_SLOTS,
  NO_SLOT,
  Result,
  type Centi,
  type PackedState,
  type Side,
  type Slot,
} from '../types';
import { bbHas, bbNext } from '../core/bits';
import { ADJ_LIST, RECT, SQ_X, SQ_Y, WHITE } from '../core/tables';
import { activeCatalog, powerIndex, type Catalog } from '../core/catalog';
import { ACTIONS_PER_TURN } from '../core/state';
import { moveCost } from '../core/movement';
import { RENT_PV, pstMine } from '../core/income';
import { ACTION_VALUE_CC } from '../tables/economy';
import { KILL_NEVER, type NodeTables } from '../tables/context';

/** DESIGN §4.13. */
export const Mission = { FORTIFY: 0, SURVIVE: 1, INCOME: 2, REACH: 3, ANCHOR: 4 } as const;
export type Mission = (typeof Mission)[keyof typeof Mission];

export const MISSION_NAMES: readonly string[] = ['FORTIFY', 'SURVIVE', 'INCOME', 'REACH', 'ANCHOR'];

export interface PromoCandidate {
  slot: Slot;
  /** A `Mission` value. */
  mission: number;
  /** Crystals `PROMOTE` costs on this slot (`promotion.ts:9-23`). */
  cost: number;
  scoreCc: Centi;
}

export function newPromoCandidate(): PromoCandidate {
  return { slot: 0, mission: Mission.FORTIFY, cost: 0, scoreCc: 0 };
}

/** `killActions ≤ 4` — the enemy can remove this body inside one turn. */
const ANCHOR_THREAT_ACTIONS = ACTIONS_PER_TURN;
/** `core/catalog.ts ELEMENT_ORDER` index of `plant`. */
const ELEMENT_PLANT = 4;

/**
 * Can `attacker` (an enemy body) remove the body in `slot` with one hit next
 * turn, given it has a full turn to close the distance? This is the
 * `killsInOne` band SURVIVE is trying to leave.
 */
function oneShotBand(p: PackedState, t: NodeTables, cat: Catalog, slot: Slot, def: number): boolean {
  const owner = p.owner[slot] as Side;
  const enemy = (1 - owner) as Side;
  const need = cat.def[def] - p.damage[slot];
  if (need <= 0) return true;
  const target = p.sq[slot];
  for (let u = 0; u < MAX_SLOTS; u++) {
    const s = p.sq[u];
    if (s === DEAD || p.owner[u] !== enemy) continue;
    if (cat.power[powerIndex(enemy, p.defId[u], def)] < need) continue;
    const base = target * 4;
    for (let k = 0; k < 4; k++) {
      const q = ADJ_LIST[base + k];
      if (q < 0) continue;
      if (q === s) return true;
      if (p.pieceAt[q] !== NO_SLOT) continue;
      const cost = moveCost(t.dist.get(p, s), q, cat.spd[p.defId[u]]);
      if (cost > 0 && cost <= ACTIONS_PER_TURN - 1) return true;
    }
  }
  return false;
}

/** `spawnInfo.depth`'s per-square measure, restated for one anchor. */
function anchorDepth(side: Side, s: number): number {
  return side === WHITE ? SQ_X[s] + SQ_Y[s] : 18 - SQ_X[s] - SQ_Y[s];
}

/** Is `slot` one of its side's currently-unblocked spawn anchors? */
function isUnblockedAnchor(p: PackedState, t: NodeTables, slot: Slot): boolean {
  const side = p.owner[slot] as Side;
  const s = p.sq[slot];
  // `spawnInfo` records exactly the unblocked anchors in `spawn[side].anchors`.
  return bbHas(t.spawn[side].anchors, s);
}

/** Legal spawn squares that only `slot`'s rectangle contributes. */
function exclusiveSpawnArea(p: PackedState, t: NodeTables, slot: Slot): number {
  const side = p.owner[slot] as Side;
  const box = RECT[side][p.sq[slot]];
  const legal = t.spawn[side].legal;
  let n = 0;
  for (let q = bbNext(legal, -1); q >= 0; q = bbNext(legal, q)) {
    if (!bbHas(box, q)) continue;
    let shared = false;
    for (let other = 0; other < MAX_SLOTS && !shared; other++) {
      if (other === slot) continue;
      const os = p.sq[other];
      if (os === DEAD || p.owner[other] !== side) continue;
      if (!bbHas(t.spawn[side].anchors, os)) continue;
      if (bbHas(RECT[side][os], q)) shared = true;
    }
    if (!shared) n++;
  }
  return n;
}

/**
 * The best future/fortification mission for one slot, or -1 when no
 * supported mission applies. There is no Prepare attack mission.
 * `outBenefit[0]` receives the mission's benefit in cc.
 */
function bestMission(
  p: PackedState,
  t: NodeTables,
  cat: Catalog,
  slot: Slot,
  next: number,
  deepestAnchor: Slot,
  outBenefit: Int32Array,
): number {
  const side = p.owner[slot] as Side;
  const def = p.defId[slot];
  // Every own live body can be a rescue-path blocker. Retain all legal
  // promotions while our side holds enemy home; a geometric shortcut could
  // omit a distant blocker. This is candidate coverage, not a mate certificate.
  const occupier = p.pieceAt[side === WHITE ? 99 : 0];
  if (occupier !== NO_SLOT && p.owner[occupier] === side) {
    outBenefit[0] = Math.max(0, cat.def[next] - cat.def[def]) * CC;
    return Mission.FORTIFY;
  }

  // SURVIVE — the promotion lifts the body out of an enemy one-shot band.
  if (oneShotBand(p, t, cat, slot, def) && !oneShotBand(p, t, cat, slot, next)) {
    outBenefit[0] = cat.cost[def] * CC;
    return Mission.SURVIVE;
  }

  // ANCHOR — add defence to a threatened deep anchor; an attack-only
  // promotion cannot protect it before the enemy reply.
  if (slot === deepestAnchor && cat.def[next] > cat.def[def]) {
    outBenefit[0] = cat.cost[def] * CC + exclusiveSpawnArea(p, t, slot) * ACTION_VALUE_CC;
    return Mission.ANCHOR;
  }

  // INCOME — a plant whose cell can feed the bigger mine.
  if (cat.element[def] === ELEMENT_PLANT && p.reserve[p.sq[slot]] >= 2 * cat.mine[next]) {
    const gain = pstMine(next, p.reserve[p.sq[slot]]) - pstMine(def, p.reserve[p.sq[slot]]);
    if (gain > 0) {
      outBenefit[0] = gain;
      return Mission.INCOME;
    }
  }

  // REACH — speed upgrades, including stationary Yan becoming mobile.
  const speedGain = cat.spd[next] - cat.spd[def];
  if (speedGain > 0) {
    outBenefit[0] = speedGain * ACTION_VALUE_CC;
    return Mission.REACH;
  }

  outBenefit[0] = 0;
  return -1;
}

const SC_BENEFIT = new Int32Array(1);

/**
 * DESIGN §4.13's `planPromotions`. Writes at most `max` ordinary candidates; FORTIFY bypasses that beam
 * up to `out.length`. Candidates are ordered by score, then square. `out` must hold
 * pre-allocated records (`newPromoCandidate`).
 *
 * Only slots `Replica.canPromote` would accept are considered — in Prepare, owned by the mover, neither `F_PLACED` nor `F_PROMOTED`, with a next
 * tier the bank can pay for — so every emitted candidate dispatches legally.
 */
export function planPromotions(p: PackedState, t: NodeTables, max: number, out: PromoCandidate[]): number {
  if (out.length === 0) return 0;
  if (p.result !== Result.ONGOING || p.upkeepPending === 1 || p.phase !== 0) return 0;
  const side = p.side as Side;
  const cat = activeCatalog();
  const bank = p.bank[side];

  // ANCHOR's single candidate: the deepest unblocked anchor the enemy can
  // remove inside a turn (`killActions ≤ 4`, DESIGN §5.6).
  let deepestAnchor = -1;
  let deepest = -1;
  for (let slot = 0; slot < MAX_SLOTS; slot++) {
    const s = p.sq[slot];
    if (s === DEAD || p.owner[slot] !== side) continue;
    if (t.killActions[slot] === KILL_NEVER || t.killActions[slot] > ANCHOR_THREAT_ACTIONS) continue;
    if (!isUnblockedAnchor(p, t, slot)) continue;
    const d = anchorDepth(side, s);
    if (d > deepest || (d === deepest && (deepestAnchor < 0 || s < p.sq[deepestAnchor]))) {
      deepest = d;
      deepestAnchor = slot;
    }
  }

  // Forced FORTIFY candidates bypass the ordinary beam. With MAX_SLOTS
  // output records every legal fortification survives, even when max is zero.
  // A smaller caller-owned buffer is an explicit hard capacity, never exceeded.
  const home = p.pieceAt[side === WHITE ? 99 : 0];
  const fortifying = home !== NO_SLOT && p.owner[home] === side;
  const limit = fortifying ? out.length : Math.min(Math.max(0, max), out.length);
  if (limit === 0) return 0;
  let n = 0;
  for (let slot = 0; slot < MAX_SLOTS; slot++) {
    const s = p.sq[slot];
    if (s === DEAD || p.owner[slot] !== side) continue;
    const flags = p.uflags[slot];
    if ((flags & F_PLACED) !== 0 || (flags & F_PROMOTED) !== 0) continue;
    const def = p.defId[slot];
    const next = cat.nextDef[def];
    if (next < 0) continue;
    const cost = cat.promoCost[def];
    if (cost > bank) continue;

    const mission = bestMission(p, t, cat, slot, next, deepestAnchor, SC_BENEFIT);
    if (mission < 0) continue;
    const materialGain = (cat.cost[next] - cat.cost[def]) * CC;
    const rent = RENT_PV * (cat.upkeep[next] - cat.upkeep[def]);
    const scoreCc = (SC_BENEFIT[0] + materialGain - cost * CC - rent) | 0;

    let slotIndex: number;
    if (n < limit) slotIndex = n++;
    else {
      let worst = 0;
      for (let i = 1; i < n; i++) if (out[i].scoreCc < out[worst].scoreCc || (out[i].scoreCc === out[worst].scoreCc && p.sq[out[i].slot] > p.sq[out[worst].slot])) worst = i;
      if (scoreCc < out[worst].scoreCc || (scoreCc === out[worst].scoreCc && s >= p.sq[out[worst].slot])) continue;
      slotIndex = worst;
    }
    const c = out[slotIndex];
    c.slot = slot;
    c.mission = mission;
    c.cost = cost;
    c.scoreCc = scoreCc;
  }

  // Descending `scoreCc`, ties by ascending square (stable under slot permutations).
  for (let i = 1; i < n; i++) {
    const c = out[i];
    let j = i - 1;
    while (j >= 0 && (out[j].scoreCc < c.scoreCc || (out[j].scoreCc === c.scoreCc && p.sq[out[j].slot] > p.sq[c.slot]))) {
      out[j + 1] = out[j];
      j--;
    }
    out[j + 1] = c;
  }
  return n;
}
