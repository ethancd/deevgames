/**
 * STRATEGOS W1.4 — `killEta`: a LOWER BOUND on the number of plies until a side
 * can kill.
 *
 * Plan: `~/.claude/plans/can-you-respond-to-piped-book.md` (2026-09-24), Part B.1
 * (the `killeta.ts` row), step W1.4, and the Part B.1b corrections, which
 * override the first draft where they differ.
 *
 * WHAT IT ANSWERS. `killEta(p, side).plies` is a number `v` such that, in EVERY
 * legal continuation of `p` by both sides, no attack by `side` removes an enemy
 * unit before ply `v`. It is computed by relaxing every rule that can only
 * delay a kill (below) and asking, window by window, whether the relaxed game
 * admits a kill at all.
 *
 * WHAT IT NEVER ANSWERS. It proves impossibility, never feasibility. A kill may
 * well be impossible at ply `v` too: the relaxation walks through blockers,
 * lets every unit spend all four actions on its own, and lets the defender
 * walk into the attack. So the claim carries `status: 'bounded'` and
 * `evidence: 'killeta.lowerBound'`, and a caller may use it only in the
 * direction `killEta > r ⇒ no kill by this side within r plies` — never
 * `killEta ≤ r ⇒ a kill is feasible` (plan Part A item 1; the original
 * "killETA ≤ deadline ⇒ feasible" is the error that item strikes out).
 *
 * ## The ply convention (what `strategy/clock.ts`, W1.5, compares against)
 *
 * Ply 1 is the turn IN PROGRESS at `p`, whatever phase it stands in; ply
 * `k + 1` is the turn after ply `k`'s hand-off. The side to move (`p.side`)
 * owns the odd plies, the other side the even ones. A side "can kill in ply k"
 * when an ATTACK it makes during ply `k`'s Act phase removes a unit.
 *
 * The kill clock (`src/game/inactivity.ts`, `src/game/turn.ts handOffTurn`,
 * mirrored by `core/state.ts makeEndPlace` step 1) advances once per hand-off:
 * the hand-off closing ply `k` writes `progress ? 0 : clock + 1`, and the game
 * ends at the hand-off whose count reaches `INACTIVITY_LIMIT`. Mining happens
 * at `END_ACTION` (`makeEndAction`), before that check, so ply `k`'s mining
 * counts and nothing after ply `k`'s hand-off does. Hence, with no kill:
 *
 *   - `p.progress === 0` (every search root: `progress` is cleared at each
 *     hand-off and only a kill sets it): the hand-off of ply `k` writes
 *     `clock + k`, so the clock ends the game at the hand-off of ply
 *     `r = INACTIVITY_LIMIT − clock` — exactly `ClockReadingCore.r`;
 *   - `p.progress === 1` (a mid-turn root after a kill; the kill already set
 *     `clock = 0`): ply 1's hand-off writes 0 and the clock ends at the
 *     hand-off of ply `INACTIVITY_LIMIT + 1`.
 *
 * `clockPliesLeft(p)` returns that number. The plies that can still contain a
 * kill before the clock rules are `1 … clockPliesLeft(p)`, so
 *
 *     killEta(p, 0).plies > clockPliesLeft(p)  and  killEta(p, 1).plies > clockPliesLeft(p)
 *       ⇒  no unit is killed before the kill clock ends the game
 *
 * (unless a home or elimination ending comes first — neither is a kill; nor
 * is an upkeep release, which removes a unit without resetting the clock:
 * only an ATTACK that removes a unit sets `progress`, `src/ai/simulate.ts`
 * and `core/state.ts`). The
 * plan's acceptance anchors follow from the same convention and are pinned by
 * `tests/ai/hard/strategy-killeta.test.ts`: whenever `tables/kill.ts
 * killTable(p, t, p.side, {horizon: 'current'})` finds a kill, `killEta(p,
 * p.side) ≤ 1`; whenever `killTable(p, t, other, {horizon: 'nextAct'})` does,
 * `killEta(p, other) ≤ 2` (and the mover's own `'nextAct'` table implies ≤ 3,
 * the other side's `'current'` table ≤ 2).
 *
 * ## The relaxation, rule by rule (each is a RULE fact, cited)
 *
 *  1. DISTANCE. Units move orthogonally and never through another unit
 *     (`src/game/movement.ts findPath`/`distancesFrom`); the board has no
 *     terrain (`board.ts isValidPosition` is a bounds check). So the
 *     empty-board BFS distance of `core/movement.ts bfsFrom`/`bfsMulti` — which
 *     on an empty board is the Manhattan distance, pinned square for square by
 *     the test — never exceeds the real one. B.1b: `tables/threat.ts
 *     nearestOwner` reads `t.dist`, the LIVE-occupancy BFS, which treats units
 *     as blockers and can OVERSTATE the distance; it is therefore unusable
 *     for a lower bound and is not used.
 *  2. BOTH SIDES CLOSE. Between the root and the attacking window both sides
 *     move. Every unit is credited with its full speed times the whole action
 *     budget of every one of its side's Act phases (four, or `p.actions` for
 *     the turn in progress; `F_CAN_ACT` for the turn in progress), attacker
 *     and target alike, at the fastest class it could have been promoted to
 *     by then within its side's crystal ceiling (relaxation 8). Four actions
 *     are shared in reality (`ACTIONS_PER_TURN`), so crediting each unit
 *     separately only over-counts. The approach distance is thus shared
 *     between the two sides' turns in the most favourable way.
 *  3. ONE TURN OF DAMAGE. Units heal at their owner's turn start
 *     (`board.ts resetUnitActions`, `core/state.ts` hand-off step 6 at
 *     ~1413-1417), so chip damage never accumulates across the attacker's
 *     turns: the kill must be assembled inside ONE Act. Existing damage counts
 *     only in the attacker's first window, and only when no turn start of the
 *     target's owner falls in between.
 *  4. ONE HIT PER ATTACKER. `combat.ts canAttack`: one initial attack, and a
 *     further one only after a kill. Before the first kill of a window every
 *     attacker therefore hits the target at most once, so Cleave
 *     (`tables/kill.ts cleaveChain`) can extend a turn's kills but can never
 *     bring its FIRST kill forward. A hit costs one action, an approach of `d`
 *     squares to a neighbour of the target `ceil(d / speed)` more
 *     (`movement.ts getMoveCost`); the attack window's budget is four actions
 *     (`p.actions` in ply 1). Lanes (at most four neighbours) and blockers are
 *     ignored.
 *  5. ZERO POWER. `combat.ts calculateAttackPower` clamps at 0, and a live
 *     unit always has `damage < defense`, so a 0-power attacker never
 *     contributes and is dropped (`cat.power` / `powerIndex`).
 *  6. PROMOTIONS. Once per unit per Prepare, same element, next tier
 *     (`promotion.ts canPromote`), allowed on the arrival turn
 *     (`summoning.ts resolveSummons`). An attacker may use any class it could
 *     reach by then, paying the promotion costs; a TARGET may take any class
 *     its owner could promote it to (the defender may cooperate), and since
 *     `calculateAttackPower` reads only the defender's element, target classes
 *     are grouped by their power column and each group takes the smallest
 *     DEF and the largest closing radius among its members.
 *  7. ARRIVALS. A paid commitment arrives at its owner's next turn start at its
 *     own square (`resolveSummons`; the pending plane, `PEND_STRIDE`) — or is
 *     refunded; the bound counts both the body and the refund. A new BUY in
 *     Prepare arrives at the owner's next turn start on an empty square inside
 *     an unblocked rectangle from the owner's corner to one of its units
 *     (`spawning.ts isValidSpawnPosition`, `core/tables.ts RECT`). The bound
 *     lets it arrive anywhere in the union of the rectangles of every square
 *     any of the side's units could then occupy (emptiness, enemy blocking and
 *     the "arrivals never anchor each other" rule are all ignored), as any
 *     tier-1 class the side could afford by then (`cat.tier1`, `cat.cost`).
 *     The same holds for the TARGET side, whose arrivals are targets.
 *     `tables/threat.ts strikeIfBoughtArea` is not reused: it covers only
 *     paid commitments, measures them over the projected live occupancy
 *     (blockers again) and allows three moves, so it is neither a superset of
 *     the arrivals nor of their reach; the pending plane is read directly.
 *  8. CRYSTALS. What a side can spend by its Prepare at ply `q` is at most its
 *     bank, plus every pending refund, plus an income ceiling per `END_ACTION`
 *     (Σ over its possible units of their best mining rate, capped in total
 *     by the reserve left on the board; `mining.ts` takes `min(mine,
 *     reserve)`). Upkeep is ignored. The DP below charges buys and promotions
 *     against that ceiling, so an unaffordable body cannot contribute.
 *
 * Every relaxation errs toward an EARLIER kill, so the answer is sound; the
 * price is looseness from afar. Expect `killEta > r` (a provable clock) mostly
 * when few plies remain — which is exactly when a clock verdict matters.
 *
 * ## The decision per window
 *
 * For each window `k` of `side` (ascending, up to `limit`), for each possible
 * target (live enemy unit, enemy commitment, enemy arrival region) and each of
 * its power groups, a 0/1 knapsack over (actions ≤ budget, damage saturated at
 * `need`) minimises crystals across groups — each own unit, each own
 * commitment, and up to `ACTIONS_PER_TURN` purchase slots — with at most one
 * option per group. The first `k` whose knapsack reaches `need` within the
 * window's actions and crystal ceiling is the answer; if none does, the answer
 * is `limit + 1` ("no kill within `limit` plies").
 *
 * PURITY. A pure function of `p` and the active catalogue: no module state,
 * no clock, no randomness. Workspaces live in a caller-owned (or per-call)
 * `KillEtaScratch`. `bfsMulti` borrows `core/movement.ts`'s own single-threaded
 * scratch exactly as every other caller does.
 */
