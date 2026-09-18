# Ladder: hard@ablate:action-width-wide vs hard@desktop

- status: **complete**
- work: `wall:3000`, handicaps: `0,3`, seed: 1350514, shards: 2
- openings: used 16 of 32 — e1-g3-s445, e1-g3-s245, e1-g2-s0, e1-g3-s685, e1-g4-s10, e1-g2-s660, e1-g3-s785, e1-g4-s75, e1-g5-s215, e1-g3-s285, e1-g3-s985, e1-g5-s615, e1-g4-s170, e1-g4-s570, e1-g5-s715, e1-g2-s540, e1-g3-s45, e1-g3-s125, e1-g4-s790, e1-g2-s735, e1-g3-s665, e1-g4-s870, e1-g4-s390, e1-g3-s905, e1-g4-s890, e1-g2-s980, e1-g4-s810, e1-g5-s1015, e1-g3-s1025, e1-g3-s765, e1-g4-s190, e1-g4-s210 (sha256 593714bc98cf)
- openingsIndependent: true
- distinctGames: A-white 32, B-white 32 of 32 pair(s) (digested from the replays)
- pairs: 32/32, games: 64/64 (missing 0, failed 0)
- A record (W/D/L): 40/1/23
- adjudicationRate: 0.00%
- illegalActions: 0, replicaDivergences: 0, timingAnomalies: 0
- bothSeatsPlayed: true, seatMirrored: true
- Elo (A vs B): 94.6 [12.7, 188.4], LOS 98.8%, n = 32 pairs / 64 games
- SPRT: not requested
- SPRT (sequential): not requested
- meanTurnMs: a=1917.9 b=2062.5

## Per-engine turn timing (AMENDMENTS-DECIDED A4)

Allowance: wall:3000.
Tolerance: max(10ms,1%), frozen (AMENDMENTS-DECIDED A14) = 30 ms at this allowance. overAllowance counts any ms past the allowance; overruns counts the turns past the tolerance; overrunRate = overruns / turns, and above 5% for either arm the row is VOID (AMENDMENTS-DECIDED A14).

| engine | turns | p95TurnMs | maxTurnMs | overAllowance | overruns | overrunRate | budgetExhausted | reSearches |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| hard@ablate:action-width-wide | 2086 | 3024 | 37963 | 238 | 73 | 3.50% | n/a | n/a |
| hard@desktop | 2078 | 3013 | 48459 | 236 | 30 | 1.44% | n/a | n/a |

## How the search stopped (AMENDMENTS-DECIDED A16)

abortedSearches: searches the engine abandoned on its watchdog rather than on its work rung — under A11 that watchdog is the turn's remaining allowance, so this counts the moves the CLOCK chose. abortRate = abortedSearches / searches. firstSearchAborted: games whose FIRST search was one of them (the cold profile, still INITIAL_UNITS_PER_MS, has measured nothing yet). emptyPlans: searches that returned no actions, where the adapter ends the phase through phaseEndAction (A10). n/a means the run has no single hard@ arm to attribute the process-wide counters to, or its games predate the counter — never that the count was zero.

| engine | searches | abortedSearches | abortRate | firstSearchAborted | emptyPlans |
| --- | --- | --- | --- | --- | --- |
| hard@ablate:action-width-wide | n/a | n/a | n/a | n/a | n/a |
| hard@desktop | n/a | n/a | n/a | n/a | n/a |

## Per-handicap strata

| handicap | pairs | games | score (A) | W/D/L | Elo |
| --- | --- | --- | --- | --- | --- |
| 0 | 16/16 | 32 | 0.703 | 22/1/9 | 149.8 |
| 3 | 16/16 | 32 | 0.563 | 18/0/14 | 43.7 |
