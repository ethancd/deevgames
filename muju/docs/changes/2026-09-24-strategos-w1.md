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
scripted opponent so the ladder can see the failure, and per-search telemetry. Plan:
`~/.claude/plans/can-you-respond-to-piped-book.md`, Part B (steps W1.1–W1.15). `hard@desktop` is untouched
throughout: its resolved configuration and hash (`tests/lab/ablate.test.ts DESKTOP_WALL3000_HASH`,
`5de7ae20…`) do not move.

**Where the work happened.** Ten lanes in two waves, each its own worktree and branch (`claude/sg-flags`,
`sg-ledger`, `sg-killeta`, `sg-clockheist`, `sg-determinism`; then `sg-clockeval`, `sg-prune`, `sg-promote`,
`sg-seat`, `sg-clockheist2`), merged in sequence into `claude/strategos-w1`. Two shared foundation commits
framed the waves: `a4d9b48e` (W1.0) before the first and `a54e9885` (W1.0b) between the two. A coordinator
integration pass (`c054136b`) followed. Every implementer commit was independently reviewed and, where the
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
| W1.9 | **PENDING** | Plan injection: `strategy/contact.ts`, `strategy/hold.ts`; `setStrategyWitness`; `TurnFlag.STRATEGY` | Being built in a separate lane as this record is written. See DEVIATIONS.md's PENDING entry for the shape once it lands. |
| W1.10 | **PENDING** | The plan-consistency veto; `RootResult.strategy`'s `chosen`/`veto` fields | Being built alongside W1.9. `RootResult.strategy` is declared (W1.0b) but not yet populated by any real search in this tree. |
| W1.11 | `6c99447a`, review `c7c8b3b2` | Phasing determinism corpus (`positions/p4-determinism.jsonl`) + Gate 0 for desktop | **Major ×2.** Three of four "contact" rows were mid-turn snapshots taken just before a bot's ATTACK (`actionsRemaining` 1, 1 and 3), not the fresh Act root the strategos reading is designed around — regenerated as real fresh-turn contact positions at clocks 6, 2, 9 and 8. The test's `hard@desktop` CLI check ran `--positions 3`, the first 3 rows (all opening roots at clock 1), so it never touched a late-clock or contact row — fixed with an explicit high-clock/contact subset. Also fixed on the shared `determinism.ts` path: a short repetition was compared only on the rows it returned, so a missing/misaligned decision silently passed. |
| W1.12 | `082913bc`, review `56708048`; follow-up `e203c09c`, review `c6bb8a8e` | `ClockHeist` scripted bot (drone, expand, free kills only when behind, retreat/pass when ahead) | **Major ×2** (first review). The "ahead → retreat and pass" lock also blocked buying in the Place phase, and "ahead" was read right after ClockHeist's own income and before the opponent's — so from ply 3 of any kill-free game it froze its own economy (bank 10→19→27 unspent, lost the clock 38-52 vs Hard-25k). Fixed: the lock applies to the Action phase only. The strike-area formula (`speed+1`) was documented as an over-approximation but is not one (the engine's strike area is `speed×3+1`, `tables/threat.ts`) — now `speed×(actions−1)+1` on the empty board, a sound bound. **Follow-up finding (not resolved):** the Action-phase-only fix has NO measured effect on real games — an exact ladder replay reproduces all 96 calibration games identically before and after. The real cause is spawn-square clogging (ClockHeist's units sit on its own rich home spawn cells and neither branch moves one off a still-paying cell, so the Place phase has no legal buy square), left as an open coordinator item — see below. |
| W1.13 | **PENDING** (not in `c054136b`) | Wave-1 exam cases (`ExamKind 'plan'`, `PlanWitness`) | Plan B.2 runs it on the pilot branch (`~/src/deevgames-llm-pilot`) after master is merged into `claude/muju-llm-pilot`. |
| W1.14 | `45b72c21`, review `861e886c` | Master side: engine-seat profile selector + search telemetry; browser `?hardEngine=strategos`. The pilot-branch half is **PENDING** (plan B.1a) | **Major ×2.** Telemetry/profile tests passed with FOUR different wrong runners (minedTotals swapped, handicap dropped, clock hard-coded to 0, wrong profile patch used) — fixed with paired one-fact-change cases and a spy on the real default engine factory. The engine profile was not part of the seat's resume identity, so a crash-and-resume could silently switch engines mid-game — fixed via `journal.profile` + `assertSeatConfiguration`. Also: `SEARCH_TELEMETRY_VERSION` existed only in a comment, not as code — now an exported constant written on every `start` line. |
| W1.15 | this record + `docs/hard-ai/design/DEVIATIONS.md` + `docs/ENGINE-SEAT-MATCH-2026-09-19.md` | Release docs | In progress. DESIGN.md §9 addendum and amendment A8 are the coordinator's, not written here. |
| coordinator | `c054136b` | Integration decisions across W1.6/W1.8/W1.14 (below); the `ClockVerdict` doc (`strategy/types.ts`) and the `EvalFix.clockLedger` doc (`config.ts`) brought in line with the code, as the W1.5/W1.6 review asked | — |

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
6. **ClockHeist spawn-clog finding and handicap calibration — calibration in progress.** The W1.12 follow-up
   review (`c6bb8a8e`) found that the follow-up's Action-phase lock change has no measured effect, and that
   ClockHeist's flat economy comes from spawn-square clogging (its units sit on rich cells of its own spawn
   rectangle, so its Place phase has no legal buy square), not from Place-phase droning as the follow-up
   diagnosed. `hard@desktop`-vs-`ClockHeist` calibration runs (fixed:60000, the first four `p1-dev` openings,
   seeds 20260979 and 20260978, scratchpad `calib/r0-desktop{,-b}`) give, by handicap: **0 → 7/8**, **4 and 8
   → 8/8**, **12 → 6/8** in the first batch and, combined across both batches at handicap 12, **4 losses in
   the 12 games where desktop played White** (0 losses in the 12 desktop-Black games); **16 and 20 → desktop
   won every game, White seat included**. All five desktop losses were kill-clock losses at turn 5. These are
   calibration numbers, not a frozen A8 handicap choice — see Placeholders below.

