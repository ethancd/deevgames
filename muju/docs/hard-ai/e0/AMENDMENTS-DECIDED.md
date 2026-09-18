# Amendment decisions A1-A15 (recorded 2026-09-16 at d460b445)

Every entry below closes the matching proposal in `AMENDMENTS-PENDING.md`.
That file keeps the original bar, the observation and the options for the
record; this one records the decision, the reason and what changes.

Authority: Ethan delegated these decisions on 2026-09-16 ("I want to make zero
decisions, use your engineering and design judgment to make reasonable
choices"). Decisions were taken by Claude (Fable 5.1) under that delegation and
are reversible by Ethan at any time by editing this file; a reversal
re-opens the entry and any row measured under it.

A decision changes MILESTONES.md's bars only as written here. Implementers may
cite an entry but may not reinterpret it; a verifier finding of a criterion
applied differently from this file fails the slice.

| # | Decision | Effect on code / process |
| --- | --- | --- |
| A1 | Option (a): phone strength is a NON-INFERIORITY test, `--sprt -25,0,0.05,0.05` (H0: 25 Elo weaker than shipped Medium; H1: equal). Margin fixed now, before any phone game. | M19 phone row uses this spec; `validateSprtParams` keeps refusing `0,0`. |
| A2 | `--shards 2` on every campaign command; budgets restated as M19 ≈ 18-30 h, M20 ≈ 6-12 days, split across sessions on resumable pair records. | Schedule only. The two-slot heavy queue is the physical cap. |
| A3 | `hard@ship` resolves to the frozen E6.1 candidate (config, weights, WASM hash in the manifest). Until E6.1 freezes it, every row uses `hard@desktop` and is DIAGNOSTIC, never release evidence. | `hard@ship` keeps throwing until E6.1 registers it. |
| A4 | `p95TurnMs` = 95th percentile over every turn of the `hard@` seat of total per-turn wall clock (packing, tables, re-search, fallback included), on the named device. `seatMirrored` = option (a): every pair the run PLAYED finished in both orientations with no failure rows; schedule completeness stays `pairsCompleted`/`missingGames`. Desktop gets its own gate row: `desktop.p95TurnMs <= 6000`. | Already implemented; M19 gains the desktop p95 clause. |
| A5 | Option (i): the RELEASE row funds BOTH arms at the shipped browser allowance, `wall:8000`, because that is the opponent players meet. `wall:3000` stays the DEVELOPMENT budget for E1-E4 iteration (faster games, same engine). The EPIC-PLAN "3 s" release ambition is superseded by "equal time at the shipped allowance". | E6.2 desktop row: `--work wall:8000`. E1 lane verifies HardEngine honours 8,000 ms above the DESKTOP `maxMs` 6000 clamp when the adapter passes an explicit target (A11's deadline option must not clamp). |
| A6 | Accepted as proposed: `--all` = tactics, spawn-strike, home-mate, invariants, plus economy and home-force once they exist; `score = passed / cases` (`homeMate` stays the count 56); baselines from M14-suite.json (tactics .918, spawnStrike .95, homeMate 56, invariantsEval .60); suite file hashes recorded and compared. | `suites/run.ts --all` implemented in E6.1 prep; gate reads `score`. |
| A7 | Accepted: release rows pass `--legality strict`; diagnostic rows may stay `as-shipped`. | M19/M20 commands gain the flag. |
| A8 | The calibration row is reported SEPARATELY as diagnostic and is NOT a pass/fail clause of M19. | `calib.decision` leaves the M19 predicate. |
| A9 | Accepted: statistics unchanged; M20 labels defined when each feature lands; `--each-flag` = one SPRT per flag writing `perFlag[]`; until then M20 rows are unrunnable and no tuned weight, df-pn or search flag ships as a default. | None now. |
| A10 | Option (a): the hard adapter funds an exhausted turn's re-search with `max(1, remaining)` like the aiv2 arms, counting the overrun; the forfeit is removed. `budgetExhausted` keeps counting turns whose re-search started with under `HARD_BOT_MIN_SEARCH_MS` left, as a diagnostic, not a forfeit. | `lab/hard-ai/bots/hard.ts`; turn-allowance tests updated. |
| A11 | Option (b): `searchTurn` gains an explicit `deadlineMs` option that caps the abort watchdog WITHOUT moving the target rung; the lab adapter passes the turn's remaining allowance as the deadline; `abortFactor` remains the default when no deadline is given. This is a `src/ai/hard` change and is the only engine edit permitted before E1.1's baseline. | `src/ai/hard/engine.ts`, `bots/hard.ts`, engine tests. E1.1 and every later row run with it, so the baseline is measured at the honest allowance. |
| A12 | Accepted: no pre-E0 ladder number is comparable with a post-E0 one. Earlier artifacts are superseded; E0.1 §2's hashes separate them. The E1.1 diagnostic set and the E1 baseline are the first comparable numbers. | Schedule only. |
| A13 | Accepted: `hard@lab` and `hard@desktop` are one engine. From E1.1 on, every row names `hard@desktop`; `hard@lab` remains a resolvable alias with the same hash, and no row may present the two as different arms. | Commands and docs; no code. |
| A14 | FROZEN: overrun tolerance = `max(10 ms, 1% of the allowance)`; a turn is an overrun only beyond it. Violation handling: each run reports `overrunRate = overruns / turns` per arm; a rate above 5% for either arm VOIDS the comparison row (`decision: 'void'`, reason recorded), reported, never silently passed. | `run.ts`: `proposed` becomes `frozen`, the 5% rule is implemented, artifacts print the tolerance as frozen with this entry as the citation. |
| A15 | Option (a): a FROZEN legal-by-replay opening set is the independence source. `run.ts` keeps REFUSING an engine-vs-engine schedule with no `--openings` (opt-out `--allow-initial-only`), and additionally refuses a schedule with more pairs than openings × handicaps (opt-out `--allow-opening-reuse`); both opt-outs record `openingsIndependent: false`. Option (b), routing seeds into engine choice, is rejected: it would rest results on a sampling policy no shipped path has. | `run.ts` capacity guard; `--openings-skip`/`--openings-ids` selection so later runs do not replay earlier openings; every manifest records the openings sha256 and the ids used. |

## Two E1 decisions taken with these

- **Opening strata (E1.2).** The E0 set (`e0-openings.jsonl`, 16) is DEVELOPMENT.
  A second pool is generated at a different seed and split, in generation
  order after a seeded shuffle, into `e1-dev`, `e1-val` and `e1-sealed` files
  (target 48 / 32 / 32; if fewer distinct openings exist the split is 3:2:2 by
  count). Cross-file gameplay digests must be distinct. Development openings may
  be inspected and tuned against; validation openings drive champion/challenger
  equal-time contests in E2-E4 and are never tuned against; sealed openings are
  run only by E6.2. Frozen by sha256 in `openings/ALLOCATION.md`.
- **Preregistered baseline (E1).** 50 pairs per handicap, `hard@desktop` vs
  `aiv2-hard`, `wall:3000`, h0 and h3, `--shards 2`, `--legality strict`, no
  SPRT (fixed sample; the interval is the decision), openings drawn from the
  development pool EXCLUDING every id the pilot (2) and E1.1 (8) used. The
  canonical-initial stratum is reported separately from the pilot's pair 0 rows
  and is not re-run.

## A16. Device profile updates on deadline-cut searches (ratified 2026-09-16 after the E1 review)

- Bar: DESIGN §4.16 / `search/time.ts` said `updateProfile` is called only after a search that ran to completion.
- Observed: with A11's deadline equal to the turn allowance, a fresh `hard@desktop` (`INITIAL_UNITS_PER_MS` 200) aborts every first search on this box (~100 units/ms measured under campaign load); under the old rule the profile never corrected and every turn overran. Lane 2 adopted "update on aborted searches too" (E0.2 record addendum) as a necessary consequence of A11; the independent review flagged that it is an engine-behaviour decision outside A11's text, with a measurable effect: in E1.1 the hard seat's first turn is deadline-cut in 26 of 32 games and later turns leave roughly a third of the allowance unused because the rung oscillates between 200k and 400k units.
- Decision: RATIFIED as implemented at d3fe704a (`engine.ts` folds `work/elapsed` from every measured search, including deadline-cut ones; an external `cancel()` still updates nothing), plus a tiny-sample guard (skip the update when the search ran under 20 ms or spent under `WORK_LADDER[0] / 2` units) to bound the re-search feedback the review noted. The cold-start miscalibration itself is NOT fixed here: it is E1.4's first time-allocation hypothesis and must be priced by an equal-time contest, not patched into the baseline.
- Effect: none on bars. The E1 baseline was measured with the ratified rule and without the guard (`reSearches: 0` in E1.1, so the guard cannot have changed it); every row records `abortedSearches` from this decision on.
