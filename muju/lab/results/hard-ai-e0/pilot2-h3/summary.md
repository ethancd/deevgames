# Ladder: hard@lab vs aiv2-hard

- status: **complete**
- work: `wall:3000`, handicaps: `3`, seed: 91603, shards: 2
- openings: g2-s0, g3-s1, g4-s2, g2-s5, g4-s6, g5-s7, g4-s10, g5-s11, g5-s15, g2-s20, g3-s25, g4-s30, g5-s31, g2-s40, g4-s42, g3-s45 (sha256 ea37cb3a1d9f)
- openingsIndependent: true
- distinctGames: A-white 2, B-white 2 of 2 pair(s) (digested from the replays)
- pairs: 2/2, games: 4/4 (missing 0, failed 0)
- A record (W/D/L): 2/0/2
- adjudicationRate: 0.00%
- illegalActions: 0, replicaDivergences: 0, timingAnomalies: 0
- bothSeatsPlayed: true, seatMirrored: true
- Elo (A vs B): 0.0 [-323.0, 323.0], LOS 50.0%, n = 2 pairs / 4 games **(degenerate sample, regularized - descriptive only)**
- SPRT: not requested
- SPRT (sequential): not requested
- meanTurnMs: a=2033.4 b=2933.0

## Per-engine turn timing (AMENDMENTS-PENDING A4)

Allowance: wall:3000.
Tolerance: max(10ms,1%) (proposed, AMENDMENTS-PENDING A14) = 30 ms at this allowance. overAllowance counts any ms past the allowance; overruns counts the turns past the tolerance.

| engine | turns | p95TurnMs | maxTurnMs | overAllowance | overruns | budgetExhausted | reSearches |
| --- | --- | --- | --- | --- | --- | --- | --- |
| hard@lab | 67 | 3725 | 4170 | 12 | 11 | 0 | 0 |
| aiv2-hard | 67 | 3007 | 3009 | 65 | 0 | n/a | n/a |

## Per-handicap strata

| handicap | pairs | games | score (A) | W/D/L | Elo |
| --- | --- | --- | --- | --- | --- |
| 3 | 2/2 | 4 | 0.500 | 2/0/2 | 0.0 |
