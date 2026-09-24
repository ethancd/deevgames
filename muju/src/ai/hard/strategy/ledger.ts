/**
 * `clockLedger` — the mined-total INTERVAL for the kill clock (plan
 * `~/.claude/plans/can-you-respond-to-piped-book.md`, Part B.1's `ledger.ts`
 * row and W1.3). For each side it answers: "if the position holds — no kill,
 * no relocation — how many crystals will this side have mined when the kill
 * clock ends, `r` kill-free plies from now?" `L` is a closed-form
 * exact-under-assumptions forecast (`status: 'projected'`); `U` is a sound,
 * deliberately loose upper bound (`status: 'bounded'`) that also covers
 * relocation and purchases the stay-put forecast excludes. `strategy/clock.ts`
 * (a later step) compares `L`/`U` across sides to read the kill-clock verdict;
 * this module owns none of that comparison, only the interval and its Claims.
 *
 * Pure function of the packed root: no module state, nothing mutated on `p`,
 * called once per root search (plan invariant, `strategy/types.ts`'s header).
 *
 * ## `r`, the plies remaining
 *
 * RULE (`core/state.ts:1370-1373`, `makeEndPlace`): the kill clock advances by
 * exactly one at every `END_PLACE`, EXCEPT that a turn which already killed an
 * enemy (`p.progress === 1`, cleared only at that same `END_PLACE`) resets it
 * to zero instead. So from a root with `progress === 0`, `r = INACTIVITY_LIMIT
 * - p.clock` further `END_PLACE`s occur before the clock would reach the
 * limit, matching `eval/evaluate.ts`'s `killClockHandoffsFromRoot`. From a
 * root with `progress === 1`, the CURRENT clock value is about to be
 * discarded by that reset regardless of anything past this point — under the
 * ledger's own "no unit dies" assumption there is no SECOND kill to reset it
 * again, so the reset `END_PLACE` itself is the first of a fresh run of
 * `INACTIVITY_LIMIT` normal increments: `r = INACTIVITY_LIMIT + 1` (the reset
 * event, plus a full fresh countdown). Verified empirically for clocks 0..9 by
 * driving `Replica.make` through pass-only turns until the kill clock fires
 * (see `tests/ai/hard/strategy-ledger.test.ts`'s parity walk);
 * both branches were walked directly rather than only reasoned about, because
 * `p.progress` interacting with `p.clock` is exactly the kind of two-field
 * fact B.1b warns is easy to get wrong from the doc comments alone.
 *
 * ## Parity: who mines on which future `END_PLACE`
 *
 * RULE (`core/state.ts:1612-1643` `makeEndAction`, `1351-1373` `makeEndPlace`):
 * one full turn is ACT → `END_ACTION` (mines, then Prepare) → Prepare →
 * `END_PLACE` (the clock tick, then hand-off). So the mover of the k-th future
 * `END_PLACE` from the root is `p.side` for odd k, the other side for even k —
 * turn ownership does not change until the hand-off itself, regardless of
 * `p.progress`. Over `r` future `END_PLACE`s that gives the root mover
 * `ceil(r/2)` of them and the other side `floor(r/2)` (plan B.1b's stated
 * parity). Whether each of those `END_PLACE`s is preceded by a STILL-FUTURE
 * mining event for its owner depends on phase: if the root is captured at
 * `p.phase === 1` (ACT), the root mover's own `END_ACTION` for k=1 has not run
 * yet, so all `ceil(r/2)` of the root mover's turns still mine. If the root is
 * captured at `p.phase === 0` (Prepare), the root mover already mined for k=1
 * before this snapshot (it is already folded into `now`), so only
 * `ceil(r/2) - 1` of the root mover's future turns still mine. The other
 * side's turns never start before k=2, so its count is unaffected by the
 * root's phase. `futureMiningEvents` below is this rule, and
 * `tests/ai/hard/strategy-ledger.test.ts` checks it for every clock 0..9
 * crossed with both phases, both `progress` values and both movers, by
 * counting `END_ACTION`s in a real `Replica.make` walk to the clock's end.
 *
 * ## Scope
 *
 * The caller passes an ONGOING root with the kill clock on
 * (`p.drawRuleOn === 1`). With `inactivityRule: 'off'` there is no clock end:
 * `r` is then still `INACTIVITY_LIMIT - clock` arithmetically, but no
 * verdict may be read off it.
 *
 * ## Why `U` is time-structured
 *
 * A flat bound ("every body and every affordable buy mines the catalogue's
 * best rate from event 1") is sound but hundreds to thousands of crystals
 * wide, so `strategy/clock.ts` could never find the two sides' intervals
 * disjoint while the opponent still had a mining event left. `investmentBound`
 * instead follows WHEN the rules let a side add mining rate (only in its own
 * Prepare, landing no earlier than the next event), which keeps it exact in
 * the last-event regime; its soundness is proved in its doc comment.
 */
