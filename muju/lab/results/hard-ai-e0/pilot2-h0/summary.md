# Ladder: hard@lab vs aiv2-hard

- status: **complete**
- work: `wall:3000`, handicaps: `0`, seed: 91601, shards: 2
- openings: g2-s0, g3-s1, g4-s2, g2-s5, g4-s6, g5-s7, g4-s10, g5-s11, g5-s15, g2-s20, g3-s25, g4-s30, g5-s31, g2-s40, g4-s42, g3-s45 (sha256 ea37cb3a1d9f)
- openingsIndependent: true
- distinctGames: A-white 2, B-white 2 of 2 pair(s) (digested from the replays)
- pairs: 2/2, games: 4/4 (missing 0, failed 0)
- A record (W/D/L): 3/0/1
- adjudicationRate: 0.00%
- illegalActions: 0, replicaDivergences: 0, timingAnomalies: 0
- bothSeatsPlayed: true, seatMirrored: true
- Elo (A vs B): 190.8 [-67.9, 1199.8], LOS 92.1%, n = 2 pairs / 4 games
- SPRT: not requested
- SPRT (sequential): not requested
- meanTurnMs: a=2020.1 b=2973.5

## Per-engine turn timing (AMENDMENTS-PENDING A4)

Allowance: wall:3000.
Tolerance: max(10ms,1%) (proposed, AMENDMENTS-PENDING A14) = 30 ms at this allowance. overAllowance counts any ms past the allowance; overruns counts the turns past the tolerance.

| engine | turns | p95TurnMs | maxTurnMs | overAllowance | overruns | budgetExhausted | reSearches |
| --- | --- | --- | --- | --- | --- | --- | --- |
| hard@lab | 103 | 3274 | 4584 | 13 | 11 | 0 | 0 |
| aiv2-hard | 102 | 3005 | 3006 | 100 | 0 | n/a | n/a |

## Per-handicap strata

| handicap | pairs | games | score (A) | W/D/L | Elo |
| --- | --- | --- | --- | --- | --- |
| 0 | 2/2 | 4 | 0.750 | 3/0/1 | 190.8 |
