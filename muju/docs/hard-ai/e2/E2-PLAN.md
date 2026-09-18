# E2 "See the important turns" — opening session plan (2026-09-16)

Epic E2 of `../EPIC-PLAN-2026-09-16.md` §4, opened on branch `claude/hard-ai-e2`
off `claude/hard-ai-e1` 7c896179 (E1 closed there; champion `hard@desktop`,
config hash `4e7afdf76b32fad…`, code includes the P6 stop-aware generation fix).
Owner decisions remain delegated ("zero decisions"); this file is the
coordinator's record of what E2 does first and why, in the order
`../e1/E1-CLOSE-CRITIQUE.md` §5 asked for.

## Why instrumentation first

E1 priced four one-factor widenings at equal time and none paid (K=96 −83,
calibration −27, reply-wide −49, action-width +95 then −5). Every analysed
loss (14/14) carries one label, `strong-candidate-misjudged`, which the
analyser cannot split into "in the list, never searched" and "searched and
mis-scored" because `RootResult` exposes no per-candidate record. So E2 does
not start with a candidate; it starts by making the engine say what it saw.

One E1 artifact already narrows the reply-node question. In the E1.3 recall
diagnostics `reply-wide` (kInterior 16 → 32) leaves `replyTop1` at exactly
base's 0.3636 while `ceilingReplyTop1` moves 0.78 → 0.87 and the instrument
does size the reply list by the arm's K (`recall/run.ts:399`). The list
changed and the reference-best reply was not in the added half. Reading: at
reply nodes the binding width is the action beam (the only arm that moved
`replyTop1` was `action-width-wide`, 0.36 → 0.44), not the candidate count.
E2.2's stage trace must confirm or refute this per position.

## Prerequisites (critique §5) → lanes

