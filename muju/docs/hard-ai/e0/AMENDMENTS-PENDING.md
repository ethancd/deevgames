# Amendments pending owner decision (E0.6, opened at b1f3d4e, re-checked at 1e0466de) — ALL DECIDED 2026-09-16: see `AMENDMENTS-DECIDED.md`. Entries below are kept as the record of the proposals.

Format: EPIC-PLAN §7 (L503-505) — original bar, observed result, proposed new bar, reason, effect on the promise, named approver. Every entry is a proposal; none is accepted, and each bar stands as written in MILESTONES.md until Ethan decides here. NAMED APPROVER FOR EVERY ENTRY: Ethan; all PENDING. A14 and A15 come from the pilot (`E0-PILOT-REPORT.md` §6-7); the rest from `E0.6-RELEASE-CONTRACT.md`. Code lines are on 1e0466de; MILESTONES.md (L…) and DESIGN.md are unchanged since b1f3d4e.

## A1. Phone strength statistic (M19-3)

- Bar: `--sprt 0,0,0.05,0.05`, `phone.decision === 'H1'` (MILESTONES.md L361-363; DESIGN.md L1742).
- Observed: elo0 = elo1 gives t0 = t1, so the LLR is identically 0 (sprt.ts L247-248), the decision always `continue`, H1 unreachable. At 1e0466de `validateSprtParams` throws and `run.ts` refuses the row at parse time naming this entry (L203-213). No row may run under an amended bar before one is recorded here.
- Proposal, option (a), recommended: non-inferiority, margin fixed before any result, `--sprt -25,0,0.05,0.05` (H0: 25 Elo weaker than Medium; H1: equal). Option (b): superiority `--sprt 0,50,0.05,0.05`. Reason: the inherited intent (measurement-first.md L1250, "accepts H1 at elo1 = 0") reads as "not worse than Medium", which (a) states validly.
- Effect: (a) passes phone Hard up to 25 Elo below Medium; (b) demands a clear win at 1,500 ms and more pairs. Inconclusive at cap stays unshipped either way; both keep the p95 <= 3,000 ms bar.

## A2. Shard count and campaign budget

- Bar: every M18/M19/M20 command uses `--shards 12`; budgets "3-5 h at 12 shards" (L364), "1-2 days of 12-core time" (L378).
- Observed: E0.5 caps the box at two heavy processes (EPIC-PLAN L150).
- Proposal: same pairs and statistics at `--shards 2`; budgets restated (M19 about 18-30 h, M20 about 6-12 days); runs split across sessions on the resumable pair records. Reason: the cap is physical and the statistic is unaffected.
- Effect: none, schedule only.

## A3. `hard@ship` label

- Bar: M19-2 and M19-4 name the arm `hard@ship` (L361); the label throws (hard.ts L197-200).
- Proposal: `ship` resolves to the frozen E6.1 candidate (config, weights, WASM hash in the manifest); until then runs use `hard@desktop`, labelled diagnostic, never release evidence. Reason: a release row must name a frozen, reproducible candidate.
- Effect: none.

## A4. `p95TurnMs`, `seatMirrored`, desktop p95 row

