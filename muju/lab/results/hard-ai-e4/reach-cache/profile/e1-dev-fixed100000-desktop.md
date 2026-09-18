# profile e1-dev at fixed:100000, hard@desktop

generated 2026-09-18T01:06:44.000Z, git 89de58f712eda586bb92693cfed92c639290e061 (DIRTY tree), Apple M2 Max x12 (darwin/arm64), node v24.11.1
engine config hash hard:desktop:fixed:100000#387244209047c03daa71ed9b2852fdf13d79fbc16f3d3e80fd7fcf7d5a9f8ffc, resolved 387244209047c03daa71ed9b2852fdf13d79fbc16f3d3e80fd7fcf7d5a9f8ffc

16 position(s) profiled, 0 skipped, abort share 0.0%, mean completed iterations 2.00, dominant bucket **tables**

| bucket | mean share of profiled wall time |
| --- | ---: |
| tables | 76.1% |
| prover | 11.6% |
| generation | 6.6% |
| evaluation | 3.2% |
| canonicalVerify | 1.4% |
| other | 0.7% |
| replySearch | 0.3% |
| instrument | 0.0% |
| quiescence | 0.0% |

top 3 functions by summed self time:
- 1858.1 ms  `bfsFrom` @ src/ai/hard/core/movement.ts:0 (tables)
- 1293.9 ms  `runKillDp` @ src/ai/hard/tables/kill.ts:0 (tables)
- 1085.4 ms  `spawnGeometry` @ src/ai/hard/tables/geometry.ts:0 (tables)

| position | side | turn | totalMs | searchMs | canonicalReplayMs | completedIters | rootListed | rootSearched | stop | source |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| e1-dev:e1-g3-s105:turn6 | white | 6 | 1323 | 1307 | 0.1 | 2 | 34 | 34 | work | search |
| e1-dev:e1-g2-s40:turn6 | white | 6 | 1078 | 1066 | 0.2 | 2 | 35 | 35 | work | search |
| e1-dev:e1-g4-s250:turn6 | white | 6 | 1367 | 1356 | 0.2 | 2 | 35 | 35 | work | search |
| e1-dev:e1-g4-s750:turn6 | white | 6 | 1177 | 1165 | 0.1 | 2 | 33 | 33 | work | search |
| e1-dev:e1-g4-s730:turn6 | white | 6 | 1099 | 1089 | 0.1 | 2 | 35 | 35 | work | search |
| e1-dev:e1-g3-s745:turn6 | white | 6 | 1774 | 1759 | 0.1 | 2 | 34 | 34 | work | search |
| e1-dev:e1-g4-s510:turn6 | white | 6 | 1065 | 1054 | 0.1 | 2 | 36 | 36 | work | search |
| e1-dev:e1-g2-s155:turn6 | white | 6 | 1722 | 1706 | 0.1 | 2 | 33 | 33 | work | search |
| e1-dev:e1-g3-s205:turn6 | white | 6 | 1414 | 1401 | 0.4 | 2 | 36 | 36 | work | search |
| e1-dev:e1-g4-s550:turn6 | white | 6 | 1532 | 1517 | 0.0 | 2 | 36 | 36 | work | search |
| e1-dev:e1-g5-s55:turn6 | white | 6 | 1094 | 1082 | 0.1 | 2 | 36 | 36 | work | search |
| e1-dev:e1-g5-s1035:turn6 | white | 6 | 1184 | 1172 | 0.1 | 2 | 36 | 36 | work | search |
| e1-dev:e1-g4-s430:turn6 | white | 6 | 1076 | 1063 | 0.8 | 2 | 37 | 37 | work | search |
| e1-dev:e1-g3-s5:turn6 | white | 6 | 1090 | 1077 | 0.2 | 2 | 34 | 34 | work | search |
| e1-dev:e1-g5-s415:turn6 | white | 6 | 1265 | 1252 | 0.1 | 2 | 36 | 36 | work | search |
| e1-dev:e1-g3-s625:turn6 | white | 6 | 1122 | 1108 | 0.1 | 2 | 33 | 33 | work | search |
