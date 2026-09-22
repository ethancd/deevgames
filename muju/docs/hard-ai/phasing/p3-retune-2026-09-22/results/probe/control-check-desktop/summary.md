# Ladder: hard@desktop vs Rush

- status: **complete**
- work: `fixed:60000`, handicaps: `0`, seed: 20260970, shards: 1
- openings: used 1 of 48 — p1-g6-s2 (sha256 a58ca9d8aad3)
- openingsIndependent: true
- distinctGames: A-white 1, B-white 1 of 1 pair(s) (digested from the replays)
- pairs: 1/1, games: 2/2 (missing 0, failed 0)
- A record (W/D/L): 0/0/2
- adjudicationRate: 0.00%
- illegalActions: 0, replicaDivergences: 0, timingAnomalies: 0
- engine fallbacks (Gate 0 item 6, must be 0): 0 total
  - packError 0, engineError 0, divergence 0, invalidSuffix 0, emptyPlan 0, workerError 0
- bothSeatsPlayed: true, seatMirrored: true
- Elo (A vs B): -102.1 [-1199.8, 1199.8], LOS 35.1%, n = 1 pairs / 2 games **(degenerate sample, regularized - descriptive only)**
- SPRT: not requested
- SPRT (sequential): not requested
- meanTurnMs: a=1194.2 b=13.3
- loadAvgMean (1-min, per game, start and end): 9.32

## Per-engine turn timing (AMENDMENTS-DECIDED A4)

Allowance: none (fixed work has no clock).
Tolerance: max(10ms,1%), frozen (AMENDMENTS-DECIDED A14). overAllowance counts any ms past the allowance; overruns counts the turns past the tolerance; overrunRate = overruns / turns, and above 5% for either arm the row is VOID (AMENDMENTS-DECIDED A14).

| engine | turns | p95TurnMs | maxTurnMs | overAllowance | overruns | overrunRate | budgetExhausted | reSearches |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| hard@desktop | 71 | 1635 | 1713 | 0 | 0 | n/a | 0 | 0 |
| Rush | 72 | 31 | 35 | 0 | 0 | n/a | n/a | n/a |

## How the search stopped (AMENDMENTS-DECIDED A16)

abortedSearches: searches the engine abandoned on its watchdog rather than on its work rung — under A11 that watchdog is the turn's remaining allowance, so this counts the moves the CLOCK chose. abortRate = abortedSearches / searches. firstSearchAborted: games whose FIRST search was one of them (the cold profile, still INITIAL_UNITS_PER_MS, has measured nothing yet). emptyPlans: searches that returned no actions, where the adapter ends the phase through phaseEndAction (A10). Counted PER SEAT since E1.5 (PlayerGameStats.hardTiming), so a Hard-vs-Hard row attributes them per arm; older records fall back to the process-wide counters, which only a run with one hard@ arm can own. n/a means neither source says anything about this arm — never that the count was zero.

| engine | searches | abortedSearches | abortRate | firstSearchAborted | emptyPlans |
| --- | --- | --- | --- | --- | --- |
| hard@desktop | 71 | 0 | 0.00% | 0 | 0 |
| Rush | n/a | n/a | n/a | n/a | n/a |

## Per-handicap strata

| handicap | pairs | games | score (A) | W/D/L | Elo |
| --- | --- | --- | --- | --- | --- |
| 0 | 1/1 | 2 | 0.000 | 0/0/2 | -102.1 |
