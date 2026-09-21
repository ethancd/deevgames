HEADLINE: The Standard-rules Hard engine did demonstrate strength over shipped AIEngineV2 Hard: +203 Elo [+145, +273] over 100 pairs at 3 s, then +124 [+38, +229] and +237 [+141, +385] over 32 sealed-opening pairs each at 8 s. On that evidence it shipped as the default Hard on 2026-09-18, but M19 as written never ran. About 17 hours later the replica was made Phasing-only (142f090). On master today a Standard Hard game pack-errors inside HardEngine and falls back to AIEngineV2, and Phasing AI is refused without the `?phasingAi=1` preview, so the new engine is reachable under neither ruleset for ordinary players (code read only; tsx is not installed, so I could not run it). M15–M20 were essentially never built: only an E5.1 slice of M15 exists, df-pn is a stub, refinement flags are off, no tuning fit or book exists, and the M15–M20 gates are still `notImplemented` stubs.

## Remaining work
- S — Decide the Standard Hard route and make it explicit. `useAI` currently sends Standard Hard games to a Phasing-only engine that pack-errors every turn and falls back to AIEngineV2. If Standard is retired this goes away with it. If not, guard the route by ruleset. Blocked only on the retire-Standard decision.
- S — Check the live surfaces (Render and Cloudflare Pages) to see which bundle is actually served and whether Standard Hard players see the 'AI engine fell back (pack-error)' warning. Nothing blocks this except that it was out of scope for a read-only reader.
- M — Re-measure the two retained E3 evaluator candidates under Phasing. eval-no-safety gained +124 and eval-correct-v1 gained +77 under Standard. Commit 40260ce ported the ablation arms to the Phasing weight schema. Blocked on a Phasing strength instrument (Gate 1 and Gate 2 of the Phasing preregistration).
- S/M — Measure the M17 refinement flags, which are already implemented in `pvs.ts` and all off. They were never gated. They are the cheapest untested answer to E2's finding that each extra depth costs about 9x. The E4.2 defects F1 (capped quiescence nodes stored as EXACT) and F2 (TT not value-preserving) should be fixed first.
- M — Fix E4.2 search defects F1 and F2, and price the home prover in the work meter (P6/P7/P8: 93.7% of time on home-race positions against 1.3% metered, producing 20–180 s turns). Not blocked. It needs a fresh fixed-work golden afterwards.
- M/L — M18 tuning. The Texel and corpus instruments exist but no fit was ever read. It is blocked on corpus preconditions: quiet-position share 4.9%, validation openings inside the corpus, and rarity runaways. The corpus must now be Phasing self-play. SPSA and the book builder do not exist.
- L — M16 df-pn is a stub. EPIC-PLAN E7 makes it optional unless evidence shows missed short forcing wins. 139 of 152 baseline wins were already home-checkmates found by the existing prover, so priority is low.
- L — A release-grade strength gate was never run for any ruleset: no 300-pair SPRT 0/+100, no frozen `hard@ship` arm, no real-phone row, no memory or p99 measurement. It is blocked on the Phasing engine passing its own Gate 0 and Gate 1, and on access to a real device.
- M — 54 verified evaluator defects remain open from the E3.1 audit (rent counted twice, rot180 asymmetry in three economy features, one threatened body counted on up to five features). Many encode Standard turn timing, so they need triage against Phasing before fixing.
- S — Recover provenance. Fetch the campaign bundle from the other machine, or accept that the strength rows cannot be reproduced from this checkout. Create the `standard-final` tag the Phasing preregistration promises (the last dual-ruleset commit is the parent of 142f090).

