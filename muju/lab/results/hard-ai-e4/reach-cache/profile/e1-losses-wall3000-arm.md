# profile e1-losses at wall:3000, hard@ablate:search-reach-cache

generated 2026-09-18T01:14:58.500Z, git 89de58f712eda586bb92693cfed92c639290e061 (DIRTY tree), Apple M2 Max x12 (darwin/arm64), node v24.11.1
engine config hash hard:ablate:search-reach-cache:wall:3000#5ba2c2fc352d4715f790f9ce0fdb6e1b4926d1c49edce923f8169f88fdad0a51, resolved 5ba2c2fc352d4715f790f9ce0fdb6e1b4926d1c49edce923f8169f88fdad0a51

12 position(s) profiled, 0 skipped, abort share 8.3%, mean completed iterations 2.25, dominant bucket **tables**

| bucket | mean share of profiled wall time |
| --- | ---: |
| tables | 70.1% |
| prover | 12.8% |
| generation | 7.6% |
| canonicalVerify | 4.4% |
| evaluation | 3.2% |
| other | 1.3% |
| replySearch | 0.7% |
| quiescence | 0.0% |
| instrument | 0.0% |

top 3 functions by summed self time:
- 1519.2 ms  `spawnGeometry` @ src/ai/hard/tables/geometry.ts:0 (tables)
- 1076.0 ms  `bfsFrom` @ src/ai/hard/core/movement.ts:0 (tables)
- 832.5 ms  `spawnInfo` @ src/ai/hard/core/spawn.ts:0 (tables)

| position | side | turn | totalMs | searchMs | canonicalReplayMs | completedIters | rootListed | rootSearched | stop | source |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| e1-losses:g2-s20_3_15-A-white | white | 3 | 2801 | 2778 | 0.1 | 3 | 28 | 28 | work | search |
| e1-losses:g2-s20_3_15-B-white | black | 7 | 2568 | 2547 | 0.1 | 2 | 30 | 30 | work | search |
| e1-losses:g2-s5_0_2-A-white | white | 4 | 2475 | 2457 | 0.1 | 2 | 27 | 27 | work | search |
| e1-losses:g4-s10_0_8-A-white | white | 3 | 2198 | 2184 | 0.1 | 2 | 27 | 27 | work | search |
| e1-losses:g4-s10_0_8-B-white | black | 7 | 3020 | 3002 | 0.1 | 2 | 27 | 27 | abort | search |
| e1-losses:g4-s10_3_9-A-white | white | 2 | 1597 | 1582 | 0.1 | 3 | 27 | 27 | work | search |
| e1-losses:g4-s2_3_1-B-white | black | 2 | 1945 | 1926 | 0.0 | 2 | 28 | 28 | work | search |
| e1-losses:g4-s6_0_4-A-white | white | 4 | 1251 | 1234 | 0.1 | 2 | 30 | 30 | work | search |
| e1-losses:g4-s6_3_5-A-white | white | 4 | 2383 | 2363 | 0.1 | 2 | 29 | 29 | work | search |
| e1-losses:g4-s6_3_5-B-white | black | 1 | 1935 | 1920 | 0.1 | 3 | 18 | 18 | work | search |
| e1-losses:g5-s11_0_10-B-white | black | 1 | 2004 | 1986 | 0.0 | 2 | 19 | 19 | work | search |
| e1-losses:g5-s11_3_11-B-white | black | 2 | 1974 | 1954 | 0.0 | 2 | 28 | 28 | work | search |
