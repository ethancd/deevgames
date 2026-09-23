# Ladder: hard@desktop vs aiv2-hard

- status: **complete**
- work: `wall:1500`, handicaps: `0`, seed: 20260978, shards: 4
- openings: used 32 of 32 — p1-g6-s82, p1-g3-s125, p1-g4-s80, p1-g7-s90, p1-g7-s415, p1-g7-s87, p1-g8-s51, p1-g7-s367, p1-g7-s255, p1-g5-s16, p1-g6-s10, p1-g7-s247, p1-g7-s207, p1-g4-s60, p1-g3-s150, p1-g7-s30, p1-g3-s175, p1-g6-s335, p1-g6-s45, p1-g5-s205, p1-g6-s102, p1-g7-s515, p1-g6-s375, p1-g6-s470, p1-g7-s495, p1-g8-s455, p1-g7-s47, p1-g7-s227, p1-g6-s250, p1-g4-s225, p1-g7-s275, p1-g7-s6 (sha256 cbd427dfd2ee)
- openingsIndependent: true
- distinctGames: A-white 30, B-white 31 of 32 pair(s) (digested from the games.jsonl turns/plies/winType tuple, which is coarser) — **DUPLICATE OPENINGS**: pairs replayed the same game, so they are not independent observations
- pairs: 32/32, games: 64/64 (missing 0, failed 0)
- A record (W/D/L): 50/0/14
- adjudicationRate: 0.00%
- illegalActions: 0, replicaDivergences: 0, timingAnomalies: 0
- engine fallbacks (Gate 0 item 6, must be 0): 0 total
  - packError 0, engineError 0, divergence 0, invalidSuffix 0, emptyPlan 0, workerError 0
- bothSeatsPlayed: true, seatMirrored: true
- Elo (A vs B): 221.1 [120.8, 372.9], LOS 100.0%, n = 32 pairs / 64 games
- SPRT: not requested
- SPRT (sequential): not requested
- meanTurnMs: a=922.0 b=1485.0
- loadAvgMean (1-min, per game, start and end): 5.05

## Per-engine turn timing (AMENDMENTS-DECIDED A4)

Allowance: wall:1500.
Tolerance: max(10ms,1%), frozen (AMENDMENTS-DECIDED A14) = 15 ms at this allowance. overAllowance counts any ms past the allowance; overruns counts the turns past the tolerance; overrunRate = overruns / turns, and above 5% for either arm the row is VOID (AMENDMENTS-DECIDED A14).

| engine | turns | p95TurnMs | maxTurnMs | overAllowance | overruns | overrunRate | budgetExhausted | reSearches |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| hard@desktop | 934 | 1502 | 1511 | 67 | 0 | 0.00% | 0 | 0 |
| aiv2-hard | 918 | 1512 | 1536 | 843 | 13 | 1.42% | n/a | n/a |

## How the search stopped (AMENDMENTS-DECIDED A16)

abortedSearches: searches the engine abandoned on its watchdog rather than on its work rung — under A11 that watchdog is the turn's remaining allowance, so this counts the moves the CLOCK chose. abortRate = abortedSearches / searches. firstSearchAborted: games whose FIRST search was one of them (the cold profile, still INITIAL_UNITS_PER_MS, has measured nothing yet). emptyPlans: searches that returned no actions, where the adapter ends the phase through phaseEndAction (A10). Counted PER SEAT since E1.5 (PlayerGameStats.hardTiming), so a Hard-vs-Hard row attributes them per arm; older records fall back to the process-wide counters, which only a run with one hard@ arm can own. n/a means neither source says anything about this arm — never that the count was zero.

| engine | searches | abortedSearches | abortRate | firstSearchAborted | emptyPlans |
| --- | --- | --- | --- | --- | --- |
| hard@desktop | 934 | 84 | 8.99% | 30 | 0 |
| aiv2-hard | n/a | n/a | n/a | n/a | n/a |

## Per-handicap strata

| handicap | pairs | games | score (A) | W/D/L | Elo |
| --- | --- | --- | --- | --- | --- |
| 0 | 32/32 | 64 | 0.781 | 50/0/14 | 221.1 |
