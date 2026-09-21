HEADLINE: Yes. In an isolated scratch copy, a cheap evaluator repair turned hard@desktop's 7/1/24 against aiv2-hard-turn at wall:6000 (-206 Elo) into 29/0/3 (+394 Elo, CI floor +249). Same 16 p1-dev openings, same seed, zero fallbacks. The repair is default-v1 hand priors on the 62-feature schema, BankExcess 100 to 25, and a two-line credit of pending principal in the within-turn scorer. The machine was loaded throughout, but a control rerun of the unrepaired engine under that load still lost 3/0/13, and the repaired arm was starved as much as the control (mean depth 1.73 vs 2.05; baseline 2.45 at load 13.8). "Strong relative to V2" is therefore days away, not behind the M6 corpus, fit and validation apparatus. It is not yet "strong" in absolute terms: the repaired arm still loses 12/0/20 to the scripted Rush bot at wall:1500, and so does V2 (7/0/25).

## Remaining work
- S (about 25 min of machine time). Rerun on an idle machine: hard@ablate:hand-priors-pc vs aiv2-hard-turn at wall:6000 and wall:10000, 16-24 p1-dev pairs with 2-4 shards, plus the hard@desktop control in the same session. Blocked only by machine contention and by registering the arm; repair.patch applies cleanly to master a02bbb7.
- S-M. Land the scorer fix properly. Either credit pendCostSum in the within-turn score at src/ai/hard/engine.ts:359, or move PendingValue's principal half into stage 0 as M6 continuation-map section D describes. Mirror it in lab/hard-ai/recall/run.ts, which builds its own stage0+stage1 scorer (arms.ts:46-48). Add tests for identity on positions with no pending summons and for a BUY staying neutral in gainCc. Blocked by an owner decision to amend the frozen bootstrap.
- M. Land the hand-prior vector under a new label and WEIGHTS_VERSION 3, as an amendment to M6-BOOTSTRAP-CONTRACT section 4. Update tests/ai/hard/eval.test.ts:155,217,297, tests/lab/ablate.test.ts ALL_WEIGHT_ARMS and its hash pins, the ladder identity pins, and the DAG work record. Blocked by a preregistration choice: gate it with Gate 1 plus the v2 suites, or ship it as an explicitly provisional default.
- S. Re-measure the v2 Phasing suite floors with the repaired arm. The first v2 measurement of the bootstrap engine was valid but did not pass the floors (commit 00dfc8f). Blocked by arm registration.
- M. Diagnose the Rush problem under muju-phasing-2. All 20 of the repaired arm's losses to Rush are eliminations, and V2 loses to Rush as well. Analyze 3-4 replays from scratchpad/gapfill-priors/out/w1500-hppc-vs-Rush/replays. Decide whether the cause is the evaluator (no threat or arrival pricing: ArrivalThreat, DisruptPressure and HangingBuy are all still 0), generator K truncation, or a rules-balance issue with summon spam. No blocker.
- S-M. Recover unused time. Hard uses about 60% of its wall allowance, 18-20% of its searches are deadline-cut, and the first search of nearly every game aborts on the cold device profile. The work-fit, deep-gate and search-iter-fit arms already exist and need to be re-priced on top of the repaired evaluator. Blocked by an idle machine.
- S. Rerun the attribution arms on openings 9-16 and on p1-val: weights-only, scorer-only (bootstrap-pc is registered in the scratch copy but was never run) and bank25-pc. The current 8-pair rows are too wide to rank the two halves; the hand-priors-only CI is [-118, +170].
- L (optional). The M6 corpus, Texel fit and validation pipeline becomes an improvement track on top of a playable default rather than a prerequisite. The contract's prerequisite still applies: keep the 100/100/1 accounting pins fixed during the fit.

