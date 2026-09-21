HEADLINE: As shipped, hard:corpus followed by hard:texel cannot run on any Phasing replay this tree can produce, so tuning is not step 2 of the pragmatic path. The corpus builder hard-codes rules revision `muju-phasing-1` while the ladder has emitted only `muju-phasing-2` since commit 93018a0. No tool builds the required SHA-bound allowlist, and the allowlist, runs and corpus must all live inside muju/. Bypassing the guards in a scratch library run (366 Phasing games, 2,681 quiet rows, 33 s) the pipeline runs mechanically, but the fitted vector is unusable. It has seven negative piece values, 19 parameters pinned at the ±16,650 sweep cap, and a held-out log-loss of 0.579, worse than the 0.443 obtained from knowing only which bot sits on each side. Near-term strength work is hand-set priors tested as `hard@ablate:<arm>` ladder rows, which already resolve under Phasing weights v2.

## Remaining work
- S: Teach the tuner the current rules revision. Replace the seven `muju-phasing-1` literals in lab/hard-ai/tune/corpus.ts:269,279,375 and rows.ts:146,190,227,290 with LADDER_RULES_VERSION, and update the fixtures in tests/lab/phasing-tune-guards.test.ts. Nothing blocks it technically. Under the prereg regime it changes the M6 tune-guard contract.
- S-M: Write the allowlist publisher that emits allowlist A (runs and replays) and allowlist B (corpus), SHA-bound and created exclusively. m6-dev-continuation.md:55-90 describes it; no code exists. It depends on the revision fix.
- M: Make the fitter produce sane vectors. Stop the k collapse (fix k by convention or alternate refit-k), add per-parameter bounds and sign constraints, add L2 or a rarity guard so parameters that fire in under 2% of rows cannot run to the cap, and freeze the free-parameter domain (M6 blocker 4). This is lab-only work in lab/hard-ai/tune/texel.ts. It is pointless until a label-clean corpus exists.
- M: Produce a label-clean corpus: equal-strength Hard self-play, never lopsided ladder rows. This needs a dedicated tuning opening pool. The generator yields about 786 distinct one-turn openings today; more requires a multi-turn option. It also needs a versioned change to DEV_POOL_PATH in rows.ts, plus a decision on sealed-set disjointness, which cannot be checked from this machine. About 1,400 games is roughly 2-3 machine-hours at wall:1500 with 6 shards. M6 blockers 1 and 2 stand in the way if the prereg discipline is kept.
- M: Decide how to price the tactical and home-safety terms, which the quiet corpus zeroes out (HomeThreat, KillAvailable, HomeInvaded, Infiltration, CornerInfiltration and others). These need hand-set values checked on the ladder or a search-score target. Texel on quiet rows cannot supply them, and 62% of the scratch games ended in home-checkmate.
- S per arm (recommended near-term programme): add a hand-set prior vector as a `weights` arm in lab/hard-ai/ablate/arms.ts and run `hard@ablate:<arm>` against `hard@desktop` on p1-dev with `--replays on`. This works today. The one blocker is that comparison rows against aiv2 opponents go void at wall:1500 because the opponent overruns its clock more than 5% of the time; use hard-vs-hard rows or a longer wall budget.
- S (housekeeping): `npm run hard:spsa` points at a file that does not exist (lab/hard-ai/tune/spsa.ts). Remove the script or write the file.

## Open questions
- Does the owner want to keep the M6 preregistration discipline (SHA-bound allowlists, frozen dev allocation, no coefficient chosen from the M5 misses)? If yes, tuning stays behind all five blockers plus the revision fix. If no, the corpus stage can run as a library call in about 30 s, and the remaining problem is label quality and fitter robustness.
- Would a Texel fit on equal-strength Hard self-play show any signal for the free Phasing terms (EconDelta 23, ArrivalThreat 59, DisruptPressure 60, Hanging 28/29)? The repo cannot answer this. The experiment: generate about 700 openings (seconds); run hard@desktop vs hard@desktop self-play at h0 and h3, about 1,400 games and 2-3 machine-hours; build the corpus through the library path (about 1 min); fit with k fixed and parameters bounded (seconds). Total about half a day including fitter fixes. Success means held-out loss beats the constant-mean baseline with no parameter at a bound.
- Are self-play games from an engine that currently loses to Rush by about 600 Elo (scratch, unofficial) informative enough to bootstrap from, or should the first corpus come from a hand-improved vector that at least prices home safety?
- Is `fixed:25000` self-play fast enough per game? No fixed-work Phasing timing was measured here. Durations are known only for wall:1000, wall:1500 and wall:6000.
- Do A/B ladder rows need the A14 void rule relaxed for non-Hard opponents, given that aiv2 and scripted opponents overran 10-34% of turns at wall:1000 and wall:1500?

