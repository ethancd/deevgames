# Shared design brief

## Locked construction and appearance

The printer is a Bambu Lab H2C. Assume access to all needed filament colors. Prefer separate single-color parts assembled after printing; a large palette does not require every spool loaded at once.

**Board:** a 10 × 10 board made from 100 individual square tiles with slight puzzle-piece interlocks. Use broad, forgiving connections. Each tile has four integral small nubbins near its edge midpoints, inset into its own square. They hold resource stacks without sharing a stud with an adjacent tile. Use **98 medium-gray tiles, one ivory home tile, and one charcoal home tile**. The home colors must match the respective ownership bases. All tiles have the same resource functionality. No checkerboard, concentric color scheme, or tile colors based on initial resource values. Home positions are A1 and J10; verify coordinate orientation against current code.

**Pieces:** both armies use octagonal ownership bases of the same geometry. A colored element glyph stands upright in a keyed removable connection in the base. The same glyph can be removed and laid flat on the board to represent a pending summon. No second set of ghost models and no ownership-colored bases for pending summons. Preserve glyph identity from Muju's actual vector artwork, thickening fragile features when necessary and documenting the change.

**Promotions must stack additively:**

- T1 = glyph + original ownership base.
- T2 = glyph + original base + a wider T2 pedestal underneath.
- T3 = glyph + original base + that same T2 pedestal + a separate, wider T3 pedestal underneath T2.

Never replace the T2 pedestal with a single tall T3 part. Both lower layers remain visible at T3. All pedestal layers match the army's ivory or charcoal color. Engineer enough retention to lift a piece without leaving its pedestal behind, while permitting deliberate disassembly. The tier should be legible through silhouette; understated tier marks are optional.

**Crystals:** small translucent cyan/teal cubes, each with a top stud and bottom socket, stackable like an original one-stud construction brick. No requirement for compatibility with a commercial brick system. Four stacks fit on every board tile. Initial values are represented as 0 = no cubes, 4 = four single cubes, 8 = four two-cube stacks, 16 = four four-cube stacks. Mining removes cubes; later stacks may be uneven. Crystals are the ninth color among pieces/resources; medium-gray board filament brings the total palette to ten. Include one distinguishable half-crystal token for fractional handicap accounting.

**No accessory creep:** people can remember things. Do not add a kill-clock widget, outgoing-summon tray, damage dashboard, turn tracker, or compulsory bank apparatus. Ordinary bowls or piles are sufficient. Focus on board, bases, glyphs, tier additions, and crystals.

## Palette

| Use | Required visual color | Bambu product research starting point |
|---|---|---|
| Ivory army and its home | Ivory/white, exactly matching | PLA Matte Ivory White; inspect actual swatches |
| Charcoal army and its home | Charcoal/black, exactly matching | PLA Matte Charcoal |
| Other board tiles | Medium neutral gray | Research current matte gray choices |
| Fire / flame | Red/crimson | PLA Basic Red |
| Lightning / bolt | Bright yellow | PLA Basic Yellow |
| Water / droplet | Saturated blue | PLA Basic Cobalt Blue |
| Shadow / crescent | Purple | PLA Basic Purple |
| Plant / leaf | Green | PLA Basic Bambu Green |
| Metal / anvil | Warm orange, copper, bronze, or brass | PLA Metal Copper Brown Metallic |
| Crystals | Translucent pale aqua/cyan | PETG Translucent Teal; assess appearance at final thickness |

Metal must not default to silver or steel gray. Metallic appearance does not require metal-filled filament. Product names are research leads, not promises about current stock, prices, exact hue, or settings. Check material-dependent fits, especially PETG crystals on PLA studs. Avoid showing crystals as opaque white in final model renders.

## Inventory for one complete variant

| Part | Quantity | Allocation |
|---|---:|---|
| Regular medium-gray tile | 98 | Board |
| Ivory home tile | 1 | Same ivory as army |
| Charcoal home tile | 1 | Same charcoal as army |
| Ivory octagonal ownership base | 48 | Eight per element |
| Charcoal octagonal ownership base | 48 | Eight per element |
| Fire glyph | 16 | Eight per player |
| Lightning glyph | 16 | Eight per player |
| Water glyph | 16 | Eight per player |
| Shadow glyph | 16 | Eight per player |
| Plant glyph | 16 | Eight per player |
| Metal glyph | 16 | Eight per player |
| Ivory T2 pedestal | 18 | Includes the T2 layer needed by T3 pieces |
| Charcoal T2 pedestal | 18 | Includes the T2 layer needed by T3 pieces |
| Ivory T3 pedestal | 6 | Used underneath a T2 pedestal |
| Charcoal T3 pedestal | 6 | Used underneath a T2 pedestal |
| Whole crystal cube | 550 | 504 on map, up to 18 whole handicap, at least 28 spare |
| Half-crystal token | 1 | Fractional handicap |
| **Total individual printed objects** | **891** | Integral tile studs do not add objects |

