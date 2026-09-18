# Ladder: hard@desktop vs aiv2-hard

- status: **complete**
- work: `wall:8000`, handicaps: `0,3`, seed: 20260952, shards: 6
- openings: used 16 of 32 — e1-g3-s270, e1-g5-s515, e1-g2-s20, e1-g2-s240, e1-g5-s775, e1-g3-s265, e1-g4-s150, e1-g5-s95, e1-g5-s1055, e1-g3-s405, e1-g5-s475, e1-g2-s60, e1-g2-s180, e1-g3-s505, e1-g4-s355, e1-g3-s825 (sha256 cb51599af4b2) — --openings-skip 0
- openingsIndependent: true
- distinctGames: A-white 32, B-white 32 of 32 pair(s) (digested from the replays)
- pairs: 32/32, games: 64/64 (missing 0, failed 0)
- A record (W/D/L): 51/0/13
- adjudicationRate: 0.00%
- illegalActions: 0, replicaDivergences: 0, timingAnomalies: 0
- bothSeatsPlayed: true, seatMirrored: true
- Elo (A vs B): 237.5 [140.7, 385.0], LOS 100.0%, n = 32 pairs / 64 games
- SPRT: not requested
- SPRT (sequential): not requested
- meanTurnMs: a=4911.6 b=7968.7
- loadAvgMean (1-min, per game, start and end): 134.73

## Per-engine turn timing (AMENDMENTS-DECIDED A4)

Allowance: wall:8000.
Tolerance: max(10ms,1%), frozen (AMENDMENTS-DECIDED A14) = 80 ms at this allowance. overAllowance counts any ms past the allowance; overruns counts the turns past the tolerance; overrunRate = overruns / turns, and above 5% for either arm the row is VOID (AMENDMENTS-DECIDED A14).

| engine | turns | p95TurnMs | maxTurnMs | overAllowance | overruns | overrunRate | budgetExhausted | reSearches |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| hard@desktop | 1341 | 8014 | 8195 | 227 | 4 | 0.30% | 0 | 0 |
| aiv2-hard | 1322 | 8031 | 8145 | 1305 | 14 | 1.06% | n/a | n/a |

## How the search stopped (AMENDMENTS-DECIDED A16)

abortedSearches: searches the engine abandoned on its watchdog rather than on its work rung — under A11 that watchdog is the turn's remaining allowance, so this counts the moves the CLOCK chose. abortRate = abortedSearches / searches. firstSearchAborted: games whose FIRST search was one of them (the cold profile, still INITIAL_UNITS_PER_MS, has measured nothing yet). emptyPlans: searches that returned no actions, where the adapter ends the phase through phaseEndAction (A10). Counted PER SEAT since E1.5 (PlayerGameStats.hardTiming), so a Hard-vs-Hard row attributes them per arm; older records fall back to the process-wide counters, which only a run with one hard@ arm can own. n/a means neither source says anything about this arm — never that the count was zero.

| engine | searches | abortedSearches | abortRate | firstSearchAborted | emptyPlans |
| --- | --- | --- | --- | --- | --- |
| hard@desktop | 1341 | 230 | 17.15% | 64 | 0 |
| aiv2-hard | n/a | n/a | n/a | n/a | n/a |

## Per-handicap strata

| handicap | pairs | games | score (A) | W/D/L | Elo |
| --- | --- | --- | --- | --- | --- |
| 0 | 16/16 | 32 | 0.875 | 28/0/4 | 338.0 |
| 3 | 16/16 | 32 | 0.719 | 23/0/9 | 163.0 |
