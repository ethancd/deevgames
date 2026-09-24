/**
 * ClockHeist — the ladder's kill-clock failure detector (STRATEGOS Workflow 1,
 * W1.12: `~/.claude/plans/can-you-respond-to-piped-book.md` Part B.1, Part
 * B.1b "ClockHeist's ladder identity is its name alone; freeze it before A8,
 * rename (ClockHeist-v2) on any change").
 *
 * WHY THIS BOT EXISTS. None of Rush/Balanced/Expand/AIEngineV2 ever plays FOR
 * the kill clock (the STRATEGOS plan's Context: 0 clock games measured
 * against them in the p3 retune's Stage A) — so no ladder row against them can
 * show whether an engine holds or projects a mined-total lead under the kill
 * clock (`src/game/inactivity.ts`). ClockHeist is the opponent that actually
 * tries to win the clock: it drones a cheap economy, expands to an
 * uncontested flank instead of massing at the front, takes a kill only when
 * that kill helps it (it is behind on mined total), and once it is ahead and
 * the kill-free clock has run a few plies, it stops touching the enemy and
 * waits the clock out while it keeps mining.
 *
 * BEHAVIOUR (plan B.1), in priority order:
 *   1. Action phase, ahead on mined total AND the kill-free clock
 *      (`state.inactivityPlies`) at RETREAT_CLOCK or more: retreat every unit
 *      standing in an enemy strike area to a square outside all of them, and
 *      otherwise pass. No attacks and no relocations: an attack that KILLS
 *      would reset this bot's own clock lead (`src/game/inactivity.ts`'s doc
 *      comment: only an attack that removes a unit resets the counter), so
 *      once the lead is close to paying off, touching the enemy at all is the
 *      one thing that can undo it.
 *   2. Otherwise: buy cheap (tier 1) miners ("drone"), relocate idle units to
 *      rich cells on the flank corner away from the enemy's approach line
 *      ("expand"), and take a free kill (never a trade) ONLY while strictly
 *      behind on mined total, and only when the attacker is not left inside a
 *      surviving enemy's strike area. The Place phase always runs this branch,
 *      locked lead or not: a purchase never touches the enemy (an arrival is
 *      inert until its owner's next turn, and `withPassiveEconomy` already
 *      charges a square any enemy can reach), and a clock lead is held by
 *      out-mining, so "pass" in plan B.1 is the Action-phase posture, not a
 *      buying freeze.
 *
 * AHEAD AND BEHIND are the raw `minedTotal` comparison the plan names
 * (`src/game/inactivity.ts`), read only in the Action phase, the only phase
 * whose moves and attacks the posture governs. Income is taken at
 * END_ACTION_PHASE (RULE `src/game/turn.ts endTurn`), so at White's Action
 * phase both sides have taken the same number of incomes and the comparison is
 * like for like; at Black's, White has taken one more, so Black reads itself
 * one income step worse than a like-for-like count would — it locks later and
 * kills sooner. CHOICE (why: simple, and conservative about the lock, whose
 * cost is lost relocations). Falsifier: a like-for-like count (Black credited
 * one step of `projectedIncome`, `src/game/mining.ts`) scoring at least as
 * well against the same scripted bots; measured 2026-09-24 in the W1.12 review
 * (p1-val, 16 openings x 2 seats, scores of 32) it scored lower against every
 * one: Expand 14.5 vs 18, Balanced 10.5 vs 14.5, Turtle 13 vs 16.5, Greedy
 * 4.5 vs 9, Rush 0 vs 2.5.
 *
 * NAME. Exactly `ClockHeist`, chosen in particular to NOT match
 * `/AntiRush|Guard/`. Grepping that pattern (it appears once, in
 * `lab/harness/runner.ts`'s upkeep handling) finds: a bot whose name matches
 * it gets `defaultUpkeepAction(state, true)` — the `homeFirst` argument true,
 * upkeep resolved HOME-unit-first — instead of the default cost-descending order
 * every other scripted bot gets (`src/game/upkeep.ts#defaultUpkeepAction`).
 * That is a defensive-turtle's upkeep priority: AntiRush and the `Guard:`
 * home-policy family (`lab/experiments/home-policies.ts`) want their
 * front-line home units kept over whatever a strict cost ordering would
 * fell. ClockHeist is not that bot — it drones and flanks AWAY from home — so
 * it takes the ordinary cost-descending order, and the name is chosen so it
 * never accidentally picks up the other order by matching the regex.
 *
 * Per plan B.1b, THIS NAME IS THE BOT'S LADDER IDENTITY: a scripted engine's
 * ladder `configHash` is `scripted:<name>` and its resolved configuration is
 * `{engine: 'scripted', bot: <name>}` (`lab/hard-ai/ladder/engines.ts
 * scriptedEngine`, `lab/hard-ai/ladder/identity.ts`) — no byte of this file
 * reaches either. A behaviour change under the same name would therefore look
 * like the same opponent to every row that cites it, so any change to what
 * ClockHeist does after this lane must ship as a new bot, `ClockHeist-v2`,
 * alongside this one — never as a silent edit to this file.
 *
 * REUSE. Only `lab/harness/bots/bot-utils.ts` and the same game-rule
 * primitives every other archetype in this directory already imports
 * (`archetypes.ts`, `probes.ts`) — no new shared helper added to
 * `bot-utils.ts` for this step.
 */
