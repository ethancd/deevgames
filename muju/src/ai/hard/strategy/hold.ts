/**
 * STRATEGOS W1.9 — Hold: the plan lines a root offers when the clock reading
 * says it is WINNING the kill clock (`posture: 'hold'`; plan
 * `~/.claude/plans/can-you-respond-to-piped-book.md`, Part B.1's `hold.ts`
 * row, Part A items 1-2, step W1.9).
 *
 * WHY HOLD. A side ahead on the clock wins at the hand-off that reaches
 * `INACTIVITY_LIMIT` — unless a unit dies first, because ANY kill resets the
 * clock (`core/state.ts makeEndPlace`, `progress`). So what it must deny the
 * opponent is a kill, any kill, until the clock runs out: the end predicate
 * is "the enemy's killETA exceeds the plies left at every hand-off"
 * (`PlanEndPredicate 'enemy-killeta-exceeds-r'`), and what it may spend is
 * nothing (`permittedLoss {units: 0, crystals: 0}`).
 *
 * THE LINES (each a `strategy/plan.ts PlanLine`, forced into the ROOT
 * candidate list through `gen/generate.ts setStrategyWitness`):
 *
 *   (a) RETREAT — every unit of ours that stands inside the enemy's next-Act
 *       strike area AND can be killed there next turn (the root tables'
 *       `exposure[me]` and `killActions`, exactly `gen/generate.ts
 *       injectRetreat`'s test — a body the enemy reaches but cannot kill is
 *       no threat to a contract whose only clause is "no kill") moves to the
 *       nearest square outside that area, preferring the better paying cell,
 *       within the turn's shared action budget: ONE combined Act line, most
 *       expensive unit first. (`injectRetreat` moves only the single most
 *       valuable body; a Hold has to move all it can.)
 *   (b) BREAK A CLEAVE CHAIN — the enemy unit whose best Cleave chain
 *       (`tables/kill.ts cleavePlan`, `muju-phasing-4`'s uncapped chain)
 *       kills two or more of ours; one of those victims moves (at most
 *       `CLEAVE_DESTINATIONS` nearest squares tried, safe squares first) to
 *       the square that leaves that chain the fewest kills. Offered only when
 *       it strictly reduces them.
 *   (c) PASS — `END_ACTION` at once and a bare Prepare. Always offered: it is
 *       the Hold's baseline, and it is injection 1's own pass line, so the
 *       generator merges the two (`offerForced`'s dedupe) rather than adding a
 *       candidate.
 *
 * FEASIBILITY — WHAT IS AND IS NOT FORCED. `killEta` is a SOUND lower bound
 * (`strategy/killeta.ts`): if, on the position a line's turn reaches, the
 * enemy's `killEta` exceeds the plies left there (`clockPliesLeft`), then in
 * EVERY legal continuation by both sides — ours included — no unit of ours is
 * killed before the kill clock ends the game. That clause, and only that
 * clause, is `forced`. NOT forced: the clock outcome itself (it also needs
 * the mined-total lead to hold — `clock.ts`'s verdict grade says how strong
 * that is — and no home or elimination ending first); our OWN kills (a kill
 * we make resets the clock too, and nothing here stops the search choosing
 * one; W1.10's veto is where "a free kill is suppressed under Hold" lives).
 * When the enemy's `killEta` does not exceed the plies left the bound cannot
 * say either way, and the line is `unknown` — a lower bound at or below `r`
 * rules nothing in.
 *
 * KILLETA BEFORE AND AFTER. Every non-pass line is offered only when the
 * enemy's `killEta` after it is at least the enemy's `killEta` after passing,
 * read on the same post-turn convention (`strategy/contact.ts` explains why
 * the root's own reading is on a different one). A retreat that moved a body
 * toward some other enemy unit can lower the relaxed bound; such a line is
 * dropped rather than offered as a Hold.
 *
 * ESSENTIAL SLOTS (`holdEssentialSlots`): every live unit of ours whose
 * remaining stay-put mining is inside the lead's margin — if it died, our
 * floor less its share would no longer beat the opponent's ceiling
 * (`L_me − share ≤ U_opp`; a tie is a draw, not a win). Its share is
 * `ledger.ts`'s per-unit closed form, `min(mine · minings, reserve)`.
 */
import { DEAD, F_CAN_ACT, MAX_SLOTS, NO_SLOT, Result, type PackedState, type Side } from '../types';
import { AKind, paMake } from '../core/action';
import { activeCatalog, type Catalog } from '../core/catalog';
import { ACTIONS_PER_TURN, copyState } from '../core/state';
import { ADJ_LIST } from '../core/tables';
import { bbHas } from '../core/bits';
import { moveCost } from '../core/movement';
import { cleavePlan } from '../tables/kill';
import type { NodeTables } from '../tables/context';
import type { ClockReading } from './clock';
import { clockPliesLeft } from './killeta';
import {
  NO_ACTIONS,
  WORK_MAKE,
  WORK_ROW,
  cellYield,
  endKeyOf,
  forward,
  killEtaOn,
  lexLess,
  playLine,
  powerOf,
  sqName,
  type PlanLine,
  type PlanScratch,
  type PlanSet,
} from './plan';
import type { AnalysisQuery, Feasibility, PlanContract } from './types';

