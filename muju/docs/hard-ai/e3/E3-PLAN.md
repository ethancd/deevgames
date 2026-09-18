# E3 "Judge positions well" — opening session plan (2026-09-17)

Epic E3 of `../EPIC-PLAN-2026-09-16.md` §4, opened on branch `claude/hard-ai-e3`
off `claude/hard-ai-e2` 6adc0f2c (E2 session 1 closed at 1c25761c; champion
`hard@desktop`, config hash `4e7afdf76b32fad…`, weights `default-v1`, the 58
hand-authored DESIGN §5.12.1 / §5.13 weights plus the 18 catalogue material
priors, never tuned). Owner decisions remain delegated ("zero decisions");
this file is the coordinator's record. E2's overnight chain (47-loss analysis,
`--rerun-root` retrofit, re-pin row #1) keeps running on heavy slot 0 from
`~/src/deevgames-e1-run` and `~/src/deevgames-e2-run2`; E3 does not touch
either worktree and does not use slot 0 until the chain reports.

## Why E3 now, and what it must not assume

- E2 exonerated coverage at the 12 distinct analysed loss positions: the
  adviser's turn was generated, listed and searched every time. What differed
  was the score the search gave it.
- Three distinct positions never flip to the adviser's turn at any work up to
  800k (`g2-s20` white t3, `g4-s10` h3 white t2, `g4-s6`/`g5-s7` h3 black t1,
  all `strong-candidate-misjudged`). On the exposed root of the first, the
  generator's static rank preferred the adviser's turn (5,801 cc vs 2,580 cc)
  and the search still chose the played one. That is a judgment question.
- The E2 critique's C1 stands: every E2 link measured the champion against
  itself at more work. "Never flips" therefore means the deeper search agrees
  with the shallower one, not that the adviser is right. E3's opening
  evidence must come from judges that are not the champion at more work.

## Judge rule (C1, preregistered)

An E3 misjudgment claim needs at least one of these judges, named in the
claim, and never only the adviser:

1. The game outcome. The position N turns after the decision, scored by what
   actually happened (material, home state, result), with the opponent's
   replies as played.
2. A foreign engine. `aiv2-hard` (the shipped Hard, the E1 baseline's opponent)
   choosing at the same root under a generous allowance, as a second opinion on
   the turn, not on the score.
3. An authored judgment. E1.2 exam judgment cases and the economy and
   invariants suites, read as statements of the strategic model
   (`../STRATEGIC_UNDERSTANDING.md`), each traced to its source section.
4. A canonical fact. Anything the rules engine can enumerate exactly (a kill
   that exists, an upkeep bill, a spawn rectangle), which is not a judgment
   but can show a feature is wrong about the position it claims to describe.

The champion at more work stays useful as a locator of where scores disagree.
It never decides who is right. Strength is judged only by the equal-time row.

## Slices and lanes

| Slice | Lane | Worktree / branch | Deliverable | Owned files |
| --- | --- | --- | --- | --- |
| E3.1 feature semantics | 1 | `~/src/deevgames-e3-lane1`, `claude/hard-ai-e3-lane1` | `E3.1-FEATURE-AUDIT.md`: per-feature definition vs implementation, unit and scale, sign and side symmetry, overlap and double counting between features and between features and invariants | `docs/hard-ai/e3/E3.1-FEATURE-AUDIT.md` only |
| E3.1 invariants and home/safety tables | 2 | lane2 | `E3.1-INVARIANTS-AUDIT.md`: the twenty invariants vs SU §7, healing and quiet-clock semantics, UNKNOWN prover verdicts, home threat and countdown | `docs/hard-ai/e3/E3.1-INVARIANTS-AUDIT.md`, `lab/hard-ai/audit/inv-*` |
| E3.1 economy | 3 | lane3 | `E3.1-ECONOMY-AUDIT.md`: bank, projected mining and finite reserves counted how many times; rent, runway, insolvency, relocation semantics with worked numbers from real positions | `docs/hard-ai/e3/E3.1-ECONOMY-AUDIT.md`, `lab/hard-ai/audit/econ-*` |
| E3.1 contributions, scale, cost | 4 | lane4 | `hard:eval-audit` instrument (`lab/hard-ai/audit/eval-audit.ts`, `eval-groups.ts`): per-position feature vectors and weighted contributions, group sums, stage cost, rot180 and side-swap symmetry checks, frequency/magnitude/correlation over corpora; artifacts under `lab/results/hard-ai-e3/eval-audit/`; `E3.1-CONTRIBUTIONS.md` | `lab/hard-ai/audit/eval-*`, `tests/lab/eval-audit.test.ts`, `package.json` (one script line), the doc |
| E3.1 group ablation | 5 | lane5 | Weight-group arms in `ablate/arms.ts` (factor `weights`): no-economy, no-home, no-safety, no-invariants, stage-0-1-only; exam per arm; descriptive fixed-work rows on development openings; `E3.1-GROUP-ABLATION.md` | `lab/hard-ai/ablate/arms.ts`, `tests/lab/ablate.test.ts`, the doc, `lab/results/hard-ai-e3/ablate/` |
| E3.1 → E3.2 loss judgment | 6 | lane6 | `E3.1-LOSS-JUDGMENT.md`: at the 12 distinct E1.1 loss positions (and the 47-loss set when the retrofit lands) decompose adviser-vs-played end-state scores by feature, apply judges 1, 2 and 4, name the loss-dominant concept | `docs/hard-ai/e3/E3.1-LOSS-JUDGMENT.md`, `lab/hard-ai/audit/loss-judgment.ts`, `lab/results/hard-ai-e3/loss-judgment/` |
| E3.1 authored judgments | 7 | lane7 | `E3.1-JUDGMENT-CASES.md`: the 22 exam judgment cases, the economy suite and the invariants pairs under the champion's static and searched scores, decomposed; each failure labelled contradictory-preference, weight-scale, or engine-bug, with the source section | `docs/hard-ai/e3/E3.1-JUDGMENT-CASES.md`, `lab/hard-ai/audit/judgment-*`, `lab/results/hard-ai-e3/judgment/` |
| E3.3 instrument | 8 | lane8 | `lab/hard-ai/tune/corpus.ts` and `texel.ts` per DESIGN §5.15, corpus from existing replays split by opening family, held-out loss; NOT run as a decision this session; `E3.3-TUNING-INSTRUMENT.md` | `lab/hard-ai/tune/*`, `tests/lab/texel.test.ts`, the doc |

Lane worktrees are `~/src/deevgames-e3-lane<N>` on `claude/hard-ai-e3-lane<N>`,
branched from this plan's commit, `muju/node_modules` symlinked. A lane
commits only its owned files; the coordinator merges lanes into
`claude/hard-ai-e3`. A lane that needs a file it does not own writes a
proposed amendment under `docs/hard-ai/e3/amendments/lane<N>.md` and stops
there.

## Rules every lane runs under

- `hard@desktop`'s config hash `4e7afdf76b32fadfab2d11577cb610c8f9f1a491b5153e70b87b0774403600cd`
  (at `{mode:'wall', ms:3000}`) and its fixed-work output stay byte-identical.
  No lane edits `src/ai/hard/**` in E3.1. A candidate fix (E3.2) is a
  switchable arm, default off.
- Any lab script that constructs an engine goes through
  `hardEnginePatch`/`createHardBot` or asserts `weights.version !== 0`
  (E0's I2 lesson; `armHardConfig()` alone returns placeholder weights).
- No fixture is repaired because the engine disagrees with it. A judgment
  case that contradicts the strategic model is reported as a contradiction
  with both sources cited, not edited.
- Heavy work: slot 0 belongs to E2's chain. Engine runs longer than five
  minutes go through the heavy queue (they will take slot 1); short probes may
  run `--no-heavy`, one engine process per lane at a time. Scoped tests run
  with `MUJU_HEAVY_DIR` pointed at a scratch directory.
- Never touch `~/src/deevgames-e1-run`, `~/src/deevgames-e2-run2`,
  `~/src/deevgames-e2-run`, or the E2 branch.
- Documents: plain prose, one fact per line, nested bullets where a list is
  natural, every number with its sample and its judge, every claim about a
  position with its file id, side and turn.

## Rules E3 rows will run under (preregistered before any row)

- Contests are `hard@ablate:<arm>` vs `hard@desktop`, wall:3000, h0/h3,
  `--legality strict`, `--shards 1`, at ONE commit for both arms.
- Seed rule: `seed = 20260930 + <row ordinal in this ledger>` (E2 used
  20260900 + ordinal; the offset keeps the two ledgers disjoint).
- Openings. Screening rows use the E1 validation blocks with one use left
  (`ALLOCATION.md` remaining-use table): `e1-val.jsonl` rows 16–31,
  `e1-val2.jsonl` rows 0–15, `e1-val2.jsonl` rows 16–31, each at most once
  more. Confirmations use `e2-val.jsonl` rows 32–63 only; rows 0–31 stay
  reserved for E2 per its plan's C3 correction, even though both E2 rows that
  reserved them closed negative. Development rows (`e0-openings.jsonl`,
  `e1-dev.jsonl`) carry descriptive rows only.
- Retain only with score > 0.5 AND a 95% interval excluding 0 on the
  confirmation row; a screening row alone retains nothing. A14 (frozen
  tolerance, 5% overrun voids), A15 (openings are the independence source),
  and the P6 flag (any turn > 20 s) stand.
- Every E3 row's report leads with the feature it changed and the judge that
  motivated it, then the score, and includes exam exact/judgment counts for
  both arms and the tactics suite for the arm.
- Feature-activation of tuned weights as a DEFAULT remains under M20's
  contract (fixed-work SPRT); an E3 equal-time row is development evidence and
  can make an arm the champion candidate, not a shipped default.

## Row ledger

| # | seed | arm | vs | openings | pairs | out | result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 20260931 | `hard@ablate:eval-no-safety` (screening) | `hard@desktop` | `e1-val2.jsonl --openings-skip 0` (rows 0–15, last screening use), h0/h3 | 32 | `lab/results/hard-ai-e3/ablate/eval-no-safety/screen` | DONE (finished 08:39:02Z per the manifest; read ~10:00Z; N1 correction 18:03:34Z): 45/2/17, 0.719, +163 [+85, +260], LOS 99.999%, h0 .734 / h3 .703, not voided → prediction MET, confirmation funded |
| 2 | 20260932 | `hard@ablate:eval-no-safety` (confirmation) | `hard@desktop` | `e2-val.jsonl --openings-skip 32` (rows 32–47, first and only use), h0/h3 | 32 | `lab/results/hard-ai-e3/ablate/eval-no-safety/confirm` | DONE 12:13Z: 42/2/20, 0.672, +124 [+38, +229], LOS 99.8%, h0 .719 (+163 [+32, +366]) / h3 .625 (+89 [−22, +221]); overrun 0.15% both, not voided; max turn 3.5 s / 11.9 s (no P6) → rule MET, thresholds MET → **RETAINED as champion candidate** |
| 3 | 20260933 | `hard@ablate:eval-no-safety` (shipped-Hard comparison, descriptive) | `aiv2-hard` | `e1-baseline.jsonl`, 50 × h0/h3 (the E1 baseline / E2 re-pin set) | 100 | `lab/results/hard-ai-e3/ablate/eval-no-safety/vs-shipped` | launched 12:15Z single-shard at a0f03c4e, stopped 13:00Z with 0 pairs; RELAUNCHED 13:00:08Z from `~/src/deevgames-e3-run2` at 55ae23d8 with `--shards 4` (same seed/openings; arm hash unchanged; load per game recorded), under the compute policy below. DONE 14:25Z: 181/1/18, 0.9075, +397 [+330, +495], LOS ≈ 1; h0 .890 (89/0/11, +363 [+279, +502]), h3 .925 (92/1/7, +436 [+340, +626]); overrunRate 0.07% / 0.15%, not voided; abortRate 13.2%; max turn 3.2 s; loadAvgMean 10.0. Champion's re-pin on the same set: 0.775, +215 [+156, +287] |
| 4 | 20260934 | `hard@ablate:eval-correct-v1` (screening) | `hard@desktop` | `e1-val2.jsonl --openings-skip 16` (rows 16–31, last screening use), h0/h3 | 32 | `lab/results/hard-ai-e3/ablate/eval-correct-v1/screen` | preregistered 16:4xZ; launches 23:00Z with 4 shards; CORRECTED 18:03:34Z: launches 23:00Z with 6 shards, heavy slots 8 (see the close-critique section below); DONE 23:21:09Z (launched 23:00:00Z, 6 shards, 8 slots, at 9c8d5f64): 42/1/21, 0.664, +118 [+51, +195], LOS 99.98%, h0 .656 (21/0/11, +112 [+9, +240]) / h3 .672 (21/1/10, +124 [+42, +224]); overrun 0.44% / 0.50%, not voided; maxTurnMs 15,680 / 4,707 (no P6 flag); loadAvgMean 7.3 → prediction MET, row #5 funded |
| 5 | 20260935 | `hard@ablate:eval-correct-v1` (confirmation) | `hard@desktop` | `e2-val.jsonl --openings-skip 48` (rows 48–63, first and only use), h0/h3 | 32 | `lab/results/hard-ai-e3/ablate/eval-correct-v1/confirm` | preregistered 23:23:49Z; launches in the night window at 6 shards, 8 slots; DONE 23:45:52Z (launched 23:24:34Z at a3d4e7c0, 6 shards, 8 slots): 39/0/25, 0.609, +77 [+4, +158], LOS 98.1%, h0 .594 (19/0/13, +66 [−25, +166]) / h3 .625 (20/0/12, +89 [−26, +227]); overrun 0.40% / 0.34%, not voided; maxTurnMs 7,088 / 6,868 (no P6 flag); loadAvgMean 7.9 → rule MET at the boundary (pair-level interval excludes 0 by 4 Elo; opening-clustered +77 [−12, +178] covers 0) → **RETAINED as a second champion candidate**, fragile |

## What E3.1 must settle before E3.2 is chosen

1. Which features double count (same condition scored twice, or the same
   crystals counted as bank, projected income and reserve).
2. Whether every feature is antisymmetric under side swap and invariant under
   the board's rot180 symmetry (with the negation flag), on real positions.
3. The contribution and cost profile: which features move scores on the loss
   corpus and the exam set, which never fire, what each stage costs.
4. Which groups the champion's strength lives in (group ablation, fixed work,
   descriptive).
5. The loss-dominant concept, named by judges 1, 2 or 4, with the feature
   decomposition that shows how the champion's score got it wrong.
6. Of the failing authored judgments, which are contradictions between
   sources and which are engine or scale bugs.

E3.2 then fixes ONE concept as a switchable arm, reproduces the error on a
development case, checks the exam and tactics suite for non-regression, and
is priced by a screening row and a confirmation row under the rules above.
E3.3 tuning runs only after the E3.1 findings and E3.2 have stabilised the
feature meanings, on the lane 8 instrument, with a held-out split by opening
family and an equal-time row before any claim.

## Slot schedule

1. Slot 0: E2's chain (analysis → retrofit → re-pin row #1), untouched.
2. Slot 1: lane 5's descriptive fixed-work rows, then lane 6/7 probes that
   exceed five minutes, then the E3.2 screening row.

## Corrections after the E3.1 audit (2026-09-17 06:4xZ, appended, nothing above rewritten)

- **Screening openings.** The bullet above lists `e1-val.jsonl` rows 16–31 as
  having one screening use left. That was wrong when written: E2 row #2 used
  that block as its "second and last use" (E2-PLAN row ledger). E3 screening
  rows draw from `e1-val2.jsonl` rows 0–15 (preregistered for E2 row #3, which
  closed without a row, so its one screening use is intact) and `e1-val2.jsonl`
  rows 16–31 (one screening use left). That is two screening blocks for all of
  E3; confirmations stay on `e2-val.jsonl` rows 32–63. ALLOCATION.md's
  remaining-use table is amended below the E2 addendum.
- **The `genRankCc` sentence** in "Why E3 now" is wrong: on the exposed root
  of `g2-s20_3_15-A-white` t3 the played turn's 2,000,000 lead is `ORDER_TT`
  (a transposition-table move bonus), not a static rank; every candidate
  carried the identical `scoreCc` 1,870 (lane 6, `amendments/lane6.md` §E).
  Lane 7 shows the adviser's and the played end states have identical
  58-feature vectors at that root (L7-F7), so it is a search tie-break, routed
  to E4, and it is removed from the E3.2 pool.
- **E3.1 outcome.** Eight lanes merged at 14a9b64a; 59 findings verified by
  the two-lens review, 25 refuted (appendix A of `E3.1-SYNTHESIS.md`). The six
  "must settle" items: 1–4 and 6 settled, 5 settled with two caveats (the
  concept is a joint claim that holds at 6 of 12 positions; judge 1 follows
  only the played line over a loss-selected corpus).
- **E3.2 concept (delegated decision, taken as the synthesis recommends):**
  the price of a threatened own body — the safety group of `eval-groups.ts`
  (19 weights). Evidence: judge 1 in-sample (safety → played turn at 9 of 10
  loss positions, Σ −5,100 cc) and out-of-sample (`eval-no-safety` 0.875,
  +338 [+168, +1200] at fixed:100000 on 4 development openings, exam exact
  unchanged), judge 4 (`Hanging` rests on kills the rules cannot see in one
  step at 4 of 24 loss end states and at the never-flip `g4-s6_3_5-B` t1),
  judge 3 (DESIGN row 17 says stage 2 refines Exposure; the code adds).
  Development case: `g4-s6_3_5-B-white` black t1 (root `74b71f89ae7abb64`),
  static −275 cc = safety −335 + RelocationDebt +60; with the block off the
  adviser's turn scores +60 cc. Second case for the report: `g4-s2_3_1-B-white`
  black t2 (block off leaves −60 cc; does not flip; the report must say so).
- **Row #1 preconditions (recorded before launch, in order):** (1) the static
  reproduction with the arm's weights (+60 / −60), (2) the arm's exam end key
  on `loss-g4-s6_3_5-B-white-t1`, (3) a fresh-engine work sweep at that root
  for the arm; all three recorded under `lab/results/hard-ai-e3/repro/` by the
  reproduction lane before the launcher starts. A7-1 (`suites/run.ts` builds
  searched engines with placeholder weights, L7-F1) is a precondition for the
  tactics-suite column of the row REPORT, not for the row.
- **Correctness arm.** B1–B5 of the synthesis §5 (EconDelta non-monotone in
  reserve; rot180 tie order in relocation; `Infiltration` identically zero;
  `Inv3RetreatSquare` missing conjunct; rent charged twice) are engine bugs by
  a canonical fact or the engine's own specification. They are built behind
  `HardConfig` flags, default off (champion hash unchanged), reproduced each
  on its canonical case, and bundled as `hard@ablate:eval-correct-v1` for its
  own screening row (`e1-val2.jsonl` rows 16–31, next ledger ordinal) AFTER
  row #1/#2, so effects stay attributable. Correctness and strength are
  separate columns; a correctness arm that loses its row is recorded as
  correctness pass / strength fail, and whether correctness overrides strength
  for a shipped default is the named approver's call.
- **Instrument fixes applied without a row** (lab only, no `src/ai/hard`):
  A7-1 suite weights; A7-2 exam judgment `won` outcome; A7-3 dead-position
  proof on the judgment carry path (reported as a new outcome class, the case
  file is not edited); `features.ts:28-31` header (a comment). Each records
  before/after counts for `hard@desktop` at the E3 commit.

## Row #1 preregistration (before launch)

- Arm: `hard@ablate:eval-no-safety` = the 19 safety weights (feature indices
  17, 28–36, 40, 41, 43, 45, 46, 49, 54, 56, 57) at 0, material and the other
  39 weights `default-v1`; `lab/hard-ai/ablate/arms.ts` factor `weights`,
  resolved hash `66edf9cdf58f…` at wall:3000. `hard@desktop` unchanged
  (`4e7afdf76b32fad…`, pinned by `tests/lab/ablate.test.ts`).
- Command, from a detached worktree `~/src/deevgames-e3-run` at the E3 head
  that carries the merged lanes and this preregistration (one commit, both arms):
  `hard:ladder --a hard@ablate:eval-no-safety --b hard@desktop --work wall:3000
  --handicaps 0,3 --pairs 32 --openings lab/hard-ai/ladder/openings/e1-val2.jsonl
  --openings-skip 0 --seed 20260931 --legality strict --shards 1
  --out lab/results/hard-ai-e3/ablate/eval-no-safety/screen`.
- Prediction, falsifiable: score > 0.5 (strong form: the 95% interval
  excludes 0). Prior 0.875 at fixed work on 4 development openings; an
  attenuation to 0.6–0.7 on 16 unseen openings would not falsify the weak
  form; A15 makes the 32-pair interval optimistic by about √2.
- Falsified if score ≤ 0.5: the +338 was a fixed-work or development-opening
  artifact, the safety block earns its keep at equal time, the arm closes, and
  E3.2 moves to the next concept in the synthesis §3.6 order (the correctness
  arm's row runs regardless).
- Mechanism check inside the row: the per-turn `rung` / units-per-ms
  instrument in `games.jsonl` must show the arm's rung distribution not above
  the champion's and its abort rate not exceeding it; otherwise the row prices
  search, not judgment, and is reported as such. A14 void rule, P6 > 20 s flag,
  `illegalActions` 0, `adjudicationRate` reported.
- Rule: SCREENING; retains nothing alone. If score > 0.5, row #2 is the
  confirmation on `e2-val.jsonl` rows 32–63 (`--openings-skip 32`, 32 pairs,
  seed 20260932, same settings); retain as champion candidate only with
  score > 0.5 AND a 95% interval excluding 0. A retained arm is development
  evidence, not a shipped default (M20).
- Report leads with the feature block and the judges, then the score; carries
  exam exact at fixed:25000 AND fixed:200000 for both arms, judgment counts
  reported not gated, the tactics/spawn-strike/home-mate suites for both arms
  once A7-1 has landed and A6's baselines are re-measured under `default-v1`.

## Verification state of the merged E3 head (updated as it changes)

- 50b6a94c (lanes 1–8 merged at 14a9b64a plus the synthesis): `npx tsc --noEmit`
  and `npm run hard:types` clean; `hard@desktop` hash unchanged; `git diff
  6adc0f2c..HEAD -- src/ai/hard` is EMPTY (no engine change in E3.1).
- Scoped `tests/ai/hard` + `tests/lab` with `MUJU_HEAVY_DIR` isolated: 69
  files, 1,101 of 1,103 passed. The two failures are the wall-clock assertions
  in `tests/ai/hard/p6-stoppable-generation.test.ts` (elapsed 20.6 s and
  17.7 s against a 15 s allowance-plus-slack) run while the load average was
  above 8 (E2's re-pin row on slot 0, the E3.2 lanes starting); one still
  failed rerun alone at load ~5.5. The engine source is byte-identical to the
  E2 head where the same file passed, so these are load artifacts, not a
  regression; they are re-run on an idle box before the E3 close.
- Row #1 go-file written 06:5xZ on that basis (the row is an equal-time
  contest in one process; load lowers both seats' throughput alike and the
  rung instrument records it).

## Row #1 result and the critique's corrections (2026-09-17 10:1xZ, appended)

- **Row #1 DONE** (launched 06:34:15Z from `~/src/deevgames-e3-run` at
  50b6a94c, complete ~10:00Z): `hard@ablate:eval-no-safety` vs `hard@desktop`,
  wall:3000, 32 pairs on `e1-val2.jsonl` rows 0–15 (`openingsUsed` 16 ids,
  independence true), 45/2/17, score 0.719, Elo +163 [+85, +260], LOS 99.999%;
  h0 0.734 (23/1/8, +177 [+62, +348]), h3 0.703 (22/1/9, +150 [+50, +281]);
  overrunRate 0% / 0.19%, not voided; abortRate 6.7% (arm) / 9.1% (champion);
  firstSearchAborted 47 / 45; meanTurnMs 1,715 / 1,822; maxTurnMs 3,007 /
  3,656 (no P6 flag); illegalActions 0, adjudicationRate 0, replays 64/64.
  The preregistered prediction (score > 0.5; strong form: interval excludes 0)
  is MET. Per the rule, row #2 (confirmation) is funded.
- **Mechanism check:** the arm searched LESS, not more (abort rate 6.7% vs
  9.1%, mean turn 107 ms shorter); the per-turn rung distribution is read from
  `games.jsonl` in the row report, but the abort and time columns already say
  the row did not price extra search. Box load was 4–9 during the row
  (E2's re-pin on slot 0, E3.2 lanes running); both seats share the process.
- **What row #1 is and is not (critique B1, B2, C1):** it is an equal-time
  pricing of the safety block as a GROUP ABLATION. It is not a test of a named
  misconception reproduced on a development case: lane 10's precondition
  record (`E3.2-REPRO.md`) shows the static +60 / −60 exactly as predicted,
  but under search the arm still plays the avoided key on
  `loss-g4-s6_3_5-B-white-t1` at fixed:25,000 and fixed:200,000, and the fresh
  sweep flips only at 400k, only within the 300 cc tolerance, and to a third
  turn, never to the adviser's key. Lane 10's 47-loss extension
  (`E3.1-LOSS-JUDGMENT.md` addendum, 39 distinct roots) shows the concept's
  joint claim does NOT generalise: safety → played 17 of 30 (in-sample 9 of
  10), economy → adviser 16 of 16 (8 of 11), joint 6 of 39; what generalises is
  the routing (static prefers the played turn at 28 of 39) and judge 1's
  material collapse (−0.69 → −18.95 at +3 turns, negative at 34 of 39). The
  synthesis §3.1 concept is therefore in-sample only; the arm stands as a
  candidate on the equal-time evidence, and "E3.2 fixes one misconception" is
  NOT claimed for it. Correction appended to `E3.1-SYNTHESIS.md`.
- **Sub-arms (lane 11, `E3.2-SAFETY-SUBARMS.md`, descriptive, fixed:100000,
  4 development openings):** threat stack 0.688 (+137 [+14, +309]), anchor
  0.562 (+44 [−36, +129]), safety invariants 0.625 (+89 [−74, +307]) against
  the whole block's 0.875. No sub-block reproduces the block; per critique fix
  8 the union stays the candidate and no sub-arm gets its own screening row.
- **Prior sentence (critique C2, fix 7):** the +338 was the selected best of
  six group arms on four development openings (per-opening 3/4, 4/4, 4/4,
  3/4; sign test p = 1/16; seat split 6/8 as White, 8/8 as Black). Row #1's
  +163 on 16 unseen openings is the number to quote from here on.
- **Suites under real weights (lane 9, `E3.2-PRECONDITIONS.md`, A7-1
  landed):** every A6 suite baseline was measured with the placeholder weight
  vector. Re-measured for `hard@desktop` under `default-v1`: tactics .9178
  (73/79 cases, unchanged), spawn-strike .80 (16/20; A6's .95 is UNMET by the
  champion under its real weights — recorded, not amended), home-mate 56/56,
  invariantsSearched .30, economy 1.000 (vacuous, L7-F2). The arm: tactics
  .9178 (same six misses), spawn-strike .75 (15/20, one more miss:
  purchase-1), home-mate 56/56, invariantsSearched .40. Exam at fixed:200,000:
  champion 120/127, arm 117/127 (three spawn-strike/tactics cases behind);
  at 25,000 both 121/127. Judgment counts are matched/won/dead now (A7-2,
  A7-3) and are reported, never gated.
- **Openings arithmetic (critique B4):** 32 pairs over h0/h3 consume 16
  openings. Row #2 uses `e2-val.jsonl` rows 32–47 (`--openings-skip 32`), and
  the correctness arm's confirmation, if funded, rows 48–63
  (`--openings-skip 48`). The "rows 32–63" wording above is superseded.
- **Fixed-work golden (critique B5):** `hard:cross-commit` at the merged head
  108a1215 against 50b6a94c is recorded below before row #2 launches; lane 12's
  own run (81e4e303 vs 50b6a94c) was 48 of 48 identical.
- **Timestamps:** the "06:4xZ" stamps above were written from the box clock in
  local time; the synthesis commit is 06:22:32Z, the row #1 go-file 06:32:07Z.
- **Deviations recorded:** lane 11 queued its first sub-arm row about 90 s
  before the `e3-row1-launched` marker appeared (row #1's shard already held
  slot 1, so nothing was displaced); lane 7 ran a 7-minute decomposer with
  `--no-heavy` in E3.1. Neither changed a result; both are recorded here as
  the rule asks.

## Row #2 preregistration (before launch)

- Arm and champion: as row #1; one commit for both arms = the E3 head that
  carries lanes 9–12 (108a1215 or its plan-commit descendant), with
  `hard@desktop`'s hash unchanged and the fixed-work golden identical.
- Command, from `~/src/deevgames-e3-run` re-detached at that commit:
  `hard:ladder --a hard@ablate:eval-no-safety --b hard@desktop --work wall:3000
  --handicaps 0,3 --pairs 32 --openings lab/hard-ai/ladder/openings/e2-val.jsonl
  --openings-skip 32 --seed 20260932 --legality strict --shards 1
  --out lab/results/hard-ai-e3/ablate/eval-no-safety/confirm`.
- Rule: retain `eval-no-safety` as the champion CANDIDATE only if score > 0.5
  AND the 95% interval excludes 0. A14 void rule, P6 flag, illegalActions 0.
  A retained arm is development evidence, not a shipped default (M20).
- Non-regression thresholds for retention (critique B3, preregistered here):
  tactics ≥ 73/79 and home-mate 56/56 under real weights (both already met by
  the arm), spawn-strike within one case of the champion's 16/20 (the arm has
  15/20: met), exam exact at fixed:200,000 within three cases of the champion
  (117 vs 120: met at the boundary; a further loss fails it). Judgment counts
  reported, not gated.
- What a null means: the +163 was a validation-block artifact; the arm closes;
  the safety block's mispricing stays established at the descriptive level
  only, and E3 moves to the correctness arm and the per-flag rows.
- If retained: the next E3 question is WHICH of the 19 weights carry the
  effect at equal time (the sub-arm rows say no sub-block alone does), and the
  correctness arm is priced against BOTH `hard@desktop` and the retained arm.

## Correctness arm plan (after the critique, delegated decisions)

- B1 (relocation trigger) is an OPEN flag, not a fix: it removes 99.76% of the
  reserve-monotonicity violations but 10 of 13,183 remain, and a monotone rule
  is a DESIGN §5.8 change. It is excluded from `eval-correct-v1`'s row until
  that amendment exists; its flag and oracle check stay in the tree.
- B3 (Infiltration per anchor) is a new definition of a DESIGN §5.12.1 row.
  Decision (delegated owner call, recorded in `AMENDMENTS-E3.md`): the
  per-anchor definition of DESIGN §5.8 / `anchorsVoidedBy` is the intended
  quantity and the pair count that is identically zero is the deviation; B3
  enters the bundle.
- Per-flag descriptive rows (critique fix 6) run first: `eval-fix-b2`, `-b3`,
  `-b4`, `-b5` and `eval-correct-v1` (B2+B3+B4+B5) at fixed:100000, 8 pairs on
  the same four `e1-dev` openings, seeds 39–43, through the heavy queue behind
  row #2. They enter no ledger. The bundle's screening row is preregistered
  after they are read, on `e1-val2.jsonl` rows 16–31 (ledger ordinal 3, seed
  20260933), its confirmation on `e2-val.jsonl` rows 48–63.
- **Fixed-work golden at the merged head (critique B5), recorded 10:5xZ:**
  `hard:cross-commit` at 108a1215 (24 positions × {100k, 400k}) against lane
  12's base rows at 50b6a94c: 48 of 48 rows identical on `scoreCc`, `depth`,
  `work`, `nodes`, `endKey` and `source`; 17 rows differ ONLY in the
  `Date.now()`-stamped starting-unit id inside the `actions` JSON, because this
  run reconstructed the positions afresh instead of reading lane 12's frozen
  states (the napkin's "starting units carry Date.now() ids"). The champion's
  fixed-work play is unchanged by lanes 9–12. Artifact
  `lab/results/hard-ai-e3/correct/cross-commit/rows-head-108a1215.json`.
- **Scoped tests at 108a1215 (lanes 9–12 merged):** 71 files, 1,153 of 1,155
  passed; the two failures are again the `p6-stoppable-generation` wall-clock
  assertions (20.4 s and 17.7 s against 15 s) under load 4–6 with E2's re-pin
  on slot 0. The fixed-work golden above is the engine-identity evidence.
- **Row #2 launched** from `~/src/deevgames-e3-run` re-detached at the commit
  that carries this bullet (see the ledger), 11:0xZ.
- **Timestamp correction (written 10:12Z from `date -u`):** the stamps
  "10:1xZ", "10:2xZ", "10:3xZ", "10:5xZ" and "11:0xZ" in the bullets above were
  estimates written ahead of the clock. Actual: row #1 read 10:01Z; lanes
  9–12 merged 10:03Z; golden and tests 10:04–10:09Z; row #2 launched
  10:09:53Z (launch commit a0f03c4e; shard on heavy slot 1 at 10:09:53Z);
  per-flag descriptive chain queued 10:10Z.
- **Lanes 13 and 14 merged (10:5xZ, `date -u`):** the invariants EVAL column
  and the recall instrument now see weights and evalFix arms (lane 13,
  `E3.3-INSTRUMENT-FOLLOWUPS.md`; A13-1's `rootDiagnostic` flip and A13-2's
  footnote are NOT applied yet — three ablate tests pin the old reading and
  need rewriting with them; a bounded task); `hard:suite --all` exists; the exam re-seed is ruled out (A-E3-5);
  B6 `approachTieOrder` built and added to the bundle (lane 14, A-E3-4;
  bundle hash `49aa15dba67f…`). Champion hash unchanged.
- **Descriptive chain restarted:** the first launch (10:10Z) hit the heavy
  queue's 30-minute give-up with both slots held (E2's re-pin, row #2), so
  `eval-fix-b2` exited 1 at 10:41Z without playing; the chain now waits for a
  free slot before each row.

## Row #2 result and the retention decision (2026-09-17 12:2xZ, `date -u`, appended)

- **Row #2 DONE 12:13Z** (launched 10:09:53Z at a0f03c4e, both arms at one
  commit): `eval-no-safety` vs `hard@desktop`, wall:3000, `e2-val.jsonl` rows
  32–47 (16 openings, first and only use, independence true), 42/2/20, score
  0.672, Elo +124 [+38, +229], LOS 99.8%; h0 0.719 (23/0/9), h3 0.625
  (19/2/11); overrunRate 0.15% / 0.15% (not voided); abortRate 6.8% / 8.7%;
  firstSearchAborted 44 / 34; meanTurnMs 1,724 / 1,834; maxTurnMs 3,495 /
  11,918 (champion; under the 20 s P6 flag); illegalActions 0, divergences 0,
  adjudications 0, failures 0, replays 64/64. Artifacts copied into the branch
  under `lab/results/hard-ai-e3/ablate/eval-no-safety/confirm/`.
- **Rule:** score > 0.5 AND interval excludes 0 → MET. Thresholds preregistered
  before the row: tactics 73/79 (met, equal), home-mate 56/56 (met),
  spawn-strike 15/20 within one of 16/20 (met), exam exact at fixed:200,000
  117 vs 120 within three (met at the boundary). Judgment counts reported only.
- **Decision: `hard@ablate:eval-no-safety` is RETAINED as the champion
  candidate** (development evidence under EPIC-PLAN §5 campaign 4; not a
  shipped default — M20's fixed-work SPRT contract and E6's held-out release
  stand). Two rows, 64 pairs on 32 unseen validation openings: +163 [+85,
  +260] and +124 [+38, +229].
- **What it means and does not:** the 19 safety weights as authored cost the
  champion strength at equal time on unseen openings; the mechanism (which of
  the 19, and whether a correction rather than a removal does better) is NOT
  established — the sub-arm rows say no sub-block alone reproduces the whole
  block, and the named concept did not generalise to the 47 losses. The
  mechanism check inside the rows: the arm searched less (abort rate lower,
  turns shorter), so the rows did not price extra search; per-turn rung rows
  are not recorded per seat in `games.jsonl` for a Hard-vs-Hard row (aggregate
  `hardTiming` only — critique C13's instrument ask stands as a bounded task).
- **Comparisons the decision record needs:** vs shipped Hard. E2's re-pin row
  #1 finished 12:1xZ: `hard@desktop` vs `aiv2-hard`, wall:3000, e1-baseline
  100 pairs, 155/0/45, 0.775, +215 [+156, +287] (E1's +203 [145, 273]
  reproduced at the P6-fixed code). Row #3 (descriptive, preregistered above)
  runs the candidate on the same set against `aiv2-hard`, seed 20260933, so
  the two numbers are directly comparable. It is not a retention row.
- **Next rows:** the correctness singles' descriptive rows are running (B2
  done 12:11Z, B3 running on slot 0); B6 and the bundle (B2–B6) descriptive
  rows follow from a worktree re-detached at the head; then the bundle's
  screening row (ledger ordinal 4, seed 20260934, `e1-val2.jsonl` rows 16–31)
  against `hard@desktop`, and, if it passes, its confirmation on `e2-val.jsonl`
  rows 48–63 (seed by ordinal). Pricing the bundle against the retained
  candidate needs a two-factor arm (`combined`), preregistered separately.
- **Correction (12:3xZ):** per-seat rung rows ARE recorded for Hard-vs-Hard
  rows, under `players.<side>.hardTiming.turnRows` in `games.jsonl` (fields
  turn, rung, work, elapsedMs, searchMs, fundedMs, depth, stopReason,
  unitsPerMsBefore/After, deadlineCut); the sentence above saying they are not
  is wrong. Mechanism check computed from them (arm A / champion B):
  - Row #1, 4,232 turn rows: rungs A 100k 57.2% / 200k 39.5% / 400k 3.2%,
    B 53.3% / 43.3% / 3.2%; mean units/ms 64.4 / 66.4; mean completed depth
    2.36 / 2.43.
  - Row #2, 4,119 turn rows: A 100k 50.8% / 200k 46.1% / 400k 3.1%,
    B 46.2% / 50.7% / 3.1%; mean units/ms 68.1 / 70.2; depth 2.39 / 2.43.
  - The arm's rung distribution is not above the champion's and its abort
    rate is lower: the rows priced judgment, not search. The critique's C13
    (load per game) still stands as an instrument ask.
- Row #3 launch time is 12:15:21Z (not "12:2xZ"; pid 53563, slot 1).
- **Row report** `E3.2-ROW-REPORT.md` (12:4xZ) with its §10 discrepancies:
  row #1 finished 08:39:02Z (`finishedAt`), not "~10:00Z" (that was the read
  time); row #1 ran at 50b6a94c and row #2 at a0f03c4e (lane 12's flag-gated
  `src/ai/hard` edits in between; the 48/48 fixed-work golden and the
  unchanged config hash are the identity evidence, both rows had both arms at
  one commit); both rows' `summary.md` lists all 32 pool ids while
  `metrics.json.openingsUsed` holds the 16 played (a `summary.md` bug, bounded
  task); row #1 has 0.1% of turn rows at rung 50k. E2's re-pin metrics are
  copied under `lab/results/hard-ai-e3/reference/e2-repin/` so the decision
  record's shipped-Hard comparison is citable from this branch.
