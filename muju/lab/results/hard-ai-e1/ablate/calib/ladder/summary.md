# Ladder: hard@ablate:calib vs hard@desktop

- status: **complete**
- work: `wall:3000`, handicaps: `0,3`, seed: 1357728, shards: 2
- openings: used 16 of 16 — e1-g3-s45, e1-g3-s125, e1-g4-s790, e1-g2-s735, e1-g3-s665, e1-g4-s870, e1-g4-s390, e1-g3-s905, e1-g4-s890, e1-g2-s980, e1-g4-s810, e1-g5-s1015, e1-g3-s1025, e1-g3-s765, e1-g4-s190, e1-g4-s210 (sha256 593714bc98cf) — --openings-skip 16
- openingsIndependent: true
- distinctGames: A-white 32, B-white 32 of 32 pair(s) (digested from the replays)
- pairs: 32/32, games: 64/64 (missing 0, failed 0)
- A record (W/D/L): 29/1/34
- adjudicationRate: 0.00%
- illegalActions: 0, replicaDivergences: 0, timingAnomalies: 0
- bothSeatsPlayed: true, seatMirrored: true
- Elo (A vs B): -27.2 [-65.1, 10.1], LOS 7.6%, n = 32 pairs / 64 games
- SPRT: not requested
- SPRT (sequential): not requested
- meanTurnMs: a=1857.1 b=1850.2

## Per-engine turn timing (AMENDMENTS-DECIDED A4)

Allowance: wall:3000.
Tolerance: max(10ms,1%), frozen (AMENDMENTS-DECIDED A14) = 30 ms at this allowance. overAllowance counts any ms past the allowance; overruns counts the turns past the tolerance; overrunRate = overruns / turns, and above 5% for either arm the row is VOID (AMENDMENTS-DECIDED A14).

| engine | turns | p95TurnMs | maxTurnMs | overAllowance | overruns | overrunRate | budgetExhausted | reSearches |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| hard@ablate:calib | 1748 | 3002 | 15669 | 131 | 5 | 0.29% | 0 | 0 |
| hard@desktop | 1751 | 3002 | 11894 | 149 | 8 | 0.46% | 0 | 0 |

## How the search stopped (AMENDMENTS-DECIDED A16)

abortedSearches: searches the engine abandoned on its watchdog rather than on its work rung — under A11 that watchdog is the turn's remaining allowance, so this counts the moves the CLOCK chose. abortRate = abortedSearches / searches. firstSearchAborted: games whose FIRST search was one of them (the cold profile, still INITIAL_UNITS_PER_MS, has measured nothing yet). emptyPlans: searches that returned no actions, where the adapter ends the phase through phaseEndAction (A10). Counted PER SEAT since E1.5 (PlayerGameStats.hardTiming), so a Hard-vs-Hard row attributes them per arm; older records fall back to the process-wide counters, which only a run with one hard@ arm can own. n/a means neither source says anything about this arm — never that the count was zero.

| engine | searches | abortedSearches | abortRate | firstSearchAborted | emptyPlans |
| --- | --- | --- | --- | --- | --- |
| hard@ablate:calib | 1748 | 140 | 8.01% | 1 | 0 |
| hard@desktop | 1751 | 177 | 10.11% | 35 | 0 |

## Per-handicap strata

| handicap | pairs | games | score (A) | W/D/L | Elo |
| --- | --- | --- | --- | --- | --- |
| 0 | 16/16 | 32 | 0.469 | 15/0/17 | -21.7 |
| 3 | 16/16 | 32 | 0.453 | 14/1/17 | -32.7 |