import { DEAD, MAX_SLOTS, PEND_STRIDE, type PackedState, type Side } from '../types';
import { INACTIVITY_LIMIT } from '../core/state';
import { BOARD } from '../core/tables';
import { activeCatalog, type Catalog } from '../core/catalog';
import type { Claim } from './types';

/** One side's slice of the ledger: `now` (already mined), the stay-put
 * lower-bound Claim `L` and the sound upper-bound Claim `U`, plus `minings`,
 * the number of this side's own future mining events the `L`/`U` forecasts
 * span (RULE, see the module doc's parity section) — surfaced for the
 * Chronicle and for `tests/ai/hard/strategy-ledger.test.ts`'s parity check. */
export interface SideLedger {
  readonly side: Side;
  /** `p.gained[side]`: the side's running mined total, Black's handicap
   * already folded in (RULE, `core/state.ts:713-721`'s `pack()` comment). */
  readonly now: number;
  readonly minings: number;
  readonly L: Claim<number>;
  readonly U: Claim<number>;
}

export interface ClockLedger {
  /** Plies left before the kill clock ends, assuming no further kill. */
  readonly r: number;
  /** Indexed by `Side` (0 = white, 1 = black), matching
   * `tables/phasing-economy.ts`'s `[EconResult, EconResult]` convention. */
  readonly sides: readonly [SideLedger, SideLedger];
}

/** The module doc's `r` rule. Exported so `strategy/clock.ts` and the tests
 * can compute it independently of the rest of the ledger. */
export function pliesRemaining(p: PackedState): number {
  // RULE `core/state.ts:1370-1373`: a turn that already killed resets the
  // clock at its own END_PLACE regardless of the pre-reset value, so under
  // "no further kill" the reset event starts a fresh INACTIVITY_LIMIT-long
  // countdown on top of itself.
  return p.progress === 1 ? INACTIVITY_LIMIT + 1 : INACTIVITY_LIMIT - p.clock;
}

/** The module doc's parity rule: how many of `side`'s own future mining
 * events (future `END_ACTION`s) fall inside the next `r` `END_PLACE`s. */
export function futureMiningEvents(p: PackedState, side: Side, r: number): number {
  const isRootSide = side === p.side;
  const total = isRootSide ? Math.ceil(r / 2) : Math.floor(r / 2);
  // The root mover's OWN turn (k=1) has already mined, before this snapshot,
  // exactly when the root was captured past its ACT phase (`p.phase === 0`,
  // Prepare): that mining is already folded into `now`, not into the future
  // count `L` sums over.
  const alreadyMined = isRootSide && p.phase === 0 && r >= 1 ? 1 : 0;
  return Math.max(0, total - alreadyMined);
}

interface MiningUnit {
  sq: number;
  mine: number;
  upkeep: number;
  cost: number;
  tier: number;
  reserve: number;
}

function livingUnitsOf(p: PackedState, side: Side): MiningUnit[] {
  const cat = activeCatalog();
  const out: MiningUnit[] = [];
  for (let slot = 0; slot < MAX_SLOTS; slot++) {
    if (p.sq[slot] === DEAD || p.owner[slot] !== side) continue;
    const def = p.defId[slot];
    const sq = p.sq[slot];
    out.push({ sq, mine: cat.mine[def], upkeep: cat.upkeep[def], cost: cat.cost[def], tier: cat.tier[def], reserve: p.reserve[sq] });
  }
  return out;
}

/** `side`'s currently-pending commitments (`PEND_STRIDE`, `types.ts:67-72`),
 * decoded the same way `resolveArrivals` does (`p.pendDef[i] - 1`,
 * `core/state.ts:470-472`/`1476`). ASSUMPTION (plan B.1, "no pending arrival
 * is cancelled"): every one of them is assumed to land on schedule, so no
 * `t.spawn`/`isLegalSpawn` re-check is done here — a later-arriving enemy
 * commitment blocking one of `side`'s own rectangles is exactly the case that
 * assumption excludes, and `tests/ai/hard/strategy-ledger.test.ts` documents
 * it as an explicit exclusion from the equality check rather than silently
 * passing on a lucky fixture set. CHOICE, falsifier: a paired position where a
 * real refusal (`EconomyForecast.arrivals[].arrived === false`) makes
 * `phasingEconomy`'s income strictly lower than this L within the compared
 * window; the test's random-position sweep screens every comparison sample
 * for that condition before asserting equality on it.
 */