## Open questions
- Does +394 hold on an idle machine and at wall:10000? Every run here had 8 workers on 8 cores (4P+4E) while sibling agents were running too, so both engines got less effective budget than the nominal 6 s. The control shows the ordering is robust to that; the size of the gap is not pinned down.
- Is the comparator that matters the whole-turn aiv2-hard-turn, or the shipped per-action aiv2-hard path? Only the whole-turn shape was tested. lab/hard-ai/ladder/engines.ts:24-39 documents that the shapes differ.
- How much of the gain is simply buying more units (2.1-2.7 placed per turn against V2's 0.5), and how much is tactical judgment? bank25-pc with no tactical priors reached only 10/0/6, against 14/0/2 with them, which suggests both contribute. But n=8 pairs per arm, and the scorer-only arm (bootstrap-pc) was not run.
- Why does the scripted Rush bot beat every engine under Phasing? If a cheap summon flood is close to optimal under muju-phasing-2, that is a rules-balance question for the day Phasing becomes the only ruleset, not just an AI question.
- BankExcess at 25 deliberately breaks the contract's conservation identity of 100 cc per crystal of cash (M6-BOOTSTRAP-CONTRACT.md:13,92). Is that acceptable as a hand-declared spend incentive, or should the incentive come from pricing pending service and arrival threat more accurately?
- Will the owner accept a provisional hand-set default (p1-dev only, not preregistered) as Hard on switchover day, with Gate 1 and the v2 floors run afterwards? Or must the gates pass first? That decides between days and weeks.
- Does the repaired vector pass the v2 suite floors and the immediate-win veto?

## Findings
- [verified-in-code-or-results] The full repair (arm hand-priors-pc) scored 29/0/3 against aiv2-hard-turn at wall:6000: 14/0/2 on openings 1-8 and 15/0/1 on openings 9-16. These are the same 16 p1-dev openings and seed 31 as the 7/1/24 baseline. Pair-level Elo is +394 [+249, unbounded]. Against the baseline per opening, 14 improved, 2 were equal and 0 were worse (mean +0.672 score per pair, t=7.7). There were no illegal actions, divergences or fallbacks, and neither half is void. (scratchpad/gapfill-priors/out/t6000-hppc-vs-aiv2hardturn-h1/summary.md (14/0/2, load 18.2); .../t6000-hppc-vs-aiv2hardturn-h2/summary.md (15/0/1, load 25.8); baseline scratchpad/ladder/t6000-desktop-vs-aiv2hardturn/summary.md (7/1/24, Elo -205.6). Pair Elo computed from the games.jsonl files.)
- [verified-in-code-or-results] Machine load does not explain the gain. The unrepaired hard@desktop, rerun from the same scratch copy under the same load, scored 3/0/13 on openings 1-8. The original baseline scored 5/0/11 on those same 8 openings. The control row is formally VOID under the instrument's A14 rule, because V2's overrun rate was 5.88% against a 5% ceiling. (scratchpad/gapfill-priors/out/t6000-CONTROL-desktop-vs-aiv2hardturn-h1/summary.md and metrics.json (voided: true, voidReason timing.b.overrunRate 5.88%, loadAvgMean 24.24))
- [verified-in-code-or-results] Both parts of the repair matter, and the effect tracks how much the engine buys. On openings 1-8 at wall:6000: control 3/0/13 (0.61 units placed per turn); hand priors only 8/1/7 (+22 Elo, 1.38 per turn); BankExcess 25 plus scorer credit with no tactical priors 10/0/6 (+89, 2.69 per turn); hand priors plus scorer credit 14/0/2 (2.10 per turn). V2 places about 0.5 per turn in every run. (scratchpad/gapfill-priors/out/t6000-hp-nopc-vs-aiv2hardturn-h1, t6000-bank25pc-vs-aiv2hardturn-h1, t6000-hppc-vs-aiv2hardturn-h1. unitsPlaced per turn computed from games.jsonl players[*].unitsPlaced / turnsTaken.)
- [verified-in-code-or-results] The shipped within-turn scorer treats a Phasing BUY as a pure loss. It sums stage 0 and stage 1 only, and PendingValue (feature 58) is a stage-2 feature. Under the bootstrap vector every summon therefore lowers a candidate turn's gainCc by 100 cc per crystal. gainCc is the key the generator uses to drop the weakest candidates beyond K, so buying turns are the first to go. (muju/src/ai/hard/engine.ts:355-360 (score = stage0 + stage1); muju/src/ai/hard/eval/features.ts:190-191 and :508; muju/src/ai/hard/gen/generate.ts:879 (turn.gainCc = ctx.score) and :906-913 (displaces the lowest gainCc); muju/src/ai/hard/eval/weights.ts:20-28)
- [verified-in-code-or-results] The scorer half of the repair is two lines in engine.ts. It adds (pendCostSum[mover] - pendCostSum[other]) * 100 to the within-turn score. In the scratch copy it is switched on by a '+pc' suffix on the weights label. pendCostSum already exists on PackedState, and leadCc already counts it. (scratchpad/gapfill-priors/repair.patch; muju/src/ai/hard/types.ts:187-188; muju/src/ai/hard/eval/invariants.ts:279-282)
- [verified-in-code-or-results] The vector was fixed once, before any game against V2, and never adjusted. It keeps the bootstrap pins (BankLiquid 100, EconDelta 100, PendingValue 1) and sets BankExcess to 25. It restores the default-v1 values from 43b87b6 for HomeInvaded, the Spawn*/Anchor/Home* terms, Exposure, DrawPressure, ActionsLeft, the 28/30-37 tactical terms, and Inv1-4, 6-10, 12-14, 16, 19, 20. It leaves at zero everything the M6 contract flags: Rent, PstMine, 24-27, BankConvertible, ElementCoverage, HangingBuy, Inv11, and the structural-zero Inv5/15/17/18. (scratchpad/gapfill-priors/repair.patch (handPriorsPatch); git show 43b87b6:muju/src/ai/hard/eval/weights.ts; muju/docs/hard-ai/phasing/M6-BOOTSTRAP-CONTRACT.md:98-104; m6-continuation-map.md section C; muju/src/ai/hard/eval/invariants.ts:191,247-249 (Inv5/17/18 structural zero, Inv7/14 already phase-aware))
- [verified-in-code-or-results] The repaired arm beat V2 while searching no deeper than the control. Under load its mean completed depth was 1.73, against 2.05 for the control at the same load and 2.45 for the baseline at load 13.8. Its rungs were mostly 100k (baseline mostly 200k), and 18-20% of its searches were cut by the deadline. It used only 3.4-3.8 s of its 6 s allowance, while V2 used 6.0 s. (hardTiming.turnRows aggregated from games.jsonl. Rungs over 16 openings: hand-priors-pc 50k x30, 100k x234, 200k x40, 800k x32; baseline 100k x17, 200k x276, 400k x15, 800k x33. meanTurnMs a=3355.7/3808.6, b=5969.7/6017.4 in the h1/h2 summary.md files.)
- [verified-in-code-or-results] The repaired arm still loses to the scripted Rush bot. At wall:1500 over 16 p1-dev pairs (seed 33) it scored 12/0/20 (-89 Elo [-202, +8]), and all 20 losses were by elimination. The bootstrap engine scored 1/0/31 (-597). V2 also loses to Rush under Phasing: aiv2-hard at wall:1500 scored 7/0/25 (-221), and aiv2-hard-turn at wall:10000 scored 3/0/5. (scratchpad/gapfill-priors/out/w1500-hppc-vs-Rush/summary.md; scratchpad/ladder/w1500-desktop-vs-Rush/summary.md; scratchpad/ladder/w1500-aiv2hard-vs-Rush/summary.md; scratchpad/gapfill-rush/w10000-aiv2hardturn-vs-Rush/summary.md (sibling runs))
- [verified-in-code-or-results] A sanity check at fixed work behaved as expected. hand-priors-pc beat hard@desktop 8/0/0 at fixed:50000 on four distinct p1-dev openings. (scratchpad/gapfill-priors/out/sanity-hppc-vs-desktop-f50k/summary.md)
- [verified-in-code-or-results] The tracked repository was not modified. All edits are in a scratch copy of src/ and lab/ (lab/results excluded, node_modules symlinked), and git status stayed clean. The scratch runs record their git revision as unknown. Their code is master a02bbb7 plus the two-file repair.patch. (git status --porcelain returned empty after the runs; scratchpad/gapfill-priors/repair.patch (57 lines: engine.ts scorer and arms.ts arms))
- [verified-in-code-or-results] Landing the repair is a contract change as well as a code change. DEFAULT_WEIGHTS is the frozen M6 bootstrap vector, and tests assert specific zeros in it. Its label is pinned in the freeze artifacts and in the v2 suite-measurement manifests. WEIGHTS_VERSION gates weights loading and book compatibility. (muju/tests/ai/hard/eval.test.ts:155,217,297-312; muju/docs/changes/m6-evaluation-2026-09-19/m6-bootstrap-freeze-2/weights.json; muju/docs/hard-ai/phasing/M6-BOOTSTRAP-CONTRACT.md:96,106; muju/src/ai/hard/eval/weights.ts:15,104-107)
- [verified-in-code-or-results] hardEnabled is currently true in source, so the browser's Hard difficulty routes to the packed engine unless the player opts out. (muju/src/ai/hard/config.ts:47; muju/src/ai/hardOptIn.ts:212)

## Report
# Gap-fill: does a cheap evaluator repair bring hard@desktop to parity with aiv2-hard-turn under muju-phasing-2?

**Yes.** Against aiv2-hard-turn at wall:6000, the repaired engine scored 29/0/3 where unrepaired hard@desktop had scored 7/1/24. Both runs used the same 16 p1-dev openings and the same seed. A control rerun under matching machine load rules out load as the explanation. The evaluation, and specifically the engine's willingness to buy units, is the lever.

## Method (read-only)

The repository forbids edits, so I copied `muju/src` and `muju/lab` (minus `lab/results`) into the scratchpad, symlinked `node_modules`, and patched only the copy. The tracked repo stayed clean: `git status --porcelain` was empty after all runs. Every game ran through the real ladder instrument (`lab/hard-ai/ladder/run.ts`) with the baseline's openings file, seed 31 and `--replays on`. Each command stayed at or under about 8 minutes by splitting the 16 openings into two 8-pair halves with `--openings-skip 8`.

- Scratch tree: `/private/tmp/claude-501/-Users-ethancd-src-deevgames/d0196f82-8636-4254-b748-56de209f4b8e/scratchpad/gapfill-priors/muju`
- Patch (57 lines, applies to master a02bbb7): `.../scratchpad/gapfill-priors/repair.patch`
- Results: `.../scratchpad/gapfill-priors/out/*`

### The repair

All arms were defined before any game against V2, and each was run once. Nothing was tuned on outcomes.

1. **Weights arm `hand-priors`.** It starts from the bootstrap vector and keeps the accounting pins: BankLiquid 100, EconDelta 100, PendingValue 1. It then makes three kinds of change:
   - BankExcess goes from 100 to 25.
   - These default-v1 values (from `git show 43b87b6:muju/src/ai/hard/eval/weights.ts`) are restored: HomeInvaded, SpawnArea/Reserve/Zero, AnchorDepth, Infiltration, CornerSeal, HomeThreat/Countdown/Plug/Rescuers, Exposure, DrawPressure, ActionsLeft, Hanging, ApproachRetreat/Strand, StrandPunish, KillAvailable, CleaveExposure, AnchorFragility, BlockingDeficit, CornerInfiltration, and Inv1-4, 6-10, 12-14, 16, 19, 20.
   - Everything the M6 contract flags stays at zero: Rent, PstMine and features 24-27 (they overlap the single forecast); BankConvertible, ElementCoverage and Inv11 (stale cash-option semantics, still visible at `features.ts:257-275` and in `invariants.ts homeBare`); HangingBuy (slot redefined); and Inv5/15/17/18 (structural zero in the current code).
2. **Scorer credit (`+pc`).** At `src/ai/hard/engine.ts:359` the within-turn score gains `(pendCostSum[mover] - pendCostSum[other]) * 100`.

### Why the scorer matters

This is verified in code:

- The within-turn score is `stage0 + stage1` (`engine.ts:355-360`).
- PendingValue is feature 58, which belongs to stage 2 (`features.ts:508`).
- Under the bootstrap vector a BUY therefore lowers a candidate turn's `gainCc` by 100 cc per crystal, with no offsetting asset.
- `gainCc` is the key `gen/generate.ts:879,906-913` uses to drop the weakest candidates beyond K. Buying turns are the first to be truncated.

## Results

All runs are wall:6000 against aiv2-hard-turn on p1-dev openings. "Units/turn" is units placed per turn by the Hard arm; V2 placed about 0.5 per turn in every run.

| Arm (A) | Openings | W/D/L | Elo (pair-level) | Units/turn | Mean depth | Load |
|---|---|---|---|---|---|---|
| hard@desktop, sibling baseline | 1-16 | 7/1/24 | -206 [-353, -105] | 0.66 | 2.45 | 13.8 |
| hard@desktop, control rerun | 1-8 | 3/0/13 | -255 (row VOID: V2 overrun 5.88%) | 0.61 | 2.05 | 24.2 |
| hand-priors, weights only | 1-8 | 8/1/7 | +22 [-118, +170] | 1.38 | 1.98 | 21.9 |
| bank25-pc, no tactical priors | 1-8 | 10/0/6 | +89 [-85, +330] | 2.69 | 1.90 | 15.4 |
| **hand-priors-pc, full repair** | 1-8 | **14/0/2** | | 2.10 | 1.85 | 18.1 |
| **hand-priors-pc, full repair** | 9-16 | **15/0/1** | | 2.46 | 1.64 | 25.8 |
| **hand-priors-pc, combined** | 1-16 | **29/0/3** | **+394 [+249, unbounded]** | | 1.73 | 22 |

- **Same-opening comparison.** Per opening against the baseline, the full repair improved on 14 of 16 openings, tied on 2 and was worse on none. The mean gain was +0.672 score per pair (t = 7.7). On openings 1-8 the baseline had been 5/0/11.
- **Validity.** Both hand-priors-pc halves have zero illegal actions, replica divergences and engine fallbacks. All 16 of 16 games per orientation are distinct by replay digest, and neither half is void.
- **Win types.** Of the repaired arm's 29 wins, 23 are home checkmates. The baseline's losses were 16 home checkmates and 8 eliminations.
- **Fixed-work sanity check.** hand-priors-pc beat hard@desktop 8/0/0 at fixed:50000 on four distinct openings.

### What the table shows

- **Evaluation, specifically purchasing, is the lever.** Results rise with units placed per turn. The bootstrap buys at V2's rate and loses. Weights alone reach parity. Adding the scorer credit gives dominance.
- **Search depth is not the lever here.** The repaired arm won while searching no deeper than the control under load (1.73 vs 2.05; the baseline reached 2.45 at load 13.8). Its rungs were mostly 100k, where the baseline's were mostly 200k, and 18-20% of its searches were cut by the deadline.
- **There is unused time.** The repaired arm used only 3.4-3.8 s of its 6 s allowance, while V2 used all of it.
- **This matches the Standard-era picture.** The same search with hand priors led V2 by a wide margin. The Phasing deficit appeared together with the zeroed vector, and this run shows a plausible replacement vector and scorer credit reverse it.

## Counterweight: Rush

I also ran the repaired arm against the scripted Rush bot at wall:1500 over 16 p1-dev pairs (seed 33, the sibling's setup).

| Engine vs Rush | Work | W/D/L | Elo |
|---|---|---|---|
| hand-priors-pc | wall:1500 | 12/0/20 | -89 [-202, +8] |
| hard@desktop (bootstrap) | wall:1500 | 1/0/31 | -597 |
| aiv2-hard | wall:1500 | 7/0/25 | -221 |
| aiv2-hard-turn | wall:10000 | 3/0/5 | n = 4 pairs |

- All 20 of the repaired arm's losses were eliminations.
- The repaired Hard engine is better than V2 on both yardsticks. No engine yet beats a scripted summon rush under muju-phasing-2.
- "Strong by default" needs the Rush diagnosis in addition to this repair.

## Caveats

1. **The machine was never idle.** Load averaged 15-26 on 8 cores (4P+4E), with sibling agents running ladders at the same time. Both engines effectively had less than 6 s. The same-load control (3/0/13) shows the ordering is robust to this; the absolute Elo is not pinned down.
2. **The control row is VOID** under the instrument's own A14 rule, because V2's overrun rate was 5.88% under load. The original baseline row is not void.
3. **This is development evidence.** It uses p1-dev openings, is not preregistered, and the combined result covers 16 pairs. The attribution rows (weights-only, bank25-pc) are 8 pairs each with wide intervals, so the two halves cannot be ranked.
4. **The scorer-only arm was not run.** `bootstrap-pc` is registered in the scratch copy; time ran out before it was played.
5. **Not tested:** wall:10000, an idle machine, the per-action `aiv2-hard` shape, p1-val, and the v2 suite floors.
6. **BankExcess = 25 departs from the contract.** It breaks the accounting identity of 100 cc per crystal of cash (M6-BOOTSTRAP-CONTRACT.md:13,92). It is a hand-declared incentive to spend, not something derived from the accounting model.

## Decision relevance

- **What "Hard" is on switchover day.** The packed engine with this repair is a better "Hard" than the aiv2-hard preset under Phasing, against both V2 and Rush. The unrepaired bootstrap is not. `hardEnabled` is currently true (`src/ai/hard/config.ts:47`), so as the source stands the browser's Hard difficulty routes to the unrepaired packed engine.
- **Effort.** The code change is about two lines in `engine.ts` plus a weights vector. The paperwork is larger:
  - `DEFAULT_WEIGHTS` is the frozen M6 bootstrap.
  - `tests/ai/hard/eval.test.ts:155,217,297` assert zeros in it.
  - The label is pinned in the freeze artifacts and the v2 suite manifests.
  - `WEIGHTS_VERSION` would go from 2 to 3.
  - `lab/hard-ai/recall/run.ts` has its own stage0+stage1 scorer that must be changed to match.
- **Confirmatory experiment.** On an idle machine, with the arm registered in `lab/hard-ai/ablate/arms.ts`, run `node --import tsx lab/hard-ai/ladder/run.ts --a hard@ablate:hand-priors-pc --b aiv2-hard-turn --work wall:6000 --handicaps 0 --pairs 16 --seed 31 --shards 2 --openings lab/hard-ai/ladder/openings/p1-dev.jsonl --replays on --out <scratch>`. That takes about 25-30 minutes with 2 shards, or about 10 with 8. Repeat at wall:10000 and with the hard@desktop control in the same session.
- **M6 becomes an improvement track.** The corpus, Texel fit and validation pipeline can build on a playable default instead of gating one. The Rush elimination problem and the unused 40% of the time allowance are the next cheapest levers.