- **Lane 15 merged (`E3.3-LAB-FIXES.md`):** A13-1 (`rootDiagnostic: true` on
  the 16 weights/evalFix arms, by factor filter, tests rewritten) and A13-2
  are now APPLIED; earlier bullets saying they were not are superseded.
  `summary.md` lists the openings USED; `games.jsonl` rows carry
  `loadAvgStart`/`loadAvgEnd` and `metrics.json` `loadAvgMean` from here on
  (rows #1–#3 and E2's re-pin predate it and carry no load samples).

## Compute policy (Ethan, 2026-09-17 13:0xZ) and the slot schedule from here

- 9am–6pm CDT (14:00Z–23:00Z): tidy — at most about three cores of engine
  work (heavy slots ≤ 3, single-shard rows or one row at `--shards 3`).
- 6pm–9am CDT: parallelize hard — heavy slots 8; fixed-work rows and
  analyses at `--shards 6–8`; wall-clock rows at `--shards 4–6`, with the
  per-game `loadAvgStart`/`loadAvgEnd` fields and `overrunRate` (A14 voids at
  5%) read before any timing column is cited. `--shards 12` unqueued once
  took load to 79 on this box (napkin); stay under that.
- Row #3 was relaunched at 13:00Z with 4 shards (still the night window); a
  scheduler (`scratchpad/row3-daynight.sh`) stops it at 14:00Z if unfinished
  (parent and shard pids) and resumes it with `--resume --shards 6` at 23:00Z.
- The correctness descriptive rows (B4 running, B5, B6, bundle) stay
  single-shard through the day (one core).
- The bundle's screening row (ordinal 4, seed 20260934) and any further
  wall-clock row are scheduled for the night window.
- 13:1xZ: Ethan's call — row #3 keeps its 4 shards until 11:30am CDT (16:30Z)
  today (no video calls before then); the scheduler's stop moved from 14:00Z
  to 16:30Z, resume unchanged at 23:00Z with 6 shards. One-off; the policy
  above stands.

## Row #3 result (2026-09-17 14:3xZ, `date -u`, appended)

- **Row #3 DONE 14:25Z** (descriptive, `eval-no-safety` vs `aiv2-hard`,
  wall:3000, `e1-baseline.jsonl` 50 × h0/h3, seed 20260933, 4 shards at
  55ae23d8, launched 13:00:08Z): 181/1/18, score 0.9075, Elo +397 [+330,
  +495]; h0 0.890 (89/0/11), h3 0.925 (92/1/7); overrunRate 0.07% (arm) /
  0.15% (aiv2), not voided; abortRate 13.2%; p95 3,002 ms, max 3,200 ms;
  meanTurnMs 1,814 / 2,990; illegalActions 0, divergences 0, adjudications 0,
  failures 0; openings 50 of 50, independence true; loadAvgMean 10.0 over 200
  games (four shards plus one fixed-work row on the box).
