# Ladder: hard@ablate:work-fit vs hard@desktop

- status: **complete**
- work: `wall:3000`, handicaps: `0,3`, seed: 1, shards: 1
- openings: used 2 of 4 — e1-g3-s325, e1-g3-s305, e1-g5-s695, e1-g2-s420 (sha256 bba8ea56b1bc) — --openings-skip 44
- openingsIndependent: true
- distinctGames: A-white 4, B-white 4 of 4 pair(s) (digested from the replays)
- pairs: 4/4, games: 8/8 (missing 0, failed 0)
- A record (W/D/L): 3/0/5
- adjudicationRate: 0.00%
- illegalActions: 0, replicaDivergences: 0, timingAnomalies: 0
- bothSeatsPlayed: true, seatMirrored: true
- Elo (A vs B): -88.7 [-284.4, 61.2], LOS 12.4%, n = 4 pairs / 8 games
- SPRT: not requested
- SPRT (sequential): not requested
- meanTurnMs: a=2246.2 b=1914.3

## Per-engine turn timing (AMENDMENTS-DECIDED A4)

Allowance: wall:3000.
Tolerance: max(10ms,1%), frozen (AMENDMENTS-DECIDED A14) = 30 ms at this allowance. overAllowance counts any ms past the allowance; overruns counts the turns past the tolerance; overrunRate = overruns / turns, and above 5% for either arm the row is VOID (AMENDMENTS-DECIDED A14).

| engine | turns | p95TurnMs | maxTurnMs | overAllowance | overruns | overrunRate | budgetExhausted | reSearches |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| hard@ablate:work-fit | 195 | 3004 | 3284 | 32 | 4 | 2.05% | 0 | 0 |
| hard@desktop | 195 | 3002 | 3262 | 22 | 2 | 1.03% | 0 | 0 |

## How the search stopped (AMENDMENTS-DECIDED A16)

abortedSearches: searches the engine abandoned on its watchdog rather than on its work rung — under A11 that watchdog is the turn's remaining allowance, so this counts the moves the CLOCK chose. abortRate = abortedSearches / searches. firstSearchAborted: games whose FIRST search was one of them (the cold profile, still INITIAL_UNITS_PER_MS, has measured nothing yet). emptyPlans: searches that returned no actions, where the adapter ends the phase through phaseEndAction (A10). Counted PER SEAT since E1.5 (PlayerGameStats.hardTiming), so a Hard-vs-Hard row attributes them per arm; older records fall back to the process-wide counters, which only a run with one hard@ arm can own. n/a means neither source says anything about this arm — never that the count was zero.

| engine | searches | abortedSearches | abortRate | firstSearchAborted | emptyPlans |
| --- | --- | --- | --- | --- | --- |
| hard@ablate:work-fit | 195 | 41 | 21.03% | 7 | 0 |
| hard@desktop | 195 | 24 | 12.31% | 5 | 0 |

## Per-handicap strata

| handicap | pairs | games | score (A) | W/D/L | Elo |
| --- | --- | --- | --- | --- | --- |
| 0 | 2/2 | 4 | 0.250 | 1/0/3 | -190.8 |
| 3 | 2/2 | 4 | 0.500 | 2/0/2 | 0.0 |