import { getUnitDefinition } from '../../../src/game/units';
import { manhattanDistance } from '../../../src/game/board';
import { phaseEndAction } from '../../../src/game/legality';
import { minedTotal } from '../../../src/game/inactivity';
import { getActionsPerTurn } from '../../../src/game/rules';
import type { AIAction } from '../../../src/ai/types';
import type { Position } from '../../../src/game/types';
import type { ScriptedBot, BotContext, BotView } from '../types';
import { pickBest } from '../rng';
import {
  unitById,
  defenderAt,
  attackKills,
  unitCost,
  miningYieldAt,
  nearestEnemyDistance,
  enemyCorner,
  enemyUnits,
  withPassiveEconomy,
} from './bot-utils';

/**
 * DERIVED (plan Part B.1: "when ahead at clock >= 3 retreat out of reach and
 * pass"). `state.inactivityPlies` counts kill-free plies toward
 * `INACTIVITY_LIMIT` (`src/game/inactivity.ts`); once it reaches this value
 * while ClockHeist is ahead on mined total, the bot stops touching the enemy
 * and locks the lead in instead. The counter starts at 0 with the game, so in a
 * kill-free game this threshold is already met from ply 3 on.
 */
const RETREAT_CLOCK = 3;

/**
 * How far an enemy piece can strike on its next turn: DERIVED from the rules,
 * the same area the engine calls a strike area (`src/ai/hard/tables/threat.ts
 * strikeArea`, DESIGN §5.1, `STRIKE_MOVE_ACTIONS` = 3 at four actions). A
 * piece may spend any number of the turn's shared actions moving (RULE
 * `src/game/movement.ts canMove`: "Units can move multiple times per turn"),
 * each MOVE covering up to `speed` tiles (RULE `getValidMoves`), and must keep
 * one action for an attack on an ADJACENT square (RULE `src/game/combat.ts
 * getValidAttacks`; there is no ranged attack). So a piece whose owner has
 * `actions` actions reaches Manhattan distance speed × (actions − 1) + 1.
 *
 * Measured on the empty board, this is a sound over-approximation for every
 * existing enemy unit and every paid enemy arrival (`inEnemyStrikeArea`
 * includes both): blockers can only lengthen a real path, a promotion bought in
 * the enemy's next Place phase cannot act before the turn after, and a kill
 * never moves its attacker. So a square outside it cannot be attacked on the
 * enemy's next turn — which is what "retreat out of reach" and "a free kill"
 * promise (plan B.1).
 *
 * It covers most of a 10×10 board once a few enemy pieces are out, so in
 * practice most free kills are declined and most retreats become passes. A
 * one-move reach (speed + 1, no arrivals) was measured against it in the W1.12
 * review (2026-09-24, p1-val, 16 openings x 2 seats, every other rule as here,
 * scores of 32): level against Expand (18), Turtle (16.5) and Greedy (9), and
 * 15.5 vs 14.5 against Balanced and 3 vs 2.5 against Rush — no evidence that
 * the smaller, unsound area buys strength.
 */
function enemyReach(definitionId: string, actions: number): number {
  return getUnitDefinition(definitionId).speed * (actions - 1) + 1;
}

/** `excludeId` drops one enemy from consideration — the target a candidate
 * ATTACK would itself remove from the board before it could ever strike back.
 * The opponent's paid pending arrivals count: they act on its next turn
 * (`bot-utils.ts safeCommitSquares` treats them as movers for the same reason). */
function inEnemyStrikeArea(view: BotView, pos: Position, excludeId?: string): boolean {
  const actions = getActionsPerTurn(view.state);
  const strikers = [
    ...enemyUnits(view),
    ...view.pendingSummons.filter(s => s.owner === view.opponent),
  ];
  return strikers.some(e => e.id !== excludeId &&
    manhattanDistance(e.position, pos) <= enemyReach(e.definitionId, actions));
}

/**
 * DERIVED (`src/game/board.ts getStartCorner`: both home corners sit on the
 * board's main diagonal, (0,0) and (9,9)). Swapping home's own y onto the
 * enemy corner's x lands on one of the OTHER two corners of the board — off
 * the direct home-to-home diagonal, so mining there keeps distance from the
 * enemy's most natural approach. White's flank is (9,0); black's is the
 * point-symmetric mirror (0,9).
 */