| # | Prerequisite | Lane | Deliverable |
| --- | --- | --- | --- |
| 1 | Root exposure: candidate list with scores and a searched flag | 1 (engine) | DONE 975b23bc: `searchTurn(state, {work, expose, ply1Trace})` → `candidates`, `rootTrace`, `ply1`; 957 scoped tests green, hash unchanged (`E2-LANE1-ROOT-EXPOSURE.md`) |
| 2 | Reply-node truth: per-ply trace of the generator the search consults at ply 1 | 1 (engine) + 4 (gen) | SETTLED: every ply-1 node uses `genInterior` (K=16), quiescence's narrowed copy only under a depth-1 answer (lane 1). Stage trace (lane 4, `E2.2-COVERAGE-TRACE.md`): 28/28 root targets present in the list; at reply nodes 20/21 misses are the action beam, 0 are K |
| 3 | Prover cost model / P6 priced | (deferred) | P6 fix is in the champion since 67e25d16; priced by the re-pin row (#4) |
| 4 | Champion pinned at current code | coordinator | `hard@desktop` vs `aiv2-hard` re-pin row when slots free (see schedule) |
| 5 | E2.1 multi-promotion audit | 3 (audit) | DONE 08122ebc (`E2.1-REPRESENTATION-AUDIT.md`): two promotions jointly affordable at 14/28 loss roots, 8.3% of 373 positions; generator emitted 0 multi-promotion turns; static preference for ≥2 promotions 1/31 place-only and 0/31 after the action phase; 3 exact + 1 judgment witness cases; `buildCombos` design note (`maxComboPromotions`, default 1) |
| 6 | Baseline loss analysis (0 of 47 analysed) | coordinator + 2 | running (pre-merge code, so no exposure; a `--rerun-root` pass of ~94 searches retrofits it afterwards). Exposure split on the 14 E1.1 losses DONE d3798c8c (`E2-LANE2-EXPOSED-LOSSES.md`): discarded 0, misjudged 5, divergent 9 (`candidateSource` completed-depth 14/14; the root searched its whole list every time; in 6 of 9 divergent turns the fixed 400k re-run picks the adviser's best) |
| 7 | Fresh validation pool + seed rule | 2 (measurement) | DONE 0f0293d6: `e2-val.jsonl` 64 rows, sha `df0c99cc…`, addendum + seed rule |

Lane worktrees: `~/src/deevgames-e2-lane{1,2,3,4}` on `claude/hard-ai-e2-lane<N>`,
`muju/node_modules` symlinked. File ownership is exclusive per lane (each brief
names it); the coordinator merges lanes into `claude/hard-ai-e2`.

## Running now

- **Baseline loss analysis**: `hard:analyze --run lab/results/hard-ai-e1/baseline
  --losses-only --max-turns 12 --out …/baseline/analysis-e2`, launched
  2026-09-16 22:31Z from `~/src/deevgames-e1-run` (detached at 7c896179),
  heavy slot 0, pid 11430. 47 losses; `--max-turns 12` because every E1
  first-consequential turn fell in turns 2–7 and a full-length pass costs
  ~37 s per seat turn (E1 analyses: 332 s for 9 turns). Measured pace (lane 2): ~11 min per game, so ~8.5 h; expected to finish
  ~07:00Z 2026-09-17, not the 5–6 h first estimated.
  Largest-swing turns past 12 are therefore NOT measured in this pass; the
  report must say so. The ten double-loss pairs (`scoreA = 0`):
  `g3-s45:3:11 e1-g4-s750:0:18 e1-g4-s730:0:20 e1-g5-s415:3:41 e1-g5-s975:0:46
  e1-g5-s255:0:54 e1-g5-s935:3:57 e1-g4-s50:0:68 e1-g4-s350:0:72 e1-g5-s315:3:87`.
- The second heavy slot is reserved for lane tests and short probes. No E2
  contest row starts until the analysis finishes.

## Rules E2 rows will run under (preregistered here, before any row)

- Contests are `hard@ablate:<arm>` vs `hard@desktop`, wall:3000, h0/h3,
  `--legality strict`, 2 shards, at ONE commit for both arms. Screening rows
  use `e1-val.jsonl` rows already used at most once; confirmations use the
  fresh `e2-val.jsonl` (lane 2) and never reuse a row.
- Seed rule for every E2 row: `seed = 20260900 + <row ordinal in this file's
  ledger>`; the ledger below is appended before launch, never rewritten.
- Retain only with score > 0.5 AND a 95% interval excluding 0 on the
  confirmation row; a screening row alone retains nothing. A14/A15 stand
  (tolerance frozen; 5% overrun rate voids a row; openings are the independence
  source). Any row whose max turn exceeds 20 s is reported with P6 flagged and
  its timing columns are not cited.
- Instrumentation changes (lanes 1 and 4) must leave `hard@desktop`'s config
  hash and fixed-work output byte-identical with the instrument off. A change
  that cannot is a new champion candidate and needs its own row.

## Decisions taken this session (delegated to the coordinator)

- **L2-A1 (lane 2 finding):** every accepted opening in every pool was driven
  by the `Random` bot because `generate.ts` cycles `DRIVER_BOTS` mod 5 and
  `PLY_TARGETS` mod 4 and only the Random driver's attempts survive the
  acceptance rules. Decision: pools stand as generated (independence and
  legality are unaffected; A15's independence source is the opening set, not
  the driver). The driver-diversity sentence in ALLOCATION's split rule is a
  description that does not hold and is superseded by lane 2's addendum. A
  generator fix for driver diversity is a bounded task for the next pool, not
  a change to any existing file.

## Verification state of the merged E2 head (updated as it changes)

- `npx tsc --noEmit` and `npm run hard:types`: clean after every lane merge.
- `hard:exam` at the merged head: exact 121/127, judgment 4/22. The same six
  exact failures (`authored-tactics-tactics-plugged-*`,
  `authored-spawn-strike-spawn-strike-retreat-1`) fail at the E1 close
  commit 7c896179 (118/124 there), so they pre-date E2; lane 3's three new
  exact cases pass. Not a gate; recorded so nobody reads 121/127 as an E2
  regression.
- Scoped `tests/ai/hard` + `tests/lab` at f482356b with `MUJU_HEAVY_DIR`
  isolated: 66 files, 1050 tests, all passed.
- `tests/lab` + `tests/ai/hard` scoped: green per lane; ladder-runner tests
  need `MUJU_HEAVY_DIR` pointed at a scratch dir while rows hold the real
  slots (148/148 that way). A full scoped pass on the final head is run
  before the closing critique.
- Row #2 pace: 7 games in 26 min on one shard (~3.7 min per Hard-vs-Hard
  game), so 64 games finish around 03:30Z 2026-09-17.

## Row ledger

| # | seed | arm | vs | openings | pairs | out | result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 20260901 | `hard@desktop` (re-pin) | `aiv2-hard` | `e1-baseline.jsonl`, 50 × h0/h3 | 100 | `lab/results/hard-ai-e2/repin/ladder` | queued behind the analysis |
| 2 | 20260902 | `hard@ablate:interior-place-wide` (screening) | `hard@desktop` | `e1-val.jsonl --openings-skip 16` (rows 16–31, second and last use), h0/h3 | 32 | `lab/results/hard-ai-e2/ablate/interior-place-wide/screen` | DONE 01:1xZ: 28/0/36, score 0.438, Elo −43.7 [−127.0, +34.9], LOS 13.8%, h0 15/17, h3 13/19; overrunRate 0.58%/0.73%, abortRate 11.3%/11.6%, max turn 4.3 s, not voided → **NOT retained; arm closed** |
| 3 | 20260903 | `hard@ablate:work-fit` (screening) | `hard@desktop` | `e1-val2.jsonl --openings-skip 0` (rows 0–15, second and last use), h0/h3 | 32 | `lab/results/hard-ai-e2/ablate/work-fit/screen` (worktree `~/src/deevgames-e2-run2` at 298baca2+) | CLOSED 01:3xZ WITHOUT A ROW (criterion 2 failed: lane 1's corrected probe, d1ddf814) |

- **Multi-promotion arm (lane 3 finding):** the family is absent from the
  generator AND the adviser (shared blind spot, confirmed), but the static
  signal is negative (0 of 31 comparisons after the action phase, median
  −1,156 cc). Decision: do NOT build the `maxComboPromotions` arm this session.
  It stays a registered E2.4 question with its design note; it is built only if
  a reply-search comparison (not the depth-0 evaluator that scores the
  generator's own candidates) shows the family wins somewhere.

- **Where the 14 losses now point (lanes 1+2+4 together):** the adviser's
  best turn was generated (28/28), listed and searched (14/14, nothing
  discarded); what differed is the work the seat got. Live hypothesis for the
  next candidate: the ×2 work ladder (`search/time.ts WORK_LADDER`) lands on
  200k at ~100 units/ms under a 3,000 ms allowance and leaves a third unused
  (baseline mean 1,951 ms). Lane 2 runs a work sweep (100k–800k) on the 14
  turns to find each turn's flip work; lane 1 builds `work-fit` (finer ladder,
  `time` factor, default unchanged). A row is preregistered only if the sweep
  puts most flips between 200k and 400k and the probe shows used work rising
  without the abort rate rising.
  - Sweep result (lane 2, e433e425): flip work 283k ×3, 400k ×6, 566k ×1,
    never ×4 (all four "never" are `strong-candidate-misjudged`); nothing flips
    at 100k or 200k; every played turn is reproduced at some low rung. Seat
    wall time on those turns averaged 2,323 ms; the rung it ran is not
    recorded anywhere (instrument requested from lane 1).
  - `work-fit` (lane 1, c069e94b, hash `8c73695918…`): √2 ladder, wall mode
    only; probe on 6 cases: work ×1.36 (40.5% → 53.5% of allowance), abort 0%,
    completed depth unchanged because `iterativeDeepening` refuses to start an
    iteration once used > 45% of the rung. Lane 1 is building `deep-gate`
    (predicted-cost iteration gate) and `work-fit-deep` (both); row #3 goes to
    the arm that recovers the most of the 14 flips in the wall:3000 probe.
  - Probe of four arms at wall:3000 on 20 positions (lane 1, aa44241e):
    `work-fit` rung 254k / used 60% / depth 2.80 (champion 200k / 50% / 2.80);
    `deep-gate` and `work-fit-deep` with the ratio floor at 2 spend LESS work
    (39–40%) and lose 0.3 depth. Re-probe at floors 1.3 and 1.5 (8a40cbbf):
    identical to floor 2 to the unit; measured iteration cost ratios over 126
    pairs have median 9.05 (only 6 below 2), so the floor never binds and the
    estimator (a single previous ratio, clamped at 6) is what refuses
    iterations. Gate arms stay registered, not recommended; `work-fit` alone
    is the time candidate. Exact flips 0/14 for every arm in the probe.
  - The sweep is SUSPECT: `work-sweep.ts` reused one production engine across
    all works in ascending order, so each rung searched with a TT warmed by
    the previous rungs; lane 1 reproduced a different choice at fixed 283k on
    `g4-s10_0_8-A-white` t3 from four fresh runs. Lane 2 is rerunning it with a
    fresh engine per search (and a game-warm variant). RESOLVED (222e3e8d):
    fresh and reused sweeps agree on all 84 searches, game-warm agrees on all
    42; 9 of 14 still flip at ≤ 400k (283k ×3, 400k ×6), nothing at 200k. The
    disputed position was a reconstruction mismatch on lane 1's side, so lane
    1's "0/14 flips" probe column is not trusted; its rung/work/depth columns
    stand. Note the rung labels are allowances: the 283k flip consumed 230k.
  - Per-turn instrument (lane 1, aa44241e): `HardSearchStats.rung`,
    `unitsPerMsBefore/After`; `HardSeatTiming.turnRows` per search, copied into
    `games.jsonl` by the runner. Every row from #3 on records the rung.
  - Baseline wall-time utilisation (lane 1, from artifacts): 65.0% of the
    allowance over 4,036 seat-turns at wall:3000 and 61.5% at wall:8000 — the
    signature of a multiplicative quantiser, not of a cost model.

## Row #2 preregistration (before launch)

- Arm: `interior-place-wide` = `genInterior.maxPlacePlans` 8 → 12, root untouched,
  hash `37722e1f6a93…` (`E2.3-INTERIOR-ARMS.md`). Chosen because lane 4's stage
  trace shows it recovers 7 of the 9 adviser refutations missing at the reply
  nodes of the 14 analysed losses with zero new misses, at 1.35× reply-node
  generation; its recall diagnostic is null (0 of 21 recall reply items), so the
  row is funded on the loss-corpus trace alone.
- Rejected without a row: `interior-action-wide` (recovers 0 of 9 on the losses
  and creates 6 new misses; the likely mechanism behind E1.3's action-width
  +95 → −5).
- Command: `hard:ladder --a hard@ablate:interior-place-wide --b hard@desktop
  --work wall:3000 --handicaps 0,3 --pairs 32 --openings
  lab/hard-ai/ladder/openings/e1-val.jsonl --openings-skip 16 --seed 20260902
  --legality strict --shards 1 --out lab/results/hard-ai-e2/ablate/interior-place-wide/screen`,
  from `~/src/deevgames-e2-run` (detached at the E2 head that carries the arm).
- Rule: this is a SCREENING row. It retains nothing by itself. If its score is
  > 0.5, row #3 is the confirmation on `e2-val.jsonl` rows 0–15 (seed
  20260903, 32 pairs, same arms and settings); retain only if the confirmation
  has score > 0.5 and a 95% interval excluding 0. If the screening score is
  ≤ 0.5 the arm is closed and the reading is that reply-node coverage was not
  binding — not that the setting should be wider. A14 void rule and P6 (> 20 s
  turn) flags apply.

## Row #3 preregistration (before launch)

- Arm: `work-fit` = `time.ladderStep: 'sqrt2'` (a √2 work ladder in wall mode;
  fixed-work mode untouched), hash `8c73695918…` (`E2-LANE1-WORK-FIT.md`).
  Root, generator, evaluation and search rules unchanged.
- Evidence: the fresh sweep puts 9 of 14 first-consequential flips between
  the 200k rung the seat lands on and 400k, three of them under the 283k rung
  the ×2 ladder does not offer; the baseline seat used 65% of its allowance;
  the probe shows `work-fit` raising used work 1.23× (50% → 60%) with 0%
  aborts. Rejected without a row: `deep-gate` and `work-fit-deep` (less work,
  less depth in the probe at every floor).
- Prediction, falsifiable: score > 0.5. Mechanism check inside the row: the
  per-turn instrument records `rung` and units/ms for both seats, so the
  report must show the arm's rung distribution sitting above the champion's
  and its abort rate not exceeding the champion's; if used work does not rise
  in real games the row prices nothing and is reported as such.
- Rule: SCREENING. Retains nothing alone. If score > 0.5, row #4 is the
  confirmation on `e2-val.jsonl` rows 0–15 (seed 20260904, 32 pairs); retain
  only if the confirmation has score > 0.5 and a 95% interval excluding 0.
  A14 void rule, P6 > 20 s flag apply. If score ≤ 0.5 the time thread closes
  and the four never-flipping turns become E3's opening evidence.
- Command (chained behind row 2 by `chain-row3.sh` in the session scratchpad):
  `hard:ladder --a hard@ablate:work-fit --b hard@desktop --work wall:3000
  --handicaps 0,3 --pairs 32 --openings lab/hard-ai/ladder/openings/e1-val2.jsonl
  --openings-skip 0 --seed 20260903 --legality strict --shards 1
  --out lab/results/hard-ai-e2/ablate/work-fit/screen`.

## Corrections after `E2-OPENING-CRITIQUE.md` (2026-09-17 01:1xZ, appended, nothing above rewritten)

- **B1, row 3 decision:** option (a). The launcher was stopped at 01:00Z
  before row 2 finished. Corrected counts from `sweep-fresh/sweep.json`: the
  14 turns are 12 distinct positions (`g4-s6`/`g5-s7` are two move orders to
  one position); exact stable flips at ≤ 400k are 5 of 12; exact flips under
  the 283k rung are 2; three of the nine "flips" are 300 cc tolerance flips,
  one non-monotone across rungs. The rate caveat lane 2 wrote and the
  preregistration omitted: the ladder bot funds `targetMs = allowance`, so the
  rung is `unitsPerMs × 3000`; at ≤ 94 units/ms both ladders pick 200k and
  `work-fit` is inert. Row 3 launches only if BOTH hold: (1) the 4-pair
  instrumented mini-row on development openings (`e1-dev` rows 44–47, seed 1,
  runs when row 2 frees slot 1; out `ablate/work-fit/mini-instrumented`)
  shows `work-fit`'s recorded rungs above 200k on a material share of turns
  under real row load, and (2) lane 1's re-probe on the 12 positions
  reconstructed lane 2's way shows `work-fit` reaching the adviser's key on
  at least the exact-flip positions. If either fails the arm is closed
  without a row and this is recorded here. The row report, if run, leads with
  the rung distribution, not the score.
- **B2, sequencing:** the rule "No E2 contest row starts until the analysis
  finishes" (above, written at 22:45Z) was broken by me at 23:17Z when I
  launched row 2 with the analysis at 3 of 47, and the re-pin row was moved
  behind two candidate rows. Reason at the time: slot 1 was idle for hours
  and row 2 is a screening row. That reason does not satisfy the rule, which
  existed so the first candidate would be chosen with the 47-loss histogram
  (double-loss pairs first) in hand. Recorded as a deviation; the analyser ran
  in file order, so the ten double-loss pairs are NOT first (2 of 20 done at
  13 of 47). Consequence: no confirmation row is funded until the 47-loss
  retrofit (`--rerun-root`) and a fresh sweep over all 47 losses, counted on
  distinct positions, are in the branch.
- **C3, confirmation rows:** row 2's confirmation, if its screening passes,
  is the next free ledger ordinal on `e2-val.jsonl` rows 16–31 (seed
  20260905), not rows 0–15; rows 0–15 stay with row 3's confirmation (row #4,
  seed 20260904). The row 2 preregistration text above is superseded on this
  one point.
