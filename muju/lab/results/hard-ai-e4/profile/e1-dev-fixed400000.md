# profile e1-dev at fixed:400000, hard@desktop

generated 2026-09-18T00:15:20.703Z, git 437ee40fd29f594f017e90f850762c6092864772 (DIRTY tree), Apple M2 Max x12 (darwin/arm64), node v24.11.1
engine config hash hard:desktop:fixed:400000#d474d5ea9f10e0de8ab711b04c5b83f81bd7e7fae9f3be2fe9890ff8982fb8f0, resolved d474d5ea9f10e0de8ab711b04c5b83f81bd7e7fae9f3be2fe9890ff8982fb8f0

16 position(s) profiled, 0 skipped, abort share 0.0%, mean completed iterations 3.00, dominant bucket **tables**

| bucket | mean share of profiled wall time |
| --- | ---: |
| tables | 75.5% |
| prover | 11.9% |
| generation | 6.2% |
| evaluation | 3.2% |
| canonicalVerify | 2.0% |
| other | 0.8% |
| replySearch | 0.4% |
| quiescence | 0.0% |
| instrument | 0.0% |

top 3 functions by summed self time:
- 16997.7 ms  `bfsFrom` @ src/ai/hard/core/movement.ts:0 (tables)
- 9133.1 ms  `spawnGeometry` @ src/ai/hard/tables/geometry.ts:0 (tables)
- 8720.9 ms  `runKillDp` @ src/ai/hard/tables/kill.ts:0 (tables)

| position | side | turn | totalMs | searchMs | canonicalReplayMs | completedIters | rootListed | rootSearched | stop | source |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| e1-dev:e1-g3-s105:turn6 | white | 6 | 5722 | 5685 | 0.1 | 3 | 34 | 34 | work | search |
| e1-dev:e1-g2-s40:turn6 | white | 6 | 7259 | 7230 | 0.1 | 3 | 35 | 35 | work | search |
| e1-dev:e1-g4-s250:turn6 | white | 6 | 6682 | 6651 | 0.2 | 3 | 35 | 35 | work | search |
| e1-dev:e1-g4-s750:turn6 | white | 6 | 5280 | 5253 | 0.1 | 3 | 33 | 33 | work | search |
| e1-dev:e1-g4-s730:turn6 | white | 6 | 5321 | 5293 | 0.1 | 3 | 35 | 35 | work | search |
| e1-dev:e1-g3-s745:turn6 | white | 6 | 3758 | 3732 | 0.1 | 3 | 34 | 34 | work | search |
| e1-dev:e1-g4-s510:turn6 | white | 6 | 6466 | 6435 | 0.1 | 3 | 36 | 36 | work | search |
| e1-dev:e1-g2-s155:turn6 | white | 6 | 4215 | 4190 | 0.1 | 3 | 33 | 33 | work | search |
| e1-dev:e1-g3-s205:turn6 | white | 6 | 8239 | 8214 | 0.3 | 3 | 36 | 36 | work | search |
| e1-dev:e1-g4-s550:turn6 | white | 6 | 5058 | 5034 | 0.1 | 3 | 36 | 36 | work | search |
| e1-dev:e1-g5-s55:turn6 | white | 6 | 6139 | 6111 | 0.1 | 3 | 36 | 36 | work | search |
| e1-dev:e1-g5-s1035:turn6 | white | 6 | 5337 | 5311 | 0.1 | 3 | 36 | 36 | work | search |
| e1-dev:e1-g4-s430:turn6 | white | 6 | 7165 | 7130 | 1.2 | 3 | 37 | 37 | work | search |
| e1-dev:e1-g3-s5:turn6 | white | 6 | 4457 | 4432 | 0.1 | 3 | 34 | 34 | work | search |
| e1-dev:e1-g5-s415:turn6 | white | 6 | 5551 | 5525 | 0.1 | 3 | 36 | 36 | work | search |
| e1-dev:e1-g3-s625:turn6 | white | 6 | 5027 | 5000 | 0.1 | 3 | 33 | 33 | work | search |
