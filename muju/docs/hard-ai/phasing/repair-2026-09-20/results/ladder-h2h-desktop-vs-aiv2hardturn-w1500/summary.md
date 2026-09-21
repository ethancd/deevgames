# Ladder: hard@desktop vs aiv2-hard-turn

- status: **complete**
- work: `wall:1500`, handicaps: `0`, seed: 20260920, shards: 8
- openings: used 48 of 48 — p1-g6-s2, p1-g5-s85, p1-g6-s310, p1-g5-s17, p1-g4-s420, p1-g7-s75, p1-g5-s135, p1-g8-s15, p1-g3-s4, p1-g7-s46, p1-g4-s72, p1-g6-s5, p1-g3-s570, p1-g4-s280, p1-g7-s155, p1-g5-s485, p1-g6-s410, p1-g7-s535, p1-g7-s7, p1-g4-s560, p1-g4-s380, p1-g4-s540, p1-g4-s215, p1-g4-s340, p1-g6-s130, p1-g6-s190, p1-g6-s110, p1-g8-s31, p1-g5-s245, p1-g6-s345, p1-g4-s400, p1-g5-s145, p1-g6-s305, p1-g4-s240, p1-g8-s95, p1-g6-s395, p1-g7-s527, p1-g4-s260, p1-g4-s100, p1-g7-s187, p1-g6-s490, p1-g5-s385, p1-g7-s355, p1-g7-s127, p1-g5-s165, p1-g4-s320, p1-g4-s200, p1-g3-s3 (sha256 a58ca9d8aad3)
- openingsIndependent: true
- distinctGames: A-white 48, B-white 48 of 48 pair(s) (digested from the replays)
- pairs: 48/48, games: 96/96 (missing 0, failed 0)
- A record (W/D/L): 11/3/82
- adjudicationRate: 0.00%
- **VOID** timing.b.overrunRate 15.37% (158/1028 turns) for arm b = aiv2-hard-turn exceeds the 5% ceiling (AMENDMENTS-DECIDED A14): this comparison row is VOID
- illegalActions: 0, replicaDivergences: 0, timingAnomalies: 0
- engine fallbacks (Gate 0 item 6, must be 0): 0 total
  - packError 0, engineError 0, divergence 0, invalidSuffix 0, emptyPlan 0, workerError 0
- bothSeatsPlayed: true, seatMirrored: true
- Elo (A vs B): -329.9 [-465.8, -244.8], LOS 0.0%, n = 48 pairs / 96 games
- SPRT: not requested
- SPRT (sequential): not requested
- meanTurnMs: a=1066.0 b=1456.3
- loadAvgMean (1-min, per game, start and end): 13.54

## Per-engine turn timing (AMENDMENTS-DECIDED A4)

Allowance: wall:1500.
Tolerance: max(10ms,1%), frozen (AMENDMENTS-DECIDED A14) = 15 ms at this allowance. overAllowance counts any ms past the allowance; overruns counts the turns past the tolerance; overrunRate = overruns / turns, and above 5% for either arm the row is VOID (AMENDMENTS-DECIDED A14).

| engine | turns | p95TurnMs | maxTurnMs | overAllowance | overruns | overrunRate | budgetExhausted | reSearches |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| hard@desktop | 991 | 1509 | 1571 | 196 | 11 | 1.11% | 0 | 0 |
| aiv2-hard-turn | 1028 | 1524 | 1574 | 978 | 158 | 15.37% | n/a | n/a |

## How the search stopped (AMENDMENTS-DECIDED A16)

abortedSearches: searches the engine abandoned on its watchdog rather than on its work rung — under A11 that watchdog is the turn's remaining allowance, so this counts the moves the CLOCK chose. abortRate = abortedSearches / searches. firstSearchAborted: games whose FIRST search was one of them (the cold profile, still INITIAL_UNITS_PER_MS, has measured nothing yet). emptyPlans: searches that returned no actions, where the adapter ends the phase through phaseEndAction (A10). Counted PER SEAT since E1.5 (PlayerGameStats.hardTiming), so a Hard-vs-Hard row attributes them per arm; older records fall back to the process-wide counters, which only a run with one hard@ arm can own. n/a means neither source says anything about this arm — never that the count was zero.

| engine | searches | abortedSearches | abortRate | firstSearchAborted | emptyPlans |
| --- | --- | --- | --- | --- | --- |
| hard@desktop | 991 | 200 | 20.18% | 91 | 0 |
| aiv2-hard-turn | n/a | n/a | n/a | n/a | n/a |

## Per-handicap strata

| handicap | pairs | games | score (A) | W/D/L | Elo |
| --- | --- | --- | --- | --- | --- |
| 0 | 48/48 | 96 | 0.130 | 11/3/82 | -329.9 |
