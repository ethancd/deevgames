# Ladder: hard@ablate:search-rescue-cap vs hard@desktop

- status: **complete**
- work: `fixed:100000`, handicaps: `0,3`, seed: 46, shards: 4
- openings: used 4 of 48 — e1-g3-s105, e1-g2-s40, e1-g4-s250, e1-g4-s750 (sha256 bba8ea56b1bc)
- openingsIndependent: true
- distinctGames: A-white 8, B-white 8 of 8 pair(s) (digested from the replays)
- pairs: 8/8, games: 16/16 (missing 0, failed 0)
- A record (W/D/L): 8/0/8
- adjudicationRate: 0.00%
- illegalActions: 0, replicaDivergences: 0, timingAnomalies: 0
- bothSeatsPlayed: true, seatMirrored: true
- Elo (A vs B): 0.0 [-84.7, 84.7], LOS 50.0%, n = 8 pairs / 16 games **(degenerate sample, regularized - descriptive only)**
- SPRT: not requested
- SPRT (sequential): not requested
- meanTurnMs: a=1136.7 b=1230.3
- loadAvgMean (1-min, per game, start and end): 9.91

## Per-engine turn timing (AMENDMENTS-DECIDED A4)

Allowance: none (fixed work has no clock).
Tolerance: max(10ms,1%), frozen (AMENDMENTS-DECIDED A14). overAllowance counts any ms past the allowance; overruns counts the turns past the tolerance; overrunRate = overruns / turns, and above 5% for either arm the row is VOID (AMENDMENTS-DECIDED A14).

| engine | turns | p95TurnMs | maxTurnMs | overAllowance | overruns | overrunRate | budgetExhausted | reSearches |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| hard@ablate:search-rescue-cap | 499 | 1708 | 18628 | 0 | 0 | n/a | 0 | 0 |
| hard@desktop | 499 | 1726 | 35091 | 0 | 0 | n/a | 0 | 0 |

## How the search stopped (AMENDMENTS-DECIDED A16)

abortedSearches: searches the engine abandoned on its watchdog rather than on its work rung — under A11 that watchdog is the turn's remaining allowance, so this counts the moves the CLOCK chose. abortRate = abortedSearches / searches. firstSearchAborted: games whose FIRST search was one of them (the cold profile, still INITIAL_UNITS_PER_MS, has measured nothing yet). emptyPlans: searches that returned no actions, where the adapter ends the phase through phaseEndAction (A10). Counted PER SEAT since E1.5 (PlayerGameStats.hardTiming), so a Hard-vs-Hard row attributes them per arm; older records fall back to the process-wide counters, which only a run with one hard@ arm can own. n/a means neither source says anything about this arm — never that the count was zero.

| engine | searches | abortedSearches | abortRate | firstSearchAborted | emptyPlans |
| --- | --- | --- | --- | --- | --- |
| hard@ablate:search-rescue-cap | 499 | 0 | 0.00% | 0 | 0 |
| hard@desktop | 499 | 0 | 0.00% | 0 | 0 |

## Per-handicap strata

| handicap | pairs | games | score (A) | W/D/L | Elo |
| --- | --- | --- | --- | --- | --- |
| 0 | 4/4 | 8 | 0.500 | 4/0/4 | 0.0 |
| 3 | 4/4 | 8 | 0.500 | 4/0/4 | 0.0 |