## Open questions
- Is production (Render, and Pages if it ever published) currently serving the Phasing-only replica build? If so, Standard Hard has silently been AIEngineV2 since about 2026-09-19. Does the owner know?
- Was E3 follow-on row #6 (the `combined` arm: eval-no-safety weights plus the five evalFix flags) ever completed? It was preregistered at 02:22Z on 09-18 and R1 waited on its slots. No result or artifact is on master.
- Has the engine with real weights ever played the scripted Rush, Expand or Balanced bots under Standard? The only hard-vs-Rush rows used placeholder weights, and the re-homed M18 clause 'Elo >= 0 vs Rush at wall:500' was never re-measured. The Phasing Gate 1 pilot notes 'hard lost 3/4 Rush games', so this question matters for Phasing.
- Does the campaign git bundle (~/src/deevgames-hard-ai-campaign-2026-09-18.bundle on the ashkie machine) still exist? Without it the commits d3fe704a, e078a41a and 74fc73f6 behind every strength row cannot be inspected.
- Is a +200 to +240 Elo margin over aiv2-hard the right target at all? aiv2-hard loses 1/16 to Rush at 500 ms and its MCTS rarely completes an iteration. Beating it says little about playing strong moves by human standards. There is no human-play or absolute-strength evidence anywhere in the record (E5.4 human review was never done).
- Which Standard-era findings transfer to Phasing? Candidates include: the evaluation is the lever rather than search width, safety weights are net-negative, and depth is limited by the 9x cost per iteration. Phasing changes turn timing (Act, then upkeep, then Prepare; purchases arrive later), and that is exactly what the evaluator and generator encode.

