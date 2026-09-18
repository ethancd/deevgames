# Ladder: hard@ablate:interior-place-wide vs hard@desktop

- status: **complete**
- work: `wall:3000`, handicaps: `0,3`, seed: 20260902, shards: 1
- openings: used 16 of 16 — e1-g3-s45, e1-g3-s125, e1-g4-s790, e1-g2-s735, e1-g3-s665, e1-g4-s870, e1-g4-s390, e1-g3-s905, e1-g4-s890, e1-g2-s980, e1-g4-s810, e1-g5-s1015, e1-g3-s1025, e1-g3-s765, e1-g4-s190, e1-g4-s210 (sha256 593714bc98cf) — --openings-skip 16
- openingsIndependent: true
- distinctGames: A-white 32, B-white 32 of 32 pair(s) (digested from the replays)
- pairs: 32/32, games: 64/64 (missing 0, failed 0)
- A record (W/D/L): 28/0/36
- adjudicationRate: 0.00%
- illegalActions: 0, replicaDivergences: 0, timingAnomalies: 0
- bothSeatsPlayed: true, seatMirrored: true
- Elo (A vs B): -43.7 [-127.0, 34.9], LOS 13.8%, n = 32 pairs / 64 games
- SPRT: not requested
- SPRT (sequential): not requested
- meanTurnMs: a=1828.4 b=1859.3

## Per-engine turn timing (AMENDMENTS-DECIDED A4)

Allowance: wall:3000.
Tolerance: max(10ms,1%), frozen (AMENDMENTS-DECIDED A14) = 30 ms at this allowance. overAllowance counts any ms past the allowance; overruns counts the turns past the tolerance; overrunRate = overruns / turns, and above 5% for either arm the row is VOID (AMENDMENTS-DECIDED A14).

| engine | turns | p95TurnMs | maxTurnMs | overAllowance | overruns | overrunRate | budgetExhausted | reSearches |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| hard@ablate:interior-place-wide | 1909 | 3002 | 4303 | 183 | 11 | 0.58% | 0 | 0 |
| hard@desktop | 1912 | 3002 | 3867 | 190 | 14 | 0.73% | 0 | 0 |

## How the search stopped (AMENDMENTS-DECIDED A16)

abortedSearches: searches the engine abandoned on its watchdog rather than on its work rung — under A11 that watchdog is the turn's remaining allowance, so this counts the moves the CLOCK chose. abortRate = abortedSearches / searches. firstSearchAborted: games whose FIRST search was one of them (the cold profile, still INITIAL_UNITS_PER_MS, has measured nothing yet). emptyPlans: searches that returned no actions, where the adapter ends the phase through phaseEndAction (A10). Counted PER SEAT since E1.5 (PlayerGameStats.hardTiming), so a Hard-vs-Hard row attributes them per arm; older records fall back to the process-wide counters, which only a run with one hard@ arm can own. n/a means neither source says anything about this arm — never that the count was zero.

| engine | searches | abortedSearches | abortRate | firstSearchAborted | emptyPlans |
| --- | --- | --- | --- | --- | --- |
| hard@ablate:interior-place-wide | 1909 | 215 | 11.26% | 42 | 0 |
| hard@desktop | 1912 | 221 | 11.56% | 35 | 0 |

## Per-handicap strata

| handicap | pairs | games | score (A) | W/D/L | Elo |
| --- | --- | --- | --- | --- | --- |
| 0 | 16/16 | 32 | 0.469 | 15/0/17 | -21.7 |
| 3 | 16/16 | 32 | 0.406 | 13/0/19 | -65.9 |