/**
 * Destinations tried per chain victim. CHOICE (each costs a make, an unmake
 * and a `cleavePlan`; the nearest squares are where a one-square step breaks a
 * chain; falsifier: a root whose only chain-breaking square for its victim
 * ranks beyond the twelfth by safety, then distance).
 */
export const CLEAVE_DESTINATIONS = 12;

/** The enemy `killEta` query's result (`AnalysisQuery.result`). */
export interface HoldEtaResult {
  /** The enemy's `killEta` on the position the line's turn reaches. */
  plies: number;
  /** `clockPliesLeft` there: the plies a kill could still come in. */
  left: number;
}

/** Live units of `reading.side` whose loss would cost the clock win (module
 * doc, "Essential slots"), ascending by slot. */
export function holdEssentialSlots(root: PackedState, reading: ClockReading, cat: Catalog = activeCatalog()): number[] {
  const me = reading.side;
  const opp = (1 - me) as Side;
  const L = reading.ledger.sides[me].L.value;
  const U = reading.ledger.sides[opp].U.value;
  const n = reading.ledger.sides[me].minings;
  const out: number[] = [];
  for (let slot = 0; slot < MAX_SLOTS; slot++) {
    if (root.sq[slot] === DEAD || root.owner[slot] !== me) continue;
    const def = root.defId[slot];
    const whole = cat.mine[def] * n;
    const reserve = root.reserve[root.sq[slot]];
    const share = whole < reserve ? whole : reserve;
    if (L - share <= U) out.push(slot);
  }
  return out;
}

/** (a) The combined retreat Act, most expensive exposed unit first. */
function retreatAct(s: PlanScratch, root: PackedState, t: NodeTables): { act: Int32Array; label: string } | null {
  const cat = s.cat;
  const me = root.side as Side;
  const exposure = t.exposure[me];
  const order: number[] = [];
  for (let u = 0; u < MAX_SLOTS; u++) {
    if (root.sq[u] === DEAD || root.owner[u] !== me) continue;
    if (!bbHas(exposure, root.sq[u]) || t.killActions[u] > ACTIONS_PER_TURN) continue;
    order.push(u);
  }
  order.sort((a, b) => cat.cost[root.defId[b]] - cat.cost[root.defId[a]] || a - b);
  const p = s.line;
  copyState(p, root);
  const moves: number[] = [];
  const parts: string[] = [];
  for (const u of order) {
    if (p.actions <= 0) break;
    const spd = cat.spd[p.defId[u]];
    if (spd <= 0 || (p.uflags[u] & F_CAN_ACT) === 0) continue;
    const row = s.rep.dist.get(p, p.sq[u]);
    s.work += WORK_ROW;
    let best = -1;
    let bestKey: number[] = [];
    for (let q = 0; q < 100; q++) {
      const c = moveCost(row, q, spd);
      if (c <= 0 || c > p.actions || bbHas(exposure, q)) continue;
      const key = [c, -cellYield(cat, p, p.defId[u], q), q];
      if (best < 0 || lexLess(key, bestKey)) {
        best = q;
        bestKey = key;
      }
    }
    if (best < 0) continue;
    const a = paMake(AKind.MOVE, u, best, bestKey[0]);
    if (!forward(s, p, a)) continue;
    moves.push(a);
    parts.push(`u${u}->${sqName(best)}`);
  }
  return moves.length > 0 ? { act: Int32Array.from(moves), label: `hold:retreat(${parts.join(',')})` } : null;
}

