/**
 * STRATEGOS W1.5 — `clockReading`: the kill-clock verdict (plan
 * `~/.claude/plans/can-you-respond-to-piped-book.md`, Part B.1's `clock.ts`
 * row and Part A items 1-2). Combines `ledger.ts`'s mined-total interval and
 * `killeta.ts`'s kill lower bound into the verdict table `strategy/types.ts
 * ClockVerdict` documents, and states, as a typed `Claim`, exactly what the
 * verdict rests on — never "the opponent cooperates" (Part A item 1).
 *
 * Pure function of the packed root, like every module in this directory: no
 * module state, nothing mutated on `p`, safe to call once per root search
 * (`search/root.ts`, W1.6).
 *
 * ## The verdict table (mirrors `strategy/types.ts ClockVerdict`'s doc)
 *
 * `proven-win` requires FOUR things, all at once — Part A item 1's "exact
 * clock verdict" definition plus the arrival gate the W1.5 review added:
 *
 *   1. `L_side.value > U_opp.value`, STRICTLY (a tie is a draw, `core/state.ts
 *      makeEndPlace` step 1: `white > black ? WHITE_WIN : black > white ?
 *      BLACK_WIN : DRAW`, so an equal interval never wins for anyone);
 *   2. both sides' `killEta` exceed `r` (neither side can force a kill in the
 *      window, so the ledger's own "no unit dies" assumption cannot be
 *      falsified by an actual kill);
 *   3. no OTHER ending can pre-empt the clock within `r` — home victory by
 *      either side, or upkeep elimination of either side, each excluded by a
 *      SOUND (if loose) argument below;
 *   4. the winner's floor `L` does not rest on an arrival the loser can
 *      cancel (no pending commitment on the winning side, below).
 *
 * Falling short of (2), (3) or (4), with (1) held, is exactly `bounded-win`;
 * falling short of (1) is `open`. A root with the kill clock OFF
 * (`p.drawRuleOn === 0`, `inactivityRule: 'off'`) has no clock ending at all:
 * the reading is `open` with `claim.status: 'unknown'` and posture `none`.
 *
 * `proven-loss`/`bounded-loss` are the mirror (`L_opp.value > U_side.value`).
 * `open` is every other case, INCLUDING an exact tie of the two intervals.
 *
 * ## Why home victory needs only a REACHABILITY bound, not a rescue proof
 *
 * Both home endings need an invader's body standing on the defender's corner.
 * `Reason.HOME_CHECKMATE` (`core/state.ts resolveHomeCheckmate`, the packed
 * replica of `src/game/homeCheckmate.ts`; it runs at every Prepare the replica
 * reaches, interior search nodes included) is awarded in the invader's own
 * Prepare, the ply the body arrives, when the prover finds the defender cannot
 * remove it (`tactics/prover.ts needsProof` requires the occupier).
 * `Reason.HOME_OCCUPATION` (`core/state.ts makeEndPlace` step 3,
 * `occupiesEnemyCorner`) fires one ply later, at the hand-off that closes the
 * defender's turn, if the body is still there. Either way the ending cannot
 * come before the ply the body first stands on the corner, so a SOUND lower
 * bound on that ply (`homeVictoryEta` below) is enough: `homeVictoryEta > r`
 * rules both endings out inside the window. The bound ignores whether the
 * corner is free, whether the defender could remove the body and the
 * `c >= 9` gate on the mate, so it is looser than it has to be (Part A item
 * 5), never tighter than it is entitled to be.
 *
 * ## The reach bound, and why purchases are part of it
 *
 * RULE (`src/game/movement.ts`): a move is orthogonal, never through a unit,
 * and one action moves a body at most its class's speed, so on an empty board
 * a body `d` squares (Manhattan, `core/tables.ts dist2Corner`) from the corner
 * needs actions worth `d` squares. A body's class can rise only by a
 * promotion, at most one per own Prepare (`promotion.ts canPromote`), and a
 * Prepare comes after its ply's Act, so the fastest class a body can move at
 * in own ply `j` is the fastest on its chain within as many steps as its side
 * has owned plies before `j` (`chainSpeedWithin`, cost ignored).
 *
 * A PURCHASE can reach the corner faster than any body alive now: a slow
 * anchor walks forward, a `lightning_1` (speed 3) is bought next to it and
 * sprints (the W1.5 review's counterexample: a lone `plant_1` 14 squares out
 * cannot arrive before ply 7, the relay stands on the corner at ply 3 and
 * wins by home checkmate). What the rules DO guarantee (`spawning.ts
 * isValidSpawnPosition`, `core/spawn.ts spawnInfo`): an arrival lands inside
 * the rectangle from its owner's corner to one of the owner's LIVE units at
 * arrival time, and every square of that rectangle is at least as far from
 * the enemy corner as the anchor itself. So `m`, the smallest distance any of
 * the invader's bodies (live or pending) has to the corner, never drops when
 * a body arrives, and drops by at most the mover's speed per action. The
 * relay bound spends every own action at the fastest speed any body could
 * have in that ply: existing bodies from ply 1, bought bodies no earlier than
 * the owner's second own ply (bought in its first own Prepare, landing at its
 * next turn start, `resolveArrivals`), tier 1 on arrival and one tier more
 * per own Prepare after that. It is used whenever a purchase is affordable at
 * all: bank plus pending refunds plus every crystal left on the board (the
 * most mining could ever add, `ledger.ts U`'s reserve cap) reaching the
 * cheapest tier-1 cost. Pending bodies are credited as if they could act from
 * ply 1, a relaxation in the safe direction.
 *
 * ## Why a pending arrival keeps a verdict from `proven`
 *
 * `ledger.ts L` counts every pending commitment as landing (its "no pending
 * arrival is cancelled" assumption). The OTHER side decides that assumption
 * without killing anything: a commitment is refunded at arrival when its
 * square is occupied or every rectangle holding it contains an enemy unit
 * (`core/state.ts resolveArrivals`, `core/spawn.ts spawnInfo`), and pending
 * commitments do not block movement, so an enemy body may simply step onto
 * the square. The W1.5 review's counterexample: Black 1 up on mined total,
 * a pending `plant_1` on a 2-crystal square, `r = 3`; the reading said
 * `proven-loss` for White, and White, walking its own `plant_1` onto that
 * square, won the clock 2 to 1. So a `proven-*` grade also requires the side
 * whose floor `L` carries the verdict to have NO pending commitment
 * (`arrivalsSettled`); otherwise the grade is at most `bounded-*`. A search
 * root at a fresh turn start has none of its own (they resolved at its turn
 * start), so this bites `proven-loss` readings, and only while the opponent's
 * last purchases are still in flight.
 *
 * ## Why upkeep elimination needs only a "does a tier-1 body exist" check
 *
 * RULE (`ledger.ts settleRent`, mirroring `core/state.ts makePayUpkeep`): an
 * unaffordable rent bill releases units strictly above tier 1; "an unkept
 * tier-1 unit stays, rent-free" — tier 1 is NEVER released. So a side with at
 * least one living tier-1 body cannot be reduced to zero units by upkeep
 * alone, for ANY kill-free window of ANY length: `upkeepEliminationRuledOut`
 * below is then unconditionally true, cheaply, forever. A side with NO tier-1
 * body could in principle lose every remaining body to a single unaffordable
 * bill; bounding exactly when that bill lands and whether it is truly
 * unaffordable is exactly the kind of position-wide affordability search this
 * module's "cheap" mandate excludes (Part B.2 W1.5: "If you cannot bound one
 * of them soundly and cheaply, the verdict is at most bounded-*"), so that
 * case is left unresolved and the verdict is capped at `bounded-*`.
 */
