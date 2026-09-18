# E3 closing critique (independent, read-only)

Written 2026-09-17 17:58:29Z on `claude/hard-ai-e3` (integration worktree
`~/src/deevgames-e3`). HEAD was `c73204dd` (3a173c5c plus a clean merge of
`origin/master`) when this pass started at 17:39Z and moved to `4edcfa05`
(17:50:37Z, "E3 close: master merged and identity-checked …") while it was
being written; the close bullet that commit appended to `E3-PLAN.md` is
covered below. Bar: `../EPIC-PLAN-2026-09-16.md` §4 E3 (acceptance evidence
per slice and the exit), §5 (experiment contract), §7 (decision record and
the amendment form); `E3-PLAN.md`'s own judge rule, row rules, ledger and every
dated correction; `../e0/AMENDMENTS-DECIDED.md` A14/A15; `../e2/E2-PLAN.md`'s
P6 rule text; the shape of `../e1/E1-CLOSE-CRITIQUE.md` and `E3-CRITIQUE.md`.

What was run: file reads, `git log` / `git diff` / `git show` over the
branch, and Python over the committed JSON artifacts under
`lab/results/hard-ai-e3/` (`metrics.json`, `manifest.json`, `elo.json`,
`pairs.jsonl`, `games.jsonl` with its `turnRows`). No engine, ladder, exam,
suite or test process was started; the two background jobs already on the box
(a scoped vitest run and the `hard:cross-commit` golden at `c73204dd`) were
left alone and their artifacts were read once they landed. Every time below is
UTC from `date -u` or from `git log --format=%cI` converted to UTC.

Scope. Row #4 (ledger ordinal 4, the correctness bundle's screening row) is
preregistered and its launcher (`row4-night.sh`, pid 73224) is sleeping until
23:00Z; it has NOT run at the time of writing. Everything up to and including
row #4's preregistration, the P8 diagnosis and the 17:50Z close-verification
bullet is critiqued here. What the row #4 reading must show for the close to
stand is stated in its own section; the coordinator appends the row #4/#5
result after this file.

State at writing (all times UTC):

- 08:39:02 — row #1 finished (`screen/manifest.json finishedAt`); read 10:01Z.
- 10:04:02 — `108a1215`: lanes 9–12 merged; the last commit with a fixed-work golden until 17:41Z.
- 10:09:53 — row #2 launched at `a0f03c4e`; finished 12:12:07.
- 10:44:07 — `8bbc2de0`: lanes 13–14 merged; lane 14's B6 edits `src/ai/hard/tables/approach.ts` and `config.ts` (44 lines); no golden.
- 11:51:06 — E2's re-pin row finished (`reference/e2-repin/manifest.json`).
- 12:15:21 — `49e0548a`: row #2 read, candidate retained, row #3 preregistered and launched in the same second (12:15:21Z per the plan).
- 13:00:08 — row #3 relaunched at `55ae23d8` with 4 shards; finished 14:25:13.
- 12:10–16:28 — six correctness descriptive rows finished (B2 12:10:56, B3 12:41:47, B4 13:03:26, B5 14:41:00, B6 15:00:55, bundle 16:28:01).
- 16:31:36 — `cd212f7c`: row #4 preregistered at 4 shards; 16:50:31 `9c8d5f64`: changed to 8 shards, `MUJU_HEAVY_SLOTS=10`.
- 16:49:53 — `ad0f251a`: P8 diagnosis cherry-picked.
- 17:37:57 — `c73204dd`: `origin/master` merged; `git diff 3a173c5c..c73204dd -- src/ai/hard` empty.
- 17:41:13 — golden at `c73204dd` written: 48 of 48 rows identical to `rows-head-108a1215.json` on the six search fields.
- 17:44:35 — bundle thresholds measured (`correct/thresholds/summary.json`).
- 17:50:37 — `4edcfa05`: close-verification bullet, README, thresholds and golden committed; lane worktrees removed.
- `~/src/deevgames-e3-run2` is detached at `9c8d5f64`, the commit row #4 will run from; `src/ai/hard` is byte-identical from `8bbc2de0` through `4edcfa05`.

## Numbers re-derived from the artifacts

Every headline number in the ledger, the row report, the handoff and the
amendments was recomputed from the named artifact. The Elo method the harness
uses (`lab/hard-ai/ladder/elo.ts`) is: one score per pair in {0, ½, 1, 1½, 2};
μ = mean per-game score; se = sqrt(population variance of the pair scores /
n) / 2; interval μ ± 1.96·se transformed by −400·log10(1/μ − 1) with the
score clamped to [10⁻³, 1 − 10⁻³] (so ±1199.83 is the clamp, not a number);
LOS = Φ((μ − ½)/se); a Jeffreys(½) pseudo-count is mixed in only when the
sample is degenerate (all pairs equal, or μ ∈ {0, 1}). The same computation
was run over `pairs.jsonl` (`scoreA`) and matched `elo.json`/`metrics.json` to
the last printed digit for all fourteen rows below.