- **C1, the judge:** every link in the chain (present 28/28, searched 14/14,
  flips) measures agreement between the production search and the same
  engine at 1,600,000 units. A flip is the 400k search agreeing with its
  deeper self; that is expected of a consistent search and is not evidence the
  move is better. Only the equal-time rows judge strength; the chain chooses
  what to price, nothing more.
- **C6, overrun metric:** lane 1's "overruns 15.6%" in the utilisation table
  counts seat-turns over 3,000 ms wall; A14's `overrunRate` (0.59% in the
  baseline) counts turns beyond the frozen tolerance. Every timing claim names
  its metric from here on.
- **C7 (for E1's record):** E1.1's `openingsIndependent: true` counted 32
  cells where 30 positions are distinct (`g4-s6`/`g5-s7`); E2.2's 28 root
  targets and E2.1's 28 loss roots are 26 distinct. Numbers in those reports
  are per game as written; the distinct-position counts are the ones to quote.
- **Verification at head 1e1689d2:** scoped `tests/ai/hard` + `tests/lab`
  with `MUJU_HEAVY_DIR` isolated: 66 files, 1053 tests, all passed.

## Closures (2026-09-17 01:3xZ)

- **Row 2 verdict:** `interior-place-wide` scored 0.438 over 32 pairs (Elo
  −43.7, interval spanning zero, LOS 13.8%); per the preregistered rule the arm
  is closed and the reading is that reply-node place-plan coverage was not
  binding for strength — recovering 7 of 9 refutations on the loss corpus did
  not translate into better root choices. The critique's C2 point stands: the
  7/9 was in-sample on the positions the setting was derived from, and recall
  out of sample was null. Artifacts in the branch under
  `lab/results/hard-ai-e2/ablate/interior-place-wide/screen`.
- **Row 3 closed without a row:** lane 1's corrected 12-position probe
  (`E2-LANE1-WORK-FIT.md` addendum, `lab/results/hard-ai-e2/probe/work-fit-12`):
  `work-fit` picks the same move as the champion on 12 of 12, reaches the
  adviser's key on 0 of 12, moves the rung on 3 of 12, buys +9.6% work at
  ~83–84 units/ms measured. A 3,000 ms allowance on this box is a ~249k-unit
  budget, which lands on 200k under both ladders; 283k needs 94+ units/ms.
  Criterion 2 of the row 3 gate fails; the arm stays registered and unpriced.
  The 4-pair instrumented mini-row still runs (development openings) to record
  real-game units/ms and rungs for both seats; it is a measurement, not a row.
- **Cross-commit byte-identity (critique C5):** `hard:cross-commit` over 24
  positions × {100k, 400k}: 48 rows identical between 7c896179 and head
  (`lab/results/hard-ai-e2/cross-commit/`). The champion's play is unchanged by
  this session's 1,260 engine lines.
- **Arm weights path checked:** `armHardConfig()` returns DESKTOP's version-0
  placeholder weights; the ladder path substitutes `DEFAULT_WEIGHTS`
  (`bots/hard.ts hardEnginePatch`), and row 2's manifest shows both seats with
  identical non-zero weights. E1's arm rows and row 2 are unaffected; only lane
  1's first probe script was (now fixed and committed as `hard:arm-probe`).

## Where E2 stands after session 1

At the 12 distinct analysed loss positions the adviser's turn was generated
(26/26), listed and searched (14/14), and the fixed-work search flips to it at
283k–400k units on 5 of 12 (exact, stable), while a 3 s turn on this box buys
~200k units and a finer ladder cannot change that. Coverage (E2's question) is
exonerated at these turns, subject to the shared-judge caveat (C1). Two
questions remain open for E2 proper and are NOT closed: (1) the 47-loss
retrofit and a fresh sweep over all baseline losses, counted on distinct
positions, may show a different picture than 12 positions from E1.1; (2) the
representation gap (multi-promotion) is real but its static signal is
negative. The evidence points the next candidate at search efficiency (E4:
iteration cost ratio median 9 per depth, so 200k units reach depth 2–3 where
the flips need what 400k buys) and evaluation (E3: the 3 distinct positions
that never flip, all `strong-candidate-misjudged`). No E2.3/E2.4 root-breadth
work is justified by this session's evidence.

## Next bounded tasks (in order)

1. When the 47-loss analysis lands (~06:30Z): the slot-0 chain runs the
   `--rerun-root` retrofit, then the re-pin row #1. Run
   `hard:analyze:work-sweep` (fresh mode) over all 47 losses and
   `hard:analyze:report`; count distinct positions; write
   `E2-BASELINE-LOSSES.md` final. Only then decide whether any E2 confirmation
   row is funded (none is today).
2. DONE 01:29Z (`E2-LANE1-WORK-FIT.md` last section): under row load the box
   delivers ~80 units/ms; the champion runs 100k on a third of turns and 200k
   on most others (mean 138k); `work-fit` +14% work but abort rate 12% → 21%.
   The product allowance (8,000 ms) buys ~640k here and reaches every sweep
   flip; wall:3000 rows are a harsher regime than the product's.
3. Open E4 with the instruments: per-depth work and node counts are in
   `rootTrace`; the first E4 question is why depth-over-depth cost is ~9× and
   what ordering/TT/quiescence change lowers it at fixed work (priced by exam
   + fixed-work depth-per-unit first, then an equal-time row).
4. Remove lane worktrees `~/src/deevgames-e2-lane{1..4}` once their branches
   are confirmed merged; keep `e2-run`/`e2-run2` until the artifacts are
   copied into the branch.

## Slot schedule

1. Now: baseline loss analysis (slot 0). Lanes use slot 1 for scoped tests.
2. After analysis: re-pin row `hard@desktop` vs `aiv2-hard`, wall:3000,
   `e1-baseline.jsonl`, 50 pairs × h0/h3, 2 shards, seed 20260901 (row #1),
   directly comparable with the E1 baseline's +203 [145, 273]. Overnight.
3. Then the first E2 candidate row, chosen from the E2.2 stage histogram.
