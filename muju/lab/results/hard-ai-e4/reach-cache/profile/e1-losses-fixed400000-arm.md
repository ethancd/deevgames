# profile e1-losses at fixed:400000, hard@ablate:search-reach-cache

generated 2026-09-18T01:13:09.928Z, git 89de58f712eda586bb92693cfed92c639290e061 (DIRTY tree), Apple M2 Max x12 (darwin/arm64), node v24.11.1
engine config hash hard:ablate:search-reach-cache:fixed:400000#4c39e91f96523a4cad43dac8a4d3bf2ea29a0786ac8b346614a131ec3c337383, resolved 4c39e91f96523a4cad43dac8a4d3bf2ea29a0786ac8b346614a131ec3c337383

12 position(s) profiled, 0 skipped, abort share 0.0%, mean completed iterations 2.92, dominant bucket **tables**

| bucket | mean share of profiled wall time |
| --- | ---: |
| tables | 70.8% |
| prover | 12.9% |
| generation | 7.6% |
| canonicalVerify | 3.9% |
| evaluation | 3.0% |
| other | 1.0% |
| replySearch | 0.7% |
| quiescence | 0.0% |
| instrument | 0.0% |

top 3 functions by summed self time:
- 2575.4 ms  `spawnGeometry` @ src/ai/hard/tables/geometry.ts:0 (tables)
- 1859.4 ms  `bfsFrom` @ src/ai/hard/core/movement.ts:0 (tables)
- 1326.5 ms  `blockingSet` @ src/ai/hard/core/spawn.ts:0 (tables)

| position | side | turn | totalMs | searchMs | canonicalReplayMs | completedIters | rootListed | rootSearched | stop | source |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| e1-losses:g2-s20_3_15-A-white | white | 3 | 2802 | 2780 | 0.0 | 3 | 28 | 28 | work | search |
| e1-losses:g2-s20_3_15-B-white | black | 7 | 3517 | 3493 | 0.1 | 3 | 30 | 30 | work | search |
| e1-losses:g2-s5_0_2-A-white | white | 4 | 4788 | 4760 | 0.1 | 3 | 27 | 27 | work | search |
| e1-losses:g4-s10_0_8-A-white | white | 3 | 2465 | 2449 | 0.1 | 3 | 27 | 27 | work | search |
| e1-losses:g4-s10_0_8-B-white | black | 7 | 4420 | 4401 | 0.1 | 3 | 27 | 27 | work | search |
| e1-losses:g4-s10_3_9-A-white | white | 2 | 3504 | 3484 | 0.0 | 3 | 27 | 27 | work | search |
| e1-losses:g4-s2_3_1-B-white | black | 2 | 3472 | 3445 | 0.1 | 3 | 28 | 28 | work | search |
| e1-losses:g4-s6_0_4-A-white | white | 4 | 4045 | 4019 | 0.1 | 3 | 30 | 30 | work | search |
| e1-losses:g4-s6_3_5-A-white | white | 4 | 4803 | 4776 | 0.1 | 3 | 29 | 29 | work | search |
| e1-losses:g4-s6_3_5-B-white | black | 1 | 1925 | 1910 | 0.1 | 3 | 18 | 18 | work | search |
| e1-losses:g5-s11_0_10-B-white | black | 1 | 3323 | 3305 | 0.0 | 3 | 19 | 19 | work | search |
| e1-losses:g5-s11_3_11-B-white | black | 2 | 3926 | 3902 | 0.1 | 2 | 28 | 28 | work | search |