## Findings
- [verified-in-code-or-results] The corpus CLI refuses every replay the current ladder emits. corpus.ts and rows.ts hard-code `muju-phasing-1`, while the ladder and harness play and stamp `muju-phasing-2`. The tuner was last touched at e701ccc (2026-09-19 08:06); the revision bump landed about three hours later at 93018a0 (2026-09-19 11:15) and the tuner was not updated. (lab/hard-ai/tune/corpus.ts:269,279,375; lab/hard-ai/tune/rows.ts:146,190,227,290; lab/harness/types.ts:31 (HARNESS_RULES_VERSION = 'muju-phasing-2'); lab/hard-ai/ladder/ruleset.ts:64 (HISTORICAL_PHASING_REVISIONS = ['muju-phasing-1'], read-only). All 15 scratch ladder manifests carry rules.rulesVersion 'muju-phasing-2'. git log -1 on tune/corpus.ts vs git log -S'muju-phasing-2' on lab/harness/types.ts.)
- [verified-in-code-or-results] The repo contains no input the corpus CLI would accept. None of the 44 tracked `muju-ladder-manifest-v1` manifests carries a Phasing rulesVersion (all are Standard, weights v1). No allowlist file has ever been authored and no allowlist builder exists. (Scan of git ls-files manifest.json: 44 ladder manifests, rules.rulesVersion undefined on all. `git ls-files | grep -i allowlist` returns nothing. docs/changes/m6-evaluation-2026-09-19/m6-tune-source-guards-handoff.md:9 says 'No actual allowlist was authored'; :25 says the tests do 'not execute a valid optimization or actual corpus build'.)
- [verified-in-code-or-results] The CLI cannot be dry-run against the scratchpad. The allowlist path, every run path and the corpus path read by texel must be repo-relative with no `..` component, so all inputs must sit inside muju/. (rows.ts:158-172 (relativePath, safeSourcePath), :185-186, :218-219, :280-281. Live probe: `node --import tsx lab/hard-ai/tune/corpus.ts --runs <scratch> --source-allowlist <scratch>/probe.allowlist.json ...` printed 'tune preflight: refused source path'.)
- [verified-in-code-or-results] The replay, reconstruct, pack, evaluate and quiet-rule path is sound on Phasing. 366 of 366 scratch replays rebuilt through the canonical engine with zero mismatches and zero pack errors. They gave 9,872 macro nodes and 2,681 quiet rows: quiet share 27.2% (Standard-era 4.88%), 7.3 quiet rows per game (Standard 2.57), draw share 3.8%. Build time was 18 s. (scratchpad/tune/dryrun-result.json totals: {games:366, turnBoundaries:9872, nonMacro:0, terminal:0, macroNodes:9872, quietRows:2681, quietShare:0.2716, reconstructFailures:0}. Standard comparison: lab/results/hard-ai-e3/tune/corpus/manifest.json (quietShare 0.0488, 1335 positions from 520 games).)
- [verified-in-code-or-results] The fitter cannot move the cash and pending terms, by construction. w[2] BankLiquid = 100, w[3] BankExcess = 100, w[58] PendingValue = 1 and material[fire_1] = 300 are pinned; 75 of 80 parameters are free. After the dry-run fit all four pins were unchanged. (lab/hard-ai/tune/texel.ts:82 (ACCOUNTING_PINS = {2:100, 3:100, 58:1}), :257-262 (freeParams), :83-89 and :403 (assertAccountingPins before and after). dryrun-result.json pinnedAfter {w2:100, w3:100, w58:1, fire1:300}.)
- [verified-in-code-or-results] Run on the 2,681 quiet Phasing rows, fit() as written (3 iterations, steps 100/10/1) produces an unusable vector. Seven of 18 material values come out negative, e.g. fire_2 700 to -15,950, lightning_1 300 to -16,350, plant_3 1,700 to -14,950. Water_2 and shadow_2 go to +17,450. 19 parameters stop exactly at the ±16,650 sweep cap, which means they ran out of budget and did not converge. On p1-dev rows only, 8 parameters hit the cap and 7 material values are negative. (scratchpad/tune/dryrun2-result.json, studies[0].tunedMaterial, negativeMaterialValues 7, paramsAtCap 19; studies[1] paramsAtCap 8, negativeMaterialValues 7. Fit took 4.1 s.)
- [verified-in-code-or-results] `k` collapses because it is fitted first against a bootstrap vector that carries no outcome signal. k = 3.3e-5 here against 4.26e-4 in the Standard run, and every free parameter must then inflate to matter. On quiet rows the bootstrap score's sign agrees with the game result on 46.3% of decisive rows (49.6% on dev-only rows). Bootstrap held-out log-loss is 0.6946, above the coin-flip value ln 2 = 0.6931. (dryrun2-result.json: k 3.296e-5; bootstrapSignAgreement {decisiveRows:2357, agree:1090, share:0.4625}; heldOutLoss {coinFlip:0.6931, bootstrapVector:0.694565}. texel.ts:273 fits k once before any descent; there is no bound, regulariser or rarity guard (the E3.3 doc's 'What is missing' item 5 says the same).)
- [verified-in-code-or-results] The apparent held-out gain (0.6946 to 0.5794) mostly reflects which bot is playing rather than position value. A predictor that knows only which bot sits on each side scores 0.4431 held-out (0.3087 on dev-only rows against the fit's 0.5373). Within a matchup, the fitted vector is worse than that matchup's base rate in 10 of 12 held-out cells (10 of 14 on dev-only). Ladder replays from lopsided matchups are the wrong corpus for a Texel fit. (dryrun2-result.json heldOutLoss {identityOnly:0.443127, fittedVector:0.579411} and {identityOnly:0.308671, fittedVector:0.537348}; withinMatchupHeldOut tables. matchupMix shows near-deterministic labels, e.g. 'hard@desktop|aiv2-hard' mean result 0.018, 'Rush|hard@desktop' 1.0, 'hard@desktop|Balanced' 0.971.)
- [verified-in-code-or-results] The quiet rule filters out the features that decide games. HomeInvaded, Infiltration, HomeThreat, KillAvailable, CornerInfiltration, StrandPunish, RelocationDebt and six invariant slots are identically zero in all 2,681 quiet rows, and 9 more features are non-zero in under 2% of rows. Yet 228 of 366 games (62%) ended in home-checkmate. The Standard run hit the same structural limit. (dryrun-result.json quietDescribe.featuresIdenticallyZero (13 features) and featuresUnder2pct (9); terminalHistogram {home-checkmate:228, elimination:90, upkeep-elimination:17, home-occupation:17, inactivity:14}. docs/hard-ai/e3/E3.3-TUNING-INSTRUMENT.md section 'What the corpus cannot price'.)
- [verified-in-code-or-results] The critic's premise that no fit has ever been run is wrong for Standard. A Standard smoke fit is committed (1,111 train / 224 held-out rows; train loss 0.639974 to 0.600488; held-out 0.637823 to 0.627661). It already showed both problems: held-out loss rose after iteration 1 (0.621992, 0.623964, 0.627661) and five parameters stopped at the ±16,650 cap. No Phasing corpus or fit existed before this scratch run. (lab/results/hard-ai-e3/tune/texel/report.md (tracked, including the per-iteration trace); lab/results/hard-ai-e3/tune/corpus/manifest.json; docs/hard-ai/e3/E3.3-TUNING-INSTRUMENT.md:236-277.)
- [verified-in-code-or-results] The 96-trajectory ceiling is real for identical-weight fixed-work self-play: HardEngine.setSeed is a no-op and p1-dev has 48 openings by 2 handicaps. It is cheap to lift technically. The existing generator produced 786 distinct one-turn openings from 6,000 attempts in 4.6 s, in memory only, which is about 1,570 opening-by-handicap cells. It saturates beyond that (5,214 duplicate digests), so thousands of openings would need multi-turn openings. Wall-clock ladder games are already all distinct (366 of 366) but are not reproducible. (src/ai/hard/engine.ts:381-385 (setSeed: 'No-op: the search has no RNG'); lab/hard-ai/ladder/openings/p1-dev.jsonl has 48 lines; scratchpad/tune/gencheck.mts output 'only 786 of 5000 openings after 6000 attempts (rejections: {"duplicate digest":5214})', 4,568 ms; dryrun-result.json trajectories {games:366, distinct:366}.)
- [verified-in-code-or-results] DEV_POOL_PATH is hard-wired into the tuner's trust boundary, so a new tuning pool needs a deliberate code change there. A freshly generated pool also cannot be proven disjoint from the sealed set, which is held off this machine. (lab/hard-ai/tune/rows.ts:38, :129, :190 (DEV_POOL_PATH checks); lab/hard-ai/ladder/openings/ALLOCATION-P1.md (p1-sealed.jsonl held only at /Users/ashkie/..., 'Claude must not read it').)
- [verified-in-code-or-results] Hand-set weight vectors can be A/B tested on the ladder today without the candidate-weights-file CLI (M6 blocker 3). `hard@ablate:<arm>` whole-vector weight arms resolve under Phasing weights v2, and createHardBot already calls engine.setWeights. (scratchpad/tune/armcheck.mts output: 'hard@ablate:eval-no-economy OK phasing-accounting-bootstrap-v1-no-economy v2 nonzero w: 0=100', against hard@desktop's '0=100 2=100 3=100 23=100 58=1'. lab/hard-ai/ablate/arms.ts:305-313, :368; lab/hard-ai/bots/hard.ts:286-289, :437; lab/hard-ai/ladder/engines.ts:342-356.)
- [verified-in-code-or-results] The tuner's unit tests pass (49 of 49) and do not catch the revision mismatch, because their synthetic fixtures also pin `muju-phasing-1`. (`npx vitest run tests/lab/texel.test.ts tests/lab/phasing-tune-guards.test.ts`: 2 files, 49 tests passed. tests/lab/phasing-tune-guards.test.ts:35,40,43.)
- [inferred] Compute is not the binding constraint. At 7.3 quiet rows per game, M18's 10,000-row bar needs about 1,400 games. At roughly 25-45 s per wall:1500 game and 6 shards on the 8-core machine, that is about 2-3 machine-hours. (Average durationMs per scratch run from games.jsonl: 15.6-43.9 s at wall:1500, 105 s at wall:6000; hw.ncpu = 8. M18 bar: docs/hard-ai/e3/E3.3-TUNING-INSTRUMENT.md 'What is missing' item 2.)
- [verified-in-code-or-results] In the scratch runs that fed this corpus, bootstrap-vector hard@desktop scored -470 Elo vs aiv2-hard, -330 vs aiv2-hard-turn (-206 at wall:6000), -417 vs aiv2-medium, -597 vs Rush, +293 vs Expand and +597 vs Balanced. Several of those rows are void for opponent time overrun, and none is committed evidence. (scratchpad/ladder/*/summary.md 'Elo (A vs B)' lines; voidReason fields in the manifests (timing.b.overrunRate 10-15% against the 5% ceiling, AMENDMENTS-DECIDED A14).)

## Report
# Can hard:corpus then hard:texel run end to end on Phasing replays and produce a usable vector?

**Short answer.** As shipped, no: the CLIs refuse every replay the current tree can produce. With the guards bypassed in a scratch library run, the pipeline runs mechanically in about 30 seconds on 366 Phasing games. The resulting vector is unusable, and what the fitter learned is mostly which bot is playing. Tuning is a detour of a few days of focused work, or weeks under the preregistration discipline. It is not step 2 on the pragmatic path.

All experiments wrote only under `/private/tmp/claude-501/-Users-ethancd-src-deevgames/d0196f82-8636-4254-b748-56de209f4b8e/scratchpad/tune/`. `git status` was clean before and after.

## 1. The CLI path is blocked three ways

1. **Rules-revision mismatch.** The tuner hard-codes `'muju-phasing-1'` in seven places: `lab/hard-ai/tune/corpus.ts:269,279,375` and `rows.ts:146,190,227,290`. The ladder and harness stamp `'muju-phasing-2'` (`lab/harness/types.ts:31`). `ruleset.ts:64` lists `muju-phasing-1` as a revision the tree can read but no longer plays.
   - The tuner was last touched at `e701ccc` (2026-09-19 08:06). The revision bump landed at `93018a0` (2026-09-19 11:15) and the tuner was never updated.
   - All 15 scratch ladder manifests carry `muju-phasing-2`, so `preflightRuns` would throw "completed p1-dev run manifest binding required" on each one.
   - The tuner tests pass (49/49) because their synthetic fixtures also pin `muju-phasing-1`.
2. **Nothing in the repo is an acceptable input.** None of the 44 tracked `muju-ladder-manifest-v1` manifests carries a Phasing `rulesVersion`; all are Standard with weights v1. No allowlist file exists and no tool builds one. `docs/changes/m6-evaluation-2026-09-19/m6-dev-continuation.md:55-90` describes a two-stage allowlist publisher, and `m6-tune-source-guards-handoff.md:9` confirms "No actual allowlist was authored."
3. **Everything must sit inside `muju/`.** `rows.ts:158-172` refuses any path with a `..` component, for the allowlist, the run directories and the corpus directory that texel reads. A probe with a scratch allowlist printed `tune preflight: refused source path`. A scratch-only CLI dry run is impossible without writing into the repo, which this read-only task forbids.

**Correction to the premise.** A fit has been run under Standard. `lab/results/hard-ai-e3/tune/texel/report.md` is committed:

| Quantity | Value |
| --- | --- |
| Rows (train / held-out) | 1,111 / 224 |
| Train log-loss | 0.639974 to 0.600488 |
| Held-out log-loss | 0.637823 to 0.627661 |
| Held-out by iteration | 0.621992, 0.623964, 0.627661 |
| Parameters at the ±16,650 sweep cap | 5 |

Held-out loss rose after iteration 1, which is an overfit signature. No Phasing corpus or fit existed before today's scratch run.

## 2. The library-path dry run

`scratchpad/tune/dryrun.mts` copies `buildCorpus`'s per-turn loop (reconstruct, pack, `Evaluator.full`, `quietVerdict`) minus the allowlist and revision gate. It then calls `texel.ts fit()` unchanged.

Input was 14 complete scratch ladder runs, 366 games, all `muju-phasing-2`. Hard@desktop with the bootstrap vector played aiv2-hard, aiv2-hard-turn, aiv2-medium, Rush, Expand, Balanced and hard@midrange.

| Quantity | Phasing (scratch, today) | Standard (committed E3.3) |
| --- | ---: | ---: |
| Games | 366 | 520 |
| Reconstruct mismatches / pack errors | 0 / 0 | 0 / 0 |
| Macro nodes | 9,872 | 27,346 |
| Quiet rows | 2,681 | 1,335 |
| Quiet share | 27.2% | 4.88% |
| Quiet rows per game | 7.3 | 2.57 |
| Draw share | 3.8% | 1.2% |
| Distinct kpos+side among rows | 2,253 | 806 |
| Build time | 18 s | 67 s |

The replay-to-features plumbing works on Phasing, and the old "only 4.9% quiet" worry does not carry over. About 1,400 games would reach M18's 10,000-row bar.

## 3. The vector is unusable

The fit was `fit()` as written: 3 iterations, steps 100/10/1, 75 of 80 parameters free, 4 s. Train loss went from 0.6900 to 0.5102 and held-out from 0.6946 to 0.5794. That looks like a large gain, but the vector cannot be used.

- **Material values are nonsense.** Seven of 18 are negative.
  - Negative: fire_2 700 to -15,950, lightning_1 300 to -16,350, plant_3 1,700 to -14,950, fire_3 to -11,150, water_1 to -11,550.
  - Inflated: water_2 800 to +17,450, shadow_1 to +17,050, metal_3 to +18,350.
  - An engine using this vector would give away lightning and plant pieces.
- **19 parameters stopped at the ±16,650 sweep cap** (8 on p1-dev rows only). They ran out of budget and did not converge. This is the same failure as the Standard run, and larger.
- **`k` collapsed.** `k` is fitted once, first, against the bootstrap vector. It came out at 3.3e-5, against 4.26e-4 in the Standard run. Every free parameter then has to reach thousands of cc to matter. `texel.ts` has no bounds, no regulariser and no rarity guard, which item 5 of the E3.3 doc's "What is missing" already admits.
- **The pinned terms stay pinned.** w2 = 100, w3 = 100, w58 = 1 and fire_1 = 300 are fixed by `ACCOUNTING_PINS` (`texel.ts:82`, `:257-262`). The fitter cannot move the cash and pending terms by design. The free Phasing terms barely moved: EconDelta 100 to 206 (83 on dev-only), ArrivalThreat 0 to -24, DisruptPressure 0 to -40.

## 4. The "signal" is opponent identity

This is the decisive finding (`scratchpad/tune/dryrun2.mts`). A predictor that knows only which bot sits on each side scores 0.443 held-out. The fitted vector's 0.579 is worse than that.

| Held-out predictor | Log-loss, all quiet rows | Log-loss, p1-dev rows only |
| --- | ---: | ---: |
| Coin flip | 0.6931 | 0.6931 |
| Bootstrap vector | 0.6946 | 0.6817 |
| Fitted vector | 0.5794 | 0.5373 |
| Bot identity only | 0.4431 | 0.3087 |

Within a matchup, the fitted vector is worse than that matchup's base rate in 10 of 12 held-out cells (10 of 14 on dev-only). The labels are nearly deterministic by matchup: hard@desktop scores 0.018 against aiv2-hard, 0.0 against Rush and 0.97 against Balanced. The fit therefore learned purchase fingerprints. Aiv2 bots buy water_2 and win, so water_2 becomes +17,450. Hard buys plant_3 and fire_2 and loses, so those go negative. Texel assumes equal-strength self-play, and lopsided ladder replays break that assumption.

Two more results from the same data:

- **The bootstrap evaluation has no outcome signal at quiet nodes.** Its sign agrees with the result on 46.3% of decisive rows, and its held-out log-loss of 0.6946 is above ln 2 (0.6931).
- **The quiet rule removes what decides games.** HomeInvaded, Infiltration, HomeThreat, KillAvailable and CornerInfiltration are identically zero in all 2,681 quiet rows, and 62% of the games (228 of 366) ended in home-checkmate. A quiet corpus cannot price home safety, exactly as the Standard run found.

One run, `h2h-desktop-vs-aiv2hard-w1500` (489 quiet rows), used `p1-val.jsonl`, which is a pool the tuner refuses. The dev-only column above excludes it.

## 5. Is there enough diversity?

- **The 96-trajectory ceiling is real for fixed-work identical-weight self-play.** `HardEngine.setSeed` is a no-op (`src/ai/hard/engine.ts:381-385`), and 48 openings by 2 handicaps gives 96 cells. The two orientations of a same-engine pair are the same game.
- **It is cheap to lift technically.** `generateOpenings` at a scratch seed yielded 786 distinct one-turn openings from 6,000 attempts in 4.6 s, in memory, with nothing written. That is about 1,570 cells, or about 11,000 quiet rows at 7.3 per game. It saturates beyond that (5,214 duplicate digests). Thousands of openings would need multi-turn openings, which the generator does not offer.
- **The cost is governance rather than engineering or compute.** `DEV_POOL_PATH` is hard-wired into the tuner's trust boundary (`rows.ts:38,129,190`). A fresh pool also cannot be proven disjoint from the sealed set, which is held on another machine. About 1,400 self-play games is roughly 2-3 machine-hours (8 cores, 6 shards, 25-45 s per wall:1500 game).

## 6. What this means for the pragmatic path

Tuning is not step 2. Ordered by value per unit of effort:

1. **Hand-set priors tested as ladder arms.** This works today. `hard@ablate:<arm>` whole-vector weight arms resolve under Phasing v2; `hard@ablate:eval-no-economy` resolves to `phasing-accounting-bootstrap-v1-no-economy`. Adding an arm is one entry in `lab/hard-ai/ablate/arms.ts`, and the missing candidate-weights-file CLI (M6 blocker 3) is not needed for it.
   - The vector has five non-zero weights and gives zero weight to the home-safety terms.
   - Home-checkmate ended 62% of the scratch games.
   - Hand-setting HomeThreat, Infiltration, KillAvailable and Hanging is therefore where strength is available. Texel on quiet rows is structurally unable to set those terms.
2. **Tuning later, as a refinement.** Five things must be in place first:
   - the seven-literal revision fix (S);
   - an allowlist publisher (S-M);
   - a bounded, regularised fitter with `k` fixed by convention (M);
   - an equal-strength self-play corpus from a dedicated pool of about 700 openings (M);
   - some separate answer for the tactical terms.
   
   That is a few focused days with the prereg discipline relaxed, and weeks if blockers 1, 2, 4 and 5 are each frozen by dated amendment.
3. **Dropping the five M6 blockers from the critical path is justified.** They gate a fitted vector. Even with all of them cleared, the fitted vector would be worthless on the data available, and it could not set the terms that matter.

## Scratch artifacts (all outside the repo)

All files are under `/private/tmp/claude-501/-Users-ethancd-src-deevgames/d0196f82-8636-4254-b748-56de209f4b8e/scratchpad/tune/`:

- `dryrun.mts`, `dryrun-result.json`, `dryrun-corpus.json` (the 366-game corpus build and the fit as written)
- `dryrun2.mts`, `dryrun2-result.json` (the opponent-identity check and the p1-dev-only split)
- `rows-all-macro.jsonl` (the 9,872 macro-node rows)
- `gencheck.mts` (the 786-opening generator probe)
- `armcheck.mts` (the ablation-arm resolution check)