import { activeCatalog, type Catalog } from '../core/catalog';
import { ACTIONS_PER_TURN } from '../core/state';
import { BOARD, dist2Corner } from '../core/tables';
import { DEAD, MAX_SLOTS, PEND_STRIDE, type PackedState, type Side } from '../types';
import { clockLedger, type ClockLedger } from './ledger';
import { killEtaBoth, type KillEtaReading } from './killeta';
import type { Claim, ClockReadingCore, ClockVerdict, Posture } from './types';

/** The verdict Claim's `evidence` tag (plan W1.5). */
export const CLOCK_VERDICT_EVIDENCE = 'clock.verdict';

/**
 * `strategy/clock.ts clockReading`'s full result: `ClockReadingCore`
 * (`side`, `r`, `verdict`, `marginL`, `marginMid` — the slice `eval/
 * evaluate.ts` reads, W1.6) plus the Chronicle detail: the ledger and
 * killETA readings the verdict was read off, the resulting posture, and the
 * verdict itself as a typed `Claim` whose `assumptions` name exactly what
 * would have to be true (or is not yet excluded) for a stronger grade.
 */
export interface ClockReading extends ClockReadingCore {
  /** The mined-total interval both sides' L/U came from (`ledger.ts`, W1.3). */
  ledger: ClockLedger;
  /** `killEtaBoth`'s own `[white, black]` convention (`killeta.ts`, W1.4),
   * independent of `side`: index by `Side` to read either side's bound. */
  killEta: readonly [KillEtaReading, KillEtaReading];
  /** `hold` on `*-win`, `force-contact` on `*-loss`, `none` on `open`
   * (`strategy/types.ts Posture`). */
  posture: Posture;
  /**
   * The verdict as a typed fact: `status` is `'proven'` for `proven-*`,
   * `'bounded'` for `bounded-*`, `'projected'` for `open` (Part A item 1's
   * three grades, `Guarantee`'s doc), and `'unknown'` when the kill clock is
   * off at the root (no clock ending exists). `assumptions` names, in plain
   * words, either what the proof rests on (a proven grade) or which specific
   * gate kept a disjoint interval from reaching `proven` (a bounded grade) —
   * see the module doc's verdict table.
   */
  claim: Claim<ClockVerdict>;
}

