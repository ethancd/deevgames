# Reclassification — /Users/ashkie/src/deevgames-e2-lane2/muju/lab/results/hard-ai-e1/e1.1-diag/analysis-v2

14 saved analysis/analyses re-decided under the current rules at a 300 cc threshold. **No search was re-run**: every adviser number is carried over from the saved artifact and only the reply-node candidate lists were regenerated.

## First consequential decision

| class | before | after |
| --- | ---: | ---: |
| fixed-work-divergence | 0 | 9 |
| strong-candidate-misjudged | 14 | 5 |

## Largest-swing turn

| class | before | after |
| --- | ---: | ---: |
| clock-fallback | 1 | 1 |
| exposure-inconsistent | 0 | 2 |
| fixed-work-divergence | 0 | 6 |
| strong-candidate-misjudged | 13 | 5 |

## Games

| game | seat | result | first before | first after | largest before | largest after | reply fields changed |
| --- | --- | --- | --- | --- | --- | --- | ---: |
| g2-s20_3_15-A-white | white | loss | strong-candidate-misjudged (t3) | strong-candidate-misjudged (t3) | clock-fallback | clock-fallback | 0 |
| g2-s20_3_15-B-white | black | loss | strong-candidate-misjudged (t7) | fixed-work-divergence (t7) | strong-candidate-misjudged | fixed-work-divergence | 0 |
| g2-s5_0_2-A-white | white | loss | strong-candidate-misjudged (t4) | fixed-work-divergence (t4) | strong-candidate-misjudged | strong-candidate-misjudged | 0 |
| g4-s10_0_8-A-white | white | loss | strong-candidate-misjudged (t3) | fixed-work-divergence (t3) | strong-candidate-misjudged | fixed-work-divergence | 0 |
| g4-s10_0_8-B-white | black | loss | strong-candidate-misjudged (t7) | fixed-work-divergence (t7) | strong-candidate-misjudged | exposure-inconsistent | 0 |
| g4-s10_3_9-A-white | white | loss | strong-candidate-misjudged (t2) | strong-candidate-misjudged (t2) | strong-candidate-misjudged | fixed-work-divergence | 0 |
| g4-s2_3_1-B-white | black | loss | strong-candidate-misjudged (t2) | fixed-work-divergence (t2) | strong-candidate-misjudged | exposure-inconsistent | 0 |
| g4-s6_0_4-A-white | white | loss | strong-candidate-misjudged (t4) | fixed-work-divergence (t4) | strong-candidate-misjudged | fixed-work-divergence | 0 |
| g4-s6_3_5-A-white | white | loss | strong-candidate-misjudged (t4) | fixed-work-divergence (t4) | strong-candidate-misjudged | strong-candidate-misjudged | 0 |
| g4-s6_3_5-B-white | black | loss | strong-candidate-misjudged (t1) | strong-candidate-misjudged (t1) | strong-candidate-misjudged | strong-candidate-misjudged | 0 |
| g5-s11_0_10-B-white | black | loss | strong-candidate-misjudged (t1) | fixed-work-divergence (t1) | strong-candidate-misjudged | fixed-work-divergence | 0 |
| g5-s11_3_11-B-white | black | loss | strong-candidate-misjudged (t2) | strong-candidate-misjudged (t2) | strong-candidate-misjudged | fixed-work-divergence | 0 |
| g5-s7_3_7-A-white | white | loss | strong-candidate-misjudged (t4) | fixed-work-divergence (t4) | strong-candidate-misjudged | strong-candidate-misjudged | 0 |
| g5-s7_3_7-B-white | black | loss | strong-candidate-misjudged (t1) | strong-candidate-misjudged (t1) | strong-candidate-misjudged | strong-candidate-misjudged | 0 |

## Reconstruction check

32 of 32 replays in `lab/results/hard-ai-e1/e1.1-diag/replays` reconstruct under the current code.

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

_123039 ms; written to `/Users/ashkie/src/deevgames-e2-lane2/muju/lab/results/hard-ai-e2/analysis/e1.1-losses-exposed`, which is never the input directory._
