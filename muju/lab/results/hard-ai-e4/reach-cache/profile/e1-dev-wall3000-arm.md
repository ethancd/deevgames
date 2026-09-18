# profile e1-dev at wall:3000, hard@ablate:search-reach-cache

generated 2026-09-18T01:14:31.080Z, git 89de58f712eda586bb92693cfed92c639290e061 (DIRTY tree), Apple M2 Max x12 (darwin/arm64), node v24.11.1
engine config hash hard:ablate:search-reach-cache:wall:3000#5ba2c2fc352d4715f790f9ce0fdb6e1b4926d1c49edce923f8169f88fdad0a51, resolved 5ba2c2fc352d4715f790f9ce0fdb6e1b4926d1c49edce923f8169f88fdad0a51

16 position(s) profiled, 0 skipped, abort share 6.3%, mean completed iterations 2.00, dominant bucket **tables**

| bucket | mean share of profiled wall time |
| --- | ---: |
| tables | 77.3% |
| prover | 9.9% |
| generation | 6.9% |
| evaluation | 3.2% |
| canonicalVerify | 1.5% |
| other | 0.8% |
| replySearch | 0.3% |
| instrument | 0.0% |
| quiescence | 0.0% |

top 3 functions by summed self time:
- 1500.2 ms  `bfsFrom` @ src/ai/hard/core/movement.ts:0 (tables)
- 1406.2 ms  `runKillDp` @ src/ai/hard/tables/kill.ts:0 (tables)
- 1158.1 ms  `spawnGeometry` @ src/ai/hard/tables/geometry.ts:0 (tables)

| position | side | turn | totalMs | searchMs | canonicalReplayMs | completedIters | rootListed | rootSearched | stop | source |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| e1-dev:e1-g3-s105:turn6 | white | 6 | 3039 | 3009 | 0.1 | 2 | 34 | 34 | abort | search |
| e1-dev:e1-g2-s40:turn6 | white | 6 | 1039 | 1025 | 0.2 | 2 | 35 | 35 | work | search |
| e1-dev:e1-g4-s250:turn6 | white | 6 | 1389 | 1377 | 0.2 | 2 | 35 | 35 | work | search |
| e1-dev:e1-g4-s750:turn6 | white | 6 | 1169 | 1156 | 0.1 | 2 | 33 | 33 | work | search |
| e1-dev:e1-g4-s730:turn6 | white | 6 | 1047 | 1037 | 0.1 | 2 | 35 | 35 | work | search |
| e1-dev:e1-g3-s745:turn6 | white | 6 | 1652 | 1636 | 0.1 | 2 | 34 | 34 | work | search |
| e1-dev:e1-g4-s510:turn6 | white | 6 | 1044 | 1031 | 0.1 | 2 | 36 | 36 | work | search |
| e1-dev:e1-g2-s155:turn6 | white | 6 | 1682 | 1666 | 0.1 | 2 | 33 | 33 | work | search |
| e1-dev:e1-g3-s205:turn6 | white | 6 | 1389 | 1377 | 0.4 | 2 | 36 | 36 | work | search |
| e1-dev:e1-g4-s550:turn6 | white | 6 | 1437 | 1422 | 0.0 | 2 | 36 | 36 | work | search |
| e1-dev:e1-g5-s55:turn6 | white | 6 | 1069 | 1058 | 0.1 | 2 | 36 | 36 | work | search |
| e1-dev:e1-g5-s1035:turn6 | white | 6 | 1151 | 1139 | 0.1 | 2 | 36 | 36 | work | search |
| e1-dev:e1-g4-s430:turn6 | white | 6 | 1081 | 1068 | 0.8 | 2 | 37 | 37 | work | search |
| e1-dev:e1-g3-s5:turn6 | white | 6 | 1056 | 1043 | 0.2 | 2 | 34 | 34 | work | search |
| e1-dev:e1-g5-s415:turn6 | white | 6 | 1218 | 1205 | 0.1 | 2 | 36 | 36 | work | search |
| e1-dev:e1-g3-s625:turn6 | white | 6 | 1114 | 1100 | 0.1 | 2 | 33 | 33 | work | search |
