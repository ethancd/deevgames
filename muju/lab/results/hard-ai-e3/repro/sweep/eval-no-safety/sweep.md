# Work sweep — when does the engine choose the adviser’s turn?

Production engine **`hard@ablate:eval-no-safety`** (weights `default-v1-no-safety`); the adviser that scores each chosen turn is unchanged, so "the adviser’s best" is still the champion’s adviser and the rungs are comparable with the default sweep.

Mode **fresh** (a new engine per measured search; no table carried between rungs or turns).

1 turn(s) from `/private/tmp/claude-501/-Users-ashkie-src/cd40736e-60ca-490c-bc97-ac7331c3a88d/scratchpad/lane10/sweep-src`, each re-run at 100k, 200k, 283k, 400k, 566k, 800k units with the root instrument on. A turn "flips" at the lowest rung whose choice is the adviser's own best turn or one the adviser scores within 300 cc of its best.

6 production searches and 1 adviser searches; 32 s of wall time.

## Flip work

| flip work | turns |
| --- | ---: |
| 400k | 1 |

Flipped at or below 400k: 1 of 1. Never flipped up to 800k: 0.

## Per turn

| game | turn | class | flip work | seat ms | implied work @100/ms | @200/ms | played reproduced at any rung | chosen turn by rung |
| --- | ---: | --- | ---: | ---: | ---: | ---: | :-: | --- |
| `g4-s6_3_5-B-white` | 1 | strong-candidate-misjudged | 400k | 2110 | 211k | 422k | yes | 100k:P 200k:P 283k:P 400k:~ 566k:~ 800k:~ |

`A` = the adviser’s own best turn, `~` = within tolerance of it, `P` = the turn the seat played, `o` = neither.

The implied-work columns are the seat's own wall time at 100 and at 200 units per millisecond. They are a conversion, not a measurement: the seat ran `chooseWork` against its own measured rate with ×2 quantisation, and its turn time includes generation, verification and the prover, not only the root search.