/** (b) One victim stepped out of the enemy's best chain, when that helps. */
function breakChainAct(s: PlanScratch, root: PackedState, t: NodeTables): { act: Int32Array; label: string } | null {
  const cat = s.cat;
  const me = root.side as Side;
  const plan = s.cleave;
  let enemy = -1;
  let enemyKey: number[] = [];
  let chainSq = -1;
  let chainKills = 0;
  for (let e = 0; e < MAX_SLOTS; e++) {
    if (root.sq[e] === DEAD || root.owner[e] === me) continue;
    cleavePlan(root, s.kill, e, s.killSc, 0, plan);
    s.work += WORK_ROW;
    if (plan.kills < 2) continue;
    const key = [-plan.kills, -plan.valueCc, e];
    if (enemy < 0 || lexLess(key, enemyKey)) {
      enemy = e;
      enemyKey = key;
      chainSq = plan.square;
      chainKills = plan.kills;
    }
  }
  if (enemy < 0 || root.actions <= 0) return null;
  const victims: number[] = [];
  for (let k = 0; k < 4; k++) {
    const n = ADJ_LIST[chainSq * 4 + k];
    if (n < 0) continue;
    const v = root.pieceAt[n];
    if (v === NO_SLOT || root.owner[v] !== me) continue;
    if (powerOf(cat, root, enemy, v) < cat.def[root.defId[v]] - root.damage[v]) continue;
    victims.push(v);
  }
  victims.sort((a, b) => cat.cost[root.defId[b]] - cat.cost[root.defId[a]] || a - b);
  const exposure = t.exposure[me];
  const p = s.line;
  copyState(p, root);
  s.undo.top = 0;
  s.rep.resetUndoScratch();
  let best = -1;
  let bestKey: number[] = [];
  for (const v of victims) {
    const spd = cat.spd[p.defId[v]];
    if (spd <= 0 || (p.uflags[v] & F_CAN_ACT) === 0) continue;
    s.rowC.set(s.rep.dist.get(p, p.sq[v]));
    s.work += WORK_ROW;
    const dests: Array<[number, number, number, number]> = [];
    for (let q = 0; q < 100; q++) {
      const c = moveCost(s.rowC, q, spd);
      if (c <= 0 || c > p.actions) continue;
      dests.push([bbHas(exposure, q) ? 1 : 0, c, -cellYield(cat, p, p.defId[v], q), q]);
    }
    dests.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || a[3] - b[3]);
    for (let i = 0; i < dests.length && i < CLEAVE_DESTINATIONS; i++) {
      const [unsafe, c, negYield, q] = dests[i];
      const a = paMake(AKind.MOVE, v, q, c);
      if (!s.rep.isLegal(p, a)) continue;
      s.rep.make(p, a, s.undo);
      cleavePlan(p, s.kill, enemy, s.killSc, 0, plan);
      s.rep.unmake(p, s.undo);
      s.work += 2 * WORK_MAKE + WORK_ROW;
      const key = [plan.kills, plan.valueCc, unsafe, c, negYield, v, q];
      if (best < 0 || lexLess(key, bestKey)) {
        best = a;
        bestKey = key;
      }
    }
  }
  s.undo.top = 0;
  s.rep.resetUndoScratch();
  if (best < 0 || bestKey[0] >= chainKills) return null;
  const v = bestKey[5];
  return { act: Int32Array.of(best), label: `hold:break-chain(u${v}->${sqName(bestKey[6])} vs u${enemy})` };
}

/**
 * The Hold plan set for the root `root` (the side to move is the one WINNING
 * the clock; `reading` is its `clockReading`). `t` is the root's own
 * `NodeTables`, `s` the caller's scratch; `s.work` is reset here and returned
 * as `PlanSet.work`. Only an Act root (`phase 1`, no bill pending) has lines;
 * any other root, or a posture other than `hold`, gets an empty set.
 */
export function holdPlans(root: PackedState, t: NodeTables, reading: ClockReading, s: PlanScratch): PlanSet {
  s.work = 0;
  const queries: AnalysisQuery[] = [];
  if (reading.posture !== 'hold' || root.result !== Result.ONGOING || root.phase !== 1 || root.upkeepPending === 1) {
    return { posture: reading.posture, lines: [], queries, work: s.work };
  }
  const opp = (1 - root.side) as Side;
  const contract: PlanContract = {
    kind: 'hold',
    permittedLoss: { units: 0, crystals: 0 },
    essentialSlots: holdEssentialSlots(root, reading, s.cat),
    deadlinePly: reading.r,
    endPredicate: 'enemy-killeta-exceeds-r',
  };
  const drafts: Array<{ act: Int32Array; label: string }> = [{ act: NO_ACTIONS, label: 'hold:pass' }];
  const retreat = retreatAct(s, root, t);
  if (retreat !== null) drafts.push(retreat);
  const chain = breakChainAct(s, root, t);
  if (chain !== null) drafts.push(chain);

  const lines: PlanLine[] = [];
  const seen = new Set<string>();
  let passEta = -1;
  for (const d of drafts) {
    const start = s.work;
    if (!playLine(root, t, { act: d.act, prep: NO_ACTIONS }, s)) continue;
    const endKey = endKeyOf(s.line);
    if (seen.has(endKey)) continue;
    const left = clockPliesLeft(s.line);
    const eta = killEtaOn(s, s.line, opp, left).plies;
    const q: AnalysisQuery<HoldEtaResult> = {
      name: 'hold.enemyKillEta',
      workCost: s.work - start,
      outcome: eta > left ? 'witnessed' : 'unresolved',
      result: { plies: eta, left },
    };
    queries.push(q);
    if (passEta < 0) passEta = eta;
    else if (eta < passEta) continue;
    seen.add(endKey);
    const feasibility: Feasibility = eta > left ? 'forced' : 'unknown';
    lines.push({ act: d.act, prep: NO_ACTIONS, contract, endKey, label: d.label, feasibility, queries: [q] });
  }
  return { posture: reading.posture, lines, queries, work: s.work };
}