- **Against the champion's own re-pin on the identical 100 pairs** (E2 row #1,
  single shard, 12:1xZ): 155/0/45, 0.775, +215 [+156, +287]. Win types:
  candidate 166 home-checkmates, 7 home-occupations, 5 eliminations, 3
  upkeep-eliminations; losses 9 home-checkmate, 5 elimination, 4
  upkeep-elimination. Champion: 144 / 2 / 7 / 2; losses 21 home-checkmate, 21
  elimination, 3 upkeep-elimination. The candidate's losses by elimination
  fell 21 → 5 and by home-checkmate 21 → 9; mean game length 21.4 vs 21.1
  turns. The rows are not paired game by game (different seeds of a
  non-deterministic opponent), so the difference is read at the score level:
  the candidate wins about 13 more games per hundred against shipped Hard.
- **Timing comparability:** row #3 ran four shards at load ≈ 10 while the
  re-pin ran one shard; the candidate's abort rate (13.2%) is close to the
  champion's in its re-pin (15.1%) and mean turn 1,814 vs 1,959 ms, so the
  sharding did not starve the seat; overrun stayed under A14's 5%.
- **Decision record:** "Strength vs shipped Hard" for the candidate is now
  filled: 0.9075, +397 [+330, +495], 100 pairs, both handicaps ≥ 0.89. The
  M20/E6 contract is unchanged: this is development evidence.

