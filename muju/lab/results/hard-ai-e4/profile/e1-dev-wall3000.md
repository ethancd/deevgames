# profile e1-dev at wall:3000, hard@desktop

generated 2026-09-18T00:15:50.163Z, git 437ee40fd29f594f017e90f850762c6092864772 (DIRTY tree), Apple M2 Max x12 (darwin/arm64), node v24.11.1
engine config hash hard:desktop:wall:3000#4e7afdf76b32fadfab2d11577cb610c8f9f1a491b5153e70b87b0774403600cd, resolved 4e7afdf76b32fadfab2d11577cb610c8f9f1a491b5153e70b87b0774403600cd

16 position(s) profiled, 0 skipped, abort share 6.3%, mean completed iterations 2.00, dominant bucket **tables**

| bucket | mean share of profiled wall time |
| --- | ---: |
| tables | 75.6% |
| prover | 12.0% |
| generation | 6.5% |
| evaluation | 3.4% |
| canonicalVerify | 1.3% |
| other | 0.9% |
| replySearch | 0.4% |
| instrument | 0.0% |
| quiescence | 0.0% |

top 3 functions by summed self time:
- 4732.9 ms  `bfsFrom` @ src/ai/hard/core/movement.ts:0 (tables)
- 2398.2 ms  `spawnGeometry` @ src/ai/hard/tables/geometry.ts:0 (tables)
- 2213.9 ms  `runKillDp` @ src/ai/hard/tables/kill.ts:0 (tables)

| position | side | turn | totalMs | searchMs | canonicalReplayMs | completedIters | rootListed | rootSearched | stop | source |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| e1-dev:e1-g3-s105:turn6 | white | 6 | 3036 | 3008 | 0.1 | 2 | 34 | 34 | abort | search |
| e1-dev:e1-g2-s40:turn6 | white | 6 | 1100 | 1087 | 0.2 | 2 | 35 | 35 | work | search |
| e1-dev:e1-g4-s250:turn6 | white | 6 | 1432 | 1420 | 0.2 | 2 | 35 | 35 | work | search |
| e1-dev:e1-g4-s750:turn6 | white | 6 | 1260 | 1247 | 0.1 | 2 | 33 | 33 | work | search |
| e1-dev:e1-g4-s730:turn6 | white | 6 | 1134 | 1124 | 0.1 | 2 | 35 | 35 | work | search |
| e1-dev:e1-g3-s745:turn6 | white | 6 | 1857 | 1840 | 0.1 | 2 | 34 | 34 | work | search |
| e1-dev:e1-g4-s510:turn6 | white | 6 | 1101 | 1088 | 0.1 | 2 | 36 | 36 | work | search |
| e1-dev:e1-g2-s155:turn6 | white | 6 | 1816 | 1799 | 0.1 | 2 | 33 | 33 | work | search |
| e1-dev:e1-g3-s205:turn6 | white | 6 | 1553 | 1540 | 0.6 | 2 | 36 | 36 | work | search |
| e1-dev:e1-g4-s550:turn6 | white | 6 | 1704 | 1681 | 0.0 | 2 | 36 | 36 | work | search |
| e1-dev:e1-g5-s55:turn6 | white | 6 | 1621 | 1604 | 0.2 | 2 | 36 | 36 | work | search |
| e1-dev:e1-g5-s1035:turn6 | white | 6 | 1779 | 1766 | 0.1 | 2 | 36 | 36 | work | search |
| e1-dev:e1-g4-s430:turn6 | white | 6 | 1155 | 1142 | 0.9 | 2 | 37 | 37 | work | search |
| e1-dev:e1-g3-s5:turn6 | white | 6 | 1152 | 1139 | 0.2 | 2 | 34 | 34 | work | search |
| e1-dev:e1-g5-s415:turn6 | white | 6 | 1325 | 1312 | 0.1 | 2 | 36 | 36 | work | search |
| e1-dev:e1-g3-s625:turn6 | white | 6 | 1340 | 1324 | 0.1 | 2 | 33 | 33 | work | search |
