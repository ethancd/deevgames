# E2 opening-session critique (independent, read-only)

Written 2026-09-17 00:55Z at `1e1689d2` on `claude/hard-ai-e2`. Bar:
`../e1/E1-CLOSE-CRITIQUE.md` §"What E2 must have before its first candidate"
and the rules `E2-PLAN.md` set for itself. Nothing was run except file reads,
Python over the artifacts, and `npx vitest run tests/lab/ablate.test.ts`
(34/34 at head, the champion's hash `4e7afdf7…` still pinned). Row 2 was at
51 games (arm 20, champion 31, 0 draws) when this was written; row 3 is
chained to launch the minute row 2's `summary.md` appears (`chain-row3.sh`),
which at row 2's pace is about 01:15Z.

## A. The seven prerequisites, checked against their artifacts

| # | prerequisite | state | check |
| --- | --- | --- | --- |
| 1 | root exposure | done | `root.ts` `expose`/`ply1Trace` on `RootOptions`, not `HardConfig`; on/off/on identity on 8 positions (`root-exposure.test.ts:81-92`) |
| 2 | reply-node truth | done | `pvs.ts generateAt` picks `genInterior` at ply 1; recall-replies `coverage.json` histogram present 29 / beam 20 / combo 1 = "20 of 21 misses are the beam", as the plan says |
| 3 | P6 priced | deferred | to the re-pin row, which is now queued behind two candidate rows |
| 4 | champion pinned at current code | not done | re-pin row #1 "queued"; `chain-slot0.sh` runs it after the analysis and the retrofit |
| 5 | multi-promotion audit | done | `audit.json`: 27/373 jointly affordable (7.2%), 31/373 legal prefix (8.3%), 0 emitted, 1/31 then 0/31; the plan's cell writes "14/28 … 8.3%", mixing the two rows |
| 6 | baseline losses analysed | partial | 13 of 47 at 00:43Z, file order; 2 of the 20 double-loss games done. The 14-game exposure split is done and its numbers match `e1.1-losses-exposed/summary.json` (5 misjudged, 9 divergent) |
| 7 | fresh pool + seed rule | done | `e2-val.jsonl` 64 rows, sha `df0c99cc…` recomputed and equal; addendum and seed rule present; no row has touched it |

Every number I recomputed matched its report: baseline seat 4,036 turns, mean
1,951 ms, 65.0% used, 57.3% under 2,200 ms, 16.4% at or over 3,000 ms; the
14-turn seat mean 2,323 ms; the E2.3 arm histograms; the three `recall.json`
rows; the 6-of-9 "re-run picks the adviser's best" count. Two things the
reports do not say are in §B and §C7.

## Findings

### BLOCKER

**B1. Row 3's preregistered evidence overstates what the sweep holds, and the
row launches automatically in minutes.** `E2-PLAN.md:199-204` funds `work-fit`
on "9 of 14 first-consequential flips between 200k and 400k, three of them
under the 283k rung". From `e1.1-losses-work-sweep-fresh/sweep.json`:

- The 14 turns are 12 distinct positions. `g5-s7_3_7-A` t4 carries the same
  adviser and played end keys as `g4-s6_3_5-A` t4 (`05b0c06e…`/`ff62fc22…`),
  and `g5-s7_3_7-B` t1 the same as `g4-s6_3_5-B` t1 (`559e2d60…`/`4844d47f…`).
  `e0-openings.jsonl` rows `g4-s6` and `g5-s7` are two move orders to one
  position. So 9/14 is 8/12 and "never 4" is "never 3"; E2.2's 28 root
  targets and E2.1's 28 loss roots are 26.
- 3 of the 9 flips are tolerance flips (`withinTolerance`, not
  `chosenIsAdviserBest`): `g2-s20_3_15-B` t7 at 283k, whose choice then
  reads `o` at 400k and 800k (not a stable improvement); `g4-s6_0_4-A` t4,
  which recovers 108 cc of a 377 cc swing, under the analyser's own 300 cc
  consequence threshold; `g5-s11_0_10-B` t1 (140 cc inside tolerance). Exact,
  stable flips at or below 400k are 5 of 12 distinct positions, and exact
  flips under the 283k rung are 2, not 3.
- Lane 2's own caveat (`E2-LANE2-EXPOSED-LOSSES.md:171-179`) is absent from the
  preregistration: at 100 units/ms the seat's implied work on these turns
  (median 251k) sits below every flip point, so the finer ladder changes the
  rung only if the seat's real rate is well above 100 units/ms. The ladder
  bot passes `targetMs = fundedMs` (`bots/hard.ts:363`), so the rung is
  `unitsPerMs × 3000` on a turn's first search; at 85 units/ms both ladders
  pick 200k. The rate under a row's load is the one number nobody has, and
  row 2 launched at loadavg 28.9 on 12 cores (its manifest).
- No measurement exists of `work-fit` choosing a better move anywhere: lane
  1's wall-mode probe reported 0/14 exact flips and the plan discards that
  column because the positions were mis-reconstructed (`E2-PLAN.md:160-162`).

Fix, one of two, before `chain-row3.sh` fires: (a) pause it, run the
13-minute wall-mode probe of `work-fit` vs `hard@desktop` on the 12 positions
reconstructed lane 2's way (`reconstruct(replay).bySide[side]` by
`turnNumber`), launch only if `work-fit` reaches the adviser's key on the
exact-flip positions; or (b) let it run as the instrumented run it should have
had, and append a dated bullet to the row 3 preregistration (append, not
rewrite) with the corrected counts and the rate caveat before its first game
ends. Either way the row report must lead with the rung distribution, not the
score.