import type { PackedState, Side, Square } from '../types';
import { DEAD, F_CAN_ACT, F_LAST_KILLED, MAX_SLOTS, PEND_STRIDE, Result } from '../types';
import { activeCatalog, NDEF, powerIndex, type Catalog } from '../core/catalog';
import { ACTIONS_PER_TURN, INACTIVITY_LIMIT } from '../core/state';
import { bfsMulti } from '../core/movement';
import { bbIsEmpty, bbNew, bbNext, bbOr, bbSet, bbZero, type BB } from '../core/bits';
import { BOARD, MANHATTAN, RECT } from '../core/tables';
import type { Claim } from './types';

// ---------------------------------------------------------------------------
// public constants
// ---------------------------------------------------------------------------

/**
 * The furthest ply the bound looks at. DERIVED (plan B.1 `clock.ts`, the ply
 * convention above): the longest kill-free stretch any root can still have
 * before the kill clock rules is `INACTIVITY_LIMIT + 1` plies (a mid-turn root
 * right after a kill), so no clock verdict ever needs a bound beyond it.
 */
export const KILL_ETA_HORIZON = INACTIVITY_LIMIT + 1;

/** The evidence tag every `killEta` claim carries (plan W1.4). */
export const KILL_ETA_EVIDENCE = 'killeta.lowerBound';

/**
 * The claim's assumptions, in plain words. None of them is "the opponent
 * cooperates": each describes a relaxation that can only make a kill look
 * EARLIER, which is what makes the value a sound lower bound.
 */
export const KILL_ETA_ASSUMPTIONS: readonly string[] = Object.freeze([
  'lower bound only: rules out a kill by this side before `value`, never promises one at `value`',
  'ply 1 is the turn in progress at the root; the side to move owns the odd plies',
  'empty-board distances: blockers, attack lanes and spawn-rectangle blocking are ignored',
  'both sides close at full speed every turn, each unit credited with the whole action budget',
  'a kill is assembled within one Act (units heal at their owner\'s turn start); one hit per attacker',
  'arrivals and promotions at their earliest legal ply; crystals bounded by bank + refunds + an income ceiling, upkeep ignored',
]);

