/**
 * STRATEGOS W1.10 — the plan-consistency veto, its pure half (plan
 * `~/.claude/plans/can-you-respond-to-piped-book.md`, Part A items 2-3, Part
 * B.1 "Veto rule at the root", B.2 step W1.10). `search/veto.ts` owns the
 * search half: the reserved budget, the full-window re-search and the
 * Chronicle record. This file answers the two questions that need no search:
 *
 *   1. IS A ROOT CANDIDATE PLAN-CONSISTENT? (`planConsistency`)
 *      - ForceContact: an injected force-contact line (`strategy/contact.ts`),
 *        or any candidate whose Act makes a DAMAGING attack — power > 0 when
 *        the attack lands (`plan.ts actDamages`; a zero-power attack is not
 *        contact, `combat.ts:94` clamps at 0). The contract's end predicate
 *        is contact, so any line that makes it serves the plan.
 *      - Hold: an injected hold line (`strategy/hold.ts`), or any candidate
 *        that CONTAINS NO KILL and after whose whole turn the enemy's
 *        `killEta` exceeds the plies left (`killeta.ts clockPliesLeft`): the
 *        end predicate, read on the position the turn reaches with the same
 *        sound lower bound `hold.ts` grades its lines with. The no-kill
 *        clause is Part A item 2: under Hold "take a free kill" is SUPPRESSED,
 *        because any kill resets the clock we are winning
 *        (`core/state.ts makeEndPlace`, `progress`).
 *
 *   2. GIVEN THE RE-SEARCH, IS THE PLAN VETOED? (`vetoVerdict`) Only on a
 *      PROOF or a broken contract, never on material (Part A item 2):
 *      - `mate` / `proven-clock-loss` — the plan candidate's re-searched score
 *        is TERMINAL-SCALE worse than the tactical best's
 *        (`terminalLossThreshold`): the plan line walks into a decided loss
 *        where the tactical best has none;
 *      - `forgone-win` — the mirror image, terminal-scale worse all the same:
 *        the tactical best is a decided win and the plan line is not;
 *      - `essential-lost` — a slot of the contract's `essentialSlots` is dead
 *        after the opponent's best reply.
 *      A plan that merely loses a unit, crystals or eval centimes is played.
 *
 * WHICH TERMINAL. A terminal-scale score says a decided ending lies on the
 * principal line; it does not say which. The re-search observes the first
 * two plies itself (the plan's own turn and the opponent's best reply), so a
 * game that ends there is labelled from its `Reason` exactly. A deeper one is
 * INFERRED: a kill-clock terminal carries full scale past the forced
 * hand-offs only when the root reading is `proven-*` (`eval/evaluate.ts
 * decidedCc`), and on a kill-free line it lands on the clock's last hand-off,
 * ply `reading.r`; so a deeper loss at exactly that ply under a proven
 * reading is labelled `proven-clock-loss`, anything else `mate`. The label
 * can be wrong only where a home or elimination loss lands on that very ply;
 * the veto itself cannot (both are proofs of loss), and `detail` says whether
 * the reason was observed or inferred.
 *
 * PURITY. Like every module in this directory: no module state; the scratch
 * is the caller's (`search/root.ts` owns the plan scratch), and each call
 * charges what it replays to `PlanScratch.work`.
 */
import { DEAD, MATE_PLY_CC, MAX_SLOTS, Reason, Result, WIN_CC, type Centi, type PackedState, type Side } from '../types';
import { AKind, paKind, type KeepSetTable } from '../core/action';
import { copyState } from '../core/state';
import { TurnFlag, type Turn } from '../gen/turn';
import type { ClockReading } from './clock';
import { clockPliesLeft } from './killeta';
import { actDamages, forward, killEtaOn, type PlanScratch } from './plan';
import type { ClockReadingCore, StrategyChronicle } from './types';

/** Why a candidate is, or is not, plan-consistent (the first clause that
 * decided it). */
export type ConsistencyWhy =
  | 'injected'
  | 'damaging-attack'
  | 'enemy-killeta-exceeds-r'
  | 'no-damaging-attack'
  | 'contains-kill'
  | 'enemy-kill-not-ruled-out'
  | 'illegal'
  | 'no-posture';

