# profile e1-losses at fixed:100000, hard@ablate:search-reach-cache

generated 2026-09-18T01:12:25.728Z, git 89de58f712eda586bb92693cfed92c639290e061 (DIRTY tree), Apple M2 Max x12 (darwin/arm64), node v24.11.1
engine config hash hard:ablate:search-reach-cache:fixed:100000#fb7dcf089720ed34aa988b6f2d48e092dd0ea86183f2b1587307262fc7a770e0, resolved fb7dcf089720ed34aa988b6f2d48e092dd0ea86183f2b1587307262fc7a770e0

12 position(s) profiled, 0 skipped, abort share 0.0%, mean completed iterations 2.00, dominant bucket **tables**

| bucket | mean share of profiled wall time |
| --- | ---: |
| tables | 70.5% |
| prover | 12.7% |
| generation | 7.7% |
| canonicalVerify | 4.4% |
| evaluation | 3.1% |
| other | 1.0% |
| replySearch | 0.6% |
| instrument | 0.0% |
| quiescence | 0.0% |

top 3 functions by summed self time:
- 730.7 ms  `spawnGeometry` @ src/ai/hard/tables/geometry.ts:0 (tables)
- 580.3 ms  `bfsFrom` @ src/ai/hard/core/movement.ts:0 (tables)
- 381.1 ms  `spawnInfo` @ src/ai/hard/core/spawn.ts:0 (tables)

| position | side | turn | totalMs | searchMs | canonicalReplayMs | completedIters | rootListed | rootSearched | stop | source |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| e1-losses:g2-s20_3_15-A-white | white | 3 | 1256 | 1239 | 0.1 | 2 | 28 | 28 | work | search |
| e1-losses:g2-s20_3_15-B-white | black | 7 | 777 | 763 | 0.1 | 2 | 30 | 30 | work | search |
| e1-losses:g2-s5_0_2-A-white | white | 4 | 1276 | 1262 | 0.1 | 2 | 27 | 27 | work | search |
| e1-losses:g4-s10_0_8-A-white | white | 3 | 1075 | 1066 | 0.1 | 2 | 27 | 27 | work | search |
| e1-losses:g4-s10_0_8-B-white | black | 7 | 1685 | 1671 | 0.1 | 2 | 27 | 27 | work | search |
| e1-losses:g4-s10_3_9-A-white | white | 2 | 978 | 964 | 0.1 | 2 | 27 | 27 | work | search |
| e1-losses:g4-s2_3_1-B-white | black | 2 | 1040 | 1024 | 0.1 | 2 | 28 | 28 | work | search |
| e1-losses:g4-s6_0_4-A-white | white | 4 | 755 | 741 | 0.1 | 2 | 30 | 30 | work | search |
| e1-losses:g4-s6_3_5-A-white | white | 4 | 692 | 680 | 0.1 | 2 | 29 | 29 | work | search |
| e1-losses:g4-s6_3_5-B-white | black | 1 | 1084 | 1071 | 0.1 | 2 | 18 | 18 | work | search |
| e1-losses:g5-s11_0_10-B-white | black | 1 | 989 | 977 | 0.0 | 2 | 19 | 19 | work | search |
| e1-losses:g5-s11_3_11-B-white | black | 2 | 1036 | 1020 | 0.0 | 2 | 28 | 28 | work | search |
