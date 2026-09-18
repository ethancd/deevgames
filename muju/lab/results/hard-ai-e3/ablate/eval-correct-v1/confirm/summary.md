# Ladder: hard@ablate:eval-correct-v1 vs hard@desktop

- status: **complete**
- work: `wall:3000`, handicaps: `0,3`, seed: 20260935, shards: 6
- openings: used 16 of 16 — e2-g4-s650, e2-g3-s665, e2-g4-s670, e2-g3-s685, e2-g5-s695, e2-g4-s710, e2-g5-s715, e2-g3-s725, e2-g5-s755, e2-g3-s765, e2-g4-s770, e2-g3-s785, e2-g4-s810, e2-g5-s815, e2-g2-s820, e2-g3-s865 (sha256 df0c99ccc124) — --openings-skip 48
- openingsIndependent: true
- distinctGames: A-white 32, B-white 32 of 32 pair(s) (digested from the replays)
- pairs: 32/32, games: 64/64 (missing 0, failed 0)
- A record (W/D/L): 39/0/25
- adjudicationRate: 0.00%
- illegalActions: 0, replicaDivergences: 0, timingAnomalies: 0
- bothSeatsPlayed: true, seatMirrored: true
- Elo (A vs B): 77.2 [3.9, 158.2], LOS 98.1%, n = 32 pairs / 64 games
- SPRT: not requested
- SPRT (sequential): not requested
- meanTurnMs: a=1837.0 b=1856.5
- loadAvgMean (1-min, per game, start and end): 7.93

## Per-engine turn timing (AMENDMENTS-DECIDED A4)

Allowance: wall:3000.
Tolerance: max(10ms,1%), frozen (AMENDMENTS-DECIDED A14) = 30 ms at this allowance. overAllowance counts any ms past the allowance; overruns counts the turns past the tolerance; overrunRate = overruns / turns, and above 5% for either arm the row is VOID (AMENDMENTS-DECIDED A14).

| engine | turns | p95TurnMs | maxTurnMs | overAllowance | overruns | overrunRate | budgetExhausted | reSearches |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| hard@ablate:eval-correct-v1 | 1772 | 3002 | 7088 | 194 | 7 | 0.40% | 0 | 0 |
| hard@desktop | 1766 | 3002 | 6868 | 168 | 6 | 0.34% | 0 | 0 |

## How the search stopped (AMENDMENTS-DECIDED A16)

abortedSearches: searches the engine abandoned on its watchdog rather than on its work rung — under A11 that watchdog is the turn's remaining allowance, so this counts the moves the CLOCK chose. abortRate = abortedSearches / searches. firstSearchAborted: games whose FIRST search was one of them (the cold profile, still INITIAL_UNITS_PER_MS, has measured nothing yet). emptyPlans: searches that returned no actions, where the adapter ends the phase through phaseEndAction (A10). Counted PER SEAT since E1.5 (PlayerGameStats.hardTiming), so a Hard-vs-Hard row attributes them per arm; older records fall back to the process-wide counters, which only a run with one hard@ arm can own. n/a means neither source says anything about this arm — never that the count was zero.

| engine | searches | abortedSearches | abortRate | firstSearchAborted | emptyPlans |
| --- | --- | --- | --- | --- | --- |
| hard@ablate:eval-correct-v1 | 1772 | 212 | 11.96% | 40 | 0 |
| hard@desktop | 1766 | 196 | 11.10% | 42 | 0 |

## Per-handicap strata

| handicap | pairs | games | score (A) | W/D/L | Elo |
| --- | --- | --- | --- | --- | --- |
| 0 | 16/16 | 32 | 0.594 | 19/0/13 | 65.9 |
| 3 | 16/16 | 32 | 0.625 | 20/0/12 | 88.7 |