| # | claim (where) | artifact | reproduces |
| --- | --- | --- | --- |
| 1 | row #1: 45/2/17, 0.719, +163 [+85, +260], LOS 99.999%; h0 23/1/8 +177 [+62, +348]; h3 22/1/9 +150 [+50, +281] (ledger, row report §3) | `screen/metrics.json`, `elo.json` counts [1, 1, 14, 1, 15], se 0.0503 | yes |
| 2 | row #1 overrun 0.00% / 0.19%, abort 6.69% / 9.05% (142/2,122, 191/2,110), first-search aborted 47 / 45, max turn 3,007 / 3,656 ms, not voided | `screen/metrics.json timing` | yes |
| 3 | row #2: 42/2/20, 0.672, +124 [+38, +229], LOS 99.8%; h0 23/0/9 +163 [+32, +366]; h3 19/2/11 +89 [−22, +221] | `confirm/metrics.json`, counts [4, 0, 12, 2, 14], se 0.0599 | yes |
| 4 | row #2 overrun 0.15% / 0.15% (3/2,064, 3/2,055), abort 6.83% / 8.66%, first 44 / 34, max 3,495 / 11,918 ms | `confirm/metrics.json timing` | yes |
| 5 | rows #1/#2 launch commits 50b6a94c / a0f03c4e, seeds 20260931 / 20260932, `--shards 1`, `gitDirty` true, `e1-val2` sha `fe3b9c98…` skip 0, `e2-val` sha `df0c99cc…` skip 32, `openingsUsed` 16 each = rows 0–15 / 32–47 | manifests; ids checked against the pool files in order | yes |
| 6 | mechanism check: row #1 rungs A 57.2 / 39.5 / 3.2 vs B 53.3 / 43.3 / 3.2 (+0.1% at 50k each), units/ms 64.40 / 66.40, depth 2.362 / 2.427, aborts 142 / 191; row #2 50.8 / 46.1 / 3.1 vs 46.2 / 50.7 / 3.1, 68.09 / 70.23, 2.387 / 2.432, 141 / 178 | `games.jsonl players.*.hardTiming.turnRows` (4,232 and 4,119 rows) | yes, exactly |
| 7 | row #3: 181/1/18, 0.9075, +397 [+330, +495]; h0 0.890, h3 0.925; overrun 0.07% / 0.15%; abort 13.2% (557/4,212); max 3,200 / 3,108 ms; loadAvgMean 10.0; 4 shards at 55ae23d8; finished 14:25Z; win types 166/7/5/3 | `vs-shipped/metrics.json`, `manifest.json` (`resume` false, `finishedAt` 14:25:13Z), `games.jsonl` | yes |
| 8 | re-pin: 155/0/45, 0.775, +215 [+156, +287]; the identical 50 openings | `reference/e2-repin/{metrics,manifest}.json`, counts [9, 0, 27, 0, 64]; `openingsUsed` sets equal | yes |
| 9 | prior 14/0/2, 0.875, +338 [+168, +1200] | `eval-no-safety/fixed100k`, counts [0, 0, 2, 0, 6]; +1200 is the clamp | yes |
| 10 | sub-arms 0.688 (+137 [+14, +309]), 0.562 (+44 [−36, +129]), 0.625 (+89 [−74, +307]) | the three `fixed100k/metrics.json`, seeds 36–38 | yes |
| 11 | singles B2 7/0/9 −44 [−129, +36]; B3 9/0/7 +44 [−104, +210]; B4 8/0/8 0 [−126, +126]; B5 9/1/6 +66 [−19, +159]; B6 8/0/8 0 [−85, +85]; bundle 11/0/5 +137 [+14, +309]; seeds 39–44; B2–B5 at a0f03c4e, B6 and bundle at 55ae23d8 | six `fixed100k` dirs | yes |
| 12 | B6 "plays the champion's moves" | `eval-fix-b6/fixed100k`: pentanomial [0, 0, 8, 0, 0], every pair 1.0, both games of every pair won by the same colour in the same number of turns; `degenerate` true, the ±85 is the Jeffreys prior | yes — and it is a free A/A row (N3) |
| 13 | P8: slow turns over 20 s per row 0 / 5 / 0 / 0 / 2 / 4; worst 391,035 ms is the champion's (B3 row); bundle game 4,249,165 ms with the arm's turn 2,641,138 and the champion's 927,996 | `p8/slow-turns.json`, `eval-correct-v1/fixed100k/games.jsonl` | yes |
| 14 | golden: 48/48 at 81e4e303 and 108a1215 vs 50b6a94c; 48/48 at c73204dd vs 108a1215 on search fields, 17 rows differ in `actions` only | `correct/cross-commit/summary*.json` | yes |
| 15 | bundle thresholds 73/79, 16/20, 56/56, exam 200k 120/127, failure set identical to the champion's | `correct/thresholds/summary.json` (17:44:35Z), `exam-eval-correct-v1-fixed200k/dev.md` | yes |
| 16 | candidate suites: tactics 73/79, spawn-strike 15/20, home-mate 56/56; exam 200k 117 vs 120; 25k 121 both | `E3.2-PRECONDITIONS.md` tables and the preconditions artifacts | yes (as recorded there) |
| 17 | the 19 zeroed indices; Σ\|w\| 230 + 390 + 1,150 = 1,770 | `screen/manifest.json aResolvedConfig` label `default-v1-no-safety`; weights table in the row report | yes |
| 18 | E2's re-pin "finished 12:1xZ" (plan, twice) | `e2-repin/manifest.json finishedAt` 2026-09-17T11:51:06Z | **no** |
| 19 | ledger row #1 "DONE ~10:00Z" | `finishedAt` 08:39:02Z (row report §10.1 says so; the ledger row is not annotated) | **no** |
| 20 | ledger row #4 "launches 23:00Z with 4 shards"; `row4-night.sh` header comment "4 shards" | the launcher's command line is `--shards 8`, `MUJU_HEAVY_SLOTS=10`; the 16:50Z bullet records 8 | **no — three places, two values** |
| 21 | A-E3-1 "Original: row 11 reads as a count of (own unit, enemy unit) pairs" | `DESIGN.md:1158-1159`: `infiltrationAnchors = Σ over own slots inside an enemy rectangle of anchorsVoidedBy`; the pair count is `DEVIATIONS.md:1296` (M9); B3's `voidedAnchors` (`features.ts:307`) counts DISTINCT voided anchors (`break` after the first own body), which is a third definition | **no** |
| 22 | handoff 16:52Z: "fixed-work golden identical (48/48) … unchanged in every commit"; plan 17:50Z: "the identity chain (hash + golden after every merge) is unbroken across lanes 1–16" | goldens exist at 81e4e303, 108a1215 (10:08Z) and c73204dd (17:41Z) only; `src/ai/hard` changed at 8bbc2de0 (10:44Z) and no golden was run for 6 h 57 m while row #3 and the B6/bundle rows played | **no as a process claim; true as an end state** |
| 23 | opening-clustered intervals (not in any doc; A15 says openings are the independence source) | row #1 over 16 openings: +163 [+91, +251], sign 13 up / 1 down / 2 even; row #2: +124 [+41, +226], 10 / 2 / 4; row #2 h3 alone [−25, +226] | the retention interval survives clustering |
| 24 | interval with the sample (n−1) variance instead of the population variance | row #1 [+84, +262]; row #2 [+37, +232]; bundle prior [+6, +325] | bounds move by ≤ 2 Elo on 32 pairs, 8–16 Elo on 8 pairs |
| 25 | openings bookkeeping (plan, ALLOCATION E3 addendum) | every `manifest.json` under `lab/results/`: `e1-val2` rows 0–15 used by E1 `action-width-wide` confirm and E3 row #1; rows 16–31 used once by E1 `reply-wide` (skip 16), so row #4 is the second and last use; `e2-val` rows 32–47 used once (row #2); rows 0–31 and 48–63 in no manifest; `e1-sealed` in no manifest | yes |
| 26 | re-pin at equivalent champion code | re-pin commit 1e1689d2 is an ancestor of HEAD; `git diff 1e1689d2 6adc0f2c -- src/ai/hard` empty; 6adc0f2c = 50b6a94c on `src/ai/hard`, golden-identical to HEAD | yes |

