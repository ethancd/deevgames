# profile e1-losses at fixed:400000, hard@desktop

generated 2026-09-18T00:12:41.122Z, git 437ee40fd29f594f017e90f850762c6092864772 (DIRTY tree), Apple M2 Max x12 (darwin/arm64), node v24.11.1
engine config hash hard:desktop:fixed:400000#d474d5ea9f10e0de8ab711b04c5b83f81bd7e7fae9f3be2fe9890ff8982fb8f0, resolved d474d5ea9f10e0de8ab711b04c5b83f81bd7e7fae9f3be2fe9890ff8982fb8f0

12 position(s) profiled, 0 skipped, abort share 0.0%, mean completed iterations 2.92, dominant bucket **tables**

| bucket | mean share of profiled wall time |
| --- | ---: |
| tables | 72.7% |
| prover | 12.6% |
| generation | 6.6% |
| canonicalVerify | 3.3% |
| evaluation | 2.8% |
| other | 1.4% |
| replySearch | 0.6% |
| quiescence | 0.0% |
| instrument | 0.0% |

top 3 functions by summed self time:
- 6625.1 ms  `strikeArea` @ src/ai/hard/tables/threat.ts:0 (tables)
- 6591.4 ms  `bfsFrom` @ src/ai/hard/core/movement.ts:0 (tables)
- 4504.4 ms  `spawnGeometry` @ src/ai/hard/tables/geometry.ts:0 (tables)

| position | side | turn | totalMs | searchMs | canonicalReplayMs | completedIters | rootListed | rootSearched | stop | source |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| e1-losses:g2-s20_3_15-A-white | white | 3 | 3566 | 3542 | 0.1 | 3 | 28 | 28 | work | search |
| e1-losses:g2-s20_3_15-B-white | black | 7 | 4057 | 4031 | 0.1 | 3 | 30 | 30 | work | search |
| e1-losses:g2-s5_0_2-A-white | white | 4 | 5359 | 5329 | 0.1 | 3 | 27 | 27 | work | search |
| e1-losses:g4-s10_0_8-A-white | white | 3 | 3118 | 3100 | 0.1 | 3 | 27 | 27 | work | search |
| e1-losses:g4-s10_0_8-B-white | black | 7 | 4736 | 4715 | 0.1 | 3 | 27 | 27 | work | search |
| e1-losses:g4-s10_3_9-A-white | white | 2 | 4537 | 4513 | 0.0 | 3 | 27 | 27 | work | search |
| e1-losses:g4-s2_3_1-B-white | black | 2 | 4520 | 4492 | 0.1 | 3 | 28 | 28 | work | search |
| e1-losses:g4-s6_0_4-A-white | white | 4 | 4955 | 4926 | 0.1 | 3 | 30 | 30 | work | search |
| e1-losses:g4-s6_3_5-A-white | white | 4 | 5681 | 5653 | 0.1 | 3 | 29 | 29 | work | search |
| e1-losses:g4-s6_3_5-B-white | black | 1 | 2365 | 2349 | 0.0 | 3 | 18 | 18 | work | search |
| e1-losses:g5-s11_0_10-B-white | black | 1 | 4125 | 4106 | 0.1 | 3 | 19 | 19 | work | search |
| e1-losses:g5-s11_3_11-B-white | black | 2 | 5340 | 5312 | 0.1 | 2 | 28 | 28 | work | search |