/** What admitted the first window that was not ruled out (diagnostics). */
export type KillEtaTargetKind = 'unit' | 'pending' | 'arrival';

export interface KillEtaWindow {
  /** The ply (in the convention above) of the first window not ruled out. */
  ply: number;
  /** Which kind of enemy body the relaxed kill was found against. */
  target: KillEtaTargetKind;
  /** Live slot for `'unit'`, else -1. */
  slot: number;
  /** The target's square for `'unit'`/`'pending'`; -1 for an arrival region. */
  square: Square;
  /** The damage the relaxed kill had to assemble. */
  need: number;
}

export interface KillEtaReading {
  side: Side;
  /**
   * The bound as a typed strategic fact: `value` is the lower bound in plies,
   * `status: 'bounded'`, `evidence: 'killeta.lowerBound'`. A `value` of
   * `limit + 1` reads "no kill by `side` within `limit` plies".
   */
  claim: Claim<number>;
  /** `claim.value`, for callers that only compare numbers. */
  plies: number;
  /** The last ply examined (`opts.limit`, capped at `KILL_ETA_HORIZON`). */
  limit: number;
  /** The window that set the bound, or null when every window up to `limit`
   * was ruled out. NOT a witness: nothing here says the kill is feasible. */
  firstNotRuledOut: KillEtaWindow | null;
}

export interface KillEtaOptions {
  /**
   * Stop after this ply. A caller that only asks "is killETA > r?" passes
   * `r`: the answer is then `r + 1` exactly when every window up to `r` is
   * ruled out. Defaults to, and is capped at, `KILL_ETA_HORIZON`.
   */
  limit?: number;
}

// ---------------------------------------------------------------------------
// the clock convention
// ---------------------------------------------------------------------------

/**
 * The ply at whose hand-off the kill clock ends the game if no unit is killed,
 * in `killEta`'s convention (ply 1 = the turn in progress): `INACTIVITY_LIMIT
 * − clock` when `p.progress === 0`, `INACTIVITY_LIMIT + 1` when this turn
 * already killed (the hand-off then writes 0; `core/state.ts makeEndPlace`
 * step 1). `Infinity` when the kill clock is off (`drawRuleOn === 0`).
 * `tests/ai/hard/strategy-killeta.test.ts` pins it against the replica's own
 * hand-offs.
 */
export function clockPliesLeft(p: PackedState): number {
  if (p.drawRuleOn === 0) return Number.POSITIVE_INFINITY;
  return p.progress === 1 ? INACTIVITY_LIMIT + 1 : INACTIVITY_LIMIT - p.clock;
}

// ---------------------------------------------------------------------------
// scratch
// ---------------------------------------------------------------------------

/** Per-ply tables are indexed by the ply itself. DERIVED: every index read is
 * a ply in 1 … KILL_ETA_HORIZON (a window, an arrival, or a Prepare two plies
 * before one); slot 0 is unused. */
const PLY_SLOTS = KILL_ETA_HORIZON + 1;

/**
 * Upper end of the knapsack's damage axis. DERIVED (`units.ts`): the largest
 * printed DEF in the catalogue is 5 (metal_3), so no `need` can exceed it; the
 * value is re-derived from the live catalogue at every call and this is only
 * the allocation ceiling. CHOICE of 8 over 5: headroom for a balance-lab DEF
 * change (falsifier: a catalogue DEF above 8 throws below).
 */
const NEED_CAP = 8;

/** Knapsack cells: (actions 0 … ACTIONS_PER_TURN) × (damage 0 … NEED_CAP). */
const DP_CELLS = (ACTIONS_PER_TURN + 1) * (NEED_CAP + 1);

/** "No path to this cell" in the crystal knapsack, and "unreachable" for a
 * speed-0 approach. CHOICE: a sentinel far above any crystal total or action
 * count while `INF + INF` stays inside int32 (falsifier: a crystal ceiling of
 * 2^30, which the board's total reserve cannot approach). */
const INF = 0x3fffffff;

/**
 * Most target classes one target can expand into. DERIVED (`units.ts`): the
 * options are distinct definitions — a chain's tiers, or every tier-1 class's
 * chain for an arrival — so there are never more than `NDEF`.
 */
const MAX_TARGET_OPTIONS = NDEF;

/**
 * Most options one knapsack group may hold. DERIVED: a live unit or commitment
 * contributes one option per reachable class (≤ 3 tiers), and a purchase slot
 * contributes its Pareto table of (actions 1 … 4) × (damage 0 … NEED_CAP).
 */
const MAX_GROUP_OPTIONS = ACTIONS_PER_TURN * (NEED_CAP + 1);

/**
 * Caller-owned working memory, so repeated calls (the plan's W1.9 contract
 * checks) do not re-allocate the per-ply tables; a call still builds its small
 * result objects. Holds no state between calls: every field is rewritten
 * before it is read.
 */
export interface KillEtaScratch {
  /** Spawn-region masks per side per arrival ply. */
  spawnMask: [BB[], BB[]];
  /** Whether a body can arrive at that ply at all. */
  spawnLive: [Uint8Array, Uint8Array];
  /** Empty-board distance field from each spawn region. */
  spawnField: [Int8Array[], Int8Array[]];
  /** `crystals[side][q]`: ceiling on what `side` can have spent by its Prepare at ply q. */
  crystals: [Int32Array, Int32Array];
  /** Region-to-region distance, `[attackerArrivalPly * PLY_SLOTS + targetArrivalPly]`. */
  regionDist: Int16Array;
  presence: BB;
  /** All-zero occupancy: the empty board every distance here is measured on. */
  empty: BB;
  dp: Int32Array;
  next: Int32Array;
  /** Per-group option triples (actions, damage, crystals). */
  optA: Int32Array;
  optP: Int32Array;
  optX: Int32Array;
  /** Pareto table for one purchase slot, `[a * (NEED_CAP+1) + pw]` → crystals. */
  buyBest: Int32Array;
  /** Target power groups: representative def and minimum DEF. */
  groupDef: Int32Array;
  groupMinDef: Int32Array;
  groupRadius: Int32Array;
  /** One target's candidate classes and their closing radii (`windowOpen`). */
  targetDefs: Int32Array;
  targetRadii: Int32Array;
}