function flankCorner(view: BotView): Position {
  const home = view.me.startCorner;
  const enemy = enemyCorner(view);
  return { x: enemy.x, y: home.y };
}

function wouldYieldAt(view: BotView, definitionId: string, pos: Position): number {
  const cell = view.board.cells[pos.y]?.[pos.x];
  if (!cell || cell.resourceLayers === 0) return 0;
  return Math.min(getUnitDefinition(definitionId).mining, cell.resourceLayers);
}

/**
 * Retreat mode deliberately bypasses `withPassiveEconomy`: mining deltas and
 * the spawn-disruption bonus are exactly the economic upside a locked-in
 * clock lead must not chase mid-flight, so every action but a genuine escape
 * move scores -1 here, full stop — the ordinary `chooseFrom`
 * (+ `withPassiveEconomy`) pairing every other archetype in this directory
 * uses is not reused for this branch.
 */
function retreatScore(view: BotView, a: AIAction): number {
  if (a.type !== 'MOVE') return -1; // no attacks while locking in a lead
  const unit = unitById(view, a.unitId);
  if (!unit) return -1;
  if (!inEnemyStrikeArea(view, unit.position)) return -1; // already out of reach: nothing to do
  if (inEnemyStrikeArea(view, a.to)) return -1; // would still be exposed: not an improvement
  return 200 + nearestEnemyDistance(view, a.to);
}

function chooseRetreat(ctx: BotContext): AIAction | null {
  const best = pickBest(ctx.rng, ctx.legal, a => retreatScore(ctx.view, a));
  if (best === undefined || retreatScore(ctx.view, best) <= 0) return phaseEndAction(ctx.view.state);
  return best;
}

function chooseFrom(ctx: BotContext, scorer: (a: AIAction) => number): AIAction | null {
  const best = pickBest(ctx.rng, ctx.legal, a => withPassiveEconomy(ctx.view, a, scorer(a)));
  if (!best) return null;
  if (withPassiveEconomy(ctx.view, best, scorer(best)) <= 0) {
    return phaseEndAction(ctx.view.state);
  }
  return best;
}

/**
 * ClockHeist. See the module doc comment for the full behaviour and the
 * name/regex note. Pure function of `ctx` (view/legal/rng): no module-level
 * mutable state, so the same seed always plays the same game.
 */
export function createClockHeistBot(): ScriptedBot {
  return {
    kind: 'scripted',
    name: 'ClockHeist',
    chooseAction(ctx: BotContext) {
      const { view } = ctx;
      const mine = minedTotal(view.state, view.player);
      const theirs = minedTotal(view.state, view.opponent);
      const clock = view.state.inactivityPlies ?? 0;
      if (view.phase === 'action' && mine > theirs && clock >= RETREAT_CLOCK) return chooseRetreat(ctx);

      const flank = flankCorner(view);
      return chooseFrom(ctx, (a) => {
        switch (a.type) {
          case 'ATTACK': {
            if (mine >= theirs) return -1; // free kills only while behind on the clock (plan B.1)
            const at = a as Extract<AIAction, { type: 'ATTACK' }>;
            const attacker = unitById(view, at.unitId);
            const target = defenderAt(view, at.targetPosition);
            if (!attacker || !target) return -1;
            if (!attackKills(view, attacker, at.targetPosition)) return -1; // never a trade
            if (inEnemyStrikeArea(view, attacker.position, target.id)) return -1; // stays exposed
            return 900 + unitCost(target) * 10;
          }
          case 'MOVE': {
            const m = a as Extract<AIAction, { type: 'MOVE' }>;
            const unit = unitById(view, m.unitId);
            if (!unit) return -1;
            if (miningYieldAt(view, unit) > 0) return -1; // already on a paying cell
            const yieldAt = wouldYieldAt(view, unit.definitionId, m.to);
            if (yieldAt <= 0) return -1;
            // Rich, flank-ward, enemy-avoiding cells score highest.
            return 50 + yieldAt * 10 - manhattanDistance(m.to, flank) * 2 +
              Math.min(nearestEnemyDistance(view, m.to), 10);
          }
          case 'PROMOTE_UNIT':
            return -1; // a drone-and-flank economy never commits crystals to one unit
          case 'BUY_UNIT': {
            const q = a as Extract<AIAction, { type: 'BUY_UNIT' }>;
            const def = getUnitDefinition(q.definitionId);
            // CHOICE: "cheap miners" means tier 1 with a mining stat — the
            // drone never buys a fighter or a tier 2+ economy unit, so its
            // buys never compete with a kill for the same crystals.
            // Falsifier: a ladder row where refusing every tier 2+ miner
            // costs ClockHeist the mined-total race it exists to test.
            if (def.tier !== 1 || def.mining <= 0) return -1;
            return 300 + def.mining * 20 - def.cost * 5;
          }
          default:
            return 0;
        }
      });
    },
  };
}
