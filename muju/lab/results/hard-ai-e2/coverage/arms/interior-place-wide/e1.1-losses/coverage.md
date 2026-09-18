# E2.2 coverage trace — interior-place-wide-losses

Rows: 56 (root 28, reply 28).
Cones are named per row; `search/pvs.ts generateAt` picks `gen` at ply 0 and `genInterior` at ply 1.

## Stage histogram

| stage | root | reply |
| --- | --- | --- |
| beam | 0 | 1 |
| keep | 0 | 1 |
| present | 28 | 26 |

## Rows

| id | kind | cone | stage | capture | plan | combo | beamReached | beamEmitted | K | finalRank | marginCc |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| g2-s20_3_15-A-white:t3:root | root | root:ablate:interior-place-wide.gen | present | reference | 8/12 | 11/16 | 1 | 1 | 24 | 6/28 | 1121 |
| g2-s20_3_15-A-white:t3:reply | reply | reply:ablate:interior-place-wide.genInterior | present | reference | 2/4 | 2/4 | 1 | 1 | 16 | 2/17 | 793 |
| g2-s20_3_15-A-white:t26:root | root | root:ablate:interior-place-wide.gen | present | reference | -1/0 | -1/0 | 1 | 1 | 24 | 6/15 | 673 |
| g2-s20_3_15-A-white:t26:reply | reply | reply:ablate:interior-place-wide.genInterior | keep | reference | -1/0 | -1/0 | 1 | 0 | 16 | -1/14 | -92 |
| g2-s20_3_15-B-white:t7:root | root | root:ablate:interior-place-wide.gen | present | reference | 7/12 | 11/16 | 1 | 1 | 24 | 8/30 | 261 |
| g2-s20_3_15-B-white:t7:reply | reply | reply:ablate:interior-place-wide.genInterior | present | reference | 2/12 | 8/12 | 1 | 1 | 16 | 12/20 | 76 |
| g2-s20_3_15-B-white:t13:root | root | root:ablate:interior-place-wide.gen | present | reference | 5/12 | 10/16 | 1 | 1 | 24 | 14/32 | 525 |
| g2-s20_3_15-B-white:t13:reply | reply | reply:ablate:interior-place-wide.genInterior | present | reference | 7/12 | 8/12 | 1 | 1 | 16 | 20/22 | 18 |
| g2-s5_0_2-A-white:t4:root | root | root:ablate:interior-place-wide.gen | present | reference | 4/12 | 5/16 | 1 | 1 | 24 | 16/27 | 206 |
| g2-s5_0_2-A-white:t4:reply | reply | reply:ablate:interior-place-wide.genInterior | present | reference | -1/12 | -1/12 | 0 | 0 | 16 | 1/18 | 1264 |
| g2-s5_0_2-A-white:t22:root | root | root:ablate:interior-place-wide.gen | present | reference | -1/0 | -1/0 | 1 | 1 | 24 | 4/18 | 2622 |
| g2-s5_0_2-A-white:t22:reply | reply | reply:ablate:interior-place-wide.genInterior | present | reference | 4/12 | 4/12 | 1 | 1 | 16 | 13/20 | 177 |
| g4-s10_0_8-A-white:t3:root | root | root:ablate:interior-place-wide.gen | present | reference | 7/12 | 10/15 | 1 | 1 | 24 | 6/27 | 868 |
| g4-s10_0_8-A-white:t3:reply | reply | reply:ablate:interior-place-wide.genInterior | present | reference | 3/4 | 3/4 | 1 | 1 | 16 | 9/17 | 405 |
| g4-s10_0_8-A-white:t24:root | root | root:ablate:interior-place-wide.gen | present | reference | 2/7 | 5/16 | 1 | 1 | 24 | 6/29 | 818 |
| g4-s10_0_8-A-white:t24:reply | reply | reply:ablate:interior-place-wide.genInterior | present | reference | -1/0 | -1/0 | 1 | 1 | 16 | 5/19 | 870 |
| g4-s10_0_8-B-white:t7:root | root | root:ablate:interior-place-wide.gen | present | reference | 3/12 | 12/16 | 1 | 1 | 24 | 14/27 | 237 |
| g4-s10_0_8-B-white:t7:reply | reply | reply:ablate:interior-place-wide.genInterior | present | reference | -1/12 | -1/12 | 0 | 0 | 16 | 1/19 | 650 |
| g4-s10_0_8-B-white:t31:root | root | root:ablate:interior-place-wide.gen | present | reference | 1/3 | 1/3 | 0 | 0 | 24 | 1/31 | 193 |
| g4-s10_0_8-B-white:t31:reply | reply | reply:ablate:interior-place-wide.genInterior | present | none | -1/12 | -1/18 | 1 | 1 | 16 | 15/22 | 75 |
| g4-s10_3_9-A-white:t2:root | root | root:ablate:interior-place-wide.gen | present | reference | 9/12 | 10/13 | 1 | 1 | 24 | 13/27 | 872 |
| g4-s10_3_9-A-white:t2:reply | reply | reply:ablate:interior-place-wide.genInterior | present | reference | 6/12 | 6/12 | 1 | 1 | 16 | 12/19 | 204 |
| g4-s10_3_9-A-white:t19:root | root | root:ablate:interior-place-wide.gen | present | reference | 11/12 | 15/16 | 1 | 1 | 24 | 17/36 | 545 |
| g4-s10_3_9-A-white:t19:reply | reply | reply:ablate:interior-place-wide.genInterior | present | reference | -1/12 | -1/18 | 0 | 0 | 16 | 1/21 | -579 |
| g4-s2_3_1-B-white:t2:root | root | root:ablate:interior-place-wide.gen | present | reference | 4/6 | 7/9 | 0 | 0 | 24 | 2/28 | 956 |
| g4-s2_3_1-B-white:t2:reply | reply | reply:ablate:interior-place-wide.genInterior | present | reference | 3/9 | 4/10 | 1 | 1 | 16 | 18/21 | 63 |
| g4-s2_3_1-B-white:t24:root | root | root:ablate:interior-place-wide.gen | present | reference | -1/0 | -1/0 | 1 | 1 | 24 | 17/22 | 632 |
| g4-s2_3_1-B-white:t24:reply | reply | reply:ablate:interior-place-wide.genInterior | present | reference | -1/12 | -1/12 | 0 | 0 | 16 | 3/26 | -3130 |
| g4-s6_0_4-A-white:t4:root | root | root:ablate:interior-place-wide.gen | present | reference | 1/12 | 1/16 | 1 | 1 | 24 | 13/30 | 187 |
| g4-s6_0_4-A-white:t4:reply | reply | reply:ablate:interior-place-wide.genInterior | present | reference | 4/6 | 8/11 | 0 | 0 | 16 | 4/21 | -115 |
| g4-s6_0_4-A-white:t28:root | root | root:ablate:interior-place-wide.gen | present | reference | 0/1 | 0/3 | 0 | 0 | 24 | 3/25 | 2866 |
| g4-s6_0_4-A-white:t28:reply | reply | reply:ablate:interior-place-wide.genInterior | present | reference | -1/0 | -1/0 | 1 | 1 | 16 | 4/19 | 465 |
| g4-s6_3_5-A-white:t4:root | root | root:ablate:interior-place-wide.gen | present | reference | 8/12 | 10/16 | 1 | 1 | 24 | 17/29 | 196 |
| g4-s6_3_5-A-white:t4:reply | reply | reply:ablate:interior-place-wide.genInterior | present | reference | 6/12 | 5/12 | 1 | 1 | 16 | 14/24 | 1086 |
| g4-s6_3_5-A-white:t14:root | root | root:ablate:interior-place-wide.gen | present | reference | -1/12 | -1/16 | 0 | 0 | 24 | 1/29 | 574 |
| g4-s6_3_5-A-white:t14:reply | reply | reply:ablate:interior-place-wide.genInterior | present | reference | 4/12 | 5/12 | 1 | 1 | 16 | 18/24 | 118 |
| g4-s6_3_5-B-white:t1:root | root | root:ablate:interior-place-wide.gen | present | reference | 1/2 | 1/2 | 1 | 1 | 24 | 7/18 | 299 |
| g4-s6_3_5-B-white:t1:reply | reply | reply:ablate:interior-place-wide.genInterior | present | reference | 7/12 | 7/12 | 1 | 1 | 16 | 10/20 | 457 |
| g4-s6_3_5-B-white:t9:root | root | root:ablate:interior-place-wide.gen | present | reference | 4/12 | 4/12 | 1 | 1 | 24 | 9/32 | 570 |
| g4-s6_3_5-B-white:t9:reply | reply | reply:ablate:interior-place-wide.genInterior | present | reference | 9/12 | 9/12 | 1 | 1 | 16 | 7/20 | 484 |
| g5-s11_0_10-B-white:t1:root | root | root:ablate:interior-place-wide.gen | present | reference | -1/0 | -1/0 | 1 | 1 | 24 | 3/19 | 126 |
| g5-s11_0_10-B-white:t1:reply | reply | reply:ablate:interior-place-wide.genInterior | present | reference | 6/12 | 7/12 | 1 | 1 | 16 | 7/20 | 417 |
| g5-s11_0_10-B-white:t7:root | root | root:ablate:interior-place-wide.gen | present | reference | 2/12 | 6/16 | 1 | 1 | 24 | 18/29 | 384 |
| g5-s11_0_10-B-white:t7:reply | reply | reply:ablate:interior-place-wide.genInterior | present | none | -1/12 | -1/12 | 1 | 1 | 16 | 9/20 | 307 |
| g5-s11_3_11-B-white:t2:root | root | root:ablate:interior-place-wide.gen | present | reference | 3/6 | 5/9 | 1 | 1 | 24 | 23/28 | 97 |
| g5-s11_3_11-B-white:t2:reply | reply | reply:ablate:interior-place-wide.genInterior | present | reference | 1/9 | 2/10 | 1 | 1 | 16 | 7/21 | 845 |
| g5-s11_3_11-B-white:t13:root | root | root:ablate:interior-place-wide.gen | present | reference | 5/7 | 7/9 | 1 | 1 | 24 | 12/29 | 327 |
| g5-s11_3_11-B-white:t13:reply | reply | reply:ablate:interior-place-wide.genInterior | beam | none | -1/12 | -1/12 | 0 | 0 | 16 | -1/23 | 0 |
| g5-s7_3_7-A-white:t4:root | root | root:ablate:interior-place-wide.gen | present | reference | 8/12 | 10/16 | 1 | 1 | 24 | 17/29 | 196 |
| g5-s7_3_7-A-white:t4:reply | reply | reply:ablate:interior-place-wide.genInterior | present | reference | 6/12 | 5/12 | 1 | 1 | 16 | 14/24 | 1086 |
| g5-s7_3_7-A-white:t14:root | root | root:ablate:interior-place-wide.gen | present | reference | -1/12 | -1/16 | 0 | 0 | 24 | 1/29 | 574 |
| g5-s7_3_7-A-white:t14:reply | reply | reply:ablate:interior-place-wide.genInterior | present | reference | 4/12 | 5/12 | 1 | 1 | 16 | 18/24 | 118 |
| g5-s7_3_7-B-white:t1:root | root | root:ablate:interior-place-wide.gen | present | reference | 1/2 | 1/2 | 1 | 1 | 24 | 7/18 | 299 |
| g5-s7_3_7-B-white:t1:reply | reply | reply:ablate:interior-place-wide.genInterior | present | reference | 7/12 | 7/12 | 1 | 1 | 16 | 10/20 | 457 |
| g5-s7_3_7-B-white:t9:root | root | root:ablate:interior-place-wide.gen | present | reference | 4/12 | 4/12 | 1 | 1 | 24 | 9/32 | 570 |
| g5-s7_3_7-B-white:t9:reply | reply | reply:ablate:interior-place-wide.genInterior | present | reference | 9/12 | 9/12 | 1 | 1 | 16 | 7/20 | 484 |

Present in the generator's own list: 54/56. Those rows were removed by nothing under `gen/`; the `searched` column stays null until `RootResult.candidates` (lane 1) is merged.