## Findings

### BLOCKER

**B1. The candidate's non-regression thresholds were written after its
numbers were known and set at those numbers; the resulting "correctness:
pass" hides a tactical regression that EPIC §5 would veto.**

- Lane 9 committed the arm's suite and exam numbers at `eac52aaf`, 06:52:48Z (tactics 73/79, spawn-strike 15/20, home-mate 56/56, exam at 200k 117/127 vs 120/127); `E3-CRITIQUE.md` (06:45Z) already quotes them.
- The thresholds appear in `35213904`, 10:06:21Z, three hours later, and the preregistration text says so itself: "(both already met by the arm)", "(the arm has 15/20: met)", "(117 vs 120: met at the boundary; a further loss fails it)".
- "Within one case of 16/20" and "within three cases of 120/127" are the observed gaps, not bars. §5: "Do not retroactively … adjust … to equalize favorable observed results"; §7: fixing mechanics "cannot silently become lowering the target".
- Under the bars that exist elsewhere the candidate regresses: EPIC §4 E3.3 asks for "tactical non-regression"; §5's release table makes "suites no worse than M14" a hard veto; M14's own criterion is `spawnStrike >= 0.80`; the candidate measures .75 at per-case budgets (`E3.2-PRECONDITIONS.md` §3) and is unmeasured at the gate's own setting (`hard@lab`, 400,000 units, where the champion is exactly 16/20).
- The decision record (`E3.2-ROW-REPORT.md` §8) lists A6's .95 as unmet by the champion and says nothing about the candidate against M14's .80. §7: "Keep known red obligations visible."
- The bundle shows what the honest version looks like: its thresholds were written at 16:31Z, measured at 17:44Z, and came out equal to the champion on all four (row 15).
- Consequence: the candidate is legitimately RETAINED on the strength rule (B-rule: score > 0.5 and interval excluding 0 on the confirmation, both met, robust to clustering — row 23); its correctness column is mislabelled. E4 and the E6 inventory would inherit a "pass" that is a regression.
- Fix: restate the row #2 correctness line as "tactical regression against the champion: −1 spawn-strike (purchase-1), −3 exam exact at 200k; the thresholds were sized to these numbers and are not evidence; retention rests on the strength rule"; add "candidate spawn-strike .75 vs M14 `>= 0.80` (per-case budgets; gate setting unmeasured)" as a red obligation in `E3-CLOSE.md`; measure the candidate at M14's gate setting in a night window before it is used as the base of any E4 arm; for every future arm, write the bars before the suites run, as was done for the bundle.

**B2. B3 is a redefinition, not a specification fix, and DESIGN still says
something else; the bundle's "correctness" label carries it.**

