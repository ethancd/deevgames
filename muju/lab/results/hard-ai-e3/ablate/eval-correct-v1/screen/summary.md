# Ladder: hard@ablate:eval-correct-v1 vs hard@desktop

- status: **complete**
- work: `wall:3000`, handicaps: `0,3`, seed: 20260934, shards: 6
- openings: used 16 of 16 — e1v2-g5-s255, e1v2-g3-s265, e1v2-g5-s275, e1v2-g3-s285, e1v2-g4-s290, e1v2-g4-s295, e1v2-g3-s305, e1v2-g4-s310, e1v2-g3-s325, e1v2-g4-s330, e1v2-g5-s335, e1v2-g4-s350, e1v2-g4-s370, e1v2-g5-s375, e1v2-g3-s385, e1v2-g4-s390 (sha256 fe3b9c98ad21) — --openings-skip 16
- openingsIndependent: true
- distinctGames: A-white 32, B-white 32 of 32 pair(s) (digested from the replays)
- pairs: 32/32, games: 64/64 (missing 0, failed 0)
- A record (W/D/L): 42/1/21
- adjudicationRate: 0.00%
- illegalActions: 0, replicaDivergences: 0, timingAnomalies: 0
- bothSeatsPlayed: true, seatMirrored: true
- Elo (A vs B): 118.4 [51.2, 195.4], LOS 100.0%, n = 32 pairs / 64 games
- SPRT: not requested
- SPRT (sequential): not requested
- meanTurnMs: a=1824.9 b=1880.5
- loadAvgMean (1-min, per game, start and end): 7.29

## Per-engine turn timing (AMENDMENTS-DECIDED A4)

Allowance: wall:3000.
Tolerance: max(10ms,1%), frozen (AMENDMENTS-DECIDED A14) = 30 ms at this allowance. overAllowance counts any ms past the allowance; overruns counts the turns past the tolerance; overrunRate = overruns / turns, and above 5% for either arm the row is VOID (AMENDMENTS-DECIDED A14).

| engine | turns | p95TurnMs | maxTurnMs | overAllowance | overruns | overrunRate | budgetExhausted | reSearches |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| hard@ablate:eval-correct-v1 | 1822 | 3002 | 15680 | 212 | 8 | 0.44% | 0 | 0 |
| hard@desktop | 1813 | 3002 | 4707 | 171 | 9 | 0.50% | 0 | 0 |

## How the search stopped (AMENDMENTS-DECIDED A16)

abortedSearches: searches the engine abandoned on its watchdog rather than on its work rung — under A11 that watchdog is the turn's remaining allowance, so this counts the moves the CLOCK chose. abortRate = abortedSearches / searches. firstSearchAborted: games whose FIRST search was one of them (the cold profile, still INITIAL_UNITS_PER_MS, has measured nothing yet). emptyPlans: searches that returned no actions, where the adapter ends the phase through phaseEndAction (A10). Counted PER SEAT since E1.5 (PlayerGameStats.hardTiming), so a Hard-vs-Hard row attributes them per arm; older records fall back to the process-wide counters, which only a run with one hard@ arm can own. n/a means neither source says anything about this arm — never that the count was zero.

| engine | searches | abortedSearches | abortRate | firstSearchAborted | emptyPlans |
| --- | --- | --- | --- | --- | --- |
| hard@ablate:eval-correct-v1 | 1822 | 234 | 12.84% | 43 | 0 |
| hard@desktop | 1813 | 187 | 10.31% | 39 | 0 |

## Per-handicap strata

| handicap | pairs | games | score (A) | W/D/L | Elo |
| --- | --- | --- | --- | --- | --- |
| 0 | 16/16 | 32 | 0.656 | 21/0/11 | 112.3 |
| 3 | 16/16 | 32 | 0.672 | 21/1/10 | 124.5 |
