# Ladder: hard@desktop vs Rush

- status: **complete**
- work: `wall:1500`, handicaps: `0`, seed: 33, shards: 8
- openings: used 16 of 48 — p1-g6-s2, p1-g5-s85, p1-g6-s310, p1-g5-s17, p1-g4-s420, p1-g7-s75, p1-g5-s135, p1-g8-s15, p1-g3-s4, p1-g7-s46, p1-g4-s72, p1-g6-s5, p1-g3-s570, p1-g4-s280, p1-g7-s155, p1-g5-s485 (sha256 a58ca9d8aad3)
- openingsIndependent: true
- distinctGames: A-white 16, B-white 16 of 16 pair(s) (digested from the replays)
- pairs: 16/16, games: 32/32 (missing 0, failed 0)
- A record (W/D/L): 12/0/20
- adjudicationRate: 0.00%
- **VOID** timing.a.overrunRate 32.62% (318/975 turns) for arm a = hard@desktop exceeds the 5% ceiling (AMENDMENTS-DECIDED A14): this comparison row is VOID
- illegalActions: 0, replicaDivergences: 0, timingAnomalies: 0
- engine fallbacks (Gate 0 item 6, must be 0): 0 total
  - packError 0, engineError 0, divergence 0, invalidSuffix 0, emptyPlan 0, workerError 0
- bothSeatsPlayed: true, seatMirrored: true
- Elo (A vs B): -88.7 [-273.2, 54.7], LOS 11.4%, n = 16 pairs / 32 games
- SPRT: not requested
- SPRT (sequential): not requested
- meanTurnMs: a=1352.7 b=55.3
- loadAvgMean (1-min, per game, start and end): 29.31

## Per-engine turn timing (AMENDMENTS-DECIDED A4)

Allowance: wall:1500.
Tolerance: max(10ms,1%), frozen (AMENDMENTS-DECIDED A14) = 15 ms at this allowance. overAllowance counts any ms past the allowance; overruns counts the turns past the tolerance; overrunRate = overruns / turns, and above 5% for either arm the row is VOID (AMENDMENTS-DECIDED A14).

| engine | turns | p95TurnMs | maxTurnMs | overAllowance | overruns | overrunRate | budgetExhausted | reSearches |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| hard@desktop | 975 | 1582 | 2049 | 587 | 318 | 32.62% | 0 | 0 |
| Rush | 976 | 198 | 686 | 0 | 0 | 0.00% | n/a | n/a |

## How the search stopped (AMENDMENTS-DECIDED A16)

abortedSearches: searches the engine abandoned on its watchdog rather than on its work rung — under A11 that watchdog is the turn's remaining allowance, so this counts the moves the CLOCK chose. abortRate = abortedSearches / searches. firstSearchAborted: games whose FIRST search was one of them (the cold profile, still INITIAL_UNITS_PER_MS, has measured nothing yet). emptyPlans: searches that returned no actions, where the adapter ends the phase through phaseEndAction (A10). Counted PER SEAT since E1.5 (PlayerGameStats.hardTiming), so a Hard-vs-Hard row attributes them per arm; older records fall back to the process-wide counters, which only a run with one hard@ arm can own. n/a means neither source says anything about this arm — never that the count was zero.

| engine | searches | abortedSearches | abortRate | firstSearchAborted | emptyPlans |
| --- | --- | --- | --- | --- | --- |
| hard@desktop | 975 | 587 | 60.21% | 32 | 0 |
| Rush | n/a | n/a | n/a | n/a | n/a |

## Per-handicap strata

| handicap | pairs | games | score (A) | W/D/L | Elo |
| --- | --- | --- | --- | --- | --- |
| 0 | 16/16 | 32 | 0.375 | 12/0/20 | -88.7 |