/** Ply 1 is the turn in progress; the side to move owns the odd plies
 * (`killeta.ts`'s own convention, restated here because `homeVictoryEta`
 * needs it independently of that module's private `Ctx`). */
function ownsPly(p: PackedState, side: Side, ply: number): boolean {
  return ply >= 1 && ((ply & 1) === 1) === (side === p.side);
}

/** Actions `side` has available during its OWN Act at `ply` (0 if it does not
 * own `ply`): the turn in progress gets whatever is left of `p.actions`
 * (nothing, if the root sits in Prepare); every later own turn gets a fresh
 * `ACTIONS_PER_TURN` (`killeta.ts actBudget`'s convention, restated). */
function ownActionsAt(p: PackedState, side: Side, ply: number): number {
  if (!ownsPly(p, side, ply)) return 0;
  if (ply === 1) return p.phase === 1 ? p.actions : 0;
  return ACTIONS_PER_TURN;
}

/** Plies in `[from, to)` that `side` owns. Each owned ply has exactly one
 * Prepare of `side`'s (after its Act, or now when the root already stands in
 * it), and RULE (`core/state.ts isLegal`: `BUY`/`PROMOTE` only in Prepare,
 * `promotion.ts canPromote`: once per unit per Prepare) that Prepare is the
 * only place a class can rise or a purchase be committed. */
function ownPliesBetween(p: PackedState, side: Side, from: number, to: number): number {
  let n = 0;
  for (let q = from; q < to; q++) if (ownsPly(p, side, q)) n++;
  return n;
}

/** The fastest speed on `def`'s promotion chain within `steps` promotions
 * (cost ignored: relaxing affordability only makes the bound earlier). */
