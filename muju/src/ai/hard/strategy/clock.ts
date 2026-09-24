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
 * `proven-win` requires THREE things, all at once, matching Part A item 1's
 * "exact clock verdict" definition:
 *
 *   1. `L_side.value > U_opp.value`, STRICTLY (a tie is a draw, `core/state.ts
 *      makeEndPlace` step 1: `white > black ? WHITE_WIN : black > white ?
 *      BLACK_WIN : DRAW`, so an equal interval never wins for anyone);
 *   2. both sides' `killEta` exceed `r` (neither side can force a kill in the
 *      window, so the ledger's own "no unit dies" assumption cannot be
 *      falsified by an actual kill);
 *   3. no OTHER ending can pre-empt the clock within `r` — home victory by
 *      either side, or upkeep elimination of either side, each excluded by a
 *      SOUND (if loose) argument below. Falling short of (3) alone, with (1)
 *      and (2) held, is exactly `bounded-win`; falling short of (1) is `open`.
 *
 * `proven-loss`/`bounded-loss` are the mirror (`L_opp.value > U_side.value`).
 * `open` is every other case, INCLUDING an exact tie of the two intervals.
 *
 * ## Why home victory needs only a REACHABILITY bound, not a rescue proof
 *
 * The canonical game's home-checkmate rule (`src/game/homeCheckmate.ts
 * analyzeHomeDefense`) is a full search: an invader wins only if the
 * defender's ENTIRE next turn cannot remove it. The REPLICA this whole
 * package searches over does not run that proof at interior nodes — it uses
 * the much simpler mechanical rule `core/state.ts:1382-1394`
 * (`Reason.HOME_OCCUPATION`, `occupiesEnemyCorner`): an invader's unit that is
 * STILL on the defender's corner at the hand-off FOLLOWING the defender's own
 * full turn wins, unconditionally — no damage/defence accounting at all. The
 * only way to remove an invading unit, in either rule, is to KILL it (there is
 * no other displacement mechanic in this game — `combat.ts`, `movement.ts`).
 * So under THIS function's own "no kill within `r`" premise (exactly what
 * `killEta`'s exclusion already establishes for channels 1-2), an invader's
 * unit that reaches the defender's corner CANNOT be removed by any kill-free
 * continuation — reaching it is therefore SUFFICIENT, not just necessary, for
 * the replica's own terminal to fire, a ply or two later. `homeVictoryEta`
 * below bounds only the REACHING half (the necessary half, which is also
 * sufficient here), which is enough: the extra hand-off the replica's rule
 * spends confirming survival only makes the true firing ply LATER than our
 * bound, which is the SAFE direction for a lower bound (Part A item 5: this
 * function is deliberately looser than it has to be, never tighter than it
 * is entitled to be).
 *
 * ## Why a purchase never reaches the corner faster than an existing unit
 *
 * `homeVictoryEta` considers only currently LIVE and PENDING units, not a
 * fresh Prepare purchase, and still calls that sound. RULE (`spawning.ts
 * isValidSpawnPosition`, `core/tables.ts RECT`): a new body may only arrive
 * inside the axis-aligned rectangle from the buyer's OWN corner to one of its
 * EXISTING bodies' squares — and the corner point of that box CLOSEST to the
 * far (enemy) corner is always that existing body's own square (an
 * axis-aligned box anchored at one's own corner cannot extend past the
 * anchor unit towards the opposite corner). So a fresh purchase can never
 * start closer to the enemy corner than the nearest already-live-or-pending
 * unit already is — and relaying through a freshly bought unit near an
 * ADVANCED existing unit is never faster than that existing unit continuing
 * to move itself (the same distance still has to be closed, by whichever
 * body is doing it, and the relay adds an arrival delay the direct unit does
 * not pay). Buys and promotions are therefore sound to ignore here, unlike in
 * `ledger.ts U` (which must count them because it bounds a MAGNITUDE — mined
 * crystals — under a "no death" premise, not a REACHABILITY question where
 * the geometry above applies).
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
   * three grades, `Guarantee`'s doc). `assumptions` names, in plain words,
   * either what the proof rests on (a proven/bounded grade) or which specific
   * gate kept a disjoint interval from reaching `proven` (a bounded grade) —
   * see the module doc's three exclusion gates.
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

/** The largest speed anywhere on `def`'s promotion chain (tier 1 through 3),
 * ignoring promotion cost and timing entirely — MORE relaxed than
 * `killeta.ts`'s own `chainSpeed` (which still charges crystals and Prepares
 * for each step), because `homeVictoryEta` only needs a bound cheap enough to
 * skip that accounting (module doc: purchases are excluded on a geometric
 * argument, not an affordability one, so the same slack extends naturally to
 * "assume every promotion is already free and instant" for the units it does
 * count). Relaxing further can only make the bound EARLIER, so it stays
 * sound. */
function maxChainSpeed(cat: Catalog, def: number): number {
  let best = 0;
  let d = def;
  while (d >= 0) {
    if (cat.spd[d] > best) best = cat.spd[d];
    d = cat.nextDef[d];
  }
  return best;
}

/** The earliest `side`-owned ply by which `actionsNeeded` cumulative actions
 * of `side`'s own Acts could have been spent, capped at `limit + 1` ("never
 * within `limit`"). `actionsNeeded <= 0` is already true now (ply 1). */
function earliestPlyForActions(p: PackedState, side: Side, actionsNeeded: number, limit: number): number {
  if (actionsNeeded <= 0) return 1;
  let budget = 0;
  for (let ply = 1; ply <= limit; ply++) {
    budget += ownActionsAt(p, side, ply);
    if (budget >= actionsNeeded) return ply;
  }
  return limit + 1;
}

/**
 * A SOUND lower bound (module doc) on the ply by which `invader` could have a
 * body standing on the enemy corner, over LIVE and PENDING bodies only, each
 * moving on an EMPTY board (no blockers, no other unit in the way — the same
 * relaxation `killeta.ts` uses, and sound for the same reason: real terrain
 * can only make a real approach slower, never faster) at the fastest speed
 * anywhere on its own promotion chain. `limit + 1` when no body can reach it
 * within `limit` plies. `p.victoryHome === 0` (this ruleset has no home
 * victory at all) short-circuits to `limit + 1` unconditionally.
 *
 * Exported for direct testing (plan W1.5: "paired one-fact flips ... an
 * anchor alive or dead"): a defending body near the enemy's OWN corner is not
 * modelled here at all (this bound is about the INVADER's reach, not the
 * defender's ability to block it — the geometric argument in the module doc
 * is what makes that omission sound), but a paired test that KILLS or MOVES
 * the invader's own nearest body must move this value, which is what those
 * tests check.
 */
export function homeVictoryEta(p: PackedState, invader: Side, limit: number): number {
  if (p.victoryHome === 0) return limit + 1;
  const enemyCornerSide = (1 - invader) as Side;
  const cat = activeCatalog();
  let best = limit + 1;

  for (let slot = 0; slot < MAX_SLOTS; slot++) {
    if (p.sq[slot] === DEAD || p.owner[slot] !== invader) continue;
    const dist = dist2Corner(enemyCornerSide, p.sq[slot]);
    const spd = maxChainSpeed(cat, p.defId[slot]);
    if (dist > 0 && spd <= 0) continue; // an immobile body already elsewhere never arrives
    const actionsNeeded = dist <= 0 ? 0 : Math.ceil(dist / spd);
    const ply = earliestPlyForActions(p, invader, actionsNeeded, limit);
    if (ply < best) best = ply;
  }

  const base = invader * PEND_STRIDE;
  for (let sq = 0; sq < BOARD; sq++) {
    const encoded = p.pendDef[base + sq];
    if (encoded === 0) continue;
    const def = encoded - 1;
    const dist = dist2Corner(enemyCornerSide, sq);
    const spd = maxChainSpeed(cat, def);
    if (dist > 0 && spd <= 0) continue;
    const actionsNeeded = dist <= 0 ? 0 : Math.ceil(dist / spd);
    // Sound but loose (module doc, Part A item 5): treats a pending body as
    // able to act from ply 1, though it cannot really move before it lands
    // (`resolveArrivals`, its owner's next turn start). Assuming it acts
    // EARLIER than truly possible can only shrink `ply`, which is the SAFE
    // direction for a lower bound (never claims impossibility too late).
    const ply = earliestPlyForActions(p, invader, actionsNeeded, limit);
    if (ply < best) best = ply;
  }

  return best;
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

/** The verdict Claim's `assumptions`, given which of the three gates held. */
function verdictAssumptions(
  disjoint: boolean,
  killRuledOut: boolean,
  homeRuledOut: boolean,
  upkeepRuledOut: boolean,
): readonly string[] {
  if (!disjoint) {
    return [
      "the ledger's stay-put/ceiling intervals overlap for the two sides (see ClockLedger.sides[*].L/U.assumptions); no grade stronger than 'open' is available regardless of the other two gates",
    ];
  }
  const out: string[] = [
    'L/U for both sides carry the assumptions attached to their own Claim objects (no death, no relocation, no cancelled arrival, rent settled in defaultKeep order — ledger.ts)',
  ];
  out.push(
    killRuledOut
      ? 'neither side can force a kill within r (both sides: killETA > r, a sound lower bound — killeta.ts KILL_ETA_ASSUMPTIONS)'
      : 'a kill by one side is NOT ruled out within r (killETA <= r for at least one side) — the disjoint interval is only bounded, not proven',
  );
  out.push(
    homeRuledOut
      ? 'neither side can reach an unanswerable home occupation within r (homeVictoryEta > r for both, an empty-board reachability lower bound — clock.ts)'
      : 'home victory is NOT ruled out within r for at least one side (homeVictoryEta <= r) — the disjoint interval is only bounded, not proven',
  );
  out.push(
    upkeepRuledOut
      ? 'neither side can be eliminated by an unaffordable rent bill within r (both sides hold a living tier-1 body, which settleRent never releases)'
      : 'upkeep elimination is NOT ruled out within r for a side with no living tier-1 body — the disjoint interval is only bounded, not proven',
  );
  return out;
}

/**
 * The kill-clock verdict for `side` (normally the root mover), read off
 * `ledger.ts`'s mined-total interval, `killeta.ts`'s kill lower bound and this
 * module's home-victory/upkeep-elimination exclusions (module doc). Pure
 * function of the packed root; safe to call once per root search.
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

  const winDisjoint = Lside > Uopp;
  const lossDisjoint = Lopp > Uside;
  const disjoint = winDisjoint || lossDisjoint;

  const killRuledOut = killEta[side].plies > r && killEta[opp].plies > r;
  const homeRuledOut = homeVictoryEta(p, side, r) > r && homeVictoryEta(p, opp, r) > r;
  const upkeepRuledOut = upkeepEliminationRuledOut(p, side) && upkeepEliminationRuledOut(p, opp);
  const noPreemption = killRuledOut && homeRuledOut && upkeepRuledOut;

  const verdict: ClockVerdict = winDisjoint
    ? noPreemption
      ? 'proven-win'
      : 'bounded-win'
    : lossDisjoint
      ? noPreemption
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
    assumptions: verdictAssumptions(disjoint, killRuledOut, homeRuledOut, upkeepRuledOut),
  };

  return { side, r, verdict, marginL, marginMid, ledger, killEta, posture, claim };
}
