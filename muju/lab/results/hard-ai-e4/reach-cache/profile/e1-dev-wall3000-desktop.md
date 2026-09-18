# profile e1-dev at wall:3000, hard@desktop

generated 2026-09-18T01:13:38.545Z, git 89de58f712eda586bb92693cfed92c639290e061 (DIRTY tree), Apple M2 Max x12 (darwin/arm64), node v24.11.1
engine config hash hard:desktop:wall:3000#4e7afdf76b32fadfab2d11577cb610c8f9f1a491b5153e70b87b0774403600cd, resolved 4e7afdf76b32fadfab2d11577cb610c8f9f1a491b5153e70b87b0774403600cd

16 position(s) profiled, 0 skipped, abort share 6.3%, mean completed iterations 2.00, dominant bucket **tables**

| bucket | mean share of profiled wall time |
| --- | ---: |
| tables | 75.9% |
| prover | 11.7% |
| generation | 6.6% |
| evaluation | 3.2% |
| canonicalVerify | 1.4% |
| other | 0.8% |
| replySearch | 0.3% |
| instrument | 0.0% |
| quiescence | 0.0% |

top 3 functions by summed self time:
- 2031.1 ms  `bfsFrom` @ src/ai/hard/core/movement.ts:0 (tables)
- 1355.3 ms  `runKillDp` @ src/ai/hard/tables/kill.ts:0 (tables)
- 1091.2 ms  `spawnGeometry` @ src/ai/hard/tables/geometry.ts:0 (tables)

| position | side | turn | totalMs | searchMs | canonicalReplayMs | completedIters | rootListed | rootSearched | stop | source |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| e1-dev:e1-g3-s105:turn6 | white | 6 | 3036 | 3009 | 0.1 | 2 | 34 | 34 | abort | search |
| e1-dev:e1-g2-s40:turn6 | white | 6 | 1068 | 1055 | 0.2 | 2 | 35 | 35 | work | search |
| e1-dev:e1-g4-s250:turn6 | white | 6 | 1368 | 1357 | 0.3 | 2 | 35 | 35 | work | search |
| e1-dev:e1-g4-s750:turn6 | white | 6 | 1197 | 1185 | 0.1 | 2 | 33 | 33 | work | search |
| e1-dev:e1-g4-s730:turn6 | white | 6 | 1092 | 1083 | 0.1 | 2 | 35 | 35 | work | search |
| e1-dev:e1-g3-s745:turn6 | white | 6 | 1787 | 1771 | 0.1 | 2 | 34 | 34 | work | search |
| e1-dev:e1-g4-s510:turn6 | white | 6 | 1060 | 1048 | 0.1 | 2 | 36 | 36 | work | search |
| e1-dev:e1-g2-s155:turn6 | white | 6 | 1728 | 1712 | 0.1 | 2 | 33 | 33 | work | search |
| e1-dev:e1-g3-s205:turn6 | white | 6 | 1419 | 1407 | 0.3 | 2 | 36 | 36 | work | search |
| e1-dev:e1-g4-s550:turn6 | white | 6 | 1536 | 1520 | 0.0 | 2 | 36 | 36 | work | search |
| e1-dev:e1-g5-s55:turn6 | white | 6 | 1106 | 1094 | 0.1 | 2 | 36 | 36 | work | search |
| e1-dev:e1-g5-s1035:turn6 | white | 6 | 1182 | 1170 | 0.1 | 2 | 36 | 36 | work | search |
| e1-dev:e1-g4-s430:turn6 | white | 6 | 1081 | 1068 | 0.8 | 2 | 37 | 37 | work | search |
| e1-dev:e1-g3-s5:turn6 | white | 6 | 1091 | 1077 | 0.2 | 2 | 34 | 34 | work | search |
| e1-dev:e1-g5-s415:turn6 | white | 6 | 1287 | 1274 | 0.1 | 2 | 36 | 36 | work | search |
| e1-dev:e1-g3-s625:turn6 | white | 6 | 1132 | 1119 | 0.1 | 2 | 33 | 33 | work | search |
