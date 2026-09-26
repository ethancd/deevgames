# STRATEGOS, revised: one strategic loop first, the glorious future after

## Context

Wave 1 (34 LLM-vs-Hard games, 2026-09-24) showed Hard losing 6 of 7 games on the kill clock: it never plans contact
when behind, and it reads the current mined lead rather than the projected one. Its search is width-limited (eight
times the work buys under one macro-ply), and its eval cannot express "who wins the clock at ply ten" because that is
a computed projection, not a linear feature. The p3 retune could not have found this: its ladder opponents (Rush,
Balanced, Expand, AIEngineV2) never reach the clock (0 clock games in Stage A, 2/288 in B, 2/256 in C), so the
development process was measuring the wrong failure mode.

The original STRATEGOS plan (`PLAN-original.md` in this folder) proposed an eight-layer planner,
a sixty-goal catalogue and a build-by-derivation methodology. Two reviews (mine, Codex's) agreed on the ambition and
disagreed with the delivery order, the soundness claims and the "no weights" framing. This revision keeps the
ambition and re-sequences it:

- **Workflow 1 (this plan's executable part):** a playable `hard@strategos` that projects the clock exactly, holds a
  real lead, and forces contact when it is losing the clock, with a tactical contract check instead of a
  material-loss veto, a ClockHeist scripted opponent so the ladder can see the failure, wave-1 exam cases, and
  per-search telemetry. Then Ethan runs LLM wave 2 against it.
- **Workflow 2 (default next, not executed now):** Bayesian beliefs over unresolved plan claims + value-of-information
  query selection, then the goal catalogue, postures, war room, recognition. Sketched in Part C so it is not lost.

## Part A — Response to the Codex critique and the Bayesian proposal

Adopted wholesale, with what it changes in the plan:

1. **Every calculation states its guarantee.** Three feasibility grades replace "feasible": `not-ruled-out`
   (an optimistic bound like killETA says it isn't impossible), `witnessed` (a replayable line achieves it against a
   passive or scripted opponent), `forced` (achieves it against every legal reply, i.e. a proof). Plus `unknown`. The
   original plan's "killETA ≤ deadline ⇒ feasible" is invalid and is gone. Stay-put mining is a conditional forecast,
   so the ledger returns an interval `[L, U]` with the assumptions that produce L (no unit dies, no relocation, rent
   paid) written into the struct. An *exact* clock verdict requires: both sides' intervals disjoint, no kill possible
   by either side within the remaining plies (a proof, from the multi-turn kill table), and no home/elimination ending
   provable earlier. Anything short of that is `bounded` or `projected`.
2. **Tactics check the campaign's contract, not material.** A plan declares: permitted expenditure (units/crystals
   it may lose), essential survivors, deadline, and the required end predicate (e.g. "a damaging attack has been
   made by ply p" or "enemy killETA against us > plies remaining"). The search's job is to falsify the contract. A
   sacrifice is rejected because it fails to buy contact, not because it loses a unit. Reflexes are subordinate to
   the active contract: "take a free kill" is suppressed under `Hold/DontReset` when the kill resets a clock we are
   winning. (This was a real contradiction in the original.)
3. **The decision rule is written before "no weights" is claimed.** Channel comparison is fixed as: (i) any
   *proven* ending decides, earliest ply first, *provided the certificate excludes earlier endings* (a proof that is
   conditional on "no home threat before ply 6" carries that assumption and is downgraded to `bounded` if an earlier
   channel is unresolved); (ii) bounded endings, earliest first; (iii) projected, earliest first, margin in the
   channel's own unit. There is no "average across channels" and no crystal-valued combat thresholds in Workflow 1:
   the only tie-break inside the clock channel is mined-total margin. Worked comparisons live in the spec before code.
4. **Opponent intentions and the goal catalogue are hypotheses.** "Recognition is reliable, bluffing impossible" is
   struck. In Workflow 1 there is no recognition at all: the opponent model is (a) the tactical search's replies and
   (b) two scripted responses (continue-as-observed, evade-contact). Workflow 2 introduces a belief table.
5. **Rules, derivations, engineering choices are labelled.** Each constant in the new code carries one of
   `RULE (src/game/...)`, `DERIVED (spec §…)`, `CHOICE (why; falsifier)`. "Every constant derives from Part I" becomes
   "every constant says which category it is and what would falsify it".
6. **Tests challenge assumptions, not just consistency.** Paired positions that differ in one fact (clock value,
   mined lead, rescue capacity, anchor alive) and must flip the decision; small exhaustive positions where the exact
   verdict is brute-forceable; off-script legal replies. Wave 1 is a *diagnostic regression corpus*, not a held-out
   set; genuinely held-out evidence is wave 2 (LLMs) and a preregistered ladder row. F3's cause is recorded as
   "hypothesis → distinguishing replay → result", not asserted.
7. **One complete loop first.** Hold vs ForceContact end to end, then Build → threshold → Strike, then the catalogue.

Bayesian/VOI proposal: accepted as Workflow 2's core, because Workflow 1 must first produce the exact facts and
the queries (ledger interval, multi-turn kill bound, contact witness search) that beliefs would be *about*. What
Workflow 1 does to prepare for it: every strategic fact is a typed `Claim { status, evidence, assumptions }`; every
search the strategic layer runs is an `AnalysisQuery` with a work cost and a discrete outcome
(`refuted | witnessed | unresolved`), so likelihoods can be attached later; the Chronicle logs question → result →
plan change per turn. "None of it is statistical" is dropped from the methodology.

## Part B — Workflow 1: a playable clock-aware engine

### B.0 What the code has and lacks (from exploration, all verified)

- **Have:** running mined totals with Black's handicap folded in (`gained[]`, `core/state.ts:713-721`); the
  clock terminal decided at hand-off with ties as draws (`state.ts:1373-1379`); one-turn kill tables
  (`tables/kill.ts`), strike areas and per-square nearest-unit costs (`tables/threat.ts`), a pass-only economy
  forecast whose result is discarded (`tables/phasing-economy.ts`, `tables/context.ts:328`); FORCED injection that
  survives width truncation (`gen/generate.ts:1324` `injectLine`, installed like `setRescueWitness`); a lab pattern
  for full-window per-candidate search (`lab/hard-ai/verify/reference.ts:519-600`); scripted-bot registry
  (`lab/harness/bots/index.ts`); exam schema with state positions (`lab/hard-ai/exam/format.ts`).
- **Lack:** any mined-total projection; any multi-turn kill bound; a PV on `RootResult`; any strategic intent;
  a clock-aware scripted opponent; Phasing exam cases (the 149 dev cases are all Standard and quarantined);
  DESIGN text for the kill clock. `KILL_CLOCK_SOFT_CC` (flat ±200 beyond two hand-offs, `eval/evaluate.ts:209-229`)
  is F1's root; `DrawPressure` is sign-only (`eval/features.ts:377-403`); invariant 16 still penalises sitting on a
  lead at weight −200 (`eval/invariants.ts:248-266`, `eval/weights.ts:57`); `killClockRootClock` is a module global
  set only on the wall-clock path (latent cross-search leak on fixed work).
- **Constraints:** `hard@desktop` must stay byte-identical (config hash pinned in `tests/lab/baseline-identity.test.ts`),
  so every new knob is an optional key on `SearchFix`/`EvalFix`; DESIGN §9 needs a dated addendum before merge;
  the wave-1 engine seat lives on the unmerged branch `claude/muju-llm-pilot`; rules are `muju-phasing-4` with no
  strength amendment yet (A7 covers phasing-3).

### B.1 Design (the strategic loop, minimal)

Modules under `src/ai/hard/strategy/`, all pure functions of the packed root position (no cross-turn memory in
Workflow 1, so `hard:determinism` stays meaningful):

| Module | Computes | Guarantee | Oracle |
|---|---|---|---|
| `ledger.ts` | per side, over the r = 10 − clock remaining plies: `now` (gained), `L` stay-put closed form Σ min(mine·n, reserve) with shared-cell reserves + pending arrivals, `U` best reachable cell per unit + affordable buys on best spawn squares | `L` exact under stated assumptions (no death, no relocation, no cancelled arrival); `U` a sound upper bound | `L` = pass-only `phasingEconomy` mined total where both defined; random legal playouts never exceed `U` |
| `killeta.ts` | `killETA[side]`: lower bound on plies until `side` can kill any enemy unit (damage assembly ignoring blockers, plus buy arrivals) | lower bound only; proves impossibility, never feasibility | brute force on authored boards: no witnessed kill earlier than the bound |
| `clock.ts` | `ClockReading { r, ledger, killETA, verdict, margin }`; verdict ∈ proven-win/loss (intervals disjoint AND both killETA > r), bounded-win/loss (disjoint, kill not ruled out), open (overlap). Posture: Hold on win, ForceContact on loss, none on open | as labelled | paired positions: flip one fact (clock, lead, a unit) → verdict flips |
| `contact.ts` | ForceContact candidates, FORCED-injected: approach the cheapest target (minimise killETA), buy the fastest affordable class nearest the enemy, promote across a one-shot threshold. Contract: deadline r−1, end predicate "damaging attack made" or "verdict flipped", permitted loss declared | witnessed by rollout against two scripted replies (continue, evade); never claimed forced | exam cases AS01-W, OP01-W, SO02-B |
| `hold.ts` | Hold candidates: retreat out of `strikeArea`, break cleave chains, pass. Contract: essential = every unit inside the lead's margin; end predicate "enemy killETA > r at every hand-off" | same | SN05-W final ply; paired positions |

Eval under the strategos flag: a kill-clock terminal is terminal-scale when the root reading is proven or the
terminal is within the forced hand-offs; otherwise `BOUNDED_CLOCK_CC` (CHOICE: WIN_CC/8; falsifier: the paired
exam cases) signed by the verdict. DrawPressure becomes projected-margin × clock² (CHOICE). Invariant 16 off.
`killClockRootClock` set on both search paths.

Veto rule at the root (after iterative deepening): play the best plan-consistent candidate unless its searched
score is terminal-scale worse than the tactical best (a proof: mate or proven clock loss) or the contract's
essential unit is lost in the first reply. Material loss is not a veto. A `strategy` block on `RootResult`
(reading, posture, injected candidates, chosen, veto reason) is the Chronicle.

Cheap exact fixes shipped alongside, both flag-gated: zero-damage attack prune in `ActionSearch.dfs` (proof:
`canonical-check` end-set equality), exhaustive promotions in `planPromotions` ignoring `bestMission` (proof: every
legal promotion appears in some root candidate on a fixture set; canonical-check unchanged).

Lab and release: `ClockHeist` scripted bot (drone, expand to a flank, free kills only when behind, retreat and pass
when ahead at clock ≥ 3); wave-1 exam cases fetched from production room positions into `exam/cases/p4-dev.jsonl`
with a new plan-level witness kind; engine-seat `search` telemetry gains scoreCc, clock, mined totals and the
strategy block; profile selectable in the seat config and via `?hardProfile=strategos`; DESIGN §9 addendum; A8
amendment for phasing-4 with seed series 2026098x; Gate 0 with a Phasing determinism corpus; Gate 2 rows
(strategos vs ClockHeist, vs aiv2-hard-turn, vs hard@desktop) plus a baseline desktop-vs-ClockHeist row that
documents the failure; change record; DAG walk. Default browser profile stays `desktop` until wave 2 says otherwise.

### B.1a Owner decisions (2026-09-24)

- **Wave 2 seat:** Workflow 1 lands on master with the seat profile selector; wave 2 runs from
  `~/src/deevgames-llm-pilot` after merging master into `claude/muju-llm-pilot`. The pilot branch's seat keeps
  its heavy-slot and readiness code; the profile selector must be added to *both* runners (master's and, on merge,
  the pilot's) or the merge conflict resolved to keep both.
- **F4 (exhaustive promotions):** in Workflow 1, flag-gated.
- **Box time before wave 2:** Gate 0 plus the two ClockHeist rows only (desktop baseline, strategos). The aiv2 and
  desktop non-regression rows run after wave 2 under amendment A8.

### B.1b Code facts that corrected the design (from the Plan agent's check against origin/master `40abe152`)

- The live desktop config-hash pin is `DESKTOP_WALL3000_HASH = '5de7ae20…'` at `tests/lab/ablate.test.ts:222`
  (`4e7afdf7…` is the Standard-era value). That hash is the invariant.
- `killClockRootClock` starts at `INACTIVITY_LIMIT−1`, so on the fixed-work path desktop today scores every clock
  terminal as forced. Setting it on the fixed path would change desktop's bytes. Strategos must *save, set, restore*
  the module slot inside `searchRootInner` (synchronous, `try/finally`); `terminalScore`'s signature is pinned by
  `tests/ai/hard/interfaces.test.ts:962`, so no new parameter.
- `nearestOwner` uses `t.dist`, which treats units as blockers, so it can overstate distance. `killETA` needs
  empty-board distances from `core/movement`, both sides approaching, damage landing within one attacker turn
  (heal at hand-off, `state.ts:1413-1417`), 4 actions/turn, and the best affordable buy/promotion. Expect proven
  verdicts mostly when few plies remain.
- `injectLine` forces an Act line only; a ForceContact buy or promotion must be injected as a complete turn line
  (END_ACTION → PAY_UPKEEP → BUY/PROMOTE → END_PLACE).
- Emitting every promotion does not get it past `buildCombos` (prunes to 24 by score) or the K=24 root cut; pin one
  bare promotion-only combo per promotion and assert recall on the combos, report recall after the K cut.
- `claude/muju-llm-pilot` already has `lab/hard-ai/analyze/from-room.ts` (1,345 lines) and verified replays for
  AS01-W, FB01-B, OP01-W, OP02-B, OP02-W, SO01-B, SO02-B, plus a `setup.ruleset:'phasing'` recipe replay in
  `exam/format.ts`. So the exam step reuses that and runs in the pilot worktree after the master merge; cases are
  `kind:'recipe'` and live in `lab/hard-ai/exam/cases-p4/dev.jsonl` (`run.ts` takes `--cases-dir`).
- `?hardProfile` selects the device (desktop/phone); the strategos patch must live in `src/ai/hard/config.ts` and be
  selected by a separate `?hardEngine=strategos`.
- Zero-power attacks exist (`combat.ts:94` clamps at 0); the prune condition is `power === 0`, never
  `power < effectiveDef`, so chip damage survives.
- Ledger parity: mining happens in `makeEndAction` before the clock check, so the root mover mines ⌈r/2⌉ times and the
  opponent ⌊r/2⌋. `L` must also copy `defaultKeep`'s upkeep-release order and pending arrivals' mining to match
  `phasingEconomy`.
- ClockHeist's ladder identity is its name alone; freeze it before A8, rename (`ClockHeist-v2`) on any change.
- The DrawPressure replacement must be clamped to the feature's ±100 range (weight −8 → ≤ 800 cc).

### B.2 Steps (dependency order; one PR each; Sonnet-executable with the tests as acceptance)

Worktree: fresh, off `origin/master` (local `master` lacks PRs #35–#38). Branch `claude/strategos-w1`.
Invariant on every PR: `tests/lab/ablate.test.ts` desktop hash `5de7ae20…` unchanged; `hard:test` green.

| Step | Content | Files | Acceptance | Size |
|---|---|---|---|---|
| W1.1 | Flags + profile scaffold | `src/ai/hard/config.ts` (optional `SearchFix.pruneZeroDamage/strategyPlans/strategyVeto/killClockPolicy:'ledger'`, `EvalFix.clockLedger/promoteExhaustive`, exported `strategosPatch()` with no `weights` key); `lab/hard-ai/bots/hard.ts` `hardConfigFor` case `'strategos'` = `{...DESKTOP, ...strategosPatch()}` | new `tests/lab/strategos-identity.test.ts`: hash ≠ desktop, `weights.version !== 0`, DESKTOP canonical JSON unchanged, flags absent from all shipped profiles | S |
| W1.2 | Per-search clock policy (leak fix) | `eval/evaluate.ts` `setKillClockPolicy({rootClock, reading})` + getter; `search/root.ts` save/set/restore under the flag | new `tests/ai/hard/kill-clock-policy.test.ts`: desktop fixed-work result identical with/without a prior strategos search in-process; `hard:cross-commit` desktop rows byte-identical | S |
| W1.3 | `strategy/ledger.ts` | reuse `core/income.ts` (`projectedIncome`, `upkeepDue`), `p.reserve`, pending table (`PEND_STRIDE`), `t.spawn`, `defaultKeep` order from `tables/phasing-economy.ts:95-110` | new `tests/ai/hard/strategy-ledger.test.ts`: `L − now === Σ income[0..k)` from `phasingEconomy` on p1-dev + random Phasing positions; parity count; rot180/side symmetry. New oracle `lab/hard-ai/oracles/clock-ledger.ts` (pattern `oracles/phasing-economy.ts`): random playouts never exceed U; small-N copy in `tests/lab/clock-ledger-oracle.test.ts` | M |
| W1.4 | `strategy/killeta.ts` (lower bound only) | empty-board distances via `core/movement`; `cat.power/powerIndex`, `cat.def`, `cat.spd`; cross-check with `tables/kill.ts` `killTable` and `cleaveChain`; arrivals via `strikeIfBoughtArea` | new `tests/ai/hard/strategy-killeta.test.ts`: whenever `killTable('current')` finds a kill, killETA ≤ 1 (`'nextAct'` → ≤ 2); far-apart fixtures give killETA > r. New oracle `lab/hard-ai/oracles/killeta.ts` extending `oracles/kill.ts` playouts: first kill ply ≥ bound | M–L |
| W1.5 | `strategy/clock.ts` `clockReading` | verdict table: proven-win iff `L_me > U_opp` (strict; tie = draw) and both killETA > r; bounded iff disjoint; open iff overlap; posture Hold/ForceContact/none | new `tests/ai/hard/strategy-clock.test.ts`: verdict table on hand-built states, exact ties, killETA gate, side-swap mirror, paired one-fact flips | S |
| W1.6 | Eval under `EvalFix.clockLedger` | `eval/evaluate.ts` `decidedCc` (win-scale when proven or `ply ≤ 2`, else `±BOUNDED_CLOCK_CC = WIN_CC/8`, CHOICE); `eval/features.ts:377-403` DrawPressure = clamp(projected midpoint margin)·clock²/100 within ±100, antisymmetric; `eval/invariants.ts:266` inv16 gated off. Desktop branches untouched | extend `tests/ai/hard/kill-clock-terminal-score.test.ts`; new `tests/ai/hard/strategos-eval.test.ts` (antisymmetry; inv16 never set under flag; flag absent → feature/invariant vectors byte-identical on a corpus); `interfaces.test.ts` unchanged | M |
| W1.7 | Zero-damage prune | `gen/actionsearch.ts` dfs loop (`:589-600`) skip ATTACK with `power === 0` via a `setPruneZeroDamage` setter added to `gen/generate.ts` (pattern `setRescueCap` `:353-370`); `engine.ts` wires from `searchFix` | new `tests/ai/hard/zero-damage-prune.test.ts`: naive vs pruned end-position sets equal, fewer nodes, flag absent → identical `Turn` list; `oracles/canonical-check.ts` gains `--prune-zero-damage` + a Phasing fixture with 0-power pairs | S |
| W1.8 | Exhaustive promotions | `gen/promote.ts` `bestMission` → `Mission.ANY` (benefit 0) instead of −1 under flag; `planPromotions` up to `MAX_SLOTS`; `gen/generate.ts` `buildCombos` pins one bare promotion-only combo per promotion; `forcedOnly` branch unchanged (documented) | new `tests/ai/hard/prepare-recall.test.ts`: every `canPromote` slot appears in combos (`setTrace`/`tracePlace`) on a fixture set; root recall after K cut reported; canonical-check unchanged | M |
| W1.9 | Plan injection `strategy/contact.ts`, `strategy/hold.ts` | `gen/generate.ts` `setStrategyWitness` called from `inject()` at ply 0, complete turn lines through `injectLine`; `gen/turn.ts` `TurnFlag.STRATEGY = 16384`; `search/root.ts` `installStrategyWitness` (root owns the callback; `gen` never imports `strategy`); `search/order.ts:390-400` ply-0 ordering bonus; Hold reuses `injectRetreat` + QUIET pass. Each plan: `{permittedLoss, essentialSlots, deadlinePly, endPredicate}` | new `tests/ai/hard/strategy-plans.test.ts`: injected turns pass `verifyTurn`, flagged `FORCED|STRATEGY`; ForceContact → killETA after ≤ before; Hold → enemy killETA after ≥ before and pass present; flag absent → byte-identical candidates; extend pinned flag list `interfaces.test.ts:814-817` | L |
| W1.10 | Veto + `RootResult.strategy` | `search/root.ts` after `iterativeDeepening` (`:463-498`): pick best plan-consistent candidate; full-window re-search of that one candidate at `depth−1` using exported `pvs/makeTurn/unmakeTurn` (pattern `lab/hard-ai/verify/reference.ts:519-600`), charged to the meter from a reserved share (CHOICE); veto only on mate, proven clock loss, or an essential slot dead after the best reply. Add optional `RootResult.strategy?: {reading, posture, injected, chosen, veto?}` | new `tests/ai/hard/strategy-veto.test.ts`: mate fixture vetoed with reason; material-loss-only fixture not vetoed; two fixed-work runs identical including the block | L |
| W1.11 | Phasing determinism corpus + Gate 0 | `lab/hard-ai/verify/determinism.ts` `--positions-file`; new `lab/hard-ai/positions/p4-determinism.jsonl` from p1-dev openings | new `tests/lab/determinism-phasing.test.ts`; `hard:perft --check` (both engines), `hard:fuzz --actions 20000 --seed 7101`, `hard:determinism` for desktop and strategos all exit 0 | S |
| W1.12 | ClockHeist bot | new `lab/harness/bots/clockheist.ts` (reuse `bot-utils.ts`, `src/game/inactivity.ts` `minedTotal`, `state.inactivityPlies`); `FACTORIES` entry in `lab/harness/bots/index.ts`; name must not match `/AntiRush|Guard/` | new `tests/lab/clockheist.test.ts`: legal over seeded games vs Random and `Hard-25k`; same rng → same game; ahead at clock ≥ 3 → pass or retreat; `ladder/engines.ts` resolves it | M |
| W1.13 | Wave-1 exam set (**in the pilot worktree after merging master in**) | `analyze/from-room.ts` for SN05-W (others exist) → `from-loss.ts`; `exam/format.ts` `ExamKind 'plan'` + `PlanWitness{predicate: damaging-attack | no-clock-reset | spawn-area-open | promotion-made | contact-in-n}` evaluated in `exam/witness.ts` by replaying `result.actions`; `exam/run.ts` scores it; new `lab/hard-ai/exam/cases-p4/dev.jsonl` (AS01-W r6, OP01-W r3/r6, SO02-B late, FB01-B, SN05-W final [Hold correct], OP02-W r18, SO01-B r21 [expected fail, recorded]) | new `tests/lab/exam-p4.test.ts` (not quarantined): cases load, digests match, each predicate holds on an authored good turn and fails on a bad one; engine scores go to an artifact, not the test | M–L |
| W1.14 | Telemetry + profile selection (**pilot worktree**) | `tools/engine-seat/{config,contract,main,runner}.ts`: seat `profile` → `hardEnginePatch(profile)`; `search` event adds `scoreCc`, `clock`, `minedTotals[2]`, `strategy`; browser `src/ai/hardOptIn.ts` + `hooks/useAI.ts` `?hardEngine=strategos` → `strategosPatch()` (worker `hardPatch` strips placeholder weights as now) | extend `tests/lab/engine-seat.test.ts`; opt-in test asserts desktop's request byte-unchanged | M |
| W1.15 | Release | `docs/hard-ai/DESIGN.md` §9 addendum (`### 2026-09-2x — strategos …`, What changes / Why / What did NOT change) **before merge**; `docs/hard-ai/design/DEVIATIONS.md` (veto overriding search, beam shift from the prune, leak save/restore); amendment **A8** in `PHASING-PREREGISTRATION-2026-09-18.md` before any row: `muju-phasing-4`, p1-val 32 openings, seat-mirrored, seeds 2026098x; change record `docs/changes/2026-09-2x-strategos-w1.md`; `python3 tools/muju-content-dag.py plan --kind ai` walk | rows below | M |

A8 rows (R0 and R1 before wave 2; R2 and R3 after):

| Row | A | B | Work | Seed | Bar |
|---|---|---|---|---|---|
| R0 baseline | `hard@desktop` | ClockHeist | fixed:60000 | 20260980 | documents the failure (expect clock losses) |
| R1 | `hard@strategos` | ClockHeist | fixed:60000 | 20260980 | score > 0.5, LOS ≥ 95% |
| R2 (after wave 2) | `hard@strategos` | `aiv2-hard-turn` | wall:6000 | 20260981 | Elo lower bound > 0 (LOS ≥ 97.5%, as A7 G2-1) |
| R3 (after wave 2) | `hard@strategos` | `hard@desktop` | fixed:60000 | 20260982 | informational |

Order of PRs: W1.1 → W1.2 → W1.3 → W1.4 → W1.5 → W1.6 → (W1.7, W1.8, W1.11, W1.12 in parallel) → W1.9 → W1.10 →
W1.15 (A8 + R0/R1 + Gate 0 + docs) → merge → merge master into `claude/muju-llm-pilot` → W1.13, W1.14 there →
wave 2. Agents: Sonnet for W1.1–W1.3, W1.7, W1.8, W1.11, W1.12, W1.14; Opus for W1.4, W1.9, W1.10, W1.13;
Fable only for the DESIGN addendum and the A8 text review.

### B.3 Verification (end to end)

1. Every PR: `npm run hard:types && npm run hard:test` green; `tests/lab/ablate.test.ts` desktop hash unchanged.
2. After W1.10: `npm run hard:exam -- --cases-dir lab/hard-ai/exam/cases-p4 --stratum dev --engine hard@strategos --work 60000`
   (once W1.13 exists) and the same with `hard@desktop`; the difference is the Chronicle-level evidence.
3. Gate 0 (both profiles): `hard:perft --check`, `hard:perft --check --engine replica`, `hard:fuzz --actions 20000 --seed 7101`,
   `hard:determinism --engine hard@strategos --positions-file lab/hard-ai/positions/p4-determinism.jsonl`.
4. Rows R0 and R1 via `lab/hard-ai/ladder/run.ts` at `MUJU_HEAVY_SLOTS=4`, `--openings p1-val.jsonl --handicaps 0 --pairs 32`;
   read `winType` distribution: R0 shows `kill-clock` losses, R1 does not.
5. `npm test`, `e2e/ai-worker.spec.ts`; browser smoke with `?hardEngine=strategos` in Watch-AI.
6. Engine seat smoke in the pilot worktree with `profile: 'strategos'` against a scripted room; `search` events carry
   the new fields.
7. DAG walk and change record; deploy per standing permission (Render, Pages); default profile stays `desktop`.

## Part C — Workflow 2 (default next, not executed now): beliefs, VOI, the catalogue

Preconditions from Workflow 1: typed `Claim { status, evidence, assumptions }` for every strategic fact; every
strategic search an `AnalysisQuery { workCost, outcomes, run }`; the Chronicle logging question → result → plan change.

1. **Belief table over unresolved claims** (`strategy/belief.ts`): a small explicit hypothesis table
   (opponent policy × unresolved tactical facts) with joint mass, updated by Bayes' rule from (a) observed opponent
   actions via inverse-planning likelihoods and (b) internal query results with likelihoods of 0/1 for exact
   queries and `refuted | witnessed | unresolved` for bounded searches; unresolved leaves mass unchanged until an
   observation model exists. Plan completion probability = Σ_h b(h) P(F_π | h). Never multiply independent-looking
   confidences; the hypotheses share the opponent's four actions.
2. **Value of information** (`strategy/voi.ts`): utility win/draw/loss = 1/½/0; one-step VOI(q) = Σ_o P(o) V(b_{q,o}) − V(b);
   query selection by VOI per work unit with a reserved tactical budget and a few small bundles; sensitivity checks
   on priors and detection rates documented with each. First decision: Hold vs ForceContact, with queries
   "can the anchor be killed before promotion", "find a contact line within r", "tighten the mined interval".
3. **Second loop:** Build → threshold → Strike, proving an unproductive-looking preparation survives tactical scrutiny.
4. **Then the catalogue** from the original plan's Part III, one family at a time, each goal with its feasibility
   grade, contract, counters and paired tests; postures; recognition as hypotheses; the war room over scripted
   responses plus a common baseline response set and an off-script tactical refutation search.
5. Cross-turn plan memory only once it is a pure function of the room history (determinism gate extended).
