HEADLINE: The new Hard engine (src/ai/hard, hard@desktop) has never played a recorded game under Phasing, so its strength relative to AIEngineV2-hard is unmeasured. Every Gate 1 game, including the 1,024-game A2 row, had AIEngineV2 in the "hard" seat. The identity files say "Hard replica is not an arm in Gate 1 and is never instantiated". The only numbers on the new engine are suite scores. It is tactically sound (tactics 61/63, home-mate 28/28, home-fortify 6/6) but fails three of six v2 floors (invariants 8/15, economy 19/20, summon-disruption 12/14). It runs on a 5-of-62-nonzero bootstrap evaluation and reaches only depth 2–3 at 120k work.

## Remaining work
- S: Audit v2 invariant fixtures inv8-no-pre-adjacency and inv7-promote-no-runway. In inv8 both members are proven mates for the opponent; in inv7 the 'violating' member is a proven win. If they are defective they need a v3 manifest and a new contract under the no-edit rules. Blocked by nothing; read-only analysis of the existing cases.jsonl.gz plus fixtures.
- M: Run an unsealed, dev-openings head-to-head of hard@desktop vs aiv2-hard(-turn) under muju-phasing-2 via npm run hard:ladder, reporting h0/h3 and Rush side by side. This is the cheapest way to turn 'unmeasured' into a number. Blocked by: confirming the ladder's aiv2 turn adapter funds searches correctly (the A5 adapter defect was in gate1-bot, so check whether the ladder shares it); an idle machine.
- M: Give the Hard evaluation nonzero hand-set prior weights for hanging/threat, mobility/centre, DisruptPressure and the invariant slots, so search stops being indifferent. This is the direct fix for 4–5 of the 7 invariant misses and for the preview blunders. Blocked by: a process decision. The M6 contract forbids choosing coefficients from the suite misses, so it needs either the corpus→fit→val route or an owner-approved amendment allowing hand-set priors.
- L: Full M6: corpus → Texel fit → validation. Five blockers from M6-STATUS, none started: (1) freeze the data allocation and sampling protocol; (2) diversity ceiling, since 48 dev openings × 2 handicaps and a deterministic engine give at most 96 distinct self-play trajectories, so a diversity-generating producer is needed; (3) bind candidate weight files and hashes into ladder workers, as no CLI exists; (4) freeze the tunable parameter domain (75 of 80 parameters currently free); (5) freeze val criteria and a stopping rule.
- M: Finish the Gate 1 instrument per A5 (per-search calibrated funding with a p95 per-turn ceiling). Then run an eligible idle-machine calibration (48 openings × 2 handicaps, full-length), a new pilot (seed 20260963) and the 768-game row (seed 20260960, about 9 h wall at 8 shards). Blocked by: the adapter rewrite and an idle machine.
- S/M: Re-measure the suites after any engine or weights change. This requires a new floor-contract commit with new engineSourceSha256/weightsSha256, committed alone, then a new measurement and ledger line. Blocked by: the engine change itself.
- M: Investigate search depth. 120k work yields only depth 2 in summon-disruption roots and depth 2–3 typically, so profile Prepare-phase branching and purchase generation. Blocked by nothing, but lower priority than evaluation terms.
- L: Gate 2 (sealed, 32 pairs, seed 20260953, wall:8000, consumed once) and Gate 3 responsiveness (desktop p95 ≤ 6,000 ms, phone p95 ≤ 3,000 ms). Blocked by: Gate 0 (suites ≥ floors) and Gate 1 passing.
- S: Repair the red default test suite: ablate.test.ts (13 failures) and analyze-work-sweep.test.ts (3) need porting or quarantine. Commit 40260ce says the ablation arms and engine seat were ported, so re-verify the current count. Blocked by nothing.