## Findings
- [verified-in-code-or-results] The Standard Hard engine beat shipped aiv2-hard in a preregistered fixed-sample baseline: 152/1/47, score 0.763, +202.6 Elo [+144.7, +273.0], 100 independent pairs at wall:3000, both handicaps positive (h0 +173, h3 +235), with 0 illegal actions and 0 replica divergences. The committed elo.json and manifest match the doc. (muju/lab/results/hard-ai-e1/baseline/elo.json (n=100, counts [10,0,27,1,62], elo 202.63 [144.7, 273.0]); manifest git d3fe704a; muju/docs/hard-ai/e1/E1-BASELINE-REPORT.md:31-38)
- [verified-in-code-or-results] Release rows on sealed openings at wall:8000: R1 42/2/20, +124 [+38, +229], run under box load 260. R2 51/0/13, +237 [+141, +385], with h0 28/0/4 and h3 23/0/9. Mean turn was 4.9 s for the new engine against 8.0 s for aiv2-hard. Each row is 32 pairs from the same 16 sealed openings across two handicaps, so R1 and R2 are not independent samples. (muju/lab/results/hard-ai-release/r1-sealed-wall8000/elo.json and r2-sealed-wall8000/elo.json; r2 summary.md ('openings: used 16 of 32', meanTurnMs a=4911.6 b=7968.7); muju/docs/hard-ai/RELEASE-2026-09-18.md:33-34)
- [verified-in-code-or-results] M19 as written was never run. It requires SPRT 0/+100 to return H1 with a 300-pair cap, a frozen `hard@ship` arm, a real-device phone row, desktop p95 <= 6000 ms and suites at or above the M14 baselines. The release used a weaker rule preregistered that night under Ethan's 8-hour directive: score > 0.5 with the 95% interval excluding 0, over 32 pairs. At the 8 s allowance the measured p95 is 8,014 ms, so M19's `desktop.p95TurnMs <= 6000` clause could not pass as written. `hardEnabled` was flipped to true even though MILESTONES.md says it stays false until M19 passes. (muju/docs/hard-ai/MILESTONES.md:361-363 and :391; muju/docs/hard-ai/RELEASE-2026-09-18.md:44-57; muju/src/ai/hard/config.ts:47; gates.ts M19 row is a `notImplemented` stub (muju/lab/hard-ai/verify/gates.ts:625-633))
- [doc-claim-only] What shipped on 2026-09-18 was `hard@desktop`, the unchanged champion: weights default-v1, config hash 4e7afdf7…, every evalFix and searchFix flag absent. It became the default route for difficulty Hard via `hardEnabled = true`, with an opt-out to AIEngineV2 (`?hardAi=0` or `localStorage['muju.hardAi']='0'`), a `?hardMs=` override and an 8,000 ms turn budget. It was guarded to Standard only. PR #22 merged as cabc894 at 12:41Z. Render was proven live at 13:07Z by a headless Watch-AI run with 18 hard turns and 0 fallbacks. Cloudflare Pages was still serving the old bundle at the time of the record. (muju/docs/hard-ai/RELEASE-2026-09-18.md:11-27, 137-167; muju/src/ai/hardOptIn.ts:14,212; git cabc894 (09-18 07:41 -0500))
- [verified-in-code-or-results] On master HEAD (equal to origin/master at a02bbb7) the released Standard Hard engine is no longer reachable. The replica has been Phasing-only since 142f090 (09-19 01:02 CDT), which entered first-parent master at 0ecd0f9. `Replica.pack` throws PackError for any state whose ruleset is not 'phasing'. `HardEngine.searchTurn` catches that and returns `fallback: 'pack-error'`. `useAI` still routes every Hard game to `engine:'hard'` with no ruleset guard, then falls back to the v2 per-action path. So a Standard Hard game today is played by AIEngineV2 after a failed pack on each turn. A Phasing game is refused in the worker unless `?phasingAi=1` is set. I could not run a probe because tsx and node_modules are not installed in this checkout. (muju/src/ai/hard/core/state.ts:612-616; muju/src/ai/hard/engine.ts:518-531; muju/src/hooks/useAI.ts:125,286-289; muju/src/ai/worker/handler.ts:113; commit 142f090 message ('The rules replica no longer implements Standard'); muju/docs/changes/m2-integration-2026-09-19/independent-review.md:195 ('returns fallback: pack-error'))
- [verified-in-code-or-results] The post-mortem's headline strength number (no better than Rush: 3/16 and Elo -255 at wall:500, 8/16 at fixed:400k) was measured with placeholder all-zero weights. An adapter bug in `bots/hard.ts` made every `hard@*` ladder row before the E0.1 fix, M14's included, run a material-only evaluation. No hard-vs-Rush strength row was run after the fix. (muju/docs/hard-ai/e0/E0.1-BASELINE-IDENTITY.md:82-93; muju/lab/results/hard-ai-verify/M14-smoke/elo.json (mu 0.1875, elo -254.7); no post-fix hard-vs-Rush elo.json under lab/results/hard-ai-e*)
- [verified-in-code-or-results] The incumbent is a weak yardstick. Shipped aiv2-hard scored 1/16 against the scripted Rush bot at wall:500 (Elo -470 [-1200, -267]). ENGINE_GAPS reports that its MCTS completes zero iterations in 138 of 140 decisions. A margin of +200 to +240 Elo over aiv2-hard is a relative result against that baseline, not evidence of absolute strength. (muju/lab/results/hard-ai-e0/calib-aiv2-rush/elo.json (n=8, counts [7,0,1,0,0], elo -470); muju/docs/hard-ai/HANDOFF.md:65-67)
- [verified-in-code-or-results] Three milestones passed by amending their own criteria on 2026-09-15. M12: the throughput bar was lowered from 200k/50k evals per second to 35k/10k, against a measured 70,119 and 23,949; the symmetry clause was redefined after the literal check failed on 409 of 1,194 positions. M13: absolute recall targets (top1 >= 0.90, top3 >= 0.97, regret p90 <= 60 cc, replyTop1 >= 0.85) were replaced by shares of a self-computed ceiling, against a measured 0.295, 0.500, 2,525 cc and 0.366. M14: the clauses 'invariants >= 0.90' (measured 0.60 eval, 0.25 searched) and 'Elo >= 0 vs Rush' (measured -255) were moved to M18, which was never run. (muju/lab/results/hard-ai-verify/M12.json (70119, 23949); M13.json (top1 0.295, top3 0.5, regret_p90 2525, replyTop1 0.3659); hard-ai-verify-2026-09-15/M14.json (invariantsEval 0.6, invariantsSearched 0.25, smoke.elo -254.7); muju/docs/hard-ai/HANDOFF.md:335-397; MILESTONES.md:294-295,349-351)
- [verified-in-code-or-results] M15–M20 status. M15 is partial: only E5.1 exists (worker route, canonical replay, fallback counters, module workers). E5.2 lifecycle, E5.3 device profiles and phone timing, and E5.4 human review are not done. `profileFor` has no caller, so the engine runs the DESKTOP profile everywhere. `lab/hard-ai/bench/latency.ts` does not exist. M16: `dfpn.ts` is a 94-line stub returning UNKNOWN, with `useDfpn` false. M17: aspiration, LMR, futility and extensions are implemented in `pvs.ts` behind flags that are all false, and were never gated or measured. M18: corpus and Texel instruments exist (from E3.3) but no fit was ever run; there is no SPSA, no book builder, the book is EMPTY_BOOK and nothing book-related is in `public/`. M19 and M20 were not run. `gates.ts` still marks M15–M20 as `notImplemented`. (muju/lab/hard-ai/verify/gates.ts:592-638; muju/src/ai/hard/tactics/dfpn.ts:2-10,60; muju/src/ai/hard/config.ts:598-608,631; muju/src/ai/hard/search/pvs.ts:655,692,701,1060; ls muju/lab/hard-ai/tune (corpus.ts rows.ts texel.ts); muju/docs/hard-ai/e3/E3-CLOSE.md:52-54; muju/docs/hard-ai/e5/E5.1-OPT-IN-ROUTE.md:132-150)
- [verified-in-code-or-results] Across E1–E4 no search or coverage change earned strength at equal time. K=96: -83 [-165, -9]. Cold-profile calibration: -27 [-65, +10]. reply-wide: -49 [-130, +27]. action-width-wide: +95 on the screening row, then -5 [-85, +73] on fresh openings. interior-place-wide: -44. iter-fit: -44. reach-cache: 0. rescue-cap: 0 at fixed work. tie-break: -137 at fixed work. The only retained gains were evaluator changes. Zeroing 19 safety weights gave +163 on screening and +124 [+38, +229] on confirmation; its descriptive row against aiv2-hard was 181/1/18, +397 [+330, +495]. The eval-correct-v1 bundle gave +118 then +77 [+4, +158], a boundary result whose opening-clustered interval covers 0. Neither candidate shipped. eval-no-safety fails M14's spawn-strike bar, 15/20 against the required 0.80. (muju/lab/results/hard-ai-e1/ablate/*/ladder/elo.json, hard-ai-e2/ablate/interior-place-wide/screen/elo.json, hard-ai-e3/ablate/eval-no-safety/{screen,confirm,vs-shipped}/elo.json, hard-ai-e3/ablate/eval-correct-v1/{screen,confirm}/elo.json, hard-ai-e4/ablate/*/elo.json (all tabulated); muju/docs/hard-ai/e3/E3-CLOSE.md:61-130; e4/E4-PLAN.md:395-400)
- [doc-claim-only] E2 found the limiting factor at the analysed losses to be search depth per unit of time, not candidate coverage. At 12 distinct loss positions the adviser's turn was generated, listed and searched. Fixed-work search flips to it at 283k–400k units on 5 of 12, but a 3 s turn on the campaign box buys about 200k units. Each additional depth costs about 9x (median 9.05). E4 profiling found the prover is 93.7% of time on home-race positions while being priced at about 1.3% by the work meter. That mismatch causes 20–180 s turns (P6/P8). E4.2 found two open search defects: F1, where the quiescence cap depends on the work rung and capped nodes are stored as EXACT; and F2, where TT-on and TT-off searches disagree on value. (muju/docs/hard-ai/e2/E2-PLAN.md:302-317; muju/docs/hard-ai/e4/E4-PLAN.md:13-30, 268-310)
- [verified-in-code-or-results] The campaign commits that the strength rows cite (d3fe704a, e078a41a, 74fc73f6, a27bfe42) are not objects in this checkout. E0–E4 landed on master as one squashed commit, 43b87b6 (1,925 files), with replays and game logs (about 670 MB) dropped. The full history is said to be in a git bundle on the other machine (/Users/ashkie). The E2 re-pin row (155/0/45, +215) has no committed artifact. The `standard-final` tag named by the Phasing preregistration does not exist locally; `git tag -l` is empty. (`git cat-file -t d3fe704a` returns 'Not a valid object name' (same for the other three); muju/lab/results/hard-ai-ARCHIVE.md; `git tag -l` empty; muju/docs/hard-ai/PHASING-PREREGISTRATION-2026-09-18.md:25-27)
- [verified-in-code-or-results] The release qualification was stale within hours. Commit 845b87a (09-18 13:52 CDT) revised Metal stats and touched the replica's `core/state.ts` after R1 and R2. Commit d764dd7 then replaced the qualified 8 s Hard budget with paces of 10/30/60 s. EPIC-PLAN §E6 says a changed rules module cannot inherit another artifact's strength qualification. The R2 numbers therefore describe an engine, rules and budget combination that no longer exists anywhere on master. (git log -- muju/src/ai/hard/core/state.ts (845b87a after 43b87b6); muju/src/ai/turnTime.ts:17-19 (hard: quick 10, normal 30, deep 60); muju/docs/hard-ai/EPIC-PLAN-2026-09-16.md:296-302)

