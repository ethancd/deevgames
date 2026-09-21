# Ladder: hard@ablate:hand-priors-pc vs aiv2-hard-turn

- status: **complete**
- work: `wall:6000`, handicaps: `0`, seed: 31, shards: 8
- openings: used 8 of 40 — p1-g3-s4, p1-g7-s46, p1-g4-s72, p1-g6-s5, p1-g3-s570, p1-g4-s280, p1-g7-s155, p1-g5-s485 (sha256 a58ca9d8aad3) — --openings-skip 8
- openingsIndependent: true
- distinctGames: A-white 8, B-white 8 of 8 pair(s) (digested from the replays)
- pairs: 8/8, games: 16/16 (missing 0, failed 0)
- A record (W/D/L): 15/0/1
- adjudicationRate: 0.00%
- illegalActions: 0, replicaDivergences: 0, timingAnomalies: 0
- engine fallbacks (Gate 0 item 6, must be 0): 0 total
  - packError 0, engineError 0, divergence 0, invalidSuffix 0, emptyPlan 0, workerError 0
- bothSeatsPlayed: true, seatMirrored: true
- Elo (A vs B): 470.4 [266.9, 1199.8], LOS 100.0%, n = 8 pairs / 16 games
- SPRT: not requested
- SPRT (sequential): not requested
- meanTurnMs: a=3808.6 b=6017.4
- loadAvgMean (1-min, per game, start and end): 25.75

## Per-engine turn timing (AMENDMENTS-DECIDED A4)

Allowance: wall:6000.
Tolerance: max(10ms,1%), frozen (AMENDMENTS-DECIDED A14) = 60 ms at this allowance. overAllowance counts any ms past the allowance; overruns counts the turns past the tolerance; overrunRate = overruns / turns, and above 5% for either arm the row is VOID (AMENDMENTS-DECIDED A14).

| engine | turns | p95TurnMs | maxTurnMs | overAllowance | overruns | overrunRate | budgetExhausted | reSearches |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| hard@ablate:hand-priors-pc | 194 | 6037 | 6083 | 38 | 3 | 1.55% | 0 | 0 |
| aiv2-hard-turn | 187 | 6043 | 6096 | 187 | 3 | 1.60% | n/a | n/a |

## How the search stopped (AMENDMENTS-DECIDED A16)

abortedSearches: searches the engine abandoned on its watchdog rather than on its work rung — under A11 that watchdog is the turn's remaining allowance, so this counts the moves the CLOCK chose. abortRate = abortedSearches / searches. firstSearchAborted: games whose FIRST search was one of them (the cold profile, still INITIAL_UNITS_PER_MS, has measured nothing yet). emptyPlans: searches that returned no actions, where the adapter ends the phase through phaseEndAction (A10). Counted PER SEAT since E1.5 (PlayerGameStats.hardTiming), so a Hard-vs-Hard row attributes them per arm; older records fall back to the process-wide counters, which only a run with one hard@ arm can own. n/a means neither source says anything about this arm — never that the count was zero.

| engine | searches | abortedSearches | abortRate | firstSearchAborted | emptyPlans |
| --- | --- | --- | --- | --- | --- |
| hard@ablate:hand-priors-pc | 194 | 38 | 19.59% | 16 | 0 |
| aiv2-hard-turn | n/a | n/a | n/a | n/a | n/a |

## Per-handicap strata

| handicap | pairs | games | score (A) | W/D/L | Elo |
| --- | --- | --- | --- | --- | --- |
| 0 | 8/8 | 16 | 0.938 | 15/0/1 | 470.4 |