## What did NOT change

- `hard@desktop`'s resolved configuration and hash (`DESKTOP_WALL3000_HASH`, `5de7ae20…`) — byte-identical on
  every step; every new key is optional and absent on every shipped profile but `hard@strategos`.
- The default browser profile stays `hard@desktop`; `hard@strategos` is reachable only by name: the lab
  ladder's `hard@strategos`, the seat's `profile` config field and the browser's `?hardEngine=strategos`
  opt-in (W1.14).
- `DEFAULT_WEIGHTS` — untouched; `strategosPatch()` carries no `weights` key of its own.
- The rules revision (`muju-phasing-4`) and the canonical engine (`src/game/**`) — untouched throughout; every
  strategy module reads a packed root and writes nothing back to the canonical state.
- The 2026-09-21 strength knobs (`StrengthKnobs`) — unchanged in shape. The bug that makes R2/R3 dead in real
  search is pre-existing; W1.8 found it and its review confirmed it (see DEVIATIONS.md).

## Open follow-ups

**For Workflow 2** (plan Part C, not executed now): the belief table over unresolved claims
(`strategy/belief.ts`), value-of-information query selection (`strategy/voi.ts`), the second loop (Build →
threshold → Strike), then the goal catalogue one family at a time, and cross-turn plan memory once it is a
pure function of room history. Workflow 1's `Claim`/`AnalysisQuery`/Chronicle types (W1.0, W1.0b) exist to
give Workflow 2 typed facts to attach likelihoods to.

**Inside Workflow 1, still open:**
- W1.9 and W1.10 (plan injection and the veto) — in progress in another lane as of this record.
- W1.13 (wave-1 exam cases) and the pilot-branch half of W1.14 — pending; plan B.2 runs both on the pilot
  branch after the master merge.
- `TurnGenerator.prepareTables`'s dead `EvalFix` read (W1.8 review finding) — stamp the real `evalFix` onto
  it, or pass it through explicitly, so the 2026-09-21 strength knobs mean something in real search.
- ClockHeist's spawn-clog root cause (W1.12 follow-up finding) — the Action-phase lock fix has no measured
  effect; a real fix has to keep ClockHeist's spawn rectangle open so its Place phase has a legal buy square.
- Whether `promoteExhaustive` should also reach `genInterior`/`genQuiesce` — falsifier: the R1 ladder row or
  wave 2 showing a promotion-choice regression root-only wiring would have caught (coordinator decision 4).
- Commit-attribution corrections at squash/merge time: five implementer commits (`552d1fa4`, `a5d198ba`,
  `5c88e23d`, `45b72c21`, `e203c09c`) carry "Claude Sonnet 5" trailers instead of the lane brief's required
  "Claude Opus 5.5 (1M context)" line; each lane's own review commit uses the correct trailer and was not
  rewritten to fix the implementer commit (no rebase).

## Placeholders (coordinator to fill)

- **Gate 0 results.** W1.11 ran Gate 0 for `hard@desktop` only (`6c99447a`, `c7c8b3b2`), all exit 0:
  `hard:perft --check` on both engines, `hard:fuzz --actions 20000 --seed 7101` (0 divergences), and
  `hard:determinism --positions-file lab/hard-ai/positions/p4-determinism.jsonl` (24/24 identical at work
  25000; 48/48 at 25000,400000). The `hard@strategos` row (plan B.3 item 3) is pending W1.9/W1.10.
- **Rows R0/R1.** The handicap numbers under coordinator decision 6 are calibration on `p1-dev`, not the
  frozen A8 row (`hard@desktop` vs `ClockHeist`, fixed:60000, seed 20260980,
  `--openings p1-val.jsonl --handicaps 0 --pairs 32`) — that exact row, and R1 (`hard@strategos` vs
  `ClockHeist`, same axis, target score > 0.5 and LOS ≥ 95%), are pending amendment A8 and W1.9/W1.10.
- **Deploy evidence.** None yet. Plan B.3 items 5–7: `npm test` and `e2e/ai-worker.spec.ts`, a Watch-AI
  browser smoke with `?hardEngine=strategos`, an engine-seat smoke with `profile: 'strategos'`, then deploy
  per standing permission (Render, Pages) with the default profile still `desktop`.
- **DAG walk.** `python3 tools/muju-content-dag.py plan --kind ai` has not been run for this campaign.
