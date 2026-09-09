> **Historical baseline — superseded on the v2.1 feature branch (2026-09-09).**
> The well, depth, mine action, build queue/times, hidden economy and three-phase
> teaching below are historical. Current rules use passive 0/4/8/10 reserves
> (520 total), public tier-1 purchase and later-turn promotion. See [SPEC](../SPEC.md),
> [mining report](MINING_SIMPLIFICATION-2026-09-09.md) and
> [placement report](PLACEMENT_SIMPLIFICATION-2026-09-09.md). Old measurements
> remain labeled by their original versions; none establishes v2.1 balance.
> This branch has not been deployed.

# Empty approaches and clearer armies — 2026-09-07

New games use the revised Unequal routes map: all sixteen starting two-crystal cells are now blank (zero crystals, zero mined depth). The remaining 84 cells are unchanged: 20 × five, 16 × four, and 48 × three crystals, for **308 total**. Rotation and starting homes are unchanged. Empty squares remain walkable and eligible for normal reinforcement placement.

This changes initial map capacity only. Mining can still leave two crystals in a well. Saved games retain their exact state and original resource budget. Start a new game to play the revised map.

The release also includes blue-green reserve shading, inset excavation depth and crystal gauges, and ivory/obsidian army graphics with six element silhouettes and tier marks. The board key distinguishes blank bedrock from an exhausted well; the how-to-play examples use the same graphics as the board.

Historical map-study and playtest fixtures remain frozen at 340 crystals. Their balance results are not measurements of the revised map. Unit stats and AI search rules are unchanged.

## Release verification

- 622 unit/property tests and all 27 browser tests pass, including all five AI worker levels.
- New checks prove the exact 16-cell delta, 308 total, rotation, zero mining yield, normal movement and spawn eligibility, and persistence of two-crystal remainders.
- The complete three-game build and phone/tablet gameplay smoke checks pass.
- WebKit touch viewports at 390×664, 320×568 and 844×390 show 16 blank cells, 308 crystals, and no document overflow. The iPhone-size board was visually inspected.

Published source `b6c04bc` to [production](https://deevgames.pages.dev/muju/) via [deployment d01fcd4c](https://d01fcd4c.deevgames.pages.dev). Live HTML, CSS, JavaScript, worker and WASM hashes match the local artifact. Production map/save and WASM rescue tests pass, as do all three games’ phone/tablet smoke checks. The [Games workflow](https://github.com/ethancd/deevgames/actions/runs/34178196394) passed; publishing used local Wrangler. Evidence is in `lab/results/empty-approaches-2026-09-07/production/`.