- Judge 4 settles that the shipped `Infiltration` is identically zero (lane 1's proof, 0 of 2,151 positions). It does not settle what the non-zero quantity should be.
- `DESIGN.md:1158-1159` defines `infiltrationAnchors = Σ over own slots inside an enemy rectangle of anchorsVoidedBy (corner = all)` — a sum with multiplicity. `DEVIATIONS.md:1296` (M9, 2026-09-15) records the rewrite to a pair count and argues for multiplicity ("counted twice … real signal"). B3's `voidedAnchors` (`features.ts:307-325`) counts distinct enemy anchors with at least one own body inside (`break` after the first hit).
- So there are three definitions: DESIGN's (multiplicity), M9's (pairs, identically zero as a difference), and B3's (distinct). A-E3-1 calls DESIGN's text "a count of pairs" (row 21) and adopts B3 as "the intended quantity" without amending `DESIGN.md` (last touched 2026-09-15) and without stating that it differs from DESIGN's formula.
- `E3-CRITIQUE.md` C5 and fix 6 asked for the DESIGN §5.12.1 amendment before B3 enters an arm; the amendment file exists, the DESIGN text does not.
- This does not touch row #4's strength reading; it touches the label the bundle will carry if retained ("five specification fixes, none tuned", plan row #4) and the §7 requirement that a changed criterion be stated as a change.
- Fix: before row #5 is funded, either append a DESIGN §5.8/§5.12.1 amendment adopting the distinct-anchor definition with the reason, or change B3 to DESIGN's sum; correct A-E3-1's "original" line; lead row #4's report with "four specification fixes (B2, B4, B5, B6) and one redefinition (B3)".

### CONCERN

**C1. Row #4 launches outside both the preregistered row rules and the
owner's compute policy, and the ledger disagrees with the launcher.**

- `E3-PLAN.md` "Rules E3 rows will run under": contests are `--shards 1`. The compute-policy section (Ethan, 13:01Z) amends wall-clock rows to `--shards 4–6` and heavy slots to 8 in the night window.
- `row4-night.sh` runs `--shards 8` with `MUJU_HEAVY_SLOTS=10`; the 16:50Z bullet justifies it as "the night default of one wall-clock shard per performance core", a rule that appears nowhere in the owner's policy text and is not attributed to Ethan.
- The ledger row still reads "launches 23:00Z with 4 shards" and the launcher's own header comment says 4 shards (row 20).
- Validity is not at stake: both seats of a game share one process and one clock, so the score is fair within the row. What changes is the load (P8 predicts worst turns near 25 s at one shard; at eight the P6 flag is certain and the timing columns will be withheld) and the comparability of the mechanism columns with rows #1/#2.
- Fix before 23:00Z: either set the launcher to 6 shards and 8 slots, or append one line naming Ethan as the approver of 8; append a dated note under the ledger row either way; state in the preregistration that the bundle's cost question (lane 12 §6 calls the rung/units-per-ms check "the check that matters most" for this arm) will be read from `turnRows` per seat and from overruns per seat and per game, since the row's timing columns are expected to be withheld.

**C2. The identity chain was open for seven hours and three rows ran inside
the gap; the record now says it was never open.**

- `8bbc2de0` (10:44Z) merged lane 14's B6 into `src/ai/hard/tables/approach.ts` and `config.ts`. The next golden is at `c73204dd`, 17:41Z. Row #3 (13:00–14:25Z), the B6 row and the bundle row (to 16:28Z) all ran at `55ae23d8` in between.
- The evidence in the gap was same-commit only: lane 14's two exam runs (149 rows identical, flag on vs absent) and the B6 A/A row (row 12). Both show B6-on ≡ B6-absent at one commit; neither shows that commit's champion ≡ the previous commit's.
- The gap is closed now: `src/ai/hard` is byte-identical from `8bbc2de0` to `4edcfa05` and the `c73204dd` golden matches `108a1215` on every search field. Row #3's champion-less design (vs `aiv2-hard`) and the descriptive rows' status mean nothing decided rests on the gap.
- The 17:50Z bullet's sentence "the identity chain (hash + golden after every merge) is unbroken across lanes 1–16 and the master merge" is nevertheless false as a description of what was done (row 22), and the handoff said the same at 16:52Z when no post-B6 golden existed.
- The `c73204dd` golden was run without `--states-in` (17 rows differ in `actions` by the `Date.now()` ids), so the comparison rests on six fields rather than seven; acceptable, recorded, but the frozen-states method lane 12 used is the clean one.
- Fix: reword the sentence to "closed at 17:41Z; open 10:44–17:41Z; no decision row ran in the gap"; make the rule "golden BEFORE the first row at any commit that touches `src/ai/hard`, with `--states-in`".

**C3. Ten timestamps are still estimates, three of them labelled `date -u`
and two inside the timestamp correction.**

- Plan line 259 "row #1 go-file written 06:5xZ" — `3af171f6` 06:32:07Z.
- Line 395 "Lanes 13 and 14 merged (10:5xZ, `date -u`)" — `8bbc2de0` 10:44:07Z.
- Line 407 "Row #2 result … (12:2xZ, `date -u`)" — `49e0548a` 12:15:21Z; a stamp later than its own commit cannot have come from the clock.
- Lines 437 and 512 "E2's re-pin … finished 12:1xZ" — manifest 11:51:06Z.
- Line 449 "Correction (12:3xZ)" — `cc3af366` 12:16:53Z.
- Line 463 "Row report … (12:4xZ)" — `414f0921` 12:26:30Z.
- Line 496 "13:1xZ: Ethan's call" — `967da52e` 13:53:39Z.
- Line 501 "Row #3 result (14:3xZ, `date -u`)" — `e6bcbfdb` 14:27:10Z.
- Line 587 "b593a3cc at 16:4xZ" (inside the correction) — 16:36:06Z.
- Line 585 "Timestamp correction (16:43Z from `date -u`)" — `0a3528ea` 16:42:42Z, eighteen seconds before the stamp.
- The handoff's rule ("date every bullet from `date -u` … this bit the session four times") is the right rule; the record does not yet meet it. Fix: one dated bullet listing the ten with their git times; from here on stamp to the second.

**C4. All five amendments are self-approved, and the approver is not a
person.** `AMENDMENTS-E3.md` A-E3-1..5 each end "Decided … by the coordinator
under the delegation". §7 asks for a named approver and for human approval of
changed product/release requirements. A-E3-3 (A6's .95 recorded as unmet;
E3 rows adopt the re-measured .80 as the reference) and A-E3-1 (B2) touch the
release contract's tactical column. Ethan was reachable today (the 13:01Z and
13:53Z compute rulings are his) and none of the five was put to him.
`E1-CLOSE-CRITIQUE.md` C3 made the same point about A16. Fix: a line per
amendment, either "seen by Ethan <time>" or "delegated, not seen", and the
two that touch the release contract flagged for him in `E3-CLOSE.md`.