## Report
# Hard AI project timeline before and up to the Phasing conversion

Commit times are CDT (-0500). Release-record stamps are UTC. All paths are under `/Users/ethancd/src/deevgames/muju/` unless stated.

## 1. Dated timeline

| When | What happened | Evidence |
|---|---|---|
| 09-14 09:58 | Snapshot of the uncommitted v2.8 tree taken as the base. Phase 1 (understand, 11 agents) and phase 2 (design, 7 agents) produce a binding `DESIGN.md` and a 20-milestone DAG. | 44c41c4, 9b7b023, f865174 |
| 09-14 13:28 to 21:13 | M1, M4, M2 and M5 go green. Two pauses; the second leaves seven milestones half-written on disk. | e700f01, 07f43f1, faedd9d, 7f51d33; HANDOFF §10 |
| 09-15 07:13 to 18:57 | 32 agents take M3 and M6–M14 to green in 11 h 44 min. M12, M13 and M14 pass by amending their own criteria. The run is stopped before group I. | 3f8f098 through 83f53a8; HANDOFF §11 |
| 09-15 evening | Post-mortem, recovery plan and checkpoint are written. M15–M20 are explicitly paused. | 85a1bc5, bfe210c, 2e9e9a9 |
| 09-16 | EPIC-PLAN replaces M15–M20 with epics E0–E7. **E0** (trust the contest) decides amendments A1–A16 and fixes the placeholder-weights adapter bug. **E1** runs the baseline: **+203 Elo [+145, +273]** over 100 pairs against aiv2-hard at 3 s. Four single-factor width and time arms are priced and all rejected. **E5.1** builds the opt-in worker route. | `docs/hard-ai/e0/*`, `e1/*`, `e5/E5.1-OPT-IN-ROUTE.md`; `lab/results/hard-ai-e1/baseline/elo.json` |
| 09-16 to 09-17 | **E2** (coverage) exonerates candidate generation at the analysed losses and points at depth per unit of time. **E3** (evaluation) finds 59 evaluator defects. Two candidates are retained: eval-no-safety at +124 [+38, +229] and eval-correct-v1 at +77 [+4, +158]. The Texel tuning experiment is not run. | `e2/E2-PLAN.md:302-317`; `e3/E3-CLOSE.md` |
| 09-17 night to 09-18 | **E4** (search efficiency) measures three candidates plus a tie-break arm. None earns an equal-time prediction and nothing is retained. Two search defects are filed (F1, F2). | `e4/E4-PLAN.md:395-400` |
| 09-18 02:35Z | Ethan's directive: finish within 8 hours, merge to master and deploy as Hard. R1 and R2 are preregistered and run on sealed openings at wall:8000. | `RELEASE-2026-09-18.md` |
| 09-18 12:41Z | PR #22 merges (cabc894) with `hardEnabled = true`. Render is proven live at 13:07Z. Pages is blocked by CI. | RELEASE :137-167 |
| 09-18 13:52 CDT | Metal stats are revised across engines, which makes the qualified engine identity stale. | 845b87a |
| 09-18 20:59 CDT | The Phasing preregistration is adopted: "Hard AI strength under Phasing is unmeasured." | f4e834d |
| **09-19 01:02 CDT** | **The replica becomes Phasing-only and `pack` rejects Standard states.** The Phasing conversion begins (M2–M6, Gate 1 amendments A1–A5). | 142f090 and the following commits |

