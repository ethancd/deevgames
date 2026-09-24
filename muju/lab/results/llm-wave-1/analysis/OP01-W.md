# Replay analysis — OP01-W

Seat under analysis: **black** (`hard@desktop`) against `llm@claude-opus-5-5`, opening `initial`. The game ended kill-clock for white after 5 turns — a **loss** for this seat.

Adviser: `hard@desktop` at 1,600,000 work units; production re-run at 400,000 units (the ladder's representative rung for this profile is 400,000). Swing threshold 300 cc. Generator K=24 at the root, 16 at a reply node. Reconstruction replayed 48 plies through the canonical engine and matched `meta`.

**An adviser is not an oracle.** Every number below is the same evaluation looking further, not ground truth.

## Per-turn table

| turn | played | played key | in K? | adviser | adviser key | K has adviser? | played cc | adviser cc | swing cc | engine cc | turn ms |
| ---: | --- | --- | :-: | --- | --- | :-: | ---: | ---: | ---: | ---: | ---: |
| 1 | MOVE 9,8→9,9 MOVE 8,8→9,8 MOVE 9,8→9,7 MOVE 8,9→8,8 END_ACTION BUY fire_1@8,9 BUY metal_1@9,8 END_PLACE | `ce07f87d` | yes | MOVE 9,8→9,9 MOVE 8,8→9,8 MOVE 9,8→9,7 MOVE 8,9→8,8 END_ACTION BUY fire_1@8,9 BUY metal_1@9,8 END_PLACE | `ce07f87d` | yes | -1,300 | -1,300 | 0 | 1,210 | 60016 |
| 2 | END_ACTION END_PLACE | `ca816750` | yes | END_ACTION END_PLACE | `ca816750` | yes | -388 | -388 | 0 | -2,378 | 60002 |
| 3 | END_ACTION END_PLACE | `d9fa64ae` | yes | END_ACTION END_PLACE | `d9fa64ae` | yes | -3,978 | -3,978 | 0 | -3,800 | 44314 |
| 4 | END_ACTION END_PLACE | `39ae755a` | yes | MOVE 8,8→8,2 MOVE 8,2→7,1 END_ACTION BUY plant_1@8,1 BUY plant_1@7,2 BUY plant_1@8,2 BUY plant_1@7,9 END_PLACE | `e4bc7f9a` | yes | -998,000 | -11,716 | 986,284 | -5,853 | 47793 |
| 5 | END_ACTION END_PLACE | `7c94b77f` | yes | END_ACTION END_PLACE | `7c94b77f` | yes | -999,000 | -999,000 | 0 | -999,000 | 112 |

`played cc` is the adviser's value of the position the played turn left, searched at the adviser rung and taken from this seat's point of view; `adviser cc` is the identical treatment of the adviser's own best turn; `swing cc` is their difference. `engine cc` is the production engine's own root score from the same state at the ladder rung.

### First consequential decision

**clock-fallback** at turn 4 (the seat's turn #4).

Rule: the seat's own turn wall time exceeded its allowance (max(10ms, 1%) tolerance), or the turn dispatched nothing but phase ends, or the adviser itself returned a fallback (pack-error / engine-error / divergence). Per-turn wall time is real (players[side].turnMs); the run's overruns/budgetExhausted counters are per GAME, so a fallback on a specific turn can be suspected from them but not proved

Evidence: the turn dispatched nothing but phase ends

### Largest swing

**clock-fallback** at turn 4 (the seat's turn #4).

Rule: the seat's own turn wall time exceeded its allowance (max(10ms, 1%) tolerance), or the turn dispatched nothing but phase ends, or the adviser itself returned a fallback (pack-error / engine-error / divergence). Per-turn wall time is real (players[side].turnMs); the run's overruns/budgetExhausted counters are per GAME, so a fallback on a specific turn can be suspected from them but not proved

Evidence: the turn dispatched nothing but phase ends

_98021 ms of analysis wall time; analyser config `hard:desktop:fixed:1600000#b449e33af2dcba68fbbef5f4f0e2e165c09d835b4f619cbd5274b5bb4fbbd2be`; run recorded `none`._
