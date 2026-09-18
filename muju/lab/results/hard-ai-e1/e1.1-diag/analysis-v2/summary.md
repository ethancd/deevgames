# Reclassification — /Users/ashkie/src/deevgames-e1-run/muju/lab/results/hard-ai-e1/e1.1-diag/analysis

14 saved analysis/analyses re-decided under the current rules at a 300 cc threshold. **No search was re-run**: every adviser number is carried over from the saved artifact and only the reply-node candidate lists were regenerated.

## First consequential decision

| class | before | after |
| --- | ---: | ---: |
| reply-missed | 2 | 0 |
| strong-candidate-misjudged | 12 | 14 |

## Largest-swing turn

| class | before | after |
| --- | ---: | ---: |
| clock-fallback | 1 | 1 |
| reply-missed | 2 | 0 |
| strong-candidate-misjudged | 11 | 13 |

## Games

| game | seat | result | first before | first after | largest before | largest after | reply fields changed |
| --- | --- | --- | --- | --- | --- | --- | ---: |
| g2-s20_3_15-A-white | white | loss | strong-candidate-misjudged (t3) | strong-candidate-misjudged (t3) | clock-fallback | clock-fallback | 27 |
| g2-s20_3_15-B-white | black | loss | strong-candidate-misjudged (t7) | strong-candidate-misjudged (t7) | strong-candidate-misjudged | strong-candidate-misjudged | 16 |
| g2-s5_0_2-A-white | white | loss | strong-candidate-misjudged (t4) | strong-candidate-misjudged (t4) | strong-candidate-misjudged | strong-candidate-misjudged | 26 |
| g4-s10_0_8-A-white | white | loss | strong-candidate-misjudged (t3) | strong-candidate-misjudged (t3) | strong-candidate-misjudged | strong-candidate-misjudged | 31 |
| g4-s10_0_8-B-white | black | loss | strong-candidate-misjudged (t7) | strong-candidate-misjudged (t7) | strong-candidate-misjudged | strong-candidate-misjudged | 34 |
| g4-s10_3_9-A-white | white | loss | strong-candidate-misjudged (t2) | strong-candidate-misjudged (t2) | strong-candidate-misjudged | strong-candidate-misjudged | 22 |
| g4-s2_3_1-B-white | black | loss | strong-candidate-misjudged (t2) | strong-candidate-misjudged (t2) | strong-candidate-misjudged | strong-candidate-misjudged | 27 |
| g4-s6_0_4-A-white | white | loss | strong-candidate-misjudged (t4) | strong-candidate-misjudged (t4) | strong-candidate-misjudged | strong-candidate-misjudged | 30 |
| g4-s6_3_5-A-white | white | loss | strong-candidate-misjudged (t4) | strong-candidate-misjudged (t4) | strong-candidate-misjudged | strong-candidate-misjudged | 41 |
| g4-s6_3_5-B-white | black | loss | reply-missed (t1) | strong-candidate-misjudged (t1) | reply-missed | strong-candidate-misjudged | 21 |
| g5-s11_0_10-B-white | black | loss | strong-candidate-misjudged (t1) | strong-candidate-misjudged (t1) | strong-candidate-misjudged | strong-candidate-misjudged | 26 |
| g5-s11_3_11-B-white | black | loss | strong-candidate-misjudged (t2) | strong-candidate-misjudged (t2) | strong-candidate-misjudged | strong-candidate-misjudged | 17 |
| g5-s7_3_7-A-white | white | loss | strong-candidate-misjudged (t4) | strong-candidate-misjudged (t4) | strong-candidate-misjudged | strong-candidate-misjudged | 34 |
| g5-s7_3_7-B-white | black | loss | reply-missed (t1) | strong-candidate-misjudged (t1) | reply-missed | strong-candidate-misjudged | 21 |

## Reconstruction check

32 of 32 replays in `/Users/ashkie/src/deevgames-e1-run/muju/lab/results/hard-ai-e1/e1.1-diag/replays` reconstruct under the current code.

These reconstruct but have no saved analysis, so they cannot be reclassified — they need a real re-analysis with adviser searches:

- g2-s20_0_14-A-white.json
- g2-s20_0_14-B-white.json
- g2-s5_0_2-B-white.json
- g2-s5_3_3-A-white.json
- g2-s5_3_3-B-white.json
- g4-s10_3_9-B-white.json
- g4-s2_0_0-A-white.json
- g4-s2_0_0-B-white.json
- g4-s2_3_1-A-white.json
- g4-s6_0_4-B-white.json
- g5-s11_0_10-A-white.json
- g5-s11_3_11-A-white.json
- g5-s15_0_12-A-white.json
- g5-s15_0_12-B-white.json
- g5-s15_3_13-A-white.json
- g5-s15_3_13-B-white.json
- g5-s7_0_6-A-white.json
- g5-s7_0_6-B-white.json

_8364 ms; written to `/Users/ashkie/src/deevgames-e1-run/muju/lab/results/hard-ai-e1/e1.1-diag/analysis-v2`, which is never the input directory._
