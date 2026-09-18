# Work sweep — when does the engine choose the adviser’s turn?

Mode **fresh** (a new engine per measured search; no table carried between rungs or turns).

14 turn(s) from `/Users/ashkie/src/deevgames-e2-lane2/muju/lab/results/hard-ai-e2/analysis/e1.1-losses-exposed`, each re-run at 100k, 200k, 283k, 400k, 566k, 800k units with the root instrument on. A turn "flips" at the lowest rung whose choice is the adviser's own best turn or one the adviser scores within 300 cc of its best.

84 production searches and 6 adviser searches; 426 s of wall time.

## Flip work

| flip work | turns |
| --- | ---: |
| 283k | 3 |
| 400k | 6 |
| 566k | 1 |
| never | 4 |

Flipped at or below 400k: 9 of 14. Never flipped up to 800k: 4.

## Per turn

| game | turn | class | flip work | seat ms | implied work @100/ms | @200/ms | played reproduced at any rung | chosen turn by rung |
| --- | ---: | --- | ---: | ---: | ---: | ---: | :-: | --- |
| `g2-s20_3_15-A-white` | 3 | strong-candidate-misjudged | never | 2782 | 278k | 556k | yes | 100k:P 200k:P 283k:P 400k:P 566k:P 800k:P |
| `g2-s20_3_15-B-white` | 7 | fixed-work-divergence | 283k | 860 | 86k | 172k | yes | 100k:P 200k:P 283k:~ 400k:o 566k:A 800k:o |
| `g2-s5_0_2-A-white` | 4 | fixed-work-divergence | 400k | 2633 | 263k | 527k | yes | 100k:P 200k:P 283k:P 400k:A 566k:A 800k:A |
| `g4-s10_0_8-A-white` | 3 | fixed-work-divergence | 283k | 2791 | 279k | 558k | yes | 100k:P 200k:P 283k:A 400k:A 566k:A 800k:A |
| `g4-s10_0_8-B-white` | 7 | fixed-work-divergence | 400k | 3015 | 302k | 603k | yes | 100k:P 200k:P 283k:P 400k:A 566k:A 800k:A |
| `g4-s10_3_9-A-white` | 2 | strong-candidate-misjudged | never | 1907 | 191k | 381k | yes | 100k:o 200k:P 283k:P 400k:P 566k:P 800k:P |
| `g4-s2_3_1-B-white` | 2 | fixed-work-divergence | 283k | 2205 | 221k | 441k | yes | 100k:P 200k:P 283k:A 400k:A 566k:A 800k:A |
| `g4-s6_0_4-A-white` | 4 | fixed-work-divergence | 400k | 1411 | 141k | 282k | yes | 100k:P 200k:P 283k:P 400k:~ 566k:~ 800k:~ |
| `g4-s6_3_5-A-white` | 4 | fixed-work-divergence | 400k | 2549 | 255k | 510k | yes | 100k:P 200k:P 283k:P 400k:A 566k:A 800k:A |
| `g4-s6_3_5-B-white` | 1 | strong-candidate-misjudged | never | 2110 | 211k | 422k | yes | 100k:P 200k:P 283k:P 400k:P 566k:P 800k:P |
| `g5-s11_0_10-B-white` | 1 | fixed-work-divergence | 400k | 3006 | 301k | 601k | yes | 100k:P 200k:P 283k:P 400k:~ 566k:~ 800k:~ |
| `g5-s11_3_11-B-white` | 2 | strong-candidate-misjudged | 566k | 2465 | 247k | 493k | yes | 100k:P 200k:P 283k:P 400k:P 566k:A 800k:A |
| `g5-s7_3_7-A-white` | 4 | fixed-work-divergence | 400k | 2690 | 269k | 538k | yes | 100k:P 200k:P 283k:P 400k:A 566k:A 800k:A |
| `g5-s7_3_7-B-white` | 1 | strong-candidate-misjudged | never | 2099 | 210k | 420k | yes | 100k:P 200k:P 283k:P 400k:P 566k:P 800k:P |

`A` = the adviser’s own best turn, `~` = within tolerance of it, `P` = the turn the seat played, `o` = neither.

The implied-work columns are the seat's own wall time at 100 and at 200 units per millisecond. They are a conversion, not a measurement: the seat ran `chooseWork` against its own measured rate with ×2 quantisation, and its turn time includes generation, verification and the prover, not only the root search.
