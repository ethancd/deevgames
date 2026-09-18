# profile e1-dev at fixed:400000, hard@ablate:search-reach-cache

generated 2026-09-18T01:11:03.163Z, git 89de58f712eda586bb92693cfed92c639290e061 (DIRTY tree), Apple M2 Max x12 (darwin/arm64), node v24.11.1
engine config hash hard:ablate:search-reach-cache:fixed:400000#4c39e91f96523a4cad43dac8a4d3bf2ea29a0786ac8b346614a131ec3c337383, resolved 4c39e91f96523a4cad43dac8a4d3bf2ea29a0786ac8b346614a131ec3c337383

16 position(s) profiled, 0 skipped, abort share 0.0%, mean completed iterations 3.00, dominant bucket **tables**

| bucket | mean share of profiled wall time |
| --- | ---: |
| tables | 76.6% |
| prover | 10.5% |
| generation | 6.4% |
| evaluation | 3.2% |
| canonicalVerify | 2.1% |
| other | 0.8% |
| replySearch | 0.4% |
| quiescence | 0.0% |
| instrument | 0.0% |

top 3 functions by summed self time:
- 5601.8 ms  `runKillDp` @ src/ai/hard/tables/kill.ts:0 (tables)
- 4592.7 ms  `spawnGeometry` @ src/ai/hard/tables/geometry.ts:0 (tables)
- 4574.3 ms  `bfsFrom` @ src/ai/hard/core/movement.ts:0 (tables)

| position | side | turn | totalMs | searchMs | canonicalReplayMs | completedIters | rootListed | rootSearched | stop | source |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| e1-dev:e1-g3-s105:turn6 | white | 6 | 5032 | 5000 | 0.1 | 3 | 34 | 34 | work | search |
| e1-dev:e1-g2-s40:turn6 | white | 6 | 5712 | 5683 | 0.1 | 3 | 35 | 35 | work | search |
| e1-dev:e1-g4-s250:turn6 | white | 6 | 6082 | 6049 | 0.2 | 3 | 35 | 35 | work | search |
| e1-dev:e1-g4-s750:turn6 | white | 6 | 4587 | 4561 | 0.1 | 3 | 33 | 33 | work | search |
| e1-dev:e1-g4-s730:turn6 | white | 6 | 4524 | 4498 | 0.1 | 3 | 35 | 35 | work | search |
| e1-dev:e1-g3-s745:turn6 | white | 6 | 3232 | 3208 | 0.1 | 3 | 34 | 34 | work | search |
| e1-dev:e1-g4-s510:turn6 | white | 6 | 5464 | 5437 | 0.1 | 3 | 36 | 36 | work | search |
| e1-dev:e1-g2-s155:turn6 | white | 6 | 3281 | 3260 | 0.1 | 3 | 33 | 33 | work | search |
| e1-dev:e1-g3-s205:turn6 | white | 6 | 7086 | 7062 | 0.3 | 3 | 36 | 36 | work | search |
| e1-dev:e1-g4-s550:turn6 | white | 6 | 4312 | 4289 | 0.1 | 3 | 36 | 36 | work | search |
| e1-dev:e1-g5-s55:turn6 | white | 6 | 5544 | 5516 | 0.1 | 3 | 36 | 36 | work | search |
| e1-dev:e1-g5-s1035:turn6 | white | 6 | 4760 | 4734 | 0.1 | 3 | 36 | 36 | work | search |
| e1-dev:e1-g4-s430:turn6 | white | 6 | 6673 | 6640 | 0.8 | 3 | 37 | 37 | work | search |
| e1-dev:e1-g3-s5:turn6 | white | 6 | 3836 | 3812 | 0.1 | 3 | 34 | 34 | work | search |
| e1-dev:e1-g5-s415:turn6 | white | 6 | 4768 | 4741 | 0.1 | 3 | 36 | 36 | work | search |
| e1-dev:e1-g3-s625:turn6 | white | 6 | 4607 | 4581 | 0.1 | 3 | 33 | 33 | work | search |
