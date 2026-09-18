# Ladder: hard@ablate:action-width-wide vs hard@desktop

- status: **complete**
- work: `wall:3000`, handicaps: `0,3`, seed: 20260916, shards: 2
- openings: used 16 of 32 — e1v2-g4-s10, e1v2-g4-s50, e1v2-g3-s65, e1v2-g4-s70, e1v2-g3-s85, e1v2-g2-s100, e1v2-g4-s110, e1v2-g4-s130, e1v2-g4-s150, e1v2-g3-s165, e1v2-g4-s170, e1v2-g4-s175, e1v2-g5-s195, e1v2-g4-s210, e1v2-g4-s230, e1v2-g4-s250, e1v2-g5-s255, e1v2-g3-s265, e1v2-g5-s275, e1v2-g3-s285, e1v2-g4-s290, e1v2-g4-s295, e1v2-g3-s305, e1v2-g4-s310, e1v2-g3-s325, e1v2-g4-s330, e1v2-g5-s335, e1v2-g4-s350, e1v2-g4-s370, e1v2-g5-s375, e1v2-g3-s385, e1v2-g4-s390 (sha256 fe3b9c98ad21)
- openingsIndependent: true
- distinctGames: A-white 32, B-white 32 of 32 pair(s) (digested from the replays)
- pairs: 32/32, games: 64/64 (missing 0, failed 0)
- A record (W/D/L): 31/1/32
- adjudicationRate: 0.00%
- illegalActions: 0, replicaDivergences: 0, timingAnomalies: 0
- bothSeatsPlayed: true, seatMirrored: true
- Elo (A vs B): -5.4 [-84.5, 73.1], LOS 44.5%, n = 32 pairs / 64 games
- SPRT: not requested
- SPRT (sequential): not requested
- meanTurnMs: a=1854.3 b=1817.1

## Per-engine turn timing (AMENDMENTS-DECIDED A4)

Allowance: wall:3000.
Tolerance: max(10ms,1%), frozen (AMENDMENTS-DECIDED A14) = 30 ms at this allowance. overAllowance counts any ms past the allowance; overruns counts the turns past the tolerance; overrunRate = overruns / turns, and above 5% for either arm the row is VOID (AMENDMENTS-DECIDED A14).

| engine | turns | p95TurnMs | maxTurnMs | overAllowance | overruns | overrunRate | budgetExhausted | reSearches |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| hard@ablate:action-width-wide | 2015 | 3002 | 12122 | 216 | 10 | 0.50% | 0 | 0 |
| hard@desktop | 2013 | 3002 | 19797 | 204 | 11 | 0.55% | 0 | 0 |

## How the search stopped (AMENDMENTS-DECIDED A16)

abortedSearches: searches the engine abandoned on its watchdog rather than on its work rung — under A11 that watchdog is the turn's remaining allowance, so this counts the moves the CLOCK chose. abortRate = abortedSearches / searches. firstSearchAborted: games whose FIRST search was one of them (the cold profile, still INITIAL_UNITS_PER_MS, has measured nothing yet). emptyPlans: searches that returned no actions, where the adapter ends the phase through phaseEndAction (A10). Counted PER SEAT since E1.5 (PlayerGameStats.hardTiming), so a Hard-vs-Hard row attributes them per arm; older records fall back to the process-wide counters, which only a run with one hard@ arm can own. n/a means neither source says anything about this arm — never that the count was zero.

| engine | searches | abortedSearches | abortRate | firstSearchAborted | emptyPlans |
| --- | --- | --- | --- | --- | --- |
| hard@ablate:action-width-wide | 2015 | 246 | 12.21% | 49 | 0 |
| hard@desktop | 2013 | 247 | 12.27% | 46 | 0 |

## Per-handicap strata

| handicap | pairs | games | score (A) | W/D/L | Elo |
| --- | --- | --- | --- | --- | --- |
| 0 | 16/16 | 32 | 0.500 | 16/0/16 | 0.0 |
| 3 | 16/16 | 32 | 0.484 | 15/1/16 | -10.9 |