export interface Consistency {
  consistent: boolean;
  why: ConsistencyWhy;
}

/** Live units `side` has on `p`. */
function liveCount(p: PackedState, side: Side): number {
  let n = 0;
  for (let slot = 0; slot < MAX_SLOTS; slot++) if (p.sq[slot] !== DEAD && p.owner[slot] === side) n++;
  return n;
}

/** The length of `turn`'s Act prefix: its actions before the first
 * `END_ACTION` (every action when the turn has none). */
export function actLength(turn: Turn): number {
  for (let i = 0; i < turn.count; i++) if (paKind(turn.actions[i]) === AKind.END_ACTION) return i;
  return turn.count;
}

/**
 * Plays `turn` from `root` on the scratch's line board, forward only, with the
 * turn's own upkeep choice (`gen/turn.ts keepForTurn`'s rule: a turn that pays
 * upkeep owns its keep mask). False when the replica refuses an action.
 */
function replayTurn(s: PlanScratch, root: PackedState, turn: Turn): boolean {
  copyState(s.line, root);
  const keep: KeepSetTable | undefined = turn.keepMask === undefined ? undefined : { masks: turn.keepMask, count: 1 };
  for (let i = 0; i < turn.count; i++) if (!forward(s, s.line, turn.actions[i], keep)) return false;
  return true;
}

/**
 * Whether `turn`, a candidate at `root` (`reading.side` to move), serves the
 * posture's plan (module doc, question 1). `injected` says the candidate's end
 * key is one of the injected plan lines' (`strategy/types.ts InjectedPlan`),
 * which settles it at once. Charges its replays and `killEta` to `s.work`.
 */
export function planConsistency(
  root: PackedState,
  reading: ClockReading,
  turn: Turn,
  injected: boolean,
  s: PlanScratch,
): Consistency {
  if (reading.posture === 'none') return { consistent: false, why: 'no-posture' };
  if (injected) return { consistent: true, why: 'injected' };
  s.rec = null;
  if (reading.posture === 'force-contact') {
    const act = turn.actions.subarray(0, actLength(turn));
    return actDamages(s, root, act) ? { consistent: true, why: 'damaging-attack' } : { consistent: false, why: 'no-damaging-attack' };
  }
  const opp = (1 - reading.side) as Side;
  if ((turn.flags & TurnFlag.KILL) !== 0) return { consistent: false, why: 'contains-kill' };
  if (!replayTurn(s, root, turn)) return { consistent: false, why: 'illegal' };
  // The flag is the generator's claim; the count is the fact. A kill of ours
  // is the only way an enemy unit leaves the board during our own turn (our
  // upkeep releases only our units; enemy arrivals resolve at its turn start).
  if (liveCount(s.line, opp) < liveCount(root, opp)) return { consistent: false, why: 'contains-kill' };
  const left = clockPliesLeft(s.line);
  const eta = killEtaOn(s, s.line, opp, left).plies;
  return eta > left ? { consistent: true, why: 'enemy-killeta-exceeds-r' } : { consistent: false, why: 'enemy-kill-not-ruled-out' };
}

/**
 * The magnitude from which a score is TERMINAL-SCALE: a decided ending on the
 * principal line, not an evaluation. DERIVED (`eval/evaluate.ts terminalScore`:
 * a decided position scores `±(WIN_CC − ply · MATE_PLY_CC)` with `ply` below
 * the search's `maxPly`, so every mate-scale score is at least this; the
 * largest non-terminal score is `BOUNDED_CLOCK_CC = WIN_CC / 8`, far below,
 * and it is deliberately NOT terminal-scale — a bounded clock-out is not a
 * proof).
 */
export function terminalLossThreshold(maxPly: number): Centi {
  return WIN_CC - maxPly * MATE_PLY_CC;
}

/** The veto's four reasons (`StrategyChronicle.veto.reason`): `mate` and
 * `proven-clock-loss` for a plan line that walks into a decided loss,
 * `forgone-win` for one that passes up the tactical best's decided win,
 * `essential-lost` for a broken contract. */