export function newKillEtaScratch(): KillEtaScratch {
  const masks = (): BB[] => Array.from({ length: PLY_SLOTS }, () => bbNew());
  const fields = (): Int8Array[] => Array.from({ length: PLY_SLOTS }, () => new Int8Array(BOARD));
  return {
    spawnMask: [masks(), masks()],
    spawnLive: [new Uint8Array(PLY_SLOTS), new Uint8Array(PLY_SLOTS)],
    spawnField: [fields(), fields()],
    crystals: [new Int32Array(PLY_SLOTS), new Int32Array(PLY_SLOTS)],
    regionDist: new Int16Array(PLY_SLOTS * PLY_SLOTS),
    presence: bbNew(),
    empty: bbNew(),
    dp: new Int32Array(DP_CELLS),
    next: new Int32Array(DP_CELLS),
    optA: new Int32Array(MAX_GROUP_OPTIONS),
    optP: new Int32Array(MAX_GROUP_OPTIONS),
    optX: new Int32Array(MAX_GROUP_OPTIONS),
    buyBest: new Int32Array(DP_CELLS),
    groupDef: new Int32Array(MAX_TARGET_OPTIONS),
    groupMinDef: new Int32Array(MAX_TARGET_OPTIONS),
    groupRadius: new Int32Array(MAX_TARGET_OPTIONS),
    targetDefs: new Int32Array(MAX_TARGET_OPTIONS),
    targetRadii: new Int32Array(MAX_TARGET_OPTIONS),
  };
}

// ---------------------------------------------------------------------------
// per-call context
// ---------------------------------------------------------------------------

interface Ctx {
  p: PackedState;
  cat: Catalog;
  ws: KillEtaScratch;
  mover: Side;
  limit: number;
  /** Largest mining rate in the catalogue (a purchasable chain can reach it). */
  mineMax: number;
  /** Cheapest purchasable body. */
  minBuyCost: number;
}

/** Does `x` own ply `q` (q ≥ 1)? The side to move owns the odd plies. */
function owns(c: Ctx, x: Side, q: number): boolean {
  return q >= 1 && ((q & 1) === 1) === (x === c.mover);
}

/** Actions `x` has in the Act phase of ply `q` (0 when it does not own `q`). */
function actBudget(c: Ctx, x: Side, q: number): number {
  if (!owns(c, x, q)) return 0;
  if (q === 1) return c.p.phase === 1 ? c.p.actions : 0;
  return ACTIONS_PER_TURN;
}

/** `x`'s first turn start after the root: arrivals land and units heal there.
 * DERIVED (the ply convention): the mover's next turn starts after ply 2's
 * hand-off, i.e. at ply 3; the other side's after ply 1's, at ply 2. */
function nextTurnStart(c: Ctx, x: Side): number {
  return x === c.mover ? 3 : 2;
}

/** How many of `x`'s Prepare phases lie in plies [from, to). Every owned ply at
 * or after the root still has its Prepare ahead (a root in Prepare included). */
function preparesIn(c: Ctx, x: Side, from: number, to: number): number {
  let n = 0;
  for (let q = from < 1 ? 1 : from; q < to; q++) if (owns(c, x, q)) n++;
  return n;
}

/** Does `x`'s `END_ACTION` (mining) at ply `q` still lie ahead of the root? */
function minesAt(c: Ctx, x: Side, q: number): boolean {
  if (!owns(c, x, q)) return false;
  return q === 1 ? c.p.phase === 1 : true;
}

/** The def `levels` promotions up the chain from `def`, or -1 past tier 3. */
function chainDef(cat: Catalog, def: number, levels: number): number {
  let d = def;
  for (let i = 0; i < levels && d >= 0; i++) d = cat.nextDef[d];
  return d;
}

/** Largest speed over `def`'s chain within `levels` promotions. */
function chainSpeed(cat: Catalog, def: number, levels: number): number {
  let best = 0;
  let d = def;
  for (let i = 0; i <= levels && d >= 0; i++) {
    if (cat.spd[d] > best) best = cat.spd[d];
    d = cat.nextDef[d];
  }
  return best;
}

/** Largest mining rate over `def`'s chain within `levels` promotions. */
function chainMine(cat: Catalog, def: number, levels: number): number {
  let best = 0;
  let d = def;
  for (let i = 0; i <= levels && d >= 0; i++) {
    if (cat.mine[d] > best) best = cat.mine[d];
    d = cat.nextDef[d];
  }
  return best;
}

/**
 * How many promotions a body of `x` (definition `def`, present from ply
 * `from`) can have had before `x`'s Act at ply `q`: at most one per Prepare in
 * [from, q) (`promotion.ts canPromote`), and only while their cumulative price
 * — plus `prepaid`, what the body itself cost if it was bought — fits under
 * `x`'s crystal ceiling at its last Prepare before `q` (relaxation 8).
 */
function reachableLevels(c: Ctx, x: Side, def: number, from: number, q: number, prepaid: number): number {
  const n = preparesIn(c, x, from, q);
  if (n === 0) return 0;
  // x owns every other ply, so its last Prepare before its Act at q is q − 2.
  const cap = c.ws.crystals[x][q - 2];
  let spent = prepaid;
  let levels = 0;
  let d = def;
  while (levels < n && c.cat.nextDef[d] >= 0) {
    spent += c.cat.promoCost[d];
    if (spent > cap) break;
    d = c.cat.nextDef[d];
    levels++;
  }
  return levels;
}

/**
 * Squares a body of `x` with definition `def`, present from ply `from`, can
 * have travelled in `x`'s Act phases strictly before ply `to` (relaxation 2),
 * at the fastest class it could afford to have been promoted to by each of
 * them. `activeNow` is the body's `F_CAN_ACT` for the turn in progress;
 * `prepaid` is its purchase price when it was bought after the root.
 */
