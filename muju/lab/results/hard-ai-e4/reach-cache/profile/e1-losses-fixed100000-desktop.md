# profile e1-losses at fixed:100000, hard@desktop

generated 2026-09-18T01:11:24.469Z, git 89de58f712eda586bb92693cfed92c639290e061 (DIRTY tree), Apple M2 Max x12 (darwin/arm64), node v24.11.1
engine config hash hard:desktop:fixed:100000#387244209047c03daa71ed9b2852fdf13d79fbc16f3d3e80fd7fcf7d5a9f8ffc, resolved 387244209047c03daa71ed9b2852fdf13d79fbc16f3d3e80fd7fcf7d5a9f8ffc

12 position(s) profiled, 0 skipped, abort share 0.0%, mean completed iterations 2.00, dominant bucket **tables**

| bucket | mean share of profiled wall time |
| --- | ---: |
| tables | 73.7% |
| prover | 11.9% |
| generation | 6.4% |
| canonicalVerify | 3.1% |
| evaluation | 2.6% |
| other | 1.7% |
| replySearch | 0.6% |
| instrument | 0.0% |
| quiescence | 0.0% |

top 3 functions by summed self time:
- 795.0 ms  `bfsFrom` @ src/ai/hard/core/movement.ts:0 (tables)
- 794.2 ms  `strikeArea` @ src/ai/hard/tables/threat.ts:0 (tables)
- 763.3 ms  `bbNext` @ src/ai/hard/core/bits.ts:0 (tables)

| position | side | turn | totalMs | searchMs | canonicalReplayMs | completedIters | rootListed | rootSearched | stop | source |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| e1-losses:g2-s20_3_15-A-white | white | 3 | 1477 | 1460 | 0.1 | 2 | 28 | 28 | work | search |
| e1-losses:g2-s20_3_15-B-white | black | 7 | 856 | 845 | 0.1 | 2 | 30 | 30 | work | search |
| e1-losses:g2-s5_0_2-A-white | white | 4 | 1487 | 1472 | 0.1 | 2 | 27 | 27 | work | search |
| e1-losses:g4-s10_0_8-A-white | white | 3 | 1423 | 1411 | 0.1 | 2 | 27 | 27 | work | search |
| e1-losses:g4-s10_0_8-B-white | black | 7 | 1755 | 1741 | 0.1 | 2 | 27 | 27 | work | search |
| e1-losses:g4-s10_3_9-A-white | white | 2 | 1195 | 1181 | 0.1 | 2 | 27 | 27 | work | search |
| e1-losses:g4-s2_3_1-B-white | black | 2 | 1346 | 1330 | 0.0 | 2 | 28 | 28 | work | search |
| e1-losses:g4-s6_0_4-A-white | white | 4 | 903 | 889 | 0.1 | 2 | 30 | 30 | work | search |
| e1-losses:g4-s6_3_5-A-white | white | 4 | 781 | 769 | 0.1 | 2 | 29 | 29 | work | search |
| e1-losses:g4-s6_3_5-B-white | black | 1 | 1352 | 1338 | 0.0 | 2 | 18 | 18 | work | search |
| e1-losses:g5-s11_0_10-B-white | black | 1 | 1210 | 1197 | 0.0 | 2 | 19 | 19 | work | search |
| e1-losses:g5-s11_3_11-B-white | black | 2 | 1338 | 1321 | 0.0 | 2 | 28 | 28 | work | search |