function chainSpeedWithin(cat: Catalog, def: number, steps: number): number {
  let best = cat.spd[def];
  let d = def;
  for (let k = 0; k < steps; k++) {
    d = cat.nextDef[d];
    if (d < 0) break;
    if (cat.spd[d] > best) best = cat.spd[d];
  }
  return best;
}

/** The fastest speed a body BOUGHT by `side` could move at in its own ply
 * `ply`, or 0 before any purchase can have landed (module doc: bought in the
 * first own Prepare at the earliest, landing at the owner's next turn start;
 * tier 1 on arrival, one tier more per own Prepare after that). */
function boughtSpeedAt(p: PackedState, side: Side, cat: Catalog, firstArrival: number, ply: number): number {
  if (ply < firstArrival) return 0;
  const steps = ownPliesBetween(p, side, firstArrival, ply);
  let best = 0;
  for (let i = 0; i < cat.tier1.length; i++) {
    const v = chainSpeedWithin(cat, cat.tier1[i], steps);
    if (v > best) best = v;
  }
  return best;
}

/** Whether `side` could ever afford a purchase: bank, plus every pending
 * refund, plus every crystal left on the board (the most mining could ever
 * add — every mined crystal leaves some cell's reserve and forward play never
 * raises one, `ledger.ts investmentBound`'s reserve cap) reaching the
 * cheapest tier-1 cost. `false` is a proof that no body can be bought. */
function purchaseAffordable(p: PackedState, side: Side, cat: Catalog): boolean {
  let cheapest = Infinity;
  for (let i = 0; i < cat.tier1.length; i++) if (cat.cost[cat.tier1[i]] < cheapest) cheapest = cat.cost[cat.tier1[i]];
  let ceiling = p.bank[side] + p.pendCostSum[side];
  for (let s = 0; s < BOARD; s++) ceiling += p.reserve[s];
  return ceiling >= cheapest;
}

/**
 * A SOUND lower bound (module doc, "The reach bound") on the first ply at
 * which `invader` could have a body standing on the enemy corner, over every
 * continuation: `limit + 1` when none could within `limit` plies.
 * `p.victoryHome === 0` (no home victory in this ruleset) short-circuits to
 * `limit + 1`.
 *
 * Two readings, the smaller wins:
 *   - each LIVE or PENDING body on its own, at the fastest class it could
 *     have been promoted to by each own ply (`chainSpeedWithin`), every own
 *     action spent on it, on an empty board;
 *   - when any purchase is affordable (`purchaseAffordable`), the RELAY
 *     bound: `m`, the smallest distance any of the invader's bodies has to
 *     the corner, falls by at most the fastest speed ANY body — existing or
 *     bought (`boughtSpeedAt`) — could move at in that ply, per action.
 *
 * Pending bodies are credited as if they could act from ply 1 (they really
 * act from their landing turn), which only makes the bound earlier.
 *
 * Exported for direct testing: the review's relay counterexample
 * (`tests/ai/hard/strategy-clock.test.ts`) replays a real line that stands on
 * the corner and asserts this bound never exceeds that ply.
 */