## Open questions
- Is the owner willing to relax the preregistration regime for the Hard engine? That could mean hand-set eval priors and an unsealed dev head-to-head as the working strength signal, in order to move fast. The current process forbids choosing any coefficient from observed misses and treats all strength as unmeasured until sealed Gate 2.
- Should the player-facing Hard under Phasing be AIEngineV2-hard or the new Hard engine in the interim? The preregistration's unlock table routes 'Hard' to the aiv2-hard preset until Gates 0+2+3 pass, but the live opt-in preview currently runs engine 'hard' (PREVIEW-REPORTS shows 'hard deep hard').
- Are inv7 and inv8 in the v2 suites mis-authored, given the forced wins inside the pair members? If so the true invariants score is nearer 8/13 than 8/15, and the floor arithmetic changes again.
- How do Hard-engine work units map to wall time on the target devices? No Phasing responsiveness measurement exists for hard@desktop; Standard R2 had mean turn 4,912 ms at wall:8000. The M6 evaluator computes stage-2 at every window ('full evaluation is deliberate… establishes no throughput claim'), so nodes per second may have dropped.
- Does the hard:ladder aiv2 '-turn' adapter have the same follow-up-search underfunding defect that A5 found in gate1-bot.ts? If so, any quick head-to-head would flatter the new Hard engine.
- AIEngineV2-hard loses to scripted Rush about 90% of the time under Phasing. Is beating aiv2-hard even the right bar for 'strong moves by default', or should the practical bar be beating Rush, Expand and Balanced plus the owner's eye test?
- Was commit 40260ce's port of the ablation arms sufficient to make the default vitest run green again? M6-STATUS still records 43 failures, and commit 425efa4 claims '2,853 passed, 0 failed suites'. The two statements are from different times and should be reconciled.

