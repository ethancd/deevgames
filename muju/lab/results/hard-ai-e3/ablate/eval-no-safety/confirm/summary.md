# Ladder: hard@ablate:eval-no-safety vs hard@desktop

- status: **complete**
- work: `wall:3000`, handicaps: `0,3`, seed: 20260932, shards: 1
- openings: used 16 of 32 — e2-g4-s430, e2-g5-s475, e2-g4-s490, e2-g4-s510, e2-g3-s525, e2-g2-s530, e2-g5-s535, e2-g3-s545, e2-g5-s575, e2-g3-s585, e2-g5-s595, e2-g3-s605, e2-g4-s610, e2-g4-s615, e2-g5-s635, e2-g3-s645, e2-g4-s650, e2-g3-s665, e2-g4-s670, e2-g3-s685, e2-g5-s695, e2-g4-s710, e2-g5-s715, e2-g3-s725, e2-g5-s755, e2-g3-s765, e2-g4-s770, e2-g3-s785, e2-g4-s810, e2-g5-s815, e2-g2-s820, e2-g3-s865 (sha256 df0c99ccc124) — --openings-skip 32
- openingsIndependent: true
- distinctGames: A-white 32, B-white 32 of 32 pair(s) (digested from the replays)
- pairs: 32/32, games: 64/64 (missing 0, failed 0)
- A record (W/D/L): 42/2/20
- adjudicationRate: 0.00%
- illegalActions: 0, replicaDivergences: 0, timingAnomalies: 0
- bothSeatsPlayed: true, seatMirrored: true
- Elo (A vs B): 124.5 [37.9, 229.5], LOS 99.8%, n = 32 pairs / 64 games
- SPRT: not requested
- SPRT (sequential): not requested
- meanTurnMs: a=1724.2 b=1833.9

## Per-engine turn timing (AMENDMENTS-DECIDED A4)

Allowance: wall:3000.
Tolerance: max(10ms,1%), frozen (AMENDMENTS-DECIDED A14) = 30 ms at this allowance. overAllowance counts any ms past the allowance; overruns counts the turns past the tolerance; overrunRate = overruns / turns, and above 5% for either arm the row is VOID (AMENDMENTS-DECIDED A14).

| engine | turns | p95TurnMs | maxTurnMs | overAllowance | overruns | overrunRate | budgetExhausted | reSearches |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| hard@ablate:eval-no-safety | 2064 | 3001 | 3495 | 118 | 3 | 0.15% | 0 | 0 |
| hard@desktop | 2055 | 3001 | 11918 | 147 | 3 | 0.15% | 0 | 0 |

## How the search stopped (AMENDMENTS-DECIDED A16)

abortedSearches: searches the engine abandoned on its watchdog rather than on its work rung — under A11 that watchdog is the turn's remaining allowance, so this counts the moves the CLOCK chose. abortRate = abortedSearches / searches. firstSearchAborted: games whose FIRST search was one of them (the cold profile, still INITIAL_UNITS_PER_MS, has measured nothing yet). emptyPlans: searches that returned no actions, where the adapter ends the phase through phaseEndAction (A10). Counted PER SEAT since E1.5 (PlayerGameStats.hardTiming), so a Hard-vs-Hard row attributes them per arm; older records fall back to the process-wide counters, which only a run with one hard@ arm can own. n/a means neither source says anything about this arm — never that the count was zero.

| engine | searches | abortedSearches | abortRate | firstSearchAborted | emptyPlans |
| --- | --- | --- | --- | --- | --- |
| hard@ablate:eval-no-safety | 2064 | 141 | 6.83% | 44 | 0 |
| hard@desktop | 2055 | 178 | 8.66% | 34 | 0 |

## Per-handicap strata

| handicap | pairs | games | score (A) | W/D/L | Elo |
| --- | --- | --- | --- | --- | --- |
| 0 | 16/16 | 32 | 0.719 | 23/0/9 | 163.0 |
| 3 | 16/16 | 32 | 0.625 | 19/2/11 | 88.7 |
