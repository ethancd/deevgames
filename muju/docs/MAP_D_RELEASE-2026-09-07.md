> **Historical baseline — superseded on the v2.1 feature branch (2026-09-09).**
> The well, depth, mine action, build queue/times, hidden economy and three-phase
> teaching below are historical. Current rules use passive 0/4/8/10 reserves
> (520 total), public tier-1 purchase and later-turn promotion. See [SPEC](../SPEC.md),
> [mining report](MINING_SIMPLIFICATION-2026-09-09.md) and
> [placement report](PLACEMENT_SIMPLIFICATION-2026-09-09.md). Old measurements
> remain labeled by their original versions; none establishes v2.1 balance.
> Production release status is tracked by the repository’s deployment workflow.

# Map D production release — 2026-09-07

> Historical release/report: the later [empty-approaches update](EMPTY_APPROACHES-2026-09-07.md) changes new games to 308 crystals. The measurements below describe the original 340-crystal map.

New games use **Unequal routes**, map D from the five-map study. Board size stays 10×10 and the v1.3 unit catalogue is unchanged. The deterministic layout has 340 crystals: twenty five-layer cells, sixteen four-layer shelves, forty-eight three-layer cells, and sixteen two-layer approaches. It is symmetric under a 180° rotation, with different routes on the two wings.

Each cell starts at mining depth one, even when it contains fewer than five crystals. Existing schema-2 saves retain their exact board and depletion; an old uniform board continues with its original 500-crystal budget. New saves retain the initial capacities for conservation checks.

Pre-release validation: 562 unit/property tests passed, including exact agreement with the frozen study map, rotational symmetry, shallow-cell mining, resource conservation and legacy/new save round trips. All 17 browser tests pass. Full-site checks pass at phone and tablet sizes for Muju, FORGE and Oracle; the map was also visually inspected.

## Post-deployment hypotheses, registered before playtests

Compare A and D with identical v1.3 units, matched seeds and reversed seats. Distinguish natural wins from turn-cap material adjudication.

1. Starter access remains equal, but active opposition may alter early income.
2. Reduced deep ore may reduce the return on Plant upgrades and higher-tier miners.
3. Rush/denial may gain against passive mining; moving between deposits should matter more.
4. Unequal routes should create expansion choices without a seat advantage.
5. Mono-element and tier usage should reveal vulnerabilities, not certify that every unit is viable.

Use existing scripted styles as regression controls and report their limitations. The previous static study is a historical experiment with A as the then-current baseline; its raw results remain unchanged. Competitive tests begin only after map D is deployed and verified. Results will be recorded separately.

## Completed playtests

See [the post-deployment report](MAP_D_PLAYTESTS-2026-09-07.md): 5,760 scripted games plus six completed search-AI calibration games, with paired outcomes, mineral-stock controls, limitations and reproducible evidence.
