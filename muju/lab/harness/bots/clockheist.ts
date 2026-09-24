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
 *      (`state.inactivityPlies`) at RETREAT_CLOCK or more ("the lock"): split
 *      by unit. A unit standing inside an enemy strike area retreats, to the
 *      safest reachable square outside every strike area (farthest from the
 *      nearest enemy unit) and, among equally safe squares, the richest. A
 *      unit already outside every enemy strike area keeps mining: it stays on
 *      its cell unless one legal MOVE reaches a cell that pays it STRICTLY
 *      more, is ALSO outside every enemy strike area, and does not reduce its
 *      distance to the nearest enemy ("not toward the enemy") — OR (W1.12
 *      FINAL, below) the spawn rectangle is tight and stepping off, even for
 *      no richness gain, provably widens it. Passing is what
 *      is left once no unit has such a move. No attacks: an
 *      attack that KILLS would reset this bot's own clock lead
 *      (`src/game/inactivity.ts`'s doc comment: only an attack that removes a
 *      unit resets the counter), so once the lead is close to paying off,
 *      touching the enemy at all is the one thing that can undo it.
 *
 *      W1.12 FOLLOW-UP (the coordinator's step brief, "ClockHeist hold
 *      economics", after the W1.12 review): the original lock retreated
 *      threatened units by distance alone and froze every OTHER unit (any
 *      MOVE by a safe unit scored like a pass), so a locked unit whose cell
 *      had mined out (`src/game/mining.ts endOfTurnIncome` subtracts each take
 *      from `cell.resourceLayers`) could never move to a fresher one. The
 *      split above is the brief's fix. MEASURED EFFECT (2026-09-24 review,
 *      exact replays of both p1-dev calibration rounds, `hard@desktop`
 *      fixed:60000, Black handicaps 0-20, seeds 20260977 and 20260991): none.
 *      The pre-follow-up lock replays all 96 games identically (winner,
 *      plies, both mined totals): in them a safe locked unit never had a
 *      strictly fresher cell that was also out of every strike area and not
 *      toward the enemy, and no retreat had a richness tie to break.
 *      What does keep ClockHeist from holding a handicap lead in those games
 *      is its spawn area. Its units sit on the rich cells of its home spawn
 *      block, which pay for several turns; the unlocked branch never moves a
 *      unit off a paying cell and the lock only for a strictly richer, safe,
 *      not-toward-the-enemy one, so the spawn rectangle (`src/game/spawning.ts`:
 *      home corner to each own unit) stays full and the Place phase has no
 *      legal square to buy on. As Black it bought 1.0-2.0 units in turns 1-4
 *      against the engine's 5.5-6.5, its unspent bank at the end rose from
 *      17 to 41 as the handicap rose from 0 to 20, and its own mining fell
 *      (44.5 at handicap 8, 35-36 at 16 and 20). That is not a Place-phase
 *      droning question: at that point there is nothing to buy on.
 *
 *      W1.12 FINAL (this lane, "ClockHeist3", the coordinator's diagnosis from
 *      commit c6bb8a8e's message and this module's own comment: SPAWN
 *      CLOGGING). Neither the unlocked branch (item 2: a paying unit's MOVE
 *      always scored -1) nor the lock (item 1: a safe unit needed a STRICTLY
 *      fresher destination) ever moved a unit off a cell that still paid, so
 *      ClockHeist's own units filled its home spawn rectangle
 *      (`src/game/spawning.ts getSpawnRectangle`: home corner to an anchor
 *      unit) and the Place phase ran out of empty squares in it to buy on —
 *      confirmed on the initial position itself: White's three starting units
 *      (`getStartingPositions`) already reduce the spawn zone to exactly one
 *      square, (0,0), and a single buy there empties it to zero.
 *
 *      Fix (`declogScore`, `wouldOpenSpawnRoom`, `spawnRoom`): a unit standing
 *      on a still-paying cell may now ALSO step to a cell that pays it
 *      something (not necessarily more), when three things hold — (a) safe:
 *      the destination is outside every enemy strike area, the same bound as
 *      the lock's own retreat (`enemyReach`); (b) needed: the CURRENT total
 *      spawn room (`getAllSpawnPositions` over every one of the player's own
 *      units as a candidate anchor, RULE `src/game/spawning.ts`) is at or
 *      below `SPAWN_ROOM_FLOOR`; (c) it actually helps: replaying the move
 *      through the real spawning rules (not a distance heuristic) shows a
 *      STRICTLY larger total spawn room afterward. (c) is what makes this
 *      exact rather than a guess — a "wider-looking" box that a currently
 *      standing enemy unit blocks (`hasEnemyInRectangle`) contributes nothing,
 *      and the recount catches that, where a heuristic (e.g. "farther from
 *      home") would not. Deliberately NOT gated on "not toward the enemy"
 *      (unlike the lock's richness-chase branch, item 1): that check compares
 *      distance to the nearest enemy UNIT, and with an enemy sitting near its
 *      own home corner — the common case at kickoff — Manhattan distance to
 *      it shrinks for almost any outward step from ClockHeist's OWN home
 *      corner, which would veto the very decongestion this fix exists to
 *      make. Safety alone (a) plus the exact widen proof (c) are the review's
 *      bound and the plan's "so the Place phase always has legal buy
 *      squares"; direction is not separately asserted.
 *
 *      Priority: strictly-fresher (existing) outranks a same-or-less-paying
 *      declog step (CHOICE, tier 200 vs 500 — see `declogScore`'s own doc
 *      comment), which outranks nothing. In the unlocked branch this bypasses
 *      `withPassiveEconomy` (see `chooseFrom`): that wrapper's mining-delta
 *      term prices a yield trade-down as a loss and could zero out exactly
 *      the move this fix adds, the same reason the lock already bypasses it
 *      (this module's own comment on `lockedScore`).
 *
 *      MEASURED EFFECT (2026-09-24, this lane's calibration round 1 — the
 *      shipped `SPAWN_ROOM_FLOOR = 3` — MUJU_HEAVY_SLOTS=4 hard:ladder,
 *      p1-dev, `hard@desktop` fixed:60000, seed 20260976, handicaps 0-20 step
 *      4, 12 openings x 2 seats per handicap, 144 games, 0 failures): the
 *      diagnosed symptom is fixed. ClockHeist's turns-1-4 buys rose from the
 *      review's 1.0-2.0 to 4.42-7.17 across handicap x seat cells (desktop's
 *      own range there is 5.50-12.17 — the two are now the same order of
 *      magnitude, not 3-6x apart), and its whole-game buy count from roughly
 *      flat to 6.83-14.33 (still below desktop's 15.25-30.83). The clock
 *      outcome did not flip: desktop still wins 133 of 144 games (92.4%; 64
 *      of 72 with ClockHeist as Black receiving the handicap, 69 of 72 with
 *      ClockHeist as White receiving none), all but a handful of the wins by
 *      `kill-clock` adjudication — i.e. desktop simply out-mines ClockHeist by
 *      game end at a roughly stable ~2-2.5x ratio at every tested handicap,
 *      handicap does not narrow it monotonically (ClockHeist's best showing,
 *      3 of 12, is at handicap 0; its worst, 0 of 12, at handicap 16), and
 *      unspent bank stays substantial throughout (14.4-51.0). A second round
 *      raised `SPAWN_ROOM_FLOOR` to 10 (see that constant's own doc comment
 *      for the full numbers) on the hypothesis that a bigger standing buffer
 *      would sustain buying further past turn 4; it did not measurably help
 *      (whole-game buys and the win column were flat-to-slightly-worse), so
 *      the floor stayed at 3 rather than being changed without evidence.
 *      The lane's own reading was that the remaining gap is per-turn
 *      income/placement quality (no promotions, first-qualifying-cell moves).
 *      The review below replaces it.
 *
 *      W1.12 FINAL REVIEW (2026-09-24, adversarial review of this lane; the
 *      numbers are recomputed from calib-1/calib-2 `games.jsonl`, and the
 *      traces come from an exact re-run of calib-1's first 12 pairs, 24 of 24
 *      games identical, with replays on). Verdict: rework. The clock outcome
 *      is decided by kills, not by the income ratio:
 *        - With desktop as White and ClockHeist as Black holding the handicap,
 *          desktop drew first blood in 57 of 72 games (58 of 72 in calib-2).
 *          In at least 53 of them (55 in calib-2) desktop was BEHIND on mined
 *          total when it did, with a median deficit of 21 (23). This count
 *          credits White's whole opening income, which makes it conservative.
 *          Desktop won every game that had a kill. All 8 of ClockHeist's wins
 *          in this seat (5 in calib-2) came from the 14 (12) kill-free games.
 *          The kills come from one raider (fire_2, lightning_2, fire_1)
 *          parked beside ClockHeist's home cluster. It picks off units that
 *          cannot answer, such as plant_1 with attack 0. Each kill resets the
 *          clock, and desktop's wider economy then overtakes. So the premise
 *          that desktop does not attack is false against this bot. Desktop's
 *          search takes a one-turn kill when a clock loss is within its
 *          horizon. What wave 1 showed was that Hard does not PLAN contact
 *          that takes more than one turn.
 *        - The fix did not stop the spawn clog after turn 4. In the 24 re-run
 *          games, 82 of ClockHeist's 180 Place phases had zero legal buy
 *          squares while it held at least 3 crystals. Of its buys, 46% (634
 *          of 1388 in calib-1) were metal_1, which has speed 0 (RULE
 *          `src/game/movement.ts canMove`), so it can never step off the spawn
 *          square it lands on. `declogScore` also needs a destination outside
 *          every enemy strike area. Once a few desktop pieces are out, no
 *          such square exists, so no declog move is ever taken.
 *        - Undeclared behaviour change: before this lane, the unlocked branch
 *          DID move a unit on a paying cell to a strictly richer one, through
 *          `withPassiveEconomy`'s `delta * 45` term (-1 + 45 x delta > 0). The
 *          earlier diagnosis, "the unlocked branch never moves a unit off a
 *          paying cell", missed this. `finalScore` now bypasses that wrapper
 *          for any unit on a paying cell. The effect: with a plant_1 on a
 *          yield-1 cell next to a yield-3 cell, spawn room 35 and clock 0,
 *          18669c3b moves the unit and this version passes.
 *        - Same 24 games with the 18669c3b bot: desktop 21, ClockHeist 2,
 *          1 draw (this version: 21-3). With desktop as White, 11 of 12 of
 *          those games were kill-free and lost narrowly on mined total. This
 *          version has 3 of 12 kill-free. The early buying traded a narrow
 *          clog loss for a raid loss. Two single-change variants on the same
 *          24 games did not help: never buying speed-0 units went 20-4, and
 *          restoring the richness step went 24-0.
 *
 *   2. Otherwise: buy cheap (tier 1) miners ("drone"), relocate idle units to
 *      rich cells on the flank corner away from the enemy's approach line
 *      ("expand"), step a still-mining unit off a spawn square when the spawn
 *      rectangle is tight (W1.12 FINAL, above), and take a free kill (never a
 *      trade) ONLY while strictly behind on mined total, and only when the
 *      attacker is not left inside a surviving enemy's strike area. The Place
 *      phase always runs this branch, locked lead or not: a purchase never
 *      touches the enemy (an arrival is inert until its owner's next turn, and
 *      `withPassiveEconomy` already charges a square any enemy can reach), and
 *      a clock lead is held by out-mining, so "pass" in plan B.1 is the
 *      Action-phase posture, not a buying freeze.
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
 * A8 HANDICAP RECOMMENDATION (this lane's step 5, from the W1.12 FINAL
 * calibration above): R0 (`hard@desktop` vs ClockHeist) and R1
 * (`hard@strategos` vs ClockHeist) should both run the full swept set,
 * handicaps 0/4/8/12/16/20, seat-mirrored — the same set this lane
 * calibrated on, not a narrowed one. Reasons: (1) no single handicap in this
 * range is qualitatively different for ClockHeist post-fix — its win share
 * against `hard@desktop` ranges 0-3 of 12 per handicap x seat cell with no
 * monotonic trend (best at handicap 0, worst at 16), so narrowing to
 * "the best handicap" would cherry-pick noise, not a real regime change; (2)
 * R0's own bar is "documents the failure", and the honest document is that
 * `hard@desktop` wins the clock at every tested handicap (133 of 144 games,
 * 92.4%) — ClockHeist post-fix is a real improvement over pre-fix but is not
 * yet a strong enough clock-holder on its own to reproduce wave-1's
 * LLM-vs-Hard result, and R0 across the full set is what shows that plainly
 * rather than at one cherry-picked point; (3) R1's bar (score > 0.5, LOS >=
 * 95%) is a comparison to `hard@desktop`'s OWN showing here, so running it on
 * the identical set is what makes "did strategos's clock-awareness fix this"
 * a same-conditions question, not a different-conditions one. If box time
 * forces a narrower R1, handicaps 0 and 20 (the two ends of the calibrated
 * range, both showing ClockHeist's least-bad rate at floor=3) are the
 * pair to keep.
 *
 * Review note (W1.12 FINAL REVIEW, above): this recommendation assumes R0
 * measures the clock failure seen in wave 1. Against this version it would
 * not. In the desktop=White seat, every lost game follows a one-turn desktop
 * kill that resets the clock, so R0 would record desktop raiding a passive
 * miner. Choosing handicaps is premature until the coordinator decides
 * whether ClockHeist must deny one-turn kills while it is ahead.
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
 * like the same opponent to every row that cites it. The plan freezes the name
 * at amendment A8 ("freeze it before A8, rename (ClockHeist-v2) on any
 * change").
 *
 * FROZEN (W1.12 FINAL, this lane): this commit is the freeze point. Ladder
 * output recorded before it (the original lock, the W1.12 follow-up's split)
 * is from earlier behaviour under the same name — amendment A8's rows
 * (R0 `hard@desktop` vs ClockHeist, R1 `hard@strategos` vs ClockHeist) are the
 * first to run against THIS behaviour, and cite it as the frozen `ClockHeist`.
 * Any further change to this bot's decisions, from here on, ships as a new
 * bot, `ClockHeist-v2`, alongside this one — never as a silent edit to this
 * file. Review note: the W1.12 final review returned rework, so this freeze
 * holds only if the coordinator accepts this behaviour as is. If a rework
 * lands before A8, that later commit is the freeze point.
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
import { getAllSpawnPositions } from '../../../src/game/spawning';
import type { AIAction } from '../../../src/ai/types';
import type { Position, Unit } from '../../../src/game/types';
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
 * CHOICE: how many empty buyable squares (`spawnRoom`, below) ClockHeist
 * tries to keep in reserve before spending an Action-phase move on
 * decongestion rather than a richness chase or a pass. Low enough that the
 * many-units, big-rectangle positions already covered by the existing tests
 * (rooms in the 10s-20s) never trigger it, and low enough to fire on the
 * initial position's spawn zone (exactly one square, `getStartingPositions`)
 * on the very first Action phase.
 *
 * MEASURED (W1.12 FINAL calibration round 2, this lane, p1-dev, `hard@desktop`
 * fixed:60000, seed 20260976, 6 handicaps x 2 seats x 12 pairs): raising this
 * to 10 was tried as the falsifier this comment originally named. Turns 1-4
 * buys moved a little (up at several handicaps, e.g. handicap 12 desktop=White
 * 5.25 -> 8.92, handicap 20 6.58 -> 9.00; flat at others, e.g. handicap 4
 * 6.08 -> 6.75), but the whole-game buy gap against desktop and the win
 * column did not improve -- if anything a shade worse (desktop's win share
 * per handicap x seat cell went from 9-12 of 12 to 10-12 of 12) and unspent
 * bank at game end stayed in the same 8-52 range either way. So the bind
 * past the first few turns is not spawn-square SUPPLY (this fix's whole
 * scope): `hard@desktop` buys roughly double ClockHeist's whole-game total
 * (mean 15-38 vs 7-16 across handicaps, calib-1) even though both buy almost
 * entirely tier-1 units, which points at a per-turn income/placement-quality
 * gap outside this lane (ClockHeist never promotes and picks the first
 * reachable paying cell each ply, not a globally best one) -- left at 3, the
 * simpler and equally-effective value, and recorded here rather than
 * re-opened without new evidence. (Review correction, module header "W1.12
 * FINAL REVIEW": spawn-square supply IS still binding after turn 4. The floor
 * cannot fix it, because immobile metal_1 buys fill the squares and the
 * strike-area gate vetoes every declog destination.) Falsifier for a FUTURE lane: a ladder row
 * where a different floor (or a room target that also accounts for bank
 * size) buys measurably more of the WHOLE-game total, not just turns 1-4.
 */
const SPAWN_ROOM_FLOOR = 3;

/** Every currently-empty square this player could legally buy on, across
 * every one of its own units as a candidate anchor (RULE
 * `src/game/spawning.ts getAllSpawnPositions`: the union of each unblocked
 * anchor's home-corner rectangle). The Place phase's entire legal BUY_UNIT
 * set is exactly this, so its size is literally "room to buy." */
function spawnRoom(view: BotView): number {
  return getAllSpawnPositions(view.player, view.board).length;
}

/**
 * Would relocating `unit` to `to` leave this player with STRICTLY more total
 * spawn room than it has right now? Recomputed through the real spawning
 * rules on a hypothetical board (`getAllSpawnPositions` before vs. after),
 * not a distance heuristic: a box that widens on paper but that a currently
 * standing enemy unit blocks (`hasEnemyInRectangle`, inside
 * `getSpawnRectangle`'s callers) contributes zero new squares, so the recount
 * catches it where "farther from home" alone would not. See `declogScore`'s
 * doc comment for why this is the only "outward" test this fix uses.
 */
function wouldOpenSpawnRoom(view: BotView, unit: Unit, to: Position): boolean {
  const before = spawnRoom(view);
  const movedBoard = { ...view.board, units: view.board.units.map(u => u.id === unit.id ? { ...u, position: to } : u) };
  const after = getAllSpawnPositions(view.player, movedBoard).length;
  return after > before;
}

/**
 * W1.12 FINAL: should a unit already standing on a paying cell step to
 * `to` (which also pays `yieldAt`, checked by both callers before this runs)
 * purely to relieve a clogged spawn rectangle? Module doc comment has the
 * full diagnosis and falsifier; this is the shared predicate/score both
 * `lockedScore` (the safe-unit branch) and the unlocked switch's MOVE case
 * call, so there is exactly one definition of "declog."
 *
 * Gated on:
 *   - safe: `to` is outside every enemy strike area (`enemyReach`'s bound —
 *     RULE, the same one `lockedScore`'s retreat uses);
 *   - needed: `spawnRoom` is at or below `SPAWN_ROOM_FLOOR` — a unit with
 *     rooms to spare (every position the pre-existing tests authored) never
 *     bothers;
 *   - proven: `wouldOpenSpawnRoom` — an exact recount, not a guess.
 *
 * Deliberately NOT gated on "not toward the enemy" (unlike the strictly-
 * fresher branch above it, which this never overrides — see the caller):
 * that check is Manhattan distance to the nearest enemy UNIT, and an enemy
 * sitting anywhere near its OWN home corner (routine at kickoff, opposite
 * ClockHeist's own corner on the board's main diagonal, `getStartCorner`)
 * is far enough along BOTH axes that almost any outward step from
 * ClockHeist's own corner shortens the Manhattan distance to it — the check
 * would veto the very decongestion this exists to perform. Safety
 * (`inEnemyStrikeArea`, a real next-turn-reach bound) plus the exact widen
 * proof are what the review called for; a live enemy's current square is not
 * an extra veto here.
 *
 * CHOICE (score tier 200 + yieldAt, capped near 208 since mining tops out at
 * 8 same as the lock's richness tier): below a genuine richness upgrade
 * (500 +) so an outright better cell is still preferred when both are legal
 * this ply, above zero so it beats a pass. Falsifier: a ladder row where
 * ranking a declog step ABOVE a richness upgrade buys measurably more
 * miners in turns 1-4.
 */
function declogScore(view: BotView, unit: Unit, to: Position, yieldAt: number): number {
  if (inEnemyStrikeArea(view, to)) return -1;
  if (spawnRoom(view) > SPAWN_ROOM_FLOOR) return -1;
  if (!wouldOpenSpawnRoom(view, unit, to)) return -1;
  return 200 + yieldAt;
}

/**
 * Locked-lead mode deliberately bypasses `withPassiveEconomy`, the pairing
 * with `chooseFrom` that every other archetype in this directory uses. For a
 * MOVE that wrapper adds two terms (`bot-utils.ts`): the mining delta x 45,
 * which this scorer replaces with its own yield ranking
 * (`wouldYieldAt`/`miningYieldAt` below), and a spawn-disruption bonus
 * (`disruptedByMove`: the move makes a paid enemy arrival's square invalid),
 * which it drops on purpose — blocking an arrival means standing in the
 * enemy's spawn rectangle, the contact the lock exists to avoid. (Its
 * unsafe-square penalty is BUY_UNIT-only and never applies in the Action
 * phase.) Every non-MOVE action (ATTACK, END_ACTION_PHASE) scores -1: see the
 * module doc comment for why attacks stay banned while the lead is locked in.
 *
 * Two disjoint cases, by where THIS action's unit currently stands
 * (`unit.position`, not the destination):
 *
 *   - Inside an enemy strike area (in danger): only a destination that is
 *     ALSO out of every enemy strike area counts as an improvement (plan
 *     B.1's "retreat"). Among those, safest first — farther from the nearest
 *     enemy is harder to be threatened again once the enemy advances — richest
 *     only as the tie-break (the follow-up brief: "to the safest square, then
 *     the richest"). "Nearest enemy" is `nearestEnemyDistance`, units on the
 *     board only: paid arrivals decide safety (`inEnemyStrikeArea`) but not
 *     this ranking, and with no enemy unit on the board every safe square
 *     ties at Infinity and the rng picks one. DERIVED (lexicographic order):
 *     the x 1000 on distance keeps safety dominant because a yield is at most
 *     8 (the largest `mining` stat, `src/game/units.ts`), so no richness term
 *     can outweigh one square of distance. CHOICE (safety before richness, as
 *     the brief orders it; falsifier: a ladder row where a richest-safe-square
 *     order keeps ClockHeist's lead measurably more often than this one).
 *   - Outside every enemy strike area (already safe): the unit keeps mining.
 *     A destination that steps INTO an enemy strike area is never worth it
 *     (safety is not for sale). A destination that reduces the distance to
 *     the nearest enemy is rejected for a richness chase, even if it is safe
 *     and richer (the follow-up brief: "not toward the enemy"): the strike
 *     area covers the enemy's next turn only, and a unit that closes the
 *     distance today is the one the enemy reaches the turn after. A STRICT
 *     improvement in yield over staying put, not toward the enemy, wins
 *     outright (`destYield > miningYieldAt(...) && !towardEnemy`, 500 tier).
 *     Short of that (same-or-worse yield, or toward the enemy, but the
 *     destination still pays something), `declogScore` (W1.12 FINAL, its own
 *     doc comment) gets one more look: it may still be worth stepping off a
 *     paying, mined-out-adjacent cell purely to relieve a clogged spawn
 *     rectangle, at a lower (200) tier — a unit on a cell that has mined out
 *     (`src/game/mining.ts`) or that is simply in the way has somewhere
 *     legal to go either way.
 *
 * CHOICE (score tiers, not magnitudes): any retreat (1_000_000 + ...) outranks
 * any richness relocation (500 + yield, at most 508), which outranks a declog
 * step (200 + yield, at most 208, W1.12 FINAL), and all three outrank a pass
 * (-1, then `chooseLocked` ends the phase), so a threatened unit always moves
 * before a safe one spends the shared action budget (the bot re-scores after
 * every action, so a relocation played because no retreat existed can still
 * open one). Falsifier: a ladder row where spending the last action on income
 * before safety keeps ClockHeist's lead measurably more often.
 */
function lockedScore(view: BotView, a: AIAction): number {
  if (a.type !== 'MOVE') return -1;
  const unit = unitById(view, a.unitId);
  if (!unit) return -1;
  const destSafe = !inEnemyStrikeArea(view, a.to);
  if (inEnemyStrikeArea(view, unit.position)) {
    if (!destSafe) return -1; // still exposed: not an improvement
    return 1_000_000 + nearestEnemyDistance(view, a.to) * 1000 + wouldYieldAt(view, unit.definitionId, a.to);
  }
  if (!destSafe) return -1; // never walk a safe unit INTO reach
  const destYield = wouldYieldAt(view, unit.definitionId, a.to);
  if (destYield <= 0) return -1; // never move to a cell that doesn't pay at all
  const towardEnemy = nearestEnemyDistance(view, a.to) < nearestEnemyDistance(view, unit.position);
  if (destYield > miningYieldAt(view, unit) && !towardEnemy) return 500 + destYield; // strictly fresher: unchanged
  // W1.12 FINAL: no richness gain (or moving toward the enemy) — still worth
  // a step if the spawn rectangle is clogged and this specific move relieves
  // it (`declogScore`'s own doc comment has the full gate and falsifier).
  return declogScore(view, unit, a.to, destYield);
}

function chooseLocked(ctx: BotContext): AIAction | null {
  const best = pickBest(ctx.rng, ctx.legal, a => lockedScore(ctx.view, a));
  if (best === undefined || lockedScore(ctx.view, best) <= 0) return phaseEndAction(ctx.view.state);
  return best;
}

/**
 * W1.12 FINAL: a still-paying unit's own MOVE bypasses `withPassiveEconomy`
 * (like `lockedScore` already does for the whole lock, and for the same
 * reason, per that function's doc comment). That wrapper's mining-delta term
 * prices any yield decrease as a loss (`delta * 45`, `bot-utils.ts`) and can
 * swing by hundreds — enough to zero out or invert the modest 200s-tier
 * `declogScore` returns, defeating a move whose entire point is trading yield
 * for spawn room. Every other action keeps the wrapper unchanged.
 */
function finalScore(view: BotView, a: AIAction, scorer: (a: AIAction) => number): number {
  if (a.type === 'MOVE') {
    const unit = unitById(view, a.unitId);
    if (unit && miningYieldAt(view, unit) > 0) return scorer(a);
  }
  return withPassiveEconomy(view, a, scorer(a));
}

function chooseFrom(ctx: BotContext, scorer: (a: AIAction) => number): AIAction | null {
  const best = pickBest(ctx.rng, ctx.legal, a => finalScore(ctx.view, a, scorer));
  if (!best) return null;
  if (finalScore(ctx.view, best, scorer) <= 0) {
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
      if (view.phase === 'action' && mine > theirs && clock >= RETREAT_CLOCK) return chooseLocked(ctx);

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
            const yieldAt = wouldYieldAt(view, unit.definitionId, m.to);
            if (yieldAt <= 0) return -1; // never move to a cell that doesn't pay at all
            if (miningYieldAt(view, unit) > 0) {
              // W1.12 FINAL: already on a paying cell -- only worth leaving to
              // declog the spawn rectangle (`declogScore`'s own doc comment);
              // this bypasses withPassiveEconomy (`finalScore`, above).
              return declogScore(view, unit, m.to, yieldAt);
            }
            // Idle: rich, flank-ward, enemy-avoiding cells score highest.
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
