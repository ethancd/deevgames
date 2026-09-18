# profile e1-dev at fixed:100000, hard@ablate:search-reach-cache

generated 2026-09-18T01:07:05.228Z, git 89de58f712eda586bb92693cfed92c639290e061 (DIRTY tree), Apple M2 Max x12 (darwin/arm64), node v24.11.1
engine config hash hard:ablate:search-reach-cache:fixed:100000#fb7dcf089720ed34aa988b6f2d48e092dd0ea86183f2b1587307262fc7a770e0, resolved fb7dcf089720ed34aa988b6f2d48e092dd0ea86183f2b1587307262fc7a770e0

16 position(s) profiled, 0 skipped, abort share 0.0%, mean completed iterations 2.00, dominant bucket **tables**

| bucket | mean share of profiled wall time |
| --- | ---: |
| tables | 77.4% |
| prover | 10.0% |
| generation | 6.9% |
| evaluation | 3.3% |
| canonicalVerify | 1.3% |
| other | 0.7% |
| replySearch | 0.3% |
| instrument | 0.0% |
| quiescence | 0.0% |

top 3 functions by summed self time:
- 1420.0 ms  `bfsFrom` @ src/ai/hard/core/movement.ts:0 (tables)
- 1284.7 ms  `runKillDp` @ src/ai/hard/tables/kill.ts:0 (tables)
- 1103.8 ms  `spawnGeometry` @ src/ai/hard/tables/geometry.ts:0 (tables)

| position | side | turn | totalMs | searchMs | canonicalReplayMs | completedIters | rootListed | rootSearched | stop | source |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| e1-dev:e1-g3-s105:turn6 | white | 6 | 1301 | 1285 | 0.1 | 2 | 34 | 34 | work | search |
| e1-dev:e1-g2-s40:turn6 | white | 6 | 1047 | 1034 | 0.2 | 2 | 35 | 35 | work | search |
| e1-dev:e1-g4-s250:turn6 | white | 6 | 1336 | 1324 | 0.2 | 2 | 35 | 35 | work | search |
| e1-dev:e1-g4-s750:turn6 | white | 6 | 1147 | 1135 | 0.1 | 2 | 33 | 33 | work | search |
| e1-dev:e1-g4-s730:turn6 | white | 6 | 1038 | 1028 | 0.1 | 2 | 35 | 35 | work | search |
| e1-dev:e1-g3-s745:turn6 | white | 6 | 1649 | 1634 | 0.1 | 2 | 34 | 34 | work | search |
| e1-dev:e1-g4-s510:turn6 | white | 6 | 1035 | 1023 | 0.1 | 2 | 36 | 36 | work | search |
| e1-dev:e1-g2-s155:turn6 | white | 6 | 1673 | 1656 | 0.1 | 2 | 33 | 33 | work | search |
| e1-dev:e1-g3-s205:turn6 | white | 6 | 1393 | 1380 | 0.4 | 2 | 36 | 36 | work | search |
| e1-dev:e1-g4-s550:turn6 | white | 6 | 1421 | 1406 | 0.0 | 2 | 36 | 36 | work | search |
| e1-dev:e1-g5-s55:turn6 | white | 6 | 1054 | 1042 | 0.1 | 2 | 36 | 36 | work | search |
| e1-dev:e1-g5-s1035:turn6 | white | 6 | 1156 | 1143 | 0.1 | 2 | 36 | 36 | work | search |
| e1-dev:e1-g4-s430:turn6 | white | 6 | 1067 | 1054 | 0.8 | 2 | 37 | 37 | work | search |
| e1-dev:e1-g3-s5:turn6 | white | 6 | 1035 | 1022 | 0.2 | 2 | 34 | 34 | work | search |
| e1-dev:e1-g5-s415:turn6 | white | 6 | 1212 | 1199 | 0.1 | 2 | 36 | 36 | work | search |
| e1-dev:e1-g3-s625:turn6 | white | 6 | 1124 | 1110 | 0.1 | 2 | 33 | 33 | work | search |