function pendingUnitsOf(p: PackedState, side: Side): MiningUnit[] {
  const cat = activeCatalog();
  const out: MiningUnit[] = [];
  const base = side * PEND_STRIDE;
  for (let sq = 0; sq < BOARD; sq++) {
    const encoded = p.pendDef[base + sq];
    if (encoded === 0) continue;
    const def = encoded - 1;
    out.push({ sq, mine: cat.mine[def], upkeep: cat.upkeep[def], cost: cat.cost[def], tier: cat.tier[def], reserve: p.reserve[sq] });
  }
  return out;
}

/**
 * One rent bill for `side`, exactly as the rules settle it (RULE
 * `core/state.ts` `makeEndAction` step 3 and `makePayUpkeep`): if the full
 * army's rent is affordable it is paid and everyone stays; otherwise the
 * bill goes to `PAY_UPKEEP` with `defaultKeep`'s keep set
 * (`tables/phasing-economy.ts:94-110`: zero-upkeep units always kept, then
 * cost DESCENDING, square ASCENDING, each kept while its rent still fits the
 * cash left). `makePayUpkeep` pays for the kept units only and releases an
 * unkept unit only above tier 1 — an unkept tier-1 unit stays, rent-free, for
 * that bill (moot while `upkeepForTier(1) === 0`, mirrored anyway so a
 * `setUpkeepVariant` lab catalogue cannot desync `L` from the rules).
 * `reviewUpkeep` routes an affordable bill through `PAY_UPKEEP` too, where the
 * same keep set keeps everyone, so it needs no case of its own.
 * `defaultKeep` itself is module-private there, hence the local re-derivation.
 */
function settleRent(units: MiningUnit[], cash: number): { units: MiningUnit[]; cash: number } {
  let due = 0;
  for (const u of units) due += u.upkeep;
  if (due <= cash) return { units, cash: cash - due };
  const kept: MiningUnit[] = [];
  const rent: MiningUnit[] = [];
  for (const u of units) (u.upkeep === 0 ? kept : rent).push(u);
  rent.sort((a, b) => b.cost - a.cost || a.sq - b.sq);
  for (const u of rent) {
    if (u.upkeep <= cash) {
      kept.push(u);
      cash -= u.upkeep;
    } else if (u.tier === 1) {
      kept.push(u); // unkept but never released (`makePayUpkeep`'s tier-1 skip)
    }
    // else released: dropped, no refund, never mines or owes rent again.
  }
  return { units: kept, cash };
}

/**
 * The stay-put closed form (plan B.1's `L`): `side`'s additional mined
 * crystals over its own `events` future mining opportunities. Each unit's
 * lifetime contribution is `min(mine * survivedEvents, reserve)` — a single
 * occupant's cumulative take telescopes to exactly that closed form (DERIVED:
 * `take_i = min(mine, reserve - Σ_{j<i} take_j)` sums to
 * `min(mine·n, reserve)` by induction on `n`, since once the reserve is
 * exhausted every later `take` is 0) — so the loop below only has to
 * re-derive it per-turn where a unit's `survivedEvents` itself depends on
 * play: an unaffordable rent bill releases units (`settleRent`).
 *
 * A bill can also stand in front of event 1: if the root IS `side`'s Prepare
 * with the bill still unpaid (`p.upkeepPending === 1`: `makeEndAction` has
 * mined and routed rent to `PAY_UPKEEP`, `core/state.ts` step 3), that bill is
 * settled first — its releases stop units mining for the whole window
 * (`tables/phasing-economy.ts` settles the same bill as its "ordinal 0";
 * `tests/ai/hard/strategy-ledger.test.ts` pins a root with two `plant_2` and
 * a bank of 1, where skipping it would ledger 30 crystals against the
 * forecast's 15).
 * Pending commitments join the roster at event 1 (parity rule, module doc)
 * and are then indistinguishable from a unit that was already standing.
 */
function stayPutMined(p: PackedState, side: Side, events: number): number {
  let units = livingUnitsOf(p, side);
  const pending = pendingUnitsOf(p, side);
  let cash = p.bank[side];
  if (side === p.side && p.upkeepPending === 1) ({ units, cash } = settleRent(units, cash));
  let totalMined = 0;
  for (let j = 1; j <= events; j++) {
    if (j === 1 && pending.length > 0) units = units.concat(pending);
    // 1. income (RULE `core/state.ts` `makeEndAction` step 1), simultaneous,
    // before rent.
    for (const u of units) {
      const take = u.mine < u.reserve ? u.mine : u.reserve;
      totalMined += take;
      u.reserve -= take;
      cash += take;
    }
    // 2. rent (RULE `makeEndAction` step 3): the full due from every
    // currently-owned unit, including one that arrived for this event.
    ({ units, cash } = settleRent(units, cash));
  }
  return totalMined;
}

