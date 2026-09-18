# profile e1-dev at fixed:100000, hard@desktop

generated 2026-09-18T00:13:43.255Z, git 437ee40fd29f594f017e90f850762c6092864772 (DIRTY tree), Apple M2 Max x12 (darwin/arm64), node v24.11.1
engine config hash hard:desktop:fixed:100000#387244209047c03daa71ed9b2852fdf13d79fbc16f3d3e80fd7fcf7d5a9f8ffc, resolved 387244209047c03daa71ed9b2852fdf13d79fbc16f3d3e80fd7fcf7d5a9f8ffc

16 position(s) profiled, 0 skipped, abort share 0.0%, mean completed iterations 2.00, dominant bucket **tables**

| bucket | mean share of profiled wall time |
| --- | ---: |
| tables | 75.6% |
| prover | 12.0% |
| generation | 6.6% |
| evaluation | 3.3% |
| canonicalVerify | 1.3% |
| other | 0.7% |
| replySearch | 0.4% |
| instrument | 0.0% |
| quiescence | 0.0% |

top 3 functions by summed self time:
- 4020.8 ms  `bfsFrom` @ src/ai/hard/core/movement.ts:0 (tables)
- 2120.7 ms  `spawnGeometry` @ src/ai/hard/tables/geometry.ts:0 (tables)
- 1921.0 ms  `runKillDp` @ src/ai/hard/tables/kill.ts:0 (tables)

| position | side | turn | totalMs | searchMs | canonicalReplayMs | completedIters | rootListed | rootSearched | stop | source |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| e1-dev:e1-g3-s105:turn6 | white | 6 | 1334 | 1318 | 0.1 | 2 | 34 | 34 | work | search |
| e1-dev:e1-g2-s40:turn6 | white | 6 | 1068 | 1052 | 0.3 | 2 | 35 | 35 | work | search |
| e1-dev:e1-g4-s250:turn6 | white | 6 | 1360 | 1349 | 0.2 | 2 | 35 | 35 | work | search |
| e1-dev:e1-g4-s750:turn6 | white | 6 | 1194 | 1181 | 0.1 | 2 | 33 | 33 | work | search |
| e1-dev:e1-g4-s730:turn6 | white | 6 | 1134 | 1125 | 0.1 | 2 | 35 | 35 | work | search |
| e1-dev:e1-g3-s745:turn6 | white | 6 | 1799 | 1783 | 0.1 | 2 | 34 | 34 | work | search |
| e1-dev:e1-g4-s510:turn6 | white | 6 | 1190 | 1176 | 0.1 | 2 | 36 | 36 | work | search |
| e1-dev:e1-g2-s155:turn6 | white | 6 | 1989 | 1972 | 0.1 | 2 | 33 | 33 | work | search |
| e1-dev:e1-g3-s205:turn6 | white | 6 | 1629 | 1615 | 0.3 | 2 | 36 | 36 | work | search |
| e1-dev:e1-g4-s550:turn6 | white | 6 | 1734 | 1718 | 0.1 | 2 | 36 | 36 | work | search |
| e1-dev:e1-g5-s55:turn6 | white | 6 | 1144 | 1133 | 0.1 | 2 | 36 | 36 | work | search |
| e1-dev:e1-g5-s1035:turn6 | white | 6 | 1227 | 1214 | 0.1 | 2 | 36 | 36 | work | search |
| e1-dev:e1-g4-s430:turn6 | white | 6 | 1164 | 1151 | 0.8 | 2 | 37 | 37 | work | search |
| e1-dev:e1-g3-s5:turn6 | white | 6 | 1103 | 1090 | 0.2 | 2 | 34 | 34 | work | search |
| e1-dev:e1-g5-s415:turn6 | white | 6 | 1330 | 1317 | 0.1 | 2 | 36 | 36 | work | search |
| e1-dev:e1-g3-s625:turn6 | white | 6 | 1121 | 1108 | 0.1 | 2 | 33 | 33 | work | search |
