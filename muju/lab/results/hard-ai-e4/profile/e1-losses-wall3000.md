# profile e1-losses at wall:3000, hard@desktop

generated 2026-09-18T00:13:15.882Z, git 437ee40fd29f594f017e90f850762c6092864772 (DIRTY tree), Apple M2 Max x12 (darwin/arm64), node v24.11.1
engine config hash hard:desktop:wall:3000#4e7afdf76b32fadfab2d11577cb610c8f9f1a491b5153e70b87b0774403600cd, resolved 4e7afdf76b32fadfab2d11577cb610c8f9f1a491b5153e70b87b0774403600cd

12 position(s) profiled, 0 skipped, abort share 25.0%, mean completed iterations 2.17, dominant bucket **tables**

| bucket | mean share of profiled wall time |
| --- | ---: |
| tables | 72.3% |
| prover | 13.3% |
| generation | 7.0% |
| evaluation | 3.3% |
| canonicalVerify | 2.1% |
| other | 1.2% |
| replySearch | 0.7% |
| quiescence | 0.0% |
| instrument | 0.0% |

top 3 functions by summed self time:
- 4068.0 ms  `bfsFrom` @ src/ai/hard/core/movement.ts:0 (tables)
- 3964.6 ms  `bfsMulti` @ src/ai/hard/core/movement.ts:0 (tables)
- 2681.2 ms  `spawnGeometry` @ src/ai/hard/tables/geometry.ts:0 (tables)

| position | side | turn | totalMs | searchMs | canonicalReplayMs | completedIters | rootListed | rootSearched | stop | source |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| e1-losses:g2-s20_3_15-A-white | white | 3 | 3027 | 3005 | 0.1 | 2 | 28 | 28 | abort | search |
| e1-losses:g2-s20_3_15-B-white | black | 7 | 2756 | 2735 | 0.1 | 2 | 30 | 30 | work | search |
| e1-losses:g2-s5_0_2-A-white | white | 4 | 3020 | 3001 | 0.1 | 2 | 27 | 27 | abort | search |
| e1-losses:g4-s10_0_8-A-white | white | 3 | 2456 | 2442 | 0.1 | 2 | 27 | 27 | work | search |
| e1-losses:g4-s10_0_8-B-white | black | 7 | 3018 | 3001 | 0.2 | 2 | 27 | 27 | abort | search |
| e1-losses:g4-s10_3_9-A-white | white | 2 | 1744 | 1730 | 0.1 | 3 | 27 | 27 | work | search |
| e1-losses:g4-s2_3_1-B-white | black | 2 | 2306 | 2285 | 0.1 | 2 | 28 | 28 | work | search |
| e1-losses:g4-s6_0_4-A-white | white | 4 | 1524 | 1508 | 0.1 | 2 | 30 | 30 | work | search |
| e1-losses:g4-s6_3_5-A-white | white | 4 | 2681 | 2660 | 0.1 | 2 | 29 | 29 | work | search |
| e1-losses:g4-s6_3_5-B-white | black | 1 | 2289 | 2273 | 0.0 | 3 | 18 | 18 | work | search |
| e1-losses:g5-s11_0_10-B-white | black | 1 | 2399 | 2382 | 0.1 | 2 | 19 | 19 | work | search |
| e1-losses:g5-s11_3_11-B-white | black | 2 | 2304 | 2284 | 0.0 | 2 | 28 | 28 | work | search |
