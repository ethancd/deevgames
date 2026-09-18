# Ladder: hard@desktop vs aiv2-hard

- status: **complete**
- work: `wall:3000`, handicaps: `0,3`, seed: 91650, shards: 2
- openings: g3-s25, g4-s30, g5-s31, g2-s40, g4-s42, g3-s45, e1-g3-s105, e1-g2-s40, e1-g4-s250, e1-g4-s750, e1-g4-s730, e1-g3-s745, e1-g4-s510, e1-g2-s155, e1-g3-s205, e1-g4-s550, e1-g5-s55, e1-g5-s1035, e1-g4-s430, e1-g3-s5, e1-g5-s415, e1-g3-s625, e1-g4-s110, e1-g5-s975, e1-g4-s470, e1-g3-s375, e1-g4-s830, e1-g5-s255, e1-g5-s935, e1-g4-s650, e1-g4-s1030, e1-g5-s295, e1-g2-s425, e1-g3-s165, e1-g4-s50, e1-g5-s755, e1-g4-s350, e1-g3-s465, e1-g5-s195, e1-g2-s680, e1-g4-s30, e1-g5-s655, e1-g3-s485, e1-g5-s315, e1-g4-s630, e1-g5-s955, e1-g2-s100, e1-g4-s850, e1-g5-s915, e1-g5-s555 (sha256 96f2944a18d3)
- openingsIndependent: true
- distinctGames: A-white 100, B-white 100 of 100 pair(s) (digested from the replays)
- pairs: 100/100, games: 200/200 (missing 0, failed 0)
- A record (W/D/L): 152/1/47
- adjudicationRate: 0.00%
- illegalActions: 0, replicaDivergences: 0, timingAnomalies: 0
- bothSeatsPlayed: true, seatMirrored: true
- Elo (A vs B): 202.6 [144.7, 273.0], LOS 100.0%, n = 100 pairs / 200 games
- SPRT: not requested
- SPRT (sequential): not requested
- meanTurnMs: a=1950.5 b=2980.4

## Per-engine turn timing (AMENDMENTS-DECIDED A4)

Allowance: wall:3000.
Tolerance: max(10ms,1%), frozen (AMENDMENTS-DECIDED A14) = 30 ms at this allowance. overAllowance counts any ms past the allowance; overruns counts the turns past the tolerance; overrunRate = overruns / turns, and above 5% for either arm the row is VOID (AMENDMENTS-DECIDED A14).

| engine | turns | p95TurnMs | maxTurnMs | overAllowance | overruns | overrunRate | budgetExhausted | reSearches |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| hard@desktop | 4036 | 3014 | 3275 | 631 | 24 | 0.59% | 0 | 0 |
| aiv2-hard | 3988 | 3005 | 3072 | 3914 | 4 | 0.10% | n/a | n/a |

## Per-handicap strata

| handicap | pairs | games | score (A) | W/D/L | Elo |
| --- | --- | --- | --- | --- | --- |
| 0 | 50/50 | 100 | 0.730 | 73/0/27 | 172.8 |
| 3 | 50/50 | 100 | 0.795 | 79/1/20 | 235.4 |