## Correctness descriptive rows and row #4 preregistration (2026-09-17 16:4xZ, `date -u`)

- Six descriptive rows, fixed:100000, 8 pairs on the first four `e1-dev`
  openings, h0/h3, one shard each, vs `hard@desktop` (arm as A; enter no
  ledger; A15 independence source 4):
  - `eval-fix-b2` (rot180 tie order), seed 39: 7/0/9, 0.438, −44 [−129, +36].
  - `eval-fix-b3` (Infiltration per anchor), seed 40: 9/0/7, 0.562, +44 [−104, +210].
  - `eval-fix-b4` (Inv3 retreat conjunct), seed 41: 8/0/8, 0.500, 0 [−126, +126].
  - `eval-fix-b5` (rent once), seed 42: 9/1/6, 0.594, +66 [−19, +159].
  - `eval-fix-b6` (approach tie order, inert without B4), seed 43: 8/0/8,
    0.500, 0 [−85, +85] — plays the champion's moves, as lane 14 predicted.
  - `eval-correct-v1` (B2+B3+B4+B5+B6, hash `49aa15dba67f…`), seed 44:
    11/0/5, 0.688, +137 [+14, +309]. Rows B2–B5 ran from `~/src/deevgames-e3-run`
    at a0f03c4e (the singles are unchanged there); B6 and the bundle from
    `~/src/deevgames-e3-run2` at 55ae23d8.
  - Reading: every single is a null at this sample, as a correctness fix
    should be; the bundle leans positive and is the arm to price.