Starting units come from this stock. Loose summons use these same 96 glyphs. Eight of each element per side is a manufacturing allocation, not an unannounced change to the canonical game. Allow proxies or further prints when stock runs out; do not silently impose a unit cap. Pedestal supply likewise is not a new promotion limit. These pedestal quantities support 24 T2 and 12 T3 pieces simultaneously across both armies. Fit coupons are additional development prints and must be accounted for separately.

If connectors require edge/corner tile subtypes, subdivide the 100-tile inventory explicitly, preserving 98 gray and exactly two correctly colored homes. Prefer a simple reusable tile design where practical. Any separate connector is a disclosed engineering deviation with an updated object count, not a hidden extra.

## Starting dimensions, not frozen requirements

Investigate a 50 mm tile pitch (approximately 500 × 500 mm board), 28 mm base across flats, 32 mm T2 across flats, and 34 mm T3 across flats. Start around 5 mm base thickness and 3 mm per added pedestal; derive final height and overlap from retention and stability needs. Investigate 5–6 mm cube bodies. State across-flats versus across-corners dimensions explicitly. Calculate fit with all four resource stacks present, a full T3 piece, and a loose pending glyph where legal. Resize coherently if fingers, glyph tips, or stacks collide. Do not treat guessed clearances as validated manufacturing tolerances.

## Game fidelity

Read current canonical rules before interpreting the physical states. The current map source contains 18 zero tiles, 54 four-crystal tiles, 20 eight-crystal tiles, and eight sixteen-crystal tiles, totaling 504 cubes. Verify this automatically rather than transcribing the map by eye.

Pending summons are represented by neutral loose glyphs and are distinct from actual occupying pieces. The user's intended normal handoff needs no ownership base on them. Inspect exact timing: if the current Prepare/arrival sequence creates a brief overlap of pending cohorts, explain a simple human handoff procedure that preserves information and rules; do not solve it by inventing a tray or changing the engine. Check legal coexistence of a pending marker with an occupying piece. Describe physical handling separately from game-rule claims.

## Local and web references to inspect

Current sources, relative to repository root:

- `muju/SPEC.md`
- `muju/src/game/units.ts`, `types.ts`, `elements.ts`, `resourceMap.ts`, `turn.ts`, `promotion.ts`, `building.ts`
- `muju/src/components/ElementGlyph.tsx`, `UnitArtwork.tsx`, `Unit.tsx`, `Cell.tsx`, `CrystalLights.tsx`
- `muju/src/index.css` and `muju/src/utils/colors.ts`
- Live UI: https://deevgames.pages.dev/muju/

Prior physical work:

- `outputs/muju-print-reference-b5117f43/README.md`
- `outputs/muju-print-reference-b5117f43/preview.png`
- `outputs/muju-print-reference-b5117f43/muju-tier1-3d-print.zip`
- `outputs/muju-baroque-reference-v1/README.md`
- `outputs/muju-baroque-reference-v1/SOURCE.md`
- `outputs/muju-baroque-reference-v1/asset-provenance.json`
- `outputs/muju-baroque-reference-v1/gallery/index.html` and `gallery/images/`
- Optional local originals: `muju/print/baroque-concepts-v1/site/`; backup commit `b5117f43`, historical path `muju/print/tier1/`. These need not exist in a cloud checkout; the bundled references above are sufficient.
- Prior concept gallery: https://muju-turned-court.ethan-sfc.chatgpt.site/

The recovered Tier 1 package contains actual flat token geometry and generators; it is useful for glyph extraction, export conventions, and provenance. Its rounded white token shape and flat relief construction are superseded here. The Baroque gallery contains concept art, not proof of printable CAD. Borrow design lessons, not its tall monolithic figurine construction. Verify available files before relying on them; missing old material should be reported without fabricating it or blocking independent new design work.
