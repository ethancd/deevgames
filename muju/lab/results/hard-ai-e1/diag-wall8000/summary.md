# Ladder: hard@desktop vs aiv2-hard

- status: **complete**
- work: `wall:8000`, handicaps: `0,3`, seed: 91680, shards: 2
- openings: e1-g3-s325, e1-g3-s305, e1-g5-s695, e1-g2-s420 (sha256 bba8ea56b1bc) — --openings-skip 44
- openingsIndependent: true
- distinctGames: A-white 8, B-white 8 of 8 pair(s) (digested from the replays)
- pairs: 8/8, games: 16/16 (missing 0, failed 0)
- A record (W/D/L): 12/0/4
- adjudicationRate: 0.00%
- illegalActions: 0, replicaDivergences: 0, timingAnomalies: 0
- bothSeatsPlayed: true, seatMirrored: true
- Elo (A vs B): 190.8 [53.8, 432.1], LOS 99.8%, n = 8 pairs / 16 games
- SPRT: not requested
- SPRT (sequential): not requested
- meanTurnMs: a=4921.4 b=7919.9

## Per-engine turn timing (AMENDMENTS-DECIDED A4)

Allowance: wall:8000.
Tolerance: max(10ms,1%), frozen (AMENDMENTS-DECIDED A14) = 80 ms at this allowance. overAllowance counts any ms past the allowance; overruns counts the turns past the tolerance; overrunRate = overruns / turns, and above 5% for either arm the row is VOID (AMENDMENTS-DECIDED A14).

| engine | turns | p95TurnMs | maxTurnMs | overAllowance | overruns | overrunRate | budgetExhausted | reSearches |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| hard@desktop | 244 | 8009 | 8035 | 21 | 0 | 0.00% | 0 | 0 |
| aiv2-hard | 242 | 8008 | 8013 | 236 | 0 | 0.00% | n/a | n/a |

## Per-handicap strata

| handicap | pairs | games | score (A) | W/D/L | Elo |
| --- | --- | --- | --- | --- | --- |
| 0 | 4/4 | 8 | 0.750 | 6/0/2 | 190.8 |
| 3 | 4/4 | 8 | 0.750 | 6/0/2 | 190.8 |
