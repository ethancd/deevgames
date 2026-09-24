/**
 * `clockLedger` — the mined-total INTERVAL for the kill clock (plan
 * `~/.claude/plans/can-you-respond-to-piped-book.md`, Part B.1's `ledger.ts`
 * row and W1.3). For each side it answers: "if the position holds — no kill,
 * no relocation — how many crystals will this side have mined by the time
 * `INACTIVITY_LIMIT` kill-free plies have elapsed?" `L` is a closed-form
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
 * driving `Replica.make` through pass-only turns and reading `p.clock`/`p.side`
 * after each step (see `tests/ai/hard/strategy-ledger.test.ts`'s parity table);
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
 * crossed with both phases.
 */
import { DEAD, MAX_SLOTS, PEND_STRIDE, type PackedState, type Side } from '../types';
import { INACTIVITY_LIMIT } from '../core/state';
import { activeCatalog } from '../core/catalog';
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
export function plysRemaining(p: PackedState): number {
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
  reserve: number;
}

function livingUnitsOf(p: PackedState, side: Side): MiningUnit[] {
  const cat = activeCatalog();
  const out: MiningUnit[] = [];
  for (let slot = 0; slot < MAX_SLOTS; slot++) {
    if (p.sq[slot] === DEAD || p.owner[slot] !== side) continue;
    const def = p.defId[slot];
    const sq = p.sq[slot];
    out.push({ sq, mine: cat.mine[def], upkeep: cat.upkeep[def], cost: cat.cost[def], reserve: p.reserve[sq] });
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
  for (let sq = 0; sq < 100; sq++) {
    const encoded = p.pendDef[base + sq];
    if (encoded === 0) continue;
    const def = encoded - 1;
    out.push({ sq, mine: cat.mine[def], upkeep: cat.upkeep[def], cost: cat.cost[def], reserve: p.reserve[sq] });
  }
  return out;
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
 * play: an unaffordable upkeep bill releases units, RULE
 * `tables/phasing-economy.ts:95-110`'s `defaultKeep` (cost DESCENDING, then
 * square ASCENDING; zero-upkeep units always kept first), which this function
 * re-derives locally because `defaultKeep` itself is module-private there.
 * Pending commitments join the roster at event 1 (parity rule, module doc)
 * and are then indistinguishable from a unit that was already standing.
 */
function stayPutMined(p: PackedState, side: Side, events: number): number {
  let units = livingUnitsOf(p, side);
  const pending = pendingUnitsOf(p, side);
  let cash = p.bank[side];
  let totalMined = 0;
  for (let j = 1; j <= events; j++) {
    if (j === 1 && pending.length > 0) units = units.concat(pending);
    // 1. income (RULE `core/state.ts:1622-1643`), simultaneous, before upkeep.
    for (const u of units) {
      const take = u.mine < u.reserve ? u.mine : u.reserve;
      totalMined += take;
      u.reserve -= take;
      cash += take;
    }
    // 2. upkeep (RULE `core/state.ts:1649-1662`): full due from every
    // currently-owned unit (including one that just arrived this event).
    let due = 0;
    for (const u of units) due += u.upkeep;
    if (due <= cash) {
      cash -= due;
      continue;
    }
    // Unaffordable: defaultKeep's policy (RULE `tables/phasing-economy.ts:95-110`).
    const free = units.filter(u => u.upkeep === 0);
    const paid = units.filter(u => u.upkeep > 0).sort((a, b) => b.cost - a.cost || a.sq - b.sq);
    const kept = free.slice();
    for (const u of paid) {
      if (u.upkeep <= cash) {
        kept.push(u);
        cash -= u.upkeep;
      }
      // else released: dropped, no refund, does not mine or owe rent again.
    }
    units = kept;
  }
  return totalMined;
}

/**
 * A sound, deliberately loose upper bound (plan B.1's `U`; Part A item 5:
 * every over-approximation below is a CHOICE with its own falsifier). It
 * covers relocation and purchases — which `L`'s stay-put forecast excludes —
 * by dropping reserve/travel-time modelling entirely rather than risking an
 * unsound hole in a tighter geometric bound: B.1b's own note on `nearestOwner`
 * overstating distance because it treats units as blockers is exactly the
 * kind of mistake a tight-but-wrong bound could repeat here.
 *
 * CHOICE (falsifier: `lab/hard-ai/oracles/clock-ledger.ts`'s playouts —
 * random and greedy-mining — exceeding this value within the same window):
 * every currently-alive unit, every pending arrival and every affordable buy
 * is credited the catalogue-wide MAXIMUM mine rate for every one of `side`'s
 * `events` future turns, with no reserve cap at all (`take <= mine` always,
 * trivially, so this dominates the true per-unit total regardless of where it
 * stands or how many times it relocates) and no cap from board/slot capacity.
 * This also covers "promotions that change mining" (plan B.1) for free: a
 * promoted unit's rate is still bounded by the catalogue-wide maximum.
 *
 * CHOICE (falsifier: same oracle): purchasing power is `bank + miningBound` —
 * generous because it credits cash the side has not actually earned yet at
 * the time of a hypothetical early buy — divided by the CHEAPEST tier-1
 * unit's cost (`cat.tier1[0]`, sorted ascending by cost, `core/catalog.ts:187-189`)
 * to get a buy count, each credited the same per-event maximum. Being
 * temporally inconsistent (assuming future income is spendable immediately)
 * can only inflate the bound, never understate it, so it does not threaten
 * soundness — only tightness, which this function already does not attempt.
 */
function stayPutBound(p: PackedState, side: Side, events: number): number {
  const cat = activeCatalog();
  let mMax = 0;
  for (let d = 0; d < cat.mine.length; d++) if (cat.mine[d] > mMax) mMax = cat.mine[d];
  let cMin = Number.POSITIVE_INFINITY;
  for (let i = 0; i < cat.tier1.length; i++) {
    const cost = cat.cost[cat.tier1[i]];
    if (cost < cMin) cMin = cost;
  }
  // CHOICE: a catalogue with no tier-1 unit or a free one is not a real
  // config this game ships (`tier1` always has entries at nonzero cost), but
  // a degenerate fixture must still get a finite, positive divisor rather
  // than an infinite or zero one; falsifier: none expected, defensive only.
  if (!Number.isFinite(cMin) || cMin < 1) cMin = 1;

  let aliveCount = 0;
  for (let slot = 0; slot < MAX_SLOTS; slot++) if (p.sq[slot] !== DEAD && p.owner[slot] === side) aliveCount++;
  const bodies = aliveCount + p.pendCount[side];

  const miningBound = bodies * mMax * events;
  const cashAvailable = p.bank[side] + miningBound;
  const numBuys = Math.floor(cashAvailable / cMin);
  const buyBound = numBuys * mMax * events;
  return miningBound + buyBound;
}

const L_ASSUMPTIONS: readonly string[] = [
  'no unit dies for the rest of the r-ply window',
  'no unit relocates',
  'no pending arrival is cancelled (arrivals are assumed to always land on schedule)',
  "rent is paid in defaultKeep's order when unaffordable (tables/phasing-economy.ts:95-110): cost descending, then square ascending, zero-upkeep units always kept",
];

const U_ASSUMPTIONS: readonly string[] = [
  'CHOICE: every unit/arrival/buy mines at the catalogue-wide maximum rate every future event, with no reserve or travel-time cap (falsifier: lab/hard-ai/oracles/clock-ledger.ts)',
  'CHOICE: purchasing power is bank plus the mining-only bound, crediting future income as immediately spendable (falsifier: same oracle)',
  "CHOICE: buy count uses the cheapest tier-1 unit's cost with no board/slot capacity cap (falsifier: same oracle)",
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
    value: now + stayPutBound(p, side, events),
    status: 'bounded',
    evidence: 'ledger.U',
    assumptions: U_ASSUMPTIONS,
  };
  return { side, now, minings: events, L, U };
}

/**
 * The mined-total interval for both sides (plan B.1's `ledger.ts` row, W1.3).
 * Pure function of the packed root — see the module doc for `r` and the
 * parity rule, and `stayPutMined`/`stayPutBound` for `L`/`U` themselves.
 */
export function clockLedger(p: PackedState): ClockLedger {
  const r = plysRemaining(p);
  return { r, sides: [sideLedger(p, 0, r), sideLedger(p, 1, r)] };
}