function radius(c: Ctx, x: Side, def: number, from: number, to: number, activeNow: boolean, prepaid = 0): number {
  let r = 0;
  for (let q = from < 1 ? 1 : from; q < to; q++) {
    if (!owns(c, x, q)) continue;
    if (q === 1 && !activeNow) continue;
    r += actBudget(c, x, q) * chainSpeed(c.cat, def, reachableLevels(c, x, def, from, q, prepaid));
  }
  return r;
}

/** The largest `radius` any purchasable body arriving at `from` could have. */
function arrivalRadius(c: Ctx, x: Side, from: number, to: number): number {
  let best = 0;
  const t1 = c.cat.tier1;
  for (let i = 0; i < t1.length; i++) {
    const r = radius(c, x, t1[i], from, to, true, c.cat.cost[t1[i]]);
    if (r > best) best = r;
  }
  return best;
}

/** Actions to hit a target at lower-bound distance `d` with speed `spd`:
 * the approach to a neighbour plus the hit (relaxation 4). */
function hitCost(d: number, spd: number): number {
  if (d <= 1) return 1;
  if (spd <= 0) return INF;
  return 1 + (((d - 1 + spd - 1) / spd) | 0);
}

// ---------------------------------------------------------------------------
// crystals and spawn regions
// ---------------------------------------------------------------------------

/** `ws.crystals[x][q]` for every Prepare ply `q` of `x` (relaxation 8). */
function fillCrystals(c: Ctx, x: Side): void {
  const p = c.p;
  const cat = c.cat;
  const out = c.ws.crystals[x];
  out.fill(0);
  let totalReserve = 0;
  for (let s = 0; s < BOARD; s++) totalReserve += p.reserve[s];
  const base = p.bank[x] + p.pendCostSum[x];
  let mined = 0;
  for (let q = 1; q < PLY_SLOTS; q++) {
    if (!owns(c, x, q)) continue;
    if (minesAt(c, x, q)) {
      let rate = 0;
      const levels = preparesIn(c, x, 1, q);
      for (let slot = 0; slot < MAX_SLOTS; slot++) {
        if (p.sq[slot] === DEAD || p.owner[slot] !== x) continue;
        rate += chainMine(cat, p.defId[slot], levels);
      }
      rate += p.pendCount[x] * c.mineMax;
      // Bodies bought by the Prepare two plies back have arrived by now; the
      // spend so far bounds how many there can be.
      const bought = q - 2 >= 1 && owns(c, x, q - 2) ? Math.floor(out[q - 2] / c.minBuyCost) : 0;
      rate += bought * c.mineMax;
      mined += rate;
      if (mined > totalReserve) mined = totalReserve;
    }
    out[q] = base + mined;
  }
}

/** Crystal ceiling for spending that can matter in `x`'s Act at ply `k`:
 * everything spent in `x`'s Prepares strictly before `k`. */
function crystalBudget(c: Ctx, x: Side, k: number): number {
  const q = k - 2;
  return q >= 1 && owns(c, x, q) ? c.ws.crystals[x][q] : 0;
}

/** Can `x` put a new body on the board at turn start `j` (bought at `j − 2`)? */
function arrivalsPossible(c: Ctx, x: Side, j: number): boolean {
  const q = j - 2;
  return q >= 1 && owns(c, x, q) && c.ws.crystals[x][q] >= c.minBuyCost;
}

/** Add to `ws.presence` every square within `r` of `from` (Manhattan). */
function addBall(c: Ctx, from: Square, r: number): void {
  const row = from * BOARD;
  for (let s = 0; s < BOARD; s++) if (MANHATTAN[row + s] <= r) bbSet(c.ws.presence, s);
}

/**
 * Spawn regions for `x` at each of its turn starts up to `c.limit`
 * (relaxation 7): the union of `RECT[x][a]` over every square `a` any of `x`'s
 * bodies could stand on at that turn start, and its empty-board distance
 * field. Earlier arrivals are bodies too, so regions are built in ply order.
 */
function fillSpawnRegions(c: Ctx, x: Side): void {
  const p = c.p;
  const ws = c.ws;
  const live = ws.spawnLive[x];
  live.fill(0);
  const j0 = nextTurnStart(c, x);
  for (let j = j0; j <= c.limit; j += 2) {
    if (!arrivalsPossible(c, x, j)) continue;
    bbZero(ws.presence);
    for (let slot = 0; slot < MAX_SLOTS; slot++) {
      if (p.sq[slot] === DEAD || p.owner[slot] !== x) continue;
      const active = (p.uflags[slot] & F_CAN_ACT) !== 0;
      addBall(c, p.sq[slot], radius(c, x, p.defId[slot], 1, j, active));
    }
    const pendBase = x * PEND_STRIDE;
    if (j0 < j) {
      for (let s = 0; s < BOARD; s++) {
        const d = p.pendDef[pendBase + s];
        if (d !== 0) addBall(c, s, radius(c, x, d - 1, j0, j, true));
      }
    }
    for (let jj = j0; jj < j; jj += 2) {
      if (live[jj] === 0) continue;
      const r = arrivalRadius(c, x, jj, j);
      const field = ws.spawnField[x][jj];
      for (let s = 0; s < BOARD; s++) if (field[s] >= 0 && field[s] <= r) bbSet(ws.presence, s);
    }
    const mask = ws.spawnMask[x][j];
    bbZero(mask);
    for (let a = bbNext(ws.presence, -1); a >= 0; a = bbNext(ws.presence, a)) bbOr(mask, mask, RECT[x][a]);
    if (bbIsEmpty(mask)) continue;
    bfsMulti(ws.empty, mask, ws.spawnField[x][j]);
    live[j] = 1;
  }
}

/** `ws.regionDist[jS * PLY_SLOTS + jT]` = empty-board distance between the
 * attacker's arrival region at `jS` and the target's at `jT`. */
