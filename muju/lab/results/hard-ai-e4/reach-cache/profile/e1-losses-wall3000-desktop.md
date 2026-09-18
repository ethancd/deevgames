# profile e1-losses at wall:3000, hard@desktop

generated 2026-09-18T01:14:07.894Z, git 89de58f712eda586bb92693cfed92c639290e061 (DIRTY tree), Apple M2 Max x12 (darwin/arm64), node v24.11.1
engine config hash hard:desktop:wall:3000#4e7afdf76b32fadfab2d11577cb610c8f9f1a491b5153e70b87b0774403600cd, resolved 4e7afdf76b32fadfab2d11577cb610c8f9f1a491b5153e70b87b0774403600cd

12 position(s) profiled, 0 skipped, abort share 16.7%, mean completed iterations 2.17, dominant bucket **tables**

| bucket | mean share of profiled wall time |
| --- | ---: |
| tables | 71.8% |
| prover | 13.1% |
| generation | 6.9% |
| canonicalVerify | 3.6% |
| evaluation | 2.9% |
| other | 1.1% |
| replySearch | 0.6% |
| quiescence | 0.0% |
| instrument | 0.0% |

top 3 functions by summed self time:
- 1722.9 ms  `bfsMulti` @ src/ai/hard/core/movement.ts:0 (tables)
- 1662.9 ms  `bfsFrom` @ src/ai/hard/core/movement.ts:0 (tables)
- 1490.1 ms  `spawnGeometry` @ src/ai/hard/tables/geometry.ts:0 (tables)

| position | side | turn | totalMs | searchMs | canonicalReplayMs | completedIters | rootListed | rootSearched | stop | source |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| e1-losses:g2-s20_3_15-A-white | white | 3 | 3027 | 3005 | 0.1 | 2 | 28 | 28 | abort | search |
| e1-losses:g2-s20_3_15-B-white | black | 7 | 2675 | 2654 | 0.1 | 2 | 30 | 30 | work | search |
| e1-losses:g2-s5_0_2-A-white | white | 4 | 2601 | 2583 | 0.1 | 2 | 27 | 27 | work | search |
| e1-losses:g4-s10_0_8-A-white | white | 3 | 2403 | 2389 | 0.1 | 2 | 27 | 27 | work | search |
| e1-losses:g4-s10_0_8-B-white | black | 7 | 3019 | 3003 | 0.1 | 2 | 27 | 27 | abort | search |
| e1-losses:g4-s10_3_9-A-white | white | 2 | 1716 | 1701 | 0.1 | 3 | 27 | 27 | work | search |
| e1-losses:g4-s2_3_1-B-white | black | 2 | 2198 | 2178 | 0.0 | 2 | 28 | 28 | work | search |
| e1-losses:g4-s6_0_4-A-white | white | 4 | 1368 | 1352 | 0.1 | 2 | 30 | 30 | work | search |
| e1-losses:g4-s6_3_5-A-white | white | 4 | 2511 | 2490 | 0.1 | 2 | 29 | 29 | work | search |
| e1-losses:g4-s6_3_5-B-white | black | 1 | 2116 | 2101 | 0.0 | 3 | 18 | 18 | work | search |
| e1-losses:g5-s11_0_10-B-white | black | 1 | 2217 | 2202 | 0.0 | 2 | 19 | 19 | work | search |
| e1-losses:g5-s11_3_11-B-white | black | 2 | 2222 | 2203 | 0.0 | 2 | 28 | 28 | work | search |
