# Physical test sequence (IF1 interface set)

Nothing on this page has been done yet. Every result field is blank until someone prints and
measures. Do not record a pass without the part in hand.

Record for each print: printer and firmware, Bambu Studio version, nozzle, plate, filament
(product, colour, lot), process profile (layer height, walls, infill), elephant-foot
compensation, and room humidity if known.

Clearances are **per side** (radial) unless marked **diametral**.

## Stage 1 — coupons (`print/calibration/`)

| # | Coupon | Material | What to test | Pass criterion | Result |
|---|---|---|---|---|---|
| 1.1 | `coupon-glyph-slots`, row A (clearance 0.10 / 0.15 / 0.20 / 0.25; ribs 0.25) | Ivory, then Charcoal PLA Matte | Insert the tang gauge. Lift the block by the gauge. Pull it out. | Enters by hand without tools. Holds the block (≥ 30 g) when lifted. Removable by hand. No wobble over 1 mm at the glyph top. | ivory: ___ charcoal: ___ |
| 1.2 | `coupon-glyph-slots`, row B (ribs 0 / 0.15 / 0.25 / 0.35 at 0.15 clearance) | same | as 1.1 | Pick the smallest rib that passes 1.1 | ___ |
| 1.3 | Tang gauge turned 180° | — | Try the wrong-way insertion | Must **not** enter | ___ |
| 1.4 | `coupon-recess-plate` (0.05 / 0.10 / 0.15 / 0.20) with boss keys r0 / r10 / r20 / r30 (notches = tenths of a mm) | Ivory, Charcoal | Seat each key. Lift the plate by the key. | Seats flush. Lifts the plate (~15 g). Separates by hand. Rotation is locked by the octagon. | ___ |
| 1.5 | `coupon-crystal-socket-10/20/30/40` (diametral socket clearance; 1–4 notches) on `coupon-stud-strip` and on each other | PETG on PLA studs; PETG on PETG | Stack 4-high. Tilt the strip 30°. Lift the top cube. | Stack survives the 30° tilt. Lifting the top cube leaves the others seated (**the column must not come up with it**). | ___ |
| 1.6 | `coupon-tile-tab` into `coupon-tile-socket-15/25/35` | Gray PLA Matte | Drop in vertically. Slide the strips on a table. | Drops in by hand. Strips stay joined when pushed sideways. Visible seam ≤ 0.6 mm. | ___ |

Measure the actual slot, recess and socket sizes with calipers where possible:
slot width ___ × ___ mm (nominal 6.30 × 4.80), recess across flats ___ mm (nominal 14.30),
crystal socket ___ mm (nominal 3.45).

**Then edit `cad/params.json`** (`glyph.slot_clearance_per_side`, `glyph.slot_rib_protrusion`,
`piece.recess.clearance_per_side`, `piece.boss.rib_protrusion`,
`crystal.socket_diameter_clearance_diametral`, `board.tab.clearance_per_side`), regenerate, and
record the change here: ___

## Stage 2 — production parts, small batch

| # | Test | Pass criterion | Result |
|---|---|---|---|
| 2.1 | Print one of each glyph and one base per army. Insert all six glyphs into one base, each in turn. | Every glyph fits the same base. Fit feel is similar across colours (PLA Basic vs Metal). | ___ |
| 2.2 | Build a full T3 (glyph + base + T2 + T3) in **each** owner colour. Lift it by the glyph 20 times. | No layer is left behind. It separates deliberately by hand each time. | ___ |
| 2.3 | Assemble and disassemble each joint 50 times. Re-test 2.2. | Retention still ≥ 3× the stack weight (about 0.3 N): lifts the full stack. No cracking at the tang root or boss. | ___ |
| 2.4 | Wobble: T3 on a tile, push the glyph top sideways 2 mm | Returns without rocking on the tile studs. | ___ |
| 2.5 | Inspect layer failures: tang root, bolt tip neck, leaf stem, crescent tips | No delamination or cracks | ___ |
| 2.6 | Drop test: glyph lying flat, dropped 30 cm onto a table, 10× | No broken tips | ___ |

## Stage 3 — tile patch and ergonomics

Print a 3 × 3 patch (interior tiles; one ivory corner if you want the home colour check) and 36 crystals.

| # | Test | Pass criterion | Result |
|---|---|---|---|
| 3.1 | Four 4-high stacks on each tile. T3 pieces on the centre and on two neighbours, one rotated 22.5°. | Nothing touches (digital clearance 1.18 mm at worst rotation). | ___ |
| 3.2 | Take one cube from the top of a stack, with the pieces in place | Adult fingers can pinch a single cube without toppling a neighbour or lifting the column | ___ |
| 3.3 | Move a T3 piece off and back on the tile | No stacks disturbed | ___ |
| 3.4 | Lay a loose metal glyph (the largest) beside the centre T3 piece | It fits in the free corner or overhangs the seam less than 3 mm; the owning square is still unambiguous | ___ |
| 3.5 | Home tile colour: ivory and charcoal tiles next to a matching base under table lighting | Same colour and finish. Clearly different from the gray tiles and from each other. | ___ |
| 3.6 | Crystal colour: PETG teal cubes next to gray tiles and the cobalt blue glyph | Cubes read as cyan/aqua and translucent, not blue or white | ___ |

## Stage 4 — decision

Production run recommended?  yes / no. Variant: ___. Signed/dated: ___

Until Stage 1–3 have results, the correct status of every part is **"digitally validated, physically untested"**.

## IF2 (Turned Court · Keyed and · Rings)

Print `print/calibration/cal-if2-ivory-plate01.3mf` and `cal-if2-charcoal-plate01.3mf`. Each
has four socket blocks, groove down, with bump preload 0.10 / 0.15 / 0.20 / 0.25 mm (1–4
notches), and one T2-size collar key.

| # | Test | Pass criterion | Result |
|---|---|---|---|
| I.1 | Press the collar key into each socket block. Lift the block by the key. Pull it apart. | Seats with a firm push, feels the "last millimetre" grip, lifts the block, pulls apart by hand with a good grip. Pick the preload that feels most Lego-like. | ivory: ___ charcoal: ___ |
| I.2 | The key rotated 45° / 180° | Must **not** seat | ___ |
| I.3 | 100 cycles on the chosen block, then repeat I.1 | Grip still holds the block. No cracked beam root; beams still spring back. | ___ |
| I.4 | Look at the beams and slits on the underside | Slits open, beams free; no stringing bridging a slit | ___ |
| I.5 | Full T3 of each variant (keyed, ring): lift by the glyph 20×; pull apart 20× | Nothing left behind; separates by hand; the three dots stay aligned in a column | ___ |
| I.6 | Base placed on a T3 directly | Does not seat | ___ |
| I.7 | Ring vs keyed T3 on a tile: flick the glyph top sideways | Record which tips first. Ring is expected to be lighter and less planted | ___ |
| I.8 | Tier-dot inlay (turquoise on ivory and on charcoal) | Flush, round, clearly readable at arm's length; no colour bleed | ___ |

Then set `if2.beam.bump_interference` in `cad/params.json` to the chosen value and regenerate.
Record the value here: ___