function fillRegionDistances(c: Ctx, side: Side): void {
  const ws = c.ws;
  const enemy = (1 - side) as Side;
  ws.regionDist.fill(-1);
  for (let jS = 1; jS <= c.limit; jS++) {
    if (ws.spawnLive[side][jS] === 0) continue;
    const mask = ws.spawnMask[side][jS];
    for (let jT = 1; jT <= c.limit; jT++) {
      if (ws.spawnLive[enemy][jT] === 0) continue;
      const field = ws.spawnField[enemy][jT];
      let best = BOARD;
      for (let s = bbNext(mask, -1); s >= 0; s = bbNext(mask, s)) if (field[s] < best) best = field[s];
      ws.regionDist[jS * PLY_SLOTS + jT] = best;
    }
  }
}

// ---------------------------------------------------------------------------
// the knapsack
// ---------------------------------------------------------------------------

/** One target as the attacker sees it at window `k`. */
interface Target {
  kind: KillEtaTargetKind;
  slot: number;
  /** Point target square, or -1 for an arrival region. */
  square: Square;
  /** For an arrival region: its turn start and its distance field. */
  arrival: number;
  field: Int8Array | null;
  /** A def of the power group (the knapsack reads its power column). */
  def: number;
  need: number;
  /** Squares the target may have closed by window k. */
  radius: number;
}

/** Lower bound on the distance between an attacker body and the target at
 * the start of window k, before either side's closing is subtracted. */
function pointToTarget(from: Square, t: Target): number {
  return t.square >= 0 ? MANHATTAN[from * BOARD + t.square] : (t.field as Int8Array)[from];
}

/** The same for a purchase arriving anywhere in `side`'s region at ply `j`. */
function regionToTarget(c: Ctx, side: Side, j: number, t: Target): number {
  if (t.square >= 0) return c.ws.spawnField[side][j][t.square];
  return c.ws.regionDist[j * PLY_SLOTS + t.arrival];
}

/** Relax one knapsack group whose options are `ws.opt*[0 … n)` into `ws.dp`. */
function applyGroup(c: Ctx, n: number, budget: number, need: number): void {
  if (n === 0) return;
  const ws = c.ws;
  const width = need + 1;
  const cells = (budget + 1) * width;
  const dp = ws.dp;
  const next = ws.next;
  for (let i = 0; i < cells; i++) next[i] = dp[i];
  for (let o = 0; o < n; o++) {
    const cost = ws.optA[o];
    const pow = ws.optP[o];
    const cry = ws.optX[o];
    for (let a = 0; a + cost <= budget; a++) {
      for (let pw = 0; pw <= need; pw++) {
        const v = dp[a * width + pw];
        if (v >= INF) continue;
        let np = pw + pow;
        if (np > need) np = need;
        const dst = (a + cost) * width + np;
        if (v + cry < next[dst]) next[dst] = v + cry;
      }
    }
  }
  for (let i = 0; i < cells; i++) dp[i] = next[i];
}

/** Append one option to the current group if it can matter at all. */
function pushOption(c: Ctx, n: number, cost: number, pow: number, cry: number, budget: number, crystalCap: number, need: number): number {
  if (cost > budget || cry > crystalCap) return n;
  if (pow <= 0 && need > 0) return n; // relaxation 5
  const ws = c.ws;
  ws.optA[n] = cost;
  ws.optP[n] = pow > need ? need : pow;
  ws.optX[n] = cry;
  return n + 1;
}

/**
 * Can `side` remove target `t` during its Act at ply `k` in the relaxed game?
 * A 0/1 knapsack over groups (each own unit, each own commitment, and
 * `ACTIONS_PER_TURN` purchase slots), at most one option per group, minimising
 * crystals; feasible when `need` damage fits in `budget` actions within the
 * crystal ceiling.
 */
