# Ladder: Rush vs Random

- status: **complete**
- work: `fixed:1`, handicaps: `0`, seed: 3, shards: 2
- openings: initial
- pairs: 2/2, games: 4/4 (missing 0, failed 0)
- A record (W/D/L): 3/1/0
- adjudicationRate: 0.00%
- illegalActions: 0, replicaDivergences: 0, timingAnomalies: 0
- bothSeatsPlayed: true, seatMirrored: true
- Elo (A vs B): 338.0 [148.7, 1199.8], LOS 100.0%
- SPRT: elo0=0 elo1=50 alpha=0.05 beta=0.05 bounds=[-2.9444, 2.9444], minPairs=10
- SPRT (sequential, pairIndex order — the run's decision): **continue** at pair n/a of 2 checked, final LLR=0.2672
- SPRT (batch, all pairs at once): continue, LLR=0.2672
- meanTurnMs: a=13.2 b=0.2

## Per-engine turn timing (AMENDMENTS-PENDING A4)

Allowance: none (fixed work has no clock).

| engine | turns | p95TurnMs | maxTurnMs | overruns | budgetExhausted | reSearches |
| --- | --- | --- | --- | --- | --- | --- |
| Rush | 38 | 51 | 54 | 0 | n/a | n/a |
| Random | 38 | 1 | 1 | 0 | n/a | n/a |

## Per-handicap strata

| handicap | pairs | games | score (A) | W/D/L | Elo |
| --- | --- | --- | --- | --- | --- |
| 0 | 2/2 | 4 | 0.875 | 3/1/0 | 338.0 |
