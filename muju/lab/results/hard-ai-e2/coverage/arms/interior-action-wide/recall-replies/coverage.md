# E2.2 coverage trace — interior-action-wide-recall

Rows: 50 (root 0, reply 50).
Cones are named per row; `search/pvs.ts generateAt` picks `gen` at ply 0 and `genInterior` at ply 1.

## Stage histogram

| stage | root | reply |
| --- | --- | --- |
| beam | 0 | 17 |
| combo | 0 | 1 |
| present | 0 | 32 |

## Rows

| id | kind | cone | stage | capture | plan | combo | beamReached | beamEmitted | K | finalRank | marginCc |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| reply#fuzz-5150-0-287 | reply | reply:ablate:interior-action-wide.genInterior | present | reference | -1/0 | -1/0 | 0 | 0 | 16 | 2/21 | 1000696 |
| reply#fuzz-5150-0-282 | reply | reply:ablate:interior-action-wide.genInterior | beam | reference | 0/1 | 0/1 | 0 | 0 | 16 | -1/22 | 0 |
| reply#fuzz-5150-0-279 | reply | reply:ablate:interior-action-wide.genInterior | present | reference | -1/0 | -1/0 | 0 | 0 | 16 | 2/18 | 1000024 |
| reply#fuzz-5150-0-274 | reply | reply:ablate:interior-action-wide.genInterior | beam | reference | 1/3 | 1/3 | 0 | 0 | 16 | -1/22 | 0 |
| reply#fuzz-5150-0-269 | reply | reply:ablate:interior-action-wide.genInterior | present | reference | -1/0 | -1/0 | 1 | 1 | 16 | 6/21 | 1529 |
| reply#fuzz-5150-0-264 | reply | reply:ablate:interior-action-wide.genInterior | present | reference | -1/0 | -1/0 | 1 | 1 | 16 | 6/22 | 2276 |
| reply#fuzz-5150-0-258 | reply | reply:ablate:interior-action-wide.genInterior | beam | reference | -1/0 | -1/0 | 0 | 0 | 16 | -1/21 | 0 |
| reply#fuzz-5150-0-254 | reply | reply:ablate:interior-action-wide.genInterior | present | reference | -1/0 | -1/0 | 1 | 1 | 16 | 6/19 | 998226 |
| reply#fuzz-5150-0-250 | reply | reply:ablate:interior-action-wide.genInterior | present | reference | -1/0 | -1/0 | 1 | 1 | 16 | 5/19 | 3343 |
| reply#fuzz-5150-0-246 | reply | reply:ablate:interior-action-wide.genInterior | present | reference | -1/0 | -1/0 | 1 | 1 | 16 | 5/21 | 2163 |
| reply#fuzz-5150-0-242 | reply | reply:ablate:interior-action-wide.genInterior | present | reference | -1/0 | -1/0 | 1 | 1 | 16 | 6/20 | 998650 |
| reply#fuzz-5150-0-237 | reply | reply:ablate:interior-action-wide.genInterior | beam | reference | -1/0 | -1/0 | 0 | 0 | 16 | -1/20 | 0 |
| reply#fuzz-5150-0-230 | reply | reply:ablate:interior-action-wide.genInterior | beam | reference | 0/1 | 0/1 | 0 | 0 | 16 | -1/20 | 0 |
| reply#fuzz-5150-0-227 | reply | reply:ablate:interior-action-wide.genInterior | beam | reference | -1/0 | -1/0 | 0 | 0 | 16 | -1/20 | 0 |
| reply#fuzz-5150-0-221 | reply | reply:ablate:interior-action-wide.genInterior | present | reference | -1/0 | -1/0 | 1 | 1 | 16 | 6/20 | 916 |
| reply#fuzz-5150-0-215 | reply | reply:ablate:interior-action-wide.genInterior | beam | reference | -1/0 | -1/0 | 0 | 0 | 16 | -1/22 | 0 |
| reply#fuzz-5150-0-209 | reply | reply:ablate:interior-action-wide.genInterior | present | reference | 1/7 | 1/7 | 1 | 1 | 16 | 4/20 | 843 |
| reply#fuzz-5150-0-201 | reply | reply:ablate:interior-action-wide.genInterior | beam | reference | 0/7 | 0/7 | 0 | 0 | 16 | -1/21 | 0 |
| reply#fuzz-5150-0-198 | reply | reply:ablate:interior-action-wide.genInterior | present | reference | -1/0 | -1/0 | 0 | 0 | 16 | 2/22 | 999313 |
| reply#fuzz-5150-452-221 | reply | reply:ablate:interior-action-wide.genInterior | present | reference | -1/0 | -1/0 | 1 | 1 | 16 | 3/13 | 2262 |
| reply#fuzz-5150-959-236 | reply | reply:ablate:interior-action-wide.genInterior | present | reference | -1/0 | -1/0 | 1 | 1 | 16 | 9/25 | 3104 |
| reply#fuzz-5150-275-195 | reply | reply:ablate:interior-action-wide.genInterior | present | reference | -1/0 | -1/0 | 1 | 1 | 16 | 1/13 | 3325 |
| reply#fuzz-5150-0-169 | reply | reply:ablate:interior-action-wide.genInterior | present | reference | -1/0 | -1/0 | 0 | 0 | 16 | 6/22 | 995240 |
| reply#fuzz-5150-0-164 | reply | reply:ablate:interior-action-wide.genInterior | present | reference | -1/0 | -1/0 | 0 | 0 | 16 | 8/23 | 997897 |
| reply#fuzz-5150-297-207 | reply | reply:ablate:interior-action-wide.genInterior | present | reference | -1/0 | -1/0 | 0 | 0 | 16 | 3/21 | 999434 |
| reply#fuzz-5150-312-264 | reply | reply:ablate:interior-action-wide.genInterior | present | reference | -1/0 | -1/0 | 1 | 1 | 16 | 1/15 | 3736 |
| reply#fuzz-5150-1132-185 | reply | reply:ablate:interior-action-wide.genInterior | beam | reference | -1/0 | -1/0 | 0 | 0 | 16 | -1/25 | 0 |
| reply#fuzz-5150-1479-209 | reply | reply:ablate:interior-action-wide.genInterior | beam | reference | 0/1 | 0/4 | 0 | 0 | 16 | -1/18 | 0 |
| reply#fuzz-5150-0-141 | reply | reply:ablate:interior-action-wide.genInterior | present | reference | -1/0 | -1/0 | 1 | 1 | 16 | 2/18 | 1000245 |
| reply#fuzz-5150-579-172 | reply | reply:ablate:interior-action-wide.genInterior | beam | reference | -1/0 | -1/0 | 0 | 0 | 16 | -1/24 | 0 |
| reply#fuzz-5150-1051-185 | reply | reply:ablate:interior-action-wide.genInterior | present | reference | -1/0 | -1/0 | 1 | 1 | 16 | 2/12 | 4444 |
| reply#fuzz-5150-0-129 | reply | reply:ablate:interior-action-wide.genInterior | present | reference | -1/0 | -1/0 | 1 | 1 | 16 | 6/21 | 984 |
| reply#fuzz-5150-1461-123 | reply | reply:ablate:interior-action-wide.genInterior | present | reference | -1/0 | -1/0 | 1 | 1 | 16 | 1/15 | 1289 |
| reply#fuzz-5150-0-119 | reply | reply:ablate:interior-action-wide.genInterior | present | reference | 0/1 | 0/4 | 1 | 1 | 16 | 4/21 | 0 |
| reply#fuzz-5150-0-116 | reply | reply:ablate:interior-action-wide.genInterior | beam | reference | 0/12 | 0/8 | 0 | 0 | 16 | -1/22 | 0 |
| reply#fuzz-5150-0-112 | reply | reply:ablate:interior-action-wide.genInterior | present | reference | 1/12 | 1/8 | 1 | 1 | 16 | 1/23 | 2643 |
| reply#fuzz-5150-979-135 | reply | reply:ablate:interior-action-wide.genInterior | beam | reference | -1/0 | -1/0 | 0 | 0 | 16 | -1/31 | 0 |
| reply#fuzz-5150-0-103 | reply | reply:ablate:interior-action-wide.genInterior | beam | reference | -1/0 | -1/0 | 0 | 0 | 16 | -1/20 | 0 |
| reply#fuzz-5150-1550-118 | reply | reply:ablate:interior-action-wide.genInterior | present | reference | -1/0 | -1/0 | 0 | 0 | 16 | 5/18 | 999242 |
| reply#fuzz-5150-0-88 | reply | reply:ablate:interior-action-wide.genInterior | present | reference | 3/12 | 3/8 | 1 | 1 | 16 | 7/23 | 590 |
| reply#fuzz-5150-1716-115 | reply | reply:ablate:interior-action-wide.genInterior | present | reference | -1/0 | -1/0 | 1 | 1 | 16 | 4/13 | 2873 |
| reply#fuzz-5150-1365-120 | reply | reply:ablate:interior-action-wide.genInterior | present | reference | -1/0 | -1/0 | 1 | 1 | 16 | 1/17 | 8136 |
| reply#fuzz-5150-1647-95 | reply | reply:ablate:interior-action-wide.genInterior | present | reference | -1/0 | -1/0 | 1 | 1 | 16 | 1/13 | 3060 |
| reply#fuzz-5150-0-69 | reply | reply:ablate:interior-action-wide.genInterior | beam | reference | -1/0 | -1/0 | 0 | 0 | 16 | -1/21 | 0 |
| reply#fuzz-5150-1113-66 | reply | reply:ablate:interior-action-wide.genInterior | combo | reference | 9/12 | -1/8 | 0 | 0 | 16 | -1/20 | 0 |
| reply#fuzz-5150-1345-63 | reply | reply:ablate:interior-action-wide.genInterior | present | reference | -1/0 | -1/0 | 0 | 0 | 16 | 1/11 | 0 |
| reply#fuzz-5150-1449-45 | reply | reply:ablate:interior-action-wide.genInterior | beam | reference | -1/0 | -1/0 | 0 | 0 | 16 | -1/17 | 0 |
| reply#fuzz-5150-1499-51 | reply | reply:ablate:interior-action-wide.genInterior | present | reference | -1/0 | -1/0 | 1 | 1 | 16 | 10/24 | 997812 |
| reply#fuzz-5150-1044-37 | reply | reply:ablate:interior-action-wide.genInterior | present | reference | -1/0 | -1/0 | 1 | 1 | 16 | 4/20 | 722 |
| reply#fuzz-5150-531-27 | reply | reply:ablate:interior-action-wide.genInterior | beam | reference | -1/0 | -1/0 | 0 | 0 | 16 | -1/19 | 0 |

Present in the generator's own list: 32/50. Those rows were removed by nothing under `gen/`; the `searched` column stays null until `RootResult.candidates` (lane 1) is merged.
