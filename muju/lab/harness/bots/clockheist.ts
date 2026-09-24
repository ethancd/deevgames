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
 *      W1.12 FINAL FIX (this lane's rework round, responding to the review's
 *      blocker issue 1 and majors 2/3/4). The review named three coordinator
 *      options for issue 1 and asked which to take: (a) replace the
 *      empty-board bound with an exact next-turn-kill test; (b) allow a
 *      defensive kill of a unit that threatens one of ours; (c) buy mobile
 *      miners that can defend themselves. No live coordinator answer was
 *      available mid-round, so this round implements (a) and (b) together —
 *      the two that are code-level and directly testable — plus a bounded
 *      version of (c), and records the result rather than assuming success:
 *        - (a) `strikerReachSquares`/`inEnemyStrikeArea` now compute each
 *          enemy's real next-turn reach through `getMovementRange` (blockers
 *          respected) instead of the Manhattan formula `speed*(actions-1)+1`,
 *          for every safety check in the file (retreat, declog, both free-kill
 *          exposure vetoes). It can only ever be TIGHTER than the old bound
 *          (same budget, real geometry can only lengthen a path), so nothing
 *          that was genuinely safe before reads as unsafe now, and nothing
 *          that was genuinely unsafe reads as safe. `tests/lab/clockheist.test.ts`
 *          pins one case where this matters: a free-kill survivor at the
 *          exact old Manhattan boundary, blocked by one of our own units, now
 *          reads as unable to reach the attacker (the old bound could not see
 *          this at all).
 *        - (b) `chooseDefensiveKill` (new): checked before either
 *          `chooseLocked` or `chooseFrom` run, in both phases and both
 *          postures — a one-hit, never-a-trade kill on any enemy unit that
 *          could itself kill one of ours next turn (`threatensOneOfOurs`,
 *          reusing the same reach computation), gated the same way every
 *          other kill in this file is (never leaves the attacker exposed to a
 *          survivor). This is the one place the ahead/locked posture no
 *          longer forbids every ATTACK — rationale: "the clock resets either
 *          way" (whichever side lands the next kill, `inactivityPlies` resets
 *          to 0, `src/game/inactivity.ts`), so declining a kill that only
 *          delays being killed buys nothing and costs a unit. Three new
 *          authored-position tests pin it (fires when ahead and locked;
 *          declines when the threat cannot actually kill; declines when the
 *          attacker would stay exposed to a survivor), each verified to fail
 *          against this round's own STARTING point (1d74f543/ae294099, which
 *          has no such function — `chooseLocked` scores every non-MOVE -1
 *          unconditionally, confirmed by reading that revision directly).
 *        - Bounded (c): `BUY_UNIT` now refuses a speed-0 miner (`metal_1`)
 *          specifically WHEN spawn room is already at `SPAWN_ROOM_FLOOR` — the
 *          review's issue 3 (46% of buys were `metal_1`, permanently sealing
 *          a scarce square, RULE `src/game/movement.ts canMove`: speed 0 never
 *          moves). `plant_1` ties it exactly on cost and mining (RULE
 *          `src/game/units.ts`), so this is a free, equally-affordable swap,
 *          not a downgrade — a gate, not the review's own tested outright ban
 *          (`nometal.patch`, tried alone, "did not help" on 24 games), because
 *          it is combined with (a)+(b) here and because an outright ban would
 *          cost `chooseDefensiveKill` one of its few units with a positive
 *          attack stat when room is not actually scarce. Pinned by two new
 *          tests (room at the floor: never `metal_1`; room well clear: still a
 *          legal, ungated buy) and a mutation check (removing the gate turns
 *          the first test red with this exact seed and scenario, confirmed).
 *
 *      MEASURED (this lane's calibration round 3, the last of the three the
 *      lane is allowed — MUJU_HEAVY_SLOTS=4 hard:ladder, p1-dev, seed
 *      20260976, same command as rounds 1-2, 144 games, 0 failures): the
 *      blocker is NOT resolved. Desktop still wins 134 of 144 (93.1%,
 *      calib-1 was 133/144, calib-2 134/144 — statistically the same). In the
 *      desktop=White seat, desktop still draws first blood in 58 of 72 games
 *      (the review's calib-1 count was 57 of 72) and was behind on mined
 *      total in 51 of those 52 white-first-blood games when it did (the
 *      review's count: 53 of 57) — both essentially unchanged. Desktop still
 *      wins every game with any kill in it (58/58 in this seat, 89/89
 *      overall); every one of ClockHeist's 10 wins is from a kill-free game.
 *      A small diagnostic replay slice (4 pairs, handicap 0, replays on,
 *      `trace-mini/`, not counted against the 3-round budget — the same kind
 *      of side probe the review's own `repro-12` etc. were) shows the
 *      defensive kill DOES fire in real games, not just the authored tests:
 *      three of the four desktop=White games there include a `CH kills` event
 *      (turns 5, 6, 7, 10) that could not happen under the pre-round bot. But
 *      in the SAME games desktop's raider still lands its own first kill
 *      earlier (as early as turn 2 in one game) — before ClockHeist has any
 *      unit adjacent to retaliate with — and once that happens the clock
 *      reset plus desktop's search/economy advantage decides the game
 *      regardless of ClockHeist's later, successful retaliation. So (a)+(b)
 *      make ClockHeist strictly more correct (it retaliates against a real,
 *      provable threat instead of never fighting back) without making it
 *      meaningfully harder to raid: a scripted, per-turn-greedy defender that
 *      only reacts once a unit is ALREADY killable cannot deny a raider's
 *      FIRST approach, only punish it after the fact, and the clock has
 *      already reset by then. This confirms the review's own suspicion
 *      (issue 1: "cannot be met under the rules the coordinator pinned") for
 *      the tried combination. Untried here: a genuine anticipatory guard (kill
 *      ETA against a unit that is not YET adjacent but will be next turn,
 *      which needs a real search over the enemy's possible approaches, not a
 *      one-ply reach check) — closer to option (c) in full, and a larger
 *      change than this round's scope. Left for a future lane or for the
 *      coordinator to weigh against accepting R0's revised meaning (below).
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
 * A8 HANDICAP RECOMMENDATION (this lane's step 5, updated after the rework
 * round's calibration, above — supersedes the pre-rework recommendation this
 * paragraph used to make; the numbers below are round 3's, the last this lane
 * may run). Run the full swept set, handicaps 0/4/8/12/16/20, seat-mirrored,
 * for BOTH R0 and R1, unchanged from the original recommendation — but with
 * the review's caveat (below) now confirmed rather than open:
 *   (1) no single handicap is qualitatively different for ClockHeist even
 *       after this round's fix — its win share against `hard@desktop` is 0-3
 *       of 12 per handicap x seat cell in round 3, same range as rounds 1-2,
 *       with no monotonic trend — so narrowing to "the best handicap" would
 *       still cherry-pick noise, not a real regime change;
 *   (2) R0's own bar is "documents the failure" (plan B.1), and after three
 *       rounds of calibration and one rework attempt, the honest document is
 *       that `hard@desktop` beats this frozen ClockHeist at every tested
 *       handicap (134 of 144 games, 93.1%) almost entirely by winning the
 *       race to first blood, not by out-mining a passive opponent — see the
 *       review note below for what that means for R0's evidentiary value;
 *   (3) R1's bar (score > 0.5, LOS >= 95%) is a same-conditions comparison to
 *       `hard@desktop`'s OWN showing here, so running it on the identical set
 *       is what makes "did strategos's clock-awareness fix this" answerable at
 *       all — and now carries more weight than before the rework: if
 *       `hard@strategos` avoids resetting a clock it is LOSING (rather than
 *       taking every kill within reach, as `hard@desktop` does here regardless
 *       of the clock), R1 is where that difference would actually show up.
 * If box time forces a narrower R1, handicaps 0 and 20 (the two ends of the
 * calibrated range) remain the pair to keep.
 *
 * REVIEW NOTE, CONFIRMED (W1.12 FINAL REVIEW's blocker issue 1 and major
 * issue 2, now resolved by measurement rather than left open): the review
 * asked whether R0 measures the clock failure wave 1 showed (Hard never
 * PLANNING contact over several turns) or a different one (Hard taking an
 * easy one-turn raid on a passive miner). This round's rework tried the
 * review's options (a) exact reach and (b) a defensive-kill carve-out
 * together, specifically to close that gap, and the calibration above shows
 * it did not: desktop still draws first blood in 58 of 72 desktop=White
 * games (57 of 72 before the rework) and wins all of them. So R0 against
 * this frozen ClockHeist documents the SAME failure mode the review found,
 * not wave 1's: `hard@desktop` wins the clock here by successfully raiding an
 * opponent that can retaliate (confirmed: the defensive kill fires in real
 * games, per the round's diagnostic replay slice) but cannot PREVENT the
 * raider's first, decisive strike. That is a real and useful thing for R0 to
 * document — it shows this scripted bot's ceiling as a clock-holder without a
 * search-based defense — but it is not the same claim as wave 1's, and the
 * coordinator should read R0's numbers with that distinction attached rather
 * than as a restatement of the wave-1 finding. The three-round budget is
 * spent; a further attempt (the anticipatory guard sketched above, or
 * accepting this reading of R0 and moving to R1) is the coordinator's call.
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
 * FROZEN (W1.12 FINAL FIX, this rework round): this commit is the freeze
 * point, per the lane's own instruction to freeze here regardless of whether
 * the rework fully closed the review's blocker — it did not (see the
 * calibration and review note above); it is a verified, tested, mutation-
 * checked improvement (exact reach, a real defensive-kill carve-out, a
 * targeted immobile-buy gate) that leaves the aggregate ladder outcome
 * against `hard@desktop` statistically unchanged (134/144 here vs 133/144 and
 * 134/144 in the two earlier rounds). Ladder output recorded before this
 * commit (the original lock, the W1.12 follow-up's split, the pre-rework
 * W1.12 FINAL declog-only fix) is from earlier behaviour under the same
 * name — amendment A8's rows (R0 `hard@desktop` vs ClockHeist, R1
 * `hard@strategos` vs ClockHeist) are the first to run against THIS
 * behaviour, and cite it as the frozen `ClockHeist`. Any further change to
 * this bot's decisions, from here on, ships as a new bot, `ClockHeist-v2`,
 * alongside this one — never as a silent edit to this file. The three-round
 * calibration budget this lane was given is now spent; whether to spend a
 * future lane on the anticipatory guard sketched above, or to proceed to A8
 * with R0 read per the review note above, is the coordinator's decision, not
 * this file's.
 *
 * REUSE. Only `lab/harness/bots/bot-utils.ts` and the same game-rule
 * primitives every other archetype in this directory already imports
 * (`archetypes.ts`, `probes.ts`) — no new shared helper added to
 * `bot-utils.ts` for this step.
 */
import { getUnitDefinition } from '../../../src/game/units';
import { manhattanDistance, getAdjacentPositions } from '../../../src/game/board';
import { getMovementRange } from '../../../src/game/movement';
import { phaseEndAction } from '../../../src/game/legality';
import { minedTotal } from '../../../src/game/inactivity';
import { getActionsPerTurn } from '../../../src/game/rules';
import { getAllSpawnPositions } from '../../../src/game/spawning';
import type { AIAction } from '../../../src/ai/types';
import type { BoardState, GameState, Position, Unit } from '../../../src/game/types';
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
  myUnits,
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
 * W1.12 REWORK (this round, replacing the empty-board bound the review's
 * blocker issue 1 named): how far an enemy piece can ACTUALLY strike on its
 * next turn, respecting this exact board's blockers — option (a) from the
 * review's three. The previous bound (`speed * (actions - 1) + 1`, a
 * Manhattan-distance formula ignoring every unit on the board) was a sound
 * over-approximation but, per the review's traces, "covers almost the whole
 * board" once the enemy has a piece or two out near ClockHeist's own cluster,
 * so retreat and declog almost never found a destination there. This
 * recomputes the SAME budget (`speed` tiles per move, `actions - 1` moves,
 * RULE `src/game/movement.ts canMove`/`getValidMoves`, one action reserved for
 * an adjacent attack, RULE `src/game/combat.ts getValidAttacks`) through
 * `getMovementRange`, the rules' own pathfinder (RULE: it already refuses to
 * cross an occupied square, `reachable`'s callers). On a board with no
 * blockers between striker and target this equals the old bound exactly (both
 * are the taxicab ball of the same radius); with ClockHeist's OWN units
 * clustered near its corner, some squares behind them become genuinely
 * unreachable even though within Manhattan range, and only THIS test sees it.
 * It can never mark a real threat as safe (same budget, tighter geometry), so
 * every existing "stays because unsafe" test still holds and no new one is
 * needed to prove it does not undershoot: the test suite's own oracle
 * (`ruleStrikeSquares`, `tests/lab/clockheist.test.ts`) is now the same
 * computation, not an independent check of a heuristic.
 *
 * Cached per `(state, viewing player)` (`strikerReachCache`): `chooseAction`
 * calls into this dozens of times per ply (once per candidate MOVE/ATTACK per
 * own unit), and `getMovementRange` is a BFS over the 100-cell board per
 * striker, so memoizing the per-striker reach set once per decision keeps the
 * cost negligible next to the search work this file's opponents spend.
 *
 * MEASURED (falsifier for a future lane): a ladder row where this tightening
 * alone, without the defensive-kill amendment below, changes ClockHeist's win
 * share against `hard@desktop` — see the module header's W1.12 REWORK section
 * for the combined-effect numbers; the two were not measured in isolation
 * because the review's own diagnosis (issue 1) was that the bound alone does
 * not explain the losses once a raider is already adjacent to the cluster
 * (blockers are sparse there), and the defensive-kill amendment is what
 * targets that case.
 */
function posKey(p: Position): string {
  return `${p.x},${p.y}`;
}

/** One enemy unit's exact next-turn strike squares (see the function above):
 * everywhere it could stand after `actions - 1` MOVEs (`getMovementRange`,
 * blockers respected) dilated by one square (`getAdjacentPositions`, RULE:
 * attacks are adjacent-only). Speed-0 pieces (`metal_1`) never move, so their
 * only origin is their own square. */
function strikerReachSquares(board: BoardState, striker: { position: Position; definitionId: string }, actions: number): Set<string> {
  const speed = getUnitDefinition(striker.definitionId).speed;
  const origins = [striker.position, ...(speed > 0
    ? getMovementRange(striker.position, speed, actions - 1, board).map(r => r.position) : [])];
  const squares = new Set<string>();
  for (const o of origins) for (const t of getAdjacentPositions(o)) squares.add(posKey(t));
  return squares;
}

/** Per-state, per-viewing-player cache of every current striker's reach set
 * (`strikerReachSquares`), keyed by unit/arrival id. `view.state` is a fresh
 * object per ply (the harness never mutates it in place), so a `WeakMap` on it
 * never serves a stale board across turns. */
const strikerReachCache = new WeakMap<GameState, Map<string, Map<string, Set<string>>>>();

function strikerReachMap(view: BotView): Map<string, Set<string>> {
  let byPlayer = strikerReachCache.get(view.state);
  if (!byPlayer) { byPlayer = new Map(); strikerReachCache.set(view.state, byPlayer); }
  const cached = byPlayer.get(view.player);
  if (cached) return cached;
  const actions = getActionsPerTurn(view.state);
  const strikers = [
    ...enemyUnits(view),
    ...view.pendingSummons.filter(s => s.owner === view.opponent),
  ];
  const map = new Map<string, Set<string>>();
  for (const e of strikers) map.set(e.id, strikerReachSquares(view.board, e, actions));
  byPlayer.set(view.player, map);
  return map;
}

/** `excludeId` drops one enemy from consideration — the target a candidate
 * ATTACK would itself remove from the board before it could ever strike back.
 * The opponent's paid pending arrivals count: they act on its next turn
 * (`bot-utils.ts safeCommitSquares` treats them as movers for the same reason).
 *
 * W1.12 REWORK: with reach now board-dependent (blockers), `excludeId` must
 * also drop that unit as a BLOCKER, not just as a striker, or a surviving
 * enemy's path through the dying unit's own square reads as obstructed when
 * it will not be by the time that enemy actually moves (the target is dead by
 * then). This recomputes fresh on a board with `excludeId` filtered out
 * instead of reusing `strikerReachMap`'s cache (correct over cached: this path
 * only runs for the handful of ATTACK candidates each ply, never per
 * MOVE/declog destination, so the cache's whole reason to exist — dozens of
 * lookups per ply — does not apply here). Mirrors the test oracle's own
 * `afterKill` board exactly (`ruleStrikeSquares` there, `tests/lab/clockheist.test.ts`). */
function inEnemyStrikeArea(view: BotView, pos: Position, excludeId?: string): boolean {
  if (excludeId === undefined) {
    const k = posKey(pos);
    for (const [, squares] of strikerReachMap(view)) if (squares.has(k)) return true;
    return false;
  }
  const board: BoardState = { ...view.board, units: view.board.units.filter(u => u.id !== excludeId) };
  const actions = getActionsPerTurn(view.state);
  const strikers = [
    ...enemyUnits(view).filter(e => e.id !== excludeId),
    ...view.pendingSummons.filter(s => s.owner === view.opponent && s.id !== excludeId),
  ];
  const k = posKey(pos);
  return strikers.some(e => strikerReachSquares(board, e, actions).has(k));
}

/**
 * W1.12 REWORK (this round, option (b) from the review's blocker issue 1):
 * does this specific enemy `striker`, from where it stands right now, reach
 * (and so could kill) any ONE of our own units on ITS next turn? Same reach
 * set `inEnemyStrikeArea` already computed for this striker (`strikerReachMap`
 * — one definition of "reach," shared by retreat, declog and this), just
 * tested against our own units instead of a candidate destination. This is
 * what `chooseDefensiveKill` uses to allow killing a raider that is about to
 * kill one of ours, regardless of the ahead/behind posture below — see that
 * function's own doc comment for why.
 *
 * Reach alone is not enough: a unit that could reach one of ours but could
 * never actually KILL it (`attack === 0`, e.g. `plant_1` — the review's own
 * example of the raider's usual VICTIM, never its instrument) poses no real
 * threat, so `attackKills` gates this the same way it already gates every
 * other kill in this file. `attackKills(view, striker, u.position)` reuses
 * `bot-utils.ts`'s existing power-vs-defense math by pointing it at our own
 * unit's square — attack power and defense are unit-stat computations, not
 * position-dependent, so this is exactly "would `striker`'s hit kill `u`",
 * with no new combat-rule code in this file.
 */
function threatensOneOfOurs(view: BotView, striker: Unit): boolean {
  const squares = strikerReachMap(view).get(striker.id);
  if (!squares) return false;
  return myUnits(view).some(u => squares.has(posKey(u.position)) && attackKills(view, striker, u.position));
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
 * W1.12 REWORK (this round, review issue 4 — "the rework lane must decide it
 * deliberately and add a test either way"): pure extraction of the lock's own
 * richness-chase (`destYield > current && !towardEnemy`, byte-identical to
 * what `lockedScore` always did), used ONLY by `lockedScore` below. This
 * function is named here, rather than left inlined, so the DECISION this
 * comment records is attached to one place: DELIBERATELY NOT offering the
 * same richness chase to the unlocked "otherwise" branch, closing issue 4
 * with evidence rather than silence.
 *
 * Issue 4's history: before this lane (18669c3b), a paying unit's MOVE in the
 * unlocked branch went through `withPassiveEconomy`'s `delta * 45` term,
 * which chases ANY richer cell with no direction check at all. W1.12 FINAL
 * (ae294099) dropped that for a still-paying unit without saying so, which
 * the review caught. Two experiments since then agree it should STAY dropped:
 *   - The review's own: restoring `withPassiveEconomy`'s raw term measured
 *     24-0 against desktop on the 24-game subset (versus 21-3 without it) —
 *     worse, because that term has no "away from the enemy" guard at all.
 *   - This round's own, checking whether a SAFER version (this exact
 *     function — the lock's own away-from-enemy-gated richness chase, not the
 *     raw term) fares better if offered to the unlocked branch too: also
 *     measured 24-0 on the same subset (`probe-fix-24`, superseded by
 *     `probe-norichness-24` below), a full point worse than this round's
 *     shipped 22-2 with it withheld. Tracing the games showed why: offering
 *     richness-chasing to the unlocked branch makes ClockHeist buy AND
 *     relocate faster (units 9-12 by turn 4-6 versus 6-7 before), which
 *     sounds like the droning-and-expanding the plan wants, but it puts more
 *     units on the board sooner, on more scattered squares, which is exactly
 *     what feeds `hard@desktop`'s search more raid targets — the review's
 *     root cause (kills, not income ratio) gets WORSE, not better, from a
 *     bigger, faster, more spread-out economy.
 * DECISION (this round): keep ae294099's bypass. A paying unit in the
 * unlocked branch moves only to declog (`declogScore`), never to chase
 * richness, even under the safer, gated rule. Pinned by the new test "a
 * paying unit in the unlocked branch does not chase richness even when a
 * strictly richer, away-from-enemy cell is legal" (`tests/lab/clockheist.test.ts`).
 * Falsifier for a FUTURE lane: a ladder row on the FULL calibration set (not
 * just this 24-game subset, which the review's own prior experiments already
 * showed is small enough to flip on one game) where offering this richness
 * chase to the unlocked branch scores better than withholding it.
 */
function richnessScore(view: BotView, unit: Unit, to: Position, destYield: number): number {
  const towardEnemy = nearestEnemyDistance(view, to) < nearestEnemyDistance(view, unit.position);
  if (destYield > miningYieldAt(view, unit) && !towardEnemy) return 500 + destYield; // strictly fresher
  return declogScore(view, unit, to, destYield);
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
 * phase.) Every non-MOVE action (ATTACK, END_ACTION_PHASE) scores -1 here:
 * see the module doc comment for why an OPPORTUNISTIC attack stays banned
 * while the lead is locked in. (A DEFENSIVE kill — the review's issue 1,
 * option (b) — is checked once, before `chooseLocked` is ever called; see
 * `chooseDefensiveKill`'s doc comment. It never reaches this scorer.)
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
  // W1.12 REWORK: richness chase (strictly fresher, not toward the enemy),
  // then declog as a fallback — `richnessScore`'s own doc comment; this used
  // to be inlined here and is now shared with the unlocked branch verbatim.
  return richnessScore(view, unit, a.to, destYield);
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
 * W1.12 REWORK (this round, the review's blocker issue 1, option (b)): a
 * defensive kill — attacking a unit that could itself kill one of ours on ITS
 * next turn (`threatensOneOfOurs`) — regardless of the ahead/behind posture
 * everything else in this file reads. Checked FIRST, before either
 * `chooseLocked` or `chooseFrom` run, so it fires in both regimes: the
 * review's traces showed the raider kills landing almost entirely while
 * ClockHeist was ahead and locked (`chooseLocked` never considers ATTACK at
 * all, module doc comment on `lockedScore`), and the exact-reach retreat
 * (`inEnemyStrikeArea`, reworked above) still cannot save a piece the enemy is
 * already adjacent to or a speed-0 piece (`metal_1`) that can never move off
 * its square — the review's own count, 46% of buys. Rationale (the review's
 * own phrase): "the clock resets either way" — whichever side lands the next
 * kill, `state.inactivityPlies` resets to 0 either way
 * (`src/game/inactivity.ts`), so declining to kill a unit that is about to
 * kill one of ours buys ClockHeist nothing on the clock and costs it a unit
 * and that unit's future mining. Taking the kill instead removes the threat
 * outright (no second raid from the same piece) and costs ClockHeist nothing,
 * since it is gated the same way the existing free-kill logic already is:
 *
 *   - `attackKills`: never a trade — only a one-hit kill qualifies, so
 *     ClockHeist's attacker cannot itself die to a return hit this ply;
 *   - `!inEnemyStrikeArea(attacker.position, target.id)`: the attacker is not
 *     left exposed to a DIFFERENT surviving enemy after the target is gone —
 *     the same "stays exposed" veto the existing free-kill ATTACK case uses.
 *
 * This does NOT relax "free kills only while behind" (plan B.1) for
 * opportunistic kills — a target that is not itself threatening one of our
 * units still only dies while ClockHeist is behind, via the unchanged ATTACK
 * case in the switch below. It is strictly a self-defense carve-out.
 * Deterministic: ties among qualifying targets break on cost (kill the
 * costliest confirmed threat first), and any further tie goes through the
 * same seeded `pickBest` every other decision in this file uses.
 *
 * MEASURED: see the module header's W1.12 REWORK section for the calibration
 * this amendment was checked against. Falsifier: a ladder row where this
 * carve-out, alone, does not reduce the share of games where a raider
 * survives to make first contact (`kills.py`'s own trace method), or a row
 * where it lets a search-based opponent bait ClockHeist's attacker out of
 * position more than it saves.
 */
function chooseDefensiveKill(ctx: BotContext): AIAction | null {
  const { view } = ctx;
  const candidates = ctx.legal.filter((a): a is Extract<AIAction, { type: 'ATTACK' }> => {
    if (a.type !== 'ATTACK') return false;
    const attacker = unitById(view, a.unitId);
    const target = defenderAt(view, a.targetPosition);
    if (!attacker || !target) return false;
    if (!attackKills(view, attacker, a.targetPosition)) return false; // never a trade
    if (inEnemyStrikeArea(view, attacker.position, target.id)) return false; // stays exposed
    return threatensOneOfOurs(view, target); // defends: target could kill one of ours next turn
  });
  if (candidates.length === 0) return null;
  return pickBest(ctx.rng, candidates, a => unitCost(defenderAt(view, a.targetPosition)!)) ?? null;
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
      const defense = chooseDefensiveKill(ctx);
      if (defense) return defense;

      const mine = minedTotal(view.state, view.player);
      const theirs = minedTotal(view.state, view.opponent);
      const clock = view.state.inactivityPlies ?? 0;
      if (view.phase === 'action' && mine > theirs && clock >= RETREAT_CLOCK) return chooseLocked(ctx);

      const flank = flankCorner(view);
      return chooseFrom(ctx, (a) => {
        switch (a.type) {
          case 'ATTACK': {
            // Opportunistic kill only: a defensive kill (the target itself
            // threatens one of ours) already returned from
            // `chooseDefensiveKill` before this scorer ever runs -- see its
            // doc comment. This branch is unchanged: free kills only while
            // behind on the clock (plan B.1).
            if (mine >= theirs) return -1;
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
              // W1.12 REWORK (review issue 4): deliberately NOT also offered
              // the lock's richness chase here -- measured worse; see
              // `richnessScore`'s own doc comment for the decision and the
              // falsifier.
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
            // W1.12 FINAL FIX (this round, review issue 3): a speed-0 miner
            // (`metal_1`, RULE `src/game/units.ts`) can never step off the
            // square it lands on (`src/game/movement.ts canMove`: speed 0
            // never moves) — so buying it onto one of the few remaining
            // spawn squares removes that square from every future Place
            // phase FOREVER, where a mobile buy only removes it until
            // `declogScore` finds room to reopen it. The review's own count:
            // 46% of buys were metal_1, and 82 of 180 Place phases had zero
            // legal squares while ClockHeist held at least 3 crystals.
            // Refusing it ONLY when room is already at the declog floor
            // (`SPAWN_ROOM_FLOOR`, the same "needed" gate `declogScore`
            // uses, not an outright ban) costs nothing in the common case:
            // `plant_1` ties metal_1 on both cost and mining exactly (RULE
            // `src/game/units.ts`: cost 5, mining 3 for both), so it is
            // always an equally-affordable, equally-productive replacement
            // buy — the gate only trades away metal_1's own attack stat
            // (plant_1's is 0), which is why it is a gate and not a ban:
            // metal_1 stays available to `chooseDefensiveKill` exactly when
            // room is not already scarce. Falsifier: a ladder row where this
            // gate, alone, does not reduce the share of Place phases with
            // zero legal buy squares (`roomstats.py`'s own metric, the
            // review's tool).
            if (def.speed <= 0 && spawnRoom(view) <= SPAWN_ROOM_FLOOR) return -1;
            return 300 + def.mining * 20 - def.cost * 5;
          }
          default:
            return 0;
        }
      });
    },
  };
}
