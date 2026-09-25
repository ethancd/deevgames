# STRATEGOS Workflow 1: a clock-aware `hard@strategos` (2026-09-24)

**The wave-1 finding.** 34 LLM-vs-Hard games (wave 1, 2026-09-24) showed Hard losing 6 of 7 games on the kill
clock: it never plans contact when behind, and it reads the current mined lead rather than the projected one
at the clock's end. Its search is width-limited and its eval could not express "who wins the clock at ply ten"
— a computed projection, not a linear feature. The p3 retune campaign could not have found this: its ladder
opponents (Rush, Balanced, Expand, AIEngineV2) essentially never reach the clock (0 clock games in Stage A,
2/288 in B, 2/256 in C), so it measured the wrong failure mode.

**What Workflow 1 builds.** A `hard@strategos` profile — `hard@desktop` plus six optional
`SearchFix`/`EvalFix` keys, `config.ts strategosPatch()` — that projects the mined-total clock exactly under
stated assumptions, holds a real lead, and forces contact when it is losing the clock, with a tactical
contract check (falsify the plan, not protect material) instead of a material-loss veto, a `ClockHeist`
scripted opponent so the ladder can see the failure, and per-search telemetry. The contact and hold lines and
the contract check are W1.9 and W1.10, merged together from `claude/sg-plans` as `3cc81726` (rows below). Plan:
`~/.claude/plans/can-you-respond-to-piped-book.md`, Part B (steps W1.1–W1.15). `hard@desktop` is untouched
throughout: its resolved configuration and hash (`tests/lab/ablate.test.ts DESKTOP_WALL3000_HASH`,
`5de7ae20…`) do not move.

**Where the work happened.** Ten lanes in two waves, each its own worktree and branch (`claude/sg-flags`,
`sg-ledger`, `sg-killeta`, `sg-clockheist`, `sg-determinism`; then `sg-clockeval`, `sg-prune`, `sg-promote`,
`sg-seat`, `sg-clockheist2`), merged in sequence into `claude/strategos-w1`. Two shared foundation commits
framed the waves: `a4d9b48e` (W1.0) before the first and `a54e9885` (W1.0b) between the two. A coordinator
integration pass (`c054136b`) followed, then a third ClockHeist lane (`claude/sg-clockheist3`, merged as
`68f95a91`, which froze the bot), amendment A8 (`6d5db91b`), Gate 0 and row R0 (`d3c36188`), the W1.9/W1.10
lane (`claude/sg-plans`, merged as `3cc81726`) and a second coordinator pass on the veto (below). Every implementer commit was independently reviewed and, where the
review found a defect, fixed in a review commit on top — see each step's row below and
`docs/hard-ai/design/DEVIATIONS.md`'s new STRATEGOS W1 section for the deviations the campaign produced.

## Steps W1.1–W1.15