/**
 * The best mine-rate gain per crystal spent that any SINGLE investment the
 * rules offer can buy, as an exact fraction `num / den` (DERIVED from the
 * active catalogue; RULE for what counts as an investment: `core/state.ts`
 * `isLegal` — `BUY` takes a tier-1 definition at `cat.cost[def]`, `PROMOTE`
 * moves a unit to `cat.nextDef[def]` for `cat.promoCost[def]`, both only in
 * Prepare). A buy gains `mine[def]` for `cost[def]`; a promotion gains
 * `mine[next] - mine[def]` for `promoCost[def]`. On the shipped catalogue this
 * is 3/5 (`plant_1` and `metal_1`); the best promotion is 2/4
 * (`plant_1 -> plant_2`). `null` when some investment gains rate for nothing
 * — no shipped catalogue has one; the caller then keeps only the reserve cap.
 */
function bestInvestmentRate(cat: Catalog): { num: number; den: number } | null {
  let num = 0;
  let den = 1;
  let unbounded = false;
  const consider = (gain: number, cost: number): void => {
    if (gain <= 0) return;
    if (cost <= 0) { unbounded = true; return; }
    if (gain * den > num * cost) { num = gain; den = cost; }
  };
  for (let i = 0; i < cat.tier1.length; i++) consider(cat.mine[cat.tier1[i]], cat.cost[cat.tier1[i]]);
  for (let d = 0; d < cat.nextDef.length; d++) {
    const next = cat.nextDef[d];
    if (next >= 0) consider(cat.mine[next] - cat.mine[d], cat.promoCost[d]);
  }
  return unbounded ? null : { num, den };
}

/**
 * A SOUND upper bound on `side`'s additional mined crystals over its `events`
 * future mining events along ANY kill-free continuation (plan B.1's `U`):
 * any movement, any buys, promotions and keep sets, any opponent play that
 * does not kill.
 *
 * What the rules let a side's mining depend on (RULE, `core/state.ts`):
 *   - one mining event (`makeEndAction`) takes `min(mine[def], reserve[sq])`
 *     per living unit, so its income is at most the side's RATE
 *     `Σ mine[def]` over the units alive then, wherever they stand —
 *     relocation changes which reserve is drawn, never the per-unit cap;
 *   - the rate grows only by an ARRIVAL (a `BUY` commitment, landing at the
 *     side's next hand-off, `resolveArrivals`) or a `PROMOTE`, both legal only
 *     in the side's own Prepare and both paid from the bank; it shrinks only
 *     by deaths and releases;
 *   - the bank grows only by mining and by the refund of a commitment that
 *     fails to land (`resolveArrivals`); nothing is paid for a kill, and a
 *     release refunds nothing (`makePayUpkeep`).
 *
 * THE PROOF. Let ρ = `bestInvestmentRate` (3/5 today), `R_0` the rate of every
 * living unit plus every own pending commitment, `C_0` the bank plus every own
 * pending commitment's cost, `I_j` the real income of event `j` and `R_j` the
 * real rate then. Each investment's integer rate gain is at most
 * `⌊ρ · its cost⌋`, and floors are superadditive, so
 *     `R_j ≤ R_0 + ⌊ρ · S_j⌋`, with `S_j ≤ C_0 + Σ_{i<j} I_i`,
 * where `S_j` is the net crystals invested (in things that stayed) in the
 * Prepares that come before event `j`, and `I_i ≤ R_i`. The recursion below
 * replaces every `≤` by `=` — invest every crystal, at rate ρ, as early as
 * the rules allow, and mine the full rate every event — so by induction on
 * `j` its rate and income dominate the real ones, and its income sum bounds
 * the real mined total. "As early as the rules allow" (parity rule, module
 * doc): a Prepare of `side`'s comes before event 1 only when the root IS
 * `side`'s Prepare (its buys land at the next hand-off, its promotions at
 * once); every event `j >= 2` has the Prepare after event `j - 1` in front
 * of it.
 *
 * Last, every mined crystal leaves some cell's reserve and forward play never
 * raises a reserve (`setReserve` is called forward only by mining), so the
 * total is also capped by `Σ reserve` over the whole board.
 *
 * Over-approximations (Part A item 5), each a CHOICE whose falsifier is the
 * same: a kill-free playout in `lab/hard-ai/oracles/clock-ledger.ts` (or any
 * later brute force) that mines MORE than this bound — which the proof above
 * says cannot happen, so a hit means the proof's reading of the rules is wrong:
 *   - no per-unit reserve or travel model: every unit mines its full
 *     `mine[def]` every event (tightening it needs geometry, and B.1b's
 *     `nearestOwner` note is exactly how a geometric bound grows a hole);
 *   - no spawn-area, slot or rent limit on investment: every crystal is
 *     invested at ρ the moment a Prepare allows;
 *   - every own pending commitment is counted as landing (its rate from
 *     event 1) AND as refunded (its cost in `C_0`) — a deliberate double
 *     count, since only one can happen.
 * Tightness where it matters: when `side` has no Prepare before its last
 * event (e.g. one event left, root not its Prepare) the bound is exactly
 * `Σ mine[def]` over its units and commitments — the regime, a ply or two
 * from the clock's end, where `strategy/clock.ts` can find intervals disjoint.
 * `tests/ai/hard/strategy-ledger.test.ts` pins that case.
 */