export function homeVictoryEta(p: PackedState, invader: Side, limit: number): number {
  if (p.victoryHome === 0) return limit + 1;
  const enemyCornerSide = (1 - invader) as Side;
  const cat = activeCatalog();

  // Every body the invader has or has committed: its class and its distance.
  const defs: number[] = [];
  const dists: number[] = [];
  for (let slot = 0; slot < MAX_SLOTS; slot++) {
    if (p.sq[slot] === DEAD || p.owner[slot] !== invader) continue;
    defs.push(p.defId[slot]);
    dists.push(dist2Corner(enemyCornerSide, p.sq[slot]));
  }
  const base = invader * PEND_STRIDE;
  for (let sq = 0; sq < BOARD; sq++) {
    const encoded = p.pendDef[base + sq];
    if (encoded === 0) continue;
    defs.push(encoded - 1);
    dists.push(dist2Corner(enemyCornerSide, sq));
  }

  let m = Infinity;
  for (const d of dists) if (d < m) m = d;
  if (m <= 0) return 1;

  // Per body, alone.
  const left = dists.slice();
  let best = limit + 1;
  // The relay: bought bodies land at the owner's next turn start after its
  // first own Prepare (ply 1's if it owns ply 1, else ply 2's).
  const relay = purchaseAffordable(p, invader, cat);
  const firstArrival = (ownsPly(p, invader, 1) ? 1 : 2) + 2;
  let relayLeft = m;

  for (let ply = 1; ply <= limit && ply < best; ply++) {
    const acts = ownActionsAt(p, invader, ply);
    if (acts === 0) continue;
    const steps = ownPliesBetween(p, invader, 1, ply);
    let fastest = 0;
    for (let i = 0; i < defs.length; i++) {
      const spd = chainSpeedWithin(cat, defs[i], steps);
      if (spd > fastest) fastest = spd;
      left[i] -= acts * spd;
      if (left[i] <= 0 && ply < best) best = ply;
    }
    if (relay) {
      const bought = boughtSpeedAt(p, invader, cat, firstArrival, ply);
      relayLeft -= acts * (bought > fastest ? bought : fastest);
      if (relayLeft <= 0 && ply < best) best = ply;
    }
  }
  return best;
}

/**
 * True iff `side` has no pending commitment, so `ledger.ts L`'s "no pending
 * arrival is cancelled" assumption is empty for it and the other side cannot
 * falsify it without a kill (module doc, "Why a pending arrival keeps a
 * verdict from `proven`"). `false` means "not established", never "the
 * arrival will be cancelled".
 */
export function arrivalsSettled(p: PackedState, side: Side): boolean {
  return p.pendCount[side] === 0;
}

/**
 * True iff `side` currently has a living tier-1 body, which makes upkeep
 * elimination of `side` impossible over ANY kill-free window (module doc).
 * `false` means "not established" (the side might still be safe; this module
 * just cannot say so cheaply), never "elimination is imminent".
 */
export function upkeepEliminationRuledOut(p: PackedState, side: Side): boolean {
  const cat = activeCatalog();
  for (let slot = 0; slot < MAX_SLOTS; slot++) {
    if (p.sq[slot] === DEAD || p.owner[slot] !== side) continue;
    if (cat.tier[p.defId[slot]] === 1) return true;
  }
  return false;
}

/** Which of the proof's gates held (module doc, the verdict table). */
interface Gates {
  disjoint: boolean;
  killRuledOut: boolean;
  homeRuledOut: boolean;
  upkeepRuledOut: boolean;
  /** The winning side's floor rests on no pending arrival (`arrivalsSettled`);
   * `true` when the intervals are not disjoint (nothing to rest on). */
  arrivalsHold: boolean;
}

/** The verdict Claim's `assumptions`, given which gates held. */
function verdictAssumptions(g: Gates): readonly string[] {
  if (!g.disjoint) {
    return [
      "the ledger's stay-put/ceiling intervals overlap for the two sides (see ClockLedger.sides[*].L/U.assumptions); no grade stronger than 'open' is available regardless of the other gates",
    ];
  }
  const out: string[] = [
    "the winner's stay-put floor L is played out by the winner itself (no relocation, no purchase, rent settled in defaultKeep order — ledger.ts); the loser's ceiling U is a sound bound over every kill-free continuation",
  ];
  out.push(
    g.killRuledOut
      ? 'neither side can force a kill within r (both sides: killETA > r, a sound lower bound — killeta.ts KILL_ETA_ASSUMPTIONS)'
      : 'a kill by one side is NOT ruled out within r (killETA <= r for at least one side) — the disjoint interval is only bounded, not proven',
  );
  out.push(
    g.homeRuledOut
      ? 'no body of either side can stand on the enemy corner within r, purchases and promotions included (homeVictoryEta > r for both, an empty-board reach lower bound — clock.ts)'
      : 'home victory is NOT ruled out within r for at least one side (homeVictoryEta <= r) — the disjoint interval is only bounded, not proven',
  );
  out.push(
    g.upkeepRuledOut
      ? 'neither side can be eliminated by an unaffordable rent bill within r (both sides hold a living tier-1 body, which settleRent never releases)'
      : 'upkeep elimination is NOT ruled out within r for a side with no living tier-1 body — the disjoint interval is only bounded, not proven',
  );
  out.push(
    g.arrivalsHold
      ? "the winner has no pending commitment, so its floor L rests on no arrival the loser could cancel"
      : "the winner's floor L counts a pending arrival the loser could cancel without a kill (occupy its square or block its rectangle) — the disjoint interval is only bounded, not proven",
  );
  return out;
}