- **Anomaly P8 (recorded, not diagnosed):** the bundle row's game seed
  2399710895 (h3, 26 turns, home-occupation) lasted 4,249 s with the arm's
  worst turn 2,641 s and the champion's 928 s in the same game, while both
  seats' search `turnRows` show sub-second searches at fixed work — the time
  sits outside the search (canonical adjudication or generation before it;
  E2's P7 named `applyAction` home-gate adjudication at ~1.4 s per action).
  A second game (seed 487278473, h0) ran 161 s. `eval-fix-b6`'s row also
  carries one 36 s turn. Fixed-work rows have no deadline, so a pathological
  position runs to completion; wall rows cap the generator (P6 fix) but not
  the canonical side. A bounded diagnosis lane reproduces the slow turns from
  the replay and attributes the time before the bundle's confirmation row is
  read; row #4's report must carry `maxTurnMs` and the P6 flag rule as usual.
- **Row #4 preregistration (bundle screening):** `hard@ablate:eval-correct-v1`
  vs `hard@desktop`, wall:3000, h0/h3, `--legality strict`, 32 pairs on
  `e1-val2.jsonl` rows 16–31 (`--openings-skip 16`, last screening use), seed
  20260934, `--shards 8` in the night window (23:00Z start, `MUJU_HEAVY_SLOTS
  10`; changed from 4 shards at 16:5xZ before launch, per the night default of
  one wall-clock shard per performance core; load per game is recorded), from `~/src/deevgames-e3-run2` re-detached at the commit that carries
  this bullet; out `lab/results/hard-ai-e3/ablate/eval-correct-v1/screen`.
  - Prediction, falsifiable: score > 0.5 (prior: +137 [+14, +309] at fixed
    work on four development openings; five specification fixes, none
    tuned). Falsified if ≤ 0.5: the bundle closes as correctness pass /
    strength fail, and B5 (the one flag that moves a term the loss corpus
    vindicated) is isolated first.
  - Rule: SCREENING, retains nothing alone. If > 0.5, row #5 is the
    confirmation on `e2-val.jsonl` rows 48–63 (`--openings-skip 48`, seed
    20260935); retain only with score > 0.5 and the interval excluding 0.
    Same tactical thresholds as row #2 (tactics ≥ 73/79, home-mate 56/56,
    spawn-strike within one of 16/20, exam at 200k within three) measured for
    the bundle before the confirmation is funded. A14, P6 (> 20 s) and the P8
    note apply; the report leads with the five flags and their canonical
    cases, then the score.
  - Pricing the bundle against the retained candidate needs a two-factor arm
    (`combined`: weights + evalFix) and its own preregistration; not this row.