export type VetoReason = NonNullable<StrategyChronicle['veto']>['reason'];

/** What the re-search found (`search/veto.ts`). */
export interface VetoEvidence {
  /** The plan candidate's full-window re-searched score, root's view. */
  planScoreCc: Centi;
  /** Iterative deepening's own best score at its last completed depth. */
  tacticalScoreCc: Centi;
  /** `terminalLossThreshold(s.maxPly)`. */
  thresholdCc: Centi;
  /** `Reason` of a game the re-search saw end on the plan's line within its
   * first two plies (the plan's turn, the best reply) against the root
   * side, or `null` when the line was still running there. */
  observedReason: number | null;
  reading: Pick<ClockReadingCore, 'verdict' | 'r'>;
  /** Essential slots dead after the opponent's best reply, ascending. */
  essentialLost: readonly number[];
}

/**
 * The veto rule (module doc, question 2). `null` means PLAY THE PLAN. A
 * terminal proof outranks a lost essential; material never enters.
 */
export function vetoVerdict(e: VetoEvidence): { reason: VetoReason; detail: string } | null {
  const planLost = e.planScoreCc <= -e.thresholdCc;
  const bestLost = e.tacticalScoreCc <= -e.thresholdCc;
  if (planLost && !bestLost) {
    const ply = Math.round((WIN_CC + e.planScoreCc) / MATE_PLY_CC);
    let reason: VetoReason;
    let how: string;
    if (e.observedReason !== null) {
      reason = e.observedReason === Reason.KILL_CLOCK ? 'proven-clock-loss' : 'mate';
      how = `observed (reason ${e.observedReason})`;
    } else {
      const proven = e.reading.verdict === 'proven-win' || e.reading.verdict === 'proven-loss';
      reason = proven && ply === e.reading.r ? 'proven-clock-loss' : 'mate';
      how = 'inferred';
    }
    return {
      reason,
      detail: `plan line scores ${e.planScoreCc} (a loss at ply ${ply}, ${how}) against the tactical best's ${e.tacticalScoreCc}`,
    };
  }
  // The mirror image of the same proof: the tactical best DECIDES the game in
  // our favour inside the horizon and the plan line does not. Terminal-scale
  // worse all the same — a Hold that walks past a forced elimination, say —
  // and reported as `forgone-win`, so `mate` keeps meaning a decided loss.
  const planWon = e.planScoreCc >= e.thresholdCc;
  const bestWon = e.tacticalScoreCc >= e.thresholdCc;
  if (bestWon && !planWon) {
    const ply = Math.round((WIN_CC - e.tacticalScoreCc) / MATE_PLY_CC);
    return {
      reason: 'forgone-win',
      detail: `the tactical best scores ${e.tacticalScoreCc} (a decided win at ply ${ply}) and the plan line ${e.planScoreCc}, not a win`,
    };
  }
  if (e.essentialLost.length > 0) {
    return {
      reason: 'essential-lost',
      detail: `essential slot(s) ${e.essentialLost.join(',')} dead after the opponent's best reply (plan ${e.planScoreCc}, tactical best ${e.tacticalScoreCc})`,
    };
  }
  return null;
}

/** The `Reason` (`types.ts`) of a game `side` has lost on `p`, or `null` while
 * it runs, on a draw and on a win. */
export function lossReason(p: PackedState, side: Side): number | null {
  if (p.result === Result.ONGOING || p.result === Result.DRAW) return null;
  const whiteWon = p.result === Result.WHITE_WIN;
  return whiteWon === (side === 0) ? null : p.reason;
}

/** The slots of `essential` whose unit is gone on `p`: dead, or the slot
 * reused by a later arrival (`types.ts PackedState.ord`: a slot is a handle,
 * the birth sequence is the identity). `ord` is the root's `ord` row. */
export function deadEssentials(p: PackedState, essential: readonly number[], ord: Int32Array): number[] {
  const out: number[] = [];
  for (const slot of essential) if (p.sq[slot] === DEAD || p.ord[slot] !== ord[slot]) out.push(slot);
  return out;
}
