# Work sweep — when does the engine choose the adviser’s turn?

Production engine: each artifact’s own (`config.engineLabel`).

Mode **fresh** (a new engine per measured search; no table carried between rungs or turns).

1 turn(s) from `/private/tmp/claude-501/-Users-ashkie-src/cd40736e-60ca-490c-bc97-ac7331c3a88d/scratchpad/lane10/sweep-src`, each re-run at 100k, 200k, 283k, 400k, 566k, 800k units with the root instrument on. A turn "flips" at the lowest rung whose choice is the adviser's own best turn or one the adviser scores within 300 cc of its best.

6 production searches and 0 adviser searches; 24 s of wall time.

## Flip work

| flip work | turns |
| --- | ---: |
| never | 1 |

Flipped at or below 400k: 0 of 1. Never flipped up to 800k: 1.

## Per turn

| game | turn | class | flip work | seat ms | implied work @100/ms | @200/ms | played reproduced at any rung | chosen turn by rung |
| --- | ---: | --- | ---: | ---: | ---: | ---: | :-: | --- |
| `g4-s6_3_5-B-white` | 1 | strong-candidate-misjudged | never | 2110 | 211k | 422k | yes | 100k:P 200k:P 283k:P 400k:P 566k:P 800k:P |

`A` = the adviser’s own best turn, `~` = within tolerance of it, `P` = the turn the seat played, `o` = neither.

The implied-work columns are the seat's own wall time at 100 and at 200 units per millisecond. They are a conversion, not a measurement: the seat ran `chooseWork` against its own measured rate with ×2 quantisation, and its turn time includes generation, verification and the prover, not only the root search.