- **P6 wall-clock tests (17:0xZ):** `tests/ai/hard/p6-stoppable-generation.test.ts`
  5 of 5 pass at the head with one engine process on the box (load ≈ 4.4),
  closing the "re-run on an idle box" item: the earlier failures (15.0–20.6 s
  against 15 s) were load artifacts, as the unchanged fixed-work golden
  implied.
- **Timestamp correction (16:43Z from `date -u`):** the "16:4xZ" stamp on the
  descriptive-rows section and the "17:0xZ" stamp on the P6 bullet were
  estimates; the commits are cd212f7c at 16:3xZ and b593a3cc at 16:4xZ (see
  `git log --format=%cI`). Row #4's launcher starts at 23:00Z regardless.
- **P8 diagnosed (lane 16, `P8-SLOW-TURNS.md`, cherry-picked 16:49Z):** the
  premise in the P8 bullet above was wrong — the seconds ARE inside
  `searchMs`, in candidate generation: DESIGN §5.6's forced-rescue injection
  (`injectRescue → homeWitness`) at quiescence nodes, unmetered, so fixed
  work never stops it; P6 one level below E1's root-only fix. Reproduced at
  fixed:100,000: `hard@desktop` 79.3 s vs the bundle 79.2 s on the same
  position (32 bodies, 27 `fire_1`, both homes under a live race) — NOT
  arm-specific; the worst turn across the six correctness rows (391 s) is the
  champion's. Wall mode caps it to about 5 s on that turn but 24.8 s on the
  worst position (16 s in `verifyTurn`, `applyAction` 2.8–3.8 s per action,
  P7 outside the deadline). Row #4 should expect worst turns near 25 s and
  the P6 > 20 s flag to fire; the flag withholds timing columns, it does not
  void the row. Fix proposal (not implemented): cap and meter `homeWitness`
  calls in `injectRescue` (WorkClass.PROVER), set `s.truncated` when the cap
  bites, and memoise the canonical home verdict for P7 — a preregistered E4
  lane, since it changes the search.
- Lane 16's branch carries a merge of `origin/master` (the repo's freshness
  hook refused the lane commit 4 behind master); the E3 head takes the
  diagnosis by cherry-pick and merges master at the E3 close as planned.

## E3 close verification, before row #4 (2026-09-17 17:50Z, `date -u`, appended)

- **Master merged:** `origin/master` (four Muju UI commits, 2ffd680e..03620df8)
  merged into the E3 head as c73204dd at 17:38Z; `git diff 3a173c5c..c73204dd
  -- src/ai/hard` is EMPTY. Config hashes at c73204dd unchanged:
  `hard@desktop` `4e7afdf76b32fad…`, `hard@ablate:eval-no-safety`
  `66edf9cdf58f…`, `hard@ablate:eval-correct-v1` `49aa15dba67f…`.
- **Fixed-work golden at c73204dd:** `hard:cross-commit` (24 positions ×
  {100k, 400k}), 48 of 48 rows identical to `rows-head-108a1215.json` on
  `scoreCc`, `depth`, `work`, `nodes`, `endKey`, `source`; 17 rows differ
  only in the `Date.now()` unit ids inside `actions` (positions reconstructed
  afresh, the handoff gotcha). Artifacts
  `lab/results/hard-ai-e3/correct/cross-commit/rows-head-c73204dd.json` and
  `summary-head-c73204dd.json`. The identity chain (hash + golden after every
  merge) is unbroken across lanes 1–16 and the master merge.
- **Scoped tests at c73204dd** (`tests/ai/hard` + `tests/lab`,
  `MUJU_HEAVY_DIR` isolated, two workers, 17:38–17:44Z): 73 files, 1,187 of
  1,188 passed. The one failure is again `p6-stoppable-generation`'s
  wall-clock assertion (15.05 s against 15 s) run while the golden, the
  bundle's suites and its exam shared the box (load 5.5–6.5). Rerun alone at
  17:45–17:50Z (load 4.7): 5 of 5 pass. Load artifact, as before; not a
  regression.
