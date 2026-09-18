# E1 closing critique (independent, read-only)

Written 2026-09-16 at `44811303` on `claude/hard-ai-e1`. Bar: EPIC-PLAN §4 E1
(exit = "a direct baseline, a cost estimate, and one chosen improvement
hypothesis"), §5's experiment contract, §3's bottleneck taxonomy, and the
process rules in `../e0/AMENDMENTS-DECIDED.md`. Nothing was run except file
reads and small scripts over the artifacts; no ladder, probe or test.

## Spot-checks against the artifacts

Every number below was read from the named file; none disagreed with the docs.

- `baseline/metrics.json`: 152/1/47, Elo 202.63 [144.71, 273.01], LOS 1.000;
  h0 [6,0,15,0,29] 172.8, h3 [4,0,12,1,33] 235.4; hard timing 4036 turns,
  p95 3014, max 3275, 24 overruns, rate 0.59%; `openingsIndependent: true`,
  `distinctGames` 100/100.
- `e1.1-diag/metrics.json`: 18/0/14, 43.7 [−91.5, 194.3], LOS 0.739; h0 11/0/5,
  h3 7/0/9; 764 turns, p95 3014, max 3309, 2 overruns.
- `diag-wall8000/metrics.json`: 12/0/4, 190.8 [53.8, 432.1]; p95 8009/8035 vs
  8008/8013; 0 overruns.
- `ablate/k96/ladder/metrics.json`: 24/1/39, −83.0 [−164.9, −9.3]; h0 16/0/16
  (0.0), h3 8/1/23 (−176.7); overrun 1.17%/0.91%; max 170,814/179,066 ms.
- `ablate/action-width-wide/ladder/metrics.json`: 40/1/23, +94.6 [12.7, 188.4];
  h0 22/1/9, h3 18/0/14; overrun 3.50%/1.44%; max 37,963/48,459 ms.
- `ablate/action-width-wide/confirm/metrics.json`: 31/1/32, −5.4 [−84.5,
  73.1]; abortRate 12.2%/12.3%; firstSearchAborted 49/46; max 12,122/19,797 ms.
- `ablate/calib/ladder/metrics.json`: 29/1/34, −27.2 [−65.1, 10.1], LOS 0.076;
  firstSearchAborted 1/35; abortRate 8.01%/10.11%; max 15,669/11,894 ms.
- `ablate/comparison.md`: all eight recall rows equal the E1.3/E1.4 tables.
- `e1.1-diag/analysis-v2/*.json`: 14 games, 375 seat turns, 373 with a
  refutation, 373 `inRootGenList`, **272 `inInteriorGenList`** (101 outside
  the engine's own K=16 reply list); histogram 14/14 misjudged.
- `games.jsonl`: hard seat first turn ≥ 2990 ms in 26/32 (E1.1) and 160/200
  (baseline); 110 baseline hard turns under 20 ms, every one the game's last
  turn.
- Manifests: E1.1/baseline/wall:8000 at `d3fe704a`; k96 and action-width at
  `3953411b`; calib and confirm at `007817b4`; confirm started 20:03:46Z, 50 s
  after calib finished. sha256 of `e0-openings`, `e1-baseline`, `e1-val`,
  `e1-val2` match `ALLOCATION.md`. `exam/cases/dev.jsonl` = 145 (124 exact,
  21 judgment).

## Findings

### BLOCKER

**B1. The handoff paragraph tells E2 the wrong thing.**
`E1.4-DECISION-REPORT.md:218-222`: "every analysed loss is a mis-scored
shortlist candidate … the reply-node cone is not the problem, K and time
allocation are not the problem".

- "mis-scored" is not established: E1.4:54 and ANALYZE.md say discarded and
  misjudged are one label until `search/root.ts` exposes its list.
- "reply-node cone is not the problem" rests on 373/373 (E1.4:196), which
  E1.4:55 itself calls weak because the adviser's refutation comes from the
  same K=24 root generator. The number that measures the engine's actual ply-1
  list is `inInteriorGenList`: 272/373, so 101 refutations (27%) lie outside
  what the engine generates at the reply node. Because the adviser can only
  surface refutations from the top 24, that is a lower bound, not a confound
  (E1.4:83 has the direction backwards). `reply-wide` was never priced and
  E1.3:363 says E2.2 must first settle which list the reply node consults.
- "K is not the problem": one point was priced (K=96 at 3 s, −83); k48 was
  skipped; recall top1 is 0.40 at K=24. What is shown is that a 4× root list
  costs more than it returns at 3 s.
- "time allocation is not the problem": the calib row prices only the
  first-turn cut. The unused third on ordinary turns (mean 1951 of 3000 ms,
  baseline) is unpriced; E1.5 §4.1 point 4 says the patch does not touch it.
- Fix: rewrite the paragraph as "two candidates tested negative; open
  questions are the interior beam (101/373) and the discarded/misjudged split;
  nothing in §3's taxonomy is ruled out".

**B2. The exit's "one chosen improvement hypothesis" has no holder at close.**
E1.4 §5 chose H_T; E1.5 rejected it by its rule; the runner-up did not
confirm; the addendum (E1.4:218-222) names two instruments, not a hypothesis.

- Testing both candidates inside E1 was more than the plan asked and is
  welcome, but it consumed the exit clause.
- Fix: add an explicit exit statement (E1.4 or README) that either names the
  hypothesis E2 opens with — the evidence points at "the ply-1 beam
  (genInterior K=16, 8 plans, 4 keep-sets) drops the refutation the played
  turn walks into, so the seat over-values its choice" — or says plainly that
  E1 closes with no surviving hypothesis and E2 is instrumentation-first.
  Either is honest; silence is not.

### CONCERN

**C1. E1.5's own rejection rule was not followed.** `E1.5-CALIB-ARM.md:281`
says rejecting "means deleting the arm and the flag, not leaving it off";
`E1.5:339` says "stays default-off; nothing to revert". `calibrateCold?` is
still in `src/ai/hard/config.ts:109`, the arm at `lab/hard-ai/ablate/arms.ts:141-224`
(its `change` string still says "from calibrate()", the mechanism E1.5 §4.2
rejected). Fix: delete flag, engine branch, arm and `calibrate-cold.test.ts`,
or amend the rule with a stated reason; the per-seat attribution (§3) is
lab-side and survives either way.

**C2. The calibration contest was killed and restarted, undocumented.**
E1.4:202-203 says the contest is running at `677d349a`; the manifest says
`007817b4`, started 19:05:58Z; the napkin (`48ac5bc8`) records "discarded a
healthy 10-minute calib run by misjudging elapsed time"; `git log --
ablate/calib` holds only the final run. The restart is legitimate (same seed,
the P6 fix applies to both arms, nothing from the first run was read), but
E0.4/§5 say preserve partial runs and never drop games silently, and the E1.5
verdict does not mention it. Fix: one sentence in the E1.5 verdict naming the
killed attempt, why, and that no game of it was read.

**C3. A16 is candid but the process rule was bent, and the argument for "no
effect" cites the wrong counter.** A11 (AMENDMENTS:29) was "the only engine
edit permitted before E1.1's baseline"; lane 2 made a second one; the
preregistered baseline launched 13:01Z under the un-ratified rule and A16 was
ratified 13:25Z (`6e6f3071`) by the same delegated authority that owns the
lane. The file's rule ("a verifier finding … fails the slice") was not
applied. A16:57 says the guard "cannot have changed it" because `reSearches: 0`;
the guard is about tiny searches, not re-searches. The supportable argument
is that all 110 baseline hard turns under 20 ms are final turns (my count).
Fix: add both facts to A16 and flag the self-ratification for Ethan.

**C4. The preregistered mechanism was replaced before its contest.** E1.4 §5
preregistered seeding from `calibrate()`; E1.5 §4 swapped in a probe search
after a three-position development check, and the arm's config hash is the
same under both mechanisms (E1.5 §2). Candid and no contest was consumed, but
E1.4's decision record (E1.4:170-176) still preregisters the old mechanism.
Fix: a line in the E1.4 decision record saying what replaced it and when.

**C5. "100 independent pairs" is 50 opening families × 2 handicaps.**
`E1-BASELINE-REPORT.md:110`, `README.md:13`, `E1.4:154`. A15's capacity guard
defines the unit as opening × handicap, so it is rule-compliant, but §5 asks
for pairs and families and for clustering to be accounted for; the h0/h3 games
of one opening are not independent. The strata intervals (n=50: h0 [95, 272],
h3 [154, 350], both in `metrics.json` and absent from the docs) are the clean
statement and both are positive, so the conclusion stands. Fix: report "100
pairs over 50 opening families" and print the strata intervals.

**C6. The champion's code moved after the baseline.** Baseline/E1.1/wall:8000
are at `d3fe704a`; the P6 fix (`70bdaf03`) changes `hard@desktop`'s wall-mode
behaviour (stop-aware generation, salvage instead of phase end) with the
config hash unchanged; the rows at `007817b4` show abortRate 10-12% and max
turns 12-20 s. Against `aiv2-hard` the pathology never fired (max 3309 ms), so
the fix is probably inert there, but +203 has not been measured at the code
that is now champion. Fix: state it in E1.4/README; a descriptive 8-pair row
vs `aiv2-hard` at `007817b4` would pin it cheaply.

**C7. The P6 test codifies a 5× overrun as a pass and costs ~90 s in the
default suite.** `tests/ai/hard/p6-stoppable-generation.test.ts:160`
`SLACK_MS = 12_000` on a 3,000 ms allowance; the fixed-work pin runs the 60 s
pathology; ceilings pvs 180 s + p6 300 s. Not a weakened existing test, and
the reasoning is written down, but the bound would pass a turn that fails every
E5 gate. Fix: gate the file behind an env flag or a heavy script, and bound the
search side separately from `verifyTurn` (elapsed − verify < 3,500 ms).

### NOTE

- **N1.** The accounting contract changed without DESIGN: `WorkMeter.count`
  (`search/time.ts:92`) and `byClass[PROVER]` now including unpriced calls;
  DESIGN.md:861 still lists `spend/exhausted/used/byClass` only, and
  `byClass × WORK_COST` no longer equals `used` for PROVER. Fix: DESIGN
  addendum line.
- **N2.** Superseded wording left standing: `E1.3:375` "RETAINED as a
  candidate: the only coverage change that pays at equal time" and the first
  E1.4 addendum bullet "the first coverage change that survives equal time"
  (E1.3:408 says NOT CONFIRMED). Fix: annotate both as superseded.
- **N3.** E1.1's "two pairs per handicap" step (E1.1:3 "second step") was the
  E0 pilot at `77b68d52`, `hard@lab`, pre-A11 (overruns to 4584 ms). The first
  step at the honest allowance never ran; immaterial to the baseline, but the
  acceptance row is met only by counting a non-comparable run. Fix: one
  sentence.
- **N4.** E1.4 is not "one page" (222 lines, 29 KB, three addenda). Fix: a
  15-line summary at the top; the rest as appendices.
- **N5.** README items 6-8 do not record outcomes (action-width not
  confirmed, calib rejected, mechanism was a probe not `calibrate()`). Fix:
  one line each.
- **N6.** The confirmation's seed (20260916, not `armLadderSeed`) was first
  written in the E1.4 addendum committed 20:04Z, 18 s after the run started;
  `ALLOCATION.md` (19:05Z) preregisters pool and arm but not seed/pairs.
  Acceptable; record the seed rule.
- **N7.** P6 says "not an arm effect", but the exploratory row shows the load
  scales with beam width (73 vs 30 overruns, action-width-wide vs desktop).
  E1.3:412 lists the confound; E2 should price beam arms only at P6-fixed code.
- **N8.** `E1-BASELINE-REPORT.md:53-54` "the whole-turn search and home prover
  find forced mates the incumbent does not see" is a reading of 139
  home-checkmate wins; no win was analysed. Label it as such.
- **N9.** Validation openings left: `e1-val` rows 0-15 used twice (k96,
  action-width), 16-31 by calib; `e1-val2` rows 0-15 by confirm. Only
  `e1-val2` rows 16-31 remain untouched — one 32-pair row. E2 needs a new
  pool before its second contest.

## What E2 must have before its first candidate, in priority order

1. Root exposure: `search/root.ts` reports its candidate list with scores and
   a searched flag, so discarded and misjudged separate. Justified by
   `analysis-v2/summary.json` (14/14 one label) and E1.4:54.
2. Reply-node truth: a per-ply trace of which generator the search consults at
   ply 1, then a priced interior-beam arm. Justified by `analysis-v2`
   (101/373 refutations outside the K=16 list) and `comparison.md`
   (`reply-wide` moves nothing, unexplained).
3. Prover cost model fixed or stop-aware generation priced before any beam
   arm: `P6-TURN-TIME-EXPLOSION.md`, confirm row abortRate 12.2% and max
   12-20 s at `007817b4`, `time.ts` count-not-price.
4. The champion pinned at current code: `baseline/manifest.json` (`d3fe704a`)
   vs `confirm/manifest.json` (`007817b4`); see C6.
5. E2.1's multi-promotion audit, which no E1 instrument can see (E1.3
   "shared blind spots", EPIC §2 row 7).
6. Loss analysis of baseline losses: 0 of 47 analysed (E1.4:50); at least the
   ten double-loss pairs before the 14-game histogram is trusted.
7. A fresh validation pool (N9) and a stated seed rule for confirmations (N6).

## Verdict

**E1 exit: MET WITH GAPS.** The direct baseline is real, preregistered,
pair-independent by A15's definition and honestly caveated (+203 at 3 s, both
strata positive, cost 98.8 s per game, every artifact matches its report). The
cost estimate is present. The third clause is not: E1 chose a hypothesis,
tested it and its runner-up to honest negative results, and then closed
without naming what E2 opens with — while its last paragraph tells E2 that the
reply beam, K and time allocation are "not the problem", which the artifacts
do not support and one of them (272/373) contradicts. Process was mostly
clean and unusually well recorded; the A16 self-ratification, the undocumented
calib restart and the un-deleted rejected flag are the three places the record
is thinner than the rules it wrote for itself.

**The one sentence:** the +203 Elo baseline is trustworthy, but the closing
handoff should not be — 27% of the adviser's refutations lie outside the
engine's actual reply-node list and that beam was never priced, so E2 should
start there, not from "coverage is fine".
