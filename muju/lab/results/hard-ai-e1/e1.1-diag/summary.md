# Ladder: hard@desktop vs aiv2-hard

- status: **complete**
- work: `wall:3000`, handicaps: `0,3`, seed: 91611, shards: 2
- openings: g4-s2, g2-s5, g4-s6, g5-s7, g4-s10, g5-s11, g5-s15, g2-s20, g3-s25, g4-s30, g5-s31, g2-s40, g4-s42, g3-s45 (sha256 ea37cb3a1d9f) — --openings-skip 2
- openingsIndependent: true
- distinctGames: A-white 16, B-white 16 of 16 pair(s) (digested from the replays)
- pairs: 16/16, games: 32/32 (missing 0, failed 0)
- A record (W/D/L): 18/0/14
- adjudicationRate: 0.00%
- illegalActions: 0, replicaDivergences: 0, timingAnomalies: 0
- bothSeatsPlayed: true, seatMirrored: true
- Elo (A vs B): 43.7 [-91.5, 194.3], LOS 73.9%, n = 16 pairs / 32 games
- SPRT: not requested
- SPRT (sequential): not requested
- meanTurnMs: a=1893.4 b=2969.3

## Per-engine turn timing (AMENDMENTS-DECIDED A4)

Allowance: wall:3000.
Tolerance: max(10ms,1%), frozen (AMENDMENTS-DECIDED A14) = 30 ms at this allowance. overAllowance counts any ms past the allowance; overruns counts the turns past the tolerance; overrunRate = overruns / turns, and above 5% for either arm the row is VOID (AMENDMENTS-DECIDED A14).

| engine | turns | p95TurnMs | maxTurnMs | overAllowance | overruns | overrunRate | budgetExhausted | reSearches |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| hard@desktop | 764 | 3014 | 3309 | 97 | 2 | 0.26% | 0 | 0 |
| aiv2-hard | 760 | 3005 | 3031 | 745 | 1 | 0.13% | n/a | n/a |

## Per-handicap strata

| handicap | pairs | games | score (A) | W/D/L | Elo |
| --- | --- | --- | --- | --- | --- |
| 0 | 8/8 | 16 | 0.688 | 11/0/5 | 137.0 |
| 3 | 8/8 | 16 | 0.438 | 7/0/9 | -43.7 |