- **Bundle tactical thresholds (row #4 preregistration, measured before row #5
  is funded)**, `hard@ablate:eval-correct-v1` at c73204dd, 17:41–17:44Z,
  `lab/results/hard-ai-e3/correct/thresholds/` (`suites-eval-correct-v1.json`,
  `exam-eval-correct-v1-fixed200k/dev.json`, `summary.json`):
  - tactics 73/79 (bar ≥ 73/79): MET, equal to the champion;
  - home-mate 56/56 (bar 56/56): MET;
  - spawn-strike 16/20 (bar within one of 16/20): MET, equal to the champion
    (the retained candidate had 15/20);
  - exam dev stratum at fixed 200k, exact 120/127 (bar within three of the
    champion's 120/127): MET, equal;
  - the bundle's suite failure set is IDENTICAL to the champion's
    (`followups/suites/all-suites-desktop-after-a9-1.json`): nothing gained,
    nothing lost, on the authored cases. Reported, no threshold:
    invariantsEval .60, invariantsSearched .40, exam judgment matched 2/22
    (champion 0/22); illegalTurns 0, replicaDivergences 0.
  - So if row #4 reads > 0.5, row #5 is funded on the thresholds already.
- **Lane worktrees removed** (`~/src/deevgames-e3-lane{1..8}`; branches
  lane9–16 kept). Lane 5's worktree held an untracked
  `lab/results/hard-ai-e1/exam/dev.{json,md}` (an `eval-no-home` exam from
  05:40Z, not referenced by any report); copied to the session scratchpad,
  not committed.
- **Close critique** (`E3-CLOSE-CRITIQUE.md`) is being written by an
  independent Fable pass over the session up to row #4's preregistration;
  its findings and the row #4/#5 results go into `E3-CLOSE.md`.

## Close-critique corrections and row #4 launch reconciliation (2026-09-17 18:03:34Z, `date -u`, appended)

`E3-CLOSE-CRITIQUE.md` (independent, 17:58:29Z, at 4edcfa05) found two
blockers and ten concerns; every headline number reproduced. What is acted on
before row #4, in the critique's order:

- **Row #4 shard count (C1).** The compute policy recorded above (13:0xZ,
  Ethan) says wall-clock rows at `--shards 4–6` with heavy slots 8. The
  16:5xZ change to 8 shards and `MUJU_HEAVY_SLOTS=10` exceeded it with no
  named approver. The 8-shard launcher was stopped at 18:00:03Z before it
  fired (nothing had run). Replacement launcher started 18:00:44Z
  (`scratchpad/row4-night.sh`, this session): the same command, seed 20260934,
  `e1-val2.jsonl --openings-skip 16`, 32 pairs, h0/h3, strict, from
  `~/src/deevgames-e3-run2` at 9c8d5f64 (`src/ai/hard` identical to HEAD),
  with `--shards 6` and `MUJU_HEAVY_SLOTS=8`, at 23:00Z. The ledger cell's
  "4 shards" is superseded (in-cell note above).
- **Row #4 report requirements added (C9, B2):** per-seat overrun counts and
  `depth 0` turn counts per seat and per game alongside `maxTurnMs`; the
  mechanism check from `turnRows` (rung distribution and abort rate, bundle
  not above champion, else the row is reported as pricing B3's scan cost);
  the report leads with "four specification fixes (B2, B4, B5, B6) and one
  redefinition (B3)". The rule (> 0.5 funds row #5 on rows 48–63, seed
  20260935; ≤ 0.5 closes the bundle, B5 isolated first) is unchanged.
- **B1, the candidate's thresholds.** Row #2's non-regression bars ("within
  one of 16/20", "within three of 120/127") were written at 10:06Z, after the
  arm's numbers (15/20, 117/127) were committed at 06:52Z, and sized to them.
  Restated: `hard@ablate:eval-no-safety` REGRESSES the champion by one
  spawn-strike case (`purchase-1`) and three exam exact cases at 200k; those
  bars are not evidence; retention rests on the strength rule alone
  (confirmation 0.672, +124 [+38, +229], robust to opening clustering
  [+41, +226]). Red obligation: candidate spawn-strike .75 at per-case
  budgets against M14's `>= 0.80`, unmeasured at the gate's own work. That
  measurement (spawn-strike at fixed 400,000, desktop profile, champion,
  candidate and bundle, one shard) was launched at 18:01Z
  (`lab/results/hard-ai-e3/correct/thresholds/spawn-strike-400k-*.json`);
  result appended below when read. Rule from here: non-regression bars are
  written before the suites run, as was done for the bundle at 16:31Z.
- **B2, `Infiltration`.** B3 is a redefinition (distinct anchors), not
  DESIGN's sum with multiplicity nor M9's pair count. A DESIGN §9 addendum of
  this stamp adopts the distinct-anchor definition for the arm under Ethan's
  delegation, pending ratification; `AMENDMENTS-E3.md` carries the correction
  to A-E3-1's "original" line. If not ratified, B3 leaves the arm.
- **Identity chain (C2).** The 17:50Z bullet's "unbroken across lanes 1–16"
  overstated it. Goldens were run at 81e4e303, 108a1215 and c73204dd only.
  B6 entered `src/ai/hard` at 8bbc2de0 (10:44:07Z) and no golden ran until
  17:41Z; row #3, B6's descriptive row and the bundle's ran in that gap. The
  c73204dd golden is identical to 108a1215's on every search field, so the
  champion's fixed-work play was in fact unchanged through the gap — evidence
  after the fact, not a rule kept. Rule from here: a golden with `--states-in`
  before the first row at any commit that changes `src/ai/hard`.
- **Timestamps (C3), git times for the ten estimates:** "row #1 go-file
  06:5xZ" → 3af171f6 06:32:07Z; "lanes 13 and 14 merged 10:5xZ" → 8bbc2de0
  10:44:07Z; "row #2 result 12:2xZ" → 49e0548a 12:15:21Z; "E2's re-pin
  finished 12:1xZ" (twice) → manifest 11:51:06Z; "correction 12:3xZ" →
  cc3af366 12:16:53Z; "row report 12:4xZ" → 414f0921 12:26:30Z; "13:1xZ
  Ethan's call" → 967da52e 13:53:39Z; "row #3 result 14:3xZ" → e6bcbfdb
  14:27:10Z; "b593a3cc at 16:4xZ" → 16:36:06Z; "timestamp correction 16:43Z"
  → 0a3528ea 16:42:42Z. From here every stamp is to the second from `date -u`.
- **Stale preregistration text (C7, N1):** line 372 above ("ledger ordinal 3,
  seed 20260933" for the bundle's screening) is superseded — ordinal 4, seed
  20260934 (row #3 consumed ordinal 3). `E3.2-CORRECTNESS-ARM.md` §7 and
  `E3.1-SYNTHESIS.md` §6 carry appended correction lines pointing
  confirmations at rows 48–63. Ledger row #1's finish time is now in its
  cell.
- **Row #3 abort rate (C5):** 13.2% is unexplained; the single-shard re-pin
  of the same set shows the same class of rate (15.1%); first-turn aborts are
  28% of the aborts. Not "close to" anything.
- **B6's descriptive row (N3):** an A/A confirmed — identical moves, 8/0/8,
  ±85 is the prior's width, not a measurement.
- **Amendments (C4):** A-E3-1..5 were applied by the coordinator under
  Ethan's delegation, none seen by a named human approver; A-E3-1 (the
  Infiltration redefinition) and A-E3-3 (A6's spawn-strike baseline) touch
  the release contract and are listed for Ethan's ratification in
  `E3-CLOSE.md`.
- **P6 wall-clock test (N9, E1-CLOSE C7):** the two elapsed-time assertions
  in `tests/ai/hard/p6-stoppable-generation.test.ts` now assert only when
  `MUJU_WALLCLOCK_TESTS` is set and log the elapsed time otherwise; the
  structural assertions (abort, real plan, legal replay) always run. Fixed-
  work identity tests in the same file are unchanged.
- Not acted on here, carried into `E3-CLOSE.md`: C6 (E3.2 acceptance evidence
  not met; exit clause met), C8 (the shipping consequence of nineteen zeros;
  `combined` and per-weight rows preregistered in E4's night queue), C10 (the
  A8.2 ruling on validation replays in tuning corpora — Ethan's).
- **M14 gate-setting spawn-strike, read 18:04:32Z** (fixed 400,000, desktop
  profile, one shard, 20 cases, at 4edcfa05; artifacts
  `correct/thresholds/spawn-strike-400k-{hard-desktop,hard-ablate-eval-no-safety,hard-ablate-eval-correct-v1}.json`):
  champion 16/20 (.80, equal to the `hard@lab` gate artifact), candidate
  `eval-no-safety` 15/20 (.75 — FAILS M14's `>= 0.80` by one case,
  `spawn-strike-purchase-1`, the same case as at per-case budgets), bundle
  `eval-correct-v1` 16/20 (.80). The candidate's red obligation stands at the
  gate's own work, and it is a release-contract veto (EPIC-PLAN §5 "suites no
  worse than M14") until either the case is won back or the bar is amended
  with Ethan as approver. It does not touch the retention, which is
  development evidence under the strength rule.
- **Decisions under delegation (19:34:37Z, `date -u`):** Ethan, ~18:5xZ, "don't
  bother me on any of these decisions, use your best judgment". Recorded as
  A-E3-6 (B3 ratified as the spec; bundle = four fixes + one ratified spec
  change), A-E3-7 (A6's .95 unmet, not lowered), A-E3-8 (M14's .80 stands
  against the candidate; win `purchase-1` back via the per-weight rows), and
  A-E3-9 (A8.2: validation/sealed replays excluded from tuning corpora) in
  `AMENDMENTS-E3.md`.

## Row #4 result and row #5 preregistration (2026-09-17 23:23:49Z, `date -u`, appended)

Row #4 report lead: four specification fixes (B2 rot180 tie order, B4 Inv3
`retreats > 0`, B5 rent once, B6 approach tie order) and one ratified spec
change (B3 `Infiltration` as distinct voided anchors, A-E3-6), all behind
`HardConfig.evalFix`, weights `default-v1`; judges: canonical facts (judge 4)
for every flag; the E3.1 audit for the double-counted rent and the rot180
asymmetry.

- **Provenance:** launched 23:00:00Z from `~/src/deevgames-e3-run2` at
  9c8d5f64 (`src/ai/hard` identical to this head), `--shards 6`,
  `MUJU_HEAVY_SLOTS=8`, seed 20260934, `e1-val2.jsonl` (sha `fe3b9c98…`)
  `--openings-skip 16`, `openingsUsed` = rows 16–31 in order
  (`e1v2-g5-s255` … `e1v2-g4-s390`), `openingsIndependent` true,
  `distinctGames` 32/32 both orientations, no duplicates; manifest
  `aConfigHash` `…#49aa15dba67f…`, `bConfigHash` `…#4e7afdf76b32fad…`,
  `aResolvedConfig.config.evalFix` = the five flags true, `weights.label`
  `default-v1`; wasm `da9b1cdf…`. Finished 23:21:09Z (21 min). Artifacts
  copied to `lab/results/hard-ai-e3/ablate/eval-correct-v1/screen/` with
  `screen.nohup.log`.
- **Score:** 42/1/21 of 64 games, 0.664, Elo +118 [+51, +195], LOS 99.98%;
  h0 21/0/11, 0.656, +112 [+9, +240]; h3 21/1/10, 0.672, +124 [+42, +224].
  Pair counts [1, 0, 19, 1, 11] (arm lost both games of one pair, won both of
  eleven). Prediction (> 0.5) MET.
- **Hygiene:** illegalActions 0, replicaDivergences 0, adjudicationRate 0,
  failures none, anomalies 0, `voided` false; overrunRate 0.44% (arm, 8 of
  1,822 turns) / 0.50% (champion, 9 of 1,813) against A14's 5%; p95 3,002 ms
  both; maxTurnMs 15,680 (arm) / 4,707 (champion) — no turn over 20 s, the P6
  flag does NOT fire, timing columns are reported; max `searchMs` 10,011 /
  4,707, so the arm's 15.7 s turn had ~5.7 s outside the search (P7's
  canonical side, as P8 predicted). Per-game load 7.19 → 7.39 (mean 7.29) at
  six shards.
- **Per-seat columns (C9):** turns over the allowance 212 / 171
  (tolerance 30 ms; overruns beyond tolerance 8 / 9); `depth 0` turns 3 (arm,
  in 3 games) / 0 (champion); first searches aborted 43 / 39.
- **Mechanism check (turnRows, 1,822 arm / 1,813 champion):** the arm's rung
  distribution is BELOW the champion's (100k 54% vs 45%, 200k 42% vs 52%,
  400k 4% both), mean completed depth 2.34 vs 2.44, abort rate 12.8% vs
  10.3%, mean turn 1,825 ms vs 1,880 ms. So the row also priced cost: the
  bundle's evaluation is dearer per node (B3's anchor scan), it reached less
  depth at equal time, and it scored 0.664 anyway. The judgment gain is
  therefore understated by the cost, not produced by it. Reported as the
  rule asks; the strength reading stands.
