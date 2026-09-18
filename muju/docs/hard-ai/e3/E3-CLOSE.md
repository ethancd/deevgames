# E3 close — decision record (EPIC-PLAN §7)

Written 2026-09-17T23:48:53Z on `claude/hard-ai-e3` at the commit that carries this file (parent 18171ae5) (integration worktree
`~/src/deevgames-e3`). Bar: `../EPIC-PLAN-2026-09-16.md` §4 E3 (slices and
exit), §5 (experiment contract), §7 (this record's shape). Sources:
`E3-PLAN.md` (ledger and every dated correction), `E3.2-ROW-REPORT.md` §8 (the
candidate's full §7 record; this file condenses it and adds rows #3–#5),
`E3-CLOSE-CRITIQUE.md` (independent critique, written before row #4 was read).
No umbrella status: the four axes are reported separately and the red
obligations stay listed.

## Status by axis, at the close

- Correctness: PASS for the champion's identity (config hash unchanged in every
  commit; fixed-work golden 48 of 48 identical after every merge including
  `origin/master` at c73204dd). PASS for both arms' hygiene columns
  (illegalActions 0, replicaDivergences 0 in every row). Fifty-nine evaluator
  defects were found and verified; five are fixed behind flags absent in every
  profile (`eval-correct-v1`); the rest are open, listed in
  `E3.1-SYNTHESIS.md` and `E3.3-INSTRUMENT-FOLLOWUPS.md`.
- Strength: TWO champion candidates, each retained under the preregistered
  rule against `hard@desktop` and never compared with each other:
  `hard@ablate:eval-no-safety` (confirmation 0.672, +124 [+38, +229],
  clustered [+41, +226], solid) and `hard@ablate:eval-correct-v1`
  (confirmation 0.609, +77 [+4, +158], clustered [−12, +178], boundary,
  fragile). Development evidence only.
- Responsiveness: measured on this desktop only (Apple M2 Max, node 24);
  p95 at the 3,000 ms allowance, overruns ≤ 0.5% per seat, no fallbacks;
  peak memory and p99 NOT MEASURED (no harness column). P8: a fixed-work turn
  can run for minutes and a wall turn to ~25 s on a home-race position, in
  both arms; a search change, handed to E4.
- Integration: `origin/master` merged at the close (four UI commits, no engine
  file touched); scoped tests 1,187 of 1,188 with the one failure the P6
  wall-clock assertion under load, 5 of 5 alone. Nothing ships from E3: M20's
  fixed-work SPRT and E6's held-out release stand.

## Slices against their acceptance evidence

- E3.1 feature audit: DONE. Contributions, scale and cost exposed
  (`E3.1-FEATURE-AUDIT.md`, `E3.1-CONTRIBUTIONS.md`); group ablations run
  (`E3.1-GROUP-ABLATION.md`); double counting (rent twice, one threatened
  body on up to five features), side symmetry (rot180 asymmetry in three
  economy features) and duplicate predicates found; contradictory authored
  preferences separated from engine bugs in `E3.1-SYNTHESIS.md`.
- E3.2 fix one costly misconception: PARTLY. The retained candidate is a group
  ablation (19 safety weights to 0), not a corrected misconception: the
  in-sample "safety for economy" story did not generalise to the 47 baseline
  losses and the development case does not flip under search. The bundle
  `eval-correct-v1` is the slice's literal deliverable (reproduce, correct on a
  development case, assess unseen cases); its unseen-case assessment is rows
  #4/#5.
- E3.3 small tuning experiment: NOT RUN. Blocked by the corpus preconditions in
  `E3.3-TUNING-INSTRUMENT.md` (quiet share 4.9%, validation-opening rows in the
  corpus, rarity runaways) and by a missing ruling on training openings.
- Exit ("simpler or better-calibrated judgment that earns strength"): MET on
  the "simpler" reading (58 → 39 non-zero authored weights, +124 Elo at equal
  time on held-out validation openings); NOT MET on the "better-calibrated"
  reading (no misconception was shown to be repaired). Recorded as such, not
  amended.

## Candidate 1 — `hard@ablate:eval-no-safety` (retained)

```text
Candidate/source/config hashes:
  hard@ablate:eval-no-safety, wall:3000 hash 66edf9cdf58f6b037186b25d05a939ed521e8a76e07051937dcbc611eb343aaf,
    weights default-v1-no-safety; incumbent hard@desktop 4e7afdf76b32fadfab2d11577cb610c8f9f1a491b5153e70b87b0774403600cd
  rows #1/#2 at 50b6a94c / a0f03c4e, row #3 at 55ae23d8; one commit for both arms in each row
Hypothesis and changed parameter(s):
  the 19 authored safety weights (lab/hard-ai/audit/eval-groups.ts) are net-negative at equal time; all 19 set to 0, nothing else
Correctness: hygiene pass (illegalActions 0, replicaDivergences 0 across 328 games; champion hash and golden unchanged)
  TACTICAL REGRESSION against the champion: −1 spawn-strike case (purchase-1, 15/20 vs 16/20), −3 exam exact at 200k (117/127 vs 120/127); tactics 73/79 and home-mate 56/56 equal
  the row #2 bars ("within one", "within three") were written at 10:06Z after these numbers were known (06:52Z) and sized to them — they are not evidence (close critique B1)
  M14's gate `spawnStrike >= 0.80` at the gate's own work (fixed 400k, desktop profile, 18:02Z): champion 16/20 (.80), candidate 15/20 (.75, FAILS by purchase-1), bundle 16/20 (.80) — a release-contract veto for the candidate until won back or amended with Ethan as approver
Strength vs shipped Hard (aiv2-hard), row #3, descriptive, e1-baseline 100 pairs h0/h3, seed 20260933, 4 shards:
  181/1/18, 0.9075, +397 [+330, +495]; h0 .890, h3 .925; abortRate 13.2%; loadAvgMean 10.0
  reference: champion's re-pin on the same set 155/0/45, 0.775, +215 [+156, +287]; E1's original 152/1/47, +203 [+145, +273]
Strength vs previous candidate: none (E2 retained no candidate)
  vs incumbent, equal time wall:3000, h0/h3, strict legality:
    row #1 screening, e1-val2 rows 0–15, seed 20260931: 45/2/17, 0.719, +163 [+85, +260]
    row #2 confirmation, e2-val rows 32–47, seed 20260932: 42/2/20, 0.672, +124 [+38, +229]; h0 .719 (+163 [+32, +366]), h3 .625 (+89 [−22, +221] — covers 0)
  opening-clustered intervals (critique re-analysis, 16 clusters per row): row #1 [+91, +251], row #2 [+41, +226]; the retention rule holds under clustering
  A15: 16 independent openings per row
Responsiveness (this desktop): arm mean 1.7 s, p95 3.00 s, max 3.5 s; overruns ≤ 0.15%; no fallbacks; memory and p99 not measured
Representative loss and where the strong turn disappeared:
  g4-s6_3_5-B-white black t1: static delta flips from −275 cc to +60 cc with the weights at 0, but the arm's search still plays the avoided key at 25k and 200k; flips only at 400k. Group ablation, not a repaired misjudgment.
Decision: RETAIN as champion candidate on the STRENGTH rule alone (confirmation score > 0.5, interval excluding 0, robust to clustering). Not a shipped default; carries a tactical regression (above) as a red obligation.
Unresolved criteria or proposed amendments:
  which of the 19 weights carry the effect (no sub-block reproduces it: 0.688 / 0.562 / 0.625 vs 0.875 at fixed work)
  whether a correction beats the removal (eval-safety-once registered, never run)
  A6's spawn-strike .95 unmet by the champion under real weights (16/20; A-E3-3 records the placeholder origin); M14's .80 met with zero margin
  memory and p99 have no harness column; per-game box load recorded from row #3 on
Next bounded task: per-weight rows in a night window (E4 handoff 4); the two-factor `combined` arm (weights + evalFix) once the bundle is priced
Links: lab/results/hard-ai-e3/ablate/eval-no-safety/{screen,confirm,vs-shipped}/, preconditions/, followups/suites/, repro/, loss-judgment/
```

## Candidate 2 — `hard@ablate:eval-correct-v1` (the correctness bundle)

```text
Candidate/source/config hashes:
  hard@ablate:eval-correct-v1, wall:3000 hash 49aa15dba67fbc95acd5d6c316210bb4946e8f8016831cf5dc9143afa3641498,
    weights default-v1, evalFix b2+b3+b4+b5+b6 (HardConfig.evalFix; absent in every profile); incumbent hard@desktop as above
  row #4 at 9c8d5f64, row #5 at a3d4e7c0 (deevgames-e3-run2, re-detached); thresholds at c73204dd; src/ai/hard identical across all three
Hypothesis and changed parameter(s):
  five specification fixes, none tuned: B2 rot180 tie order, B3 Infiltration per anchor (A-E3-1), B4 Inv3 retreats>0 conjunct,
  B5 rent charged once, B6 approach tie order (inert without B4; A-E3-4). B1 (relocation trigger) excluded as an open flag (A-E3-2).
Correctness: four specification fixes (B2, B4, B5, B6) with canonical cases in E3.2-CORRECTNESS-ARM.md / -B6.md, and ONE RATIFIED SPEC CHANGE (B3: distinct voided anchors; DESIGN §9 addendum, A-E3-6)
  thresholds (measured 17:41–17:44Z before row #5 was funded): tactics 73/79, home-mate 56/56, spawn-strike 16/20, exam exact 200k 120/127 — every one equal to the champion; identical suite failure set
  descriptive fixed:100k, four e1-dev openings: singles all null (B2 .438, B3 .562, B4 .500, B5 .594, B6 .500); bundle 11/0/5, 0.688, +137 [+14, +309]
Strength vs shipped Hard: NOT MEASURED
Strength vs previous candidate (eval-no-safety): NOT MEASURED (needs the two-factor `combined` arm, preregistered separately)
  vs incumbent, equal time wall:3000, h0/h3, strict, 6 shards (night policy), one commit per row:
    row #4 screening, e1-val2 rows 16–31, seed 20260934, at 9c8d5f64: 42/1/21, 0.664, +118 [+51, +195], LOS 99.98%; h0 .656 (+112 [+9, +240]), h3 .672 (+124 [+42, +224]); not voided (overrun 0.44% / 0.50%); maxTurnMs 15,680 / 4,707 (no P6 flag); load 7.3
    row #5 confirmation, e2-val rows 48–63, seed 20260935, at a3d4e7c0: 39/0/25, 0.609, +77 [+4, +158], LOS 98.1%; h0 .594 (+66 [−25, +166]), h3 .625 (+89 [−26, +227]); opening-clustered +77 [−12, +178] (covers 0); not voided (overrun 0.40% / 0.34%); maxTurnMs 7,088 / 6,868; load 7.9
  mechanism (row #4 turnRows): the bundle searched SHALLOWER than the champion (100k rung 54% vs 45%, mean depth 2.34 vs 2.44, abort 12.8% vs 10.3%, 3 depth-0 turns vs 0) — B3's anchor scan costs nodes; the row priced cost as well as judgment, and the judgment gain outran the cost
Responsiveness (row #4): arm mean 1,825 ms, p95 3,002 ms, max 15,680 ms (search 10,011 ms + canonical residue, P7/P8); champion max 4,707 ms; overruns beyond tolerance 8 / 9; no turn over 20 s; memory and p99 not measured
Representative loss and where the strong turn disappeared: none claimed — the fixes are specification corrections, not a loss repair
Decision: RETAIN as a second champion candidate under the preregistered rule (confirmation score > 0.5, pair-level interval excluding 0 by 4 Elo) — a BOUNDARY retention: the clustered interval and both strata cover 0; fragile, to be settled by the next row; priced against hard@desktop only, never against eval-no-safety
Unresolved criteria or proposed amendments: B1 open; the remaining 54 verified evaluator findings; the `combined` arm
Next bounded task: the two-factor `combined` arm (eval-no-safety weights + evalFix) preregistered in E4's night queue; a larger confirmation on `e4-val` if `combined` is inconclusive
Links: lab/results/hard-ai-e3/ablate/eval-correct-v1/{fixed100k,screen,confirm}/, ablate/eval-fix-b{2..6}/, correct/{exam,thresholds,cross-commit,b6}/
```

## Red obligations carried out of E3

- The retained candidate regresses the champion on spawn-strike (15/20 vs 16/20) and exam exact at 200k (117 vs 120); its row #2 bars were sized to the observed numbers (B1). Bars are written before suites run from here on.
- M14's `spawnStrike >= 0.80` at the gate's own work: the candidate scores .75 (15/20, purchase-1), the champion and the bundle .80. A-E3-8: the bar stands; the candidate cannot ship until `purchase-1` is won back (per-weight rows in E4's night queue find the weight that protects it).
- B3 is a specification CHANGE for `Infiltration` (distinct voided anchors), RATIFIED under delegation as A-E3-6; the bundle is four fixes and one ratified spec change.
- Amendments A-E3-1..5 were applied under delegation; A-E3-1 and A-E3-3 are ratified as A-E3-6/A-E3-7 under Ethan's standing instruction of 2026-09-17 ("use your best judgment"); the approver line is recorded in `AMENDMENTS-E3.md`.
- E3.2's acceptance evidence ("correct it on a development case" under search) is NOT met; the exit clause is met on the "simpler" reading only (C6).
- Shipping the candidate means a DESIGN §5.12.1/§5.13 change (nineteen authored weights removed, including the weight Inv3's fix B4 acts through); the `combined` (weights + evalFix) arm is unpreregistered (C8).
- The identity chain had a gap 10:44Z–17:41Z (B6 in the tree, no golden); closed after the fact by the c73204dd golden (C2). Golden with `--states-in` before the first row at any `src/ai/hard` commit from here.
- Ten estimated timestamps corrected to git times in E3-PLAN (C3); stamps to the second from here.
- A8.2 ruled as A-E3-9: validation and sealed replays are excluded from every tuning corpus by opening id; no E3.3 fit is read until the corpus is rebuilt.

- A6's spawn-strike .95 is unmet by the champion under its real weights (16/20).
- Memory and p99 are unmeasured on every row (no harness column).
- P8: unmetered `homeWitness` calls in `injectRescue` at quiescence nodes; minutes at fixed work, ~25 s at wall on a home race.
- The 54 verified evaluator findings outside the bundle remain open, ranked in `E3.1-SYNTHESIS.md`.
- E3.3 tuning is blocked on the corpus preconditions and a training-openings ruling.
- E2's owed fresh work-sweep is DONE (E2 branch f29236b7, 2026-09-17 18:35Z): 45 turns, 43 distinct positions, 18 flip at ≤ 400k, 15 never; `E2-BASELINE-LOSSES.md` final. E2 owes nothing further.
- Openings ledger: `e1-val.jsonl` spent; `e1-val2.jsonl` rows 0–31 spent; `e2-val.jsonl` rows 32–63 spent after row #5 (rows 0–31 reserved to E2); `e1-sealed.jsonl` untouched.

## Handoffs to E4 (search efficiency)

1. P8 fix as a preregistered E4 lane: cap and meter `homeWitness` in `gen/generate.ts injectRescue` (WorkClass.PROVER), set `s.truncated` when the cap bites, memoise the canonical home verdict for P7.
2. The search-side leaf tie at `g2-s20_3_15-A` t3 (identical feature vectors; ORDER_TT tie-break).
3. Iteration cost ratio median 9 per depth (E2): 200k units reach depth 2–3 where the flips need 400k.
4. Which of the 19 safety weights carry the effect: per-weight rows, night window, one row at a time.
5. E4 search arms run on the CHAMPION's evaluator so the search effect is attributable; pricing on top of `eval-no-safety` is the two-factor `combined` arm, preregistered separately. Every E4 row runs both arms at one commit with the hash and golden checked before the first row.
