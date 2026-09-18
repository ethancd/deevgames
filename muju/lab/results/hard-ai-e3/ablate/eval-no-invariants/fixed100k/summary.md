# Ladder: hard@ablate:eval-no-invariants vs hard@desktop

- status: **complete**
- work: `fixed:100000`, handicaps: `0,3`, seed: 34, shards: 1
- openings: used 4 of 48 — e1-g3-s105, e1-g2-s40, e1-g4-s250, e1-g4-s750, e1-g4-s730, e1-g3-s745, e1-g4-s510, e1-g2-s155, e1-g3-s205, e1-g4-s550, e1-g5-s55, e1-g5-s1035, e1-g4-s430, e1-g3-s5, e1-g5-s415, e1-g3-s625, e1-g4-s110, e1-g5-s975, e1-g4-s470, e1-g3-s375, e1-g4-s830, e1-g5-s255, e1-g5-s935, e1-g4-s650, e1-g4-s1030, e1-g5-s295, e1-g2-s425, e1-g3-s165, e1-g4-s50, e1-g5-s755, e1-g4-s350, e1-g3-s465, e1-g5-s195, e1-g2-s680, e1-g4-s30, e1-g5-s655, e1-g3-s485, e1-g5-s315, e1-g4-s630, e1-g5-s955, e1-g2-s100, e1-g4-s850, e1-g5-s915, e1-g5-s555, e1-g3-s325, e1-g3-s305, e1-g5-s695, e1-g2-s420 (sha256 bba8ea56b1bc)
- openingsIndependent: true
- distinctGames: A-white 8, B-white 8 of 8 pair(s) (digested from the replays)
- pairs: 8/8, games: 16/16 (missing 0, failed 0)
- A record (W/D/L): 8/0/8
- adjudicationRate: 0.00%
- illegalActions: 0, replicaDivergences: 0, timingAnomalies: 0
- bothSeatsPlayed: true, seatMirrored: true
- Elo (A vs B): 0.0 [-186.2, 186.2], LOS 50.0%, n = 8 pairs / 16 games
- SPRT: not requested
- SPRT (sequential): not requested
- meanTurnMs: a=1080.0 b=1107.2

## Per-engine turn timing (AMENDMENTS-DECIDED A4)

Allowance: none (fixed work has no clock).
Tolerance: max(10ms,1%), frozen (AMENDMENTS-DECIDED A14). overAllowance counts any ms past the allowance; overruns counts the turns past the tolerance; overrunRate = overruns / turns, and above 5% for either arm the row is VOID (AMENDMENTS-DECIDED A14).

| engine | turns | p95TurnMs | maxTurnMs | overAllowance | overruns | overrunRate | budgetExhausted | reSearches |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| hard@ablate:eval-no-invariants | 577 | 1809 | 3268 | 0 | 0 | n/a | 0 | 0 |
| hard@desktop | 577 | 1791 | 2292 | 0 | 0 | n/a | 0 | 0 |

## How the search stopped (AMENDMENTS-DECIDED A16)

abortedSearches: searches the engine abandoned on its watchdog rather than on its work rung — under A11 that watchdog is the turn's remaining allowance, so this counts the moves the CLOCK chose. abortRate = abortedSearches / searches. firstSearchAborted: games whose FIRST search was one of them (the cold profile, still INITIAL_UNITS_PER_MS, has measured nothing yet). emptyPlans: searches that returned no actions, where the adapter ends the phase through phaseEndAction (A10). Counted PER SEAT since E1.5 (PlayerGameStats.hardTiming), so a Hard-vs-Hard row attributes them per arm; older records fall back to the process-wide counters, which only a run with one hard@ arm can own. n/a means neither source says anything about this arm — never that the count was zero.

| engine | searches | abortedSearches | abortRate | firstSearchAborted | emptyPlans |
| --- | --- | --- | --- | --- | --- |
| hard@ablate:eval-no-invariants | 577 | 0 | 0.00% | 0 | 0 |
| hard@desktop | 577 | 0 | 0.00% | 0 | 0 |

## Per-handicap strata

| handicap | pairs | games | score (A) | W/D/L | Elo |
| --- | --- | --- | --- | --- | --- |
| 0 | 4/4 | 8 | 0.625 | 5/0/3 | 88.7 |
| 3 | 4/4 | 8 | 0.375 | 3/0/5 | -88.7 |