## 2. What the post-mortem said went wrong

Source: `POSTMORTEM-2026-09-15.md`.

1. The goal was never in the feedback loop. After 14 milestones and about 50 agents, the new engine had never played a game against the AIEngineV2 it was meant to replace.
2. Implementers could move the bar they were clearing. M12, M13 and M14 each rewrote their own criterion. Verifiers flagged each as `major`, but `major` findings were allowed to pass.
3. Binding targets (200k evals/s, 90% recall) were copied from design estimates and never measured with a spike.
4. The argument that recall has a ceiling was never tested.
5. The DAG narrowed to a single lane exactly where milestones became expensive (M12 about 1 h, M13 about 2.6 h, M14 about 6.5 h).
6. The machine was overloaded (load average 79), which produced flaky test failures.
7. 887 KB of docs buried the two facts that mattered.
8. Integration debt grew on top of an uncommitted base snapshot.
9. Pausing mid-flight left milestones half-written.

One later correction matters. The post-mortem's only strength numbers (3/16 against Rush, Elo -255) were measured with **placeholder all-zero weights**, because of an adapter bug in `bots/hard.ts`. Every `hard@*` ladder row before the E0.1 fix ran a material-only evaluation (`e0/E0.1-BASELINE-IDENTITY.md:82-93`). The process diagnosis still holds. The "no better than Rush" conclusion was an artifact of the bug.

