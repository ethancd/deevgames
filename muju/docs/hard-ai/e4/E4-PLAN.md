# E4 "Spend time on useful replies" — opening session plan (2026-09-17 23:50:36Z)

Epic E4 of `../EPIC-PLAN-2026-09-16.md` §4, opened on branch `claude/hard-ai-e4`
off `claude/hard-ai-e3` 28d33812 (E3 closed at that commit: `E3-CLOSE.md`;
champion `hard@desktop`, config hash `4e7afdf76b32fad…`, weights `default-v1`,
unchanged since E0; champion CANDIDATE `hard@ablate:eval-no-safety`, hash
`66edf9cdf58f…`, retained under E3's confirmation rule, not shipped). Owner
decisions remain delegated; this file is the coordinator's record. It is
appended, never rewritten; every stamp is taken from `date -u`.

## Why E4 now, and what it must not assume

- E2 exonerated coverage: at the 12 distinct analysed loss positions the
  adviser's turn was generated, listed and searched. E3 priced judgment:
  removing the 19 safety weights earned +124 [+38, +229] at equal time, and no
  misconception was shown to be repaired. What is left of the E2 loss set is
  time: the champion reaches depth 2–3 at 200k units where the flips need
  400k (E2, iteration cost ratio median 9.05 per depth over 126 pairs), and the
  estimator that refuses the next iteration is a single previous ratio clamped
  at 6, not the measured cost.
- P8 (`../e3/P8-SLOW-TURNS.md`): on a home-race position with 32 bodies the
  champion spends 79 s of a fixed:100,000 search inside `injectRescue →
  homeWitness` (unmetered, at quiescence nodes) and 24.8 s at wall:3000, two
  thirds of it in the canonical `verifyTurn`/`applyAction` home adjudication
  (P7). Both seats, both arms. A wall row that reaches such a position overruns
  the allowance by 8×; the P6 flag fires and withholds timing.
- One E2 loss is a search tie, not a judgment: `g2-s20_3_15-A-white` t3, the
  adviser's and the played end states have identical 58-feature vectors and
  the played turn wins on `ORDER_TT` (a transposition-table move bonus of
  2,000,000). No search up to 800k units flips it.
- What E4 must not assume: that a chess heuristic transfers (actions share a
  turn, purchases precede attacks, a compulsory home rescue makes a quiet
  evaluation unreliable — EPIC-PLAN §4 E4); that more nodes per second is
  more useful reasoning (the exit is "more useful completed reasoning within
  the same time and memory budget", measured by completed iterations and
  opponent coverage, not peak depth or nodes/s); that a search change is
  attributable when it ships together with an evaluator change.

## Preconditions from the E3 close critique (`../e3/E3-CLOSE-CRITIQUE.md`, "What E4 must have")

1. DONE at the E3 close: the candidate's tactical regression and its M14
   gate-setting spawn-strike (.75 against `>= 0.80`) are written down as red
   obligations; the rule that non-regression bars are written before the
   suites run is in this plan's row rules.
2. PENDING Ethan: the B3 `Infiltration` definition (DESIGN §9 addendum of the
   close) ratified or rejected before "correctness" is claimed for any arm
   that carries it.
3. BEFORE either candidate is the base of an E4 arm: the `combined` two-factor
   arm and the per-weight safety rows, preregistered in E3's ledger and run in
   night windows (queue below).
4. In this plan: P8 as lane 4 (search side) and P7 as lane 6 (canonical side,
   own preregistration).
5. DONE at the E3 close: the P6 wall-clock assertions run only under
   `MUJU_WALLCLOCK_TESTS`.
6. PENDING Ethan: the A8.2 ruling on validation replays inside tuning corpora,
   before any E3.3 fit is read.
7. In this plan's rules: a golden with `--states-in` before the first row at
   any `src/ai/hard` commit; stamps to the second from `date -u`.

## Usefulness rule (preregistered)

An E4 claim that a search change "spends time better" needs, named in the
claim, at least one of:

1. Completion. Completed iterations, completed opponent replies at the root
   and at depth 1, and the share of turns whose first search aborted, on the
   same positions at the same wall allowance, before and after.
2. Attribution. A profile that assigns the turn's wall time to generation,
   tables, evaluation, reply search, quiescence, prover and canonical
   verification, on difficult AND depleted positions (the P8 set, the 47 E1
   losses, `e1-dev`), so the dominant cost is measured, not guessed.
3. Agreement. On tractable positions a full-width reference search (no
   pruning, no tables) reaches the same principal turn and score bound;
   forced home defense, upkeep and imminent draws included.
4. The equal-time row. Strength is judged only by `hard@ablate:<arm>` vs
   `hard@desktop` at wall:3000; a faster search that scores ≤ 0.5 is not
   retained however much it completes.

The champion at more work remains a locator of where the two searches
disagree; it never decides which is right (E3's C1 stands).

## Slices and lanes

| Slice | Lane | Deliverable | Owned files |
| --- | --- | --- | --- |
| E4.0 openings | 0 (coordinator) | DONE at this plan's commit: `e4-val.jsonl`, 128 rows, seed 2030, `--id-prefix e4-`, six pools (224 openings) excluded, 128 of 128 distinct h0 digests, validated at h0/h3, sha256 `5a421b92b5daf63f1ca8052a59338e09b6821e5438de46cf1f403aaffd900afa`, recorded in `ALLOCATION.md`; `e1-sealed.jsonl` untouched | `lab/hard-ai/ladder/openings/e4-val.jsonl`, `ALLOCATION.md` |
| E4.1 cost and completion profile | 1 | `hard:profile` (or `bench/probe.ts` extended): per turn, wall time by phase (generation, tables, evaluation, reply search, quiescence, prover, canonical verify), completed iterations, root and depth-1 reply coverage, abort share; run on the P8 positions, the 47 E1 losses and `e1-dev`; `E4.1-PROFILE.md` | `lab/hard-ai/bench/profile*`, `tests/lab/profile.test.ts`, `package.json` (one line), the doc, `lab/results/hard-ai-e4/profile/` |
| E4.2 search safety audit | 2 | TT state identity and bounds, terminal ordering, stand-pat and truncation behaviour, checked against a tractable full-width reference on small positions (`verify/reference.ts`), forced home defense, upkeep and imminent draws in the set; every disagreement filed with the position id, side, turn; `E4.2-SEARCH-AUDIT.md` | `lab/hard-ai/verify/reference*`, `tests/lab/reference.test.ts`, the doc, `lab/results/hard-ai-e4/audit/` |
| E4.2 leaf tie | 3 | The `ORDER_TT` tie at `g2-s20_3_15-A-white` t3: when and why identical-vector end states are ordered by the TT bonus; a tie policy proposal (deterministic, documented) as a flag, default off; descriptive fixed-work row; `E4.2-LEAF-TIE.md` | `src/ai/hard/search/order.ts` behind an optional `HardConfig.searchFix.tieBreak` key (like `evalFix`: never written by `makeConfig`, absent in every profile), the doc |
| E4.3 candidate A: rescue cap (P8) | 4 | Cap and meter `homeWitness` calls in `gen/generate.ts injectRescue` through `WorkClass.PROVER`; set `s.truncated` when the cap bites (a capped node never publishes to the TT); `p6-stoppable-generation` extended with the P8 home-race position; determinism re-pin; arm `hard@ablate:search-rescue-cap`; descriptive fixed-work row on the P8 set and on `e1-dev` | `src/ai/hard/gen/generate.ts` behind `HardConfig.searchFix.rescueCap` (absent in every profile), `lab/hard-ai/ablate/arms.ts` (one arm), the tests, `E4.3-RESCUE-CAP.md` |
| E4.3 candidate B: iteration estimator | 5 | Replace the single-previous-ratio estimator (clamped at 6) with the measured per-depth cost from this turn's own iterations, so the last iteration is funded when it fits; arm `hard@ablate:search-iter-fit`; descriptive completion evidence per the usefulness rule 1 | `src/ai/hard/search/root.ts` (`iterativeDeepening`) behind `HardConfig.searchFix.iterFit` (absent in every profile), one arm, `E4.3-ITER-FIT.md` |
| P7 canonical home verdict | 6 (gated) | A memoised canonical home verdict in `src/game/homeCheckmate.ts` is a CANONICAL engine change; it is designed (cache key, invalidation, parity tests via `hard:perft`/`hard:fuzz`) and priced in this lane, NOT merged into E4's engine rows; a separate preregistration names it | `docs/hard-ai/e4/P7-HOME-VERDICT-DESIGN.md` only |
| E3 follow-on arms | 7 | `lab/hard-ai/ablate/arms.ts`: the two-factor `combined` arm (`weights` = `default-v1-no-safety` AND `evalFix` = the five flags; `factorsOf` reports both) and the 19 `eval-no-safety-keep-<index>` arms (one zeroed weight restored each, index in `eval-groups.ts` order); tests; a chain script for the night queue that waits for a free heavy slot and stops launching at 13:30Z; no row launched by the lane | `lab/hard-ai/ablate/arms.ts`, `tests/lab/ablate.test.ts`, `docs/hard-ai/e4/E3-FOLLOWON-ARMS.md`, `lab/hard-ai/ablate/chain-followon.sh` |

Lane worktrees are `~/src/deevgames-e4-lane<N>` on `claude/hard-ai-e4-lane<N>`,
branched from this plan's commit, `muju/node_modules` symlinked. A lane
commits only its owned files; the coordinator merges. A lane that needs a file
it does not own writes `docs/hard-ai/e4/amendments/lane<N>.md` and stops.

## Rules every lane runs under

- `hard@desktop`'s config hash and its fixed-work golden (`hard:cross-commit`,
  24 positions × {100k, 400k}, compared on `scoreCc`, `depth`, `work`,
  `nodes`, `endKey`, `source`) stay identical after every merge. Every
  `src/ai/hard` change sits behind an optional `HardConfig.searchFix` key
  that `makeConfig` never writes (the `evalFix` pattern), absent in every
  profile; the champion is byte-for-byte untouched by default.
- A candidate that changes fixed-work output when ON (lanes 4, 5) records a
  determinism re-pin for its arm and states it in the report; it never touches
  the champion's pin.
- E4 rows run search arms on the CHAMPION's evaluator (`default-v1`), so the
  search effect is attributable. Pricing a search change on top of
  `eval-no-safety` is a two-factor `combined` arm with its own
  preregistration, after the single-factor row.
- Lab scripts constructing an engine go through `hardEnginePatch`/
  `createHardBot` or assert `weights.version !== 0`; instruments that score
  positions take the engine's weights AND `evalFix`.
- No fixture is repaired because the engine disagrees with it.
- Heavy work: one row at a time; 9am–6pm CDT tidy (≤ 3 engine cores), 6pm–9am
  hard (fixed-work up to 12 shards, wall rows at 8, `MUJU_HEAVY_SLOTS` 10);
  the heavy queue gives up after 30 min, so chains wait for a free slot
  themselves. Kill a row by parent AND shard pids. Never `--shards` above 12.
- Documents: plain prose, one fact per line, every number with its sample and
  its judge, every position with its file id, side and turn. Preregister
  before launch; append, never rewrite; stamps from `date -u`.
- Workflow scripts: literal `model:` on every `agent()`, a `// Fable
  rationale:` comment for Fable calls, agent counts per model stated up front.
- Commits use `git -c core.hooksPath=/dev/null commit` with the session's
  attribution lines; `origin/master` is merged at the E4 close.

## Rules E4 rows will run under (preregistered before any row)

- Contests are `hard@ablate:<arm>` vs `hard@desktop`, wall:3000, h0/h3,
  `--legality strict`, at ONE commit for both arms, per-game load recorded.
- Seed rule: `seed = 20260940 + <row ordinal in this ledger>`.
- Openings. `e4-val.jsonl` is cut into eight 16-row blocks, one use each:
  screening blocks S1–S4 = rows 0–15, 16–31, 32–47, 48–63; confirmation
  blocks C1–C4 = rows 64–79, 80–95, 96–111, 112–127. Assignment, fixed now:
  S1/C1 the E3 follow-on `combined` arm (E3 ledger); S2/C2 E4.3 candidate A
  (rescue cap); S3/C3 E4.3 candidate B (iteration estimator); S4/C4 spare
  (a sub-block that reproduces the safety effect, a third candidate, or a
  larger confirmation for a boundary retention — assigned by a dated bullet
  before use). `e2-val.jsonl` rows 0–31 stay reserved to E2; `e1-sealed.jsonl`
  stays untouched until E6. Development rows (`e0-openings`, `e1-dev`, the
  P8 set) carry descriptive rows only.
- Retain only with score > 0.5 AND a 95% interval excluding 0 on the
  confirmation row; a screening row alone retains nothing. A14 (frozen
  tolerance, 5% overrun voids), A15 (openings are the independence source),
  the P6 flag (any turn > 20 s withholds the timing columns; a row is voided
  only by A14) stand. Every E4 row's report leads with the completion and
  attribution evidence (usefulness rules 1–2), then the score, and carries
  `maxTurnMs`, the abort share and the completed-iteration distribution for
  both seats.
- Tactical non-regression for a search arm before its confirmation is funded:
  tactics ≥ 73/79, home-mate 56/56, spawn-strike within one of 16/20, exam
  exact at 200k within three of 120/127 (the E3 thresholds, unchanged).
- A failed improvement is reverted, not stacked (EPIC-PLAN E4.3).

## Row ledger

| # | seed | arm | vs | openings | pairs | out | result |
| --- | --- | --- | --- | --- | --- | --- | --- |

## E3 follow-on rows queued for night windows (not E4 rows; E3's ledger continues)

- The two-factor `combined` arm (`eval-no-safety` weights + `eval-correct-v1`
  flags) vs `hard@desktop`: E3 ledger ordinal 6, seed 20260936, screening on
  `e4-val` S1 (rows 0–15), confirmation ordinal 7, seed 20260937, on C1 (rows
  64–79); retain only by E3's rule. Both candidates are retained singly at
  the E3 close (the bundle at the boundary), so `combined` is the row that
  says whether the two effects add. Same tactical thresholds, measured for
  `combined` before its confirmation is funded.
- Per-weight safety rows: which of the 19 zeroed weights carry the +124; one
  weight RESTORED per arm (`eval-no-safety-keep-<index>`, 19 arms), fixed
  100,000 descriptive, 8 pairs on the first four `e1-dev` openings, h0/h3,
  vs `hard@desktop`; no ledger entry; a sub-block that reproduces the
  bundle's fixed-work effect earns a screening row on S4. The arm that wins
  `spawn-strike-purchase-1` back at M14's setting is reported by name
  (A-E3-8).
- Both queues run from a detached run worktree at the E4 plan commit or a
  descendant with `src/ai/hard` identical, after the arms land (lane 7), in
  the night window, one row at a time; the chain stops launching at 13:30Z.

## Slot schedule

- Lanes 1–3 and 6 run no heavy row (profiles and audits are single-process,
  under five minutes per invocation, `--no-heavy`).
- Lanes 4 and 5 queue their descriptive rows in the night window after the
  E3 follow-on rows; the coordinator preregisters and launches every ledger
  row.

## E3 follow-on, phase 1 read (2026-09-18 00:11:24Z, `date -u`, appended)

- Lane 7 merged at a6bc1b93 (arms only; `src/ai/hard` untouched, champion
  hash unchanged, `combined` hash `41292acd…`). Harness `WinType` gained
  `abandoned` at 0abec613 (`hard:types` had been red since the master merge
  at the E3 close; the E3 close verification ran vitest and not `hard:types`
  — recorded as a miss). Run worktree `~/src/deevgames-e4-run` detached at
  0abec613.
- `chain-followon.sh` launched 00:04:20Z from the run worktree; phase 1 (19
  spawn-strike suites at M14's gate work, fixed 400,000, desktop profile)
  finished 00:10:40Z; the chain was then STOPPED before phase 2 so its
  8-shard rows would not hold every heavy slot while lanes 3, 4 and 5 run
  their single descriptive rows (the queue gives up after 30 min). Phase 2
  is relaunched after those rows, still inside the night window.
- **A-E3-8 answered.** Artifacts
  `lab/results/hard-ai-e3/correct/thresholds/spawn-strike-400k-keep-<i>.json`.
  Restoring ONE zeroed weight wins `spawn-strike-purchase-1` back (16/20 =
  the champion, no other case moves) for exactly three of the nineteen:
  F35 `AnchorFragility`, F36 `BlockingDeficit`, F43 `Inv6FragileAnchor` — all
  three describe the defender's spawn-anchor geometry, which is what
  `purchase-1` tests. The other sixteen stay at 15/20 with the identical
  failure set. So the M14 veto on `eval-no-safety` is lifted by keeping the
  anchor-safety sub-block (3 weights) and zeroing the other 16.
- Next arm from this: `hard@ablate:eval-no-safety-keep-anchor` (F35, F36,
  F43 at `default-v1`, the other 16 at 0; factor `weights`), requested from
  lane 7. It is priced first at fixed 100,000 on the four `e1-dev` openings
  (descriptive, alongside the 19 singles in phase 2), then, if it holds the
  bundle-level effect (≥ the 0.875 the full block showed at fixed work,
  within noise), by a screening row on `e4-val` S4 (rows 48–63, E3 ledger
  ordinal 8, seed 20260938) and a confirmation on C4 (ordinal 9, seed
  20260939). That would make it the candidate that carries no tactical
  regression, which is what E4's search rows should be based on if it
  retains.
- **keep-anchor is NOT the answer (00:17:55Z):** lane 7's
  `hard@ablate:eval-no-safety-keep-anchor` (F35, F36, F43 restored together,
  hash `5447c574…`) scores 15/20 at the gate work, reproduced twice — the
  same failure set as the full ablation. Each of the three restored ALONE
  wins `purchase-1`; all three together lose it again. The effect is
  non-additive (the restored terms change the generator's ordering and
  K-cut, not only the leaf score), so the sub-block is not the arm. The
  candidate that lifts the veto is one of the three single-weight arms
  (`keep-35`, `keep-36`, `keep-43`), chosen by phase 2's fixed-work rows: the
  one that keeps the most of the block's strength goes to `e4-val` S4 / C4
  (E3 ledger ordinals 8/9, seeds 20260938/20260939). The plan's previous
  bullet is superseded on that point; the keep-anchor row stays in phase 2
  as a descriptive control.

## Lane reads and merges (2026-09-18, `date -u`, appended as they land)

- **00:32:35Z — lanes 6 and 3 merged** (64332489, 38369264). After lane 3
  (`src/ai/hard` touched: `config.ts` optional `searchFix.tieBreak`,
  `order.ts`, `root.ts`, all flag-gated) the champion hash is unchanged and
  the golden at the merged head is 48 of 48 identical to
  `rows-head-c73204dd.json`.
- **Lane 6 (P7 design, `P7-HOME-VERDICT-DESIGN.md`):** on the P8 turn the
  entire 12.8 s of canonical `applyAction` time is four exhausted
  20,000-node home proofs returning `unknown` (3.1–3.4 s each); ordinary
  turns pay 0.0078 ms per action. A memo keyed on the fields the prover
  reads (408 single-field perturbations, none moves a verdict without
  moving the key) removes the structural duplicate and the harness's
  re-application: seat canonical spend 41.1 s → ~22.2 s on that turn; the
  rest is the search-side prover (lane 4). Own preregistration; not in
  E4's rows.
- **Lane 3 (`E4.2-LEAF-TIE.md`), decision under delegation:** the tie is
  real (`pvs.ts:687` strict `>` latches the first equal-scoring candidate,
  `ORDER_TT` re-serves it every later iteration) and it is NOT why
  `g2-s20_3_15-A-white` t3 never plays the adviser's turn (refuted at depth
  2, 1,002 vs 1,020 cc; at depths 1 and 3 tied but neither first nor lowest
  by key). The ordering-form arm `hard@ablate:search-tie-break` flips
  nothing at 100k–400k and scores 5/0/11, −137 [−309, −14] at fixed work on
  `e1-dev` → CLOSED, no screening block. The proposed one-line non-strict
  comparison (`amendments/lane3.md`) is NOT taken now: it changes selection
  on every equal-score tie with no evidence it earns strength, and E4.3
  funds one measured improvement, which is candidate A or B. It stays on
  file as a future flag. The E2 "never flips" position is a judgment case
  after all, returned to E3's follow-on queue.
- **00:35:58Z — lane 1 merged** (`hard:profile`, `E4.1-PROFILE.md`; no
  `src/ai/hard` change). Dominant costs, by class of position: on P8's
  home-race positions the tactics prover (`damageBoundCore`/`act`,
  `tactics/prover.ts`) is 93.7% of profiled time (189.6 s over 4
  positions at fixed 100k) while the meter's `PROVER` class prices it at
  about 1.3% of the rung — the two-orders-of-magnitude gap P6/P8 named,
  measured independently; on ORDINARY positions (12 E1.1 losses, 16
  `e1-dev` turn-6 positions, at 100k, 400k and wall:3000) movement BFS
  (`bfsFrom`/`bfsMulti`, `core/movement.ts`, resolved to the tables phase)
  is 71–76% of wall time at every budget; the canonical `enoughPossibleDamage`
  (P7) is 14.4 s summed over P8 at wall:3000. Depth-1 replies SEARCHED (vs
  generated) has no hook (`amendments/lane1.md`; a proxy is reported).
  Consequence for E4.3: candidate A (rescue cap) addresses the P8 class
  only; the ordinary-position cost is movement BFS, which no current
  candidate touches — registered as candidate C (a memoised or incremental
  reach table behind `searchFix.reachCache`, byte-identical output by
  construction) for a lane if A or B fails, priced on the spare block S4/C4
  only if the keep-single-weight arm does not need it.
- **00:38:56Z — lane 2 merged** (`hard:reference`, `E4.2-SEARCH-AUDIT.md`; no
  `src/ai/hard` change). Full-width reference (no pruning, tables,
  ordering or truncation; same generator, evaluator, terminals, full prover)
  against production at the cheapest rung that completes the reference
  depth, 36 positions at depth 2: 10 agree, 14 must-answer (14/14 agree on
  mate score and turn), 6 depth-mismatch (agree on score and turn), 5
  stand-pat artifacts, 1 TT-identity disagreement; principal turns 30/36;
  1,174 TT stores logged with 0 stores while truncated, 0 bound
  contradictions, 0 bucket false hits; 0 key collisions.
  - **F1, BUG (search):** the R5 quiescence cap's threshold is proportional
    to `meter.limit`, so a node's value at fixed depth depends on the rung
    (`draw-fuzz-5150-1394-24` depth-1 +3,411 at 12k vs +1,694 at 50k), and
    the capped stand-pat is published as EXACT because nothing marks the
    node truncated; 6 of 36 rows are cap-sensitive. Fix for a later lane
    behind `searchFix.capExact` (mark capped nodes truncated at the store,
    not by latching `s.truncated`); it is a correctness change and a
    candidate for its own descriptive row, not E4.3's improvement.
  - **F2, BUG CANDIDATE:** TT on vs off is not value-preserving at fixed
    work and equal depth (`upkeep-loss-g2-s5_0_2-A-white-t4`: +599 vs
    +1,060 vs reference +389). Needs the same fixed-depth identity test M14
    runs, extended to fixed work; flagged, unresolved.
  - F3–F5 identity gaps (window-dependent quiescence by design;
    `progressThisTurn` in neither Zobrist key; 15 unverified `kposLo` bits,
    49-bit effective key); F6–F8 clean (truncation guard, terminal ordering,
    generator). All carried into the E4 close's red obligations.
- **00:45:05Z — lane 5 merged** (`searchFix.iterFit`, `E4.3-ITER-FIT.md`;
  `src/ai/hard` touched: `config.ts`, `search/pvs.ts` (`iterativeDeepening`
  lives there, not in `root.ts` — the lanes table was wrong, recorded in
  `amendments/lane5.md`), `engine.ts` one flag-gated line). The two lanes'
  `SearchFix` declarations and `searchFixKey` were unified at the merge (one
  interface with `tieBreak` and `iterFit`; one key function). Champion hash
  unchanged; golden at the merged head 48 of 48 identical; `tests/lab/ablate`
  58/58; `tsc` and `hard:types` clean.
- **Lane 5 (candidate B), decision under delegation: CLOSED without a
  screening row.** Usefulness rule 1 (completion) is not met: on 20 `e1-dev`
  turn-6 positions at wall:3000 the arm completes the same number of
  iterations on 17 of 17 equal-rung positions (2.47 each), spending +11%
  work and changing the principal turn on 4 of 20 with no evidence either
  way; the 16-game wall row is 7/0/9, −44 [−210, +104]. A time-allocation
  change that buys no iterations at this box's rungs has nothing for an
  equal-time row to price; the 8,000 ms product allowance is where it might
  (E2's mini-row: ~640k reaches every sweep flip), and that is E6's row, not
  E4.3's. The flag stays on file, default absent. Block S3/C3 is released
  to candidate C or the keep-single-weight arm.
- **01:35:02Z — lane 8 merged** (`searchFix.reachCache`, `E4.3-REACH-CACHE.md`;
  `src/ai/hard` touched: `core/movement.ts` memo behind the flag, one
  optional parameter through `config.ts`, `engine.ts`, `tables/context.ts`,
  `core/state.ts`, `eval/evaluate.ts`). Champion hash unchanged; golden at
  the merged head 48 of 48; the ARM's own golden on the frozen states is
  also 48 of 48 identical to the champion's (output identity by
  construction); `tsc` and `hard:types` clean.
- **Correction to the lane 1 read above:** `E4.1-PROFILE.md`'s 71–76% is the
  whole `tables` bucket (ancestor-resolved), not `bfsFrom`/`bfsMulti`;
  `movement.ts` is ~2.3 s of a 20.2 s ordinary turn at 100k (about a tenth).
  The "dominant ordinary cost" claim is withdrawn to that extent; the
  tables bucket's remaining nine tenths are unattributed at function level
  and go to the E4 close as an open item.
- **Lane 8 (candidate C), decision under delegation: CLOSED without a
  screening row; kept as a free speed-up.** Hit rate on the residual BFS
  calls 49.4% (2^16 tables answer 43.4%); speed-up median 1.03× on `e1-dev`
  and 1.09–1.21× on the E1.1 loss positions; at wall:3000 one extra completed
  iteration on 1 of 28 positions; wall row 8/0/8, 0 [−85, +85]. A 3% saving
  cannot buy an iteration at 9× per depth, so no equal-time prediction > 0.5
  can be preregistered honestly. Because it is output-identical, it can be
  turned on by default at E6 with the identity proof and no strength row
  (the profile hash moves, the play does not); recommended there. Block
  S3/C3 stays released.

## E3 follow-on ledger (rows that continue E3's ledger; E3's branch is closed, so the rows are recorded here)

| # | seed | arm | vs | openings | pairs | out | result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 6 | 20260936 | `hard@ablate:combined` (screening; weights `default-v1-no-safety` + the five `evalFix` flags, hash `41292acd…`) | `hard@desktop` | `e4-val.jsonl --openings-skip 0` (S1, rows 0–15, only use), h0/h3 | 32 | `lab/results/hard-ai-e3/ablate/combined/screen` | preregistered 02:22:18Z; launches in the night window at 4 shards, heavy slots 8, after lane 4's descriptive row, from `~/src/deevgames-e4-run` at bc5532ee (`src/ai/hard` flag-absent behaviour identical to the E3 rows: golden 48/48) |

- **Row #6 preregistration (02:22:18Z, `date -u`):** wall:3000, h0/h3, `--legality
  strict`, 32 pairs, seed 20260936, `--shards 4`, `MUJU_HEAVY_SLOTS=8`.
  Prediction, falsifiable: score > 0.5 (both factors retained singly:
  weights +124 [+38, +229], flags +77 [+4, +158]; if they add, the point
  estimate is above either). Falsified if ≤ 0.5: the two effects do not
  add and the candidates stay separate. Rule: SCREENING, retains nothing;
  if > 0.5, row #7 (confirmation, ordinal 7, seed 20260937) on C1 (rows
  64–79), retain only with score > 0.5 and the pair-level interval excluding
  0, the opening-clustered interval reported beside it; tactical thresholds
  (tactics ≥ 73/79, home-mate 56/56, spawn-strike within one of 16/20, exam
  200k within three of 120/127, plus M14's gate-setting spawn-strike) measured
  for `combined` BEFORE the confirmation is funded. A14, A15, the P6 flag
  rule, per-seat overrun and depth-0 counts, and the mechanism check apply.
  The row's report leads with the two factors and what each contributed in
  its own rows, then the score.
- Compute note (02:22:18Z): while the phase-2 chain runs at 4 shards the box
  shows ~6 of 12 cores busy, each shard at ~60% CPU (not 100%); the cause is
  not known (canonical replay/IO between searches, or P/E-core scheduling)
  and is filed for the E4 close as a responsiveness observation.
- **02:43:37Z — lane 4 merged** (`searchFix.rescueCap`, `E4.3-RESCUE-CAP.md`;
  `gen/generate.ts`, `engine.ts`, `pvs.ts` flag-gated; `SearchFix` now
  carries `tieBreak`, `iterFit`, `reachCache`, `rescueCap`). Champion hash
  unchanged; golden at the merged head 48 of 48.
- **Lane 4 (candidate A), decision under delegation: CLOSED without a
  screening row; kept as a fixed-work responsiveness fix.** The cap (8
  `homeWitness` calls per `searchTurn`, PROVER-charged, refusal marks the
  node truncated) cuts the injection case 105 s → 44 s at fixed 100k and the
  worst `e1-dev` turn 35.1 s → 18.6 s (P6 flag turns 1 → 0), with 8/0/8 at
  fixed work. Correction to P8 §6: the 2,641 s tail is NOT the injection — it
  is 4,432 full-prover calls through `Replica.make → provesHomeCheckmate`
  (P6's original mechanism, counted, unpriced), untouched by the cap; and at
  wall:3000 the cap is inert because P6's sink already cuts generation. So
  there is no equal-time strength prediction to preregister. The remaining
  tail is P7 (lane 6's memo) plus pricing the replica prover — both E5/E6
  responsiveness work, filed as red obligations.
- **E4.3 verdict:** three candidates measured (A rescue cap, B iteration
  estimator, C reach memo) plus the tie-break arm; NONE earns an equal-time
  strength prediction, so no screening block is spent and nothing is
  retained under E4.3. E4.1 (profile) and E4.2 (reference-search audit, two
  defects) are delivered. The release (`../RELEASE-2026-09-18.md`) ships
  the champion with every flag absent.
