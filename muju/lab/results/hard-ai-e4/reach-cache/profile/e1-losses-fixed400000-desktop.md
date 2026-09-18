# profile e1-losses at fixed:400000, hard@desktop

generated 2026-09-18T01:12:11.838Z, git 89de58f712eda586bb92693cfed92c639290e061 (DIRTY tree), Apple M2 Max x12 (darwin/arm64), node v24.11.1
engine config hash hard:desktop:fixed:400000#d474d5ea9f10e0de8ab711b04c5b83f81bd7e7fae9f3be2fe9890ff8982fb8f0, resolved d474d5ea9f10e0de8ab711b04c5b83f81bd7e7fae9f3be2fe9890ff8982fb8f0

12 position(s) profiled, 0 skipped, abort share 0.0%, mean completed iterations 2.92, dominant bucket **tables**

| bucket | mean share of profiled wall time |
| --- | ---: |
| tables | 71.4% |
| prover | 13.1% |
| generation | 7.0% |
| canonicalVerify | 3.8% |
| evaluation | 2.9% |
| other | 1.2% |
| replySearch | 0.6% |
| quiescence | 0.0% |
| instrument | 0.0% |

top 3 functions by summed self time:
- 2725.8 ms  `bfsMulti` @ src/ai/hard/core/movement.ts:0 (tables)
- 2670.2 ms  `bfsFrom` @ src/ai/hard/core/movement.ts:0 (tables)
- 2483.1 ms  `spawnGeometry` @ src/ai/hard/tables/geometry.ts:0 (tables)

| position | side | turn | totalMs | searchMs | canonicalReplayMs | completedIters | rootListed | rootSearched | stop | source |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| e1-losses:g2-s20_3_15-A-white | white | 3 | 3058 | 3036 | 0.1 | 3 | 28 | 28 | work | search |
| e1-losses:g2-s20_3_15-B-white | black | 7 | 3624 | 3600 | 0.1 | 3 | 30 | 30 | work | search |
| e1-losses:g2-s5_0_2-A-white | white | 4 | 4957 | 4930 | 0.1 | 3 | 27 | 27 | work | search |
| e1-losses:g4-s10_0_8-A-white | white | 3 | 2730 | 2716 | 0.1 | 3 | 27 | 27 | work | search |
| e1-losses:g4-s10_0_8-B-white | black | 7 | 4340 | 4320 | 0.1 | 3 | 27 | 27 | work | search |
| e1-losses:g4-s10_3_9-A-white | white | 2 | 3902 | 3880 | 0.1 | 3 | 27 | 27 | work | search |
| e1-losses:g4-s2_3_1-B-white | black | 2 | 3864 | 3838 | 0.1 | 3 | 28 | 28 | work | search |
| e1-losses:g4-s6_0_4-A-white | white | 4 | 4386 | 4360 | 0.1 | 3 | 30 | 30 | work | search |
| e1-losses:g4-s6_3_5-A-white | white | 4 | 5066 | 5040 | 0.1 | 3 | 29 | 29 | work | search |
| e1-losses:g4-s6_3_5-B-white | black | 1 | 2105 | 2090 | 0.0 | 3 | 18 | 18 | work | search |
| e1-losses:g5-s11_0_10-B-white | black | 1 | 3670 | 3651 | 0.0 | 3 | 19 | 19 | work | search |
| e1-losses:g5-s11_3_11-B-white | black | 2 | 4443 | 4418 | 0.0 | 2 | 28 | 28 | work | search |