- Bar: `phone.p95TurnMs <= 3000`, `desktop.seatMirrored === true` (L363); desktop p95 <= 6,000 ms (DESIGN.md L1581, no gate row).
- Observed: both metrics are implemented at 1e0466de — per-turn buckets (runner.ts L224, L257), `timing.{a,b}.p95TurnMs` (run.ts L537-546, L784-796), `seatMirrored` (run.ts L613, L811-814). Pending are the definitions and the missing desktop row, not a producer. No phone VALUE exists: no row runs on a device (E5).
- Proposal, `p95TurnMs`: 95th percentile over every turn of the `hard@` seat of total per-turn wall clock, including packing, tables, re-search and fallback (E0.2's charge policy), on the named device.
- Proposal, `seatMirrored`, option (a), implemented and recommended: every pair the run PLAYED finished in BOTH orientations with a pair row and no failure rows; schedule completeness stays separate, as `pairsCompleted`, `missingGames`, `status`. Option (b): (a) plus `missingGames === 0`, i.e. every SCHEDULED pair mirrored. Owner to pick. Reason: (b) fails by construction on a run the sequential SPRT stops early, an early stop leaving whole pairs unplayed on purpose; under (a), M19-2 adds `missingGames === 0` itself if it wants completeness.
- Proposal, desktop: add `desktop.p95TurnMs <= 6000` to M19, or record it as diagnostic.
- Effect: none; it makes the existing promise measurable.

## A5. Shipped Hard's allowance: 8,000 ms vs wall:3000

- Bar: M19-2 funds `aiv2-hard` at wall:3000 per turn (L361).
- Observed: the browser gives Hard `TURN_BUDGET_MS.hard = 8000` per turn (engine-v2.ts L39; useAI.ts L55, L124; production 0f1d5f1 identical), so the ladder opponent is weaker than the one players meet.
- Proposal, option (i), recommended: fund both arms of the release row at wall:8000, wall:3000 staying diagnostic. Option (ii): keep wall:3000 and label the claim "at equal 3 s", not "stronger than shipped Hard". Whether HardEngine honours 8,000 ms above its DESKTOP clamp (config.ts L230, maxMs 6000) is UNVERIFIED.
- Effect: (i) raises the bar; (ii) narrows the claim.

## A6. Suite set, `s.score`, `M14.baseline`, fixture pin

- Bar: `hard:suite --all`, `suites.every(s => s.score >= M14.baseline[s.name])` (L361-363).
- Observed: `--all` throws (suites/run.ts L163); no `score`; no baseline table in gates.ts; `home-force` absent; fixtures unpinned, where EPIC-PLAN L398 requires them frozen.
- Proposal: `--all` = the M14 set (tactics, spawn-strike, home-mate, invariants) plus economy and home-force once they exist; `score` = `passed / cases` (`homeMate` stays the count 56); baselines = M14-suite.json (tactics .918, spawnStrike .95, homeMate 56, invariantsEval .60); suite file hashes recorded and compared.
- Effect: none.

## A7. Legality mode on release rows

- Bar: DESIGN.md L1688 "illegalActions > 0 fails every gate (`legality: 'strict'`)"; M19/M20 commands pass no `--legality`; run.ts defaults to `as-shipped` (L246).
- Proposal: release rows add `--legality strict`; diagnostic rows may stay `as-shipped`. Reason: the veto is stated but unenforced.
- Effect: none.

## A8. Calibration clause

- Bar: `calib.decision !== 'H0'` (L363).
- Observed: `continue` (cap reached) and `void` (adjudication above 1%) both pass it.
- Proposal: report the row separately as diagnostic (EPIC-PLAN L395); if kept as a clause, `calib.decision !== 'H0' && calib.decision !== 'void'`.
- Effect: none.

## A9. M20 mechanics

- Bar: M20 rows use `hard@texel/m14/dfpn/refined/book/nobook`, `--each-flag`, `refine.perFlag` (L375-378); none resolves or is parsed.
- Proposal: statistics unchanged; labels defined when each feature lands (M18/M16/M17); `--each-flag` runs one SPRT per flag (`useLmr`, `useAspiration`, `useFutility`, `useExtensions`) and writes `perFlag[]`; until then M20 rows are unrunnable and no tuned weight, df-pn or search flag ships as a default.
- Effect: none; restates EPIC-PLAN L403-413.

## A10. Exhausted-remainder policy: hard@ forfeits where aiv2 searches

- Bar: none written. E0.2 gave `bots/hard.ts` a per-turn allowance and a floor, `HARD_BOT_MIN_SEARCH_MS = 25` (hard.ts L101): below it a stale plan returns null and the runner ends the phase.
- Observed: the aiv2 arms never forfeit — `engines.ts` floors a decision at 1 ms (L180, L248) and `useAI.ts` (L154-155) spends what is left of `remainingCPU` with no floor. On an exhausted turn the hard arm ends its phase while the aiv2 arm plays on: a difference in RESULTS, not timing.
- Proposal, option (a): fund the search with `max(1, remaining)` as the other arms do, counting the overrun. Option (b): keep the forfeit, document it, report `budgetExhausted` beside every hard@ row. Reason: a minimum-search floor is defensible per search, not between two arms of one match.
- Effect: (a) trades a small overrun for equal treatment; (b) leaves a known bias, at least measured.

## A11. abortFactor overruns the turn allowance

- Bar: a `--work wall:<ms>` rung funds one turn.
- Observed: `searchTurn` sets `deadlineMs = startedAt + abortFactor * targetMs`, `abortFactor` 3 (engine.ts L321; config.ts L264), so one search may spend 3x what it was given. E0.5 measured `hard@lab` at 1.67x/1.22x/1.03x of a `wall:1000` turn; `aiv2-hard` landed on 1.00x.
- Proposal, option (a): the adapter requests `remaining / abortFactor`, landing the deadline on the allowance but shrinking the work rung. Option (b), recommended: an explicit deadline option on `searchTurn`, capping the abort point without moving the target — a `src/ai/hard` change, hence an amendment.
- Effect: either makes a `wall:` rung mean what it says; (b) also gives E5's phone p95 a lever.

## A12. Baseline re-measurement checkpoint

- Bar: M14's and earlier hard@ rows are the baseline.
- Observed: E0.1 changed the aiv2 arms (no resignation, one engine per game per seat, seeded once); this pass changed the hard arms (real `DEFAULT_WEIGHTS` instead of M4's all-zero `placeholder-m4`, i.e. material-only evaluation). Both move results.
- Proposal: no pre-E0 ladder number is comparable with a post-E0 one. Re-measure the baseline rows before any M18/M19/M20 claim and mark earlier artifacts superseded; E0.1 §2's hashes already separate them.
- Effect: schedule only; no claim rests on two incomparable numbers.

## A13. hard@lab and hard@desktop are one engine

- Bar: M18-M20 name `hard@lab` and `hard@desktop` as two arms.
- Observed: `LAB = makeConfig(DESKTOP_SHAPE, null)` equals `DESKTOP` field for field (config.ts L275, L279); both resolve to one configuration and one hash, only the label prefix differing.
- Proposal: treat them as one arm and use one name per row, or give `LAB` its own shape if a separate lab engine is wanted.
- Effect: none; two rows stop reading as an A/B of one engine run twice.

## A14. Overrun tolerance on the turn allowance

- Bar: EPIC-PLAN §5 L362-366 — freeze the watchdog-overrun tolerance and violation handling from an initial engineering probe BEFORE the contest; a noncomparable run is invalid. No tolerance is written down.
- Observed: at 1e0466de a turn is an overrun when `ms > allowanceMs` exactly (run.ts L793). `aiv2-hard` conserves its allowance and lands 1-8 ms past it, so the pilot counted 44/44, 51/53 and 406/430 overruns for that arm (pilot §2): a count carrying no information. `hard@lab`'s overruns there are real: 4701 ms against 3,000 ms, 22 of 99 turns.
- Proposal: tolerance = `max(10 ms, 1% of the allowance)`, frozen before any campaign; a turn is an overrun only beyond it. Each run reports the tolerance, the count beyond it and the violation rate; a rate above 5% INVALIDATES that comparison row, reported, never silently passed. Reason: timer granularity leaves a millisecond-scale tail on any conserved allowance, and the counter cannot otherwise tell that from an engine ignoring its budget, which is what the bar is for.
- Landed at 055fddda, after this entry was written: the MECHANISM only. `--overrun-tolerance <ms>ms|<pct>%|max(<ms>ms,<pct>%)` parses, defaults to `max(10ms,1%)`, and `OverrunTolerance.proposed` is always true, so every artifact prints the tolerance as PROPOSED (run.ts L207-266, L354-355). `timing.overAllowance` keeps the raw count and `timing.overruns` counts turns past the tolerance (run.ts L705-713, L1076-1077). The VALUE is still this decision, and the 5% violation-rate rule above is NOT implemented.
- Effect: none. I4's bars are percentiles of measured turn time, untouched; this fixes what counts as an overrun EVENT.

## A15. Pair-independence source for engine-vs-engine runs

- Bar: none written. M19/M20 rows schedule N pairs per handicap and every statistic (pentanomial SPRT, Elo interval) treats pairs as independent draws.
- Observed (pilot P1): both engines are deterministic given position and budget, and `hard@`'s `setSeed` is a no-op (src/ai/hard/engine.ts L213-217), so without `--openings` every pair at one handicap replays the same game. Two differently seeded pilot pairs played identical games; the `Rush` control, whose RNG does take the seed, gave 8 distinct games from 8 pairs.
- Proposal, option (a), recommended: a FROZEN legal-by-replay opening set is the independence source — `lab/hard-ai/ladder/openings/e0-openings.jsonl` as the diagnostic default, its sha256 in every manifest, each release row naming its set. Option (b): route the per-pair seed into engine choice, an `src/ai/hard` change (owner decision, cf. A10, A11) whose result then rests on a sampling policy no shipped path has.
- Proposal, part two, recommended yes: `run.ts` REFUSES an engine-vs-engine run given no `--openings`, with an explicit opt-out for the single-position diagnostic; a scripted RNG opponent (Rush, Random) is exempt, its seed reaching an RNG. Reason: counting copies as independent shrinks an interval by roughly `sqrt(pairs)`. EPIC-PLAN L369-371 also wants opening reuse across runs modelled as clustering, which (a) makes possible and nothing yet does.
- Landed at 055fddda, after this entry was written: `pairIndependenceRefusal` refuses an engine-vs-engine schedule of more than one pair with no `--openings`, `--allow-initial-only` is the opt-out, and an overridden run records `openingsIndependent: false`, an `independenceWarning` line and per-orientation `distinctGames` in manifest, metrics and summary (run.ts L276-311, L856-864). The choice between (a) and (b), and whether the refusal stays the default, are still this decision.
- Effect: none on the bars; a pair count starts meaning what the statistics assume.

