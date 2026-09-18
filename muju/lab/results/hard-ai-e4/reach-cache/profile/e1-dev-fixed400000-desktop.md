# profile e1-dev at fixed:400000, hard@desktop

generated 2026-09-18T01:09:41.752Z, git 89de58f712eda586bb92693cfed92c639290e061 (DIRTY tree), Apple M2 Max x12 (darwin/arm64), node v24.11.1
engine config hash hard:desktop:fixed:400000#d474d5ea9f10e0de8ab711b04c5b83f81bd7e7fae9f3be2fe9890ff8982fb8f0, resolved d474d5ea9f10e0de8ab711b04c5b83f81bd7e7fae9f3be2fe9890ff8982fb8f0

16 position(s) profiled, 0 skipped, abort share 0.0%, mean completed iterations 3.00, dominant bucket **tables**

| bucket | mean share of profiled wall time |
| --- | ---: |
| tables | 75.8% |
| prover | 11.7% |
| generation | 6.2% |
| evaluation | 3.0% |
| canonicalVerify | 2.1% |
| other | 0.8% |
| replySearch | 0.4% |
| quiescence | 0.0% |
| instrument | 0.0% |

top 3 functions by summed self time:
- 6183.5 ms  `bfsFrom` @ src/ai/hard/core/movement.ts:0 (tables)
- 5508.4 ms  `runKillDp` @ src/ai/hard/tables/kill.ts:0 (tables)
- 4461.5 ms  `spawnGeometry` @ src/ai/hard/tables/geometry.ts:0 (tables)

| position | side | turn | totalMs | searchMs | canonicalReplayMs | completedIters | rootListed | rootSearched | stop | source |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| e1-dev:e1-g3-s105:turn6 | white | 6 | 5210 | 5179 | 0.1 | 3 | 34 | 34 | work | search |
| e1-dev:e1-g2-s40:turn6 | white | 6 | 5897 | 5871 | 0.1 | 3 | 35 | 35 | work | search |
| e1-dev:e1-g4-s250:turn6 | white | 6 | 6201 | 6170 | 0.2 | 3 | 35 | 35 | work | search |
| e1-dev:e1-g4-s750:turn6 | white | 6 | 4781 | 4756 | 0.1 | 3 | 33 | 33 | work | search |
| e1-dev:e1-g4-s730:turn6 | white | 6 | 4688 | 4662 | 0.1 | 3 | 35 | 35 | work | search |
| e1-dev:e1-g3-s745:turn6 | white | 6 | 3448 | 3424 | 0.1 | 3 | 34 | 34 | work | search |
| e1-dev:e1-g4-s510:turn6 | white | 6 | 5718 | 5692 | 0.1 | 3 | 36 | 36 | work | search |
| e1-dev:e1-g2-s155:turn6 | white | 6 | 3338 | 3317 | 0.1 | 3 | 33 | 33 | work | search |
| e1-dev:e1-g3-s205:turn6 | white | 6 | 7256 | 7233 | 0.3 | 3 | 36 | 36 | work | search |
| e1-dev:e1-g4-s550:turn6 | white | 6 | 4621 | 4597 | 0.1 | 3 | 36 | 36 | work | search |
| e1-dev:e1-g5-s55:turn6 | white | 6 | 5723 | 5696 | 0.1 | 3 | 36 | 36 | work | search |
| e1-dev:e1-g5-s1035:turn6 | white | 6 | 4947 | 4922 | 0.1 | 3 | 36 | 36 | work | search |
| e1-dev:e1-g4-s430:turn6 | white | 6 | 6726 | 6694 | 0.8 | 3 | 37 | 37 | work | search |
| e1-dev:e1-g3-s5:turn6 | white | 6 | 4042 | 4019 | 0.1 | 3 | 34 | 34 | work | search |
| e1-dev:e1-g5-s415:turn6 | white | 6 | 5018 | 4992 | 0.1 | 3 | 36 | 36 | work | search |
| e1-dev:e1-g3-s625:turn6 | white | 6 | 4691 | 4665 | 0.1 | 3 | 33 | 33 | work | search |
