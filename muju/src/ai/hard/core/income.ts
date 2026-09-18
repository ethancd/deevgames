/**
 * Mining, rent and the no-rent mine PST (DESIGN §4.7, F9).
 *
 * `projectedIncome`/`upkeepDue` are the packed mirrors of `mining.ts:12-15`
 * and `upkeep.ts:14-16`; `tests/ai/hard/income.test.ts` pins them against the
 * canonical functions on every corpus position.
 *
 * `PST_MINE[def][reserve]` is the discounted value, in centi-crystals, of the
 * crystals a unit of definition `def` standing on a cell with `reserve`
 * crystals will mine over the next twelve turns if it never moves and the cell
 * is never contested:
 *
 *     PST_MINE[def][r] = round( CC · Σ_{t=1..12} 0.9^t · take_t ),
 *     take_t = min(mine[def], r − Σ_{u<t} take_u)
 *
 * It carries NO rent term (DESIGN F9: rent is the separate `Rent` feature at
 * `RENT_PV` cc per crystal/turn, and material priors are `cost × 100`), which
 * is the only accounting that reproduces JF §2.1's check values — reproduced
 * exactly by `tests/ai/hard/income.test.ts`.
 *
 * The sum is evaluated in Q16 fixed point off `GAMMA_Q16` so the table is
 * bit-identical on every client: the only floating-point arithmetic in this
 * module is the twelve `× 0.9` multiplications that build `GAMMA_Q16` itself
 * (IEEE-754 doubles, deterministic), never `Math.pow`.
 */
import { CC, DEAD, MAX_SLOTS, type Centi, type DefId, type PackedState, type Side } from '../types';
import { NDEF, activeCatalog, type Catalog } from './catalog';

/** Discount horizon of `PST_MINE`, in turns. */
export const PST_HORIZON = 12;
/** Max reserve on a cell (resourceMap.ts:5); the PST has 17 columns, 0..16. */
export const RESERVE_VALUES = 17;

/** `round(0.9^t · 65536)`, `t = 0..12` (DESIGN §4.7; ET §5.5's γ). */
export const GAMMA_Q16: Int32Array = (() => {
  const out = new Int32Array(PST_HORIZON + 1);
  let gamma = 1;
  out[0] = 65536;
  for (let t = 1; t <= PST_HORIZON; t++) {
    gamma *= 0.9;
    out[t] = Math.round(gamma * 65536);
  }
  return out;
})();

/** cc per 1 crystal/turn of rent over H = 6 at γ = 0.9 (SU addendum 3, DESIGN §8). */
export const RENT_PV = 422;

/** `PST_MINE[def * RESERVE_VALUES + reserve]`, centi-crystals, no rent (DESIGN F9). */
export const PST_MINE: Int32Array = (() => {
  const out = new Int32Array(NDEF * RESERVE_VALUES);
  const cat = activeCatalog();
  for (let d = 0; d < NDEF; d++) {
    const mine = cat.mine[d];
    for (let r = 0; r < RESERVE_VALUES; r++) {
      let accQ16 = 0;
      let left = r;
      for (let t = 1; t <= PST_HORIZON; t++) {
        const take = mine < left ? mine : left;
        if (take === 0) break;
        left -= take;
        accQ16 += GAMMA_Q16[t] * take * CC;
      }
      // Round-half-up in integers; accQ16 <= 65536 * 16 * 100 fits an int32.
      out[d * RESERVE_VALUES + r] = (accQ16 + 32768) >> 16;
    }
  }
  return out;
})();

/** `PST_MINE` lookup with the index arithmetic in one place. */
export function pstMine(def: DefId, reserve: number): Centi {
  return PST_MINE[def * RESERVE_VALUES + reserve];
}

/**
 * Crystals `side` would collect if the turn ended now — `mining.ts:12-15`
 * (`Σ min(mining, cell.resourceLayers)` over the side's living units).
 */
export function projectedIncome(p: PackedState, side: Side): number {
  const cat = activeCatalog();
  let total = 0;
  for (let slot = 0; slot < MAX_SLOTS; slot++) {
    const s = p.sq[slot];
    if (s === DEAD || p.owner[slot] !== side) continue;
    const mine = cat.mine[p.defId[slot]];
    const reserve = p.reserve[s];
    total += mine < reserve ? mine : reserve;
  }
  return total;
}

/** Rent `side` owes at its next turn start — `upkeep.ts:14-16`. */
export function upkeepDue(p: PackedState, side: Side): number {
  const cat = activeCatalog();
  let total = 0;
  for (let slot = 0; slot < MAX_SLOTS; slot++) {
    if (p.sq[slot] === DEAD || p.owner[slot] !== side) continue;
    total += cat.upkeep[p.defId[slot]];
  }
  return total;
}

/** Present value of `side`'s standing rent: `Σ upkeep[def] × RENT_PV` (DESIGN F9). */
export function rentCc(p: PackedState, side: Side): Centi {
  return upkeepDue(p, side) * RENT_PV;
}

/** `Σ PST_MINE[def][reserve[sq]]` over `side`'s living units — the `pstSumCc` invariant. */
export function pstSumOf(p: PackedState, side: Side): Centi {
  let total = 0;
  for (let slot = 0; slot < MAX_SLOTS; slot++) {
    const s = p.sq[slot];
    if (s === DEAD || p.owner[slot] !== side) continue;
    total += PST_MINE[p.defId[slot] * RESERVE_VALUES + p.reserve[s]];
  }
  return total;
}

/** `Σ cost[def] × CC` over `side`'s living units — the `materialCc` invariant (DESIGN F9). */
export function materialSumOf(p: PackedState, side: Side, cat: Catalog = activeCatalog()): Centi {
  let total = 0;
  for (let slot = 0; slot < MAX_SLOTS; slot++) {
    if (p.sq[slot] === DEAD || p.owner[slot] !== side) continue;
    total += cat.cost[p.defId[slot]] * CC;
  }
  return total;
}