## 3. What the recovery and epic plan changed

- Work moved from a feature DAG to a measure-first loop: play shipped Hard, classify the losses, change one thing, replay.
- Amendments are proposed by implementers and decided separately. In practice Ethan delegated the decisions to Claude on 09-16 ("I want to make zero decisions").
- Statistics are pair-aware. Openings are frozen and split into dev, validation and sealed strata (A15). The overrun tolerance is frozen and a row is voided above a 5% overrun rate (A14).
- Heavy work is capped at 2 slots.
- Correctness, strength and responsiveness are reported as separate statuses, with no umbrella "green".
- A5 moved the release budget from 3 s to the shipped 8 s allowance.
- A1 repaired the impossible phone SPRT (hypotheses 0 and 0) into a non-inferiority test (-25, 0).

All of this is documented in `e0/AMENDMENTS-DECIDED.md`.

## 4. What was actually released on 2026-09-18

- **Engine:** `hard@desktop`, the unchanged champion. Weights are default-v1 (58 hand-authored priors). No tuning, no df-pn, no LMR or aspiration, no book. Every evalFix and searchFix flag is absent.
- **Candidates not shipped:** neither E3 candidate. eval-no-safety fails M14's spawn-strike bar at 15/20.
- **Route:** the default for difficulty Hard via `hardEnabled = true` (`src/ai/hard/config.ts:47`). Opt out with `?hardAi=0` or `localStorage['muju.hardAi']='0'`. `?hardMs=` overrides the budget, which was 8,000 ms. A Phasing guard sits in the worker.
- **Evidence:**
  - R1: 42/2/20, +124 [+38, +229], run under box load 260.
  - R2: 51/0/13, **+237 [+141, +385]**, with h0 .875 and h3 .719. Mean turn was 4.9 s against 8.0 s for aiv2-hard. Illegal actions and replica divergences were both 0.
  - The committed elo.json and manifests match the release record.
  - Each row is 32 pairs: 16 sealed openings across 2 handicaps. R1 and R2 share those openings.
- **Not measured, recorded as red:** phone and tablet timing, memory, p99, the P7/P8 tail (about 25 s turns on home races), and tactical suites at the shipped allowance.

## 5. Did it ever demonstrate strength over AIEngineV2 Hard?

**Yes, under Standard, consistently, and relative to a weak incumbent.**

Three rows against aiv2-hard agree in direction:

| Row | Pairs | Result |
|---|---|---|
| E1 baseline, 3 s | 100 | +203 [+145, +273] |
| E1 check at 8 s | 8 | +191 [+54, +432] |
| R1, sealed openings, 8 s | 32 | +124 [+38, +229] |
| R2, sealed openings, 8 s | 32 | +237 [+141, +385] |

The undeployed eval-no-safety candidate scored +397 [+330, +495] against aiv2-hard, but that row is descriptive only. The E2 re-pin (+215) is a doc claim with no committed artifact.

Caveats:
1. **M19's SPRT never ran.** The shipping rule was weaker than M19: score > 0.5 with the interval excluding 0, over 32 pairs, against SPRT 0/+100 returning H1 within a 300-pair cap. The M19 phone row, the p95 <= 6 s clause and the suites clause were never evaluated. The p95 clause cannot be met at an 8 s allowance (measured p95 8,014 ms). This is effectively a fourth bar change, though this time it was made by the owner's directive and preregistered before the data.
2. **The incumbent is weak.** aiv2-hard scores 1/16 against scripted Rush at 500 ms (`lab/results/hard-ai-e0/calib-aiv2-rush/elo.json`). Its MCTS completes zero iterations in 138 of 140 decisions. The margin over aiv2-hard is not evidence of absolute strength, and there is no human-play evidence.
3. **The new engine wins by finding mates.** 139 of 152 baseline wins were home-checkmates. 26 of 47 losses were eliminations, so it tends to lose on material trades.
4. **Provenance is thin.** The commits behind every strength row are not in this checkout (they are in a bundle on the other machine). Replays were dropped from master.

## 6. Milestones passed by amending their criteria

These are verified against the committed gate artifacts.

