# Ladder: hard@desktop vs aiv2-hard-turn

- status: **complete**
- work: `wall:6000`, handicaps: `0`, seed: 31, shards: 8
- openings: used 8 of 48 — p1-g6-s2, p1-g5-s85, p1-g6-s310, p1-g5-s17, p1-g4-s420, p1-g7-s75, p1-g5-s135, p1-g8-s15 (sha256 a58ca9d8aad3)
- openingsIndependent: true
- distinctGames: A-white 8, B-white 8 of 8 pair(s) (digested from the replays)
- pairs: 8/8, games: 16/16 (missing 0, failed 0)
- A record (W/D/L): 3/0/13
- adjudicationRate: 0.00%
- **VOID** timing.b.overrunRate 5.88% (10/170 turns) for arm b = aiv2-hard-turn exceeds the 5% ceiling (AMENDMENTS-DECIDED A14): this comparison row is VOID
- illegalActions: 0, replicaDivergences: 0, timingAnomalies: 0
- engine fallbacks (Gate 0 item 6, must be 0): 0 total
  - packError 0, engineError 0, divergence 0, invalidSuffix 0, emptyPlan 0, workerError 0
- bothSeatsPlayed: true, seatMirrored: true
- Elo (A vs B): -254.7 [-678.2, -103.6], LOS 0.0%, n = 8 pairs / 16 games
- SPRT: not requested
- SPRT (sequential): not requested
- meanTurnMs: a=4105.0 b=5850.7
- loadAvgMean (1-min, per game, start and end): 24.24

## Per-engine turn timing (AMENDMENTS-DECIDED A4)

Allowance: wall:6000.
Tolerance: max(10ms,1%), frozen (AMENDMENTS-DECIDED A14) = 60 ms at this allowance. overAllowance counts any ms past the allowance; overruns counts the turns past the tolerance; overrunRate = overruns / turns, and above 5% for either arm the row is VOID (AMENDMENTS-DECIDED A14).

| engine | turns | p95TurnMs | maxTurnMs | overAllowance | overruns | overrunRate | budgetExhausted | reSearches |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| hard@desktop | 165 | 6031 | 6076 | 32 | 3 | 1.82% | 0 | 0 |
| aiv2-hard-turn | 170 | 6062 | 6092 | 163 | 10 | 5.88% | n/a | n/a |

## How the search stopped (AMENDMENTS-DECIDED A16)

abortedSearches: searches the engine abandoned on its watchdog rather than on its work rung — under A11 that watchdog is the turn's remaining allowance, so this counts the moves the CLOCK chose. abortRate = abortedSearches / searches. firstSearchAborted: games whose FIRST search was one of them (the cold profile, still INITIAL_UNITS_PER_MS, has measured nothing yet). emptyPlans: searches that returned no actions, where the adapter ends the phase through phaseEndAction (A10). Counted PER SEAT since E1.5 (PlayerGameStats.hardTiming), so a Hard-vs-Hard row attributes them per arm; older records fall back to the process-wide counters, which only a run with one hard@ arm can own. n/a means neither source says anything about this arm — never that the count was zero.

| engine | searches | abortedSearches | abortRate | firstSearchAborted | emptyPlans |
| --- | --- | --- | --- | --- | --- |
| hard@desktop | 165 | 32 | 19.39% | 16 | 0 |
| aiv2-hard-turn | n/a | n/a | n/a | n/a | n/a |

## Per-handicap strata

| handicap | pairs | games | score (A) | W/D/L | Elo |
| --- | --- | --- | --- | --- | --- |
| 0 | 8/8 | 16 | 0.188 | 3/0/13 | -254.7 |