**C5. Row #3's abort rate is explained by comparison, not by mechanism.**
The plan says 13.2% "is close to the champion's in its re-pin (15.1%)", which
is true (row 7, row 8). It is also double the Hard-vs-Hard rate (6.7–6.8%),
and the first-search cut is not the reason: first-turn aborts are 155 of 557
(28%) in row #3 against 44 of 141 (31%) in row #2. What differs is the
opponent's games (mean 21.4 turns against 32.7) and the box (4 shards, load
10.0 against 1 shard, load 5–7), and the single-shard re-pin shows the same
rate, so it is a property of the `aiv2-hard` games that nothing in the tree
explains. Descriptive row, no decision on it; the report should say
"unexplained" rather than "close to".

**C6. E3.2's own acceptance evidence is not met by the retained arm, and the
critique's fix for it was neither adopted nor formally declined.** EPIC §4
E3.2: "Reproduce the error, correct it on a development case, and assess
unseen cases plus unchanged match opponents." The arm reproduces the error
statically (+60 / −60) and does not correct it under search at any work a
3 s turn buys (`E3.2-REPRO.md`; the plan's row #1 bullet). The unseen-cases
and match-opponent halves are met (rows #1–#3). `E3-CRITIQUE.md` fix 3 asked
that a retained arm show a searched flip inside the equal-time work band; the
plan instead withdrew the "fixes one misconception" claim. That is honest,
but the decision record should say "E3.2 acceptance evidence: NOT MET; E3
exit clause (simpler judgment that earns strength): MET" rather than fold the
two together.

**C7. Two preregistration texts in the tree still point a confirmation at
row #2's openings.** `E3.2-CORRECTNESS-ARM.md` §7 ("Confirmation … `e2-val.jsonl`
rows 32–63, `--openings-skip 32`", prediction "≥ 0.5") and
`E3.1-SYNTHESIS.md` §6 ("row #2 … rows 32–63") are superseded by the plan
(rows 48–63, skip 48, seed 20260935, prediction > 0.5) and neither carries a
correction line at the paragraph. Plan line 372 still assigns the bundle
screening "ledger ordinal 3, seed 20260933", which row #3 consumed. A reader
launching row #5 from lane 12's draft would reuse rows 32–47. Fix: one
appended line at each place.

**C8. What the group ablation implies for shipping is stated for the row and
not for the product.** The candidate zeroes `Inv3RetreatSquare` (a known bug
that B4 fixes), the whole threat stack (the terms the tactics suite exists
for) and seven invariants; no sub-block reproduces it; the correction arm
`eval-safety-once` never ran; which of the 19 carry the effect is open; the
two-factor `combined` arm that would price the bundle against the candidate is
unpreregistered. The row report §7.2 says all of this. What it does not say:
shipping the candidate as a default would be a DESIGN §5.12.1/§5.13 change
(nineteen rows at weight 0), which needs a DESIGN amendment and M20's SPRT,
not only "development evidence"; and E4 opens with two candidates
(`eval-no-safety`, `eval-correct-v1`) measured against the same champion and
not against each other. Fix: name both in `E3-CLOSE.md` under "Unresolved";
preregister `combined` before either is treated as the base of an E4 arm.

**C9. The P8 "flag, do not void" reading is faithful to the rule text and
is still incomplete for row #4.** E2-PLAN: "Any row whose max turn exceeds
20 s is reported with P6 flagged and its timing columns are not cited";
E1.4 §3: "hold the row's timing columns as not citable". So "the flag
withholds timing columns, it does not void the row" is the preregistered
rule, correctly applied. What P8 adds and the preregistration does not
carry: the pathology lives in home races; the bundle won that game by home
occupation; a seat that reaches home races more often will pay more 25 s
turns and more A14 overruns, so overruns must be reported per seat and per
game, not only as a rate; and the 16 s `pickUnsearched → verifyTurn` residue
means a P8 turn is played by the P6 salvage path with `nodes 0`, i.e. an
unsearched move — the row report should count such turns per seat (from
`turnRows` `depth 0`).

**C10. The tuning smoke fit on validation replays is still unruled.**
`E3-CRITIQUE.md` C10 and lane 8's A8.2: 894 of 1,335 corpus rows come from
`e1-val`/`e1-val2` games; the vector is discarded and no decision leaked; the
ruling is deferred in the handoff to "optional E3.3". ALLOCATION's "never
tuned against" is the letter; a ruling before any E3.3 fit is the fix.

### NOTE

- **N1.** Ledger row #1 says "DONE ~10:00Z"; the row finished 08:39:02Z (row report §10.1 records it; the ledger cell does not).
- **N2.** Row #3 was preregistered and launched in one commit (`49e0548a`, 12:15:21Z, the launch second); killed at 13:00Z with 0 pairs and relaunched at `55ae23d8` with 4 shards, `resume` false; nothing from the first launch was read. Descriptive, so no rule rides on it. The descriptive row took ledger ordinal 3 (seed 20260933) although the plan had assigned that ordinal to the bundle's screening; the seed rule (ordinal at append time) makes it right, the older text (line 372) makes it confusing.
- **N3.** The B6 row is a free A/A (row 12): eight pairs, every pair 1.0, mirrored games identical in winner and length. The report should say "A/A confirmed: flag-on ≡ flag-absent at 55ae23d8 over 16 fixed-work games" instead of "plays the champion's moves, as lane 14 predicted".
- **N4.** `e1-val2` rows 16–31 were used once, by E1's `reply-wide` exit row against `hard@desktop` (row 25). Row #4 is their second and last use; the champion has seen them once, the bundle has not. Bookkeeping is right.
- **N5.** All reservations hold at writing: `e2-val` rows 0–31 and 48–63 appear in no manifest under `lab/results/`; `e1-sealed` appears in none; the tuning corpus refuses both by pool and by id.
- **N6.** The re-pin and row #3 are at equivalent champion code (row 26) and on the identical 50 openings; the score-level comparison (+397 vs +215, both at 100 pairs) is sound; the timing columns are not comparable (4 shards at load 10.0 against 1 shard at load ≈ 3.5).
- **N7.** The retention interval survives the two obvious re-analyses: opening-clustered [+41, +226] on row #2, [+91, +251] on row #1; sign test over openings 10/2/4 and 13/1/2 (row 23). The A15 "√2" sentence in the row report is the worst case and overstates the correction here.
- **N8.** Row #2's h3 stratum covers 0 in every spelling ([−22, +221] pair-level, [−25, +226] clustered); the rule reads the whole row, as preregistered; the decision record should print the stratum beside the whole-row number, as it does.
- **N9.** Scoped tests at `c73204dd`: 1,187 of 1,188, the one failure the P6 wall-clock assertion at 15.05 s under load 5.5–6.5, 5/5 alone at load 4.7. `E1-CLOSE-CRITIQUE.md` C7 (the P6 test as a merge gate) is still open: the test still sits in the default scoped run and still fails on a loaded box.
- **N10.** The handoff says "Sixteen lanes merged"; lane 16 was cherry-picked (`ad0f251a`) because its branch carries a master merge; equivalent for the tree, different for the branch list.
- **N11.** `E3.2-ROW-REPORT.md` §8's decision-record block still reads "Strength vs shipped Hard: NOT MEASURED"; the addendum below it has the number. `E3-CLOSE.md` should carry the filled block, not a pointer.
- **N12.** `E3-PLAN.md` row #3's "meanTurnMs 1,814 / 2,990" and the row report's `overAllowance` counts are not in `metrics.json`'s timing block and were not re-derived here.
- **N13.** `README.md` was stale (E3.1 documents only) until `4edcfa05`; it now lists the E3.2/E3.3 documents, this critique and `E3-CLOSE.md`.
- **N14.** Lane 5's worktree held an untracked `eval-no-home` exam artifact (05:40Z) that no report cites; copied to the scratchpad, not committed — recorded in the 17:50Z bullet, fine.

## The six questions

1. **EPIC §4 E3 exit and §5 contract, by column.** Correctness: the champion is unchanged (config hash in every manifest; golden 48/48 at three commits; `tests/lab/ablate.test.ts:142` pins the hash); the candidate carries a tactical regression hidden by post-hoc bars (B1); the bundle's four specification fixes are real (B4 by DESIGN §5.13 row 3; B5 by DESIGN.md:1348; B2 and B6 by the rot180 canonical fact), B3 is a redefinition (B2 of this file), B1's exclusion by A-E3-2 is sound (10 of 13,183 violations remain; a monotone rule is a DESIGN §5.8 change). Strength: two preregistered rows on 32 unseen validation openings, +163 and +124, intervals excluding 0 pair-level and opening-clustered; descriptive +397 vs shipped Hard against the champion's +215 on the same 100 pairs. Responsiveness: p95 at the allowance in every wall row; max 11.9 s (row #2, champion seat) and 24.8 s in P8's wall reproduction; E5's desktop p95 ≤ 6,000 ms is met on these rows, the maximum is not a gate here and would fail one. Integration: master merged clean, `src/ai/hard` untouched by it, golden at HEAD, scoped tests green but for the load-dependent P6 assertion, lane worktrees removed. §5 contract: fixed-sample designs with preregistered rules; pair-aware intervals; openings as the independence source (clustering now checked, N7); no seed re-run; no partial run dropped silently (N2); the "report overhead separately" and peak-memory columns remain unmeasured, as the row report says.
2. **Is `hard@ablate:eval-no-safety` a legitimate retained candidate?** On the strength rule, yes: row #1 screening then row #2 confirmation, each on its own block, seeds by ordinal, one commit per row for both arms, hashes recorded, no opening used twice, thresholds A14/P6/illegal/adjudication all clean, the mechanism check passed in every column. No amendment was applied by the lane that proposed it; A-E3-1..5 are self-approved by the coordinator (C4). The one rule that moved after the fact is the non-regression bar (B1), which the retention rule did not depend on but the correctness column does.
3. **The group-ablation framing.** Honest and consistent across the plan, the row report and the handoff: "not a fixed misconception", in-sample-only concept, no sub-block reproduces, per-weight question open. What it implies for shipping (C8): a nineteen-zero default is a DESIGN change and an M20 campaign, and it removes a bug's fix (`Inv3`) along with the bug; the honest next step is the per-weight rows and the `combined` arm, both unpreregistered.
4. **Row #3.** Presented as descriptive everywhere it appears (ledger, plan bullets, row report addendum, handoff); the numbers reproduce; the openings and the champion code are equivalent to the re-pin's (N6). The abort rate is compared, not explained (C5). The kill-and-relaunch is recorded (N2).
5. **The correctness arm.** Flags are absent in every profile (`makeConfig` never writes `evalFix`; `DESKTOP`/`LAB`/`MIDRANGE`/`PHONE` asserted in `eval-correct.test.ts:92-104`; `allocTables()` hands out `null`); the readers are exactly `engine.ts:246-259`, `evaluate.ts:85`, `features.ts:341`, `invariants.ts:294`, `economy.ts:133,195`, `approach.ts:356`, all gated on `=== true`; the hash argument (undefined key dropped by `canonicalJson`) holds. B6 without B4 is inert and the A/A row proves it (N3). B3 is the exception (B2).
6. **P8 and row #4.** The diagnosis reproduces (row 13) and the "not arm-specific" claim rests on three independent checks that all hold. "Flag, do not void" is the preregistered rule text (C9). Row #4's expectation (worst turns near 25 s, P6 flag, timing withheld) is written into the plan; the per-seat overrun and unsearched-turn counts are not (C9); the shard count is off the owner's policy and off the ledger (C1).

## What the row #4 reading must show for the close to stand

- `manifest.json`: `git` 9c8d5f64 (or a descendant with `src/ai/hard` identical), `aConfigHash` for `hard@ablate:eval-correct-v1` at wall:3000 ending as `49aa15dba67f…`, `bConfigHash` `4e7afdf76b32fad…`, seed 20260934, `e1-val2.jsonl` sha `fe3b9c98…`, `--openings-skip 16`, 32 pairs, h0/h3, `--legality strict`; `aResolvedConfig.config.evalFix` = exactly `{rot180TieOrder, infiltrationPerAnchor, inv3RetreatConjunct, rentOnce, approachTieOrder}` all true and `weights.label` `default-v1`.
- `metrics.json`: `status` complete, `pairsCompleted` 32, `openingsUsed` = the 16 ids of rows 16–31 in order (`e1v2-g5-s255` … `e1v2-g4-s390`), `openingsIndependent` true, `distinctGames` 32/32 with no duplicates, replays 64 of 64, `voided` false with `overrunRate` under 5% for both seats, `illegalActions` 0, `replicaDivergences` 0, `adjudicationRate` 0, `loadAvgMean` recorded (expect above 8 at eight shards).
- The score read against the rule as written: > 0.5 funds row #5 on `e2-val.jsonl` rows 48–63 (skip 48, seed 20260935) with the thresholds already measured (row 15); ≤ 0.5 closes the bundle as correctness pass / strength fail and B5 is isolated first. No re-run, no seed change, no threshold moved.
- The P6 flag if `maxTurnMs` > 20,000 on either seat: timing columns withheld, the row NOT voided, and, in addition, overruns and `depth 0` turns counted per seat and per game (C9).
- The mechanism check from `turnRows`: the bundle's rung distribution not above the champion's and its abort rate not above; if it is above, the row is reported as pricing cost (B3's scan, per lane 12 §6), not judgment.
- The record: a dated bullet from `date -u` with launch time, commit, shard count as actually run, `loadAvgMean`, and the reconciliation of the ledger's "4 shards" (C1); artifacts copied under the same path with the nohup log.
- Retention of the bundle, if row #5 runs and passes, is again development evidence: the bundle would be a champion candidate priced against `hard@desktop` and not against `eval-no-safety` (C8).

## What E4 must have before its first candidate, in priority order

1. The candidate's red obligation written down (B1) and its M14-setting spawn-strike measured; a stated rule that non-regression bars are written before the suites run.
2. The B3 definition settled in DESIGN (B2), so that "correctness" means the engine's specification and not the arm's.
3. The `combined` two-factor arm preregistered, and the per-weight rows for the 19 safety weights in a night window, before either candidate is the base of an E4 arm (C8).
4. The P8 fix as a preregistered E4 lane (cap and meter `homeWitness` in `injectRescue`, `s.truncated`, a determinism re-pin, the P6 test extended with a home-race position) and the P7 home-verdict cache under its own preregistration — the search side is E4's, the canonical side is not.
5. The P6 wall-clock test out of the default scoped run (E1-CLOSE C7, still open) so a loaded box stops producing a red gate that is not one.
6. The A8.2 ruling on validation replays in tuning corpora (C10), before any E3.3 fit is read.
7. The identity rule as stated in C2 (golden before the first row at any `src/ai/hard` commit, `--states-in`), and per-second timestamps (C3).

## Verdicts

**E3.1 (feature audit): MET.** Double counting, symmetry, contributions and
cost, group ablation and the authored-vs-bug separation are settled with code
lines and artifacts; the sixth item (the loss-dominant concept) was tested out
of sample, failed, and the record says so. The healing discount at
`upkeepPending` nodes and the quiet clock in play remain thin, as
`E3-CRITIQUE.md` C9 said and nothing since has measured.

**E3.2 (fix one costly misconception): ACCEPTANCE EVIDENCE NOT MET; EXIT
CLAUSE MET.** No misconception was named that survived the 47 losses, and the
development case does not flip under the search the rows price. What E3.2
delivered instead is a simpler evaluator (19 weights removed) that earns
strength at equal time on 32 unseen openings and against shipped Hard — the
exit's own words. `hard@ablate:eval-no-safety` is a legitimately RETAINED
champion candidate on the strength rule and only on it; its correctness
column must be relabelled (B1).

**E3.3 (small tuning experiment): NOT RUN, HONESTLY DEFERRED.** The instrument
exists and its smoke run reports its own defects (quiet share 4.9%, rarity
runaways, validation rows in the corpus); no vector was measured or proposed.

**Correctness (the bundle): FOUR FIXES AND ONE REDEFINITION, STRENGTH
PENDING.** B2, B4, B5, B6 are fixes by the engine's own specification or a
canonical fact; B3 is a new definition with DESIGN unamended (B2 of this
file); B1's exclusion is sound; every flag is absent from every profile; the
thresholds were preregistered before measurement and met at equality.

**Strength: SOUND.** Every number reproduces; the intervals exclude 0 under
the harness method, the sample-variance variant and opening clustering; the
prior's selection is now stated; the vs-shipped comparison is at equivalent
champion code on identical openings.

**Responsiveness: NOT A GATE HERE, RED IN THE TAIL.** p95 at the allowance;
maxima 11.9 s in a decision row and 24.8 s in P8's wall reproduction; the fix
is search-side and belongs to E4.

**Integration: DONE AT 17:50Z.** Master merged clean, `src/ai/hard` untouched
by the merge, golden 48/48 at HEAD, scoped tests 1,187/1,188 with the known
load-dependent P6 assertion, lane worktrees removed. The identity chain is
closed now and was open for seven hours today (C2).

**Process: CLEAN IN THE LARGE, LOOSE IN FIVE PLACES.** Preregistration before
launch held for every decision row; openings and seeds are right; no lane
applied its own amendment; nothing was rerun or dropped silently. The five
places: bars written after the numbers (B1), a shard count off the owner's
policy and off the ledger (C1), a golden gap described as no gap (C2), ten
estimated timestamps after a rule that forbids them (C3), five self-approved
amendments (C4).

**E3 exit: MET WITH GAPS.** Simpler judgment that earns strength exists and
is honestly caveated as a group ablation; the correctness bundle is built,
identity-checked and waiting on its row; the gaps are a mislabelled
correctness column on the retained candidate, one redefinition inside the
"correctness" bundle, and a record whose process claims are in three places
stronger than what was done.

## Fixes, in priority order

1. Before 23:00Z: reconcile row #4's shard count (6 per the owner's policy, or 8 with Ethan named as approver), `MUJU_HEAVY_SLOTS` ≤ 8, a dated note under the ledger row; add per-seat overrun and `depth 0` counts to the row's report requirements (C1, C9).
2. Restate the candidate's correctness line and add the M14 spawn-strike red obligation to `E3-CLOSE.md`; schedule the gate-setting measurement (B1).
3. Settle B3: DESIGN §5.8/§5.12.1 amendment or B3 changed to DESIGN's sum; correct A-E3-1's "original" line; relabel the bundle "four fixes and one redefinition" in row #4's report lead (B2).
4. Append correction lines: `E3.2-CORRECTNESS-ARM.md` §7 (rows 48–63, skip 48, > 0.5), `E3.1-SYNTHESIS.md` §6 (rows 32–47), plan line 372 (ordinal 4, seed 20260934), ledger rows #1 (finished 08:39Z) and #4 (shards) (C7, N1).
5. One dated bullet with the git times for the ten estimated stamps; stamp to the second from here on (C3).
6. Reword the identity-chain sentence in the 17:50Z bullet and the handoff; adopt the golden-before-first-row rule with `--states-in` (C2).
7. A seen/not-seen line per amendment; flag A-E3-1 and A-E3-3 for Ethan in `E3-CLOSE.md` (C4).
8. `E3-CLOSE.md` as the §7 record with separate columns, the filled "Strength vs shipped Hard" block, the clustered intervals beside the pair-level ones, the h3 stratum, and "E3.2 acceptance: not met; exit: met" in those words (C6, N7, N8, N11).
9. Preregister `combined` and the per-weight rows; write the DESIGN-change consequence of a nineteen-zero default into "Unresolved" (C8).
10. Row #3: replace "close to" with "unexplained; same rate in the single-shard re-pin" (C5).
11. Rule on A8.2 before any E3.3 fit (C10); move the P6 wall-clock test out of the default scoped run (N9).
12. Say "A/A confirmed" for the B6 row (N3); update the row report's §8 block (N11).

**The one sentence:** the strength evidence for `eval-no-safety` is the
cleanest this campaign has produced — two preregistered rows, every number
reproducing, intervals that survive clustering — and the close should not
let that carry a correctness column that was fitted to the result, a
"correctness" bundle with one redefinition in it, and a record that says the
identity chain and the timestamps were kept when for part of the day they
were not.
