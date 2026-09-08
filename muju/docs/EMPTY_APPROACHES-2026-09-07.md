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