function killFeasible(c: Ctx, side: Side, k: number, t: Target): boolean {
  const p = c.p;
  const cat = c.cat;
  const ws = c.ws;
  const budget = actBudget(c, side, k);
  if (budget <= 0) return false;
  const need = t.need;
  const crystalCap = crystalBudget(c, side, k);
  const firstWindow = side === c.mover && k === 1;
  const width = need + 1;
  ws.dp.fill(INF, 0, (budget + 1) * width);
  ws.dp[0] = 0;
  let anyHit = false;

  // Live units.
  for (let slot = 0; slot < MAX_SLOTS; slot++) {
    if (p.sq[slot] === DEAD || p.owner[slot] !== side) continue;
    const def = p.defId[slot];
    const flags = p.uflags[slot];
    const active = (flags & F_CAN_ACT) !== 0;
    let levels = 0;
    let ra = 0;
    if (firstWindow) {
      // `canAttack` (combat.ts) for the turn in progress: its flags are exact.
      if (!active || (p.atkCount[slot] > 0 && (flags & F_LAST_KILLED) === 0)) continue;
    } else {
      levels = preparesIn(c, side, 1, k);
      ra = radius(c, side, def, 1, k, active);
    }
    const d = pointToTarget(p.sq[slot], t) - ra - t.radius;
    let n = 0;
    let cry = 0;
    for (let l = 0, cd = def; l <= levels && cd >= 0; l++, cd = cat.nextDef[cd]) {
      if (l > 0) cry += cat.promoCost[chainDef(cat, def, l - 1)];
      n = pushOption(c, n, hitCost(d, cat.spd[cd]), cat.power[powerIndex(side, cd, t.def)], cry, budget, crystalCap, need);
    }
    if (n > 0) anyHit = true;
    applyGroup(c, n, budget, need);
  }

  // Paid commitments: they arrive at the side's next turn start on their own square.
  const j0 = nextTurnStart(c, side);
  if (j0 <= k) {
    const base = side * PEND_STRIDE;
    const levels = preparesIn(c, side, j0, k);
    for (let s = 0; s < BOARD; s++) {
      const pd = p.pendDef[base + s];
      if (pd === 0) continue;
      const def = pd - 1;
      const d = pointToTarget(s, t) - radius(c, side, def, j0, k, true) - t.radius;
      let n = 0;
      let cry = 0;
      for (let l = 0, cd = def; l <= levels && cd >= 0; l++, cd = cat.nextDef[cd]) {
        if (l > 0) cry += cat.promoCost[chainDef(cat, def, l - 1)];
        n = pushOption(c, n, hitCost(d, cat.spd[cd]), cat.power[powerIndex(side, cd, t.def)], cry, budget, crystalCap, need);
      }
      if (n > 0) anyHit = true;
      applyGroup(c, n, budget, need);
    }
  }

  // New purchases: one Pareto table (actions, damage) → cheapest crystals,
  // shared by ACTIONS_PER_TURN identical slots (each hit costs an action, so
  // no window can use more bought bodies than that).
  const best = ws.buyBest;
  best.fill(INF, 0, (budget + 1) * width);
  let anyBuy = false;
  for (let j = j0; j <= k; j += 2) {
    if (ws.spawnLive[side][j] === 0) continue;
    const affordable = ws.crystals[side][j - 2];
    const levels = preparesIn(c, side, j, k);
    const dist = regionToTarget(c, side, j, t);
    if (dist < 0) continue;
    const t1 = cat.tier1;
    for (let i = 0; i < t1.length; i++) {
      const def = t1[i];
      if (cat.cost[def] > affordable) continue;
      const d = dist - radius(c, side, def, j, k, true, cat.cost[def]) - t.radius;
      let cry = cat.cost[def];
      for (let l = 0, cd = def; l <= levels && cd >= 0; l++, cd = cat.nextDef[cd]) {
        if (l > 0) cry += cat.promoCost[chainDef(cat, def, l - 1)];
        const cost = hitCost(d, cat.spd[cd]);
        let pow = cat.power[powerIndex(side, cd, t.def)];
        if (cost > budget || cry > crystalCap || (pow <= 0 && need > 0)) continue;
        if (pow > need) pow = need;
        const cell = cost * width + pow;
        if (cry < best[cell]) best[cell] = cry;
        anyBuy = true;
      }
    }
  }
  if (anyBuy) {
    anyHit = true;
    let n = 0;
    for (let a = 1; a <= budget; a++) {
      for (let pw = 0; pw <= need; pw++) {
        const v = best[a * width + pw];
        if (v >= INF) continue;
        ws.optA[n] = a;
        ws.optP[n] = pw;
        ws.optX[n] = v;
        n++;
      }
    }
    for (let slotIndex = 0; slotIndex < ACTIONS_PER_TURN; slotIndex++) applyGroup(c, n, budget, need);
  }

  if (!anyHit) return false;
  if (need === 0) {
    // Only an impossible (dead-on-arrival) state has need 0; any single hit
    // would then kill (`combat.ts resolveCombat`: power >= effective DEF).
    for (let a = 1; a <= budget; a++) for (let pw = 0; pw <= need; pw++) if (ws.dp[a * width + pw] <= crystalCap) return true;
    return false;
  }
  for (let a = 1; a <= budget; a++) if (ws.dp[a * width + need] <= crystalCap) return true;
  return false;
}

// ---------------------------------------------------------------------------
// targets
// ---------------------------------------------------------------------------

/**
 * Group the target classes `defs[0 … n)` by their power column against every
 * definition `side` could attack with (relaxation 6: `calculateAttackPower`
 * reads only the defender's element, so equal columns are the rule, not an
 * approximation). Writes `ws.group*` and returns the number of groups; each
 * group keeps its smallest DEF and its largest closing radius.
 */
function powerGroups(c: Ctx, side: Side, defs: Int32Array, radii: Int32Array, n: number): number {
  const cat = c.cat;
  const ws = c.ws;
  let groups = 0;
  for (let i = 0; i < n; i++) {
    const d = defs[i];
    let g = 0;
    for (; g < groups; g++) {
      const r = ws.groupDef[g];
      let same = true;
      for (let a = 0; a < NDEF; a++) {
        if (cat.power[powerIndex(side, a, d)] !== cat.power[powerIndex(side, a, r)]) {
          same = false;
          break;
        }
      }
      if (same) break;
    }
    if (g === groups) {
      ws.groupDef[g] = d;
      ws.groupMinDef[g] = cat.def[d];
      ws.groupRadius[g] = radii[i];
      groups++;
    } else {
      if (cat.def[d] < ws.groupMinDef[g]) ws.groupMinDef[g] = cat.def[d];
      if (radii[i] > ws.groupRadius[g]) ws.groupRadius[g] = radii[i];
    }
  }
  return groups;
}