## Findings
- [verified-in-code-or-results] v2 suite measurement (2026-09-19, rules muju-phasing-2, engine hard@desktop after the HOME_RACE fix, weights phasing-accounting-bootstrap-v1) is valid=true, floorPass=false. Tactics 61/63 (min 57) pass, home-mate 28/28 (min 28) pass, home-fortify 6/6 (min 6) pass, invariants 8/15 (min 14) fail, economy 19/20 (min 20) fail, summon-disruption 12/14 (min 13) fail. Total 134/146 offered; coverage 79/79; no fallback, illegal or divergent case. (muju/lab/hard-ai/suites/phasing/results/v2-measure-2-2026-09-19/result.digest.json (floors.families); commit 00dfc8f; floor contract muju/lab/hard-ai/suites/phasing/fixtures/v2/floor-contract.json (allowedMiss tactics 6, invariants 1, home-mate 0, economy 0, summon-disruption 1, home-fortify 0))
- [verified-in-code-or-results] The 12 failing v2 cases are: inv1-spawn-zero, inv2-corner-seal, inv7-promote-no-runway, inv8-no-pre-adjacency, inv12-cleave-line, inv14-liquidity-floor, inv17-self-block, M5-SD-07-split-rectangles, M5-SD-18-arrival-immediate-attack, phasing-tactics-plugged-shadow_1-vs-fire_3, phasing-tactics-two-lanes-fire_2-vs-water_2, relocate-plant_2-e. All 12 carry failure code predicate-miss. (result.digest.json failedOrPartialCases; cases.jsonl.gz rows with status!=pass)
- [verified-in-code-or-results] Four invariant misses (inv1, inv2, inv12, inv17) have static evalGap 0 and searched gap 0. The engine is indifferent because the evaluation has no term for those features. DEFAULT_WEIGHTS has 5 nonzero of 62: Material=100, BankLiquid=100, BankExcess=100, EconDelta=100, PendingValue=1. All invariant, threat, hanging, geometry and disruption coefficients are 0. (muju/src/ai/hard/eval/weights.ts:21-26,44; cases.jsonl.gz evaluation/search values for inv1/2/12/17 (e.g. inv1 eval -100/-100, search 100/100))
- [inferred] The commit message attributes five zero-gap misses to zero eval weights, but inv8-no-pre-adjacency does not fit. Its static evalGap is +300 in the correct direction. Both pair members are solved as a mate for the opponent (source 'mate', depth 1, value 999000 from Black's perspective in both), so its gap of 0 reflects both members being lost. inv7's 'violating' member is scored -998000 for Black, a proven White win, so the engine prefers it for a forced-win reason. Both look like possible v2 fixture defects rather than engine weaknesses and should be audited. (cases.jsonl.gz inv8 execution.search {violating:999000, correct:999000, perspective black}, turns source 'mate'; inv7 search violating -998000 vs correct -600; commit 00dfc8f message)
- [verified-in-code-or-results] inv14-liquidity-floor is a real search-versus-eval disagreement. Static eval prefers the correct member by +300, but depth-6 search prefers the violating member by 100. (cases.jsonl.gz inv14: evaluation violating -500/correct -200 (white); search violating 700/correct 800 (black); depth 6, work 102319/82416 of 120000)
- [verified-in-code-or-results] Both summon-disruption misses are genuine engine misses at shallow depth. M5-SD-07 reached depth 2 with 120,196 work; M5-SD-18 reached depth 2 with 55,960 work. The raider moves but disrupts nothing and the White army count is unchanged. DisruptPressure (feature 60) has coefficient 0. In the v1 measurement all 9 disruption misses were suite defects, because every root had a mate-in-1 that scored zero; v2 added an immediate-win veto. (cases.jsonl.gz M5-SD-07/18 diagnostics; muju/docs/hard-ai/phasing/M6-STATUS.md:198-229 (addendum); m6-suite-measure-1 cases all source 'mate' depth 1)
- [verified-in-code-or-results] The economy miss relocate-plant_2-e mined 4 where at least 5 was required, at 50,000 requested work and depth 3. Economy was 20/20 in the v1 M6 measurement, so one economy case regressed between the two builds. The engine changed (HOME_RACE demotion and related fixes) and the rules revision changed (p1 to p2). (cases.jsonl.gz relocate-plant_2-e predicates (actual 4, min 5), depth 3 work 47132/50000; m6-suite-measure-1 result economy 20/20)
- [verified-in-code-or-results] M6 bootstrap measurement (v1 suites, muju-phasing-1, 2026-09-19 12:29Z, engine identity 06e907b2…) was valid=true, floorPass=false. Tactics 62/63 (57) pass, invariants 5/18 (17) fail, home-mate 28/28 pass, economy 20/20 pass, summon-disruption 5/14 (13) fail, home-fortify 6/6 pass. Total 126/149 with 23 failing cases (13 invariants, 9 summon-disruption, 1 tactics). A4 declares this measurement void under muju-phasing-2. (muju/docs/changes/m6-evaluation-2026-09-19/m6-suite-measure-1/result.json.gz floors; m6-results-independent-review.md:147-154; PHASING-PREREGISTRATION-2026-09-18.md:262)
- [verified-in-code-or-results] The M6-STATUS doc contradicts itself on why the v1 floors failed. The 'Why the two floors failed' section says the engine does not disrupt summons or avoid invariant violations. The addendum in the same file says the SD misses were a suite-authoring defect (winning scored zero) and the invariant misses were arithmetically forced by scoring static eval with zero weights. The addendum is the better-supported reading, since all 9 SD failures show source 'mate' at depth 1. (muju/docs/hard-ai/phasing/M6-STATUS.md:158-168 vs :198-229; m6-suite-measure-1/cases.jsonl.gz)
- [verified-in-code-or-results] In every Gate 1 run the 'hard' seat was AIEngineV2 at the hard preset (MCTS 1200 iterations, beam 50, tacticalDepth 2, WASM solver ABI 7), not the new src/ai/hard engine. The identity files state 'Hard replica is not an arm in Gate 1 and is never instantiated', with hardWeightsVersion null. gate1-bot.ts constructs new AIEngineV2(difficulty). The preregistration defines Gate 1 as a sanity gate on the baseline aiv2-hard. (muju/lab/ai/results/gate1-p2-pilot-2026-09-19/identity.json (hardIdentityNote, configs.hard); muju/lab/ai/gate1-bot.ts:61,141; muju/docs/hard-ai/PHASING-PREREGISTRATION-2026-09-18.md:55-66)
- [verified-in-code-or-results] Gate 1 p2 pilot (muju-phasing-2, seed 20260962, 16 games, 1 pair per cell, dev opening p1-g6-s2, fixed work hard 51,423 / medium 26,159 per own turn, provisional calibration). aiv2-hard W/D/L: Rush h0 1/0/1, Rush h3 0/0/2, Expand h0 2/0/0, Expand h3 2/0/0, Balanced h0 2/0/0, Balanced h3 2/0/0, aiv2-medium h0 0/0/2, aiv2-medium h3 2/0/0. 0 inactivity draws, 0 illegal actions in 2,222 actions. Elo intervals are degenerate (±1200). The run is ineligible, and an erratum records a defective adapter: 44 of 48 follow-up Act searches were funded with 1 work unit. (muju/lab/ai/results/gate1-p2-pilot-2026-09-19/summary.json rows; README.md:58-77,128-137)
- [verified-in-code-or-results] The only full Gate 1 row, A2 (muju-phasing-1, 1,024 games, 128 per cell, fixed work 6,000/3,000, aiv2-hard in the hard seat), FAILED. Rush h0 7/1/120 (Elo -482 [-677,-387]); Rush h3 15/2/111 (-338 [-453,-262]); Expand h0 0/128/0 with 100% inactivity draws; Expand h3 103/25/0 (+386); Balanced h0 121/7/0 (+620); Balanced h3 113/15/0 (+482); aiv2-medium h0 128/0/0; aiv2-medium h3 0/0/128. A3 reclassified the two medium cells as INVALID (deterministic, effective n=1, one pair replicated 64 times) and judged the budgets to be about 3–15% of shipped pace. A4 (20-ply clock) voided all of it. (muju/docs/changes/m4-search-2026-09-19/baseline-a2/summary.json; PHASING-PREREGISTRATION-2026-09-18.md:200-216,254-259)
- [verified-in-code-or-results] Earlier 16-game pilots, all with AIEngineV2 in the hard seat, all ineligible, all muju-phasing-1. t2b (6,000 work): Rush 1/0/3, Expand 3/1/0, Balanced 3/1/0, medium 3/0/1, 2 inactivity draws. t2c (6,000 work, after the purchase-freeze fix): Rush 0/0/4, Expand 1/3/0, Balanced 3/1/0, medium 2/0/2, 4 inactivity draws, Expand h0 100% inactivity. A3 pilot b (calibrated 53,155/27,297): Rush 0/0/4, Expand 3/1/0, Balanced 4/0/0, medium 2/0/2. (muju/lab/ai/results/t2b-gate1-pilot-2026-09-19/README.md:20-29; t2c-gate1-pilot-2026-09-19/README.md:48-66; gate1-a3-pilot-2026-09-19b/summary.json)
- [verified-in-code-or-results] No head-to-head between hard@desktop and aiv2-hard under Phasing exists in the repo. Gate 2 is defined as that strength row (32 pairs, seed 20260953, wall:8000, sealed openings p1-sealed) and has never been run. No Phasing ladder results directory exists. The only hard@desktop-vs-aiv2-hard numbers are from Standard rules: R2 51/0/13, +237 Elo [+141,+385], R1 42/2/20 +124 [+38,+229]. The preregistration says these carry nothing over to Phasing. (PHASING-PREREGISTRATION-2026-09-18.md:11-18,68-84; find/grep for Phasing ladder results returned none; muju/docs/hard-ai/RELEASE-2026-09-18.md:33-34)
- [verified-in-code-or-results] Budgets for the new Hard engine. The v2 suite ran at fixed work, seed 1, desktop profile, EMPTY_BOOK, with 120,000 work on 179 searches and 50,000 on 20 economy searches, for a total wall of 2m45s. Depths on search-sourced results: 2 (22 searches), 3 (39), 4 (5), 5 (17), 6 (5), 10 (2), 12 (9). The 13 summon-disruption searches reached depth 2 twelve times and depth 3 once. The M4/M6 44-root acceptance used 50,000 generation work and 25,000 search work. Gate 2 specifies wall:8000. (v2-measure-2-2026-09-19/cases.jsonl.gz diagnostics (requestedWork, depth); started.json/result.digest.json timestamps 19:44:01–19:46:46Z; M6-STATUS.md:194)
- [verified-in-code-or-results] Budgets for AIEngineV2. Shipped quick allowance is hard 10,000 ms and medium 3,000 ms. WALL calibration gave a median of 53,155 (A3) or 51,423 (provisional, loaded machine) SearchBudget units per own turn for hard and 27,297 or 26,159 for medium. Median hard search time was about 3,000 ms at 1–2 searches per turn. These units are AIEngineV2's SearchBudget#spend and are not comparable to the Hard engine's work units. No eligible idle-machine calibration exists yet. (muju/lab/ai/results/gate1-calibration-2026-09-19/calibration.json (engines.hard, budgets); gate1-provisional-calibration-2026-09-19/README.md)
- [doc-claim-only] The owner's live-preview anecdotes (engine 'hard', pace deep, muju-phasing-2, clean Hard route with no fallbacks) show three positional blunders. One Fire spent all 4 AP shuffling h10–i10–h10–j10 into its own corner. A Lightning dove and promoted to disrupt a 3-crystal summon and was left capturable with no counterplay. A lone Fire was sent across the board and left en prise. These fit an evaluation with no threat, hanging, mobility or centre terms. They are explicitly not preregistered evidence. (muju/docs/hard-ai/phasing/PREVIEW-REPORTS-2026-09-19.md:14-72)
- [doc-claim-only] The HOME_RACE demotion (96eabc6) was a genuine strength fix found by the M4 review. At fixed work over the 44 M4 roots, 13 of 16 searched roots gained a ply and none lost one. Forced overflow fell from 690 to 0. Five roots returned proven results that were previously missed. (commit 96eabc6 message; M6-STATUS.md:225-227)
- [verified-in-code-or-results] Under Phasing, AIEngineV2-hard loses heavily to the scripted Rush bot (A2: 22 W / 3 D / 231 L across both handicaps). A1 made Rush report-only because the Standard-era aiv2-hard also lost to Rush, 1/0/15 in the only legal historical row. The baseline the new Hard engine must beat is therefore weak against rushes, and A1 requires hard@desktop's Rush row to be reported alongside it at Gate 2. (baseline-a2/summary.json Rush rows; PHASING-PREREGISTRATION-2026-09-18.md:117-140)

## Report
# Hard engine strength under Phasing: what has been measured (as of 2026-09-20, master a02bbb7)

## 0. Two different engines have been called "Hard"

| Name | What it is | Where it has been measured |
|---|---|---|
| `aiv2-hard` | Legacy `AIEngineV2` at the hard preset. MCTS 1200 iterations, beam 50, tacticalDepth 2, WASM kernel ABI 7. | Every Gate 1 game, pilots and full row. |
| `hard@desktop` | The new `src/ai/hard` engine: packed replica, PVS, prover, 62-feature evaluation. | Position suites only. It has never played a recorded game under Phasing. |

`gate1-bot.ts:61,141` constructs `new AIEngineV2(difficulty)`. Every Gate 1 `identity.json` says `"hardIdentityNote": "Hard replica is not an arm in Gate 1 and is never instantiated"`, with `hardWeightsVersion: null`.

In the preregistration, Gate 1 is a sanity gate on the baseline (`PHASING-PREREGISTRATION-2026-09-18.md:55-66`). Gate 2 is the new-engine-versus-baseline row (`:68-84`), and Gate 2 has never been run.

## (a) v2 suite measurement of the new Hard engine (commit 00dfc8f)

**Setup**
- Rules `muju-phasing-2`, engine `hard@desktop`, fixed work, seed 1, EMPTY_BOOK.
- Weights `phasing-accounting-bootstrap-v1`.
- Engine identity c1303f7a…, measured after the HOME_RACE demotion (96eabc6).
- The floor contract was committed alone first (bb47371, then the date fix 1864090). This is ledger line 1, witness tier local-only.
- A first attempt was refused because the contract was dated in the future; no case ran.

**Result: valid=true, floorPass=false**

| Family | Earned/offered | Floor | Result |
|---|---|---|---|
| tactics | 61/63 | 57 | pass |
| home-mate | 28/28 | 28 | pass |
| home-fortify | 6/6 | 6 | pass |
| invariants | 8/15 | 14 | **fail** |
| economy | 19/20 | 20 | **fail** |
| summon-disruption | 12/14 | 13 | **fail** |

Totals: 134/146 offered units earned, coverage 79/79, zero fallback, illegal or divergent cases. Source: `muju/lab/hard-ai/suites/phasing/results/v2-measure-2-2026-09-19/result.digest.json`.

**Failing positions (12), with diagnosis from `cases.jsonl.gz`**

*Indifference from zero evaluation weights (4 cases)*
- inv1-spawn-zero, inv2-corner-seal, inv12-cleave-line and inv17-self-block all have static eval gap 0 and searched gap 0.
- `DEFAULT_WEIGHTS` (`src/ai/hard/eval/weights.ts:21-26`) has only Material, BankLiquid, BankExcess, EconDelta (100 each) and PendingValue (1) nonzero.
- All 20 invariant slots are zero, as are Hanging, HangingBuy, ArrivalThreat, DisruptPressure and geometry.
- This is an evaluation blind spot. It is not a search or generator problem.

*Suspected fixture problems (2 cases; my inference, not recorded in the repo)*
- inv8-no-pre-adjacency: the evaluation distinguishes the members (+300), but both members are solved as a mate for the opponent (`source: mate`, 999000 in both). The zero gap reflects that both members are lost.
  - The commit message groups inv8 with the zero-weight cases. The data does not support that.
- inv7-promote-no-runway: the "violating" member scores −998000 for Black, a proven White win. The engine prefers it because it wins by force.

*Real search-versus-evaluation disagreement (1 case)*
- inv14-liquidity-floor: the evaluation prefers the correct member by +300; depth-6 search prefers the violating member by 100.

*Genuine engine misses at shallow depth (2 cases)*
- M5-SD-07 and M5-SD-18: search reached only depth 2 at 120k and 56k work. The raider moves but denies nothing, and the DisruptPressure coefficient is 0.
- The cause is search depth combined with the evaluation.

*Economy (1 case)*
- relocate-plant_2-e mined 4 where at least 5 was required, at depth 3 on 50k work.
- This case passed in the M6 v1 run, so it regressed once the engine and rules revision changed.

*Tactics (2 cases, inside the 6-miss budget)*
- plugged-shadow_1-vs-fire_3 also missed in v1.
- two-lanes-fire_2-vs-water_2 is a new miss, at depth 3 with 120k work exhausted.

## (b) M6 bootstrap floors (d667c82 / 4996586)

**Setup and result**
- v1 suites, `muju-phasing-1`, engine identity 06e907b2…
- 225 cases, run 12:29–12:30Z.
- valid=true, floorPass=false.

| Family | Earned/offered | Floor | Result |
|---|---|---|---|
| tactics | 62/63 | 57 | pass |
| home-mate | 28/28 | 28 | pass |
| economy | 20/20 | 20 | pass |
| home-fortify | 6/6 | 6 | pass |
| invariants | 5/18 | 17 | **fail** |
| summon-disruption | 5/14 | 13 | **fail** |

Totals: 126/149 earned, 76/76 coverage. The 23 failing cases are 13 invariants, 9 summon-disruption and 1 tactics.

**The M6-STATUS doc disagrees with itself about the cause**
- `M6-STATUS.md:158-168` says the engine "does not yet reliably disrupt enemy summons".
- The addendum (`:198-229`), backed by the data, says otherwise:
  - All 9 summon-disruption misses were roots with a mate-in-1 that the suite scored zero. Every one shows `source: mate`, depth 1, about 1.9k work.
  - The invariant pairs scored static evaluation against zero weights, so a gap of 0 was arithmetically forced.
- That is why the v2 suites were authored.
- Amendment A4 voids the v1 measurement under the 20-ply clock.

## (c) Gate 1 game results: AIEngineV2-hard in the hard seat, never the new engine

Handicap is `blackCrystalHandicap`; h0 is none and h3 gives Black 3 extra crystals. W/D/L is from aiv2-hard's side.

| Run | Rules | Work (hard/medium per own turn) | Games | Rush h0/h3 | Expand h0/h3 | Balanced h0/h3 | aiv2-medium h0/h3 | Inactivity draws |
|---|---|---|---|---|---|---|---|---|
| t2b pilot (c43c728) | p1 | 6,000/3,000 | 16 | 0/0/2, 1/0/1 | 1/1/0, 2/0/0 | 2/0/0, 1/1/0 | 2/0/0, 1/0/1 | 2/16 |
| t2c pilot (9dfb5d7) | p1 | 6,000/3,000 | 16 | 0/0/2, 0/0/2 | 0/2/0, 1/1/0 | 2/0/0, 1/1/0 | 2/0/0, 0/0/2 | 4/16 (Expand h0 100%) |
| **A2 full row** | p1 | 6,000/3,000 | 1,024 (128 per cell) | 7/1/120 (Elo −482 [−677, −387]); 15/2/111 (−338 [−453, −262]) | **0/128/0** (100% inactivity); 103/25/0 (+386 [+334, +455]) | 121/7/0 (+620); 113/15/0 (+482) | 128/0/0; 0/0/128 | cell rates 0–100% |
| A3 pilot b | p1 | 53,155/27,297 (calibrated) | 16 | 0/0/2, 0/0/2 | 2/0/0, 1/1/0 | 2/0/0, 2/0/0 | 1/0/1, 1/0/1 | 1/16 |
| p2 pilot (0a6e988) | **p2** | 51,423/26,159 (provisional) | 16 | 1/0/1, 0/0/2 | 2/0/0, 2/0/0 | 2/0/0, 2/0/0 | 0/0/2, 2/0/0 | 0/16 |

**Status of these runs**
- A2 verdict: `gate1: failed`.
  - A3 reclassified the two aiv2-medium cells as INVALID. Both engines are deterministic at fixed work, so one pair was replicated 64 times (effective n = 1).
  - A3 also called the 6,000/3,000 budgets about 3–15% of shipped pace.
  - A4 (clock 10 to 20 plies) voided every Gate 1 game played before it.
- The p2 pilot is the only run under the current rules.
  - It has one pair per cell, and its Elo intervals are degenerate (±1200).
  - Its README erratum says the adapter was defective. 44 of 48 follow-up Act searches got 1 work unit, and 24% of hard turns were affected.
  - "No Gate 1 row may be run with this adapter." Amendment A5 (0d3f5e3) specifies the fix.
- No eligible Gate 1 game exists under `muju-phasing-2`.

**What the numbers show anyway**
- AIEngineV2-hard under Phasing crushes Balanced and mostly beats Expand. It stalemated Expand at h0 under the 10-ply clock.
- It loses to Rush about 90% of the time.
- It splits with aiv2-medium deterministically by handicap.
- Scripted-reference inactivity draws fell from 49.5% to 27.0% with the 20-ply clock (`p2-scripted-2026-09-19/REPORT.md`).

## (d) New Hard engine versus AIEngineV2 under Phasing

No such head-to-head exists.
- There is no Gate 2 row, no Phasing `hard:ladder` results directory and no dev-openings match.
- The only hard@desktop-versus-aiv2-hard numbers are from Standard rules: R2 51/0/13, +237 Elo [+141, +385], and R1 42/2/20, +124 [+38, +229].
- The preregistration declares those Standard results non-transferable (`:11-18`).

Indirect evidence on the new engine points both ways.

*For*
- It scores 61/63 on tactics, 28/28 on home-mate and 6/6 on home-fortify.
- The HOME_RACE demotion gained a ply on 13 of 16 searched roots and produced 5 newly proven results, per the 96eabc6 commit message.

*Against*
- The evaluation is essentially material + cash + economy forecast + pending value, with 57 of 62 coefficients at zero.
- Depth is 2–3 at 120k work.
- Owner reports from the live opt-in preview (`PREVIEW-REPORTS-2026-09-19.md`) show clean Hard routing but three positional blunders:
  - a Fire shuffling into its own corner;
  - a Lightning diving and promoting to disrupt a 3-crystal summon, then left capturable;
  - a lone Fire sent across the board and left en prise.
- All three are what a zero-weight threat, hanging and centre evaluation predicts.

## (e) Budgets

**New Hard engine**
- Suites use fixed work of 120,000 per search (50,000 for economy cases). 225 cases and 199 searches ran in 2m45s.
- Depth distribution on searched results: 2 (22 searches), 3 (39), 4 (5), 5 (17), 6 (5), 10 (2), 12 (9).
- The 44-root acceptance run uses 50k generation work and 25k search work.
- Gate 2 specifies wall:8000. Gate 3 targets p95 ≤ 6,000 ms on desktop and ≤ 3,000 ms on phone.
- Responsiveness is unmeasured under Phasing. M6 notes that full stage-2 evaluation at every window "establishes no throughput claim".

**AIEngineV2**
- The shipped quick allowance is 10,000 ms for hard and 3,000 ms for medium.
- Calibrated medians are about 51–53k SearchBudget units per own turn for hard and about 26–27k for medium.
- A hard search takes about 3,000 ms, with 1–2 searches per turn.
- These units are not comparable to Hard-engine work units.
- No eligible idle-machine calibration exists.

## Plain statement

On present evidence, the strength of the new Hard engine relative to AIEngineV2-hard under Phasing is **unmeasured**.
- No game between them has been recorded.
- The new engine has never appeared in a recorded Phasing match against any opponent.
- The Standard-era +237 Elo does not transfer.
- The only measurements of it are suites. It passes tactics, home-mate and home-fortify, and fails invariants, economy and summon-disruption.
- My inference, not a measurement: it is tactically sharper than V2, with a prover and mate-finding. It is positionally near-blind on a 5-term bootstrap evaluation at depth 2–3. The owner's preview anecdotes show it hanging pieces.
- A quick dev-openings ladder could plausibly come out either way. It should be run before any further process investment.
- The baseline itself is weak: AIEngineV2-hard loses about 90% to scripted Rush under Phasing.

Key paths:
- `/Users/ethancd/src/deevgames/muju/lab/hard-ai/suites/phasing/results/v2-measure-2-2026-09-19/`
- `/Users/ethancd/src/deevgames/muju/lab/hard-ai/suites/phasing/fixtures/v2/floor-contract.json`
- `/Users/ethancd/src/deevgames/muju/docs/hard-ai/phasing/M6-STATUS.md`
- `/Users/ethancd/src/deevgames/muju/docs/changes/m6-evaluation-2026-09-19/`
- `/Users/ethancd/src/deevgames/muju/docs/changes/m4-search-2026-09-19/baseline-a2/summary.json`
- `/Users/ethancd/src/deevgames/muju/lab/ai/results/gate1-p2-pilot-2026-09-19/`
- `/Users/ethancd/src/deevgames/muju/docs/hard-ai/PHASING-PREREGISTRATION-2026-09-18.md`
- `/Users/ethancd/src/deevgames/muju/docs/hard-ai/phasing/PREVIEW-REPORTS-2026-09-19.md`
- `/Users/ethancd/src/deevgames/muju/src/ai/hard/eval/weights.ts`
- `/Users/ethancd/src/deevgames/muju/lab/ai/gate1-bot.ts`