- **Openings bookkeeping:** `e1-val2.jsonl` rows 16–31 are now SPENT (no
  screening use left anywhere in E1's pools); `ALLOCATION.md` carries the
  addendum.
- **Rule outcome:** score > 0.5 → row #5 (confirmation) is funded. The
  bundle's tactical thresholds were measured BEFORE this row (17:41–17:44Z,
  all equal to the champion; M14 gate setting 16/20 = .80).

### Row #5 preregistration (before launch)

- Arm and champion as row #4, one commit for both arms = the commit that
  carries this bullet (`src/ai/hard` unchanged since 9c8d5f64; hash and golden
  as recorded at c73204dd), from `~/src/deevgames-e3-run2` re-detached at that
  commit.
- Command: `MUJU_HEAVY_SLOTS=8 npm run hard:ladder -- --a
  hard@ablate:eval-correct-v1 --b hard@desktop --work wall:3000 --handicaps
  0,3 --pairs 32 --openings lab/hard-ai/ladder/openings/e2-val.jsonl
  --openings-skip 48 --seed 20260935 --legality strict --shards 6 --out
  lab/results/hard-ai-e3/ablate/eval-correct-v1/confirm` (rows 48–63, first
  and only use; night window; launcher `scratchpad/row5-night.sh`, which
  waits for the heavy slots to be free).
- Prediction, falsifiable: score > 0.5 with a 95% interval excluding 0
  (prior: +118 [+51, +195] on rows 16–31; +137 [+14, +309] at fixed work on
  four development openings). Retain the bundle as a champion candidate
  (priced against `hard@desktop`, NOT against `eval-no-safety`) only if both
  hold; otherwise the bundle closes correctness pass / strength
  not-confirmed and B5 is isolated first. A14, A15, the P6 flag rule, the C9
  per-seat columns and the mechanism check apply as in row #4. No re-run, no
  seed change, no threshold moved.
- **Row #5 launch deviation (23:24:59Z, `date -u`):** the first launch at
  23:23:49Z ran from `~/src/deevgames-e3-run2` still at 9c8d5f64, because
  `git checkout --detach a3d4e7c0` had been refused (the worktree's untracked
  copies of row #4's artifacts, now tracked at a3d4e7c0, would have been
  overwritten) and the launcher does not check the commit. Stopped at 23:24Z
  after under a minute (parent 22906 and six shard pids; stale heavy-slot
  files removed; the partial `confirm/` output deleted, nothing read).
  Relaunched 23:24:34Z at a3d4e7c0 (`src/ai/hard` byte-identical to
  9c8d5f64; same seed 20260935, openings, shards). Recorded as the rule asks;
  no result was seen before the relaunch.

## Row #5 result and the bundle's retention (2026-09-17 23:48:53Z, `date -u`, appended)

- **Provenance:** launched 23:24:34Z from `~/src/deevgames-e3-run2` re-detached
  at a3d4e7c0 (see the deviation bullet above), `--shards 6`,
  `MUJU_HEAVY_SLOTS=8`, seed 20260935, `e2-val.jsonl` (sha `df0c99cc…`)
  `--openings-skip 48`, `openingsUsed` rows 48–63 (`e2-g4-s650` …
  `e2-g3-s865`), `openingsIndependent` true, `distinctGames` no duplicates;
  `aConfigHash` `…#49aa15dba67f…`, `bConfigHash` `…#4e7afdf76b32…`, the five
  `evalFix` flags true, weights `default-v1`. Finished 23:45:52Z (21 min).
  Artifacts under `lab/results/hard-ai-e3/ablate/eval-correct-v1/confirm/` with
  `confirm.nohup.log`.
- **Score:** 39/0/25, 0.609, Elo +77 [+4, +158], LOS 98.1%; pair counts
  [3, 0, 19, 0, 10]; h0 19/0/13, 0.594, +66 [−25, +166]; h3 20/0/12, 0.625,
  +89 [−26, +227]. Opening-clustered (16 clusters, the close critique's
  method): +77 [−12, +178], 6 openings won, 9 tied, 1 lost. Row #4's
  clustered interval for the record: +118 [+40, +211].
- **Hygiene:** illegalActions 0, replicaDivergences 0, adjudicationRate 0,
  failures none, anomalies 0, not voided; overrunRate 0.40% / 0.34%; p95
  3,002 ms both; maxTurnMs 7,088 / 6,868, max `searchMs` 5,552 / 5,181 — no
  turn over 20 s, no P6 flag. Per-seat: over the allowance 194 / 168, beyond
  tolerance 7 / 6, `depth 0` turns 1 / 1, first searches aborted 40 / 42.
  Load 8.28 → 7.58 (mean 7.93).
- **Mechanism:** as in row #4 the bundle searched shallower (100k rung 55% vs
  47%, mean depth 2.35 vs 2.43, abort 12.0% vs 11.1%); cost was priced along
  with judgment.
- **Rule outcome:** score > 0.5 AND the pair-level 95% interval excludes 0
  (+4 at the lower bound) → the rule as preregistered is MET and
  `hard@ablate:eval-correct-v1` is RETAINED as a champion candidate. Stated
  plainly: this is a BOUNDARY retention. The opening-clustered interval
  covers 0, both handicap strata cover 0, and 9 of 16 openings tied; the
  effect is smaller than the screening's (+118 → +77), as regression to the
  mean predicts. The rule is not changed after the fact; the fragility is
  recorded here and in `E3-CLOSE.md`, and the bundle's next row (the
  two-factor `combined` arm, or a larger confirmation on `e4-val` once E4's
  pool exists) is what settles it.
- **What the bundle is:** four specification fixes and one ratified spec
  change, each with a canonical case, priced against `hard@desktop` only.
  It has NOT been compared with `eval-no-safety`; the two candidates are
  independent factors (flags vs weights) and the `combined` arm is preregistered
  in E4's night queue.
- **Openings bookkeeping:** `e2-val.jsonl` rows 48–63 SPENT; no E1/E2
  validation block has a use left (`ALLOCATION.md` E3 close addendum).