/** Is any kill by `side` not ruled out at its window `k`? Fills `out` when so. */
function windowOpen(c: Ctx, side: Side, k: number, defs: Int32Array, radii: Int32Array, out: KillEtaWindow): boolean {
  const p = c.p;
  const cat = c.cat;
  const ws = c.ws;
  const enemy = (1 - side) as Side;
  const t: Target = { kind: 'unit', slot: -1, square: -1, arrival: 0, field: null, def: 0, need: 0, radius: 0 };
  const enemyStart = nextTurnStart(c, enemy);
  // Relaxation 3: existing damage survives only until the target's owner's
  // next turn start.
  const damageLive = k < enemyStart;

  // Live enemy units.
  const unitLevels = preparesIn(c, enemy, 1, k);
  for (let slot = 0; slot < MAX_SLOTS; slot++) {
    if (p.sq[slot] === DEAD || p.owner[slot] !== enemy) continue;
    const def = p.defId[slot];
    const r = radius(c, enemy, def, 1, k, (p.uflags[slot] & F_CAN_ACT) !== 0);
    let n = 0;
    for (let l = 0, cd = def; l <= unitLevels && cd >= 0; l++, cd = cat.nextDef[cd]) {
      defs[n] = cd;
      radii[n] = r;
      n++;
    }
    const groups = powerGroups(c, side, defs, radii, n);
    const damage = damageLive ? p.damage[slot] : 0;
    for (let g = 0; g < groups; g++) {
      t.kind = 'unit';
      t.slot = slot;
      t.square = p.sq[slot];
      t.field = null;
      t.def = ws.groupDef[g];
      t.need = Math.max(0, ws.groupMinDef[g] - damage);
      t.radius = ws.groupRadius[g];
      if (killFeasible(c, side, k, t)) return fill(out, k, t);
    }
  }

  // Enemy commitments: bodies from the enemy's next turn start, at their squares.
  if (enemyStart < k) {
    const base = enemy * PEND_STRIDE;
    const levels = preparesIn(c, enemy, enemyStart, k);
    for (let s = 0; s < BOARD; s++) {
      const pd = p.pendDef[base + s];
      if (pd === 0) continue;
      const def = pd - 1;
      const r = radius(c, enemy, def, enemyStart, k, true);
      let n = 0;
      for (let l = 0, cd = def; l <= levels && cd >= 0; l++, cd = cat.nextDef[cd]) {
        defs[n] = cd;
        radii[n] = r;
        n++;
      }
      const groups = powerGroups(c, side, defs, radii, n);
      for (let g = 0; g < groups; g++) {
        t.kind = 'pending';
        t.slot = -1;
        t.square = s;
        t.field = null;
        t.def = ws.groupDef[g];
        t.need = ws.groupMinDef[g];
        t.radius = ws.groupRadius[g];
        if (killFeasible(c, side, k, t)) return fill(out, k, t);
      }
    }
  }

  // Enemy purchases: any affordable tier-1 class, anywhere in its arrival region.
  for (let jT = enemyStart; jT < k; jT += 2) {
    if (ws.spawnLive[enemy][jT] === 0) continue;
    const affordable = ws.crystals[enemy][jT - 2];
    const levels = preparesIn(c, enemy, jT, k);
    let n = 0;
    const t1 = cat.tier1;
    for (let i = 0; i < t1.length; i++) {
      const def = t1[i];
      if (cat.cost[def] > affordable) continue;
      const r = radius(c, enemy, def, jT, k, true, cat.cost[def]);
      for (let l = 0, cd = def; l <= levels && cd >= 0; l++, cd = cat.nextDef[cd]) {
        defs[n] = cd;
        radii[n] = r;
        n++;
      }
    }
    const groups = powerGroups(c, side, defs, radii, n);
    for (let g = 0; g < groups; g++) {
      t.kind = 'arrival';
      t.slot = -1;
      t.square = -1;
      t.arrival = jT;
      t.field = ws.spawnField[enemy][jT];
      t.def = ws.groupDef[g];
      t.need = ws.groupMinDef[g];
      t.radius = ws.groupRadius[g];
      if (killFeasible(c, side, k, t)) return fill(out, k, t);
    }
  }
  return false;
}

function fill(out: KillEtaWindow, k: number, t: Target): true {
  out.ply = k;
  out.target = t.kind;
  out.slot = t.slot;
  out.square = t.square;
  out.need = t.need;
  return true;
}

// ---------------------------------------------------------------------------
// entry point
// ---------------------------------------------------------------------------

/**
 * A lower bound on the ply (1 = the turn in progress) of `side`'s first kill,
 * over every legal continuation of `p`. See the module comment for the ply
 * convention, the relaxation and what the value may and may not be used for.
 */
export function killEta(p: PackedState, side: Side, opts: KillEtaOptions = {}, scratch?: KillEtaScratch): KillEtaReading {
  const requested = opts.limit ?? KILL_ETA_HORIZON;
  // A negative or NaN limit examines nothing and answers 1 — trivially sound.
  const limit = !(requested >= 0) ? 0 : requested > KILL_ETA_HORIZON ? KILL_ETA_HORIZON : Math.floor(requested);
  const reading = (plies: number, window: KillEtaWindow | null): KillEtaReading => ({
    side,
    claim: { value: plies, status: 'bounded', evidence: KILL_ETA_EVIDENCE, assumptions: KILL_ETA_ASSUMPTIONS },
    plies,
    limit,
    firstNotRuledOut: window,
  });
  // A decided game has no further plies: no kill can ever follow.
  if (p.result !== Result.ONGOING) return reading(limit + 1, null);

  const cat = activeCatalog();
  let mineMax = 0;
  let defMax = 0;
  for (let d = 0; d < NDEF; d++) {
    if (cat.mine[d] > mineMax) mineMax = cat.mine[d];
    if (cat.def[d] > defMax) defMax = cat.def[d];
  }
  if (defMax > NEED_CAP) throw new Error(`killEta: catalogue DEF ${defMax} exceeds NEED_CAP ${NEED_CAP}`);
  let minBuyCost = INF;
  for (let i = 0; i < cat.tier1.length; i++) if (cat.cost[cat.tier1[i]] < minBuyCost) minBuyCost = cat.cost[cat.tier1[i]];

  const ws = scratch ?? newKillEtaScratch();
  bbZero(ws.empty);
  const c: Ctx = { p, cat, ws, mover: p.side, limit, mineMax, minBuyCost };
  const enemy = (1 - side) as Side;
  fillCrystals(c, side);
  fillCrystals(c, enemy);
  fillSpawnRegions(c, side);
  fillSpawnRegions(c, enemy);
  fillRegionDistances(c, side);

  const defs = ws.targetDefs;
  const radii = ws.targetRadii;
  const window: KillEtaWindow = { ply: 0, target: 'unit', slot: -1, square: -1, need: 0 };
  for (let k = 1; k <= limit; k++) {
    if (!owns(c, side, k)) continue;
    if (windowOpen(c, side, k, defs, radii, window)) return reading(k, window);
  }
  return reading(limit + 1, null);
}

/** `killEta` for both sides, sharing one scratch: `[white, black]`. */
export function killEtaBoth(p: PackedState, opts: KillEtaOptions = {}, scratch?: KillEtaScratch): [KillEtaReading, KillEtaReading] {
  const ws = scratch ?? newKillEtaScratch();
  return [killEta(p, 0, opts, ws), killEta(p, 1, opts, ws)];
}