/** The kill clock is off (`inactivityRule: 'off'`): no clock ending exists. */
const CLOCK_OFF_ASSUMPTIONS: readonly string[] = [
  "the kill clock is off at this root (p.drawRuleOn === 0, inactivityRule 'off'): there is no clock ending to read, so no verdict is computed",
];

/**
 * The kill-clock verdict for `side` (normally the root mover), read off
 * `ledger.ts`'s mined-total interval, `killeta.ts`'s kill lower bound and this
 * module's home-victory, upkeep-elimination and arrival exclusions (module
 * doc). Pure function of the packed root; safe to call once per root search.
 */
export function clockReading(p: PackedState, side: Side): ClockReading {
  const opp = (1 - side) as Side;
  const ledger = clockLedger(p);
  const r = ledger.r;
  const killEta = killEtaBoth(p, { limit: r });

  const Lside = ledger.sides[side].L.value;
  const Uside = ledger.sides[side].U.value;
  const Lopp = ledger.sides[opp].L.value;
  const Uopp = ledger.sides[opp].U.value;
  const marginL = Lside - Lopp;
  const marginMid = (Lside + Uside) / 2 - (Lopp + Uopp) / 2;

  if (p.drawRuleOn !== 1) {
    const claim: Claim<ClockVerdict> = { value: 'open', status: 'unknown', evidence: CLOCK_VERDICT_EVIDENCE, assumptions: CLOCK_OFF_ASSUMPTIONS };
    return { side, r, verdict: 'open', marginL, marginMid, ledger, killEta, posture: 'none', claim };
  }

  const winDisjoint = Lside > Uopp;
  const lossDisjoint = Lopp > Uside;
  const disjoint = winDisjoint || lossDisjoint;

  const gates: Gates = {
    disjoint,
    killRuledOut: killEta[side].plies > r && killEta[opp].plies > r,
    homeRuledOut: homeVictoryEta(p, side, r) > r && homeVictoryEta(p, opp, r) > r,
    upkeepRuledOut: upkeepEliminationRuledOut(p, side) && upkeepEliminationRuledOut(p, opp),
    arrivalsHold: winDisjoint ? arrivalsSettled(p, side) : lossDisjoint ? arrivalsSettled(p, opp) : true,
  };
  const provable = gates.killRuledOut && gates.homeRuledOut && gates.upkeepRuledOut && gates.arrivalsHold;

  const verdict: ClockVerdict = winDisjoint
    ? provable
      ? 'proven-win'
      : 'bounded-win'
    : lossDisjoint
      ? provable
        ? 'proven-loss'
        : 'bounded-loss'
      : 'open';

  const posture: Posture =
    verdict === 'proven-win' || verdict === 'bounded-win'
      ? 'hold'
      : verdict === 'proven-loss' || verdict === 'bounded-loss'
        ? 'force-contact'
        : 'none';

  const claim: Claim<ClockVerdict> = {
    value: verdict,
    status: verdict === 'proven-win' || verdict === 'proven-loss' ? 'proven' : verdict === 'open' ? 'projected' : 'bounded',
    evidence: CLOCK_VERDICT_EVIDENCE,
    assumptions: verdictAssumptions(gates),
  };

  return { side, r, verdict, marginL, marginMid, ledger, killEta, posture, claim };
}