function investmentBound(p: PackedState, side: Side, events: number): number {
  if (events === 0) return 0;
  const cat = activeCatalog();
  let reserveCap = 0;
  for (let s = 0; s < BOARD; s++) reserveCap += p.reserve[s];
  const rho = bestInvestmentRate(cat);
  if (rho === null) return reserveCap;

  let rate0 = 0;
  for (let slot = 0; slot < MAX_SLOTS; slot++) {
    if (p.sq[slot] !== DEAD && p.owner[slot] === side) rate0 += cat.mine[p.defId[slot]];
  }
  let cash0 = p.bank[side];
  const base = side * PEND_STRIDE;
  for (let s = 0; s < BOARD; s++) {
    const encoded = p.pendDef[base + s];
    if (encoded === 0) continue;
    rate0 += cat.mine[encoded - 1];
    cash0 += p.pendCost[base + s];
  }

  const prepareBeforeFirst = side === p.side && p.phase === 0;
  let investable = cash0; // C_0 + Σ_{i<j} I_i, the most ever spendable before event j
  let total = 0;
  for (let j = 1; j <= events; j++) {
    const scaled = rho.num * investable;
    const gained = j >= 2 || prepareBeforeFirst ? (scaled - (scaled % rho.den)) / rho.den : 0;
    const income = rate0 + gained;
    total += income;
    investable += income;
  }
  return total < reserveCap ? total : reserveCap;
}

const L_ASSUMPTIONS: readonly string[] = [
  'no unit dies for the rest of the r-ply window',
  'no unit relocates, and nothing is bought or promoted',
  'no pending arrival is cancelled (arrivals are assumed to always land on schedule)',
  'no other ending (home occupation, elimination, upkeep elimination) pre-empts the clock',
  "rent, including an unpaid root bill, is settled in defaultKeep's order when unaffordable (tables/phasing-economy.ts:94-110): zero-upkeep units kept, then cost descending, square ascending",
];

const U_ASSUMPTIONS: readonly string[] = [
  'no unit dies (a kill resets the clock and ends the window this bound describes)',
  'CHOICE: every unit mines its full mine rate every event, with no reserve or travel model per unit; the whole board reserve caps the total (falsifier: lab/hard-ai/oracles/clock-ledger.ts)',
  "CHOICE: every crystal is invested at the catalogue's best rate-per-crystal the moment a Prepare allows, ignoring spawn-area, slot and rent limits (falsifier: same oracle)",
  'CHOICE: each own pending commitment is counted both as landing and as refunded (falsifier: same oracle)',
];

function sideLedger(p: PackedState, side: Side, r: number): SideLedger {
  const now = p.gained[side];
  const events = futureMiningEvents(p, side, r);
  const L: Claim<number> = {
    value: now + stayPutMined(p, side, events),
    status: 'projected',
    evidence: 'ledger.L',
    assumptions: L_ASSUMPTIONS,
  };
  const U: Claim<number> = {
    value: now + investmentBound(p, side, events),
    status: 'bounded',
    evidence: 'ledger.U',
    assumptions: U_ASSUMPTIONS,
  };
  return { side, now, minings: events, L, U };
}

/**
 * The mined-total interval for both sides (plan B.1's `ledger.ts` row, W1.3).
 * Pure function of the packed root — see the module doc for `r` and the
 * parity rule, and `stayPutMined`/`investmentBound` for `L`/`U` themselves.
 */
export function clockLedger(p: PackedState): ClockLedger {
  const r = pliesRemaining(p);
  return { r, sides: [sideLedger(p, 0, r), sideLedger(p, 1, r)] };
}