**B2. The plan's own sequencing rule was broken without a recorded decision.**
`E2-PLAN.md:57-58`: "No E2 contest row starts until the analysis finishes";
the slot schedule (`:221-227`) puts the re-pin row before "the first E2
candidate row". Row 2 launched 23:17Z with the analysis at 3 of 47 and due
about 06:30Z; row 3 is chained behind row 2; the re-pin (prerequisites 3 and
4) is now third. The E1 bar tied trust in the 14-game histogram to the ten
double-loss pairs being analysed first; the analyser ran in file order and 2
of those 20 games are done. None of this is in "Decisions taken this session".
Fix: a dated decision bullet with the reason (slot 1 was idle, screening rows
retain nothing) and the consequence (the 47-loss sweep in §"before the next
row" item 4 must agree before any confirmation row is launched).

### CONCERN

**C1. The chain's judge is the engine itself.** Every link — "adviser's best
present 28/28", "searched 14/14", "flips at 283k–400k" — measures agreement
between the production search at some work and the same engine at 1,600,000
units (E2.1 §3.3 names the shared blind spot). A flip is the 400k engine
agreeing with its 1.6M self, which is expected of any consistent search and
is not evidence the move is better. The plan never states this. It affects
candidate selection only — the contest is the ground truth — but the row 3
text "if score ≤ 0.5 … the four never-flipping turns become E3's opening
evidence" would carry the assumption into E3. Fix: one sentence in the plan;
E3's opening evidence needs a judge that is not the champion at more work.

**C2. Row 2 is an in-sample mechanism check, labelled as a mechanism check.**
`interior-place-wide`'s setting (8 → 12) was read off the four `combo`
misses' `planRank` 2, 7, 9, 9 against `planCount = 12` on the 14 losses
(`E2.2:118-121`), then "checked" on the same 28 reply targets (7 of 9
recovered). Out of sample it moves nothing (recall 0/21; `recall.json`
columns equal base to four decimals). E2.3 §5 says "funded on the trace
alone"; neither it nor the plan says "on the positions the setting was fitted
to". The row itself is honest: preregistration text unchanged from 8e1cace9 to
head (`git diff` shows no line in that section), manifest seed 20260902,
32 pairs, `e1-val` skip 16, `sprt: null`, running past 51 games with no stop.
Fix: label it; read 20/31 as the out-of-sample answer when it lands.

**C3. Two confirmations are preregistered onto the same 16 openings.** Row 2's
text (`:186-188`) says its confirmation is "row #3 … seed 20260903 … e2-val
rows 0–15"; row #3 is now `work-fit` at seed 20260903, and its confirmation
(`:210-211`) is row #4 on e2-val rows 0–15. If both screenings passed, the
addendum's one-use rule would be broken or one confirmation would have no
rows. Fix now, while it is hypothetical: append a bullet giving row 2's
confirmation the next ledger ordinal and e2-val rows 16–31.

**C4. The probe that rejected two arms and sized row 3 is not in the tree.**
No script under `lab/` or the lane 1 worktree runs the 20-position four-arm
probe with three warm-ups; its 14 sweep positions were the mis-reconstructed
ones, yet the plan keeps its rung/work/depth columns (`:160-162`) — columns
that then describe other positions. Fix: commit the probe; re-run on correct
positions (about 13 minutes); the `deep-gate` rejection and the 60%/1.23×
figures then rest on reproducible evidence.

**C5. "Byte-identical" is proven on-vs-off, not old-vs-new.** The identity
tests compare the same code with the instrument on and off
(`root-exposure.test.ts`, `gen-trace.test.ts`, `analyze-work-sweep.test.ts`);
`determinism.test.ts` checks repeatability. Nothing compares fixed-work
output at `1e1689d2` with `7c896179`, and 1,262 lines changed under
`src/ai/hard` (`pvs.ts`, `root.ts`, `generate.ts`, `actionsearch.ts`,
`engine.ts`, `time.ts`). By inspection `shouldDeepen`'s default branch is the
old expression and `chooseWork` without `ladderStep` is the old loop, and
every row runs both seats at one commit, so no row is at risk; the champion's
continuity with E1's +203 is what is asserted without a test. Fix: a golden of
`endKey`/`scoreCc`/`work` for eight positions at 400k recorded at 7c896179 and
asserted at head.

**C6. Two overrun definitions in play.** Lane 1's "overruns 15.6%"
(`E2-LANE1-WORK-FIT.md:42`) is `turnMs > 3000`; A14's overrun is over
`max(10 ms, 1%)`, 0.59% in `baseline/metrics.json` (both recomputed). The
`work-fit` mechanism prediction uses the first; the plan's row 3 check says
"abort rate"; A14's voids rows. Fix: name the metric wherever a number is
quoted; A14's governs.

**C7. The E1.1 diagnostic pool has a handicap-3 transposition, and the
independence count did not see it.** `e0-openings` `g4-s6` and `g5-s7` reach
one position; E1.1's manifest says `openingsIndependent: true` over 16 × 2
cells, of which 30 are distinct. The contest pools exclude by handicap-0
digest and prefix relation only. Row 2's 51 replays are 51 distinct games, so
no harm is shown there. Fix: digest the E1/E2 pools at h3 as well as h0;
correct E1.1's cell count in its report.

### NOTE

- **N1.** "Searched equals list length in all 14" is by construction: the
  root window is `(−INF, INF)` with `useAspiration: false`, so `alpha >= beta`
  cannot fire at the root; `strong-candidate-discarded` could only ever come
  from a truncated iteration. The exposure confirmed the code; it did not test
  an open question, and lane 2's "root beam exonerated" should say so.
- **N2.** Rules say 2 shards (`E2-PLAN.md:63`); rows 2 and 3 run `--shards 1`.
  No validity effect; unrecorded.
- **N3.** Row 2 ran from `3e7218e3` with `gitDirty: true` (its own output
  directory, presumably — the runner cannot tell) 22 s after the
  preregistration commit landed (8e1cace9 at 23:17:09Z, launch 23:17:31Z).
  Inside the rule, with no margin.
- **N4.** `ALLOCATION.md` addendum: "64 rows is two 32-pair confirmations"; at
  h0/h3 a 32-pair row consumes 16 rows, so the pool holds four.
- **N5.** E1 critique C1 is still open: `calibrateCold` (`config.ts:109`) and
  the `calib` arm remain, and `work-fit` was built "by the same
  absent-not-false discipline" as an arm whose own rule said delete on
  rejection. Decide the rule.
- **N6.** Last recorded full scoped pass is at `f482356b`; `8a40cbbf` and
  `222e3e8d` changed `src/` and tests after it. The pass running now closes
  this.
- **N7.** The 300 cc flip tolerance is measured from the adviser's best, not
  from the played turn, so a flip can recover less than the 300 cc that made
  the turn consequential (B1's `g4-s6_0_4-A`).
- **N8.** `E2-BASELINE-LOSSES.md` is a 7-of-47 cut; 13 are done. Its header
  says how to refresh it; nobody has.
- **N9.** Nothing records box load per game. Row 2's manifest shows loadavg
  28.9 at launch; row 3's rung distribution should be read against whatever
  else is running, or the box kept quiet for it.

## Process (question E)

L2-A1, the multi-promotion decision, the gate rejection and the row 3 choice
are each recorded with their evidence in "Decisions". No A-rule text was
changed; A14's tolerance is frozen in both manifests; the frozen ALLOCATION
sections are untouched above the addendum line. Row 2 (`e1-val` 16–31, prior
use: calib) and row 3 (`e1-val2` 0–15, prior use: action-width confirmation)
are each a second and last use under the addendum table. `e2-val.jsonl` is
untouched and no script references it. The bent items are B2 (sequencing),
C3 (confirmation rows), N2 (shards).

## Before the next row, in priority order

1. Decide row 3 in the next few minutes (B1 a or b); whichever, append the
   corrected counts and the rate caveat to its preregistration.
2. Record the sequencing decision (B2) and re-point row 2's confirmation
   (C3) in one dated bullet each.
3. When the analysis lands (about 06:30Z), run the retrofit and the fresh
   sweep on all 47 losses (about 30 minutes) and count distinct positions,
   before any confirmation row; if the 47-loss flip band is not 283k–400k, the
   time thread's confirmation is not funded.
4. Commit lane 1's probe and re-run the four arms on correctly reconstructed
   positions (C4).
5. Add the cross-commit fixed-work golden (C5) before the re-pin row, so the
   re-pin measures the champion the tests describe.
6. Write the adviser-as-judge sentence into the plan and into E3's opening
   rule (C1).
7. Digest the pools at h3 (C7); fix E1.1's independence count.
8. Name the overrun metric in every timing claim (C6); close E1 C1 (N5).

## Verdict

**MET WITH GAPS.** The instruments the E1 critique asked for exist, are shown
byte-identical with the instrument off, were used to split the one label E1
could not split, and both rows are preregistered screening rows with stated
stop rules and honest mechanism checks; but the first candidate rows launched
around two of the seven prerequisites against the plan's own sequencing rule,
and row 3 is funded on an evidence chain whose counts (14 for 12 positions,
9 flips for 5 exact ones) and premise (an unmeasured units-per-millisecond)
overstate what its artifacts hold.
