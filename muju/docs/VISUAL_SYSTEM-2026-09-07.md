> **Historical baseline — superseded on the v2.1 feature branch (2026-09-09).**
> The well, depth, mine action, build queue/times, hidden economy and three-phase
> teaching below are historical. Current rules use passive 0/4/8/10 reserves
> (520 total), public tier-1 purchase and later-turn promotion. See [SPEC](../SPEC.md),
> [mining report](MINING_SIMPLIFICATION-2026-09-09.md) and
> [placement report](PLACEMENT_SIMPLIFICATION-2026-09-09.md). Old measurements
> remain labeled by their original versions; none establishes v2.1 balance.
> This branch has not been deployed.

> Catalogue/visual-rank numbers superseded by v1.5: [tier-3 cap report](TIER3_CAP-2026-09-08.md). Historical measurements below remain unchanged.

# Crystal wells and elemental armies

Visual implementation based on production source `9c2a94d` (WASM AI, map D and home victory included). The original visual change affected graphics and explanatory UI only. It is included in the [empty-approaches release](EMPTY_APPROACHES-2026-09-07.md), which also changes starting map capacity from 340 to 308 crystals.

## Reading a square

Reserve size and excavation depth are independent on map D. Two squares can each have three crystals while the next accessible layers are at depths 1 and 3. The renderer uses the real `resourceLayers` and `minedDepth`, never an assumed fixed five-crystal starting capacity.

- Reserve brightness: five crystals = pale aqua; four = turquoise; three = blue teal; two = slate blue; one = deep blue; zero = dark bedrock. The palette is sequential in brightness, so it remains informative in grayscale.
- Excavation: translucent inset shadows get deeper as layers are mined, producing a recessed well effect. Selection and movement previews draw over the floor without replacing its reserve color or hiding its gauge.
- Exact depth: a vertical five-slot gauge always reads shallow → deep. Filled slots are crystals left; hollow sockets are mined layers; short rock marks are depths the seam never contained. The first filled slot is the Mining required to extract anything. The final non-bedrock slot identifies how deep this square goes.
- Optional numeric inspection: **Depths** shows the reserve count followed by `↓` and the next mining depth. Pieces make space above the readout. Empty cells show no fictitious next layer. Native labels/tooltips give exact values; movement previews and the selected-unit panel explain extraction.

Open **Key** beside Depths for illustrated examples. This dialog adds no height to the playing screen when closed. Movement cues are restrained cream dots/rings, while the selected destination has a clear gold outline. Home markers and the invasion warning remain intact.

## Reading a piece

- Army: **Ivory / White** has a round, pale stone base with dark symbols. **Obsidian / Black** has an angular, dark stone base with light symbols. Ownership survives grayscale and is not encoded solely by element-color brightness.
- Element: flame, bolt, drop, crescent, leaf and anvil have different silhouettes. These original SVG graphics are reused by the board, shop, queue and selected-unit panel. They stay crisp at phone sizes without bitmap downloads or an asset-library dependency.
- Tier: one to four base marks identify exact rank. Higher-tier counters become larger; tiers 3–4 add an inner rim, and tier 4 adds a crest. Tier is not a universal attack value: the full current stats remain in the selection panel.
- Damage: a contrasting red badge shows damage without removing army or element identity.

## Verification and review artifacts

- `npm run build` passes, including the unchanged WASM build.
- All 27 browser cases passed: the prior 24 mobile, map, invasion, and AI-worker cases plus three visual regressions. The three visual cases passed again after the numeric-inspection spacing adjustment.
- New cases cover shallow/deep cells with equal reserves, extracted versus absent layers, depletion text, retained reserve color during movement previews, all 48 army/element/tier variants, rank marks, damage, grayscale screenshots, and keyboard safety in the visual key.
- WebKit 26.0 touch checks at 390×664, 320×568, and 844×390 passed with no document overflow. Mining changed the readout to `3↓3`; computed inset shadows matched two excavated layers. These are simulated browser viewports, not a physical iPhone test.
- Visually inspected normal play, move previews, the visual key, numeric inspection, and a deliberately crowded 48-piece board in color and grayscale. The existing one-screen layout is retained.

[Complete visual reference](visual-system/reference.png) · [iPhone board](visual-system/iphone.png) · [iPhone move preview](visual-system/iphone-move.png)

To regenerate the reference from the actual components, run `npm run build` in `muju`, then `node --import tsx tools/render-visual-reference.tsx /private/tmp/muju-visual-reference.html`. Open the generated HTML in a browser at 1072px wide. It embeds the built stylesheet and renders the SVG components directly, so the reference cannot silently diverge from a separate illustration file.

This release includes the latest production branch and uses the existing deevgames full-site release workflow. Vite still emits content-hashed CSS/JS and unchanged worker/WASM assets. No ashkie-pages deployable files or offline manifest were edited.
