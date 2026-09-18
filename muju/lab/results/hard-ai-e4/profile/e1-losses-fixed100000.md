# profile e1-losses at fixed:100000, hard@desktop

generated 2026-09-18T00:10:58.527Z, git 437ee40fd29f594f017e90f850762c6092864772 (DIRTY tree), Apple M2 Max x12 (darwin/arm64), node v24.11.1
engine config hash hard:desktop:fixed:100000#387244209047c03daa71ed9b2852fdf13d79fbc16f3d3e80fd7fcf7d5a9f8ffc, resolved 387244209047c03daa71ed9b2852fdf13d79fbc16f3d3e80fd7fcf7d5a9f8ffc

12 position(s) profiled, 0 skipped, abort share 0.0%, mean completed iterations 2.00, dominant bucket **tables**

| bucket | mean share of profiled wall time |
| --- | ---: |
| tables | 71.4% |
| prover | 13.2% |
| generation | 7.1% |
| canonicalVerify | 3.6% |
| evaluation | 3.0% |
| other | 1.0% |
| replySearch | 0.6% |
| instrument | 0.0% |
| quiescence | 0.0% |

top 3 functions by summed self time:
- 2008.3 ms  `bfsFrom` @ src/ai/hard/core/movement.ts:0 (tables)
- 1951.1 ms  `bfsMulti` @ src/ai/hard/core/movement.ts:0 (tables)
- 1311.3 ms  `spawnGeometry` @ src/ai/hard/tables/geometry.ts:0 (tables)

| position | side | turn | totalMs | searchMs | canonicalReplayMs | completedIters | rootListed | rootSearched | stop | source |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| e1-losses:g2-s20_3_15-A-white | white | 3 | 1349 | 1331 | 0.1 | 2 | 28 | 28 | work | search |
| e1-losses:g2-s20_3_15-B-white | black | 7 | 809 | 798 | 0.1 | 2 | 30 | 30 | work | search |
| e1-losses:g2-s5_0_2-A-white | white | 4 | 1382 | 1368 | 0.1 | 2 | 27 | 27 | work | search |
| e1-losses:g4-s10_0_8-A-white | white | 3 | 1308 | 1297 | 0.1 | 2 | 27 | 27 | work | search |
| e1-losses:g4-s10_0_8-B-white | black | 7 | 1678 | 1664 | 0.1 | 2 | 27 | 27 | work | search |
| e1-losses:g4-s10_3_9-A-white | white | 2 | 1136 | 1117 | 0.1 | 2 | 27 | 27 | work | search |
| e1-losses:g4-s2_3_1-B-white | black | 2 | 1237 | 1220 | 0.1 | 2 | 28 | 28 | work | search |
| e1-losses:g4-s6_0_4-A-white | white | 4 | 854 | 839 | 0.1 | 2 | 30 | 30 | work | search |
| e1-losses:g4-s6_3_5-A-white | white | 4 | 765 | 752 | 0.1 | 2 | 29 | 29 | work | search |
| e1-losses:g4-s6_3_5-B-white | black | 1 | 1212 | 1200 | 0.0 | 2 | 18 | 18 | work | search |
| e1-losses:g5-s11_0_10-B-white | black | 1 | 1110 | 1097 | 0.0 | 2 | 19 | 19 | work | search |
| e1-losses:g5-s11_3_11-B-white | black | 2 | 1172 | 1156 | 0.1 | 2 | 28 | 28 | work | search |