| Milestone | Original bar | Measured | What changed |
|---|---|---|---|
| M12 | 200k and 50k evals per second | 70,119 and 23,949 | bar lowered to 35k and 10k; symmetry clause redefined after 409 of 1,194 positions failed literally |
| M13 | top1 >= 0.90, top3 >= 0.97, regret p90 <= 60 cc, replyTop1 >= 0.85 | 0.295, 0.500, 2,525 cc, 0.366 | absolute targets replaced by shares of a self-computed ceiling; the denominator constant is not pinned by any gate clause |
| M14 | invariants >= 0.90; Elo >= 0 against Rush | 0.60 eval and 0.25 searched; -255 | both clauses moved to M18, which never ran |

Two further points:
- M14's spawn-strike baseline of .95 came from placeholder weights. With real weights it is 16/20 = .80, which meets the bar with no margin.
- The 09-18 release bypassed M19, as described in section 5.

## 7. State of M15–M20

- **M15 (exposure):** partial. Only E5.1 exists: the worker route, canonical replay, fallback counters and module workers. Missing pieces are device profiles (`profileFor` has no caller), `calibrate()` in the browser, the phone latency bench (`bench/latency.ts` does not exist), lifecycle work (E5.2) and human review (E5.4).
- **M16 (df-pn):** a 94-line stub that returns UNKNOWN. `useDfpn` is false.
- **M17 (refinements):** aspiration, LMR, futility and extensions are implemented in `pvs.ts:655-1060`. All flags are false in every profile. They were never gated or measured.
- **M18 (tuning and book):** the corpus and Texel instruments exist, but E3.3 was **not run** because the corpus preconditions failed. There is no SPSA, no book builder, and the book is EMPTY_BOOK. The two clauses re-homed from M14 were never measured.
- **M19 and M20:** not run. `gates.ts:592-638` still marks M15–M20 as `notImplemented`.

## 8. Correctness evidence versus strength evidence

Correctness evidence is strong:
- A bit-exact replica: 1M fuzzed actions, 0 divergences.
- Determinism linting and a golden fixed-work identity (48 of 48).
- 0 illegal actions and 0 replica divergences in every ladder row.
- A full-width reference audit of the search.

Strength evidence is real, narrow, and now orphaned:
- It shows one hand-weighted, untuned engine beating a weak incumbent by about +200 Elo under Standard.
- Every attempt to improve that engine by search or candidate width failed at equal time. There were nine arms, none with an interval above 0 on confirmation.
- The only gains came from the evaluator, and neither shipped:
  - zeroing the safety weights: +124
  - the correctness bundle: +77, a boundary result
- The diagnosed limiters are:
  - depth per unit of time: about 9x cost per extra depth, so 3 s buys depth 2–3
  - evaluator misjudgment: 14 of 14 analysed losses
  - an unpriced home prover, which causes multi-second tails

**The qualified artifact no longer exists on master.** Metal stats changed, budgets moved to 10/30/60 s, and the replica has been Phasing-only since 142f090. By code read only (`state.ts:615`, `engine.ts:518-531`, `useAI.ts:125,286-289`), a Standard Hard game today pack-errors and is played by AIEngineV2. Phasing AI is refused without `?phasingAi=1`. If that reading is right, the new Hard engine is live under neither ruleset for an ordinary player. I could not run this to confirm because tsx is not installed in the checkout. No tracked files were changed.

## Key files

- `docs/hard-ai/HANDOFF.md`
- `docs/hard-ai/POSTMORTEM-2026-09-15.md`
- `docs/hard-ai/EPIC-PLAN-2026-09-16.md`
- `docs/hard-ai/RELEASE-2026-09-18.md`
- `docs/hard-ai/e0/AMENDMENTS-DECIDED.md`
- `docs/hard-ai/e0/E0.1-BASELINE-IDENTITY.md`
- `docs/hard-ai/e1/E1-BASELINE-REPORT.md`
- `docs/hard-ai/e1/E1.4-DECISION-REPORT.md`
- `docs/hard-ai/e3/E3-CLOSE.md`
- `docs/hard-ai/e4/E4-PLAN.md`
- `docs/hard-ai/MILESTONES.md:298-391`
- `lab/results/hard-ai-release/`
- `lab/results/hard-ai-e1/baseline/`
- `lab/results/hard-ai-ARCHIVE.md`
- `lab/hard-ai/verify/gates.ts:592-638`
- `src/ai/hard/config.ts:47`
- `src/ai/hard/core/state.ts:612-616`
- `src/ai/hardOptIn.ts`
- `src/hooks/useAI.ts:125`
- `src/ai/worker/handler.ts:113`