| Step | Commit(s) | Built | Review found & fixed |
|---|---|---|---|
| W1.0 | `a4d9b48e` | `strategy/` layer vocabulary (`types.ts`: `Guarantee`, `Feasibility`, `Claim`, `AnalysisQuery`, `ClockVerdict`, `Posture`, `ClockReadingCore`, `KillClockPolicy`); `hard:deps` registers the `strategy` layer | — (foundation commit, not lane-reviewed) |
| W1.0b | `a54e9885` | `ClockReadingCore.r` defined as `killeta.ts clockPliesLeft(p)` (one ply more after a kill, the W1.4 review's finding); `marginL` (the stay-put floor margin) added, `marginMid` kept for the Chronicle only (decision 2 below); `PlanContract`, `InjectedPlan`, `StrategyChronicle`; optional `RootResult.strategy` | — (foundation commit, not lane-reviewed) |
| W1.1 | `552d1fa4`, review `11bcc346` | Flags + profile scaffold: six new optional `SearchFix`/`EvalFix` keys in `config.ts`; `strategosPatch()`; `hardConfigFor('strategos')` | No code defect. `config.ts` prose for the not-yet-built W1.7/W1.8 described code that didn't exist yet and got details wrong — rewritten. `strategos-identity.test.ts` restored `DESKTOP` with `= undefined`, which leaves an own key behind — now `delete`. |
| W1.2 | `a5d198ba`, review `bddfe903` | Per-search kill-clock policy (the leak fix): `setKillClockPolicy`/`getKillClockPolicy`; `search/root.ts` save/set/restore in a `try/finally` | **Major.** `engine.ts`'s wall-clock pack and `calibrate()` wrote desktop's legacy `killClockRootClock` slot for EVERY profile, so a wall-clock strategos search could still leak its root clock into a later fixed-work desktop search (reproduced: desktop's score on a clock-8 position dropped from 998,000 to 200 after a 30 ms strategos search at clock 4; 1 of 96 p1-dev comparison rows moved). Fixed: both writes skipped under `killClockPolicy === 'ledger'`. Also: the acceptance test could not fail (its fixture's score never moved regardless of the clock value) — rewritten on a position where the leak is observable. Test constants labelled. The implementer also fixed `lab/hard-ai/deps.ts`'s `strategy/types` layer match, a file outside the lane's list (see DEVIATIONS). |
| W1.3 | `b3733fae`, review `9dde2635` | `strategy/ledger.ts`: the mined-total interval `[L, U]` | **Major ×2.** `L` ignored an unpaid root rent bill (a hand-built two-`plant_2`/bank-1 root gave `L − now = 30` against the real forecast's 15; a 31-mismatch rent-stress corpus found the class of bug) — fixed with a `settleRent` helper mirroring the real rules. `U` credited every unit/buy the catalogue-wide best mining rate from event 1 with no reserve cap and treated future income as spendable now — sound only by the shipped catalogue's numbers, and 300–1,700 crystals wide against typical `L` values of 5–20 — tightened and re-verified by a stochastic oracle (`tightestRatio > 0.5`). |
| W1.4 | `a6a729c2`, review `9364426b` | `strategy/killeta.ts`: a sound lower bound on plies until a side can kill | No soundness defect found (every relaxation checked by hand against `src/game`; 144k+ playouts, 7 exhaustive cases, 0 violations). One test gap: a variant that drops pending refunds from the crystal ceiling passed the whole vitest suite and was caught only by the CLI oracle at 3,000 positions — a paired witness-line regression test added. Doc/label fixes. |
| W1.5 | `09d79719`, review `56e22e1b` | `strategy/clock.ts clockReading`: the verdict table (`proven`/`bounded`/`open` × win/loss) | **Major ×2**, both replayed in the real Replica. `homeVictoryEta` ignored purchases and so was not a sound lower bound (a lone `plant_1` was bounded at ply 7, but walking it four squares and buying a `lightning_1` beside it reaches Black's corner at ply 3 and wins by home checkmate) — fixed by crediting bought bodies. A `proven-*` verdict could rest on a pending arrival the LOSER can cancel without a kill (White stepped onto Black's incoming arrival square, Black got a refund instead of a unit, White won the clock 2-1 against a "proven-loss" reading) — fixed with a new `arrivalsSettled` gate. |
| W1.6 | `49696ded`, review `825b0133` | Eval under `EvalFix.clockLedger`: `decidedCc`, the projected-margin `DrawPressure` | **Major.** The flagged branch decided "within the forced hand-offs" from the root's hand-off count alone, so a clock-out that follows a KILL (10+ turns deep, inside `maxDepth`) was scored full terminal scale — fixed to require both the root's count and the terminal's own `ply` ≤ 2 (the plan's literal `ply ≤ 2`). Doc/label fixes; a pinned whole-feature-vector-and-score digest replaced a test that could pass with the code wrong. |
| W1.7 | `5c88e23d`, review `e91e47e5` | Zero-damage attack prune, `SearchFix.pruneZeroDamage` | **Major.** The skip ran AFTER `orderTop`'s width cut, so a pruned candidate's beam slot went empty instead of to the next real one (shipped widths explored 5 root candidates instead of 6) — fixed by pruning before the cut (see DEVIATIONS, "the beam shift"). Also: `isZeroPowerAttack` relied on an invariant (every defence ≥ 1) that a `pack`-accepted edge state broke, which would have dropped a real kill (113 of 336 end positions lost) — fixed by also requiring `effectiveDef > 0`. |
| W1.8 | `49a7876a`, review `b636d46d` | Exhaustive promotions, `EvalFix.promoteExhaustive`; `Mission.ANY`; `buildCombos` promotion pin | **Major.** Tests passed with the code wrong: reverting the beam-widening change, or removing the engine wiring for any of the three generators, still passed all 10 tests — fixed with an 11-promotable-unit fixture and behavioural wiring tests. Found (not fixed here; recorded in DEVIATIONS): `TurnGenerator.prepareTables` never receives the engine's real `EvalFix`, so the 2026-09-21 strength knobs R2/R3 are dead in any real search. Also fixed: the `buildCombos` pin loop double-ran FORTIFY candidates `expand()` already runs FORCED. |
| W1.9 | `8de5da41`, review `45cec478`; merged `3cc81726` | Plan injection under `SearchFix.strategyPlans`. `strategy/contact.ts` (ForceContact, on a clock-loss reading): an approach toward the cheapest target (the `killEta`-minimising move, offered only if no worse than passing on the same post-turn convention), that approach plus the fastest affordable buy on the legal spawn square nearest the enemy, and that approach plus a promotion across a one-shot threshold; each rolled out for up to `r − 1` plies against two scripted replies (continue mining; evade the strike ball, then mine) and graded `witnessed` (both), `not-ruled-out` (one) or `unknown`, never `forced`; contract: deadline `r − 1`, `damaging-attack`, no essential slots. `strategy/hold.ts` (Hold, on a clock-win reading): pass, a combined retreat of every exposed killable unit, a Cleave-chain break; `forced` exactly when the enemy's `killEta` after the line exceeds the plies left (the no-kill clause only); essential slots are the units whose stay-put share the clock win needs (ties count as losses); permitted loss zero. `strategy/plan.ts`: the `PlanLine` record, caller-owned scratch with its own Replica, work units. `gen/generate.ts setStrategyWitness`/`playStrategyTurn` make each line a complete turn flagged `FORCED\|STRATEGY` (`gen/turn.ts TurnFlag.STRATEGY = 16384`) at ply 0 only; `search/order.ts ORDER_STRATEGY` (+1,000,000 at ply 0); `search/root.ts installStrategyWitness` charges the plan work to the meter (rollouts capped at `limit/16`) and fills `RootResult.strategy` | Flag-absent output byte-identical (26 of 26 digests recomputed from a `c054136b` archive). A `witnessed` ForceContact grade now records its rollout's actions, so it is a replayable line, not only a claim (Part A item 1); a test replays every witness at the root's full prover and requires the damaging attack at exactly the claimed ply, never past the deadline. Full-prover calls in rollouts are charged (`WORK_PROVER = 40`, DERIVED). Tests added for six mutations the suite missed (a rollout past the deadline, an in-line hit graded past the deadline, no rollout cap, an essential share ignoring the cell's reserve, Hold using the root's `r` instead of the plies left after the line, a buy square not nearest the enemy). Doc fixes: Hold's forced clause is "no enemy kill in the plies the clock has left", which our own kill can extend; the essential-slot share is approximate when rent releases units; `permittedLoss` crystals carry a CHOICE label. |
| W1.10 | `c9484d3f`, review `820aad80`; merged `3cc81726`; coordinator (below) | The plan-consistency veto under `SearchFix.strategyVeto`, and the Chronicle. `strategy/veto.ts` (pure): `planConsistency` (ForceContact: an injected line or any candidate whose Act makes an attack with power > 0; Hold: an injected line, or any candidate that kills nothing — generator flag and board count — and leaves the enemy's `killEta` above the plies left) and `vetoVerdict` (veto only on a terminal-scale gap, `terminalLossThreshold = WIN_CC − maxPly · MATE_PLY_CC`, DERIVED, or an essential slot dead after the opponent's best reply; material never). `search/veto.ts`: deepening runs on the rung less a reserve (`WorkMeter.setLimit`), topped back up to `used + reserve`; if the tactical best is not plan-consistent, the best consistent candidate (last completed iteration's score via `RootProbe.completedScore`, then injected lines, then generator order) is re-searched full-window at `max(1, depth − 1)` over every ply-1 reply; a truncated or refused re-search is `unresolved` and the tactical best is played. `search/root.ts` arms the veto only on a posture root and records `chosen`, `veto` and the `veto.classify`/`veto.research` queries | Five mutations survived the implementer's tests (essentials read off the FIRST reply instead of the principal one; a plan-consistent tactical best recorded as `source: 'search'`; the re-search's child depth pinned to 1; `deadEssentials` ignoring slot reuse by `ord`) — all now caught by an oracle that records every external `pvs` call of the re-search and checks its depth, window and named reply on every posture root. A private `RootProbe` leaked `candidateSource: 'generator-list'` onto an unexposed strategos result on the salvage path — dropped. The review also measured the reserve (57 posture root×rung runs): three re-searches cut for budget at an eighth, the finding that led to coordinator decision 7. Full suite 237 files, 3,349 passed, 17 skipped; `hard:determinism` for `hard@strategos` identical on the p4 corpus (48 decisions); `hard@desktop` byte-identical to `c054136b` on 42 roots. |
| W1.11 | `6c99447a`, review `c7c8b3b2` | Phasing determinism corpus (`positions/p4-determinism.jsonl`) + Gate 0 for desktop | **Major ×2.** Three of four "contact" rows were mid-turn snapshots taken just before a bot's ATTACK (`actionsRemaining` 1, 1 and 3), not the fresh Act root the strategos reading is designed around — regenerated as real fresh-turn contact positions at clocks 6, 2, 9 and 8. The test's `hard@desktop` CLI check ran `--positions 3`, the first 3 rows (all opening roots at clock 1), so it never touched a late-clock or contact row — fixed with an explicit high-clock/contact subset. Also fixed on the shared `determinism.ts` path: a short repetition was compared only on the rows it returned, so a missing/misaligned decision silently passed. |
| W1.12 | `082913bc`, review `56708048`; follow-up `e203c09c`, review `c6bb8a8e` | `ClockHeist` scripted bot (drone, expand, free kills only when behind, retreat/pass when ahead) | **Major ×2** (first review). The "ahead → retreat and pass" lock also blocked buying in the Place phase, and "ahead" was read right after ClockHeist's own income and before the opponent's — so from ply 3 of any kill-free game it froze its own economy (bank 10→19→27 unspent, lost the clock 38-52 vs Hard-25k). Fixed: the lock applies to the Action phase only. The strike-area formula (`speed+1`) was documented as an over-approximation but is not one (the engine's strike area is `speed×3+1`, `tables/threat.ts`) — now `speed×(actions−1)+1` on the empty board, a sound bound. **Follow-up finding (not resolved):** the Action-phase-only fix has NO measured effect on real games — an exact ladder replay reproduces all 96 calibration games identically before and after. The real cause is spawn-square clogging (ClockHeist's units sit on its own rich home spawn cells and neither branch moves one off a still-paying cell, so the Place phase has no legal buy square), left as an open coordinator item — see below. |
| W1.12 final | `ae294099`, review `1d74f543`; fix `9fdf6b95`, re-review `4c10bd55`; merged `68f95a91` | Spawn declogging (`declogScore`/`wouldOpenSpawnRoom`/`spawnRoom`): a unit on a paying cell may step to another paying cell when safe, when spawn room is tight, and when replaying the move proves it widens the buyable area. ClockHeist frozen at `4c10bd55` for A8 | Turns 1–4 buys rose from 1.0–2.0 to 4.42–7.17, but the clock outcome did not flip: `hard@desktop` still won 133 of 144 p1-dev calibration games. The review (`1d74f543`) found the clog persists after turn 4 (82 of 180 Place phases had no buy square while ClockHeist held at least 3 crystals) and that desktop's early raids, not the income ratio, decide most games. The fix round (`9fdf6b95`: defensive kill, blocker-aware reach, `metal_1` gate) was reverted by the re-review (`4c10bd55`): the defensive kill threw away won clocks, blocker-aware reach is unsound (a lethal hit unlocks another attack), and the gate had no measured effect. The frozen bot's decisions equal `ae294099`'s. |
| W1.13 | `6d480661` (`~/src/deevgames-sg-exam`) | Wave-1 exam cases (`ExamKind 'plan'`, `PlanWitness`) re-run on `lab/hard-ai/exam/cases-p4` dev stratum, fixed work 60000, after merging `claude/strategos-w1` | `hard@desktop`: 3/8 passed, 4/8 as expected. `hard@strategos` pre-W1.9: 3/8, 4/8 as expected. Final `hard@strategos`: 4/8 passed, 5/8 as expected — `AS01-W-t3` now passes (injected force-contact line played as the plan, no veto; wave 1's headline failure there was a full pass at 13 v 30, clock 5). Still failing, Workflow 2 material: `OP01-W-t1` (spawn jam), `OP01-W-t2` (full pass at clock 3, 14-15; likely `open` with no posture — the exam record carries no `claim`/chronicle field), `OP02-W-t6` (no promotion), `SO01-B-t11` (expected fail). |
| W1.14 | `45b72c21`, review `861e886c` | Master side: engine-seat profile selector + search telemetry; browser `?hardEngine=strategos`. The pilot-branch half is **PENDING** (plan B.1a) | **Major ×2.** Telemetry/profile tests passed with FOUR different wrong runners (minedTotals swapped, handicap dropped, clock hard-coded to 0, wrong profile patch used) — fixed with paired one-fact-change cases and a spy on the real default engine factory. The engine profile was not part of the seat's resume identity, so a crash-and-resume could silently switch engines mid-game — fixed via `journal.profile` + `assertSeatConfiguration`. Also: `SEARCH_TELEMETRY_VERSION` existed only in a comment, not as code — now an exported constant written on every `start` line. |
| W1.15 | `464f94c3`, review `8e1470b6` (this record, DEVIATIONS.md, `docs/ENGINE-SEAT-MATCH-2026-09-19.md`); A8 `6d5db91b`; DESIGN.md §9 addendum | Release docs; amendment A8 and `lab/hard-ai/ladder/paired-diff.ts` (A8's paired R1-minus-R0 difference, committed before R1) | Docs lane reviewed against `c054136b`. A8 reviewed by a Fable pass. The §9 addendum and DEVIATIONS/change-record drafts in `41172a24` (origin unknown, made after the 2026-09-24 crash, not by a campaign agent) were fact-checked and reconciled into this record in the merge of `claude/sg-docs`; the addendum awaits a Fable pass after W1.10. |
| coordinator | `c054136b` | Integration decisions across W1.6/W1.8/W1.14 (below); the `ClockVerdict` doc (`strategy/types.ts`) and the `EvalFix.clockLedger` doc (`config.ts`) brought in line with the code, as the W1.5/W1.6 review asked | — |
| coordinator (W1.10) | `3561e239` | The veto's reserve raised from an eighth to a fifth of the rung, re-measured (decision 7); the `forgone-win` veto reason (decision 8); Hold's contract veto documented as a W1 limitation (decision 9) | — |

## Coordinator decisions

1. **Types base.** `strategy/types.ts` landed as a shared foundation twice, once per wave. W1.0 (`a4d9b48e`)
   gave the first wave (flags, ledger, killeta, ClockHeist, determinism) the vocabulary (`Guarantee`,
   `Feasibility`, `Claim`, `AnalysisQuery`, `ClockVerdict`, `Posture`, `ClockReadingCore`, `KillClockPolicy`).
   W1.0b (`a54e9885`) fixed `ClockReadingCore.r` and the margin definition and added `PlanContract`,
   `InjectedPlan`, `StrategyChronicle` and `RootResult.strategy` before the second wave (clockeval, prune,
   promote, seat, the ClockHeist follow-up) branched, so every lane in that wave shared one shape instead of
   each declaring its own.
2. **`marginL`, not `marginMid`.** `ClockReadingCore` carries both: `marginL` (`L_side − L_opponent`, the
   stay-put floor margin) and `marginMid` (midpoint of `[L, U]` minus the opponent's, Chronicle-only; nothing
   reads it as a decision input). Reason: `U` grows with bank size through reinvestment, so a `U`-weighted
   margin would reward hoarding cash — the failure the 2026-09-20 repair handoff documents (the W1.3 review
   raised the question). In the shipped code no eval path reads `marginL` itself either: `decidedCc`
   (`eval/evaluate.ts`) reads only the root reading's `verdict`, and `DrawPressure` (`eval/features.ts`)
   computes its own cheap per-node stay-put projection — `gained[]` plus `projectedIncome` times the side's
   remaining mining events — never the bank and never `U`.
3. **Open readings keep the soft clock score.** Beyond the forced hand-offs, `BOUNDED_CLOCK_CC` (`WIN_CC / 8`)
   applies to `bounded-win`/`bounded-loss` only. An `open` reading (the intervals overlap, no verdict
   established) scores the flat legacy `KILL_CLOCK_SOFT_CC` instead — superseding W1.6's original brief of
   "bounded and open alike". The W1.6 review flagged the risk: paying `WIN_CC / 8` on an open reading brings
   back the 2026-09-22 kill-clock failure one flag later — a 125,000 cc prize on a deep, unverified clock-out
   that the candidate-limited interior search cannot confirm, preferred over a free capture available now. An
   open reading also has no verdict to sign the bigger score with.
4. **Root-only exhaustive promotions.** `EvalFix.promoteExhaustive` is wired to the root generator (`gen`)
   alone, not `genInterior`/`genQuiesce`. Measured by the W1.8 review against `hard@strategos` at `a54e9885`,
   at fixed work 80,000 over 49 non-terminal positions: wiring all three cost 13 of 82 depth plies (nodes
   ratio 0.88) for no measured promotion-choice benefit against root-only's 6 plies lost (ratio 0.95). See
   `DEVIATIONS.md`.
5. **The seat refuses `env`.** `env` (and `env` with a documentary suffix, such as `env-400k`) resolves
   through `hardConfigFor` but is refused by the engine seat's config schema: `hard@env`'s weights come from
   the `MUJU_HARD_WEIGHTS` file, a path the seat's `start` line never records, and the file is read lazily at
   the first search after joining a room rather than at config time.
6. **ClockHeist: spawn-clog fix, freeze, and a weak detector.** The W1.12 follow-up review (`c6bb8a8e`) found
   that the follow-up's Action-phase lock change has no measured effect, and that ClockHeist's flat economy
   comes from spawn-square clogging (its units sit on rich cells of its own spawn rectangle, so its Place
   phase has no legal buy square). The third ClockHeist lane fixed the early clog (`ae294099`, W1.12 final row
   above) and ClockHeist was frozen at `4c10bd55` (`68f95a91` on this branch). Its last calibration round
   (p1-dev, seed 20260976, handicaps 0–20 in steps of 4, 144 games) is the one A8 reads: `hard@desktop` won
   133 of 144, and all 11 losses were kill-free games lost on the clock. Earlier rounds (seeds
   20260977–20260979, 20260991) were played by earlier versions of the bot and are not read. A8 therefore
   states before any row that ClockHeist is a weak detector of the wave-1 failure: it reproduces that failure
   only in the few games where nobody kills, and R1's bar is a non-regression check, not evidence of the fix.
7. **The veto's reserve is a fifth of the rung, not an eighth** (`search/veto.ts VETO_RESERVE_SHARE = 5`,
   CHOICE). W1.10 shipped an eighth, and the W1.10 review's measurement failed it: 57 posture root×rung runs
   (rungs 25,000, 40,000 and 60,000 over the W1.9 and W1.10 fixtures, the p4 corpus's five posture roots and
   the six authored W1–W6 wave roots) had three re-searches cut for budget, after which the plan was not
   played — W3-c6-mixed@25,000 (3,093 units), W6-c6-far@40,000 (5,028 against a 5,000 reserve) and
   W6-c6-far@60,000 (8,486 against 7,500), about 13–14% of the rung. Re-measured at a fifth on the same 57
   runs (`3561e239`):

   | | an eighth (W1.10 review) | a fifth (`3561e239`) |
   |---|---|---|
   | re-searches cut for budget (`unresolved`) | 3 | 1: W6-c6-far@40,000, 8,045 units against 8,000, after 7 of 19 replies |
   | runs where deepening lost a completed depth to the reserve | 1: pf-trailingNoContact@60,000, 2 → 1 | 4: vf-mate@40,000 3 → 2, pf-tooFarToReach@40,000 4 → 3, W6-c6-far@60,000 2 → 1, pf-trailingNoContact@60,000 2 → 1 |
   | runs that played a plan candidate | 48 | 50 |
   | resolved re-search cost | 514–6,619 units | 514–11,217 units |

   Depth is compared with the same profile with `strategyVeto` removed. Every veto the fixtures expect still
   fires (vf-mate `mate`, vf-essential `essential-lost`, at all three rungs). The falsifier the label names —
   a posture root whose re-search still exceeds the reserve at a rung from 25,000 to 60,000 — already fires
   once: W6-c6-far@40,000's re-search of `approach:u2->g7` costs 11,731 units when a third of the rung is
   reserved (29% of the rung; 13,078 at a half), so no share up to a quarter covers it (the W1.10 review saw it
   cut at a quarter too, at 10,133 units). Open for the coordinator (below). Desktop is untouched: the reserve
   is taken only when `searchFix.strategyVeto` is set and the root's reading has a posture.
8. **`forgone-win` is its own veto reason.** When the tactical best is a decided win and the plan line is
   not, `vetoVerdict` used to report `mate`, with `detail` saying which side. It now reports `forgone-win`
   (`StrategyChronicle.veto.reason` gains the value). `mate` keeps meaning a plan line that walks into a
   decided loss, and it wins over `forgone-win` when both hold.
9. **Under Hold, the only contract veto is a dead essential slot** — recorded as a known W1 limitation and an
   open Workflow 2 question, not changed. A best reply that kills a NON-essential unit, and so resets the
   clock the Hold is winning, does not veto the plan; and an injected Hold line is plan-consistent without the
   enemy-`killEta` check a non-injected candidate must pass. Example: on `p4-det-018` (bounded win, `r = 2`)
   the root plays `hold:pass`, graded `unknown` and re-searched at −4,492 against the tactical best's +3,138,
   over a `forced` `hold:retreat(u0->c2)`; neither line has an essential slot. Part A item 2 says the search's
   job is to falsify the contract; here the re-search has no clause of the Hold contract to falsify it with.
   See `DEVIATIONS.md`.

## Master PRs #39–#41 on this branch

The W1.10 lane merged `origin/master` to satisfy the freshness hook (`c04365a6`), so master PRs #39–#41 reached
`claude/strategos-w1` with the W1.9/W1.10 merge (`3cc81726`): #39 (crystal painter board sizes 4×4 to
10×10), #40 (MICRO MUJU, a 6×6 pass-and-play variant, `micro-muju-1`) and #41 (MICRO MUJU online: rooms, MCP
tools). They generalise board size under `src/game`; the Muju rules revision (`muju-phasing-4`) is unchanged.
The W1.10 review measured `hard@desktop`'s fixed-work results byte-identical to `c054136b` on 42 roots after
the merge. R0 ran at `6d5db91b`, before it; R1 will run on the merge candidate, which includes it. A8 forbids
re-running R0, so the paired R1-minus-R0 comparison stands on that byte-identity evidence.

## Tests and instruments added

- New tests: `tests/lab/strategos-identity.test.ts`, `tests/ai/hard/kill-clock-policy.test.ts`,
  `strategy-ledger.test.ts`, `strategy-killeta.test.ts`, `strategy-clock.test.ts`, `strategos-eval.test.ts`,
  `zero-damage-prune.test.ts`, `prepare-recall.test.ts` (all under `tests/ai/hard/`),
  `tests/lab/clock-ledger-oracle.test.ts`, `killeta-oracle.test.ts`, `determinism-phasing.test.ts`,
  `clockheist.test.ts`, `paired-diff.test.ts`, `tests/ai/hard-engine-profile.test.ts` and
  `tests/hooks/ai-hard-engine-profile.test.tsx`. Extended: `kill-clock-terminal-score.test.ts`,
  `tests/lab/engine-seat.test.ts`, `tests/ai/worker-turn.test.ts`, `tests/lab/phasing-evidence.test.ts`.
- W1.9/W1.10: `tests/ai/hard/strategy-plans.test.ts` (with `strategy-plans-fixture.ts`) and
  `tests/ai/hard/strategy-veto.test.ts` (with `strategy-veto-fixture.ts`: paired one-fact roots,
  `mateOrMaterial` and `essentialOrNot`, whose vetoes are confirmed by the canonical engine); extended:
  `tests/ai/hard/interfaces.test.ts` (the pinned `TurnFlag` list gains `STRATEGY`).
  `tests/lab/exam-p4.test.ts` (W1.13) does not exist yet.
- Oracles: `lab/hard-ai/oracles/clock-ledger.ts` (random legal playouts that stop at the first kill never
  end the window above `U`) and `lab/hard-ai/oracles/killeta.ts` (no witnessed kill earlier than the bound).
- Positions: `lab/hard-ai/positions/p4-determinism.jsonl` (W1.11) and `zero-damage.jsonl` (W1.7), each with
  its generator script.

## What did NOT change

- `hard@desktop`'s resolved configuration and hash (`DESKTOP_WALL3000_HASH`, `5de7ae20…`) — byte-identical on
  every step; every new key is optional and absent on every shipped profile but `hard@strategos`.
- The default browser profile stays `hard@desktop` until wave 2 says otherwise (plan B.1); an R1 bar failure or
  regression flag blocks proposing `hard@strategos` as a default (A8). `hard@strategos` is reachable only by
  name: the lab
  ladder's `hard@strategos`, the seat's `profile` config field and the browser's `?hardEngine=strategos`
  opt-in (W1.14).
- `DEFAULT_WEIGHTS` — untouched; `strategosPatch()` carries no `weights` key of its own.
- The rules revision (`muju-phasing-4`) — unchanged. The canonical engine (`src/game/**`) — no campaign commit
  touches it; every strategy module reads a packed root and writes nothing back to the canonical state. Its
  only changes on this branch are master's board-size generalisation (PRs #39–#41), which arrived through
  the W1.9/W1.10 merge (see "Master PRs #39–#41 on this branch").
- The 2026-09-21 strength knobs (`StrengthKnobs`) — unchanged in shape. The bug that makes R2/R3 dead in real
  search is pre-existing; W1.8 found it and its review confirmed it (see DEVIATIONS.md).

## Open follow-ups

**For Workflow 2** (plan Part C, not executed now): the belief table over unresolved claims
(`strategy/belief.ts`), value-of-information query selection (`strategy/voi.ts`), the second loop (Build →
threshold → Strike), then the goal catalogue one family at a time, and cross-turn plan memory once it is a
pure function of room history. Workflow 1's `Claim`/`AnalysisQuery`/Chronicle types (W1.0, W1.0b) exist to
give Workflow 2 typed facts to attach likelihoods to.

**For Workflow 2, from Workflow 1's veto:** under Hold, should a best reply that kills a non-essential unit
(and so resets the clock) falsify the contract, and should an injected Hold line pass the same enemy-`killEta`
check as any other candidate? Coordinator decision 9; `DEVIATIONS.md`.

**Decided since this record's draft:**
- The veto's reserve (coordinator decision 7). Its falsifier already fires on W6-c6-far@40,000, whose
  re-search needs 29% of the rung, and no share up to a quarter covers it. Decided: the coordinator keeps
  the reserve at a fifth and accepts `unresolved` on such rare roots, whose fallback is the search's own
  best move — not a larger share or a per-root cap. See `DEVIATIONS.md` and `search/veto.ts
  VETO_RESERVE_SHARE`'s doc.

**Inside Workflow 1, still open:**
- The pilot-branch half of W1.14 (plan B.1a) — pending. W1.13 (wave-1 exam cases) itself is done: it ran on
  the pilot branch after the master merge (`~/src/deevgames-sg-exam` `6d480661`; results above).
- `TurnGenerator.prepareTables`'s dead `EvalFix` read (W1.8 review finding) — stamp the real `evalFix` onto
  it, or pass it through explicitly, so the 2026-09-21 strength knobs mean something in real search.
- ClockHeist's remaining spawn clog (W1.12 final review, `1d74f543`) — `ae294099` opened the spawn rectangle
  for the first turns, but the clog persists later (46% of its buys are `metal_1`, speed 0, which never leaves
  its square, and the strike-area gate vetoes every declog once the opponent has a few pieces out). The bot
  is frozen for A8, so any fix ships as `ClockHeist-v2`.
- Whether `promoteExhaustive` should also reach `genInterior`/`genQuiesce` — falsifier: the R1 ladder row or
  wave 2 showing a promotion-choice regression root-only wiring would have caught (coordinator decision 4).
- Commit-attribution corrections at squash/merge time: five implementer commits (`552d1fa4`, `a5d198ba`,
  `5c88e23d`, `45b72c21`, `e203c09c`) carry "Claude Sonnet 5" trailers instead of the lane brief's required
  "Claude Opus 5.5 (1M context)" line; each lane's own review commit uses the correct trailer and was not
  rewritten to fix the implementer commit (no rebase).

## Evidence recorded, and what is still owed

- **Gate 0 results.** W1.11 ran Gate 0 for `hard@desktop` only (`6c99447a`, `c7c8b3b2`), all exit 0:
  `hard:perft --check` on both engines, `hard:fuzz --actions 20000 --seed 7101` (0 divergences), and
  `hard:determinism --positions-file lab/hard-ai/positions/p4-determinism.jsonl` (24/24 identical at work
  25000; 48/48 at 25000,400000). A8 requires Gate 0 again for `hard@desktop` at the commit R0 runs on, and
  for both profiles at the Workflow 1 merge candidate before R1. **Done for `hard@desktop` at `6d5db91b`**
  (`d3c36188`; logs under `docs/hard-ai/phasing/strategos-w1-2026-09-24/results/gate0/`): `hard:perft
  --check`, `hard:perft --check --engine replica`, `hard:fuzz --actions 20000 --seed 7101` and
  `hard:determinism` over `p4-determinism.jsonl`, all exit 0. **Done for both profiles at the merge
  candidate, `b667f69f`** (`docs/hard-ai/phasing/strategos-w1-2026-09-24/results/gate0/both-b667f69f.txt`,
  and the per-check logs beside it): `hard:perft --check`, `hard:perft --check --engine replica`, `hard:fuzz
  --actions 20000 --seed 7101`, and `hard:determinism` over `p4-determinism.jsonl` for both `hard@desktop`
  and `hard@strategos` — every check exits 0. The W1.10 review and this coordinator pass also ran
  `hard:determinism --engine hard@strategos --work 25000,60000` over the p4 corpus: identical, 48 decisions.
- **Rows R0–R3.** Preregistered in amendment A8 (`6d5db91b`) before any is played; all at `muju-phasing-4`,
  seat-mirrored, `p1-val.jsonl` (32 openings):
  - R0: `hard@desktop` vs `ClockHeist`, fixed:60000, handicaps 0,4,8,12,16,20, 192 pairs, seed 20260983.
    Informational: the baseline for R1.
  - R1: `hard@strategos` vs `ClockHeist`, same schedule and seed, played on the Workflow 1 merge candidate.
    Bar: score > 0.5 with LOS ≥ 95%, a non-regression check; the paired R1-minus-R0 difference
    (`lab/hard-ai/ladder/paired-diff.ts`) raises a regression flag if its 95% interval lies below 0.
  - R2 (after wave 2): `hard@strategos` vs `aiv2-hard-turn`, wall:6000, 32 pairs, seed 20260981. Bar: Elo
    lower bound > 0 (LOS ≥ 97.5%).
  - R3 (after wave 2): `hard@strategos` vs `hard@desktop`, fixed:60000, 32 pairs, seed 20260982.
    Informational.

  The plan's seed 20260980 was consumed by a ClockHeist review smoke on `p1-val`, so R0/R1 moved to
  20260983; the six handicaps replace the plan's `--handicaps 0 --pairs 32` (A8 gives the reasons).

  **R0 result** (`d3c36188`, at `6d5db91b`; `docs/hard-ai/phasing/strategos-w1-2026-09-24/results/R0-desktop-vs-ClockHeist/`):
  complete, 192/192 pairs, 384/384 games, no illegal actions, replica divergences or engine fallbacks.
  `hard@desktop` scored 364-3-17 (W-D-L), score 0.952, Elo 518 [448, 630]. All 17 losses are kill-free
  kill-clock losses (no first blood; 10 as White, 7 as Black), the wave-1 failure mode; per handicap 0/4/8/12/16/20
  the losses are 1/2/2/4/4/4. The run was interrupted by a machine crash before its first game finished and
  resumed in place (`--resume`, same row and seed). The summary flags duplicate openings: 141 (A as White) and
  103 (B as White) distinct games of 192 pairs.

  **R1 result** (`docs/hard-ai/phasing/strategos-w1-2026-09-24/results/R1-strategos-vs-ClockHeist/`, on the
  Workflow 1 merge candidate): complete, 192/192 pairs, 384/384 games, no illegal actions, replica
  divergences or engine fallbacks. `hard@strategos` scored 365-3-16 (W-D-L), score 0.954, Elo 528 [458, 641],
  LOS 100.0% — **the bar (score > 0.5, LOS ≥ 95%) is met.** The summary flags duplicate openings: 141 (A as
  White) and 91 (B as White) distinct games of 192 pairs.

  **Paired R1-minus-R0 difference** (`lab/hard-ai/ladder/paired-diff.ts`;
  `docs/hard-ai/phasing/strategos-w1-2026-09-24/results/R1-vs-R0-paired-diff.json`): mean +0.0026, 95%
  interval [-0.0245, +0.0297], 13 pairs worse / 164 unchanged / 15 better of 192 — **no regression flag**
  (the interval does not lie below 0).

  **Read-outs.**
  - All 16 R1 losses are kill-free kill-clock losses, the wave-1 failure mode: 9 as White (R0: 10) and 7 as
    Black (R0: 7) — the same shape as R0, one fewer loss overall.
  - As Black, `ClockHeist` drew first blood exactly once against `hard@strategos` (of 192 A-black games),
    against 12 times for `hard@desktop`. Kill-free Black wins: 119 for strategos, 104 for desktop.
  - Interpretation, per A8 (a weak detector: it reproduces the wave-1 failure only in kill-free games): Hold
    is visible in these numbers (first blood against strategos as Black nearly vanishes, and kill-free Black
    wins rise 104→119), while ForceContact barely moves this detector (the White-loss count falls by only
    one, 10→9). The exam (below) and wave 2 carry that test.

- **Exam re-run** (W1.13 set, `lab/hard-ai/exam/cases-p4` dev stratum, fixed work 60000; run on the pilot
  branch after merging `claude/strategos-w1`, `~/src/deevgames-sg-exam` `6d480661`), per engine:
  - `hard@desktop`: 3/8 passed, 4/8 as expected.
  - `hard@strategos` pre-W1.9: 3/8 passed, 4/8 as expected.
  - Final `hard@strategos`: 4/8 passed, 5/8 as expected. `AS01-W-t3` now passes: the injected force-contact
    line (approach `u7->d1`, then the hit at `c1`) is played as the plan, with no veto. Wave 1's headline
    failure there was a full pass at 13 v 30 with the clock at 5.

    Still failing, named here as Workflow 2 material:
    - `OP01-W-t1`: spawn jam (0 legal spawn squares for black after the turn).
    - `OP01-W-t2`: a full pass at clock 3, mined 14–15; likely an `open` reading with no posture — the
      exam's own record for this case has no `claim`/chronicle field to confirm it from (`source: "search"`,
      no strategy witness exposed), so this is stated as likely, not verified.
    - `OP02-W-t6`: no promotion made in the turn.
    - `SO01-B-t11`: expected fail (the author's own stated expectation for this case).

## Content DAG walk

`python3 tools/muju-content-dag.py plan --kind ai` (this campaign, master checkout worktree at
`b667f69f`/`0f0cf7d2`):

| Node | Disposition | Evidence |
|---|---|---|
| wasm-tactics | Verified unchanged | 0-diff on assembly/tactics.ts, src/ai/wasm/, asconfig.json; ai:wasm prebuild clean |
| ai-search | Changed (narrow) | Only src/ai/worker/protocol.ts (+11); worker-turn.test.ts + ai-worker.spec.ts 7/7 green |
| hard-ai | Changed | the campaign core; hard-ai.spec.ts 12/12, fallbacks/divergence 0 in the no-fault path; smoke confirms the strategos patch and zero diagnostic counters |
| ai-strength | Changed | Gate 0 both profiles; R0 and R1 under A8 (above); R2/R3 owed after wave 2 |
| mcp-tools | Verified unchanged (this campaign) | server/mcp.ts, observation.ts, analysis diffs all from master 14ad6b3d (Micro Muju) |
| agent-guides | Verified unchanged (this campaign) | SKILL.md diff solely from 14ad6b3d |
| balance-analysis | Verified unchanged | 0 diff in lab/solver, current-static |
| game-validation | Changed | Full suite at `b667f69f`: 238 files. The only 4 failures were ladder-runner timeouts while R1 held both heavy slots; that file passes 106/106 on its own. Online e2e 85/85, ai-worker e2e 7/7, hard-ai e2e 12/12, build ok, server:types ok. The browser smoke passed: `?hardEngine=strategos` sends exactly the six-flag `strategosPatch` with zero fallbacks, divergences or console errors, and plain desktop sends no hard key at all. |
| static-package | Owed at deploy | bash build-all.sh + tools/smoke-site.cjs on a fresh _site |
| static-deploy | Owed at deploy | The GitHub workflow cannot publish (no credentials; `CONTENT_DAG.md`). Previous releases published Pages with a local `npx wrangler pages deploy _site --project-name deevgames` from the main checkout; that route will be used at deploy. Evidence pending. |
| server-package | Changed via the client bundle; deploys on merge | `muju/Dockerfile` runs `npm run build` and copies `dist`; `server/http.ts` serves `distPath` at `/muju/`, so the Render host's own image build carries the browser bundle change — nothing separate to package. |
| server-deploy | Changed via the client bundle; deploys on merge | Same route: the Render service builds the Dockerfile image from `master` on merge; there is no separate server-only deploy step. |
| release-verification | Owed at deploy | completion record after deploy |

- **W1.10 smoke** (the W1.10 lane's own check on its tree before `c9484d3f`, an eighth reserved; a scratch
  table, not committed).
  `hard@desktop` and `hard@strategos` at fixed work 60,000 on the 24 p4 corpus roots and the six authored
  W1–W6 wave roots. 22 roots read `open` (no posture): strategos played desktop's move on 11 and a different one
  on the other 11 (the prune, exhaustive promotions and clock eval act there too). On the eight posture roots:
  - Hold, four corpus roots (all `bounded-win`), played `hold:pass`. On `p4-det-015` desktop approached (distance
    14 → 11) and on `p4-det-018` it walked away (3 → 9); on `p4-det-019` and `p4-det-022` desktop passed too.
  - ForceContact, `p4-det-023`: the same attack as desktop, as a plan-consistent tactical best.
  - ForceContact, W3-c6-mixed and W4-c7-fire: plan approach lines (`approach:u1->h6`, `approach:u1->g7`)
    closing to distance 3 and 1, where desktop closed to 7 and 5.
  - ForceContact, W6-c6-far: desktop's move, recorded as the search's, because the re-search came back
    `unresolved` (the finding behind coordinator decision 7). At a fifth (`3561e239`) the same root plays
    `approach:u2->g7` at 60,000.

  No veto fired on any of the 30 roots. Completed depth was equal on 26 roots, one lower on 3 and one higher on 1.
- **Deploy evidence.** None yet. Plan B.3 items 5–7: `npm test` and `e2e/ai-worker.spec.ts`, a Watch-AI
  browser smoke with `?hardEngine=strategos`, an engine-seat smoke with `profile: 'strategos'`, then deploy
  per standing permission (Render, Pages) with the default profile still `desktop`.
- **DAG walk.** Run for this campaign (table above): `wasm-tactics`, `mcp-tools`, `agent-guides` and
  `balance-analysis` verified unchanged; `ai-search`, `hard-ai`, `ai-strength` and `game-validation`
  changed, with evidence recorded there; `server-package`/`server-deploy` changed only via the browser
  bundle the Render image already carries on merge (`muju/Dockerfile` + `server/http.ts`), nothing separate
  to deploy. `static-package`, `static-deploy` and `release-verification` remain owed at deploy (plan B.3
  item 7).
